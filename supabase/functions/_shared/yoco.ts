// Shared by the Yoco edge functions: the Supabase admin client, credentials, Yoco requests and the sync itself.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.95.0";
import { catalogueRows } from "./yoco-catalogue.ts";

const YOCO_API = "https://api.yoco.com";
const ITEM_EXPAND = ["category", "location_availability", "price_overrides"];

// Brands with a Yoco connection.
export const BRANDS = ["tommy", "merles"];

// Merle's sells through Tommy Sugo's Yoco account, so it uses Tommy Sugo's key unless it's given one of its own.
// Each brand still keeps its own catalogue copy, item links and webhook subscription.
const SHARES_ACCOUNT_OF: Record<string, string> = { merles: "tommy" };

// A key saved in the admin wins. Otherwise fall back to the edge function secret.
const ENV_KEYS: Record<string, string[]> = {
  tommy: ["YOCO_API_KEY_TOMMY", "YOCO_API_KEY"],
  merles: ["YOCO_API_KEY_MERLES"],
};

export function adminClient(): SupabaseClient {
  const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  const key = secretKeys.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(Deno.env.get("SUPABASE_URL")!, key, { auth: { persistSession: false } });
}

export class YocoError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function getSecret(db: SupabaseClient, brand: string, kind: string): Promise<string | null> {
  const { data, error } = await db.rpc("yoco_secret_get", { p_brand: brand, p_kind: kind });
  if (error) throw new Error("Couldn't read the saved Yoco credentials.");
  return data ?? null;
}

export async function setSecret(db: SupabaseClient, brand: string, kind: string, value: string | null) {
  const { error } = await db.rpc("yoco_secret_set", { p_brand: brand, p_kind: kind, p_value: value });
  if (error) throw new Error("Couldn't save the Yoco credentials.");
}

type KeySource = "admin" | "edge-secret" | "shared";

export async function getApiKey(db: SupabaseClient, brand: string): Promise<{ key: string | null; source: KeySource | null }> {
  const saved = await getSecret(db, brand, "api_key");
  if (saved) return { key: saved, source: "admin" };
  for (const name of ENV_KEYS[brand] ?? []) {
    const value = Deno.env.get(name);
    if (value) return { key: value, source: "edge-secret" };
  }
  const owner = SHARES_ACCOUNT_OF[brand];
  if (owner) {
    const { key } = await getApiKey(db, owner);
    if (key) return { key, source: "shared" };
  }
  return { key: null, source: null };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function yocoFetch(key: string, path: string, init: RequestInit = {}, attempt = 0): Promise<Response> {
  const res = await fetch(YOCO_API + path, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...init.headers },
  });
  if (res.status === 429 && attempt < 3) {
    const seconds = Number(res.headers.get("Retry-After")) || 2;
    await wait(Math.min(seconds, 20) * 1000);
    return yocoFetch(key, path, init, attempt + 1);
  }
  return res;
}

// Says which Yoco area was refused, so a permissions error can be traced. Yoco may name the missing permission in
// `errors`. None of this includes the API key.
function refusedArea(path: string): string {
  if (path.startsWith("/v1/locations")) return "locations";
  if (path.startsWith("/v1/items")) return "catalogue items";
  if (path.startsWith("/v1/webhooks")) return "webhooks";
  return "that";
}

export async function yocoJson(key: string, path: string, init: RequestInit = {}) {
  const res = await yocoFetch(key, path, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const details = (body.errors ?? []).map((e: { detail?: string }) => e.detail).filter(Boolean).join(" ");
    console.warn(JSON.stringify({ yoco: path.split("?")[0], status: res.status, code: body.code, detail: body.detail, errors: body.errors }));
    const reason = res.status === 401
      ? "Yoco didn't accept this API key."
      : res.status === 403
      ? `Yoco refused access to ${refusedArea(path)}. ${details || body.detail || ""}`.trim()
      : (body.detail ?? `Yoco returned an error (${res.status}).`);
    throw new YocoError(res.status, reason);
  }
  return res.status === 204 ? null : res.json();
}

