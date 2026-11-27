// Talking to Lightspeed Restaurant K-Series: the saved settings, the API (every call logged), and sending a paid
// website order to the kitchen's POS. The order-building rules are in lightspeed-order.ts.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.95.0";
import { getSecret } from "./yoco.ts";
import { accountOf } from "./orders.ts";
import {
  buildToGoOrder,
  type LineForLightspeed,
  MissingSkuError,
  referenceFor,
  type Settings,
  skuKey,
} from "./lightspeed-order.ts";
import { findList, type LightspeedItem, lightspeedItemRow } from "./menu-check.ts";

// Lightspeed's demo businesses run on the production API too, so there is one base URL.
export const LIGHTSPEED_API = "https://api.lsk.lightspeed.app";
// The settings live on the paying account's row, which every brand's orders go through.
export const LIGHTSPEED_ACCOUNT = accountOf("tommy");

export class LightspeedError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}

export type LightspeedSetup = Settings & { token: string; mode: "test" | "live" };

// The saved setup, or null when Lightspeed isn't connected.
export async function getLightspeed(db: SupabaseClient): Promise<LightspeedSetup | null> {
  const { data, error } = await db.from("yoco_connections")
    .select("lightspeed_location_id, lightspeed_payment_method, lightspeed_order_profile, lightspeed_mode")
    .eq("brand", LIGHTSPEED_ACCOUNT).maybeSingle();
  if (error) throw new Error("Couldn't read the Lightspeed settings.");
  if (!data?.lightspeed_location_id) return null;
  const token = await getSecret(db, LIGHTSPEED_ACCOUNT, "lightspeed_token");
  if (!token) return null;
  return {
    token,
    locationId: Number(data.lightspeed_location_id),
    paymentMethod: data.lightspeed_payment_method,
    orderProfile: data.lightspeed_order_profile,
    mode: data.lightspeed_mode,
  };
}

// One API call. Every call is written to lightspeed_api_log (method, path, status, time taken, never the token or
// the body), whatever happens.
export async function lightspeedFetch(
  db: SupabaseClient,
  token: string,
  method: string,
  path: string,
  body?: unknown,
  orderId?: string,
) {
  const started = Date.now();
  let status: number | null = null;
  let failure: string | null = null;
  try {
    const res = await fetch(LIGHTSPEED_API + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    status = res.status;
    const text = await res.text();
    // deno-lint-ignore no-explicit-any
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    if (!res.ok) {
      const detail = json?.message ?? json?.msg ?? json?.error ?? (text ? text.slice(0, 200) : "");
      failure = res.status === 401 || res.status === 403
        ? "Lightspeed didn't accept the access token, or it doesn't cover this."
        : `Lightspeed returned an error (${res.status})${detail ? ": " + detail : ""}.`;
      throw new LightspeedError(failure, res.status);
    }
    return json;
  } catch (e) {
    if (!failure) failure = e instanceof LightspeedError ? e.message : "Couldn't reach Lightspeed: " + (e as Error).message;
    throw e instanceof LightspeedError ? e : new LightspeedError(failure);
  } finally {
    const { error } = await db.from("lightspeed_api_log").insert({
      method,
      path: path.split("?")[0],
      status,
      ms: Date.now() - started,
      order_id: orderId ?? null,
      error: failure,
    });
    if (error) console.error(JSON.stringify({ lightspeed: "couldn't log the call", reason: error.message }));
  }
}

// Copies the saved location's items into lightspeed_items (1000 a page), replacing the last copy. Returns how many, or
// null when Lightspeed isn't set up.
export async function refreshLightspeedItems(db: SupabaseClient): Promise<number | null> {
  const setup = await getLightspeed(db);
  if (!setup) return null;
  const byId = new Map<number, LightspeedItem>();
  for (let offset = 0; offset < 20000; offset += 1000) {
    const page = findList(await lightspeedFetch(db, setup.token, "GET",
      `/items/v1/items?businessLocationId=${setup.locationId}&offset=${offset}&amount=1000`));
    for (const raw of page) {
      const row = lightspeedItemRow(raw);
      if (row) byId.set(row.id, row);
    }
    if (page.length < 1000) break;
  }
  const syncedAt = new Date().toISOString();
  const rows = [...byId.values()].map((r) => ({ ...r, synced_at: syncedAt }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("lightspeed_items").upsert(rows.slice(i, i + 500), { onConflict: "id" });
    if (error) throw new Error("Couldn't save Lightspeed's items: " + error.message);
  }
  const { error } = await db.from("lightspeed_items").delete().lt("synced_at", syncedAt);
  if (error) throw new Error("Couldn't clear Lightspeed's old items: " + error.message);
  return rows.length;
}

async function skusFor(db: SupabaseClient, lines: LineForLightspeed[]) {
  const { data, error } = await db.from("lightspeed_skus").select("kind, item_id, variant_id, sku")
    .in("item_id", [...new Set(lines.map((l) => l.item_id))]);
  if (error) throw new Error("Couldn't read the Lightspeed item links.");
  return new Map((data ?? []).map((r) => [skuKey(r.kind, r.item_id, r.variant_id || null), r.sku as string]));
}

// Sends a paid order to the kitchen's POS as a to-go order. Never throws: a paid order must not be lost because the
// POS link failed. The Orders screen shows what went wrong and can send it again. Lightspeed only says it received the
// order; whether the POS took it arrives later on the lightspeed-webhook function.
// deno-lint-ignore no-explicit-any
export async function sendToLightspeed(db: SupabaseClient, order: any) {
  const fail = async (message: string) => {
    await db.from("orders").update({ lightspeed_status: "failed", lightspeed_error: message }).eq("id", order.id);
    console.error(JSON.stringify({ order: order.id, lightspeed: "not sent", reason: message }));
  };
  try {
    const setup = await getLightspeed(db);
    if (!setup) return; // not connected: nothing to do
    // A test payment took no money, so it only goes to a test (demo) Lightspeed business, never the live kitchen.
    if (setup.mode === "live" && order.payment_mode !== "live") {
      await db.from("orders").update({ lightspeed_status: "skipped", lightspeed_error: null }).eq("id", order.id);
      return;
    }
    const { data: lines, error } = await db.from("order_lines")
      .select("kind, item_id, variant_id, name, qty, unit_price, brand").eq("order_id", order.id).order("position");
    if (error) throw new Error("Couldn't read the order's items.");
    const skus = await skusFor(db, lines as LineForLightspeed[]);
    const attempt = order.lightspeed_reference ? (Number(order.lightspeed_reference.split("-")[2]) || 1) + 1 : 1;
    const reference = referenceFor(order.number, attempt);
    const body = buildToGoOrder(order, lines as LineForLightspeed[], skus, setup, reference, true);
    await db.from("orders").update({ lightspeed_reference: reference }).eq("id", order.id);
    await lightspeedFetch(db, setup.token, "POST", "/o/op/1/order/toGo", body, order.id);
    await db.from("orders").update({
      lightspeed_status: "sent",
      lightspeed_error: null,
      lightspeed_sent_at: new Date().toISOString(),
    }).eq("id", order.id);
  } catch (e) {
    await fail(e instanceof MissingSkuError || e instanceof LightspeedError ? e.message : "Something went wrong: " + (e as Error).message);
  }
}
