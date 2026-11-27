import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildToGoOrder,
  ENDPOINT_ID,
  MissingSkuError,
  readOrderNotification,
  readReadiness,
  referenceFor,
  skuKey,
  toE164,
} from "./lightspeed-order.ts";

const order = { number: 1012, customer_name: "Thandi van der Merwe", customer_phone: "082 123 4567", total: "245.00", brand: "tommy", brands: ["tommy", "merles"] };
const lines = [
  { kind: "menu" as const, item_id: "a", variant_id: "v-double", name: "Schnitz Roll · Double", qty: 1, unit_price: "150.00", brand: "merles" },
  { kind: "menu" as const, item_id: "b", variant_id: "v-only", name: "Margherita · Extra basil", qty: 1, unit_price: "95", brand: "tommy" },
];
const skus = new Map([[skuKey("menu", "a", "v-double"), "SR-2"], [skuKey("menu", "b", null), "MARG"]]);
const settings = { locationId: 172614735642010, paymentMethod: "PAYFAST", orderProfile: "TAKEAWAY" };

test("formats South African numbers as E.164", () => {
  assert.equal(toE164("082 123 4567"), "+27821234567");
  assert.equal(toE164("+27 82 123 4567"), "+27821234567");
  assert.equal(toE164("27821234567"), "+27821234567");
  assert.equal(toE164("123"), null);
  assert.equal(toE164(null), null);
});

test("builds a paid to-go order", () => {
  const body = buildToGoOrder(order, lines, skus, settings, "web-1012", true);
  assert.equal(body.businessLocationId, 172614735642010);
  assert.equal(body.thirdPartyReference, "web-1012");
  assert.equal(body.endpointId, ENDPOINT_ID);
  assert.deepEqual(body.customerInfo, { firstName: "Thandi", lastName: "van der Merwe", contactNumberAsE164: "+27821234567" });
  assert.equal(body.accountProfileCode, "TAKEAWAY");
  // A variant's own link wins; otherwise the item's general link is used.
  assert.deepEqual(body.items, [
    { quantity: 1, sku: "SR-2", customItemPrice: 150 },
    { quantity: 1, sku: "MARG", customItemPrice: 95 },
  ]);
  assert.deepEqual(body.payment, { paymentMethod: "PAYFAST", paymentAmount: 245 });
  assert.match(body.orderNote, /Website order #1012 \(Tommy Sugo & Merle's\)/);
  assert.match(body.orderNote, /1 × Margherita · Extra basil/);
  assert.ok(!JSON.stringify(body).includes("collection"), "no collection code goes to the POS");
});

test("leaves the payment off when there's no payment method, or it isn't paid", () => {
  assert.equal(buildToGoOrder(order, lines, skus, { ...settings, paymentMethod: null }, "r", true).payment, undefined);
  assert.equal(buildToGoOrder(order, lines, skus, settings, "r", false).payment, undefined);
});

test("refuses an order with an unlinked item, naming it", () => {
  assert.throws(() => buildToGoOrder(order, lines, new Map([[skuKey("menu", "b", null), "MARG"]]), settings, "r", true),
    (e: Error) => e instanceof MissingSkuError && /Schnitz Roll · Double/.test(e.message));
});

test("numbers each attempt's reference", () => {
  assert.equal(referenceFor(1012, 1), "web-1012");
  assert.equal(referenceFor(1012, 2), "web-1012-2");
});

test("reads Lightspeed's order notifications", () => {
  assert.deepEqual(readOrderNotification({ status: "SUCCESS", thirdPartyReference: "web-1" }), { lightspeedStatus: "in_pos", error: null, status: null });
  const failed = readOrderNotification({ status: "FAILURE", reason: "Item not found", thirdPartyReference: "web-1" });
  assert.equal(failed?.lightspeedStatus, "failed");
  assert.equal(failed?.error, "Item not found");
  assert.equal(readOrderNotification({ status: "READY_FOR_PICKUP", thirdPartyReference: "web-1" })?.status?.to, "ready");
  assert.deepEqual(readOrderNotification({ status: "CLOSED", thirdPartyReference: "web-1" })?.status?.from, ["received", "preparing", "ready"]);
  assert.equal(readOrderNotification({ status: "CANCELLED", thirdPartyReference: "web-1" })?.status, null);
  assert.equal(readOrderNotification({ status: "CHECK_WAS_UPDATED", thirdPartyReference: "web-1" }), null);
  assert.equal(readOrderNotification({ status: "SUCCESS" }), null);
});

test("explains why a location isn't ready for online orders", () => {
  const closed = readReadiness({
    status: "NOT_READY",
    lastUpdatedAt: "2026-11-26T08:59:10Z",
    onlineOrderingApiConfiguration: { enabled: true },
    posStatus: { acceptingOnlineOrders: false, availableDevices: false, salesPeriod: "CLOSED" },
  });
  assert.equal(closed.ready, false);
  assert.equal(closed.updatedAt, "2026-11-26T08:59:10Z");
  assert.equal(closed.problems.length, 2);
  assert.match(closed.problems[0], /No POS device is online/);
  assert.match(closed.problems[1], /sales period is closed/);

  const notAccepting = readReadiness({ status: "NOT_READY", posStatus: { acceptingOnlineOrders: false, availableDevices: true, salesPeriod: "OPEN" } });
  assert.deepEqual(notAccepting.problems, ["The POS isn't accepting online orders yet."]);
  assert.match(readReadiness({ status: "NOT_READY", onlineOrderingApiConfiguration: { enabled: false } }).problems[0], /switched off/);
  assert.match(readReadiness({ status: "NOT_READY" }).problems[0], /isn't ready/);

  const ready = readReadiness({ status: "READY", posStatus: { acceptingOnlineOrders: true, availableDevices: true, salesPeriod: "OPEN" } });
  assert.deepEqual(ready, { ready: true, problems: [], updatedAt: null });
});
