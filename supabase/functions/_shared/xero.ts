// Reading Xero (Spontanik PTY LTD) from the backend: signing in with the business's own Xero app, keeping the sign-in
// alive, and copying Xero's items for the Menu check. Every call is written to xero_api_log. Phase 1 only reads.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.95.0";
import { getSecret, setSecret } from "./yoco.ts";
import { accountOf } from "./orders.ts";
import { type XeroItem, xeroItemRow } from "./menu-check.ts";

// The secrets sit on the paying account's row, like Lightspeed's.
export const XERO_ACCOUNT = accountOf("tommy");
// Where Xero sends the admin back after they allow access. It must be listed exactly like this in the Xero app.
export const XERO_REDIRECT = "https://admin.spontanik.co.za/";
// Read-only: items and accounts. Writing items later needs "accounting.settings" and a new sign-in.
export const XERO_SCOPES = "offline_access accounting.settings.read";

const AUTHORIZE_URL = "https://login.xero.com/identity/connect/authorize";
const TOKEN_URL = "https://identity.xero.com/connect/token";
const CONNECTIONS_URL = "https://api.xero.com/connections";
const API = "https://api.xero.com/api.xro/2.0";

export class XeroError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}

// One call to Xero, logged whatever happens (method, path without its query, status, time; never a token or body).
// deno-lint-ignore no-explicit-any
async function call(db: SupabaseClient, method: string, url: string, init: RequestInit, describe: (status: number, json: any, text: string) => string) {
  const started = Date.now();
  let status: number | null = null;
  let failure: string | null = null;
  try {
    const res = await fetch(url, { ...init, method, signal: AbortSignal.timeout(20000) });
    status = res.status;
    const text = await res.text();
    // deno-lint-ignore no-explicit-any
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    if (!res.ok) {
      failure = describe(res.status, json, text);
      throw new XeroError(failure, res.status);
    }
    return json;
  } catch (e) {
    if (!failure) failure = e instanceof XeroError ? e.message : "Couldn't reach Xero: " + (e as Error).message;
    throw e instanceof XeroError ? e : new XeroError(failure);
  } finally {
    const { error } = await db.from("xero_api_log").insert({
      method,
      path: new URL(url).pathname,
      status,
      ms: Date.now() - started,
      error: failure,
    });
    if (error) console.error(JSON.stringify({ xero: "couldn't log the call", reason: error.message }));
  }
}

export function authorizeUrl(clientId: string, state: string) {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", XERO_REDIRECT);
  url.searchParams.set("scope", XERO_SCOPES);
  url.searchParams.set("state", state);
  return url.toString();
}

type Tokens = { access_token: string; refresh_token: string; scope?: string };

async function tokenRequest(db: SupabaseClient, clientId: string, secret: string, params: Record<string, string>): Promise<Tokens> {
  const json = await call(db, "POST", TOKEN_URL, {
    headers: {
      Authorization: "Basic " + btoa(`${clientId}:${secret}`),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(params).toString(),
  }, (status, json) => {
    const code = String(json?.error ?? "");
    if (code === "invalid_grant") return "The Xero sign-in has lapsed or was revoked. Connect Xero again in Settings.";
    if (code === "invalid_client" || status === 401) return "Xero didn't accept the app's client ID and secret. Check them in Settings.";
    return `Xero refused the sign-in (${status}${code ? ": " + code : ""}).`;
  });
  if (!json?.access_token || !json?.refresh_token) throw new XeroError("Xero's reply had no tokens in it.");
  return json;
}

export const exchangeCode = (db: SupabaseClient, clientId: string, secret: string, code: string) =>
  tokenRequest(db, clientId, secret, { grant_type: "authorization_code", code, redirect_uri: XERO_REDIRECT });

// The organisations the sign-in reached.
export async function listOrganisations(db: SupabaseClient, accessToken: string): Promise<{ tenantId: string; tenantName: string }[]> {
  const json = await call(db, "GET", CONNECTIONS_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  }, (status) => `Xero couldn't list the organisations (${status}).`);
  // deno-lint-ignore no-explicit-any
  return (Array.isArray(json) ? json : []).filter((c: any) => !c.tenantType || c.tenantType === "ORGANISATION")
    // deno-lint-ignore no-explicit-any
    .map((c: any) => ({ tenantId: String(c.tenantId), tenantName: String(c.tenantName ?? "") }));
}

// A fresh access token. Xero's refresh tokens are single use, so the new one is saved straight away.
async function accessToken(db: SupabaseClient) {
  const { data: conn, error } = await db.from("xero_connection").select("client_id, tenant_id").eq("id", true).single();
  if (error) throw new Error("Couldn't read the Xero connection.");
  if (!conn.client_id || !conn.tenant_id) return null;
  const [secret, refresh] = await Promise.all([
    getSecret(db, XERO_ACCOUNT, "xero_client_secret"),
    getSecret(db, XERO_ACCOUNT, "xero_refresh_token"),
  ]);
  if (!secret || !refresh) return null;
  const tokens = await tokenRequest(db, conn.client_id, secret, { grant_type: "refresh_token", refresh_token: refresh });
  await setSecret(db, XERO_ACCOUNT, "xero_refresh_token", tokens.refresh_token);
  await db.from("xero_connection").update({ refreshed_at: new Date().toISOString() }).eq("id", true);
  return { token: tokens.access_token, tenantId: conn.tenant_id as string };
}

// Whether the backend can read Xero at all.
export async function xeroConnected(db: SupabaseClient) {
  const { data } = await db.from("xero_connection").select("client_id, tenant_id").eq("id", true).single();
  return !!(data?.client_id && data?.tenant_id);
}

// Copies every Xero item into xero_items, and removes the ones Xero no longer has. Returns how many, or null when Xero
// isn't connected.
export async function refreshXeroItems(db: SupabaseClient): Promise<number | null> {
  const auth = await accessToken(db);
  if (!auth) return null;
  const finish = (ok: boolean, message: string) =>
    db.from("xero_connection").update({ last_sync_at: new Date().toISOString(), last_sync_ok: ok, last_sync_message: message }).eq("id", true);
  try {
    const json = await call(db, "GET", `${API}/Items`, {
      headers: { Authorization: `Bearer ${auth.token}`, "xero-tenant-id": auth.tenantId, Accept: "application/json" },
    }, (status) => status === 403
      ? "Xero refused access to the items. Connect Xero again in Settings and allow access to settings."
      : `Xero returned an error (${status}) for the items.`);
    const rows = (json?.Items ?? json?.items ?? []).map(xeroItemRow).filter(Boolean) as XeroItem[];
    const syncedAt = new Date().toISOString();
    if (rows.length) {
      const { error } = await db.from("xero_items").upsert(rows.map((r) => ({ ...r, synced_at: syncedAt })), { onConflict: "code" });
      if (error) throw new Error("Couldn't save Xero's items: " + error.message);
      await db.from("xero_items").delete().lt("synced_at", syncedAt);
    }
    await finish(true, `${rows.length} items read from Xero.`);
    return rows.length;
  } catch (e) {
    await finish(false, (e as Error).message);
    throw e;
  }
}
