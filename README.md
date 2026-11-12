# Tommy Sugo & Merle's website

Static site (`index.html`, `tommy-sugo.html`, `merles-schnitz.html`) with a staff admin, **Housemates**, at `/admin/`
for editing both brands' menus, shop items and settings. Items live in Supabase. The public pages fetch them on load and fall back to the HTML already in
the page if Supabase isn't configured or can't be reached.

## Files

| Path | What it is |
| --- | --- |
| `js/sites.js` | Where each site lives (spontanik.co.za and its subdomains), and the links between them |
| `vercel.json`, `.vercelignore` | Vercel: which page each address serves, and what's left out of the deployment |
| `docs/domains-and-email.md` | Setting up the domains, Vercel, and email from the brand domains |
| `admin/index.html` | Housemates: sign in, pick a brand, then edit its Menu, Shop and Settings (see below) |
| `js/supabase-config.js` | Supabase project URL and publishable key (safe to publish) |
| `js/catalog-config.js` | The fallback list of sections and price columns, used if the `brands` and `sections` tables can't be read, plus the price column labels |
| `js/catalog.js` | Loads live items into the public pages, with Add buttons on orderable menu items |
| `index.html` | The landing page: the two brand doors, then Events, Trucks & Catering and The Shop |
| `events.html` | Events, Trucks & Catering for both brands (spontanik.co.za/events.html), with the enquiry form. Photos in `images/events/` (sources in `SOURCES.txt`) |
| `shop.html` | The combined Shop (spontanik.co.za/shop.html): both brands' shop items in one order |
| `js/cart.js` | The order itself, kept in cookies on spontanik.co.za so one order follows the customer across the brand sites and the Shop |
| `js/order.js` | The cart and checkout rules on the brand pages and the Shop (`window.ORDER_COPY` in each page holds its wording) |
| `js/account.js` | Customer accounts and the orders kept on this device, shared by the checkout, `order.html` and `account.html` |
| `account.html` | Your Orders: sign in or create an account, current and previous orders, profile and specials |
| `supabase/migrations/…_menu_and_shop.sql` | Tables, row-level security, the `item-images` storage bucket |
| `supabase/migrations/…_private_is_admin_and_anon_reads.sql` | Fix-up: lets visitors read visible items, moves the admin check to a private schema |
| `supabase/migrations/…_menu_items_orderable.sql` | Adds `menu_items.is_orderable` and turns it on for all of Merle's |
| `supabase/migrations/…_brands_and_sections.sql` | The `brands` and `sections` tables, seeded from `catalog-config.js`, and the rules that protect them |
| `supabase/migrations/…_yoco_catalogue_sync.sql` | Yoco connection status, the catalogue copy, item links, and price triggers |
| `supabase/functions/yoco-admin` | Used by the admin's Settings tab: credentials, location, sync, live updates |
| `supabase/functions/yoco-webhook` | Receives item changes from Yoco, checks the signature, refreshes the item |
| `scripts/yoco-create-merles-items.mjs` | One-off: creates Merle's menu items in the shared Yoco account (dry run unless `--create`) |
| `supabase/seed.sql` | The items that were hard-coded in the pages on 2026-11-05 |

## Setting up Supabase

1. Run the migrations (in filename order), then `seed.sql`, in the project's SQL editor (or `supabase db push`). The
   brands and sections are seeded by their migration, so `seed.sql` only adds the items.
2. Put the project URL and publishable key in `js/supabase-config.js`.
3. **Authentication → Sign In / Providers**: turn off "Allow new users to sign up". (Even if left on, only people in
   the `admins` table can change anything.)
4. **Authentication → URL Configuration**: set the Site URL to the admin page, `https://admin.spontanik.co.za/`, so
   invite and password-reset emails land there, and add each site to Redirect URLs (see
   [docs/domains-and-email.md](docs/domains-and-email.md)).

The live project is `tommy-sugo-merles` (ref `awazfdglfhmkejrctnkz`) in the Housemates Supabase organisation. The site
is published from `main` of `spontanik/tommy-sugo-merles`: push to `main` and it redeploys. Vercel serves it at
`spontanik.co.za`, `tommy.`, `merles.` and `admin.` (see [docs/domains-and-email.md](docs/domains-and-email.md)), and
GitHub Pages still serves the old `spontanik.github.io/tommy-sugo-merles` address, which early order emails link to.

## The admin (Housemates)

One sign-in for both brands. The switch in the top bar picks the brand, and each brand has three tabs:

- **Menu** and **Shop**: the brand's sections, each holding its items. Add, edit (title, price columns, hidden),
  reorder and delete sections, and edit, add, hide, reorder and delete the items in them, upload images, mark shop
  items sold out. Every change saves straight away.
- **Settings**: the brand's name and site page (kept on screen until **Save settings**), and the Yoco connection.

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

If these tables aren't there yet, the admin and the site fall back to `js/catalog-config.js`, and sections can't be changed.

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
- **Order.** Each section's heading and items sit together in a `data-section-block="section-key"` element, inside a
  `data-section-flow`. `catalog.js` puts the blocks in the admin's order. A flow with `.col` columns is filled like a
  newspaper, down each column in turn, balanced by roughly how long each section is; a note at the foot of a column
  stays there. Tommy Sugo's pizza sections and its other sections are two `data-section-group`s: each stays together and
  goes where its first section is, so the pizza sections always sit under the one Pizza heading.
- **New sections** appear on the site straight away, drawn from the flow's `<template data-section-template>`: the
  title and items in the brand's style, without an illustration or intro. To give one its own, add its block to the page.
- **Empty sections** are left off the site: a section is hidden when none of its items are showing.
- Intros and illustrations are still in the HTML.

## Ordering

**One order across both brands.** The order lives in `js/cart.js`, in cookies set for the whole spontanik.co.za domain
(browser storage is per address, cookies can be shared), so a customer can add Tommy Sugo pizza on tommy., Merle's schnitz
on merles. and frozen items on the combined Shop, and check out once on any of them. Each line keeps its brand, and
with both brands in the order the cart names them ("Merle's · Schnitz and Chips"). Everything is collected from the one
kitchen with one collection code. On a local copy the cookies belong to that one address, which works the same way.
On the brand pages, items are added on the Menu and Shop views; the cart and checkout are their own view, **Your Order**
(`#cart`), opened from the cart icon in the header or the "View order" bar. The Shop page has its order beside the
products.

- Tick **Order online for collection** on a menu item in the admin to give it an Add button. Merle's items are on by default; Tommy Sugo's are off until ticked. An item with no Collect price gets no button.
- An item linked to Yoco offers Yoco's variants and modifiers when added, using Yoco's required and maximum selections. Each combination is its own line in the cart.
- The item editor has a switch for each variant, modifier group and modifier, per item. Medium variants and the Package group start off (`OFF_BY_DEFAULT` in `_shared/yoco-catalogue.ts`), and everything else starts on.
- At a brand connected to Yoco, a menu item only shows while it's linked to a Yoco item that still exists. The database enforces this (`menu_items.yoco_listed`). Shop items aren't covered.
- Menu items are collection only. Any food in the cart makes the whole order a collection from the kitchen: the Delivery / Collect choice isn't shown, and shop items (frozen pizzas, sauce) in that order are collected with it.
- Delivery is only offered when the cart holds nothing but shop items. Those orders can also choose Collect.
- Sold-out shop items can't be added. Add buttons only appear with live data, so the static fallback can't take food orders.
- **Stock:** a shop item's **Stock** in the admin is how many are left to sell online. The shop shows "12 in stock", 0 shows as sold out, and the cart can't go above what's left; `order-create` checks the same. Blank means the item isn't counted.
- **Reserving stock:** before the customer is sent to pay, `order-create` reserves the order's counted shop items with `reserve_order_stock`: all of them or none, with the rows locked, so two people can't both get the last one. If someone else got there first the order is dropped and the customer sees "Only 1 Margherita, frozen left". The shown stock is what's free right now. The reservation holds until:
  - **paid:** it stays taken;
  - **cancelled by staff:** `return_order_stock` puts it back;
  - **not paid within 30 minutes:** `expire_unpaid_orders` cancels the order (`cancel_reason = 'unpaid'`) and puts the stock back. It runs before every new order, and every 5 minutes from the `expire-unpaid-orders` pg_cron job (`20261111000200_expire_unpaid_schedule.sql`). The order page tells the customer it wasn't paid in time, and the admin doesn't list it. If the payment arrives after all, the webhook revives the order and takes the stock again (`take_order_stock`, never below 0).
  - Each of these happens once per order (`orders.stock_taken`).

### Checkout

