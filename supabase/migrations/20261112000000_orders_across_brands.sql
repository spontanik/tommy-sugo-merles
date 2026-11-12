-- One order can hold Tommy Sugo and Merle's items together, collected from the same kitchen and paid in one go
-- (both brands take payments through Tommy Sugo's Yoco account).
--   orders.brands      which brands are in the order, e.g. {tommy,merles}. The admin's Orders screen shows a store's
--                      orders by this, so a mixed order appears for both stores.
--   orders.brand       unchanged in meaning for a single-brand order. A mixed order uses the brand it's paid through
--                      (tommy), so the payment webhook and settings find it.
--   order_lines.brand  which brand each line comes from.

alter table public.orders
  add column brands text[] not null default '{}';

update public.orders set brands = array[brand] where brands = '{}';

-- An order saved without brands (an older order-create) is a single-brand order.
create or replace function public.orders_fill_brands()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.brands is null or new.brands = '{}' then new.brands := array[new.brand]; end if;
  return new;
end;
$$;

create trigger orders_fill_brands before insert on public.orders
  for each row execute function public.orders_fill_brands();

alter table public.orders
  add constraint orders_brands_known check (brands <@ array['tommy', 'merles']::text[] and cardinality(brands) between 1 and 2) not valid;
alter table public.orders validate constraint orders_brands_known;

alter table public.order_lines
  add column brand text check (brand in ('tommy', 'merles'));

update public.order_lines l set brand = o.brand from public.orders o where o.id = l.order_id and l.brand is null;

create index orders_brands_idx on public.orders using gin (brands);

-- The admin's Orders screen reads orders column by column (it can't see the token or the collection code).
grant select (brands) on public.orders to authenticated;
