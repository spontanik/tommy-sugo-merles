// Called by the Xero card in /admin's Settings. Signed-in admins only (deploy with verify_jwt off: the session is checked
// below). Connects the backend to Xero with the business's own Xero app, read-only. The app's secret and the sign-in are
// kept in Vault and never sent back.
import { adminClient, getSecret, setSecret } from "../_shared/yoco.ts";
import { CORS, reply } from "../_shared/orders.ts";
import { authorizeUrl, exchangeCode, listOrganisations, refreshXeroItems, XERO_ACCOUNT, XERO_REDIRECT, XERO_SCOPES } from "../_shared/xero.ts";

const STATE_MINUTES = 15;

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
    const { error } = await db.from("xero_connection").update(changes).eq("id", true);
    if (error) throw new Error("Couldn't save the Xero connection.");
  };
  const connection = async () => {
    const { data, error } = await db.from("xero_connection").select("*").eq("id", true).single();
    if (error) throw new Error("Couldn't read the Xero connection.");
    return data;
  };

  try {
    switch (body.action) {
      case "status": {
        const c = await connection();
        const hasSecret = !!(await getSecret(db, XERO_ACCOUNT, "xero_client_secret"));
        return reply({
          ok: true,
          redirectUri: XERO_REDIRECT,
          scopes: XERO_SCOPES,
          clientId: c.client_id,
          hasSecret,
          tenantName: c.tenant_name,
          connectedAt: c.connected_at,
          refreshedAt: c.refreshed_at,
          lastSyncAt: c.last_sync_at,
          lastSyncOk: c.last_sync_ok,
          lastSyncMessage: c.last_sync_message,
        });
      }

      case "save_app": {
        const clientId = String(body.clientId ?? "").trim();
        const secret = String(body.clientSecret ?? "").trim();
        if (!/^[A-Za-z0-9]{16,64}$/.test(clientId)) return reply({ ok: false, error: "That doesn't look like a Xero client ID." });
        if (secret && !/^[A-Za-z0-9_-]{20,128}$/.test(secret)) return reply({ ok: false, error: "That doesn't look like a Xero client secret." });
        const c = await connection();
        if (!secret && !(await getSecret(db, XERO_ACCOUNT, "xero_client_secret"))) return reply({ ok: false, error: "Add the client secret too." });
        if (secret) await setSecret(db, XERO_ACCOUNT, "xero_client_secret", secret);
        // A different app can't use the old sign-in.
        if (c.client_id && c.client_id !== clientId) {
          await setSecret(db, XERO_ACCOUNT, "xero_refresh_token", null);
          await update({ tenant_id: null, tenant_name: null, connected_at: null, refreshed_at: null, scopes: null });
        }
        await update({ client_id: clientId });
        return reply({ ok: true });
      }

      case "start": {
        // The address to send the admin to. Xero sends them back to the admin page with a code and this state.
        const c = await connection();
        if (!c.client_id || !(await getSecret(db, XERO_ACCOUNT, "xero_client_secret"))) {
          return reply({ ok: false, error: "Save the Xero app's client ID and secret first." });
        }
        const state = Array.from(crypto.getRandomValues(new Uint8Array(24))).map((b) => b.toString(16).padStart(2, "0")).join("");
        await update({ pending_state: state, pending_by: auth.user.id, pending_until: new Date(Date.now() + STATE_MINUTES * 60000).toISOString() });
        return reply({ ok: true, url: authorizeUrl(c.client_id, state) });
      }

      case "finish": {
        const code = String(body.code ?? "");
        const state = String(body.state ?? "");
        const c = await connection();
        if (!state || state !== c.pending_state || c.pending_by !== auth.user.id || !c.pending_until || Date.parse(c.pending_until) < Date.now()) {
          return reply({ ok: false, error: "That Xero sign-in has expired or was started elsewhere. Press Connect Xero again." });
        }
        await update({ pending_state: null, pending_by: null, pending_until: null });
        if (!/^[A-Za-z0-9._~-]{10,2000}$/.test(code)) return reply({ ok: false, error: "Xero didn't send back a sign-in code." });
        const secret = await getSecret(db, XERO_ACCOUNT, "xero_client_secret");
        if (!secret) return reply({ ok: false, error: "Save the Xero app's client secret first." });
        const tokens = await exchangeCode(db, c.client_id, secret, code);
        const orgs = await listOrganisations(db, tokens.access_token);
        if (!orgs.length) return reply({ ok: false, error: "The sign-in didn't include any Xero organisation." });
        // Spontanik's books, if the person can reach more than one organisation.
        const org = orgs.find((o) => /spontanik/i.test(o.tenantName)) ?? orgs[0];
        await setSecret(db, XERO_ACCOUNT, "xero_refresh_token", tokens.refresh_token);
        const now = new Date().toISOString();
        await update({ tenant_id: org.tenantId, tenant_name: org.tenantName, scopes: tokens.scope ?? XERO_SCOPES, connected_at: now, refreshed_at: now });
        // Read the items straight away, so the Menu check has them.
        let items: number | null = null;
        let problem: string | null = null;
        try {
          items = await refreshXeroItems(db);
        } catch (e) {
          problem = (e as Error).message;
        }
        return reply({ ok: true, tenantName: org.tenantName, others: orgs.length - 1, items, problem });
      }

      case "disconnect": {
        await setSecret(db, XERO_ACCOUNT, "xero_refresh_token", null);
        await update({ tenant_id: null, tenant_name: null, connected_at: null, refreshed_at: null, scopes: null, pending_state: null, pending_by: null, pending_until: null });
        return reply({ ok: true });
      }

      default:
        return reply({ ok: false, error: "Unknown action." }, 400);
    }
  } catch (e) {
    return reply({ ok: false, error: (e as Error).message || "Something went wrong." });
  }
});
