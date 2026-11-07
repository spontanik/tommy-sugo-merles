# Tommy Sugo & Merle's website

Static site (`index.html`, `tommy-sugo.html`, `merles-schnitz.html`) with a staff admin, **Housemates**, at `/admin/`
for editing both brands' menus, shop items and settings. Items live in Supabase. The public pages fetch them on load and fall back to the HTML already in
the page if Supabase isn't configured or can't be reached.

## Files

| Path | What it is |
| --- | --- |
| `admin/index.html` | Housemates: sign in, pick a brand, then edit its Menu, Shop and Settings (see below) |
| `js/supabase-config.js` | Supabase project URL and publishable key (safe to publish) |
| `js/catalog-config.js` | The fallback list of sections and price columns, used if the `brands` and `sections` tables can't be read, plus the price column labels |
| `js/catalog.js` | Loads live items into the public pages, with Add buttons on orderable menu items |
| `js/order.js` | The cart and checkout rules on both brand pages (`window.ORDER_COPY` in each page holds its wording) |
| `js/account.js` | Customer accounts and the orders kept on this device, shared by the checkout, `order.html` and `account.html` |
| `account.html` | Your Orders: sign in or create an account, current and previous orders, profile and specials |
| `supabase/migrations/…_menu_and_shop.sql` | Tables, row-level security, the `item-images` storage bucket |
| `supabase/migrations/…_private_is_admin_and_anon_reads.sql` | Fix-up: lets visitors read visible items, moves the admin check to a private schema |
| `supabase/migrations/…_menu_items_orderable.sql` | Adds `menu_items.is_orderable` and turns it on for all of Merle's |
| `supabase/migrations/…_brands_and_sections.sql` | The `brands` and `sections` tables, seeded from `catalog-config.js`, and the rules that protect them |
| `supabase/migrations/…_yoco_catalogue_sync.sql` | Yoco connection status, the catalogue copy, item links, and price triggers |
| `supabase/functions/yoco-admin` | Used by the admin's Settings tab: credentials, location, sync, live updates |
| `supabase/functions/yoco-webhook` | Receives item changes from Yoco, checks the signature, refreshes the item |
| `supabase/seed.sql` | The items that were hard-coded in the pages on 2026-11-05 |

## Setting up Supabase

1. Run the migrations (in filename order), then `seed.sql`, in the project's SQL editor (or `supabase db push`). The
   brands and sections are seeded by their migration, so `seed.sql` only adds the items.
2. Put the project URL and publishable key in `js/supabase-config.js`.
3. **Authentication → Sign In / Providers**: turn off "Allow new users to sign up". (Even if left on, only people in
   the `admins` table can change anything.)
4. **Authentication → URL Configuration**: set the Site URL to the admin page,
   `https://spontanik.github.io/tommy-sugo-merles/admin/` (change it if the site moves to its own domain), so invite and
   password-reset emails land there.

The live project is `tommy-sugo-merles` (ref `awazfdglfhmkejrctnkz`) in the Housemates Supabase organisation. The site
is published by GitHub Pages from `main` of `spontanik/tommy-sugo-merles`: push to `main` and it redeploys.

## The admin (Housemates)

One sign-in for both brands. The switch in the top bar picks the brand, and each brand has three tabs:

- **Menu** and **Shop**: edit, add, hide, reorder and delete items, upload images, mark shop items sold out.
- **Settings**: the brand's name and site page, and its menu and shop sections (title, price columns, order, hidden).
  Changes stay on the screen until **Save settings**.

The place you're in is in the URL, so a link opens it directly: `#tommy/menu`, `#tommy/shop`, `#merles/settings` and so
on. Without one, the admin reopens where you last were (saved in the browser under `housemates-admin`).

Every admin can edit both brands: `admins` has no brand column.

### The `brands` and `sections` tables

- `brands`: `key` (`tommy` or `merles`), `label`, `page`.
- `sections`: `brand`, `kind` (`menu` or `shop`), `key`, `title`, `prices` (`pizza`, `cd` or `single`, null for shop),
  `is_hidden`, `sort_order`.

Items point at a section by its key, so the database enforces three rules:

- A section's key, brand and kind can't change once it's created. The key is made from the title when it's added.
- A section can only be deleted when it has no items.
- Changing a section's price columns clears prices in the columns it no longer uses. Settings warns before saving.

If these tables aren't there yet, the admin and the site fall back to `js/catalog-config.js`, and Settings is read-only.

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
- Section titles and price columns come from the `sections` table. Headings marked `data-section-title="section-key"`
  pick up the title. Anything marked `data-section="section-key"` is hidden when that section is (list several keys to
  hide it only when all of them are).
- A new section shows in the admin and stores items, but doesn't appear on the public page until a site update adds
  its slot and illustration: a `data-menu-items` / `data-shop-items` element, plus the two hooks above. Section order
  in Settings only changes the admin. The site keeps its layout.
