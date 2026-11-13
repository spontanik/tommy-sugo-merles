// Receives PayFast's payment notifications (ITNs). Public by necessity (deploy with verify_jwt off), so nothing is
// believed until the signature matches, PayFast confirms it sent the notification, and the amount is the order's total.
// This, not the customer's return to the site, is what confirms an order. A paid PayFast order isn't recorded in Yoco:
// Yoco is only for events.
import { adminClient } from "../_shared/yoco.ts";
import { accountOf, getPayfast, sendOrderEmail } from "../_shared/orders.ts";
import { confirmWithPayfast, notificationSignatureValid, parseNotification } from "../_shared/payfast.ts";

const ok = () => new Response("ok");

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Use POST.", { status: 405 });
  const { fields, signature, paramString } = parseNotification(await req.text());
  const orderId = fields.m_payment_id ?? "";
  const log = (outcome: string, extra: object = {}) =>
    console.log(JSON.stringify({ payfast: fields.pf_payment_id, order: orderId, outcome, ...extra }));
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
    log("no order id");
    return ok();
  }

  const db = adminClient();
  try {
    const { data: order, error } = await db.from("orders")
      .select("id, brand, total, status, cancel_reason, payment_provider, payment_id").eq("id", orderId).maybeSingle();
    if (error) throw new Error("Couldn't read the order.");
    if (!order || order.payment_provider !== "payfast") {
      log("no matching order");
      return ok();
    }
    const payfast = await getPayfast(db, accountOf(order.brand));
    if (!payfast) {
      // Retrying won't help until someone saves the PayFast details again.
      log("PayFast isn't set up");
      return ok();
    }
    if (!notificationSignatureValid(paramString, signature, payfast.passphrase)) {
      log("bad signature");
      return new Response("Invalid signature.", { status: 403 });
    }
    if (fields.merchant_id !== payfast.merchantId) {
      log("wrong merchant", { merchant: fields.merchant_id });
      return ok();
    }
    if (!await confirmWithPayfast(payfast.mode, paramString)) {
      log("PayFast didn't confirm it");
      return new Response("Not confirmed.", { status: 403 });
    }
    if (fields.payment_status !== "COMPLETE") {
      log("not complete", { status: fields.payment_status });
      return ok();
    }
    if (Math.round(Number(fields.amount_gross) * 100) !== Math.round(Number(order.total) * 100)) {
      log("amount mismatch", { paid: fields.amount_gross });
      return ok();
    }

    // Only the first notification moves the order on, so a repeat can't send a second email. An order that was
    // released for not being paid in time is taken back: the customer has paid for it.
    const fee = Number(fields.amount_fee);
    const { data: paid, error: updateError } = await db.from("orders").update({
      status: "received",
      paid_at: new Date().toISOString(),
      payment_id: fields.pf_payment_id,
      payment_mode: payfast.mode === "live" ? "live" : "test",
      payment_fee: Number.isFinite(fee) ? Math.abs(fee) : null,
      cancelled_at: null,
      cancel_reason: null,
    }).eq("id", order.id).or("status.eq.pending_payment,and(status.eq.cancelled,cancel_reason.eq.unpaid)")
      .select("*").maybeSingle();
    if (updateError) throw new Error("Couldn't update the order.");

    if (paid) {
      // The stock was reserved when the order was made. This only does anything if that reservation had expired:
      // it takes the items again, as far as there are any (it never goes below 0). Logged, not retried.
      if (order.status === "cancelled") log("paid after its reservation expired");
      const stock = await db.rpc("take_order_stock", { p_order_id: paid.id });
      if (stock.error) log("stock not taken", { reason: stock.error.message });
      await sendOrderEmail(db, paid);
      log("confirmed");
    } else if (order.payment_id === fields.pf_payment_id) {
      log("already confirmed");
    } else {
      // Paid twice, or paid after staff cancelled it: the money needs refunding in PayFast.
      console.error(JSON.stringify({ payfast: fields.pf_payment_id, order: orderId, outcome: "needs refund", status: order.status }));
    }
    return ok();
  } catch (e) {
    // A non-2xx response makes PayFast send it again.
    log("failed", { reason: (e as Error).message });
    return new Response("Processing failed.", { status: 500 });
  }
});
