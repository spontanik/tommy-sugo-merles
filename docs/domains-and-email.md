# Domains and email

Where everything lives once it's set up:

| Address | What it serves |
| --- | --- |
| `spontanik.co.za` (and `www.`) | The main page, both kitchens (`index.html`) |
| `tommy.spontanik.co.za` | Tommy Sugo (`tommy-sugo.html`) |
| `merles.spontanik.co.za` | Merle's (`merles-schnitz.html`) |
| `admin.spontanik.co.za` | Housemates, the admin (`admin/index.html`) |
| `merles.co.za` | Merle's emails come from here. Later it forwards to `merles.spontanik.co.za` |
| `tommysugofood.co.za` | Tommy Sugo's emails come from here. It's still the Shopify store, and nothing here changes its website |

`order.html`, `account.html`, the images and scripts are shared, so they open at every address.

The site is hosted on **Vercel** (the paid account that has the other projects), because GitHub Pages can only serve one
custom domain. The `routes` in `vercel.json` say which page each address serves, and `js/sites.js` points the links
between sites at the right address. On any other address (a local copy, GitHub Pages, the `vercel.app` address) the pages
link to each other as files, as before. `.vercelignore` keeps `docs/`, `supabase/` and the README out of the deployment.

`vercel.json` uses `routes`, not `rewrites`, on purpose: Vercel serves an existing file before it looks at `rewrites`, so a
rewrite can't make `/` show `tommy-sugo.html` while `index.html` exists. Routes are checked first.

Who holds what:

- `spontanik.co.za` and `merles.co.za`: GoDaddy.
- `tommysugofood.co.za`: domains.co.za.

Do the steps in this order. Step 4 is the only one that can break something if it's done too early.

## 1. Put the site on Vercel

1. Vercel → **Add New → Project**, import `spontanik/tommy-sugo-merles` from GitHub. If the repo isn't listed, give
   Vercel's GitHub app access to it (**Adjust GitHub App Permissions**).
2. Framework preset **Other**, root directory `./`, no build command. **Deploy**.
3. Open the `something.vercel.app` address it gives you and check the site and `/admin/` work.
4. **Settings → Domains**: add `spontanik.co.za`. When Vercel offers to add `www.spontanik.co.za` as a redirect, accept.
5. Add `tommy.spontanik.co.za`, `merles.spontanik.co.za` and `admin.spontanik.co.za`, each connected to Production.
   A route in `vercel.json` does nothing for a domain that isn't added here.

Pushing to `main` now deploys to both GitHub Pages and Vercel. Leave GitHub Pages on: order emails already sent link to
the `github.io` address.

## 2. Point spontanik.co.za at Vercel (GoDaddy)

GoDaddy → **My Products → spontanik.co.za → DNS**. Right now it shows GoDaddy's parking page.

1. Delete the two **A** records for `@` (`3.33.130.190` and `15.197.148.33`) and the **CNAME** for `www`.
2. Add the records Vercel shows next to each domain under Settings → Domains. They usually look like this, but Vercel
   sometimes gives a project its own IP or CNAME: **use Vercel's values**.

| Type | Name | Value |
| --- | --- | --- |
| A | `@` | `76.76.21.21` |
| CNAME | `www` | `cname.vercel-dns.com` |
| CNAME | `tommy` | `cname.vercel-dns.com` |
| CNAME | `merles` | `cname.vercel-dns.com` |
| CNAME | `admin` | `cname.vercel-dns.com` |

DNS takes between minutes and a few hours. When all the domains show **Valid Configuration**, Vercel gets an HTTPS
certificate for each one by itself. Check that all four open and each shows the right page.

## 3. Tell Supabase about the new addresses

Supabase → project `tommy-sugo-merles` → **Authentication → URL Configuration**:

- **Site URL**: `https://admin.spontanik.co.za/`
- **Redirect URLs**: add
  `https://spontanik.co.za/**`, `https://tommy.spontanik.co.za/**`, `https://merles.spontanik.co.za/**`,
  `https://admin.spontanik.co.za/**`. Keep the `github.io` ones until nobody uses that address.

Account confirmations and password resets then go back to the address the person signed up on.

## 4. Deploy the order functions (only after step 2 works)

Order emails and Yoco Checkout now return to the brand's own subdomain (`siteUrl` in
`supabase/functions/_shared/orders.ts`). Deploy every function that uses that file:

