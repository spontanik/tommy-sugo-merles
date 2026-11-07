-- Removes what's left of Medium pizzas. Apply only once a site version that no longer reads these columns is live.

create or replace function private.yoco_menu_item_price()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.yoco_id is not null then
    new.price := private.yoco_live_price(new.brand, new.yoco_id);
    new.yoco_options := private.yoco_item_options(new.brand, new.yoco_id);
  else
    new.yoco_options := null;
  end if;
  return new;
end;
$$;

create or replace function private.yoco_catalogue_changed()
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
  update public.shop_items set price = live
    where brand = new.brand and yoco_id = new.yoco_id and price is distinct from live;
  -- A change to one variant changes the choices of every menu item linked to that Yoco item.
  if new.item_id is not null then
    update public.menu_items m set yoco_options = private.yoco_item_options(m.brand, m.yoco_id)
      from public.yoco_catalogue c
      where c.brand = new.brand and c.item_id = new.item_id
        and m.brand = c.brand and m.yoco_id = c.yoco_id
        and m.yoco_options is distinct from private.yoco_item_options(m.brand, m.yoco_id);
  end if;
  return null;
end;
$$;

create or replace function private.sections_clear_dropped_prices()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.menu_items
  set price_deliver = case when new.prices = 'single' then null else price_deliver end
  where brand = new.brand and section = new.key;
  return null;
end;
$$;

alter table public.menu_items
  drop constraint menu_items_yoco_medium_fk,
  drop column yoco_id_medium,
  drop column price_medium,
  drop column price_medium_deliver;

alter table public.sections drop constraint sections_prices_check;
alter table public.sections add constraint sections_prices_check check (prices in ('cd', 'single'));
