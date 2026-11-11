// Pure logic for pricing an order, with no Deno or network dependencies so it can be tested on its own. The browser
// only says what the customer chose: every price and rule here comes from the database rows passed in.

export class OrderError extends Error {}

export type RequestedLine = {
  kind: "menu" | "shop";
  itemId: string;
  qty: number;
  variantId?: string | null;
  modifierIds?: string[];
};

export type PricedLine = {
  position: number;
  kind: "menu" | "shop";
  item_id: string;
  name: string;
  qty: number;
  unit_price: number;
  variant_id: string | null;
  modifier_ids: string[];
};

const MAX_LINES = 50;
const MAX_QTY = 20;
const CHANGED = "has changed since you added it. Please remove it and add it again.";

// deno-lint-ignore no-explicit-any
type Row = any;

const cents = (rand: number | string) => Math.round(Number(rand) * 100);

function priceMenuLine(line: RequestedLine, row: Row) {
  if (!row || row.is_hidden || row.yoco_listed === false || !row.is_orderable || row.price === null) {
    throw new OrderError(`${row?.name ?? "An item in your order"} isn't available right now. Please remove it.`);
  }
  const variants: Row[] = row.yoco_options ?? [];
  if (!variants.length) {
    if (line.modifierIds?.length) throw new OrderError(`${row.name} ${CHANGED}`);
    return { name: row.name, each: cents(row.price), variantId: null, modifierIds: [] };
  }
  const variant = line.variantId
    ? variants.find((v) => v.id === line.variantId)
    : variants.find((v) => v.id === row.yoco_id) ?? variants[0];
  if (!variant) throw new OrderError(`${row.name} ${CHANGED}`);

  const picked = line.modifierIds ?? [];
  const groups: Row[] = variant.groups ?? [];
  const known = new Set(groups.flatMap((g) => g.modifiers.map((m: Row) => m.id)));
  if (new Set(picked).size !== picked.length || picked.some((id) => !known.has(id))) {
    throw new OrderError(`${row.name} ${CHANGED}`);
  }

  let each = cents(variant.price);
  const parts: string[] = variants.length > 1 && variant.label ? [variant.label] : [];
  for (const group of groups) {
    const chosen = group.modifiers.filter((m: Row) => picked.includes(m.id));
    if (chosen.length < group.min || (group.max !== null && chosen.length > group.max)) {
      throw new OrderError(`${row.name}: please check your choice for ${group.name}.`);
    }
    for (const modifier of chosen) {
      each += cents(modifier.price);
      // "Standard" and the like are the assumed choice, so they don't need spelling out.
      if (Number(modifier.price) || !modifier.selected) parts.push(modifier.name);
    }
  }
  return {
    name: row.name + (parts.length ? " · " + parts.join(", ") : ""),
    each,
    variantId: variant.id as string,
    modifierIds: picked,
  };
}

function priceShopLine(row: Row) {
  if (!row || row.is_hidden || row.is_sold_out || row.stock === 0) {
    throw new OrderError(`${row?.name ?? "An item in your order"} isn't available right now. Please remove it.`);
  }
  if (row.price === null) throw new OrderError(`${row.name} doesn't have a price yet. Please remove it.`);
  return { name: row.cart_name || row.name, each: cents(row.price), variantId: null, modifierIds: [] };
}

export function priceOrder(requested: RequestedLine[], menuRows: Row[], shopRows: Row[]) {
  if (!Array.isArray(requested) || !requested.length) throw new OrderError("Add something to your order first.");
  if (requested.length > MAX_LINES) throw new OrderError("That's a very big order. Please call us instead.");
  const menu = new Map(menuRows.map((r) => [r.id, r]));
  const shop = new Map(shopRows.map((r) => [r.id, r]));
  let totalCents = 0;
  const lines: PricedLine[] = requested.map((line, position) => {
    if (!Number.isInteger(line.qty) || line.qty < 1 || line.qty > MAX_QTY) {
      throw new OrderError(`You can order up to ${MAX_QTY} of each item.`);
    }
    if (line.kind !== "menu" && line.kind !== "shop") throw new OrderError("Something in your order wasn't recognised.");
    const priced = line.kind === "menu" ? priceMenuLine(line, menu.get(line.itemId)) : priceShopLine(shop.get(line.itemId));
    totalCents += priced.each * line.qty;
    return {
      position,
      kind: line.kind,
      item_id: line.itemId,
      name: priced.name,
      qty: line.qty,
      unit_price: priced.each / 100,
      variant_id: priced.variantId,
      modifier_ids: priced.modifierIds,
    };
  });
  // A counted shop item can't sell more than what's left, across every line it's on.
  const wanted = new Map<string, number>();
  for (const l of lines) if (l.kind === "shop") wanted.set(l.item_id, (wanted.get(l.item_id) ?? 0) + l.qty);
  for (const [id, qty] of wanted) {
    const row = shop.get(id);
    if (row.stock !== null && row.stock !== undefined && qty > row.stock) {
      throw new OrderError(`Only ${row.stock} ${row.cart_name || row.name} left. Please change how many you're ordering.`);
    }
  }
  return { lines, totalCents };
}
