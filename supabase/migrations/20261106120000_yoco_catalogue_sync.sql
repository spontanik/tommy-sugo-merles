-- Yoco catalogue sync. Each brand has its own Yoco account, so everything here is per brand.
-- Yoco owns the price and availability of any website item linked to it. The sync only ever reads from Yoco.
--   yoco_connections  connection status per brand (no secrets), read by admins, written by the yoco-admin function
--   yoco_catalogue    a copy of the brand's Yoco catalogue, one row per variant or modifier
--   Vault             the API key and webhook signing secret, reachable only by the service role

create table public.yoco_connections (
  brand text primary key check (brand in ('tommy', 'merles')),
  api_key_hint text,
  location_id text,
  location_name text,
  webhook_subscription_id text,
  webhook_last_event_at timestamptz,
  last_sync_at timestamptz,
  last_sync_ok boolean,
  last_sync_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger yoco_connections_touch before update on public.yoco_connections
  for each row execute function public.touch_updated_at();

insert into public.yoco_connections (brand) values ('tommy');

create table public.yoco_catalogue (
  brand text not null check (brand in ('tommy', 'merles')),
  yoco_id text not null,
  kind text not null check (kind in ('variant', 'modifier')),
  item_id text,
  name text not null,
  option_label text,
  category text,
  price numeric(10, 2) check (price >= 0),
  is_available boolean not null default true,
  is_deleted boolean not null default false,
  synced_at timestamptz not null default now(),
  primary key (brand, yoco_id)
);

create index yoco_catalogue_item_idx on public.yoco_catalogue (brand, item_id) where item_id is not null;

alter table public.yoco_connections enable row level security;
alter table public.yoco_catalogue enable row level security;

revoke all on public.yoco_connections, public.yoco_catalogue from anon, authenticated;
grant select on public.yoco_connections, public.yoco_catalogue to authenticated;
grant all on public.yoco_connections, public.yoco_catalogue to service_role;

create policy "admins read yoco connections" on public.yoco_connections
  for select to authenticated using ((select private.is_admin()));
create policy "admins read yoco catalogue" on public.yoco_catalogue
  for select to authenticated using ((select private.is_admin()));

-- Links from website items to the catalogue. The foreign keys include the brand, so a Tommy Sugo item can't be
-- linked to another brand's Yoco account. A pizza's Medium has its own link.
alter table public.menu_items
  add column yoco_id text,
  add column yoco_id_medium text,
  add constraint menu_items_yoco_fk foreign key (brand, yoco_id)
    references public.yoco_catalogue (brand, yoco_id) on delete set null (yoco_id),
  add constraint menu_items_yoco_medium_fk foreign key (brand, yoco_id_medium)
    references public.yoco_catalogue (brand, yoco_id) on delete set null (yoco_id_medium);

alter table public.shop_items
  add column yoco_id text,
  add constraint shop_items_yoco_fk foreign key (brand, yoco_id)
    references public.yoco_catalogue (brand, yoco_id) on delete set null (yoco_id);

create index menu_items_yoco_idx on public.menu_items (brand, yoco_id) where yoco_id is not null;
create index menu_items_yoco_medium_idx on public.menu_items (brand, yoco_id_medium) where yoco_id_medium is not null;
create index shop_items_yoco_idx on public.shop_items (brand, yoco_id) where yoco_id is not null;

-- The price a linked item should show. Null when it's disabled, unavailable at the location, or deleted in Yoco,
-- which the site shows as "–" with no Add button (or as sold out in the shop).
create function private.yoco_live_price(p_brand text, p_yoco_id text)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case when c.is_deleted or not c.is_available then null else c.price end
  from public.yoco_catalogue c
  where c.brand = p_brand and c.yoco_id = p_yoco_id;
$$;

-- Linked prices always come from Yoco, whatever a save from the admin sends.
create function private.yoco_menu_item_price()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.yoco_id is not null then
    new.price := private.yoco_live_price(new.brand, new.yoco_id);
  end if;
  if new.yoco_id_medium is not null then
    new.price_medium := private.yoco_live_price(new.brand, new.yoco_id_medium);
  end if;
  return new;
end;
$$;

create function private.yoco_shop_item_price()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.yoco_id is not null then
    new.price := private.yoco_live_price(new.brand, new.yoco_id);
  end if;
  return new;
end;
$$;

create trigger menu_items_yoco_price before insert or update on public.menu_items
  for each row execute function private.yoco_menu_item_price();
create trigger shop_items_yoco_price before insert or update on public.shop_items
  for each row execute function private.yoco_shop_item_price();

-- When the catalogue copy changes, pass the new price on to linked items.
create function private.yoco_catalogue_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  live numeric := case when new.is_deleted or not new.is_available then null else new.price end;
begin
  update public.menu_items set price = live
    where brand = new.brand and yoco_id = new.yoco_id and price is distinct from live;
  update public.menu_items set price_medium = live
    where brand = new.brand and yoco_id_medium = new.yoco_id and price_medium is distinct from live;
  update public.shop_items set price = live
    where brand = new.brand and yoco_id = new.yoco_id and price is distinct from live;
  return null;
end;
$$;

create trigger yoco_catalogue_changed after update on public.yoco_catalogue
  for each row
  when ((old.price, old.is_available, old.is_deleted) is distinct from (new.price, new.is_available, new.is_deleted))
  execute function private.yoco_catalogue_changed();

revoke all on function private.yoco_live_price(text, text) from public, anon, authenticated;
revoke all on function private.yoco_menu_item_price() from public, anon, authenticated;
revoke all on function private.yoco_shop_item_price() from public, anon, authenticated;
revoke all on function private.yoco_catalogue_changed() from public, anon, authenticated;

-- Secrets. These two are in public only so the edge functions can reach them over the Data API;
-- execute is limited to the service role, so visitors and signed-in admins can't call them.
create function public.yoco_secret_get(p_brand text, p_kind text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.decrypted_secret
  from vault.decrypted_secrets s
  where s.name = 'yoco_' || p_kind || '_' || p_brand;
$$;

create function public.yoco_secret_set(p_brand text, p_kind text, p_value text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret_name text := 'yoco_' || p_kind || '_' || p_brand;
  secret_id uuid;
begin
  if p_brand not in ('tommy', 'merles') or p_kind not in ('api_key', 'webhook_secret') then
    raise exception 'Unknown Yoco secret';
  end if;
  select s.id into secret_id from vault.secrets s where s.name = secret_name;
  if p_value is null then
    delete from vault.secrets s where s.id = secret_id;
  elsif secret_id is null then
    perform vault.create_secret(p_value, secret_name);
  else
    perform vault.update_secret(secret_id, p_value);
  end if;
end;
$$;

revoke all on function public.yoco_secret_get(text, text) from public, anon, authenticated;
revoke all on function public.yoco_secret_set(text, text, text) from public, anon, authenticated;
grant execute on function public.yoco_secret_get(text, text) to service_role;
grant execute on function public.yoco_secret_set(text, text, text) to service_role;
