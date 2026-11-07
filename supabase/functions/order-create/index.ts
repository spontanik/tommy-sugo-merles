// Called by the checkout on a brand page. Public, so nothing from the request is trusted: prices come from the database.
// Deploy with verify_jwt off. Saves the order as awaiting payment and returns Yoco's payment page.
// A signed-in customer sends their session as the Authorization bearer, and the order is linked to their account.
// Without one (or if it has run out) the order is placed without an account, as before.
import { adminClient, BRANDS, getSecret } from "../_shared/yoco.ts";
import { OrderError, priceOrder, type RequestedLine } from "../_shared/order-pricing.ts";
import { checkoutFetch, CORS, orderLink, reply, SITE_URL } from "../_shared/orders.ts";

const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;
const MIN_CENTS = 200; // Yoco doesn't accept less
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
  const brand = body.brand;
  if (!BRANDS.includes(brand)) return reply({ ok: false, error: "Online ordering isn't available here yet." });

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
    const key = await getSecret(db, brand, "checkout_key");
    if (!key) return reply({ ok: false, error: "Online payments aren't switched on yet. Please order in person or call us." });

    const requested: RequestedLine[] = body.lines;
    if (!Array.isArray(requested)) throw new OrderError("Add something to your order first.");
    const ids = (kind: string) => [...new Set(requested.filter((l) => l?.kind === kind).map((l) => String(l.itemId)))];
    const uuid = /^[0-9a-f-]{36}$/i;
    if (requested.some((l) => !uuid.test(String(l?.itemId)))) throw new OrderError("Please refresh the page and add your items again.");
    const [menu, shop] = await Promise.all([
      db.from("menu_items").select("*").eq("brand", brand).in("id", ids("menu")),
      db.from("shop_items").select("*").eq("brand", brand).in("id", ids("shop")),
    ]);
    if (menu.error || shop.error) throw new Error("Couldn't read the menu.");
    const { lines, totalCents } = priceOrder(requested, menu.data, shop.data);
    if (totalCents < MIN_CENTS) throw new OrderError("Online orders need to be at least R2.");

    // A test key can return to a local copy of the site, so checkout can be tried before it's published.
    const isTest = key.startsWith("sk_test");
    const base = isTest && LOCAL.test(String(body.returnBase)) ? body.returnBase : SITE_URL;
    const accessToken = randomHex(32);
    const { data: order, error } = await db.from("orders").insert({
      brand,
      access_token: accessToken,
      collection_code: randomCode(),
      customer_name: name,
      customer_email: email,
      customer_phone: phone || null,
      collect_from: clean(body.collectFrom, 200) || null,
      total: totalCents / 100,
      customer_id: customerId,
    }).select("id, number").single();
    if (error) throw new Error("Couldn't save your order.");
    const saved = await db.from("order_lines").insert(lines.map((l) => ({ ...l, order_id: order.id })));
    if (saved.error) throw new Error("Couldn't save your order.");

    try {
      const link = orderLink(accessToken, base);
      const checkout = await checkoutFetch(key, "/checkouts", {
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
      await db.from("orders").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", order.id);
      console.error(JSON.stringify({ order: order.id, reason: (e as Error).message }));
      return reply({ ok: false, error: "We couldn't start your payment. You haven't been charged. Please try again." });
    }
  } catch (e) {
    if (e instanceof OrderError) return reply({ ok: false, error: e.message });
    console.error(JSON.stringify({ reason: (e as Error).message }));
    return reply({ ok: false, error: "Something went wrong. You haven't been charged. Please try again." });
  }
});
