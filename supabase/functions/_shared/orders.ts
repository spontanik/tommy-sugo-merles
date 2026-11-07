// Shared by the order functions: what happens once an order is paid, and the Yoco Checkout API.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.95.0";
import { getApiKey, getSecret, yocoJson } from "./yoco.ts";

export const SITE_URL = "https://spontanik.github.io/tommy-sugo-merles";
export const CHECKOUT_API = "https://payments.yoco.com/api";

const BRAND_NAMES: Record<string, string> = { tommy: "Tommy Sugo", merles: "Merle's" };

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export const reply = (body: object, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export const orderLink = (token: string, base = SITE_URL) => `${base}/order.html?t=${token}`;

export async function checkoutFetch(key: string, path: string, init: RequestInit = {}) {
  const res = await fetch(CHECKOUT_API + path, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...init.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.warn(JSON.stringify({ checkout: path, status: res.status, reason: body.reason, message: body.message }));
    throw new Error(res.status === 401 || res.status === 403
      ? "Yoco didn't accept this Checkout key."
      : body.message ?? `Yoco Checkout returned an error (${res.status}).`);
  }
  return body;
}

export async function sendEmail(
  db: SupabaseClient,
  brand: string,
  message: { to: string; subject: string; html: string; text: string },
) {
  const key = await getSecret(db, brand, "email_key");
  const { data: connection } = await db.from("yoco_connections").select("email_from").eq("brand", brand).single();
  if (!key || !connection?.email_from) throw new Error("Order emails aren't set up in Settings yet.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: connection.email_from, ...message }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.warn(JSON.stringify({ email: res.status, name: body.name, message: body.message }));
    throw new Error(body.message ?? `The email service returned an error (${res.status}).`);
  }
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const rand = (value: number | string) => "R" + Number(value).toFixed(2).replace(/\.00$/, "");

// deno-lint-ignore no-explicit-any
type Order = any;

async function linesOf(db: SupabaseClient, orderId: string) {
  const { data, error } = await db.from("order_lines").select("name, qty, unit_price").eq("order_id", orderId).order("position");
  if (error) throw new Error("Couldn't read the order's items.");
  return data as { name: string; qty: number; unit_price: number }[];
}

// Never throws: a failed email shouldn't lose a paid order. The Orders tab shows the problem and can send it again.
export async function sendOrderEmail(db: SupabaseClient, order: Order) {
  try {
    const shop = BRAND_NAMES[order.brand] ?? "";
    const link = orderLink(order.access_token);
    const lines = await linesOf(db, order.id);
    const list = lines.map((l) => `${l.qty} × ${l.name} (${rand(l.qty * l.unit_price)})`);
    await sendEmail(db, order.brand, {
      to: order.customer_email,
      subject: `${shop} order #${order.number}: your collection code is ${order.collection_code}`,
      text: [
        `Thanks ${order.customer_name}, we've got your order.`,
        "",
        `Your collection code: ${order.collection_code}`,
        "You'll need to give us this code when you collect your order.",
        "",
        `Follow your order: ${link}`,
        "",
        ...list,
        `Total paid: ${rand(order.total)}`,
      ].join("\n"),
      html: `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#000;max-width:520px">
<h1 style="font-size:24px;margin:0 0 16px">Thanks ${escapeHtml(order.customer_name)}, we've got your order.</h1>
<p style="margin:0 0 4px">Your collection code</p>
<p style="font-size:40px;font-weight:700;letter-spacing:8px;margin:0 0 4px">${order.collection_code}</p>
<p style="margin:0 0 24px">You'll need to give us this code when you collect your order.</p>
<p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;background:#000;color:#fff;padding:12px 20px;text-decoration:none;font-weight:700">Follow your order</a></p>
<ul style="padding-left:20px;margin:0 0 8px">${list.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>
<p style="font-weight:700;margin:0">Total paid: ${rand(order.total)}</p>
<p style="margin:24px 0 0;color:#555;font-size:14px">${escapeHtml(shop)} order #${order.number}</p>
</div>`,
    });
    await db.from("orders").update({ email_sent_at: new Date().toISOString(), email_error: null }).eq("id", order.id);
  } catch (e) {
    await db.from("orders").update({ email_error: (e as Error).message }).eq("id", order.id);
  }
}

// Records the sale in Yoco. Never throws, for the same reason as the email. The collection code is left out on purpose:
// it would let anyone at the till read it.
export async function recordInYoco(db: SupabaseClient, order: Order) {
  try {
    const { key } = await getApiKey(db, order.brand);
    if (!key) throw new Error("No Yoco API key is saved in Settings.");
    const { data: connection } = await db.from("yoco_connections").select("location_id").eq("brand", order.brand).single();
    const lines = await linesOf(db, order.id);
    const money = (rand: number | string) => ({ amount: Math.round(Number(rand) * 100), currency: "ZAR" });
    const created = await yocoJson(key, "/v1/orders/", {
      method: "POST",
      body: JSON.stringify({
        currency: "ZAR",
        channel: "website",
        external_id: order.id,
        name: `Online #${order.number} · ${order.customer_name}`,
        note: order.customer_phone ? `Phone: ${order.customer_phone}` : undefined,
        location_id: connection?.location_id ?? undefined,
        line_items: lines.map((l) => ({ name: l.name, quantity: String(l.qty), unit_price: money(l.unit_price) })),
        // A test payment took no money, so it isn't recorded as paid.
        payment: order.payment_mode === "live" ? { amount: money(order.total), method: "other", tender: "Website" } : undefined,
      }),
    });
    await db.from("orders").update({ yoco_order_id: created.id, yoco_order_error: null }).eq("id", order.id);
  } catch (e) {
    await db.from("orders").update({ yoco_order_error: (e as Error).message }).eq("id", order.id);
  }
}
