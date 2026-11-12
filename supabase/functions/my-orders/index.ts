// The customer's order list on account.html. Public (deploy with verify_jwt off), with two ways in:
//   - "device": no account. The browser sends the order links it has kept (each one's long random token),
//     and gets back a summary of just those orders. A token is already the key to its order page.
//   - "account": a signed-in customer's session as the Authorization bearer. Returns the orders on their account.
//     With `claim`, it first adds orders from this device to the account (only orders that aren't on one yet).
// Neither returns the collection code: that's on each order's own page.
import { adminClient } from "../_shared/yoco.ts";
import { CORS, reply } from "../_shared/orders.ts";

const TOKEN = /^[0-9a-f]{64}$/;
const MAX_TOKENS = 30;
const MAX_ORDERS = 50;
const UNPAID_FOR = 24 * 60 * 60 * 1000; // an unpaid order is only worth showing for a day

const COLUMNS = "number, brand, brands, status, total, payment_mode, created_at, access_token, order_lines(name, qty, position)";

type Row = {
  number: number; brand: string; brands: string[] | null; status: string; total: number; payment_mode: string | null;
  created_at: string; access_token: string; order_lines: { name: string; qty: number; position: number }[];
};

function summary(o: Row) {
  return {
    number: o.number,
    brand: o.brand,
    brands: o.brands?.length ? o.brands : [o.brand],
    status: o.status,
    total: Number(o.total),
    test: o.payment_mode === "test",
    placedAt: o.created_at,
    token: o.access_token,
    lines: [...o.order_lines].sort((a, b) => a.position - b.position).map((l) => ({ name: l.name, qty: l.qty })),
  };
}

const worthShowing = (o: Row) =>
  o.status !== "pending_payment" || Date.now() - Date.parse(o.created_at) < UNPAID_FOR;

function tokensFrom(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(String).filter((t) => TOKEN.test(t)))].slice(0, MAX_TOKENS);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply({ ok: false, error: "Use POST." }, 405);
  const body = await req.json().catch(() => null);
  if (!body) return reply({ ok: false, error: "Something went wrong. Please try again." }, 400);
  const db = adminClient();

  try {
    if (body.action === "device") {
      const tokens = tokensFrom(body.tokens);
      if (!tokens.length) return reply({ ok: true, orders: [] });
      const { data, error } = await db.from("orders").select(COLUMNS).in("access_token", tokens)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return reply({ ok: true, orders: (data as Row[]).filter(worthShowing).map(summary) });
    }

    if (body.action === "account") {
      const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
      const { data: auth } = await db.auth.getUser(bearer).catch(() => ({ data: null }));
      const userId = auth?.user?.id;
      if (!userId) return reply({ ok: false, error: "Please sign in again." }, 401);

      let added = 0;
      const claim = tokensFrom(body.claim);
      if (claim.length) {
        const { data, error } = await db.from("orders").update({ customer_id: userId })
          .in("access_token", claim).is("customer_id", null).select("id");
        if (error) throw error;
        added = data.length;
      }
      const { data, error } = await db.from("orders").select(COLUMNS).eq("customer_id", userId)
        .order("created_at", { ascending: false }).limit(MAX_ORDERS);
      if (error) throw error;
      return reply({ ok: true, added, orders: (data as Row[]).filter(worthShowing).map(summary) });
    }

    return reply({ ok: false, error: "Unknown action." }, 400);
  } catch (e) {
    console.error(JSON.stringify({ reason: (e as Error).message }));
    return reply({ ok: false, error: "Couldn't load your orders. Please try again." }, 500);
  }
});
