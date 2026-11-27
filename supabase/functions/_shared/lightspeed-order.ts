// Pure logic for sending an order to Lightspeed K-Series, with no Deno or network dependencies so it can be tested on
// its own: building the to-go order, and reading Lightspeed's order notifications.

// The name our webhook is registered under in Lightspeed. Every order names it, so Lightspeed knows where to report.
export const ENDPOINT_ID = "spontanik-website";
// How long Lightspeed keeps trying to reach the POS before reporting a failure (its minimum is 60 seconds).
export const DELIVER_WITHIN_MS = 15 * 60 * 1000;
// The username Lightspeed signs in to our webhook with. The password is generated and kept in Vault.
export const WEBHOOK_USER = "lightspeed";

export type OrderForLightspeed = {
  number: number;
  customer_name: string;
  customer_phone: string | null;
  total: number | string;
  brands?: string[] | null;
  brand: string;
};

export type LineForLightspeed = {
  kind: "menu" | "shop";
  item_id: string;
  variant_id: string | null;
  name: string;
  qty: number;
  unit_price: number | string;
  brand?: string | null;
};

export type Settings = {
  locationId: number;
  paymentMethod: string | null;
  orderProfile: string | null;
};

export class MissingSkuError extends Error {}

export const skuKey = (kind: string, itemId: string, variantId: string | null | undefined) =>
  `${kind}:${itemId}:${variantId ?? ""}`;

// A South African number as E.164 (+27…), or null when it doesn't look like one. Lightspeed rejects anything else.
export function toE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, "");
  if (/^\+[1-9]\d{7,14}$/.test(digits)) return digits;
  if (/^27\d{9}$/.test(digits)) return "+" + digits;
  if (/^0\d{9}$/.test(digits)) return "+27" + digits.slice(1);
  return null;
}

function splitName(name: string) {
  const parts = name.trim().split(/\s+/);
  return { first: parts[0] || "Website", last: parts.slice(1).join(" ") };
}

const rands = (value: number | string) => Math.round(Number(value) * 100) / 100;

// The body for POST /o/op/1/order/toGo. Each line is rung up at the price the customer paid (which includes their
// choices), so the bill in Lightspeed matches the payment. The choices themselves go on the docket as the order note,
// because the website's options don't map one-to-one onto Lightspeed's. The collection code is left out on purpose:
// staff check it on the Orders screen, and anyone at the till could read it here.
export function buildToGoOrder(
  order: OrderForLightspeed,
  lines: LineForLightspeed[],
  skus: Map<string, string>,
  settings: Settings,
  reference: string,
  paid: boolean,
) {
  const missing = lines.filter((l) => !skus.get(skuKey(l.kind, l.item_id, l.variant_id)) &&
    !skus.get(skuKey(l.kind, l.item_id, null)));
  if (missing.length) {
    throw new MissingSkuError("No Lightspeed item is linked to " + [...new Set(missing.map((l) => l.name))].join(", ") +
      ". Link it in Settings, then send the order again.");
  }
  const { first, last } = splitName(order.customer_name);
  const phone = toE164(order.customer_phone);
  const brands = order.brands?.length ? order.brands : [order.brand];
  const names: Record<string, string> = { tommy: "Tommy Sugo", merles: "Merle's" };
  const note = [
    `Website order #${order.number} (${brands.map((b) => names[b] ?? b).join(" & ")})`,
    ...lines.map((l) => `${l.qty} × ${l.name}`),
    order.customer_phone ? `Phone: ${order.customer_phone}` : "",
  ].filter(Boolean).join("\n");

  return {
    businessLocationId: settings.locationId,
    thirdPartyReference: reference,
    endpointId: ENDPOINT_ID,
    customerInfo: {
      firstName: first.slice(0, 50),
      ...(last ? { lastName: last.slice(0, 50) } : {}),
      ...(phone ? { contactNumberAsE164: phone } : {}),
    },
    ...(settings.orderProfile ? { accountProfileCode: settings.orderProfile } : {}),
    orderNote: note.slice(0, 1000),
    maxTimeToAttemptOrderDeliverToPos: DELIVER_WITHIN_MS,
    items: lines.map((l) => ({
      quantity: l.qty,
      sku: skus.get(skuKey(l.kind, l.item_id, l.variant_id)) ?? skus.get(skuKey(l.kind, l.item_id, null))!,
      customItemPrice: rands(l.unit_price),
    })),
    ...(paid && settings.paymentMethod
      ? { payment: { paymentMethod: settings.paymentMethod, paymentAmount: rands(order.total) } }
      : {}),
  };
}

// The unique reference for an order's nth attempt: "web-1012", then "web-1012-2" if it has to be sent again.
export const referenceFor = (number: number, attempt: number) => attempt > 1 ? `web-${number}-${attempt}` : `web-${number}`;

// What a Lightspeed order notification means for the website. status is the order's new website status (only moved
// forward from the given ones), or null to leave it alone.
export type NotificationEffect = {
  lightspeedStatus: string;
  error: string | null;
  status: { to: string; from: string[]; at: string } | null;
};

// deno-lint-ignore no-explicit-any
export function readOrderNotification(body: any): NotificationEffect | null {
  if (!body || typeof body.thirdPartyReference !== "string") return null;
  switch (String(body.status ?? "").toUpperCase()) {
    case "SUCCESS":
    case "DELIVERED":
      return { lightspeedStatus: "in_pos", error: null, status: null };
    case "FAILURE":
      return { lightspeedStatus: "failed", error: String(body.reason ?? "Lightspeed couldn't take the order."), status: null };
    case "READY_FOR_PICKUP":
      return { lightspeedStatus: "ready", error: null, status: { to: "ready", from: ["received", "preparing"], at: "ready_at" } };
    case "CLOSED":
      // The bill was closed in the POS: the order has gone.
      return { lightspeedStatus: "closed", error: null, status: { to: "collected", from: ["received", "preparing", "ready"], at: "collected_at" } };
    case "CANCELLED":
    case "ABANDONED":
      // Not cancelled here on its own: the customer has paid, so someone needs to decide about a refund.
      return { lightspeedStatus: "cancelled", error: "Cancelled in Lightspeed. Cancel it here and refund the customer if it isn't going ahead.", status: null };
    default:
      return null;
  }
}

// Whether a location can take online orders right now (GET /o/op/1/onlineOrderReadiness), with what's in the way in
// plain words. An order sent while it isn't ready waits until DELIVER_WITHIN_MS runs out, then fails.
export type Readiness = { ready: boolean; problems: string[]; updatedAt: string | null };

// deno-lint-ignore no-explicit-any
export function readReadiness(raw: any): Readiness {
  const pos = raw?.posStatus ?? {};
  const problems: string[] = [];
  if (raw?.onlineOrderingApiConfiguration?.enabled === false) {
    problems.push("Online ordering through the API is switched off for this location. TabletPOS can switch it on.");
  }
  if (pos.availableDevices === false) {
    problems.push("No POS device is online. Open the Lightspeed POS app on the iPad, signed in to this business and location.");
  }
  if (String(pos.salesPeriod ?? "").toUpperCase() === "CLOSED") problems.push("The sales period is closed. Open the day on the POS.");
  if (pos.availableDevices !== false && pos.acceptingOnlineOrders === false) problems.push("The POS isn't accepting online orders yet.");
  const ready = String(raw?.status ?? "").toUpperCase() === "READY";
  if (!ready && !problems.length) problems.push("Lightspeed says this location isn't ready for online orders.");
  return { ready, problems: ready ? [] : problems, updatedAt: typeof raw?.lastUpdatedAt === "string" ? raw.lastUpdatedAt : null };
}
