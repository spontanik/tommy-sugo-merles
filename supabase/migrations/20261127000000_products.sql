-- One product list for both brands, kept in the admin. Every sellable thing has a SKU, and the SKU is the item code in
-- Xero (PZ2001 for a large Margherita, CD6010 for a Coke…). Yoco and Lightspeed use the same SKU for the same thing.
-- Phase 1 only reads Xero, Yoco and Lightspeed: the Menu check in /admin compares their copies below with this list.
--
--   products          the master list, edited by admins
--   xero_items        a copy of Xero's items, refreshed by the menu-check function
--   lightspeed_items  a copy of the Lightspeed location's items, refreshed by the menu-check function
--   xero_connection   one row: which Xero app and organisation the backend reads from (secrets are in Vault)
--   yoco_catalogue    gains the SKU Yoco holds for each variant

create table public.products (
  -- The Xero item code. Short enough for Lightspeed's descriptions and allergens (25 characters).
  sku text primary key check (sku ~ '^[A-Z0-9][A-Z0-9-]{0,24}$'),
  -- Null when both brands sell it (drinks).
  brand text references public.brands (key),
  -- Xero allows 50 characters for an item's name.
  name text not null check (length(trim(name)) between 1 and 50),
  -- A product sold in sizes or types is one row per size: family is what they have in common ("Pizza Margherita"),
  -- option_label the size ("Large"). Both null when there's only one.
  family text,
  option_label text,
  -- item: sold on its own. extra: only added to something else (toppings, milk). combo: a set meal. part: only
  -- inside a combo, at no charge.
  kind text not null default 'item' check (kind in ('item', 'extra', 'combo', 'part')),
  category text,
  -- The Xero sales account the product's sales go to (200 pizza, 201 pasta, 230 coffee…).
  xero_account text check (xero_account ~ '^[0-9][0-9 -]{0,9}$'),
  -- What the customer pays, VAT included.
  price numeric(10, 2) check (price >= 0),
  -- The sales description on Xero invoices.
  description text not null default '',
  is_active boolean not null default true,
  -- Links to the other systems' own ids, found by SKU and kept for reference.
  yoco_id text,
  lightspeed_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((family is null) = (option_label is null))
);

create index products_family_idx on public.products (family) where family is not null;

create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

create table public.xero_items (
  code text primary key,
  xero_id uuid not null,
  name text,
  description text,
  sales_price numeric(12, 2),
  sales_account text,
  tax_type text,
  is_sold boolean not null default true,
  xero_updated_at timestamptz,
  synced_at timestamptz not null default now()
);

create table public.lightspeed_items (
  id bigint primary key,
  sku text,
  name text,
  docket_name text,
  price numeric(12, 2),
  accounting_group text,
  item_type text,
  active boolean not null default true,
  synced_at timestamptz not null default now()
);

create index lightspeed_items_sku_idx on public.lightspeed_items (sku) where sku is not null;

create table public.xero_connection (
  id boolean primary key default true check (id),
  client_id text,
  tenant_id text,
  tenant_name text,
  scopes text,
  connected_at timestamptz,
  -- Xero's refresh token lapses after 60 days without use.
  refreshed_at timestamptz,
  -- The sign-in in progress: a random value Xero hands back, so only the admin who started it can finish it.
  pending_state text,
  pending_by uuid,
  pending_until timestamptz,
  last_sync_at timestamptz,
  last_sync_ok boolean,
  last_sync_message text,
  updated_at timestamptz not null default now()
);

insert into public.xero_connection (id) values (true);

create trigger xero_connection_touch before update on public.xero_connection
  for each row execute function public.touch_updated_at();

alter table public.yoco_catalogue add column sku text;
create index yoco_catalogue_sku_idx on public.yoco_catalogue (sku) where sku is not null;

alter table public.products enable row level security;
alter table public.xero_items enable row level security;
alter table public.lightspeed_items enable row level security;
alter table public.xero_connection enable row level security;

revoke all on public.products, public.xero_items, public.lightspeed_items, public.xero_connection from anon, authenticated;
grant select, insert, update, delete on public.products to authenticated;
grant select on public.xero_items, public.lightspeed_items to authenticated;
grant select (client_id, tenant_name, scopes, connected_at, refreshed_at, last_sync_at, last_sync_ok, last_sync_message)
  on public.xero_connection to authenticated;
grant all on public.products, public.xero_items, public.lightspeed_items, public.xero_connection to service_role;

create policy "admins read products" on public.products
  for select to authenticated using ((select private.is_admin()));
create policy "admins insert products" on public.products
  for insert to authenticated with check ((select private.is_admin()));
create policy "admins update products" on public.products
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "admins delete products" on public.products
  for delete to authenticated using ((select private.is_admin()));
create policy "admins read xero items" on public.xero_items
  for select to authenticated using ((select private.is_admin()));
create policy "admins read lightspeed items" on public.lightspeed_items
  for select to authenticated using ((select private.is_admin()));
create policy "admins read the xero connection" on public.xero_connection
  for select to authenticated using ((select private.is_admin()));

-- Every call made to Xero, like lightspeed_api_log: method, path, status, time taken, never a token or a body.
create table public.xero_api_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  method text not null,
  path text not null,
  status int,
  ms int,
  error text
);
create index xero_api_log_at_idx on public.xero_api_log (at);
alter table public.xero_api_log enable row level security;
grant all on public.xero_api_log to service_role;

select cron.schedule('xero-api-log-cleanup', '23 3 * * *',
  $$delete from public.xero_api_log where at < now() - interval '13 months'$$);

-- The Xero app's secret and the refresh token join the other secrets in Vault, on the paying account's row.
create or replace function public.yoco_secret_set(p_brand text, p_kind text, p_value text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret_name text := 'yoco_' || p_kind || '_' || p_brand;
  secret_id uuid;
begin
  if p_brand not in ('tommy', 'merles')
    or p_kind not in ('api_key', 'webhook_secret', 'checkout_key', 'checkout_webhook_secret', 'email_key',
                      'payfast_passphrase', 'lightspeed_token', 'lightspeed_webhook_secret',
                      'xero_client_secret', 'xero_refresh_token') then
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
