// Called by the hidden test shop (admin/test-shop.html). Signed-in admins only (deploy with verify_jwt off: the session
// is checked below). It builds the shop's menu from Lightspeed's own online-ordering menu, and sends orders straight to
// the Lightspeed location saved in Settings, marked paid with the saved payment method. No money changes hands, and
// nothing here touches the real menus, orders, stock or emails. It refuses to run while Settings are on Live, so a test
// order can never reach the kitchen.
import { adminClient } from "../_shared/yoco.ts";
import { CORS, reply } from "../_shared/orders.ts";
import { getLightspeed, LightspeedError, lightspeedFetch, type LightspeedSetup } from "../_shared/lightspeed.ts";
import { DELIVER_WITHIN_MS, ENDPOINT_ID, readReadiness, toE164 } from "../_shared/lightspeed-order.ts";
import { type CartLine, CartError, parseMenu, priceCart } from "../_shared/lightspeed-menu.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.95.0";

// deno-lint-ignore no-explicit-any
type Row = any;

const clean = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

async function menus(db: SupabaseClient, setup: LightspeedSetup) {
  const list = await lightspeedFetch(db, setup.token, "GET", `/o/op/1/menu/list?businessLocationId=${setup.locationId}`);
  return (Array.isArray(list) ? list : []).map((m: Row) => ({ id: String(m.ikentooMenuId), name: String(m.menuName ?? m.ikentooMenuId) }));
}

async function loadMenu(db: SupabaseClient, setup: LightspeedSetup, menuId: string) {
  const params = new URLSearchParams({ businessLocationId: String(setup.locationId) });
  if (setup.orderProfile) params.set("accountProfile", setup.orderProfile);
  return parseMenu(await lightspeedFetch(db, setup.token, "GET", `/o/op/2/menu/load/${menuId}?${params}`));
}

// Whether a POS can take orders at the location right now. A failure here only means it couldn't be checked.
async function readiness(db: SupabaseClient, setup: LightspeedSetup) {
  try {
    return readReadiness(await lightspeedFetch(db, setup.token, "GET", `/o/op/1/onlineOrderReadiness?businessLocationId=${setup.locationId}`));
  } catch (e) {
    return { ready: false, problems: [`Couldn't check with Lightspeed: ${(e as Error).message}`], updatedAt: null };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply({ ok: false, error: "Use POST." }, 405);

  const db = adminClient();
  const session = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth, error: authError } = session ? await db.auth.getUser(session) : { data: null, error: true };
  if (authError || !auth?.user) return reply({ ok: false, error: "Please sign in again." }, 401);
  const { data: admin } = await db.from("admins").select("user_id").eq("user_id", auth.user.id).maybeSingle();
  if (!admin) return reply({ ok: false, error: "This account isn't an admin." }, 403);

  const body = await req.json().catch(() => ({}));
  try {
    if (body.action === "orders") {
      const { data, error } = await db.from("lightspeed_test_orders")
        .select("id, number, created_at, customer_name, lines, total, reference, lightspeed_status, lightspeed_error")
        .order("created_at", { ascending: false }).limit(20);
      if (error) throw new Error("Couldn't read the test orders.");
      return reply({ ok: true, orders: data });
    }

    const setup = await getLightspeed(db);
    if (!setup) return reply({ ok: false, error: "Lightspeed isn't set up yet.", needsSetup: true });
    const about = { location: setup.locationId, paymentMethod: setup.paymentMethod, orderProfile: setup.orderProfile, mode: setup.mode };
    if (setup.mode === "live") {
      return reply({ ok: false, error: "Lightspeed is on Live in Settings, so the test shop is switched off: its orders would reach the kitchen.", setup: about });
    }

    switch (body.action) {
      case "menu": {
        const [list, pos] = await Promise.all([menus(db, setup), readiness(db, setup)]);
        if (!list.length) return reply({ ok: true, setup: about, readiness: pos, menus: [], menu: null });
        const menuId = list.some((m: Row) => m.id === String(body.menuId)) ? String(body.menuId) : list[0].id;
        return reply({ ok: true, setup: about, readiness: pos, menus: list, menuId, menu: await loadMenu(db, setup, menuId) });
      }

      case "readiness":
        return reply({ ok: true, readiness: await readiness(db, setup) });

      case "place": {
        const name = clean(body.name, 80);
        if (!name) return reply({ ok: false, error: "Add a name for the order." });
        const menuId = String(body.menuId ?? "");
        if (!/^\d{1,20}$/.test(menuId)) return reply({ ok: false, error: "Reload the menu first." });
        // Priced again from Lightspeed's menu, not from the page.
        const { lines, total } = priceCart(await loadMenu(db, setup, menuId), body.cart as CartLine[]);
        const reference = "test-" + crypto.randomUUID().slice(0, 8);
        const phone = clean(body.phone, 30) || null;
        const { data: saved, error } = await db.from("lightspeed_test_orders").insert({
          created_by: auth.user.id,
          customer_name: name,
          customer_phone: phone,
          lines: lines.map((l) => l.summary),
          total,
          reference,
        }).select("id, number").single();
        if (error) throw new Error("Couldn't save the test order.");

        const parts = name.split(/\s+/);
        const e164 = toE164(phone);
        const order = {
          businessLocationId: setup.locationId,
          thirdPartyReference: reference,
          endpointId: ENDPOINT_ID,
          customerInfo: {
            firstName: parts[0].slice(0, 50),
            ...(parts.length > 1 ? { lastName: parts.slice(1).join(" ").slice(0, 50) } : {}),
            ...(e164 ? { contactNumberAsE164: e164 } : {}),
          },
          ...(setup.orderProfile ? { accountProfileCode: setup.orderProfile } : {}),
          orderNote: `TEST SHOP order #${saved.number}: not a real order`,
          maxTimeToAttemptOrderDeliverToPos: DELIVER_WITHIN_MS,
          items: lines.map((l) => l.order),
          ...(setup.paymentMethod ? { payment: { paymentMethod: setup.paymentMethod, paymentAmount: total } } : {}),
        };
        try {
          await lightspeedFetch(db, setup.token, "POST", "/o/op/1/order/toGo", order);
          await db.from("lightspeed_test_orders").update({ lightspeed_status: "sent", updated_at: new Date().toISOString() }).eq("id", saved.id);
          return reply({ ok: true, number: saved.number, total, reference });
        } catch (e) {
          const message = (e as Error).message;
          await db.from("lightspeed_test_orders").update({ lightspeed_status: "failed", lightspeed_error: message, updated_at: new Date().toISOString() })
            .eq("id", saved.id);
          return reply({ ok: false, error: message, number: saved.number });
        }
      }

      default:
        return reply({ ok: false, error: "Unknown action." }, 400);
    }
  } catch (e) {
    const message = e instanceof CartError || e instanceof LightspeedError || e instanceof Error ? e.message : "Something went wrong.";
    return reply({ ok: false, error: message });
  }
});
