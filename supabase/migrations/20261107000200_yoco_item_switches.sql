-- Each menu item chooses which of its Yoco variants and modifiers customers are offered, and a menu item at a brand
-- connected to Yoco only shows while it's linked to a Yoco item that still exists.
--   yoco_catalogue.off_by_default  a variant that starts switched off on every item (written by the sync)
--   menu_items.yoco_choices        this item's switches, { "<variant, group or modifier id>": true/false }, holding
--                                  only what differs from the defaults
--   menu_items.yoco_listed         false hides the item from the public, kept up to date below. A stored column,
--                                  because the anon read policy can't call functions in the private schema.

alter table public.yoco_catalogue add column off_by_default boolean not null default false;
alter table public.menu_items
  add column yoco_choices jsonb not null default '{}'::jsonb,
  add column yoco_listed boolean not null default true;

-- One variant's groups with this item's switches applied. A group with nothing left in it goes, and a required group
-- can't ask for more than is left.
create function private.yoco_groups_on(p_groups jsonb, p_choices jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(
           g.value || jsonb_build_object('modifiers', mods.list,
             'min', least((g.value->>'min')::int, jsonb_array_length(mods.list)))
           order by g.ord), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_groups, '[]'::jsonb)) with ordinality g(value, ord)
  cross join lateral (
    select coalesce(jsonb_agg(m.value order by m.ord), '[]'::jsonb) as list
    from jsonb_array_elements(g.value->'modifiers') with ordinality m(value, ord)
    where coalesce((p_choices->>(m.value->>'id'))::boolean, true)
  ) mods
  where coalesce((p_choices->>(g.value->>'id'))::boolean, not coalesce((g.value->>'off')::boolean, false))
    and jsonb_array_length(mods.list) > 0;
$$;

-- The variant that sets the item's menu price is always offered.
create function private.yoco_item_choices(p_brand text, p_yoco_id text, p_choices jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_agg(
           jsonb_build_object('id', c.yoco_id, 'label', c.option_label, 'price', c.price,
             'groups', private.yoco_groups_on(c.modifier_groups, p_choices))
           order by c.option_label)
  from public.yoco_catalogue linked
  join public.yoco_catalogue c on c.brand = linked.brand and c.item_id = linked.item_id
  where linked.brand = p_brand and linked.yoco_id = p_yoco_id
    and c.kind = 'variant' and not c.is_deleted and c.is_available and c.price is not null
    and (c.yoco_id = p_yoco_id or coalesce((p_choices->>c.yoco_id)::boolean, not c.off_by_default));
$$;

create function private.yoco_item_listed(p_brand text, p_yoco_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.yoco_connections c where c.brand = p_brand)
    or exists (select 1 from public.yoco_catalogue c
               where c.brand = p_brand and c.yoco_id = p_yoco_id and not c.is_deleted);
$$;

create or replace function private.yoco_menu_item_price()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.yoco_listed := private.yoco_item_listed(new.brand, new.yoco_id);
  if new.yoco_id is not null then
    new.price := private.yoco_live_price(new.brand, new.yoco_id);
    new.yoco_options := private.yoco_item_choices(new.brand, new.yoco_id, new.yoco_choices);
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
  update public.menu_items set yoco_listed = not new.is_deleted
    where brand = new.brand and yoco_id = new.yoco_id and yoco_listed is distinct from (not new.is_deleted);
  -- A change to one variant changes the choices of every menu item linked to that Yoco item.
  if new.item_id is not null then
    update public.menu_items m set yoco_options = private.yoco_item_choices(m.brand, m.yoco_id, m.yoco_choices)
      from public.yoco_catalogue c
      where c.brand = new.brand and c.item_id = new.item_id
        and m.brand = c.brand and m.yoco_id = c.yoco_id
        and m.yoco_options is distinct from private.yoco_item_choices(m.brand, m.yoco_id, m.yoco_choices);
  end if;
  return null;
end;
$$;

drop trigger yoco_catalogue_changed on public.yoco_catalogue;
create trigger yoco_catalogue_changed after update on public.yoco_catalogue
  for each row
  when ((old.price, old.is_available, old.is_deleted, old.option_label, old.modifier_groups, old.off_by_default)
    is distinct from (new.price, new.is_available, new.is_deleted, new.option_label, new.modifier_groups, new.off_by_default))
  execute function private.yoco_catalogue_changed();

drop function private.yoco_item_options(text, text);

revoke all on function private.yoco_groups_on(jsonb, jsonb) from public, anon, authenticated;
revoke all on function private.yoco_item_choices(text, text, jsonb) from public, anon, authenticated;
revoke all on function private.yoco_item_listed(text, text) from public, anon, authenticated;

alter policy "anon reads visible menu items" on public.menu_items
  using (not is_hidden and yoco_listed);
alter policy "signed-in read visible menu items, admins read all" on public.menu_items
  using ((not is_hidden and yoco_listed) or (select private.is_admin()));

-- Medium stays on the till and comes back with the next sync, switched off on every item.
update public.yoco_catalogue set off_by_default = true where brand = 'tommy' and option_label = 'Medium';

-- The Pizza Extras prices come off the menu: the picker and an explainer on the page replace them.
update public.sections set is_hidden = true where brand = 'tommy' and key = 'pizza-extras';

-- Sets yoco_listed and yoco_options on every item, through the trigger above.
update public.menu_items set yoco_choices = yoco_choices;
