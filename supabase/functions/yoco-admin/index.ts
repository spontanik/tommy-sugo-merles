// Called by the Settings tab in /admin. Signed-in admins only. Credentials can be saved here but are never returned.
// Deploy with verify_jwt off: the caller's session is checked below.
import {
  adminClient,
  BRANDS,
  fullSync,
  getApiKey,
  getSecret,
  listLocations,
  listLocationsIfAllowed,
  setSecret,
  yocoJson,
} from "../_shared/yoco.ts";
import { checkoutFetch, sendEmail } from "../_shared/orders.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const reply = (body: object, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const ITEM_EVENTS = ["item.created", "item.updated", "item.deleted"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply({ ok: false, error: "Use POST." }, 405);

  const db = adminClient();

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth, error: authError } = token ? await db.auth.getUser(token) : { data: null, error: true };
  if (authError || !auth?.user) return reply({ ok: false, error: "Please sign in again." }, 401);
  const { data: admin } = await db.from("admins").select("user_id").eq("user_id", auth.user.id).maybeSingle();
  if (!admin) return reply({ ok: false, error: "This account isn't an admin." }, 403);

  const body = await req.json().catch(() => ({}));
  const { action, brand } = body;
  if (!BRANDS.includes(brand)) return reply({ ok: false, error: "This brand isn't connected to Yoco yet." }, 400);

  const updateConnection = async (changes: object) => {
    const { error } = await db.from("yoco_connections").update(changes).eq("brand", brand);
    if (error) throw new Error("Couldn't save the connection details.");
  };

  const removeWebhook = async (key: string | null, subscriptionId: string | null) => {
    if (key && subscriptionId) {
      // Best effort: the subscription may already be gone, or belong to the key being replaced.
      await yocoJson(key, `/v1/webhooks/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: "DELETE" })
        .catch(() => null);
    }
    await setSecret(db, brand, "webhook_secret", null);
    await updateConnection({ webhook_subscription_id: null });
  };

  const removePaymentWebhook = async () => {
    const key = await getSecret(db, brand, "checkout_key");
    const { data: current } = await db.from("yoco_connections").select("checkout_webhook_id").eq("brand", brand).single();
    if (key && current?.checkout_webhook_id) {
      // Best effort: it may already be gone.
      await checkoutFetch(key, `/webhooks/${encodeURIComponent(current.checkout_webhook_id)}`, { method: "DELETE" }).catch(() => null);
    }
  };

  // One location is chosen automatically; with several, someone picks in Settings.
  const describe = async () => {
    const { data: connection, error } = await db.from("yoco_connections").select("*").eq("brand", brand).single();
    if (error) throw new Error("Couldn't read the connection details.");
    const { key, source } = await getApiKey(db, brand);
    let locations: { id: string; name: string }[] = [];
    let keyError: string | null = null;
    if (key) {
      try {
        locations = (await listLocationsIfAllowed(key)).locations
          .map((l: { id: string; name: string }) => ({ id: l.id, name: l.name }));
        if (!connection.location_id && locations.length === 1) {
          await updateConnection({ location_id: locations[0].id, location_name: locations[0].name });
          connection.location_id = locations[0].id;
          connection.location_name = locations[0].name;
        }
      } catch (e) {
        keyError = (e as Error).message;
      }
    }
    return { ok: true, connection, keySource: source, keyError, locations };
  };

  try {
    switch (action) {
      case "status":
        return reply(await describe());

      case "save_key": {
        const newKey = String(body.api_key ?? "").trim();
        if (!newKey) return reply({ ok: false, error: "Paste the API key first." });
        await yocoJson(newKey, "/v1/items/?limit=1"); // proves the key can read the catalogue before it's saved
        const { locations } = await listLocationsIfAllowed(newKey);
        const { key: oldKey } = await getApiKey(db, brand);
        const { data: current } = await db.from("yoco_connections")
          .select("location_id, webhook_subscription_id").eq("brand", brand).single();
        if (oldKey !== newKey) await removeWebhook(oldKey, current?.webhook_subscription_id ?? null);
        await setSecret(db, brand, "api_key", newKey);
        const stillThere = locations.some((l: { id: string }) => l.id === current?.location_id);
        await updateConnection({
          api_key_hint: newKey.slice(-4),
          ...(stillThere ? {} : { location_id: null, location_name: null }),
        });
        return reply(await describe());
      }

      case "remove_key": {
        const { key } = await getApiKey(db, brand);
        const { data: current } = await db.from("yoco_connections")
          .select("webhook_subscription_id").eq("brand", brand).single();
        await removeWebhook(key, current?.webhook_subscription_id ?? null);
        await setSecret(db, brand, "api_key", null);
        await updateConnection({ api_key_hint: null });
        return reply(await describe());
      }

      case "set_location": {
        const { key } = await getApiKey(db, brand);
        if (!key) return reply({ ok: false, error: "Add a Yoco API key first." });
        const location = (await listLocations(key)).find((l: { id: string }) => l.id === body.location_id);
        if (!location) return reply({ ok: false, error: "That location isn't on this Yoco account." });
        await updateConnection({ location_id: location.id, location_name: location.name });
        return reply(await describe());
      }

      case "sync": {
        const { key } = await getApiKey(db, brand);
        if (!key) return reply({ ok: false, error: "Add a Yoco API key first." });
        try {
          const result = await fullSync(db, brand, key);
          const { refused } = await listLocationsIfAllowed(key);
          await updateConnection({
            last_sync_at: new Date().toISOString(),
            last_sync_ok: true,
            last_sync_message: `${result.items} items read from Yoco.` +
              (refused ? " Yoco refused the location list, so default prices were used." : ""),
          });
          return reply({ ok: true, ...result });
        } catch (e) {
          await updateConnection({
            last_sync_at: new Date().toISOString(),
            last_sync_ok: false,
            last_sync_message: (e as Error).message,
          });
          throw e;
        }
      }

      case "connect_webhook": {
        const { key } = await getApiKey(db, brand);
        if (!key) return reply({ ok: false, error: "Add a Yoco API key first." });
        const { data: current } = await db.from("yoco_connections")
          .select("webhook_subscription_id").eq("brand", brand).single();
        await removeWebhook(key, current?.webhook_subscription_id ?? null);
        const subscription = await yocoJson(key, "/v1/webhooks/subscriptions/", {
          method: "POST",
          body: JSON.stringify({
            name: `Website catalogue sync (${brand})`,
            event_types: ITEM_EVENTS,
            notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/yoco-webhook?brand=${brand}`,
          }),
        });
        // Yoco only shows this secret once.
        await setSecret(db, brand, "webhook_secret", subscription.secret);
        await updateConnection({ webhook_subscription_id: subscription.id });
        return reply(await describe());
      }

      case "disconnect_webhook": {
        const { key } = await getApiKey(db, brand);
        const { data: current } = await db.from("yoco_connections")
          .select("webhook_subscription_id").eq("brand", brand).single();
        await removeWebhook(key, current?.webhook_subscription_id ?? null);
        return reply(await describe());
      }

      case "save_checkout_key": {
        const newKey = String(body.checkout_key ?? "").trim();
        const mode = newKey.startsWith("sk_live") ? "live" : newKey.startsWith("sk_test") ? "test" : null;
        if (!mode) return reply({ ok: false, error: "Paste the secret key, which starts with sk_test or sk_live." });
        await removePaymentWebhook();
        // Registering the webhook also proves the key works. Yoco only shows this secret once.
        const webhook = await checkoutFetch(newKey, "/webhooks", {
          method: "POST",
          body: JSON.stringify({
            name: `Website orders (${brand})`,
            url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/yoco-payment-webhook?brand=${brand}`,
          }),
        });
        await setSecret(db, brand, "checkout_key", newKey);
        await setSecret(db, brand, "checkout_webhook_secret", webhook.secret);
        await updateConnection({ checkout_key_hint: newKey.slice(-4), checkout_mode: mode, checkout_webhook_id: webhook.id });
        return reply(await describe());
      }

      case "remove_checkout_key": {
        await removePaymentWebhook();
        await setSecret(db, brand, "checkout_key", null);
        await setSecret(db, brand, "checkout_webhook_secret", null);
        await updateConnection({ checkout_key_hint: null, checkout_mode: null, checkout_webhook_id: null });
        return reply(await describe());
      }

      case "save_email": {
        const from = String(body.email_from ?? "").trim();
        if (!/^[^<>]*<?[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+>?$/.test(from)) {
          return reply({ ok: false, error: "Add a sending address, like orders@yourdomain.co.za." });
        }
        const newKey = String(body.email_key ?? "").trim();
        if (newKey) await setSecret(db, brand, "email_key", newKey);
        await updateConnection({ email_from: from, ...(newKey ? { email_key_hint: newKey.slice(-4) } : {}) });
        return reply(await describe());
      }

      case "test_email": {
        await sendEmail(db, brand, {
          to: auth.user.email!,
          subject: "Test email from your website's orders",
          text: "Order emails are working.",
          html: "<p>Order emails are working.</p>",
        });
        return reply({ ...(await describe()), sentTo: auth.user.email });
      }

      default:
        return reply({ ok: false, error: "Unknown action." }, 400);
    }
  } catch (e) {
    return reply({ ok: false, error: (e as Error).message });
  }
});
