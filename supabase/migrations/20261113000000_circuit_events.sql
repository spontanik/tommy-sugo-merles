-- On the circuit: where the Tommy Sugo truck is next, listed on the catering page (events.html#circuit).
-- Edited from the Events tab in /admin (Housemates). The page shows visible events that haven't ended yet,
-- soonest first, so an event drops off by itself the day after its last day.

create table public.circuit_events (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  starts_on date not null,
  -- Blank for a one-day event.
  ends_on date check (ends_on >= starts_on),
  -- The last day it's on, for "hasn't ended yet" and for sorting past events.
  last_day date generated always as (coalesce(ends_on, starts_on)) stored,
  venue text not null default '',
  serving text not null default '',
  -- The event's own logo: an upload to the item-images bucket (under events/), shown on the card.
  logo_url text check (logo_url ~ '^https://'),
  -- The event's own page (tickets, line-up). The card's name and logo link to it.
  link text check (link ~ '^https?://[^\s]+$'),
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index circuit_events_last_day on public.circuit_events (last_day);

create trigger circuit_events_touch before update on public.circuit_events
  for each row execute function public.touch_updated_at();

alter table public.circuit_events enable row level security;

create policy "anon reads visible circuit events" on public.circuit_events
  for select to anon using (not is_hidden);
create policy "signed-in read visible circuit events, admins read all" on public.circuit_events
  for select to authenticated using (not is_hidden or (select private.is_admin()));
create policy "admins insert circuit events" on public.circuit_events
  for insert to authenticated with check ((select private.is_admin()));
create policy "admins update circuit events" on public.circuit_events
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "admins delete circuit events" on public.circuit_events
  for delete to authenticated using ((select private.is_admin()));

grant select on public.circuit_events to anon, authenticated;
grant insert, update, delete on public.circuit_events to authenticated;

-- The one confirmed date that was on the page.
insert into public.circuit_events (name, starts_on, ends_on, venue, serving) values
  ('The Gathering', '2026-11-12', '2026-11-15', 'POD Place of Dreams, Karoo',
   'Pizza all day. Shakshuka and Brekkie pizza from sunrise.');
