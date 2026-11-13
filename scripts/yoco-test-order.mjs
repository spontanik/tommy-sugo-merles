// Sends a test order straight to Yoco's Orders API, without the website, to see whether it reaches the till.
// One Big Lebowski at R0, no payment, at the Dark Kitchen location. Yoco API orders can't link to a catalogue item,
// so the line is just a name, quantity and price.
//
//   YOCO_API_KEY=… node scripts/yoco-test-order.mjs                 # shows what it would send
//   YOCO_API_KEY=… node scripts/yoco-test-order.mjs --send          # sends it
//   YOCO_API_KEY=… node scripts/yoco-test-order.mjs --send --price 125   # same, with the item at R125 (still unpaid)
//   YOCO_API_KEY=… node scripts/yoco-test-order.mjs --send --price 1 --paid Website   # R1, recorded as paid
//   YOCO_API_KEY=… node scripts/yoco-test-order.mjs --fetch <id>    # reads an order back from Yoco
//   YOCO_API_KEY=… node scripts/yoco-test-order.mjs --list          # lists the last two days' orders at Dark Kitchen
//
// The key needs Yoco's business/orders:write permission, as well as read.

const API = "https://api.yoco.com";
const LOCATION_ID = "1cb006e2-3c0a-474d-bac6-7b453121744d"; // Dark Kitchen

import { execFileSync } from "node:child_process";

// Without YOCO_API_KEY, --clipboard reads the key from the Mac clipboard (copy it from Yoco first). It's never printed.
// A pasted key can carry the terminal's paste markers, spaces or a line break, which make the request invalid.
let raw = process.env.YOCO_API_KEY ?? "";
if (!raw && process.argv.includes("--clipboard")) raw = execFileSync("pbpaste", { encoding: "utf8" });
const key = raw.replace(/\x1b\[20[01]~/g, "").replace(/[^\x21-\x7e]/g, "");
if (!key) {
  console.error("Set YOCO_API_KEY to the Yoco API key for the Tommy Sugo account, or copy it and add --clipboard.");
  process.exit(1);
}
if (!/^yoco_(live|test)_[A-Za-z0-9_]+$/.test(key)) {
  console.error(`That doesn't look like a Yoco API key (${key.length} characters, should start yoco_live_). Copy it again.`);
  process.exit(1);
}

// --price <rand> sets the line's price (default R0). The order is still sent unpaid.
const priceArg = process.argv.indexOf("--price");
const priceCents = priceArg > -1 ? Math.round(Number(process.argv[priceArg + 1]) * 100) : 0;
if (!Number.isInteger(priceCents) || priceCents < 0) {
  console.error("--price needs an amount in rand, for example --price 125");
  process.exit(1);
}

// --paid <tender> records the order as paid in full through that custom payment method, named exactly as in Yoco
// (the website uses "Website"). Yoco only records the payment: it charges nobody. A paid order starts completed.
const paidArg = process.argv.indexOf("--paid");
const tender = paidArg > -1 ? process.argv[paidArg + 1] : null;
if (paidArg > -1 && (!tender || tender.startsWith("--") || priceCents === 0)) {
  console.error("--paid needs a payment method name and a --price above 0, for example --price 1 --paid Website");
  process.exit(1);
}

const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
const localTime = new Date().toLocaleTimeString("en-ZA", { timeZone: "Africa/Johannesburg", hour: "2-digit", minute: "2-digit" });
const order = {
  currency: "ZAR",
  channel: "website",
  external_id: `api-test-${Date.now()}`,
  location_id: LOCATION_ID,
  name: `API TEST ${localTime} · please ignore`,
  note: `Test order sent from the Yoco API on ${stamp} UTC. ${tender ? `Recorded as paid (${tender})` : "Unpaid"}, nothing to make.`,
  line_items: [{ name: "Big Lebowski", quantity: "1", unit_price: { amount: priceCents, currency: "ZAR" } }],
  ...(tender ? { payment: { amount: { amount: priceCents, currency: "ZAR" }, method: "other", tender } } : {}),
};

async function call(path, init = {}) {
  const res = await fetch(API + path, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function summary(o) {
  return {
    id: o.id,
    status: o.status,
    order_number: o.order_number,
    display_name: o.display_name,
    location_id: o.location_id,
    channel: o.channel,
    total: o.amounts,
    line_items: (o.line_items ?? []).map((l) => `${l.quantity} × ${l.name ?? l.item_name ?? "?"}`),
    created_at: o.created_at,
    closed_at: o.closed_at,
  };
}

const args = process.argv.slice(2);
if (args[0] === "--probe") {
  // Tries the order calls Yoco doesn't document, on one test order: first marking it completed, then (if it's still
  // open) cancelling it. Only use it on a test order.
  const id = args[1];
  if (!id) {
    console.error("--probe needs an order id.");
    process.exit(1);
  }
  const path = `/v1/orders/${encodeURIComponent(id)}`;
  const brief = (b) => JSON.stringify({ status: b.status, code: b.code, title: b.title, detail: b.detail, errors: b.errors });
  const options = await fetch(API + path, { method: "OPTIONS", headers: { Authorization: `Bearer ${key}` } });
  console.log(`OPTIONS → HTTP ${options.status}, Allow: ${options.headers.get("allow") ?? "(none)"}`);
  const patch = await call(path, { method: "PATCH", body: JSON.stringify({ status: "completed" }) });
  console.log(`PATCH status=completed → HTTP ${patch.status} ${patch.status < 300 ? `order is now ${patch.body.status}` : brief(patch.body)}`);
  let now = await call(path);
  console.log(`Order ${now.body.order_number} is ${now.body.status}`);
  if (now.body.status === "open") {
    const del = await call(path, { method: "DELETE" });
    console.log(`DELETE (cancel) → HTTP ${del.status} ${del.status < 300 ? "" : brief(del.body)}`);
    now = await call(path);
    console.log(`Order ${now.body.order_number} is ${now.body.status}`);
  }
} else if (args[0] === "--list") {
  // Orders from the last two days at Dark Kitchen, any status, so open API orders show alongside till sales.
  const since = new Date(Date.now() - 2 * 86400e3).toISOString();
  const params = new URLSearchParams({ created_at__gte: since, limit: "100" });
  params.append("location_id", LOCATION_ID);
  const { status, body } = await call(`/v1/orders/?${params}`);
  console.log(`HTTP ${status}`);
  if (status !== 200) console.log(JSON.stringify(body, null, 2));
  else for (const o of body.data ?? []) {
    console.log([o.order_number, o.status, o.channel ?? "till", (o.amounts?.net_amount?.amount ?? 0) / 100, o.display_name, o.created_at].join(" | "));
  }
} else if (args[0] === "--fetch") {
  const { status, body } = await call(`/v1/orders/${encodeURIComponent(args[1] ?? "")}`);
  console.log(`HTTP ${status}`);
  console.log(JSON.stringify(status === 200 ? summary(body) : body, null, 2));
} else if (args[0] === "--send") {
  const { status, body } = await call("/v1/orders/", { method: "POST", body: JSON.stringify(order) });
  console.log(`HTTP ${status}`);
  console.log(JSON.stringify(status === 201 ? summary(body) : body, null, 2));
  if (status === 201) console.log(`\nRead it back with: node scripts/yoco-test-order.mjs --fetch ${body.id}`);
} else {
  console.log("Dry run. Add --send to send this to Yoco:\n");
  console.log(JSON.stringify(order, null, 2));
}