```bash
supabase functions deploy order-create order-status order-admin my-orders yoco-payment-webhook yoco-admin --project-ref awazfdglfhmkejrctnkz --no-verify-jwt
```

If these are deployed before `tommy.spontanik.co.za` opens, customers come back from paying to a page that doesn't load.
(The payment still goes through, and the order is still saved.)

## 5. Send email from the brand domains (Resend)

Resend's free plan covers 3 domains, 3,000 emails a month and 100 a day. That's enough for both brand domains plus
`spontanik.co.za` if account emails come from there (step 6).

### Add the domains in Resend

1. Sign up at resend.com.
2. **Domains → Add domain**: `merles.co.za`. Pick the region **Ireland (eu-west-1)**, the nearest to South Africa.
3. Resend lists 3 or 4 DNS records. They look like the table below, but **copy the values from Resend**: the DKIM key is
   different for every domain.

| Type | Name | Value | Priority |
| --- | --- | --- | --- |
| TXT | `resend._domainkey` | `p=MIGfMA0GCSq…` (from Resend) | |
| MX | `send` | `feedback-smtp.eu-west-1.amazonses.com` | 10 |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` | |
| TXT | `_dmarc` | `v=DMARC1; p=none;` (optional, recommended) | |

4. Do the same for `tommysugofood.co.za`, and for `spontanik.co.za` if you choose it in step 6.

These records only add `send.` and `resend._domainkey.` names to each domain. They don't touch the website (`@`, `www`),
so the Shopify store on `tommysugofood.co.za` keeps working.

### Add the records

- **merles.co.za and spontanik.co.za** (GoDaddy → DNS → Add new record): GoDaddy adds the domain itself, so the name is
  just `send`, not `send.merles.co.za`.
- **tommysugofood.co.za** (domains.co.za → the domain → **Manage DNS**): the same records. Check what the screen expects
  in the name field. If the other records there are listed as full names (`www.tommysugofood.co.za`), type
  `send.tommysugofood.co.za` and `resend._domainkey.tommysugofood.co.za`. Don't change the Shopify records.

Then press **Verify** in Resend for each domain. It usually turns green within an hour.

### Use them

1. Resend → **API Keys → Create**: permission **Sending access**, domain `tommysugofood.co.za`. Make a separate key for
   each domain, so one can be withdrawn without stopping the other.
2. Housemates → **Tommy Sugo → Settings → Order Emails**: send from `Tommy Sugo <orders@tommysugofood.co.za>`, paste the
   key, **Save**. Then use **Send email again** on a test order in the Orders tab to check it arrives.
3. Merle's has no Order Emails card yet: its checkout is still a prototype. When Merle's takes real orders, it will send
   from `Merle's <orders@merles.co.za>` with its own key.

## 6. Account emails (Supabase custom SMTP)

Customer account emails (confirm your account, reset your password) are sent by Supabase Auth, not by the order
functions. Supabase sends them from **one address for the whole project**, whichever brand the customer signed up on. So
pick one:

- **`hello@spontanik.co.za`** (recommended): neutral for both brands. Needs `spontanik.co.za` verified in Resend too.
- `orders@tommysugofood.co.za`: then Merle's customers get account emails from Tommy Sugo.

Supabase → **Authentication → Emails → SMTP Settings** → Enable custom SMTP:

| Field | Value |
| --- | --- |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | a Resend API key with sending access to that domain |
| Sender email | the address you picked |
| Sender name | e.g. `Tommy Sugo & Merle's` |

Until this is set, only the Supabase project's team members receive account emails.

## Later: forward merles.co.za

1. Vercel → Settings → Domains: add `merles.co.za` and `www.merles.co.za`.
2. GoDaddy → merles.co.za → DNS: replace the parked `@` A records and the `www` CNAME with
   the values Vercel shows (usually **A `@` → `76.76.21.21`** and **CNAME `www` → `cname.vercel-dns.com`**). Leave the
   Resend records alone.

`vercel.json` already sends both to `merles.spontanik.co.za`.

## Later: tommysugofood.co.za

It still points at Shopify. When the store moves, do the same as merles.co.za at domains.co.za, and add its two lines to
`vercel.json` (copy the `merles.co.za` route and change both names).
