-- Connects Merle's to Yoco. It shares Tommy Sugo's Yoco account and location, so it starts with Tommy Sugo's location;
-- the key comes from Tommy Sugo's too (see SHARES_ACCOUNT_OF in supabase/functions/_shared/yoco.ts).
--
-- Apply this only once Merle's items exist in Yoco: from the next save, a Merle's menu item without a Yoco item stops
-- showing on the site (private.yoco_item_listed). Then sync Merle's and link its items in the admin.

insert into public.yoco_connections (brand, location_id, location_name)
select 'merles', location_id, location_name from public.yoco_connections where brand = 'tommy'
on conflict (brand) do nothing;
