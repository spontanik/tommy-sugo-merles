// Receives payment results from Yoco Checkout. Public by necessity (deploy with verify_jwt off), so every request must
// carry a valid signature. This, not the customer's return to the site, is what confirms an order.
import { adminClient, BRANDS, getSecret } from "../_shared/yoco.ts";
import { verifyWebhook } from "../_shared/yoco-catalogue.ts";
import { recordInYoco, sendOrderEmail } from "../_shared/orders.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Use POST.", { status: 405 });
  const brand = new URL(req.url).searchParams.get("brand") ?? "";
  if (!BRANDS.includes(brand)) return new Response("Unknown brand.", { status: 404 });

  const db = adminClient();
  const body = await req.text();
  const secret = await getSecret(db, brand, "checkout_webhook_secret");
  const valid = secret !== null && await verifyWebhook({
    secret,
    id: req.headers.get("webhook-id"),
    timestamp: req.headers.get("webhook-timestamp"),
    signatures: req.headers.get("webhook-signature"),
    body,
    nowSeconds: Math.floor(Date.now() / 1000),
    toleranceSeconds: 180,
  });
  if (!valid) return new Response("Invalid signature.", { status: 403 });

  const event = JSON.parse(body);
  const payment = event.payload ?? {};
  try {
    if (event.type !== "payment.succeeded") return new Response("ok");
    const orderId = payment.metadata?.orderId;
    const checkoutId = payment.metadata?.checkoutId;
    const query = db.from("orders").select("id, brand, total, status").eq("brand", brand);
    const { data: order, error } = await (orderId ? query.eq("id", orderId) : query.eq("checkout_id", checkoutId)).maybeSingle();
    if (error) throw new Error("Couldn't read the order.");
    if (!order) {
      console.warn(JSON.stringify({ event: event.id, outcome: "no matching order" }));
      return new Response("ok");
    }
    if (Math.round(Number(order.total) * 100) !== payment.amount) {
      console.error(JSON.stringify({ event: event.id, order: order.id, outcome: "amount mismatch", paid: payment.amount }));
      return new Response("ok");
    }
    // Only the first delivery of this event moves the order on, so retries can't send a second email or Yoco order.
    const { data: paid, error: updateError } = await db.from("orders").update({
      status: "received",
      paid_at: new Date().toISOString(),
      payment_id: payment.id,
      payment_mode: payment.mode === "live" ? "live" : "test",
    }).eq("id", order.id).eq("status", "pending_payment").select("*").maybeSingle();
    if (updateError) throw new Error("Couldn't update the order.");
    if (paid) {
      await sendOrderEmail(db, paid);
      if (paid.payment_mode === "live") await recordInYoco(db, paid);
    }
    console.log(JSON.stringify({ event: event.id, order: order.id, outcome: paid ? "confirmed" : "already confirmed" }));
    return new Response("ok");
  } catch (e) {
    // A non-2xx response makes Yoco retry later.
    console.error(JSON.stringify({ event: event.id, outcome: "failed", reason: (e as Error).message }));
    return new Response("Processing failed.", { status: 500 });
  }
});
