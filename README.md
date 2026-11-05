# Tommy Sugo & Merle's website

Static site (`index.html`, `tommy-sugo.html`, `merles-schnitz.html`) with a staff admin at `/admin/` for editing the
menu and shop items. Items live in Supabase. The public pages fetch them on load and fall back to the HTML already in
the page if Supabase isn't configured or can't be reached.

## Files

| Path | What it is |
| --- | --- |
| `admin/index.html` | The admin: sign in, then edit, add, hide, reorder and delete items, upload images, mark shop items sold out |
| `js/supabase-config.js` | Supabase project URL and publishable key (safe to publish) |
| `js/catalog-config.js` | The sections each brand has and which price columns each one uses (shared by the site and the admin) |
| `js/catalog.js` | Loads live items into the public pages |
| `supabase/migrations/…_menu_and_shop.sql` | Tables, row-level security, the `item-images` storage bucket |
| `supabase/migrations/…_private_is_admin_and_anon_reads.sql` | Fix-up: lets visitors read visible items, moves the admin check to a private schema |
| `supabase/seed.sql` | The items that were hard-coded in the pages on 2026-11-05 |

## Setting up Supabase

1. Run the migrations (in filename order), then `seed.sql`, in the project's SQL editor (or `supabase db push`).
2. Put the project URL and publishable key in `js/supabase-config.js`.
3. **Authentication → Sign In / Providers**: turn off "Allow new users to sign up". (Even if left on, only people in
   the `admins` table can change anything.)
4. **Authentication → URL Configuration**: set the Site URL to the admin page, e.g. `https://example.com/admin/`, so
   invite and password-reset emails land there.

## Adding someone to the admin

1. **Authentication → Users → Invite user**, enter their email. They follow the link and choose a password.
2. In the SQL editor:

   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'person@example.com';
   ```

To remove someone: `delete from public.admins where user_id = (select id from auth.users where email = '…');`

## How the pages pick up items

- Each menu section's items sit inside `<div data-menu-items="section-key" style="display: contents;">`, and each shop
  grid has `data-shop-items="section-key"`. `catalog.js` replaces their contents with the live items.
- Prices elsewhere on the page with `data-price-of="Item name"` (the featured cards on the home pages, Merle's "Most
  ordered") follow the menu item with that name. If the item is renamed, they keep their written price.
- A blank price shows as "–" on the menu and "TBC" in the shop. The cart adds up real totals once every item in it
  has a price.
- Section headings, intros and the sections themselves are still in the HTML. To add a section, add it to
  `js/catalog-config.js` and add a matching `data-menu-items` / `data-shop-items` slot in the page.

## Running locally

```bash
python3 -m http.server 8123
```

Then open http://localhost:8123/ and http://localhost:8123/admin/. Add `http://localhost:8123/admin/` to Supabase's
redirect URLs if you want reset links to work locally.
