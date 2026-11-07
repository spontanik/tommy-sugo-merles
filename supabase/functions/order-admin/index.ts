// Called by the Orders tab in /admin. Signed-in admins only (deploy with verify_jwt off: the session is checked below).
// Staff never see a collection code: it's checked here against what the customer gives them.
import { adminClient } from "../_shared/yoco.ts";
import { CORS, recordInYoco, reply, sendOrderEmail } from "../_shared/orders.ts";

const NEXT: Record<string, { from: string; at: string }> = {
  preparing: { from: "received", at: "preparing_at" },
  ready: { from: "preparing", at: "ready_at" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply({ ok: false, error: "Use POST." }, 405);

  const db = adminClient();
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth, error: authError } = token ? await db.auth.getUser(token) : { data: null, error: true };
  if (authError || !auth?.user) return reply({ ok: false, error: "Please sign in again." }, 401);
  const { data: admin } = await db.from("admins").select("user_id").eq("user_id", auth.user.id).maybeSingle();
  if (!admin) return reply({ ok: false, error: "This account isn't an admin." }, 403);

  const body = await req.json().catch(() => ({}));
  const { action, id } = body;
  const { data: order, error } = await db.from("orders").select("*").eq("id", String(id)).maybeSingle();
  if (error || !order) return reply({ ok: false, error: "We can't find that order." });

  // Only moves on if the order is still where the screen thought it was, in case two people are using the screen.
  const move = async (from: string[], changes: object) => {
    const { data, error } = await db.from("orders").update(changes).eq("id", order.id).in("status", from).select("id").maybeSingle();
    if (error) return reply({ ok: false, error: "Couldn't update the order." });
    return reply(data ? { ok: true } : { ok: false, error: "Someone else has just updated this order." });
  };

  switch (action) {
    case "set_status": {
      const step = NEXT[body.status];
      if (!step) return reply({ ok: false, error: "That isn't a step this order can move to." });
      return await move([step.from], { status: body.status, [step.at]: new Date().toISOString() });
    }
    case "collect": {
      if (String(body.code ?? "").trim() !== order.collection_code) {
        return reply({ ok: false, error: "That code doesn't match this order." });
      }
      return await move(["ready"], { status: "collected", collected_at: new Date().toISOString() });
    }
    case "cancel":
      return await move(["pending_payment", "received", "preparing", "ready"], { status: "cancelled", cancelled_at: new Date().toISOString() });
    case "resend_email":
      if (order.status === "pending_payment") return reply({ ok: false, error: "This order hasn't been paid." });
      await sendOrderEmail(db, order);
      return reply({ ok: true });
    case "send_to_yoco":
      if (order.yoco_order_id) return reply({ ok: false, error: "This order is already in Yoco." });
      if (order.status === "pending_payment") return reply({ ok: false, error: "This order hasn't been paid." });
      await recordInYoco(db, order);
      return reply({ ok: true });
    default:
      return reply({ ok: false, error: "Unknown action." }, 400);
  }
});
