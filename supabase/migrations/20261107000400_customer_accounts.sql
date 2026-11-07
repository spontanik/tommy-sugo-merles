-- Customer accounts: a profile per signed-up customer, and orders linked to the account that placed them.
-- Customers sign up with Supabase Auth (email and password). Their name, cell number and specials choice come in as
-- sign-up metadata and are copied into public.customers by the trigger below. That metadata is customer-editable, so
-- it's only ever used as profile data, never to decide access.
-- Orders stay closed to customers in the Data API: the my-orders function returns a customer's own orders.
-- Admin access is unchanged: it depends on public.admins, so a customer account can't open /admin.

create table public.customers (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '' check (char_length(name) <= 100),
  phone text not null default '' check (char_length(phone) <= 40),
  specials boolean not null default false,
  specials_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customers enable row level security;

revoke all on public.customers from anon, authenticated;
grant all on public.customers to service_role;
grant select on public.customers to authenticated;
grant update (name, phone, specials) on public.customers to authenticated;

create policy "customers read their own profile, admins read all" on public.customers
  for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));

create policy "customers update their own profile" on public.customers
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Keeps updated_at, and records when someone opted in to specials (their consent), or clears it when they opt out.
create or replace function private.customers_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.specials and (tg_op = 'INSERT' or not old.specials) then
    new.specials_at := now();
  elsif not new.specials then
    new.specials_at := null;
  end if;
  return new;
end;
$$;

create trigger customers_touch
  before insert or update on public.customers
  for each row execute function private.customers_touch();

-- A profile for every new sign-up. Admins created by hand get one too, which they can ignore.
create or replace function private.customers_from_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.customers (id, name, phone, specials)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'name', ''), 100),
    left(coalesce(new.raw_user_meta_data ->> 'phone', ''), 40),
    coalesce((new.raw_user_meta_data ->> 'specials')::boolean, false)
  )
  on conflict (id) do nothing;
  return new;
exception when others then
  -- A bad value in the metadata mustn't stop the sign-up: the profile can be filled in later.
  insert into public.customers (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function private.customers_from_signup() from public, anon, authenticated;

create trigger customers_from_signup
  after insert on auth.users
  for each row execute function private.customers_from_signup();

-- Orders placed while signed in, or added to the account later from the device they were placed on.
alter table public.orders
  add column customer_id uuid references auth.users (id) on delete set null;

create index orders_customer_id_idx on public.orders (customer_id, created_at desc) where customer_id is not null;

-- Lets the Orders tab show which orders came from an account (admins already read the other order columns).
grant select (customer_id) on public.orders to authenticated;
