// Called by the checkout on a brand page. Public, so nothing from the request is trusted: prices come from the database.
// Deploy with verify_jwt off. Saves the order as awaiting payment, reserves its counted shop items, and returns the
// payment page: PayFast's when the paying account has PayFast set up, otherwise Yoco Checkout's. The reservation holds
// until the order is paid, cancelled, or left unpaid for UNPAID_MINUTES.
// A signed-in customer sends their session as the Authorization bearer, and the order is linked to their account.
// Without one (or if it has run out) the order is placed without an account, as before.
// One order can hold both brands (each line says its brand), collected from the one kitchen and paid in one go through
// Tommy Sugo's account. body.brand is the page it came from: "tommy", "merles", or "both" (the combined shop).
import { adminClient, BRANDS, getSecret } from "../_shared/yoco.ts";
import { OrderError, priceOrder, type RequestedLine } from "../_shared/order-pricing.ts";
import { accountOf, checkoutFetch, CORS, getPayfast, orderLink, reply, shopName, siteUrl } from "../_shared/orders.ts";
import { checkoutUrl, PAYFAST_MIN_CENTS, signedCheckoutQuery, splitName } from "../_shared/payfast.ts";

const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;
const YOCO_MIN_CENTS = 200; // Yoco doesn't accept less
const UNPAID_MINUTES = 30; // an unpaid order's stock is released after this (also in the expire-unpaid-orders job)
const clean = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