- Intros and illustrations are still in the HTML.

## Ordering

One cart per brand page, holding menu items and shop items:

- Tick **Order online for collection** on a menu item in the admin to give it an Add button. Merle's items are on by default; Tommy Sugo's are off until ticked. An item with no Collect price gets no button.
- An item linked to Yoco offers Yoco's variants and modifiers when added, using Yoco's required and maximum selections. Each combination is its own line in the cart.
- The item editor has a switch for each variant, modifier group and modifier, per item. Medium variants and the Package group start off (`OFF_BY_DEFAULT` in `_shared/yoco-catalogue.ts`), and everything else starts on.
- At a brand connected to Yoco, a menu item only shows while it's linked to a Yoco item that still exists. The database enforces this (`menu_items.yoco_listed`). Shop items aren't covered.
- Menu items are collection only. Any food in the cart makes the whole order a collection from the kitchen, and shop items in that order are collected with it.
- Delivery is only offered when the cart holds nothing but shop items. Those orders can also choose Collect.
- Sold-out shop items can't be added. Add buttons only appear with live data, so the static fallback can't take food orders.

### Checkout

Tommy Sugo takes real orders. Merle's checkout is still a prototype (`liveCheckout` in `window.ORDER_COPY` switches it per page).

1. `order-create` prices the cart again from the database, saves the order as awaiting payment, and sends the customer to Yoco Checkout.
2. `yoco-payment-webhook` confirms the payment. Only this moves an order on: the customer returning to the site proves nothing. It emails the customer their link and collection code, and records live orders in Yoco.
3. `order.html` is the customer's page, reached by a private link. It shows the code and the order's progress.
4. The **Orders** tab in the admin moves an order through Preparing and Ready. Marking it collected needs the customer's code, which staff can't see.

### Customer accounts

At checkout the customer picks **With an account** (sign in, or create one with name, email, cell number and password) or **No account**.

- Orders placed while signed in are linked to the account (`orders.customer_id`). Their profile is in `public.customers`, filled from the sign-up by a trigger. Customers can read and edit only their own row.
- Every order page saves its link in that browser, so `account.html` can list orders placed without an account, and a signed-in customer can add them to their account.
- `my-orders` returns a customer's orders. Orders aren't readable by customers through the Data API, and customer accounts can't open the admin, which only lets in people listed in `admins`.
- Supabase needs sign-ups switched on (Authentication → Sign In / Providers), and the site added to Redirect URLs for confirmation and password reset links. Its built-in email only reaches the project's team members, so customers can only confirm an account once custom SMTP is set up (Resend works, with a verified domain).
- Yoco's API has no loyalty features. The site keeps the cell number, which is what Yoco Loyalty uses at the counter.

Keys are saved in Settings (Online Payments, Order Emails) and kept in Vault. A `sk_test` key takes no money, and its orders are marked Test and aren't sent to Yoco unless someone presses **Send to Yoco**. Delivery can't be ordered online yet, as there are no delivery fees to charge. Cancelling an order doesn't refund it: do that in Yoco.

## Yoco product sync

Tommy Sugo only for now. Each brand has its own Yoco account, so credentials and data are all per brand. To add Merle's: add it to `BRANDS` and `ENV_KEYS` in `supabase/functions/_shared/yoco.ts`, insert its `yoco_connections` row, and add it to `YOCO_BRANDS` in `admin/index.html`.

- **Direction:** the sync only reads from Yoco and never changes anything there.
- **Yoco owns** the price and availability of any website item matched to it. A database trigger enforces this, so a save from the admin can't override a matched price. **The website keeps** names, descriptions, images, order, and what's hidden.
- **Set up in the admin, under Tommy Sugo → Settings:** add the API key (or use the edge function secret), pick a location if there are several, Sync now, Match Items, then turn on live updates. These save straight away, separately from Save settings.
- **Credentials:** a key saved in the admin is encrypted in Supabase Vault and can't be read back. If there isn't one, the functions use the edge function secret `YOCO_API_KEY_TOMMY` or `YOCO_API_KEY`. The webhook signing secret is saved to Vault automatically.
- **Unavailable items:** when Yoco disables or deletes a matched item, its price goes blank: "–" with no Add button on the menu, "Sold out" in the shop. It comes back when Yoco re-enables it.
- **Not synced:** stock counts (not available from Yoco's API, so "Sold out" stays manual) and new Yoco items (listed in Settings, never published automatically).

Both functions are deployed with `verify_jwt` off: `yoco-admin` checks the caller is in `admins`, and `yoco-webhook` checks Yoco's signature. To test the catalogue and signature logic:

```bash
node --test supabase/functions/_shared/yoco-catalogue.test.ts
```

## Running locally

```bash
python3 -m http.server 8123
```

Then open http://localhost:8123/ and http://localhost:8123/admin/. Add `http://localhost:8123/admin/` to Supabase's
redirect URLs if you want reset links to work locally.
