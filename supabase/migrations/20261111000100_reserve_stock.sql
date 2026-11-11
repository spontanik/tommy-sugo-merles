-- Stock is reserved when an order is created, before the customer goes to pay, not when the payment comes in.
-- shop_items.stock is therefore what's free to sell right now: reserved items are already off it.
--   - order-create calls reserve_order_stock: all of the order's counted shop items, or none (it raises, and the
--     order is thrown away). Rows are locked in item order, so two orders can't both take the last one.
--   - Paid: the reservation simply stays taken.
--   - Cancelled by staff: return_order_stock puts it back.
--   - Not paid within 30 minutes: expire_unpaid_orders (before each new order, and every 5 minutes once
--     20261111000200_expire_unpaid_schedule.sql is applied) cancels the order
--     and puts the stock back. If the payment then arrives after all, the webhook revives the order and takes the stock
--     again with take_order_stock, as far as it can (the count never goes below 0).

alter table public.orders
  add column cancel_reason text check (cancel_reason in ('staff', 'unpaid'));

create or replace function public.reserve_order_stock(p_order_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  l record;
  left_now integer;
  label text;
begin
  for l in
    select ol.item_id, sum(ol.qty)::int as qty
      from public.order_lines ol
     where ol.order_id = p_order_id and ol.kind = 'shop'
     group by ol.item_id
     order by ol.item_id
  loop
    update public.shop_items set stock = stock - l.qty
     where id = l.item_id and stock is not null and stock >= l.qty;
    if not found then
      select s.stock, coalesce(s.cart_name, s.name) into left_now, label from public.shop_items s where s.id = l.item_id;
      if left_now is not null then
        raise exception using
          message = case when left_now = 0
            then label || ' has just sold out. Please remove it to check out.'
            else 'Only ' || left_now || ' ' || label || ' left. Please change how many you''re ordering.' end,
          hint = 'out_of_stock';
      end if;
    end if;
  end loop;
  update public.orders set stock_taken = true where id = p_order_id;
end;
$$;

create or replace function public.expire_unpaid_orders(p_minutes integer default 30)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  ids uuid[];
  o uuid;
begin
  with expired as (
    update public.orders
       set status = 'cancelled', cancelled_at = now(), cancel_reason = 'unpaid'
     where status = 'pending_payment' and created_at < now() - make_interval(mins => p_minutes)
    returning id
  )
  select coalesce(array_agg(id), '{}') into ids from expired;
  foreach o in array ids loop
    perform public.return_order_stock(o);
  end loop;
  return cardinality(ids);
end;
$$;

revoke execute on function public.reserve_order_stock(uuid) from public, anon, authenticated;
revoke execute on function public.expire_unpaid_orders(integer) from public, anon, authenticated;
grant execute on function public.reserve_order_stock(uuid) to service_role;
grant execute on function public.expire_unpaid_orders(integer) to service_role;
