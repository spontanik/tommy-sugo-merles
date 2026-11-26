// Pure logic for the test shop: turning a Lightspeed online-ordering menu (GET /o/op/2/menu/load/{menuId}) into a simple
// shape a page can draw, and pricing a cart against it. No Deno or network dependencies, so it can be tested on its own.

// deno-lint-ignore no-explicit-any
type Raw = any;

export type MenuOption = { sku: string; name: string; price: number };
export type MenuModifierGroup = {
  sku: string;
  name: string;
  min: number;
  max: number | null;
  options: MenuOption[];
};
export type MenuInstructionGroup = { id: string; name: string; multi: boolean; options: { id: string; name: string }[] };
export type MenuItem = {
  sku: string;
  name: string;
  price: number; // what the customer pays for one, tax included
  modifierGroups: MenuModifierGroup[];
  instructions: MenuInstructionGroup[];
  combo: boolean; // a deal: shown, but the test shop can't order it yet
};
export type MenuGroup = { id: string; name: string; items: MenuItem[] };
export type Menu = { name: string; groups: MenuGroup[] };

export class CartError extends Error {}

// A price with tax, when Lightspeed lists it without.
function withTax(entry: Raw, price: Raw): number {
  const base = Number(price ?? 0);
  if (!Number.isFinite(base)) return 0;
  const tax = entry?.taxIncludedInPrice === false ? Number(entry.defaultTaxAmount ?? 0) : 0;
  return Math.round((base + (Number.isFinite(tax) ? tax : 0)) * 100) / 100;
}

function instructionsOf(entry: Raw): MenuInstructionGroup[] {
  return (entry?.productionInstructionList ?? []).map((g: Raw) => ({
    id: String(g.productionIntructionGroupId ?? g.productionInstructionGroupId ?? g.productionInstructionGroupName),
    name: String(g.productionInstructionGroupName ?? "Instructions"),
    multi: !!g.multiSelectionPermitted,
    options: (g.productionInstructionList ?? []).map((i: Raw) => ({ id: String(i.ikentooModifierId), name: String(i.instruction) })),
  })).filter((g: MenuInstructionGroup) => g.options.length);
}

function itemOf(entry: Raw): MenuItem | null {
  if (!entry?.sku) return null;
  const combo = entry["@type"] === "menuDeal";
  return {
    sku: String(entry.sku),
    name: String(entry.productName ?? entry.sku),
    price: withTax(entry, entry.productPrice),
    combo,
    modifierGroups: combo ? [] : (entry.menuModifierGroups ?? []).map((g: Raw) => {
      const options = (g.productModifiers ?? []).filter((m: Raw) => m?.sku)
        .map((m: Raw) => ({ sku: String(m.sku), name: String(m.productName ?? m.sku), price: withTax(m, m.productPrice) }));
      const required = !!g.mustSelectAnItem;
      const min = Math.max(Number(g.minimumSelection ?? 0) || 0, required ? 1 : 0);
      const max = g.maximumSelection == null ? (g.multiSelectionPermitted ? null : 1) : Number(g.maximumSelection);
      return { sku: String(g.sku ?? g.description), name: String(g.description ?? "Options"), min, max, options };
    }).filter((g: MenuModifierGroup) => g.options.length),
    instructions: combo ? [] : instructionsOf(entry),
  };
}

// The menu's screens become groups; a group inside a group is flattened into its own group, named "Outer · Inner".
// Sub-items (products that can't be sold alone) aren't listed.
export function parseMenu(raw: Raw): Menu {
  const groups: MenuGroup[] = [];
  const walk = (entry: Raw, prefix: string) => {
    const name = prefix ? `${prefix} · ${entry.name ?? ""}` : String(entry.name ?? "Menu");
    const items: MenuItem[] = [];
    for (const child of entry.menuEntry ?? []) {
      if (child?.["@type"] === "group") walk(child, name);
      else if ((child?.["@type"] === "menuItem" && !child.asSubItem) || child?.["@type"] === "menuDeal") {
        const item = itemOf(child);
        if (item) items.push(item);
      }
    }
    if (items.length) groups.push({ id: String(entry.id ?? name), name, items });
  };
  for (const top of raw?.menuEntryGroups ?? []) walk(top, "");
  return { name: String(raw?.menuName ?? "Menu"), groups };
}

export type CartLine = { sku: string; qty: number; modifiers?: string[]; instructions?: string[] };

// Prices a cart against the menu and builds Lightspeed's order lines. Lightspeed rings items up at its own prices, so
// none are sent; the total is what the payment must cover.
export function priceCart(menu: Menu, cart: CartLine[]) {
  if (!Array.isArray(cart) || !cart.length) throw new CartError("Add something to the order first.");
  if (cart.length > 30) throw new CartError("That's too many lines for a test order.");
  const bySku = new Map<string, MenuItem>();
  for (const g of menu.groups) for (const i of g.items) if (!bySku.has(i.sku)) bySku.set(i.sku, i);
  let cents = 0;
  const lines = cart.map((line) => {
    const item = bySku.get(String(line?.sku));
    if (!item) throw new CartError("Something in the order isn't on the menu any more. Reload the menu.");
    if (item.combo) throw new CartError(`${item.name} is a combo, which the test shop can't order yet.`);
    const qty = Number(line.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 20) throw new CartError("Order between 1 and 20 of each item.");

    const picked = [...new Set((line.modifiers ?? []).map(String))];
    const subItems: { sku: string; quantity: number }[] = [];
    const names: string[] = [];
    let each = Math.round(item.price * 100);
    for (const group of item.modifierGroups) {
      const chosen = group.options.filter((o) => picked.includes(o.sku));
      if (chosen.length < group.min || (group.max !== null && chosen.length > group.max)) {
        throw new CartError(`${item.name}: check the choice for ${group.name}.`);
      }
      for (const o of chosen) {
        each += Math.round(o.price * 100);
        subItems.push({ sku: o.sku, quantity: 1 });
        names.push(o.name);
      }
    }
    const known = new Set(item.modifierGroups.flatMap((g) => g.options.map((o) => o.sku)));
    if (picked.some((s) => !known.has(s))) throw new CartError(`${item.name}: an option isn't available any more.`);

    const instructionIds = [...new Set((line.instructions ?? []).map(String))];
    const instructionNames = new Map(item.instructions.flatMap((g) => g.options.map((o) => [o.id, o.name] as const)));
    if (instructionIds.some((id) => !instructionNames.has(id))) throw new CartError(`${item.name}: an instruction isn't available any more.`);
    for (const g of item.instructions) {
      if (!g.multi && g.options.filter((o) => instructionIds.includes(o.id)).length > 1) {
        throw new CartError(`${item.name}: choose one option for ${g.name}.`);
      }
    }
    names.push(...instructionIds.map((id) => instructionNames.get(id)!));

    cents += each * qty;
    return {
      summary: { sku: item.sku, name: item.name + (names.length ? " · " + names.join(", ") : ""), qty, each: each / 100 },
      order: {
        quantity: qty,
        sku: item.sku,
        ...(instructionIds.length ? { modifiers: instructionIds.map((id) => ({ modifierId: id })) } : {}),
        ...(subItems.length ? { subItems } : {}),
      },
    };
  });
  return { lines, total: cents / 100 };
}
