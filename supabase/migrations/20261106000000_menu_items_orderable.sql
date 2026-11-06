-- Which menu items customers can order on the site for collection, set per item in /admin.
-- Merle's offers its whole menu; Tommy Sugo offers only the items the team ticks.

alter table public.menu_items
  add column is_orderable boolean not null default false;

update public.menu_items set is_orderable = true where brand = 'merles';
