-- Menu and shop items for Tommy Sugo and Merle's, editable from /admin.
-- Anyone can read visible items; only users listed in public.admins can change anything.

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Prices are in rand. A blank (null) price shows as "–" on the site.
--   price                 main price: "Collect" on the menus, large/collect for pizza, the shop price
--   price_deliver         "Deliver" column (Merle's menu, Tommy pizza + extras)
--   price_medium          Tommy pizza, medium collect
--   price_medium_deliver  Tommy pizza, medium deliver
create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (brand in ('tommy', 'merles')),
  section text not null,
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  price numeric(10, 2) check (price >= 0),
  price_deliver numeric(10, 2) check (price_deliver >= 0),
  price_medium numeric(10, 2) check (price_medium >= 0),
  price_medium_deliver numeric(10, 2) check (price_medium_deliver >= 0),
  image_url text,
  is_hidden boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shop_items (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (brand in ('tommy', 'merles')),
  section text not null,
  name text not null check (length(trim(name)) > 0),
  -- How the item reads in the cart and the order email, e.g. "Margherita, frozen". Falls back to name.
  cart_name text,
  description text not null default '',
  price numeric(10, 2) check (price >= 0),
  image_url text,
  image_alt text not null default '',
  is_hidden boolean not null default false,
  is_sold_out boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index menu_items_brand_section_idx on public.menu_items (brand, section, sort_order);
create index shop_items_brand_section_idx on public.shop_items (brand, section, sort_order);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger menu_items_touch before update on public.menu_items
  for each row execute function public.touch_updated_at();
create trigger shop_items_touch before update on public.shop_items
  for each row execute function public.touch_updated_at();

alter table public.admins enable row level security;
alter table public.menu_items enable row level security;
alter table public.shop_items enable row level security;

-- Admins can see who else is an admin (and so the admin page can check its own row).
create policy "admins read admins" on public.admins
  for select to authenticated using ((select public.is_admin()));

create policy "public reads visible menu items" on public.menu_items
  for select to anon, authenticated using (not is_hidden or (select public.is_admin()));
create policy "admins insert menu items" on public.menu_items
  for insert to authenticated with check ((select public.is_admin()));
create policy "admins update menu items" on public.menu_items
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins delete menu items" on public.menu_items
  for delete to authenticated using ((select public.is_admin()));

create policy "public reads visible shop items" on public.shop_items
  for select to anon, authenticated using (not is_hidden or (select public.is_admin()));
create policy "admins insert shop items" on public.shop_items
  for insert to authenticated with check ((select public.is_admin()));
create policy "admins update shop items" on public.shop_items
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins delete shop items" on public.shop_items
  for delete to authenticated using ((select public.is_admin()));

-- Item photos/illustrations uploaded from /admin. Public to read, admins to write.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('item-images', 'item-images', true, 5242880,
        array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'])
on conflict (id) do nothing;

create policy "admins upload item images" on storage.objects
  for insert to authenticated with check (bucket_id = 'item-images' and (select public.is_admin()));
create policy "admins update item images" on storage.objects
  for update to authenticated using (bucket_id = 'item-images' and (select public.is_admin()));
create policy "admins delete item images" on storage.objects
  for delete to authenticated using (bucket_id = 'item-images' and (select public.is_admin()));
