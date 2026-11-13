-- The photo gallery: its own page (gallery.html), managed from the Gallery tab in /admin (Housemates).
-- The page shows visible photos in sort_order: the first 15, then 15 more each time someone asks for more.
-- Seeded with the 30 photos from the catering page's mosaic, in the same order and shapes.

create table public.gallery_photos (
  id uuid primary key default gen_random_uuid(),
  -- A file on the site (images/...) or an upload to the item-images bucket (under gallery/).
  src text not null check (src ~ '^(https://|images/)'),
  -- What the photo shows, for screen readers.
  alt text not null check (length(trim(alt)) > 0),
  -- How much room it takes in the mosaic: one cell, two across, two down, or two by two.
  shape text not null default 'square' check (shape in ('square', 'wide', 'tall', 'big')),
  sort_order integer not null default 0,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index gallery_photos_sort on public.gallery_photos (sort_order);

create trigger gallery_photos_touch before update on public.gallery_photos
  for each row execute function public.touch_updated_at();

alter table public.gallery_photos enable row level security;

create policy "anon reads visible gallery photos" on public.gallery_photos
  for select to anon using (not is_hidden);
create policy "signed-in read visible gallery photos, admins read all" on public.gallery_photos
  for select to authenticated using (not is_hidden or (select private.is_admin()));
create policy "admins insert gallery photos" on public.gallery_photos
  for insert to authenticated with check ((select private.is_admin()));
create policy "admins update gallery photos" on public.gallery_photos
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "admins delete gallery photos" on public.gallery_photos
  for delete to authenticated using ((select private.is_admin()));

grant select on public.gallery_photos to anon, authenticated;
grant insert, update, delete on public.gallery_photos to authenticated;

insert into public.gallery_photos (src, alt, shape, sort_order) values
  ('images/events/ts-08.jpg', 'A grazing table of cheeses, cured meats, fruit and tomatoes', 'big', 10),
  ('images/events/web-truck-festival.jpg', 'The Tommy Sugo truck serving at a summer festival', 'square', 20),
  ('images/events/ts-22.jpg', 'The chef at work in the kitchen', 'square', 30),
  ('images/events/web-pizza-salami.jpg', 'A Tommy Sugo salami pizza, fresh from the oven', 'square', 40),
  ('images/events/ts-20.jpg', 'Bowls of fresh salad ready for service', 'square', 50),
  ('images/events/ts-27.jpg', 'Guests at a long candle-lit dinner table', 'wide', 60),
  ('images/events/ts-25.jpg', 'A plated main course with roast vegetables', 'square', 70),
  ('images/events/ts-06.jpg', 'A board of cured meats, cheeses, grapes and rosemary', 'tall', 80),
  ('images/events/ts-01.jpg', 'The team setting out a grazing table', 'tall', 90),
  ('images/events/web-truck-team.jpg', 'The Tommy Sugo team in front of the truck', 'square', 100),
  ('images/events/ts-11.jpg', 'A guest laughing as she serves herself at the grazing table', 'tall', 110),
  ('images/events/web-potjies.jpg', 'Potjies cooking over the fire', 'square', 120),
  ('images/events/ts-02.jpg', 'The team behind a long grazing table', 'wide', 130),
  ('images/events/web-festival-night.jpg', 'A festival at night, lit up in orange and red', 'square', 140),
  ('images/events/ts-16.jpg', 'Plating salads for a catered event', 'square', 150),
  ('images/events/ts-24.jpg', 'The team gathered in the kitchen before service', 'wide', 160),
  ('images/events/web-guests.jpg', 'Guests enjoying pizza at an outdoor event', 'square', 170),
  ('images/events/ts-23.jpg', 'A plated dish with green beans and carrots', 'square', 180),
  ('images/events/web-truck-event.jpg', 'The Tommy Sugo truck at an outdoor event, guests gathered around', 'wide', 190),
  ('images/events/ts-14.jpg', 'A grazing table with bread, dips and fresh vegetables', 'square', 200),
  ('images/events/web-catering-serve.jpg', 'The team serving guests at a catered event', 'square', 210),
  ('images/events/ts-12.jpg', 'A young guest choosing from the grazing table', 'tall', 220),
  ('images/events/web-truck.jpg', 'The Tommy Sugo food truck, black with the red seal, parked under trees', 'big', 230),
  ('images/events/web-truck-crowd.jpg', 'Guests ordering at the Tommy Sugo food truck at an outdoor event', 'square', 240),
  ('images/events/ts-05.jpg', 'The chef finishing a grazing table as the team looks on', 'tall', 250),
  ('images/events/ts-10.jpg', 'Long grazing tables laid out at an outdoor catered event', 'square', 260),
  ('images/events/ts-17.jpg', 'Bowls of salad set out beside the chafing dishes', 'wide', 270),
  ('images/events/web-truck-queue.jpg', 'A busy crowd around the Tommy Sugo truck at a festival', 'wide', 280),
  ('images/events/ts-04.jpg', 'The team laying out a grazing table at an event', 'square', 290),
  ('images/events/ts-26.jpg', 'A plate being finished with an edible flower', 'wide', 300);
