import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findList,
  importProducts,
  isProductCode,
  lightspeedItemRow,
  menuCheck,
  nextCode,
  type Product,
  xeroItemRow,
  type YocoRow,
} from "./menu-check.ts";

const xeroRaw = (code: string, name: string, price: number, account = "200", extra = {}) => ({
  ItemID: "id-" + code, Code: code, Name: name, Description: name, IsSold: true,
  SalesDetails: { UnitPrice: price, AccountCode: account, TaxType: "NONE" }, UpdatedDateUTC: "/Date(1760000000000+0000)/", ...extra,
});

const yoco = (over: Partial<YocoRow>): YocoRow => ({
  brand: "tommy", yoco_id: "y1", kind: "variant", item_id: "i1", sku: null, name: "Item", option_label: null,
  category: null, price: 10, is_available: true, is_deleted: false, ...over,
});

test("reads a Xero item, whichever case its fields are in", () => {
  const row = xeroItemRow(xeroRaw("PZ2001", "Pizza - Margarita Large", 125));
  assert.equal(row?.code, "PZ2001");
  assert.equal(row?.sales_price, 125);
  assert.equal(row?.sales_account, "200");
  assert.equal(row?.xero_updated_at, new Date(1760000000000).toISOString());
  assert.equal(xeroItemRow({ code: "CD6010", itemID: "x", salesDetails: { unitPrice: "25" } })?.sales_price, 25);
  assert.equal(xeroItemRow({ Name: "No code" }), null);
});

test("finds Lightspeed's item list in any wrapper", () => {
  const items = [{ id: 1, name: "A" }, { id: 2, name: "B" }];
  assert.deepEqual(findList(items), items);
  assert.deepEqual(findList({ itemList: items, total: 2 }), items);
  assert.deepEqual(findList({ _embedded: { itemList: items } }), items);
  assert.deepEqual(findList({ status: "ok" }), []);
});

test("reads a Lightspeed item's price, accounting group and state", () => {
  const row = lightspeedItemRow({ id: 3012455645, name: "Burger", sku: "OT8019", active: false, accountingGroup: { id: 4, name: "Food" }, prices: [{ amount: 140, name: "Default" }] });
  assert.equal(row?.price, 140);
  assert.equal(row?.accounting_group, "Food");
  assert.equal(row?.active, false);
  assert.equal(lightspeedItemRow({ name: "no id" }), null);
});

test("knows which Xero codes are things on a menu", () => {
  assert.equal(isProductCode("PZ2001"), true);
  assert.equal(isProductCode("PZ2000"), false); // the category's catch-all
  assert.equal(isProductCode("OT8051"), false); // tips
  assert.equal(isProductCode("MM001"), false);
});

test("suggests the next free code in a category", () => {
  assert.equal(nextCode("PZ2", ["PZ2001", "PZ2033", "PZ2500", "CD6010"]), "PZ2501");
  assert.equal(nextCode("OT8", ["OT8020"]), "OT8021");
  assert.equal(nextCode("MS1", []), "MS1001");
  assert.equal(nextCode("bad", []), null);
});

