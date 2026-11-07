-- Online orders. The website never writes these directly: the order-create function prices and saves them, Yoco's
-- payment webhook confirms them, and the order-admin function moves them along. Nobody reads them with the public key.
-- A customer follows an order through its access token, using the order-status function. Admins can't read the token
-- or the collection code, so the code has to come from the customer.

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity (start with 1001),
  brand text not null check (brand in ('tommy', 'merles')),
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'received', 'preparing', 'ready', 'collected', 'cancelled')),
  access_token text not null unique,
  collection_code text not null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  collect_from text,
  total numeric(10, 2) not null check (total >= 0),
  checkout_id text unique,
  checkout_url text,
  payment_id text,
  payment_mode text check (payment_mode in ('live', 'test')),
  paid_at timestamptz,
  preparing_at timestamptz,
  ready_at timestamptz,
  collected_at timestamptz,
  cancelled_at timestamptz,
  email_sent_at timestamptz,
  email_error text,
  yoco_order_id text,
  yoco_order_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orders_brand_status_idx on public.orders (brand, status, created_at desc);

create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

create table public.order_lines (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  position int not null,
  kind text not null check (kind in ('menu', 'shop')),
  item_id uuid not null,
  name text not null,
  qty int not null check (qty > 0),
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  variant_id text,
  modifier_ids text[] not null default '{}'
);

create index order_lines_order_idx on public.order_lines (order_id);

alter table public.orders enable row level security;
alter table public.order_lines enable row level security;

revoke all on public.orders, public.order_lines from anon, authenticated;
grant all on public.orders, public.order_lines to service_role;

-- Every column except access_token and collection_code.
grant select (id, number, brand, status, customer_name, customer_email, customer_phone, collect_from, total,
  checkout_id, payment_id, payment_mode, paid_at, preparing_at, ready_at, collected_at, cancelled_at,
  email_sent_at, email_error, yoco_order_id, yoco_order_error, created_at, updated_at)
  on public.orders to authenticated;
grant select on public.order_lines to authenticated;

create policy "admins read orders" on public.orders
  for select to authenticated using ((select private.is_admin()));
create policy "admins read order lines" on public.order_lines
  for select to authenticated using ((select private.is_admin()));

-- Payment and email settings, per brand. The keys themselves are in Vault.
alter table public.yoco_connections
  add column checkout_key_hint text,
  add column checkout_mode text check (checkout_mode in ('live', 'test')),
  add column checkout_webhook_id text,
  add column email_key_hint text,
  add column email_from text;

create or replace function public.yoco_secret_set(p_brand text, p_kind text, p_value text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret_name text := 'yoco_' || p_kind || '_' || p_brand;
  secret_id uuid;
begin
  if p_brand not in ('tommy', 'merles')
    or p_kind not in ('api_key', 'webhook_secret', 'checkout_key', 'checkout_webhook_secret', 'email_key') then
    raise exception 'Unknown Yoco secret';
  end if;
  select s.id into secret_id from vault.secrets s where s.name = secret_name;
  if p_value is null then
    delete from vault.secrets s where s.id = secret_id;
  elsif secret_id is null then
    perform vault.create_secret(p_value, secret_name);
  else
    perform vault.update_secret(secret_id, p_value);
  end if;
end;
$$;
