-- Website orders are paid through PayFast, so Yoco only handles payments at events. Yoco Checkout stays as a fallback
-- for an account without PayFast details. Each order records which provider took its payment.

alter table public.orders
  add column payment_provider text check (payment_provider in ('yoco', 'payfast')),
  add column payment_fee numeric(10, 2);

update public.orders set payment_provider = 'yoco' where checkout_id is not null;

grant select (payment_provider, payment_fee) on public.orders to authenticated;

-- PayFast details, kept on the brand whose account takes the payments: Tommy Sugo's, which Merle's pays through (see
-- PAYS_THROUGH in supabase/functions/_shared/orders.ts). The merchant ID and key aren't secret (they travel in the
-- customer's payment link); the passphrase that signs requests is, so it lives in Vault.
alter table public.yoco_connections
  add column payfast_merchant_id text check (payfast_merchant_id ~ '^[0-9]{1,12}$'),
  add column payfast_merchant_key text check (payfast_merchant_key ~ '^[A-Za-z0-9]{1,40}$'),
  add column payfast_mode text check (payfast_mode in ('live', 'sandbox')),
  add column payfast_passphrase_hint text,
  add constraint yoco_connections_payfast_complete
    check ((payfast_merchant_id is null) = (payfast_merchant_key is null)
       and (payfast_merchant_id is null) = (payfast_mode is null));

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
                      'payfast_passphrase') then
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