function randomHex(bytes: number) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes))).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomCode() {
  // Rejects the few values that would make some codes more likely than others.
  const values = new Uint32Array(1);
  do crypto.getRandomValues(values); while (values[0] >= 4294960000);
  return String(values[0] % 10000).padStart(4, "0");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply({ ok: false, error: "Use POST." }, 405);

  const body = await req.json().catch(() => null);
  if (!body) return reply({ ok: false, error: "Something went wrong. Please try again." }, 400);
  const page = String(body.brand ?? "");
  if (!BRANDS.includes(page) && page !== "both") return reply({ ok: false, error: "Online ordering isn't available here yet." });
  const pageBrand = BRANDS.includes(page) ? page : undefined;
  const lineBrands = Array.isArray(body.lines) ? body.lines.map((l: { brand?: unknown }) => l?.brand ?? pageBrand) : [];
  if (lineBrands.some((b: unknown) => !BRANDS.includes(String(b)))) return reply({ ok: false, error: "Please refresh the page and add your items again." });
  const brands: string[] = [...new Set(lineBrands as string[])].sort();
  // A single-brand order is that brand's; one holding both is filed under the account they're paid through.
  const brand = brands.length === 1 ? brands[0] : accountOf(brands[0] ?? "tommy");

  const name = clean(body.name, 100);
  const email = clean(body.email, 200);
  const phone = clean(body.phone, 40);
  if (!name) return reply({ ok: false, error: "Add your name so we know whose order it is." });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reply({ ok: false, error: "Add an email address so we can send your collection code." });

  const db = adminClient();
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const customerId = bearer.split(".").length === 3
    ? (await db.auth.getUser(bearer).catch(() => null))?.data?.user?.id ?? null
    : null;
  try {
    const payfast = await getPayfast(db, accountOf(brand));
    const key = payfast ? null : await getSecret(db, accountOf(brand), "checkout_key");
    if (!payfast && !key) return reply({ ok: false, error: "Online payments aren't switched on yet. Please order in person or call us." });

    // Release stock held by orders nobody paid for, so it counts as available for this one.
    const expired = await db.rpc("expire_unpaid_orders", { p_minutes: UNPAID_MINUTES });
    if (expired.error) console.error(JSON.stringify({ outcome: "couldn't expire unpaid orders", reason: expired.error.message }));

    const requested: RequestedLine[] = body.lines;
    if (!Array.isArray(requested)) throw new OrderError("Add something to your order first.");
    const ids = (kind: string) => [...new Set(requested.filter((l) => l?.kind === kind).map((l) => String(l.itemId)))];
    const uuid = /^[0-9a-f-]{36}$/i;
    if (requested.some((l) => !uuid.test(String(l?.itemId)))) throw new OrderError("Please refresh the page and add your items again.");
    const [menu, shop] = await Promise.all([
      db.from("menu_items").select("*").in("brand", brands).in("id", ids("menu")),
      db.from("shop_items").select("*").in("brand", brands).in("id", ids("shop")),
    ]);
    if (menu.error || shop.error) throw new Error("Couldn't read the menu.");
    const { lines, totalCents } = priceOrder(requested, menu.data, shop.data, pageBrand);
    const minCents = payfast ? PAYFAST_MIN_CENTS : YOCO_MIN_CENTS;
    if (totalCents < minCents) throw new OrderError(`Online orders need to be at least R${minCents / 100}.`);

    // A test setup can return to a local copy of the site, so checkout can be tried before it's published.
    const isTest = payfast ? payfast.mode === "sandbox" : key!.startsWith("sk_test");
    const base = isTest && LOCAL.test(String(body.returnBase)) ? body.returnBase : siteUrl(brands.length > 1 ? "both" : brand);
    const accessToken = randomHex(32);
    const { data: order, error } = await db.from("orders").insert({
      brand,
      brands,
      access_token: accessToken,
      collection_code: randomCode(),
      customer_name: name,
      customer_email: email,
      customer_phone: phone || null,
      collect_from: clean(body.collectFrom, 200) || null,
      total: totalCents / 100,
      customer_id: customerId,
      payment_provider: payfast ? "payfast" : "yoco",
      payment_mode: isTest ? "test" : "live",
    }).select("id, number").single();
    if (error) throw new Error("Couldn't save your order.");
    const saved = await db.from("order_lines").insert(lines.map((l) => ({ ...l, order_id: order.id })));
    if (saved.error) {
      await db.from("orders").delete().eq("id", order.id);
      throw new Error("Couldn't save your order.");
    }

    // Before going to payment: take the counted shop items off the shelf, all or nothing. If someone else got there
    // first, the order is dropped and the customer is told what's left.
    const held = await db.rpc("reserve_order_stock", { p_order_id: order.id });
    if (held.error) {
      await db.from("orders").delete().eq("id", order.id);
      if (held.error.hint === "out_of_stock") throw new OrderError(held.error.message);
      throw new Error("Couldn't reserve stock: " + held.error.message);
    }

    try {
      const link = orderLink(accessToken, base);
      if (payfast) {
        const { first, last } = splitName(name);
        const url = checkoutUrl(payfast.mode, signedCheckoutQuery({
          merchant_id: payfast.merchantId,
          merchant_key: payfast.merchantKey,
          return_url: link,
          cancel_url: `${link}&paid=cancelled`,
          notify_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/payfast-notify`,
          name_first: first.slice(0, 100),
          name_last: last.slice(0, 100),
          email_address: email.slice(0, 100),
          m_payment_id: order.id,
          amount: (totalCents / 100).toFixed(2),
          item_name: `${shopName({ brand, brands })} order #${order.number}`.slice(0, 100),
          item_description: lines.map((l) => `${l.qty} × ${l.name}`).join(", ").slice(0, 255),
        }, payfast.passphrase));
        await db.from("orders").update({ checkout_url: url }).eq("id", order.id);
        return reply({ ok: true, redirectUrl: url });
      }
      const checkout = await checkoutFetch(key!, "/checkouts", {
        method: "POST",
        headers: { "Idempotency-Key": order.id },
        body: JSON.stringify({
          amount: totalCents,
          currency: "ZAR",
          successUrl: link,
          cancelUrl: `${link}&paid=cancelled`,
          failureUrl: `${link}&paid=failed`,
          externalId: order.id,
          metadata: { orderId: order.id, orderNumber: order.number },
          lineItems: lines.map((l) => ({
            displayName: l.name.slice(0, 200),
            quantity: l.qty,
            pricingDetails: { price: Math.round(l.unit_price * 100) },
          })),
        }),
      });
      await db.from("orders").update({
        checkout_id: checkout.id,
        checkout_url: checkout.redirectUrl,
        payment_mode: checkout.processingMode === "live" ? "live" : "test",
      }).eq("id", order.id);
      return reply({ ok: true, redirectUrl: checkout.redirectUrl });
    } catch (e) {
      await db.from("orders").update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancel_reason: "unpaid" }).eq("id", order.id);
      await db.rpc("return_order_stock", { p_order_id: order.id });
      console.error(JSON.stringify({ order: order.id, reason: (e as Error).message }));
      return reply({ ok: false, error: "We couldn't start your payment. You haven't been charged. Please try again." });
    }
  } catch (e) {
    if (e instanceof OrderError) return reply({ ok: false, error: e.message });
    console.error(JSON.stringify({ reason: (e as Error).message }));
    return reply({ ok: false, error: "Something went wrong. You haven't been charged. Please try again." });
  }
});
