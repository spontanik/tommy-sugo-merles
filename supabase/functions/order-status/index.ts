// What the customer's order page shows. Public (deploy with verify_jwt off): the long random token is the only way in,
// and only this order's details come back.
import { adminClient } from "../_shared/yoco.ts";
import { CORS, reply } from "../_shared/orders.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const token = new URL(req.url).searchParams.get("t") ?? "";
  if (!/^[0-9a-f]{64}$/.test(token)) return reply({ ok: false, error: "We can't find that order." }, 404);

  const db = adminClient();
  const { data: order, error } = await db.from("orders")
    .select("id, number, brand, status, collection_code, customer_name, collect_from, total, payment_mode, checkout_url, order_lines(name, qty, unit_price, position)")
    .eq("access_token", token).maybeSingle();
  if (error) return reply({ ok: false, error: "Couldn't load your order. Please try again." }, 500);
  if (!order) return reply({ ok: false, error: "We can't find that order." }, 404);

  const unpaid = order.status === "pending_payment";
  return reply({
    ok: true,
    order: {
      number: order.number,
      brand: order.brand,
      status: order.status,
      name: order.customer_name,
      collectFrom: order.collect_from,
      total: order.total,
      test: order.payment_mode === "test",
      // Only once it's paid, and not after it's over.
      code: unpaid || order.status === "cancelled" ? null : order.collection_code,
      payUrl: unpaid ? order.checkout_url : null,
      lines: [...order.order_lines].sort((a, b) => a.position - b.position)
        .map((l) => ({ name: l.name, qty: l.qty, price: l.qty * Number(l.unit_price) })),
    },
  });
});
