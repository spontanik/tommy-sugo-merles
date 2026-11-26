import assert from "node:assert/strict";
import { test } from "node:test";
import { CartError, parseMenu, priceCart } from "./lightspeed-menu.ts";

const raw = {
  menuName: "Online",
  menuEntryGroups: [{
    "@type": "group", id: "1", name: "Mains", menuEntry: [
      {
        "@type": "menuItem", sku: "BURG", productName: "Burger", productPrice: 90, taxIncludedInPrice: true,
        menuModifierGroups: [{
          description: "Extras", sku: "EXT", mustSelectAnItem: false, multiSelectionPermitted: true, minimumSelection: 0, maximumSelection: 2,
          productModifiers: [
            { "@type": "menuProductModifier", sku: "CHS", productName: "Cheese", productPrice: 10, taxIncludedInPrice: true },
            { "@type": "menuProductModifier", sku: "BCN", productName: "Bacon", productPrice: 15, taxIncludedInPrice: true },
          ],
        }],
        productionInstructionList: [{
          multiSelectionPermitted: false, productionInstructionGroupName: "Cooking", productionIntructionGroupId: 7,
          productionInstructionList: [{ instruction: "Rare", ikentooModifierId: 71 }, { instruction: "Well done", ikentooModifierId: 72 }],
        }],
      },
      { "@type": "menuItem", sku: "SAUCE", productName: "Sauce pot", productPrice: 5, asSubItem: true },
      { "@type": "group", id: "2", name: "Kids", menuEntry: [
        { "@type": "menuItem", sku: "KID", productName: "Kids meal", productPrice: 50, taxIncludedInPrice: false, defaultTaxAmount: 7.5 },
      ] },
      { "@type": "menuDeal", sku: "COMBO", productName: "Combo", productPrice: 120 },
    ],
  }],
};

test("turns a Lightspeed menu into groups, flattening inner groups and leaving sub-items out", () => {
  const menu = parseMenu(raw);
  assert.equal(menu.name, "Online");
  assert.deepEqual(menu.groups.map((g) => g.name), ["Mains · Kids", "Mains"]);
  const mains = menu.groups.find((g) => g.name === "Mains")!;
  assert.deepEqual(mains.items.map((i) => i.sku), ["BURG", "COMBO"]);
  const burger = mains.items[0];
  assert.deepEqual(burger.modifierGroups[0], { sku: "EXT", name: "Extras", min: 0, max: 2, options: [
    { sku: "CHS", name: "Cheese", price: 10 }, { sku: "BCN", name: "Bacon", price: 15 }] });
  assert.deepEqual(burger.instructions[0], { id: "7", name: "Cooking", multi: false, options: [{ id: "71", name: "Rare" }, { id: "72", name: "Well done" }] });
  assert.equal(mains.items[1].combo, true);
});

test("adds tax to prices listed without it", () => {
  const kids = parseMenu(raw).groups[0].items[0];
  assert.equal(kids.price, 57.5);
});

test("prices a cart and builds Lightspeed's lines, with extras as sub-items and instructions as modifiers", () => {
  const { lines, total } = priceCart(parseMenu(raw), [
    { sku: "BURG", qty: 2, modifiers: ["CHS", "BCN"], instructions: ["72"] },
    { sku: "KID", qty: 1 },
  ]);
  assert.equal(total, 2 * 115 + 57.5);
  assert.deepEqual(lines[0].order, { quantity: 2, sku: "BURG", modifiers: [{ modifierId: "72" }], subItems: [{ sku: "CHS", quantity: 1 }, { sku: "BCN", quantity: 1 }] });
  assert.equal(lines[0].summary.name, "Burger · Cheese, Bacon, Well done");
  assert.deepEqual(lines[1].order, { quantity: 1, sku: "KID" });
});

test("refuses what the menu doesn't allow", () => {
  const menu = parseMenu(raw);
  assert.throws(() => priceCart(menu, []), CartError);
  assert.throws(() => priceCart(menu, [{ sku: "NOPE", qty: 1 }]), CartError);
  assert.throws(() => priceCart(menu, [{ sku: "COMBO", qty: 1 }]), /combo/);
  assert.throws(() => priceCart(menu, [{ sku: "BURG", qty: 0 }]), CartError);
  assert.throws(() => priceCart(menu, [{ sku: "BURG", qty: 1, modifiers: ["XXX"] }]), CartError);
  assert.throws(() => priceCart(menu, [{ sku: "BURG", qty: 1, instructions: ["71", "72"] }]), /choose one/);
});
