-- Pizzas are sold in one size online, and each linked menu item carries Yoco's variants and modifiers.
--   yoco_catalogue.modifier_groups  one variant's choices, written by the sync
--   menu_items.yoco_options         what a customer can choose for this item: every available variant of the linked
--                                   Yoco item, each with its groups. Kept up to date here, like the linked price, so
--                                   the public pages can read it without reaching the catalogue.

alter table public.yoco_catalogue add column modifier_groups jsonb;
alter table public.menu_items add column yoco_options jsonb;

create function private.yoco_item_options(p_brand text, p_yoco_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_agg(
           jsonb_build_object('id', c.yoco_id, 'label', c.option_label, 'price', c.price,
             'groups', coalesce(c.modifier_groups, '[]'::jsonb))
           order by c.option_label)
  from public.yoco_catalogue linked
  join public.yoco_catalogue c on c.brand = linked.brand and c.item_id = linked.item_id
  where linked.brand = p_brand and linked.yoco_id = p_yoco_id
    and c.kind = 'variant' and not c.is_deleted and c.is_available and c.price is not null;
$$;

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
  if new.yoco_id_medium is not null then
    new.price_medium := private.yoco_live_price(new.brand, new.yoco_id_medium);
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
  update public.menu_items set price_medium = live
    where brand = new.brand and yoco_id_medium = new.yoco_id and price_medium is distinct from live;
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

drop trigger yoco_catalogue_changed on public.yoco_catalogue;
create trigger yoco_catalogue_changed after update on public.yoco_catalogue
  for each row
  when ((old.price, old.is_available, old.is_deleted, old.option_label, old.modifier_groups)
    is distinct from (new.price, new.is_available, new.is_deleted, new.option_label, new.modifier_groups))
  execute function private.yoco_catalogue_changed();
create trigger yoco_catalogue_added after insert on public.yoco_catalogue
  for each row execute function private.yoco_catalogue_changed();

revoke all on function private.yoco_item_options(text, text) from public, anon, authenticated;

-- One pizza size: clear the Medium links first, so the section change below can clear the Medium prices.
update public.menu_items set yoco_id_medium = null where yoco_id_medium is not null;
update public.sections set prices = 'cd' where prices = 'pizza';
update public.yoco_catalogue set is_deleted = true where brand = 'tommy' and option_label = 'Medium';

update public.menu_items set yoco_options = private.yoco_item_options(brand, yoco_id) where yoco_id is not null;
