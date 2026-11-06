-- Brands and sections, editable from the Settings tab in /admin (Housemates). Seeded from js/catalog-config.js,
-- which stays in place as the fallback if these tables can't be read.
--
-- Items point at a section by its key (menu_items.section, shop_items.section), so:
--   - a section's key, brand and kind are fixed once created (only title, prices, order and hidden can change)
--   - a section can only be deleted when it has no items
--   - changing a section's price columns clears prices in the columns it no longer uses
-- All three are enforced here so they hold whatever the client does.

create table public.brands (
  key text primary key check (key in ('tommy', 'merles')),
  label text not null check (length(trim(label)) > 0),
  -- The brand's page, relative to the site root. No scheme, because the admin uses it as a link.
  page text not null check (page ~ '^[A-Za-z0-9][A-Za-z0-9._/-]*$'),
  updated_at timestamptz not null default now()
);

create table public.sections (
  id uuid primary key default gen_random_uuid(),
  brand text not null references public.brands (key),
  kind text not null check (kind in ('menu', 'shop')),
  key text not null check (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (length(trim(title)) > 0),
  -- "pizza": large and medium, each collect and deliver. "cd": collect and deliver. "single": one price.
  -- Shop sections always have one price, so they leave this null.
  prices text check (prices in ('pizza', 'cd', 'single')),
  is_hidden boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand, kind, key),
  check ((kind = 'menu' and prices is not null) or (kind = 'shop' and prices is null))
);

create trigger brands_touch before update on public.brands
  for each row execute function public.touch_updated_at();
create trigger sections_touch before update on public.sections
  for each row execute function public.touch_updated_at();

-- Fixed keys. Items would be orphaned if a section's key, brand or kind moved.
create function private.sections_keep_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.key <> old.key or new.brand <> old.brand or new.kind <> old.kind then
    raise exception 'A section''s key, brand and kind can''t change once it''s created.'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger sections_keep_identity before update on public.sections
  for each row execute function private.sections_keep_identity();

-- Only empty sections can go. Runs as the caller: admins can see every item, hidden ones included.
create function private.sections_block_delete_with_items()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (old.kind = 'menu' and exists (
        select 1 from public.menu_items where brand = old.brand and section = old.key))
     or (old.kind = 'shop' and exists (
        select 1 from public.shop_items where brand = old.brand and section = old.key)) then
    raise exception 'The section "%" still has items. Move or delete them first.', old.title
      using errcode = 'restrict_violation';
  end if;
  return old;
end;
$$;

create trigger sections_block_delete_with_items before delete on public.sections
  for each row execute function private.sections_block_delete_with_items();

-- The same rule the item dialog applies: a price in a column the section doesn't use is cleared.
-- In the same transaction as the section change, so the two can't drift apart.
create function private.sections_clear_dropped_prices()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.menu_items
  set price_deliver = case when new.prices = 'single' then null else price_deliver end,
      price_medium = case when new.prices = 'pizza' then price_medium else null end,
      price_medium_deliver = case when new.prices = 'pizza' then price_medium_deliver else null end
  where brand = new.brand and section = new.key;
  return null;
end;
$$;

create trigger sections_clear_dropped_prices after update of prices on public.sections
  for each row
  when (new.kind = 'menu' and new.prices is distinct from old.prices)
  execute function private.sections_clear_dropped_prices();

revoke all on function private.sections_keep_identity() from public, anon, authenticated;
revoke all on function private.sections_block_delete_with_items() from public, anon, authenticated;
revoke all on function private.sections_clear_dropped_prices() from public, anon, authenticated;

alter table public.brands enable row level security;
alter table public.sections enable row level security;

grant select on public.brands, public.sections to anon, authenticated;
grant insert, update, delete on public.brands, public.sections to authenticated;

-- Brands have nothing to hide, so everyone reads every row.
create policy "anon reads brands" on public.brands
  for select to anon using (true);
create policy "signed-in read brands" on public.brands
  for select to authenticated using (true);
create policy "admins insert brands" on public.brands
  for insert to authenticated with check ((select private.is_admin()));
create policy "admins update brands" on public.brands
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "admins delete brands" on public.brands
  for delete to authenticated using ((select private.is_admin()));

create policy "anon reads visible sections" on public.sections
  for select to anon using (not is_hidden);
create policy "signed-in read visible sections, admins read all" on public.sections
  for select to authenticated using (not is_hidden or (select private.is_admin()));
create policy "admins insert sections" on public.sections
  for insert to authenticated with check ((select private.is_admin()));
create policy "admins update sections" on public.sections
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "admins delete sections" on public.sections
  for delete to authenticated using ((select private.is_admin()));

insert into public.brands (key, label, page) values
  ('tommy', 'Tommy Sugo', 'tommy-sugo.html'),
  ('merles', 'Merle''s Schnitz', 'merles-schnitz.html');

insert into public.sections (brand, kind, key, title, prices, sort_order) values
  ('tommy', 'menu', 'pizza-classics', 'Pizza · The Classics', 'pizza', 10),
  ('tommy', 'menu', 'pizza-signatures', 'Pizza · The Signatures', 'pizza', 20),
  ('tommy', 'menu', 'pizza-extras', 'Pizza · Extras', 'cd', 30),
  ('tommy', 'menu', 'wrapped', 'Wrapped Differently', 'single', 40),
  ('tommy', 'menu', 'pasta-potjies', 'Pasta & Potjies', 'single', 50),
  ('tommy', 'menu', 'breakfast', 'Breakfast', 'single', 60),
  ('tommy', 'menu', 'sweet-stuff', 'Sweet Stuff', 'single', 70),
  ('tommy', 'menu', 'coffee', 'Coffee', 'single', 80),
  ('tommy', 'menu', 'cold-drinks', 'Cold Drinks', 'single', 90),
  ('tommy', 'shop', 'frozen-pizzas', 'Frozen Pizzas', null, 10),
  ('tommy', 'shop', 'the-sauce', 'The Sauce', null, 20),
  ('merles', 'menu', 'schnitz', 'Schnitz', 'cd', 10),
  ('merles', 'menu', 'combos', 'Combos', 'cd', 20),
  ('merles', 'menu', 'sides-sauces', 'Sides & Sauces', 'cd', 30),
  ('merles', 'menu', 'milkshakes', 'Milkshakes', 'cd', 40),
  ('merles', 'menu', 'sweet-treat', 'Sweet Treat', 'cd', 50),
  ('merles', 'menu', 'drinks', 'Drinks', 'cd', 60),
  ('merles', 'shop', 'frozen-schnitz', 'Frozen Schnitz', null, 10),
  ('merles', 'shop', 'sauces', 'Sauces', null, 20);
