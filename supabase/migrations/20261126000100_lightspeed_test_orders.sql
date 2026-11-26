-- Orders placed from the hidden test shop (admin/test-shop.html), which builds its menu from Lightspeed itself and
-- sends orders straight to the Lightspeed location saved in Settings. Kept apart from real orders: nothing here is paid
-- for, reaches the Orders screen, takes stock or sends emails. Read and written only by the lightspeed-test and
-- lightspeed-webhook functions.
create table public.lightspeed_test_orders (
  id uuid primary key default gen_random_uuid(),
  number int generated always as identity,
  created_at timestamptz not null default now(),
  created_by uuid,
  customer_name text not null,
  customer_phone text,
  lines jsonb not null,
  total numeric(10, 2) not null,
  reference text not null unique,
  lightspeed_status text not null default 'sending',
  lightspeed_error text,
  lightspeed_account text,
  updated_at timestamptz not null default now()
);
alter table public.lightspeed_test_orders enable row level security;
grant all on public.lightspeed_test_orders to service_role;
