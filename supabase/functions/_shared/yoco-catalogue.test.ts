// Run with: node --test supabase/functions/_shared/yoco-catalogue.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { catalogueRows, verifyWebhook } from "./yoco-catalogue.ts";

const money = (amount: number) => ({ amount, currency: "ZAR" });
const pizza = {
  id: "item-1",
  name: "Margherita",
  category: { name: "Pizza" },
  taxes: [{ id: "t", name: "VAT", percentage: "15.00", type: "inclusive" }],
  location_availability: { is_available_at_all_locations: true, excluded_location_ids: ["closed"] },
  modifier_groups: [{
    name: "Extras",
    modifiers: [
      { id: "m-fixed", name: "Extra veg", pricing_strategy: "fixed_price", fixed_price: money(1500), variant_id: null },
      { id: "m-free", name: "No onion", pricing_strategy: "free", fixed_price: null, variant_id: null },
      { id: "m-linked", name: "Side salad", pricing_strategy: "product", fixed_price: null, variant_id: "v-salad" },
    ],
  }],
  variants: [
    { id: "v-l", is_enabled: true, price: money(12500), selected_options: [{ name: "Size", value: "Large" }] },
    { id: "v-m", is_enabled: false, price: money(9000), selected_options: [{ name: "Size", value: "Medium" }] },
  ],
};
const salad = {
  id: "item-2",
  name: "Salad",
  taxes: [{ id: "t", name: "VAT", percentage: "15.00", type: "additive" }],
  location_availability: { is_available_at_all_locations: false, included_location_ids: ["kitchen"] },
  modifier_groups: [pizza.modifier_groups[0]],
  variants: [{
    id: "v-salad",
    is_enabled: true,
    price: money(10000),
    selected_options: [],
    price_overrides: [{ id: "o", location_ids: ["truck"], price: money(20000) }],
  }],
};

test("maps variants, sizes, disabled state and cents", () => {
  const rows = catalogueRows([pizza], "tommy", null);
  const large = rows.find((r) => r.yoco_id === "v-l")!;
  assert.equal(large.price, 125);
  assert.equal(large.option_label, "Large");
  assert.equal(large.category, "Pizza");
  assert.equal(large.is_available, true);
  assert.equal(rows.find((r) => r.yoco_id === "v-m")!.is_available, false);
});

test("adds additive tax but not inclusive tax", () => {
  const rows = catalogueRows([pizza, salad], "tommy", null);
  assert.equal(rows.find((r) => r.yoco_id === "v-l")!.price, 125);
  assert.equal(rows.find((r) => r.yoco_id === "v-salad")!.price, 115);
});

test("uses location overrides and availability", () => {
  const atTruck = catalogueRows([salad], "tommy", "truck").find((r) => r.yoco_id === "v-salad")!;
  assert.equal(atTruck.price, 230);
  assert.equal(atTruck.is_available, false);
  const atKitchen = catalogueRows([salad], "tommy", "kitchen").find((r) => r.yoco_id === "v-salad")!;
  assert.equal(atKitchen.price, 115);
  assert.equal(atKitchen.is_available, true);
  assert.equal(catalogueRows([pizza], "tommy", "closed").find((r) => r.yoco_id === "v-l")!.is_available, false);
});

test("modifiers appear once, with each pricing strategy", () => {
  const rows = catalogueRows([pizza, salad], "tommy", null).filter((r) => r.kind === "modifier");
  assert.equal(rows.length, 3);
  assert.equal(rows.find((r) => r.yoco_id === "m-fixed")!.price, 15);
  assert.equal(rows.find((r) => r.yoco_id === "m-free")!.price, 0);
  assert.equal(rows.find((r) => r.yoco_id === "m-linked")!.price, 115);
  assert.equal(rows.find((r) => r.yoco_id === "m-fixed")!.category, "Modifier: Extras");
});

// The Standard Webhooks reference test vector.
const vector = {
  secret: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
  id: "msg_p5jXN8AQM9LWM0D4loKWxJek",
  timestamp: "1614265330",
  signatures: "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
  body: '{"test": 2432232314}',
  nowSeconds: 1614265330,
};

test("accepts a valid signature, including among several", async () => {
  assert.equal(await verifyWebhook(vector), true);
  assert.equal(await verifyWebhook({ ...vector, signatures: "v1,AAAA " + vector.signatures }), true);
});

test("rejects a changed body, wrong secret, old timestamp, or missing header", async () => {
  assert.equal(await verifyWebhook({ ...vector, body: '{"test": 1}' }), false);
  assert.equal(await verifyWebhook({ ...vector, secret: "whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" }), false);
  assert.equal(await verifyWebhook({ ...vector, nowSeconds: vector.nowSeconds + 301 }), false);
  assert.equal(await verifyWebhook({ ...vector, signatures: null }), false);
  assert.equal(await verifyWebhook({ ...vector, signatures: "v1,not base64!" }), false);
});
