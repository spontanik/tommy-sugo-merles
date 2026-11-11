-- Release unpaid stock reservations every 5 minutes, even when nobody is ordering (see 20261111000100_reserve_stock.sql).
-- Without this, expire_unpaid_orders only runs when someone places an order, so an item held by an abandoned checkout
-- can show as sold out until then.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
select cron.schedule('expire-unpaid-orders', '*/5 * * * *', $$select public.expire_unpaid_orders(30)$$);
