-- Stock for shop items (frozen pizzas and the like), set in /admin.
--   shop_items.stock   how many are left to sell online. Blank (null) means it isn't counted; 0 shows as sold out.
-- The order-create function refuses more than what's left. Stock comes off when the payment webhook confirms the
-- order, and goes back if staff cancel a paid order. orders.stock_taken makes each of those happen once per order.

alter table public.shop_items
  add column stock integer check (stock >= 0);

alter table public.orders
  add column stock_taken boolean not null default false;

create or replace function public.take_order_stock(p_order_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.orders set stock_taken = true where id = p_order_id and not stock_taken;
  if not found then return; end if;
  update public.shop_items s
     set stock = greatest(s.stock - l.qty, 0)
    from (select item_id, sum(qty)::int as qty
            from public.order_lines
           where order_id = p_order_id and kind = 'shop'
           group by item_id) l
   where s.id = l.item_id and s.stock is not null;
end;
$$;

create or replace function public.return_order_stock(p_order_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.orders set stock_taken = false where id = p_order_id and stock_taken;
  if not found then return; end if;
  update public.shop_items s
     set stock = s.stock + l.qty
    from (select item_id, sum(qty)::int as qty
            from public.order_lines
           where order_id = p_order_id and kind = 'shop'
           group by item_id) l
   where s.id = l.item_id and s.stock is not null;
end;
$$;

-- Only the order functions (service role) call these.
revoke execute on function public.take_order_stock(uuid) from public, anon, authenticated;
revoke execute on function public.return_order_stock(uuid) from public, anon, authenticated;
grant execute on function public.take_order_stock(uuid) to service_role;
grant execute on function public.return_order_stock(uuid) to service_role;