test("fills the product list from Xero, taking price, size and brand from the Yoco variant with that SKU", () => {
  const xero = [
    xeroRaw("PZ2001", "Pizza - Margarita Large", 125),
    xeroRaw("PZ2002", "Pizza - Margarita Medium", 90),
    xeroRaw("CD6010", "Coke", 25, "231"),
    xeroRaw("PZ2000", "Pizza Sales", 0),
    xeroRaw("OT8051", "Tips", 0, "260"),
  ].map((r) => xeroItemRow(r)!);
  const rows = [
    yoco({ yoco_id: "v-l", sku: "PZ2001", name: "Pizza Margherita", option_label: "Large", category: "PIZZA", price: 125 }),
    yoco({ yoco_id: "v-l", brand: "merles", sku: "PZ2001", name: "Pizza Margherita", option_label: "Large", category: "PIZZA", price: 125 }),
    yoco({ yoco_id: "v-m", sku: "PZ2002", name: "Pizza Margherita", option_label: "Medium", category: "PIZZA", price: 125 }),
    yoco({ yoco_id: "v-c", sku: "CD6010", name: "Coke", category: "COLD DRINKS", price: 25 }),
  ];
  const products = importProducts(xero, rows);
  assert.deepEqual(products.map((p) => p.sku), ["PZ2001", "PZ2002", "CD6010"]);
  const medium = products.find((p) => p.sku === "PZ2002")!;
  assert.equal(medium.price, 125); // what Yoco charges today, not Xero's R90
  assert.equal(medium.family, "Pizza Margherita");
  assert.equal(medium.option_label, "Medium");
  assert.equal(medium.brand, "tommy");
  assert.equal(products.find((p) => p.sku === "CD6010")!.brand, null); // both brands sell drinks
});

test("a Merle's Yoco item without a Xero code is left for the admin to add", () => {
  const products = importProducts([], [yoco({ yoco_id: "s", name: "Schnitz Roll", category: "MERLE'S SCHNITZ", price: 85 })]);
  assert.equal(products.length, 0);
});

const product = (over: Partial<Product>): Product => ({
  sku: "PZ2001", brand: "tommy", name: "Pizza - Margarita Large", family: "Pizza Margherita", option_label: "Large", kind: "item",
  category: "PIZZA", xero_account: "200", price: 125, description: "", is_active: true, ...over,
});

test("a product that matches everywhere has no issues", () => {
  const { rows } = menuCheck(
    [product({})],
    [xeroItemRow(xeroRaw("PZ2001", "Pizza - Margarita Large", 125))!],
    [yoco({ sku: "PZ2001", name: "Pizza Margherita", option_label: "Large", price: 125 })],
    [lightspeedItemRow({ id: 9, sku: "PZ2001", name: "Pizza - Margarita Large", prices: [{ amount: 125 }] })!],
    { xero: true, yoco: true, lightspeed: true },
  );
  assert.deepEqual(rows[0].issues, []);
});

test("flags what's missing or different in each system", () => {
  const { rows, extra } = menuCheck(
    [product({}), product({ sku: "PZ2002", option_label: "Medium", name: "Pizza - Margarita Medium", price: 90 })],
    [xeroItemRow(xeroRaw("PZ2001", "Margarita", 130, "203"))!, xeroItemRow(xeroRaw("CD6010", "Coke", 25, "231"))!],
    [
      yoco({ yoco_id: "a", sku: "PZ2002", name: "Pizza Margherita", option_label: "Medium", price: 125 }),
      yoco({ yoco_id: "b", sku: null, name: "Schnitz Roll", category: "MERLE'S SCHNITZ" }),
    ],
    [],
    { xero: true, yoco: true, lightspeed: true },
  );
  const large = rows.find((r) => r.sku === "PZ2001")!.issues.map((i) => `${i.system}:${i.level}`);
  assert.deepEqual(large, ["xero:differs", "xero:differs", "xero:differs", "yoco:missing", "lightspeed:missing"]);
  const medium = rows.find((r) => r.sku === "PZ2002")!.issues;
  assert.ok(medium.some((i) => i.system === "xero" && i.level === "missing"));
  assert.ok(medium.some((i) => i.system === "yoco" && i.text === "R125 in Yoco, R90 here."));
  assert.deepEqual(extra.xero.map((x) => x.code), ["CD6010"]);
  assert.deepEqual(extra.yoco.map((y) => y.name), ["Schnitz Roll"]);
});

test("a system that isn't connected isn't checked", () => {
  const { rows, extra } = menuCheck([product({})], [], [], [], { xero: false, yoco: true, lightspeed: false });
  assert.deepEqual(rows[0].issues.map((i) => i.system), ["yoco"]);
  assert.deepEqual(extra.xero, []);
});
