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
  const rows = catalogueRows([pizza], "merles", null);
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

test("keeps every variant, with a brand's chosen ones off by default", () => {
  const item = {
    id: "i",
    name: "Pizza",
    variants: [
      { id: "l", is_enabled: true, price: money(12500), selected_options: [{ name: "Size", value: "Large" }] },
      { id: "m", is_enabled: true, price: money(9000), selected_options: [{ name: "Size", value: "Medium" }] },
    ],
  };
  const flags = (brand: string) => catalogueRows([item], brand, null).map((r) => [r.yoco_id, r.off_by_default]);
  assert.deepEqual(flags("tommy"), [["l", false], ["m", true]]);
  assert.deepEqual(flags("merles"), [["l", false], ["m", false]]);
});

test("marks a brand's chosen modifier groups off by default", () => {
  const item = {
    id: "i",
    name: "Pizza",
    variants: [{ id: "v", is_enabled: true, price: money(10000) }],
    modifier_groups: [
      { id: "p", name: "Package", modifiers: [{ id: "b", name: "Box", pricing_strategy: "free" }] },
      { id: "c", name: "Cheese", modifiers: [{ id: "f", name: "Feta", pricing_strategy: "free" }] },
    ],
  };
  const groups = catalogueRows([item], "tommy", null).find((r) => r.yoco_id === "v")!.modifier_groups!;
  assert.deepEqual(groups.map((g) => [g.name, g.off]), [["Package", true], ["Cheese", false]]);
});

test("a combo's parts are free products, with its fixed parts off and its choices on", () => {
  const schnitz = { id: "s", name: "Schnitz and Chips", variants: [{ id: "sv", is_enabled: true, price: money(9500) }] };
  const coke = { id: "k", name: "Coke", variants: [{ id: "kv", is_enabled: true, price: money(2500) }] };
  const product = (id: string, name: string, variant: string, selected = false) =>
    ({ id, name, pricing_strategy: "free", variant_id: variant, is_selected_by_default: selected });
  const combo = {
    id: "c",
    name: "Solo Schnitz Combo",
    variants: [{ id: "cv", is_enabled: true, price: money(13000) }],
    modifier_groups: [
      { id: "g1", name: "Combo: Schnitz and Chips", min_selections: 1, max_selections: 1, ordinal: 0,
        modifiers: [product("m1", "Schnitz and Chips", "sv", true)] },
      { id: "g2", name: "Cold Drink", min_selections: 1, max_selections: 1, ordinal: 1,
        modifiers: [product("m2", "Coke", "kv")] },
    ],
  };
  const row = catalogueRows([schnitz, coke, combo], "merles", null).find((r) => r.yoco_id === "cv")!;
  assert.equal(row.price, 130);
  assert.deepEqual(row.modifier_groups!.map((g) => [g.name, g.off, g.modifiers.map((m) => [m.name, m.price, m.selected])]), [
    ["Combo: Schnitz and Chips", true, [["Schnitz and Chips", 0, true]]],
    ["Cold Drink", false, [["Coke", 0, false]]],
  ]);
});

test("builds each variant's groups in Yoco's order, with their selection rules", () => {
  const item = {
    id: "i",
    name: "Pizza",
    modifier_groups: [
      {
        id: "extra",
        name: "Extra",
        ordinal: 2,
        min_selections: 0,
        max_selections: null,
        modifiers: [
          { id: "b", name: "Bacon", ordinal: 2, pricing_strategy: "fixed_price", fixed_price: money(3000) },
          { id: "a", name: "Avo", ordinal: 1, pricing_strategy: "fixed_price", fixed_price: money(2000) },
          { id: "lost", name: "Unlinked", ordinal: 3, pricing_strategy: "product", variant_id: "nope" },
        ],
      },
      {
        id: "base",
        name: "Base",
        ordinal: 1,
        min_selections: 1,
        max_selections: 1,
        modifiers: [{ id: "std", name: "Standard", pricing_strategy: "free", is_selected_by_default: true }],
      },
    ],
    variants: [
      { id: "plain", is_enabled: true, price: money(10000), selected_options: [{ name: "T", value: "Bowl" }] },
      {
        id: "own",
        is_enabled: true,
        price: money(10000),
        selected_options: [{ name: "T", value: "Pita" }],
        modifier_groups: [{ id: "only", name: "Sauce", ordinal: 3, min_selections: 0, max_selections: 1, modifiers: [{ id: "s", name: "Schug", pricing_strategy: "free" }] }],
      },
    ],
  };
  const rows = catalogueRows([item], "tommy", null);
  const plain = rows.find((r) => r.yoco_id === "plain")!;
  assert.deepEqual(plain.modifier_groups!.map((g) => g.name), ["Base", "Extra"]);
  assert.deepEqual(plain.modifier_groups![0], {
    id: "base", name: "Base", min: 1, max: 1, off: false,
    modifiers: [{ id: "std", name: "Standard", price: 0, selected: true }],
  });
  assert.deepEqual(plain.modifier_groups![1].modifiers.map((m) => [m.name, m.price]), [["Avo", 20], ["Bacon", 30]]);
  assert.deepEqual(rows.find((r) => r.yoco_id === "own")!.modifier_groups!.map((g) => g.name), ["Base", "Extra", "Sauce"]);
});
