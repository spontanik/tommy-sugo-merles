// Receives Lightspeed K-Series notifications about the orders the website sent. Public by necessity (deploy with
// verify_jwt off). Lightspeed signs in with the username and password we gave it when the webhook was registered
// (lightspeed-admin keeps the password in Vault), so nothing is believed without them.
import { adminClient, getSecret } from "../_shared/yoco.ts";
import { LIGHTSPEED_ACCOUNT } from "../_shared/lightspeed.ts";
import { readOrderNotification, WEBHOOK_USER } from "../_shared/lightspeed-order.ts";

const ok = () => new Response("ok");

function sameText(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Use POST.", { status: 405 });
  const db = adminClient();

  const password = await getSecret(db, LIGHTSPEED_ACCOUNT, "lightspeed_webhook_secret").catch(() => null);
  const given = (req.headers.get("Authorization") ?? "").replace(/^Basic\s+/i, "");
  let decoded = "";
  try { decoded = atob(given); } catch { decoded = ""; }
  if (!password || !sameText(decoded, `${WEBHOOK_USER}:${password}`)) {
    console.warn(JSON.stringify({ lightspeed: "webhook refused", reason: password ? "wrong credentials" : "no webhook password saved" }));
    return new Response("Unauthorised.", { status: 401 });
  }

  // deno-lint-ignore no-explicit-any
  const body: any = await req.json().catch(() => null);
  const log = (outcome: string, extra: object = {}) =>
    console.log(JSON.stringify({ lightspeed: body?.type ?? "?", status: body?.status, reference: body?.thirdPartyReference, outcome, ...extra }));
  if (!body) {
    log("not JSON");
    return ok();
  }
  if (String(body.type ?? "").toUpperCase() !== "ORDER") {
    // Payment and readiness notifications are only logged for now.
    log("noted");
    return ok();
  }

  const effect = readOrderNotification(body);
  if (!effect) {
    log("ignored");
    return ok();
  }
  try {
    // Orders from the hidden test shop only record what Lightspeed said.
    if (body.thirdPartyReference.startsWith("test-")) {
      const { data: test, error } = await db.from("lightspeed_test_orders").update({
        lightspeed_status: effect.lightspeedStatus,
        lightspeed_error: effect.error,
        lightspeed_account: body.ikentooAccountIdentifier ?? body.account?.ikaccountId ?? null,
        updated_at: new Date().toISOString(),
      }).eq("reference", body.thirdPartyReference).select("id").maybeSingle();
      if (error) throw new Error("Couldn't update the test order.");
      log(test ? "applied to test order" : "no matching test order");
      return ok();
    }
    const { data: order, error } = await db.from("orders").select("id, status")
      .eq("lightspeed_reference", body.thirdPartyReference).maybeSingle();
    if (error) throw new Error("Couldn't read the order.");
    if (!order) {
      log("no matching order");
      return ok();
    }
    const { error: updateError } = await db.from("orders")
      .update({ lightspeed_status: effect.lightspeedStatus, lightspeed_error: effect.error }).eq("id", order.id);
    if (updateError) throw new Error("Couldn't update the order.");
    if (effect.status) {
      // Only moves forward, and only from where it can: staff may already have moved it on the Orders screen.
      await db.from("orders").update({ status: effect.status.to, [effect.status.at]: new Date().toISOString() })
        .eq("id", order.id).in("status", effect.status.from);
    }
    log("applied", { order: order.id });
    return ok();
  } catch (e) {
    // A non-2xx response makes Lightspeed send it again.
    log("failed", { reason: (e as Error).message });
    return new Response("Processing failed.", { status: 500 });
  }
});
