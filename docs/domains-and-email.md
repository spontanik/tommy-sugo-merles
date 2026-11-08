# Domains and email

Where everything lives once it's set up:

| Address | What it serves |
| --- | --- |
| `spontanik.co.za` (and `www.`) | The main page, both kitchens (`index.html`) |
| `tommy.spontanik.co.za` | Tommy Sugo (`tommy-sugo.html`) |
| `merles.spontanik.co.za` | Merle's (`merles-schnitz.html`) |
| `admin.spontanik.co.za` | Housemates, the admin (`admin/index.html`) |
| `merles.co.za` | Later: forwards to `merles.spontanik.co.za`, and Merle's emails could come from here |
| `tommysugofood.co.za` | Later: Tommy Sugo's emails could come from here. It's still the Shopify store |

For now all email is sent from `spontanik.co.za` (step 5).

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
- **Redirect URLs**: `https://spontanik.co.za/**`, `https://tommy.spontanik.co.za/**`,
  `https://merles.spontanik.co.za/**`, `https://admin.spontanik.co.za/**`, and
  `https://spontanik.github.io/tommy-sugo-merles/**` until nobody uses that address.

Done on 2026-11-08. Before that there were no redirect URLs, so every link went to the Site URL.

Account confirmations and password resets then go back to the address the person signed up on.

## 4. Deploy the order functions (only after step 2 works)

Order emails and Yoco Checkout now return to the brand's own subdomain (`siteUrl` in
`supabase/functions/_shared/orders.ts`). The functions that build those links are `order-create`, `yoco-payment-webhook`
and `order-admin` (Send email again). All of them run with verify_jwt off:

```bash
supabase functions deploy order-create yoco-payment-webhook order-admin --project-ref awazfdglfhmkejrctnkz --no-verify-jwt
```

Done on 2026-11-08 (order-create v3, yoco-payment-webhook v2, order-admin v2).

If these are deployed before `tommy.spontanik.co.za` opens, customers come back from paying to a page that doesn't load.
(The payment still goes through, and the order is still saved.)

## 5. Send email from spontanik.co.za (Resend)

For now both brands send from `spontanik.co.za`. The Resend team is **myeinv**, on the free plan: 3 domains, 3,000 emails
a month, 100 a day. Its 3 domains are `spontanik.co.za`, `terrainhq.co.za` and `terrainhq.net`, so `merles.co.za` or
`tommysugofood.co.za` need a free domain slot first (upgrade to Pro, $20 a month for 10, or a separate team for the brands).

`spontanik.co.za` was added on 2026-11-08, region **Ireland (eu-west-1)**, with **Manual setup** (not Auto configure,
which asks for access to the GoDaddy account). Its records at GoDaddy:

| Type | Name | Value |
| --- | --- | --- |
| TXT | `resend._domainkey` | `p=MIGfMA0GCSq…` (the DKIM key Resend shows, different for every domain) |
| CNAME | `send` | `send.forge.rmta.net` |
| CNAME | `rsend` | `rsend-euw1.forge.rmta.net` |

These only add `send.`, `rsend.` and `resend._domainkey.` names, so they don't touch the website. Resend also suggests a
`_dmarc` record; `spontanik.co.za` already has GoDaddy's (`p=quarantine`), which is fine because Resend signs as
`spontanik.co.za`. In the dashboard, GoDaddy adds the domain itself, so the name is just `send`, not
`send.spontanik.co.za`.

The same three kinds of record work for any later domain. At domains.co.za (`tommysugofood.co.za`), check whether the name
field wants the short name or the full one, and don't change the Shopify records.

### Use it

1. Resend → **API Keys → Create**: permission **Sending access**, domain `spontanik.co.za`. Make one key for order emails
   and another for Supabase (step 6), so either can be withdrawn on its own.
2. Housemates → **Tommy Sugo → Settings → Order Emails**: send from `Tommy Sugo <tommy@spontanik.co.za>`, paste the key,
   **Save**. Then use **Send email again** on a test order in the Orders tab to check it arrives.
3. Merle's has no Order Emails card yet: its checkout is still a prototype. When it takes real orders, it can send from
   `Merle's <merles@spontanik.co.za>`.

## 6. Account emails (Supabase custom SMTP)

Customer account emails (confirm your account, reset your password) are sent by Supabase Auth, not by the order
functions. Supabase sends them from **one address for the whole project**, whichever brand the customer signed up on. So
pick one:

- **`hello@spontanik.co.za`** (recommended): neutral for both brands, and `spontanik.co.za` is already in Resend.
- `tommy@spontanik.co.za`: then Merle's customers get account emails from Tommy Sugo.

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
