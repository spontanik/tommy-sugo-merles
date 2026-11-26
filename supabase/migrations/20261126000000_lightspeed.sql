-- Paid website orders go to the kitchen's Lightspeed K-Series POS. The settings sit on the paying account's row
-- (Tommy Sugo's, which Merle's pays through: see PAYS_THROUGH in supabase/functions/_shared/orders.ts). The access
-- token and the password Lightspeed uses to call our webhook are in Vault.

alter table public.yoco_connections
  add column lightspeed_location_id bigint,
  add column lightspeed_location_name text,
  add column lightspeed_payment_method text,
  add column lightspeed_order_profile text,
  add column lightspeed_mode text check (lightspeed_mode in ('test', 'live')),
  add column lightspeed_token_hint text,
  add column lightspeed_webhook_at timestamptz,
  add constraint yoco_connections_lightspeed_complete
    check ((lightspeed_location_id is null) = (lightspeed_mode is null));

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
    or p_kind not in ('api_key', 'webhook_secret', 'checkout_key', 'checkout_webhook_secret', 'email_key',
                      'payfast_passphrase', 'lightspeed_token', 'lightspeed_webhook_secret') then
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

-- Which Lightspeed item each website item is rung up as. variant_id is the Yoco variant a customer picked ('' when the
-- item has none). Read and written only by the lightspeed-admin and order functions.
create table public.lightspeed_skus (
  kind text not null check (kind in ('menu', 'shop')),
  item_id uuid not null,
  variant_id text not null default '',
  sku text not null check (sku <> ''),
  updated_at timestamptz not null default now(),
  primary key (kind, item_id, variant_id)
);
alter table public.lightspeed_skus enable row level security;
grant all on public.lightspeed_skus to service_role;

-- What happened to each order in Lightspeed. lightspeed_reference is the unique reference sent with the order (and
-- sent back on the webhook); a retry gets a new one.
alter table public.orders
  add column lightspeed_reference text unique,
  add column lightspeed_status text,
  add column lightspeed_error text,
  add column lightspeed_sent_at timestamptz;

grant select (lightspeed_status, lightspeed_error, lightspeed_sent_at) on public.orders to authenticated;

-- Every call made with the Lightspeed token. TabletPOS's API authorisation (clause 6.3) asks for at least 12 months,
-- so rows are kept for 13.
create table public.lightspeed_api_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  method text not null,
  path text not null,
  status int,
  ms int,
  order_id uuid,
  error text
);
create index lightspeed_api_log_at_idx on public.lightspeed_api_log (at);
alter table public.lightspeed_api_log enable row level security;
grant all on public.lightspeed_api_log to service_role;

select cron.schedule('lightspeed-api-log-cleanup', '17 3 * * *',
  $$delete from public.lightspeed_api_log where at < now() - interval '13 months'$$);
