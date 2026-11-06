// Receives catalogue changes from Yoco. Public by necessity (deploy with verify_jwt off), so every request must
// carry a valid signature made with the secret Yoco issued for this brand's subscription.
import { adminClient, BRANDS, getApiKey, getSecret, markItemDeleted, syncItem } from "../_shared/yoco.ts";
import { verifyWebhook } from "../_shared/yoco-catalogue.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Use POST.", { status: 405 });

  const brand = new URL(req.url).searchParams.get("brand") ?? "";
  if (!BRANDS.includes(brand)) return new Response("Unknown brand.", { status: 404 });

  const db = adminClient();
  const body = await req.text();
  const secret = await getSecret(db, brand, "webhook_secret");
  const valid = secret !== null && await verifyWebhook({
    secret,
    id: req.headers.get("webhook-id"),
    timestamp: req.headers.get("webhook-timestamp"),
    signatures: req.headers.get("webhook-signature"),
    body,
    nowSeconds: Math.floor(Date.now() / 1000),
  });
  if (!valid) return new Response("Invalid signature.", { status: 401 });

  const event = JSON.parse(body);
  const webhookId = req.headers.get("webhook-id");
  try {
    if (event.item_id) {
      if (event.event_type === "item.deleted") {
        await markItemDeleted(db, brand, event.item_id, new Date().toISOString());
      } else if (event.event_type === "item.created" || event.event_type === "item.updated") {
        const { key } = await getApiKey(db, brand);
        if (!key) throw new Error("No Yoco API key.");
        await syncItem(db, brand, key, event.item_id);
      }
    }
    await db.from("yoco_connections").update({ webhook_last_event_at: new Date().toISOString() }).eq("brand", brand);
    console.log(JSON.stringify({ webhookId, brand, event: event.event_type, outcome: "processed" }));
    return new Response("ok");
  } catch (e) {
    // A non-2xx response makes Yoco retry later.
    console.error(JSON.stringify({ webhookId, brand, event: event.event_type, outcome: "failed", reason: (e as Error).message }));
    return new Response("Processing failed.", { status: 500 });
  }
});
