# Brief: Housemates admin (for Claude Code)

Turn the existing "Kitchen Admin" at `/admin/` into **Housemates**: one sign-in and one admin for both brands, with a brand switch at the top and, for each brand, its own **Menu**, **Shop** and **Settings**.

Design reference: the "Housemates Admin" canvas in Claude (https://claude.ai/code/artifact/f457ade7-a0ef-441c-8d75-3461131fb0f3). You may not be able to open it, so this file is the spec. Where they differ, this file wins.

Read `README.md`, `admin/index.html`, `js/catalog-config.js`, `js/catalog.js` and both migrations before starting.

## Ground rules

- `main` deploys to GitHub Pages on push. Work on a branch (`housemates-admin`) and open a PR. Do not push to `main`.
- New migrations go in `supabase/migrations/` with a later timestamp than `20261105000100`. Use `private.is_admin()` in every policy (not `public.is_admin()`, which is revoked). Follow the existing pattern: anon gets its own read policy, signed-in non-admins read visible rows, admins do everything.
- Don't run migrations against the live project (`awazfdglfhmkejrctnkz`) without Tahl confirming. Write them, and say they need applying.
- The public pages must keep working if Supabase is unreachable (the current static fallback stays).
- Keep it dependency-free: plain HTML/CSS/JS, supabase-js from the CDN as now.

## 1. Rename and reskin

- Page title, header and copy: "Kitchen Admin" becomes "Housemates". Sign-in, Choose a password and No access screens show a "Housemates" text wordmark (Archivo 800, 48px, on black). There is no Housemates logo yet: text only, easy to swap for an image later. Keep the existing copy otherwise ("For the Tommy Sugo and Merle's teams. Edit the menus and shop items.").
- Shell look (shared neutrals of both brand systems):
  - ground `#f2f2f2`, ink `#000`, muted `#4a4a48`, shade `#d3d2d2`, raised rows `#fff`, top bar `#000` with text `#f2f2f2`.
  - Body font Archivo (400/500/700/800). Section headings Archivo 800, 28px.
  - Square corners everywhere (remove all border-radius), no shadows. Borders and rules 2px solid black. Active tab underline 8px black.
  - All buttons, inputs and tap targets at least 44px high. Focus: 3px solid ring, 2px offset (black on paper, `#f2f2f2` on the black bar).
  - Buttons: solid black with paper text, hover inverts. Ghost: 2px black outline, hover fills black. The dialog's ✕ becomes the word "Close".
  - "Hidden" and "Sold out" tags: small uppercase tracked labels; Hidden on shade, Sold out black. No status colours.
  - Auth screens: black page, paper card (max 420px), primary button black.
- No brand red in the shell. The only red is the Save button inside Tommy Sugo (see 3).

## 2. Brand switch and navigation

- Top bar: `Housemates` wordmark, then a two-button segmented switch: **Tommy Sugo** | **Merle's Schnitz** (`aria-pressed`; selected = paper fill, black text), then the signed-in email and Sign out.
- Under the bar, a brand header: Tommy Sugo shows `tommy-mark.png` at 64px plus "Tommy Sugo" in Oswald 700 44px. Merle's shows `merles-logo.svg` at 120px wide, with no typeset name (the wordmark is artwork). Right side: "View site ↗" linking to the brand's page.
- Below that, tabs: **Menu**, **Shop**, **Settings**, for the selected brand.
- Replace the four current tabs and the `admin-tab` localStorage key with `{brand, view}` saved under `housemates-admin` (try/catch as now). Switching brand keeps the current view.
- Put the state in the URL hash too (`#tommy/menu`, `#merles/settings`) so a link opens the right place. Don't break the invite/recovery hash handling (`type=invite|recovery`) that already uses the hash: parse that first.

## 3. Brand styling inside the content

- Item names and prices in the brand's type: Tommy Sugo = Oswald 600, 0.02em tracking. Merle's = Montserrat 700 (stand-in for Proxima Nova), no tracking. Load both from Google Fonts.
- Primary Save in item and settings dialogs: Tommy Sugo `#ec1c24` with black text (hover: black with paper text). Merle's: black (no accent colour in that brand).
- Section headings, row layout, thumbnails (64px, white ground for images, shade block reading "No image"), up/down/Edit controls are the same for both brands.

## 4. Menu and Shop tabs

Same behaviour as today (list by section, reorder, add, edit, hide, sold out, image upload, delete). Layout changes only:
- Rows are not boxed in cards: a section is a heading row (title + item count + "+ Add item") with a 2px rule under it, then rows with 16px gaps.
- Keep the per-row price labels as now.
- Section list and price columns come from the new `sections` table (5), falling back to `catalog-config.js`.

## 5. Settings tab (per brand)

### Data
New migration:
- `public.brands`: `key text primary key check (key in ('tommy','merles'))`, `label text not null`, `page text not null`, `updated_at`.
- `public.sections`: `id uuid pk`, `brand text references brands(key)`, `kind text check (kind in ('menu','shop'))`, `key text` (slug, unique per brand+kind), `title text not null`, `prices text check (prices in ('pizza','cd','single'))` (null for shop), `is_hidden boolean default false`, `sort_order int`, timestamps, `touch_updated_at` trigger.
- RLS as for `menu_items`. Seed both tables from `js/catalog-config.js` exactly.
- Renaming a section key must not orphan items: keys are fixed once created (only title, prices, order and hidden can change). Deleting a section is only allowed when it has no items.

### Screen
- **Brand**: Name (`brands.label`) and Site page (`brands.page`).
- **Menu Sections**: one row per section on white: title, then "Prices: Large and Medium, each Collect and Deliver" / "Collect and Deliver" / "One price", then the item count. Up/down and Edit. "+ Add section" opens a small dialog (title, price columns; key generated from the title).
- **Shop Sections**: same, with "One price".
- Cancel and "Save settings" at the bottom. Changing a section's price columns must warn that prices in columns it drops will be cleared, and then clear them (same rule the item dialog already applies).

### Public pages (`js/catalog.js`)
- Load `brands` and `sections` with the items. Use them for section titles, order and price columns, falling back to `catalog-config.js`.
- Add `data-section-title="<key>"` to the section heading elements in `tommy-sugo.html` and `merles-schnitz.html` so titles can be swapped. A hidden section hides its container.
- **Out of scope for now:** a brand-new section on the public page. The HTML has a slot per existing section, and the section illustrations are drawn per section, so a new section shows in the admin and stores items, but needs a site update to appear. Show that as a note under "+ Add section". Reordering sections on the public pages is also out of scope unless it's easy and safe.

## 6. Not in this change (flag, don't build)

- Per-brand access. `admins` has no brand column, so every admin can edit both brands. If wanted later: `admins.brands text[]` and policies that check it.
- A real Housemates logo.

## Done when

- Branch `housemates-admin` with a PR describing the changes and listing the migrations to apply.
- The admin works locally (`python3 -m http.server 8123`) against the live project for reads, and degrades cleanly if the new tables aren't there yet (falls back to `catalog-config.js`).
- README updated: Housemates name, Settings, the new tables, the hash URLs.
- Check at 390px and 1280px wide: header wraps, no horizontal scroll, all controls reachable by keyboard.
