// Called by the Lightspeed card in /admin's Settings. Signed-in admins only (deploy with verify_jwt off: the session
// is checked below). The access token can be saved here but is never sent back.
import { adminClient, getSecret, setSecret } from "../_shared/yoco.ts";
import { CORS, reply } from "../_shared/orders.ts";
import { getLightspeed, LIGHTSPEED_ACCOUNT, LightspeedError, lightspeedFetch } from "../_shared/lightspeed.ts";
import { ENDPOINT_ID, WEBHOOK_USER } from "../_shared/lightspeed-order.ts";
import { findList } from "../_shared/menu-check.ts";

// deno-lint-ignore no-explicit-any
type Row = any;

const randomPassword = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(24))).map((b) => b.toString(16).padStart(2, "0")).join("");

// Lightspeed's lists come back in a few shapes; this finds the array either way.
function listOf(json: Row, ...keys: string[]): Row[] {
  if (Array.isArray(json)) return json;
  for (const key of keys) {
    const found = key.split(".").reduce((v: Row, k) => v?.[k], json);
    if (Array.isArray(found)) return found;
  }
  return [];
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
  const update = async (changes: object) => {
    const { error } = await db.from("yoco_connections").update(changes).eq("brand", LIGHTSPEED_ACCOUNT);
    if (error) throw new Error("Couldn't save the Lightspeed settings.");
  };
  const savedToken = async () => {
    const token = await getSecret(db, LIGHTSPEED_ACCOUNT, "lightspeed_token");
    if (!token) throw new Error("Save the Lightspeed access token first.");
    return token;
  };
  const call = (token: string, method: string, path: string, payload?: unknown) => lightspeedFetch(db, token, method, path, payload);

  try {
    switch (body.action) {
      case "status": {
        const { data: conn, error } = await db.from("yoco_connections").select(
          "lightspeed_location_id, lightspeed_location_name, lightspeed_payment_method, lightspeed_order_profile, lightspeed_mode, lightspeed_token_hint, lightspeed_webhook_at",
        ).eq("brand", LIGHTSPEED_ACCOUNT).single();
        if (error) throw new Error("Couldn't read the Lightspeed settings.");
        // Every website item a customer can order, with its Lightspeed link. An item with more than one size or type
        // needs a link for each; otherwise one link covers it.
        const [menu, shop, links] = await Promise.all([
          db.from("menu_items").select("id, brand, name, is_orderable, is_hidden, yoco_options").eq("is_orderable", true)
            .order("brand").order("sort_order").order("name"),
          db.from("shop_items").select("id, brand, name, cart_name, is_hidden").order("brand").order("sort_order").order("name"),
          db.from("lightspeed_skus").select("kind, item_id, variant_id, sku"),
        ]);
        if (menu.error || shop.error || links.error) throw new Error("Couldn't read the items.");
        const skuOf = (kind: string, id: string, variant: string) =>
          links.data!.find((l) => l.kind === kind && l.item_id === id && l.variant_id === variant)?.sku ?? "";
        const slots: Row[] = [];
        for (const m of menu.data!) {
          const variants: Row[] = m.yoco_options ?? [];
          if (variants.length > 1) {
            for (const v of variants) {
              slots.push({ kind: "menu", item_id: m.id, variant_id: v.id, brand: m.brand, name: `${m.name} · ${v.label ?? "option"}`, hidden: m.is_hidden, sku: skuOf("menu", m.id, v.id) });
            }
          } else {
            slots.push({ kind: "menu", item_id: m.id, variant_id: "", brand: m.brand, name: m.name, hidden: m.is_hidden, sku: skuOf("menu", m.id, "") });
          }
        }
        for (const s of shop.data!) {
          slots.push({ kind: "shop", item_id: s.id, variant_id: "", brand: s.brand, name: s.cart_name || s.name, hidden: s.is_hidden, sku: skuOf("shop", s.id, "") });
        }
        return reply({ ok: true, connection: conn, account: LIGHTSPEED_ACCOUNT, slots });
      }

      case "save_token": {
        const token = String(body.token ?? "").trim();
        if (!/^[A-Za-z0-9._~+/=-]{20,4000}$/.test(token)) return reply({ ok: false, error: "That doesn't look like a Lightspeed access token." });
        // Checked before saving: it must open at least one business.
        const businesses = listOf(await call(token, "GET", "/o/op/data/businesses"));
        if (!businesses.length) return reply({ ok: false, error: "Lightspeed accepted the token, but it doesn't open any business." });
        await setSecret(db, LIGHTSPEED_ACCOUNT, "lightspeed_token", token);
        await update({ lightspeed_token_hint: token.slice(-4) });
        return reply({ ok: true });
      }

      case "options": {
        // What can be chosen: the token's locations and, for the chosen one, its payment methods, order profiles,
        // items and whether it's ready for online orders. Anything Lightspeed refuses is reported, not fatal.
        const token = await savedToken();
        const businesses = listOf(await call(token, "GET", "/o/op/data/businesses"));
        const locations = businesses.flatMap((b: Row) =>
          listOf(b.businessLocations).map((l: Row) => ({ id: String(l.id), name: `${b.name} · ${l.name}` })));
        const location = String(body.location ?? "");
        const out: Row = { ok: true, locations, problems: [] };
        if (/^\d{1,20}$/.test(location)) {
          const tries: [string, string, (j: Row) => Row][] = [
            ["paymentMethods", `/f/finance/${location}/paymentMethods`,
              (j) => listOf(j, "_embedded.paymentMethodList").map((p: Row) => ({ code: p.code, name: p.name }))],
            ["orderProfiles", `/o/op/data/account-profiles?businessLocationId=${location}`,
              (j) => listOf(j, "accountProfileList").map((p: Row) => ({ code: p.code, name: p.name, mode: p.deliveryMode }))],
            ["items", `/items/v1/items?businessLocationId=${location}&amount=1000`,
              (j) => findList(j).filter((i: Row) => i.sku)
                .map((i: Row) => ({ sku: String(i.sku), name: i.name, active: i.active !== false && !i.disabled }))],
            ["readiness", `/o/op/1/onlineOrderReadiness?businessLocationId=${location}`, (j) => j],
          ];
          await Promise.all(tries.map(async ([key, path, read]) => {
            try {
              out[key] = read(await call(token, "GET", path));
            } catch (e) {
              out[key] = null;
              out.problems.push(`${key}: ${(e as Error).message}`);
            }
          }));
        }
        return reply(out);
      }

      case "save_settings": {
        const token = await savedToken();
        const location = String(body.location ?? "");
        if (!/^\d{1,20}$/.test(location)) return reply({ ok: false, error: "Choose the Lightspeed location." });
        const mode = body.mode === "live" ? "live" : "test";
        const clean = (v: unknown) => (typeof v === "string" && /^[A-Za-z0-9 _.-]{1,60}$/.test(v.trim()) ? v.trim() : null);
        // Register (or re-register) where Lightspeed reports on orders, with a fresh password.
        const password = randomPassword();
        const webhook = {
          endpointId: ENDPOINT_ID,
          url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/lightspeed-webhook`,
          withBasicAuth: true,
          username: WEBHOOK_USER,
          password,
          provideAccount: false,
          subscribeTo: [{ resource: "order", name: "DELIVERED" }],
        };
        try {
          await call(token, "PUT", "/o/wh/1/webhook", webhook);
        } catch (e) {
          // Lightspeed won't overwrite a webhook it already has ("EndpointId already used"), so saving a second time
          // removes the old one and registers it again with the new password.
          if (!(e instanceof LightspeedError && e.status === 409)) throw e;
          await call(token, "DELETE", `/o/wh/1/webhook/${ENDPOINT_ID}`);
          await call(token, "PUT", "/o/wh/1/webhook", webhook);
        }
        await setSecret(db, LIGHTSPEED_ACCOUNT, "lightspeed_webhook_secret", password);
        await update({
          lightspeed_location_id: location,
          lightspeed_location_name: String(body.locationName ?? "").slice(0, 120) || null,
          lightspeed_payment_method: clean(body.paymentMethod),
          lightspeed_order_profile: clean(body.orderProfile),
          lightspeed_mode: mode,
          lightspeed_webhook_at: new Date().toISOString(),
        });
        return reply({ ok: true });
      }

      case "save_skus": {
        const rows: Row[] = Array.isArray(body.links) ? body.links.slice(0, 1000) : [];
        const valid = rows.filter((r) => (r.kind === "menu" || r.kind === "shop") && /^[0-9a-f-]{36}$/i.test(String(r.item_id)) &&
          typeof (r.variant_id ?? "") === "string");
        const keep = valid.filter((r) => String(r.sku ?? "").trim()).map((r) => ({
          kind: r.kind, item_id: r.item_id, variant_id: String(r.variant_id ?? ""), sku: String(r.sku).trim().slice(0, 100), updated_at: new Date().toISOString(),
        }));
        const drop = valid.filter((r) => !String(r.sku ?? "").trim());
        if (keep.length) {
          const { error } = await db.from("lightspeed_skus").upsert(keep, { onConflict: "kind,item_id,variant_id" });
          if (error) throw new Error("Couldn't save the item links.");
        }
        for (const r of drop) {
          await db.from("lightspeed_skus").delete().eq("kind", r.kind).eq("item_id", r.item_id).eq("variant_id", String(r.variant_id ?? ""));
        }
        return reply({ ok: true, saved: keep.length, removed: drop.length });
      }

      case "remove": {
        const setup = await getLightspeed(db).catch(() => null);
        const token = setup?.token ?? await getSecret(db, LIGHTSPEED_ACCOUNT, "lightspeed_token");
        if (token) {
          // Best effort: the webhook may already be gone, or the token revoked.
          await call(token, "DELETE", `/o/wh/1/webhook/${ENDPOINT_ID}`).catch(() => null);
        }
        await setSecret(db, LIGHTSPEED_ACCOUNT, "lightspeed_token", null);
        await setSecret(db, LIGHTSPEED_ACCOUNT, "lightspeed_webhook_secret", null);
        await update({
          lightspeed_location_id: null, lightspeed_location_name: null, lightspeed_payment_method: null,
          lightspeed_order_profile: null, lightspeed_mode: null, lightspeed_token_hint: null, lightspeed_webhook_at: null,
        });
        return reply({ ok: true });
      }

      default:
        return reply({ ok: false, error: "Unknown action." }, 400);
    }
  } catch (e) {
    const message = e instanceof LightspeedError || e instanceof Error ? e.message : "Something went wrong.";
    return reply({ ok: false, error: message });
  }
});