async function listAll(key: string, path: string) {
  const all = [];
  let cursor: string | null = null;
  do {
    const params = new URLSearchParams({ limit: "100" });
    if (path === "/v1/items/") ITEM_EXPAND.forEach((e) => params.append("expand", e));
    if (cursor) params.set("cursor", cursor);
    const page = await yocoJson(key, `${path}?${params}`);
    all.push(...(page.data ?? []));
    cursor = page.next_cursor ?? null;
  } while (cursor);
  return all;
}

export const listLocations = (key: string) => listAll(key, "/v1/locations/");

// Locations only decide which prices to use when an account has several, so a refusal here shouldn't stop the sync:
// it falls back to the catalogue's default prices.
export async function listLocationsIfAllowed(key: string) {
  try {
    return { locations: await listLocations(key), refused: false };
  } catch (e) {
    if (e instanceof YocoError && e.status === 403) return { locations: [], refused: true };
    throw e;
  }
}

async function connectionLocation(db: SupabaseClient, brand: string): Promise<string | null> {
  const { data, error } = await db.from("yoco_connections").select("location_id").eq("brand", brand).single();
  if (error) throw new Error("Couldn't read the Yoco connection.");
  return data.location_id;
}

async function upsertRows(db: SupabaseClient, rows: object[], syncedAt: string) {
  const stamped = rows.map((row) => ({ ...row, is_deleted: false, synced_at: syncedAt }));
  for (let i = 0; i < stamped.length; i += 500) {
    const { error } = await db.from("yoco_catalogue").upsert(stamped.slice(i, i + 500), { onConflict: "brand,yoco_id" });
    if (error) throw new Error("Couldn't save the Yoco catalogue: " + error.message);
  }
}

// Reads the whole catalogue. Anything Yoco no longer lists is marked deleted, but only once every page has been
// read and saved, so a failure part-way through can't take items off the site.
export async function fullSync(db: SupabaseClient, brand: string, key: string) {
  const items = await listAll(key, "/v1/items/");
  const location = await connectionLocation(db, brand);
  const rows = catalogueRows(items, brand, location);
  const { count } = await db.from("yoco_catalogue")
    .select("yoco_id", { count: "exact", head: true })
    .eq("brand", brand).eq("is_deleted", false);
  if (!rows.length && (count ?? 0) > 0) {
    throw new Error("Yoco returned no items, so nothing was changed. Check the API key is for the right account.");
  }
  const syncedAt = new Date().toISOString();
  await upsertRows(db, rows, syncedAt);
  const { error } = await db.from("yoco_catalogue").update({ is_deleted: true })
    .eq("brand", brand).eq("is_deleted", false).lt("synced_at", syncedAt);
  if (error) throw new Error("Couldn't update removed items: " + error.message);
  return { items: items.length, rows: rows.length };
}

// Refreshes one item after a webhook. It always reads the latest from Yoco, so duplicate or out-of-order events
// are harmless.
export async function syncItem(db: SupabaseClient, brand: string, key: string, itemId: string) {
  const syncedAt = new Date().toISOString();
  const params = new URLSearchParams();
  ITEM_EXPAND.forEach((e) => params.append("expand", e));
  const res = await yocoFetch(key, `/v1/items/${encodeURIComponent(itemId)}?${params}`);
  if (res.status === 404) return markItemDeleted(db, brand, itemId, syncedAt);
  if (!res.ok) throw new YocoError(res.status, `Yoco returned an error (${res.status}).`);
  const item = await res.json();
  const location = await connectionLocation(db, brand);
  await upsertRows(db, catalogueRows([item], brand, location), syncedAt);
  await markItemDeleted(db, brand, itemId, syncedAt); // variants removed from the item
}

export async function markItemDeleted(db: SupabaseClient, brand: string, itemId: string, before: string) {
  const { error } = await db.from("yoco_catalogue").update({ is_deleted: true })
    .eq("brand", brand).eq("item_id", itemId).eq("is_deleted", false).lt("synced_at", before);
  if (error) throw new Error("Couldn't update removed items: " + error.message);
}