Tommy Sugo, Merle's and the combined Shop all take real orders (`liveCheckout` in `window.ORDER_COPY` switches it per page).
Merle's sells through Tommy Sugo's Yoco account, so every payment, the payment webhook and the order emails use Tommy
Sugo's checkout key and email settings (`accountOf` in `_shared/orders.ts`). Merle's keeps its own Yoco API key and
location for recording sales.

- `orders.brands` says which brands are in an order; each `order_lines.brand` says whose the line is. A single-brand
  order has `brand` set to that brand; one holding both is filed under the account it's paid through (`tommy`).
- The admin's **Orders** tab shows the selected brand's orders (including mixed ones) or, with **Both stores**, every
  order for the one kitchen. Each order then carries brand tags, and a mixed order's lines say whose they are.

1. `order-create` prices the cart again from the database, saves the order as awaiting payment, and sends the customer to Yoco Checkout.
2. `yoco-payment-webhook` confirms the payment. Only this moves an order on: the customer returning to the site proves nothing. It emails the customer their link and collection code, and records live orders in Yoco.
3. `order.html` is the customer's page, reached by a private link. It shows the code and the order's progress.
4. The **Orders** tab in the admin moves an order through Preparing and Ready. Marking it collected needs the customer's code, which staff can't see.

### Customer accounts

Checkout starts as a guest: name, email and cell number, no account needed. **Have an account? Sign in** opens sign-in
(or create an account with name, email, cell number and password), and **Continue as a guest instead** goes back.
Someone already signed in sees their saved details.

- Orders placed while signed in are linked to the account (`orders.customer_id`). Their profile is in `public.customers`, filled from the sign-up by a trigger. Customers can read and edit only their own row.
- Every order page saves its link in that browser, so `account.html` can list orders placed without an account, and a signed-in customer can add them to their account.
- `my-orders` returns a customer's orders. Orders aren't readable by customers through the Data API, and customer accounts can't open the admin, which only lets in people listed in `admins`.
- Supabase needs sign-ups switched on (Authentication → Sign In / Providers), and the site added to Redirect URLs for confirmation and password reset links. Its built-in email only reaches the project's team members, so customers can only confirm an account once custom SMTP is set up (Resend works, with a verified domain).
- Yoco's API has no loyalty features. The site keeps the cell number, which is what Yoco Loyalty uses at the counter.

Keys are saved in Settings (Online Payments, Order Emails) and kept in Vault. A `sk_test` key takes no money, and its orders are marked Test and aren't sent to Yoco unless someone presses **Send to Yoco**. Delivery can't be ordered online yet, as there are no delivery fees to charge. Cancelling an order doesn't refund it: do that in Yoco.

## Yoco product sync

Both brands. Merle's sells through Tommy Sugo's Yoco account (`SHARES_ACCOUNT_OF` in `supabase/functions/_shared/yoco.ts`): it uses Tommy Sugo's key unless one is saved under Merle's, but keeps its own catalogue copy, item links and live-updates subscription. Its own items sit in Yoco categories starting `MERLE'S`, which is how its Settings tells them apart from Tommy Sugo's. Its drinks follow Tommy Sugo's Coke and Still water. `scripts/yoco-create-merles-items.mjs` creates Merle's items in Yoco, copying Pizza Margherita's tax and location settings. Each combo is one Yoco item made up of other products: free product modifiers for its fixed parts (groups named `Combo: …`, switched off on the website) and for the customer's sauce and drink choices. The parts only it uses, Schnitz and Large Chips, are R0 items under `MERLE'S COMBO PARTS`.

- **Direction:** the sync only reads from Yoco and never changes anything there.
- **Yoco owns** the price and availability of any website item matched to it. A database trigger enforces this, so a save from the admin can't override a matched price. **The website keeps** names, descriptions, images, order, and what's hidden.
- **Set up in the admin, under Tommy Sugo → Settings:** add the API key (or use the edge function secret), pick a location if there are several, Sync now, Match Items, then turn on live updates. These save straight away, separately from Save settings.
- **Credentials:** a key saved in the admin is encrypted in Supabase Vault and can't be read back. If there isn't one, the functions use the edge function secret `YOCO_API_KEY_TOMMY` or `YOCO_API_KEY`. The webhook signing secret is saved to Vault automatically.
- **Unavailable items:** when Yoco disables or deletes a matched item, its price goes blank: "–" with no Add button on the menu, "Sold out" in the shop. It comes back when Yoco re-enables it.
- **Not synced:** stock counts (not available from Yoco's API, so stock is kept in the admin; see Ordering) and new Yoco items (listed in Settings, never published automatically).

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
