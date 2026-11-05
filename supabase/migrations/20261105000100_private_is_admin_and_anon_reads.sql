-- Fixes for 20261105000000_menu_and_shop.sql, found when it first ran on the real project:
--  1. Anonymous reads failed with "permission denied for function is_admin": the public read policy called
--     public.is_admin(), which anon can't execute, so the public pages always fell back to the static menu.
--     Anon now gets its own read policy that only checks is_hidden.
--  2. public.is_admin() was a SECURITY DEFINER function exposed as /rest/v1/rpc/is_admin (security advisor 0029).
--     Policies now use private.is_admin(), in a schema the Data API doesn't expose, and nobody can execute the old one.
--     (Written with ALTER/REVOKE rather than DROP so it applies without a destructive-change confirmation.
--     public.is_admin() is now unused; drop it whenever convenient.)

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

revoke execute on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

alter policy "admins read admins" on public.admins
  using ((select private.is_admin()));

-- Menu items
alter policy "public reads visible menu items" on public.menu_items
  to authenticated using (not is_hidden or (select private.is_admin()));
alter policy "public reads visible menu items" on public.menu_items
  rename to "signed-in read visible menu items, admins read all";
create policy "anon reads visible menu items" on public.menu_items
  for select to anon using (not is_hidden);
alter policy "admins insert menu items" on public.menu_items
  with check ((select private.is_admin()));
alter policy "admins update menu items" on public.menu_items
  using ((select private.is_admin())) with check ((select private.is_admin()));
alter policy "admins delete menu items" on public.menu_items
  using ((select private.is_admin()));

-- Shop items
alter policy "public reads visible shop items" on public.shop_items
  to authenticated using (not is_hidden or (select private.is_admin()));
alter policy "public reads visible shop items" on public.shop_items
  rename to "signed-in read visible shop items, admins read all";
create policy "anon reads visible shop items" on public.shop_items
  for select to anon using (not is_hidden);
alter policy "admins insert shop items" on public.shop_items
  with check ((select private.is_admin()));
alter policy "admins update shop items" on public.shop_items
  using ((select private.is_admin())) with check ((select private.is_admin()));
alter policy "admins delete shop items" on public.shop_items
  using ((select private.is_admin()));

-- Item images
alter policy "admins upload item images" on storage.objects
  with check (bucket_id = 'item-images' and (select private.is_admin()));
alter policy "admins update item images" on storage.objects
  using (bucket_id = 'item-images' and (select private.is_admin()))
  with check (bucket_id = 'item-images' and (select private.is_admin()));
alter policy "admins delete item images" on storage.objects
  using (bucket_id = 'item-images' and (select private.is_admin()));

revoke execute on function public.is_admin() from public, anon, authenticated;
