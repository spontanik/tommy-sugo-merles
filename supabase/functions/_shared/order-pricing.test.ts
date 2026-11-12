import assert from "node:assert/strict";
import { test } from "node:test";
import { OrderError, priceOrder } from "./order-pricing.ts";

const groups = [
  { id: "base", name: "Base", min: 1, max: 1, modifiers: [{ id: "std", name: "Standard", price: 0, selected: true }, { id: "gf", name: "Gluten Free", price: 40, selected: false }] },
  { id: "meat", name: "Extra meat", min: 0, max: 2, modifiers: [{ id: "b", name: "Bacon", price: 30, selected: false }, { id: "c", name: "Chorizo", price: 30, selected: false }, { id: "s", name: "Salami", price: 30, selected: false }] },
];
const pizza = {
  id: "p", name: "Margherita", price: 125, is_hidden: false, yoco_listed: true, is_orderable: true, yoco_id: "l",
  yoco_options: [{ id: "l", label: "Large", price: 125, groups }, { id: "m", label: "Medium", price: 90, groups }],
};
const plain = { id: "x", name: "Brownie", price: 40.5, is_hidden: false, yoco_listed: true, is_orderable: true, yoco_id: null, yoco_options: null };
const jar = { id: "j", name: "Sauce", cart_name: "Sauce jar", price: 80, is_hidden: false, is_sold_out: false };

const order = (line: object) => priceOrder([{ kind: "menu", itemId: "p", qty: 1, variantId: "l", modifierIds: ["std"], ...line }] as never, [pizza, plain], [jar]);
const refused = (fn: () => unknown, match: RegExp) => assert.throws(fn, (e: Error) => e instanceof OrderError && match.test(e.message));

test("prices the variant and modifiers from the database, not the request", () => {
  const { lines, totalCents } = order({ qty: 2, modifierIds: ["gf", "b"], price: 1 });
  assert.equal(totalCents, 39000);
  assert.equal(lines[0].unit_price, 195);
  assert.equal(lines[0].name, "Margherita · Large, Gluten Free, Bacon");
  assert.equal(lines[0].variant_id, "l");
});

test("leaves the assumed choice out of the name", () => {
  assert.equal(order({}).lines[0].name, "Margherita · Large");
});

test("uses the other variant's price", () => {
  assert.equal(order({ variantId: "m" }).totalCents, 9000);
});

test("refuses a missing required choice, too many choices, or an unknown one", () => {
  refused(() => order({ modifierIds: [] }), /check your choice for Base/);
  refused(() => order({ modifierIds: ["std", "b", "c", "s"] }), /check your choice for Extra meat/);
  refused(() => order({ modifierIds: ["std", "nope"] }), /has changed/);
  refused(() => order({ modifierIds: ["std", "b", "b"] }), /has changed/);
  refused(() => order({ variantId: "gone" }), /has changed/);
});

test("refuses items that can't be ordered", () => {
  for (const change of [{ is_hidden: true }, { yoco_listed: false }, { is_orderable: false }, { price: null }]) {
    refused(() => priceOrder([{ kind: "menu", itemId: "p", qty: 1 }], [{ ...pizza, ...change }], []), /isn't available/);
  }
  refused(() => priceOrder([{ kind: "menu", itemId: "ghost", qty: 1 }], [pizza], []), /isn't available/);
});

test("prices plain menu items and shop items, without floating point drift", () => {
  const { lines, totalCents } = priceOrder(
    [{ kind: "menu", itemId: "x", qty: 3 }, { kind: "shop", itemId: "j", qty: 1 }],
    [plain],
    [jar],
  );
  assert.equal(totalCents, 20150);
  assert.deepEqual(lines.map((l) => l.name), ["Brownie", "Sauce jar"]);
});

test("refuses shop items with no price or sold out", () => {
  refused(() => priceOrder([{ kind: "shop", itemId: "j", qty: 1 }], [], [{ ...jar, price: null }]), /doesn't have a price/);
  refused(() => priceOrder([{ kind: "shop", itemId: "j", qty: 1 }], [], [{ ...jar, is_sold_out: true }]), /isn't available/);
});

test("keeps counted shop items within their stock, across lines, and ignores uncounted ones", () => {
  const shop = (qty: number[], stock: number | null) =>
    priceOrder(qty.map((q) => ({ kind: "shop", itemId: "j", qty: q })) as never, [], [{ ...jar, stock }]);
  assert.equal(shop([3], 3).totalCents, 24000);
  assert.equal(shop([20], null).totalCents, 160000);
  refused(() => shop([4], 3), /Only 3 Sauce jar left/);
  refused(() => shop([2, 2], 3), /Only 3 Sauce jar left/);
  refused(() => shop([1], 0), /isn't available/);
});

test("lets frozen items ride along with a menu order", () => {
  const { lines } = priceOrder(
    [{ kind: "menu", itemId: "x", qty: 1 }, { kind: "shop", itemId: "j", qty: 2 }],
    [plain],
    [{ ...jar, stock: 5 }],
  );
  assert.deepEqual(lines.map((l) => [l.kind, l.qty]), [["menu", 1], ["shop", 2]]);
});

test("prices one order across both brands and tags each line with its brand", () => {
  const tommyJar = { ...jar, brand: "tommy" };
  const schnitz = { ...plain, id: "s", name: "Schnitz Roll", price: 85, brand: "merles" };
  const { lines, totalCents } = priceOrder(
    [{ brand: "merles", kind: "menu", itemId: "s", qty: 2 }, { brand: "tommy", kind: "shop", itemId: "j", qty: 1 }],
    [schnitz],
    [tommyJar],
  );
  assert.equal(totalCents, 25000);
  assert.deepEqual(lines.map((l) => [l.brand, l.name]), [["merles", "Schnitz Roll"], ["tommy", "Sauce jar"]]);
});

test("refuses an item claimed for the wrong brand, and uses the page's brand when a line doesn't say", () => {
  const tommyJar = { ...jar, brand: "tommy" };
  refused(() => priceOrder([{ brand: "merles", kind: "shop", itemId: "j", qty: 1 }], [], [tommyJar]), /isn't available/);
  assert.equal(priceOrder([{ kind: "shop", itemId: "j", qty: 1 }], [], [tommyJar], "tommy").lines[0].brand, "tommy");
  refused(() => priceOrder([{ kind: "shop", itemId: "j", qty: 1 }], [], [tommyJar], "merles"), /isn't available/);
});

test("refuses bad quantities, empty orders and unknown kinds", () => {
  for (const qty of [0, -1, 1.5, 21]) refused(() => order({ qty }), /up to 20/);
  refused(() => priceOrder([], [], []), /Add something/);
  refused(() => priceOrder([{ kind: "gift", itemId: "p", qty: 1 } as never], [pizza], []), /wasn't recognised/);
});
