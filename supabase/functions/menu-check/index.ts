// Called by the Menu check in /admin. Signed-in admins only (deploy with verify_jwt off: the session is checked below).
// Compares the product list with Xero, Yoco and Lightspeed by SKU, and fills the product list the first time. It reads
// the other systems and never writes to them.
import { adminClient } from "../_shared/yoco.ts";
import { CORS, reply } from "../_shared/orders.ts";
import { getLightspeed, refreshLightspeedItems } from "../_shared/lightspeed.ts";
import { refreshXeroItems, xeroConnected } from "../_shared/xero.ts";
import { importProducts, menuCheck, type Product, type XeroItem, type YocoRow, type LightspeedItem } from "../_shared/menu-check.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.95.0";

async function all<T>(db: SupabaseClient, table: string, columns: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(columns).range(from, from + 999);
    if (error) throw new Error(`Couldn't read ${table}.`);
    out.push(...(data as T[]));
    if ((data ?? []).length < 1000) return out;
  }
}

const YOCO_COLUMNS = "brand, yoco_id, kind, item_id, sku, name, option_label, category, price, is_available, is_deleted";

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
    switch (body.action) {
      case "check": {
        // With refresh, Xero's and Lightspeed's items are read again first. Yoco keeps its copy up to date by itself.
        const problems: string[] = [];
        const [xeroOn, lightspeed] = await Promise.all([xeroConnected(db), getLightspeed(db).catch(() => null)]);
        if (body.refresh) {
          await Promise.all([
            xeroOn ? refreshXeroItems(db).catch((e) => problems.push("Xero: " + (e as Error).message)) : null,
            lightspeed ? refreshLightspeedItems(db).catch((e) => problems.push("Lightspeed: " + (e as Error).message)) : null,
          ]);
        }
        const [products, xero, yoco, ls, yocoConn, xeroConn] = await Promise.all([
          all<Product>(db, "products", "*"),
          all<XeroItem>(db, "xero_items", "*"),
          all<YocoRow>(db, "yoco_catalogue", YOCO_COLUMNS),
          all<LightspeedItem>(db, "lightspeed_items", "*"),
          db.from("yoco_connections").select("brand, last_sync_at").order("brand"),
          db.from("xero_connection").select("tenant_name, last_sync_at").eq("id", true).single(),
        ]);
        const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
        const sources = { xero: xeroOn && xero.length > 0, yoco: yoco.length > 0, lightspeed: !!lightspeed && ls.length > 0 };
        const result = menuCheck(
          products.map((p) => ({ ...p, price: num(p.price) })),
          xero.map((x) => ({ ...x, sales_price: num(x.sales_price) })),
          yoco.map((y) => ({ ...y, price: num(y.price) })),
          ls.map((l) => ({ ...l, price: num(l.price) })),
          sources,
        );
        const { data: lsCopy } = await db.from("lightspeed_items").select("synced_at").limit(1).maybeSingle();
        return reply({
          ok: true,
          sources,
          about: {
            xero: xeroConn.data?.tenant_name ? { name: xeroConn.data.tenant_name, at: xeroConn.data.last_sync_at } : null,
            yoco: (yocoConn.data ?? []).map((c) => ({ brand: c.brand, at: c.last_sync_at })),
            lightspeed: lightspeed ? { location: lightspeed.locationId, mode: lightspeed.mode, at: lsCopy?.synced_at ?? null, items: ls.length } : null,
          },
          products: products.length,
          problems,
          ...result,
        });
      }

      case "import": {
        // Adds a product for every Xero item on a menu that isn't in the list yet. Existing products are left alone.
        const [xero, yoco, existing] = await Promise.all([
          all<XeroItem>(db, "xero_items", "*"),
          all<YocoRow>(db, "yoco_catalogue", YOCO_COLUMNS),
          all<{ sku: string }>(db, "products", "sku"),
        ]);
        if (!xero.length) return reply({ ok: false, error: "Connect Xero in Settings first, so its items can be read." });
        const have = new Set(existing.map((p) => p.sku));
        const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
        const fresh = importProducts(
          xero.map((x) => ({ ...x, sales_price: num(x.sales_price) })),
          yoco.map((y) => ({ ...y, price: num(y.price) })),
        ).filter((p) => !have.has(p.sku));
        if (fresh.length) {
          const { error } = await db.from("products").insert(fresh);
          if (error) throw new Error("Couldn't add the products: " + error.message);
        }
        return reply({ ok: true, added: fresh.length, kept: have.size });
      }

      default:
        return reply({ ok: false, error: "Unknown action." }, 400);
    }
  } catch (e) {
    return reply({ ok: false, error: (e as Error).message || "Something went wrong." });
  }
});
