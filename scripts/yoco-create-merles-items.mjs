// Creates Merle's menu in the Yoco account it shares with Tommy Sugo, with the same names and prices as the website,
// so "Match identical names" in the admin links them. Drinks aren't created: Merle's uses Tommy Sugo's.
//
// Each combo is one Yoco item at the combo price, made up of other products: its modifier groups hold product
// modifiers (linked to another item's variant) that cost nothing extra. Yoco can't put a quantity on a modifier, so
// "2 schnitz" is two groups. Groups named "Combo: …" are fixed parts with a single pre-selected choice; the website
// starts them switched off (OFF_BY_DEFAULT in supabase/functions/_shared/yoco-catalogue.ts). Sauce and drink groups
// are the customer's choices.
//
// Tax and location settings are copied from Tommy Sugo's Pizza Margherita, so Merle's items behave the same at the
// till and on the website. Anything that already exists (category, item or modifier group with the same name) is left
// alone, so it's safe to run again.
//
//   YOCO_API_KEY=… node scripts/yoco-create-merles-items.mjs            # shows what it would create
//   YOCO_API_KEY=… node scripts/yoco-create-merles-items.mjs --create   # creates it
//
// The key needs Yoco's business/catalogue:write permission, as well as read.

const API = "https://api.yoco.com";
const TEMPLATE_ITEM = "Pizza Margherita";

// Sold on their own, on the website and at the till.
const MENU = {
  "MERLE'S SCHNITZ": [
    ["Schnitz and Chips", 95],
    ["Schnitz Roll", 85],
    ["Big Lebowski", 125],
    ["Joey Doesn't Share Food", 135],
    ["Night at the Roxbury", 120],
    ["Cosmo Kramer", 115],
    ["The Dr. Dre", 125],
    ["Almost Famous", 110],
  ],
  "MERLE'S SIDES & SAUCES": [
    ["Chips", 35],
    ["Merle's 3 Classic Salad", 45],
    ["Merle's Peri-mayo", 15],
    ["MMMbop Sauce", 15],
    ["Mushroom Sauce", 15],
  ],
  "MERLE'S MILKSHAKES": [
    ["The Fat Boy Slim", 65],
    ["The Whoopi Goldberg", 65],
  ],
  "MERLE'S SWEET TREAT": [
    ["Flake Ice Cream", 40],
  ],
  // Only used inside combos: R0, and not on the website.
  "MERLE'S COMBO PARTS": [
    ["Schnitz", 0],
    ["Large Chips", 0],
  ],
};

const SAUCES = ["Merle's Peri-mayo", "MMMbop Sauce", "Mushroom Sauce"];
const DRINKS = ["Coke", "Coke ZERO", "Fanta", "Creme Soda", "Still water", "Sparkling Water"]; // Tommy Sugo's items

// Modifier group name → the products in it. A fixed part has one product, chosen already. Names must be unique
// across the whole Yoco account, Tommy Sugo's groups included.
const GROUPS = {
  "Combo: Schnitz and Chips": { products: ["Schnitz and Chips"], fixed: true },
  "Combo: Schnitz and Chips 2": { products: ["Schnitz and Chips"], fixed: true },
  "Combo: Schnitz": { products: ["Schnitz"], fixed: true },
  "Combo: Schnitz 2": { products: ["Schnitz"], fixed: true },
  "Combo: Schnitz 3": { products: ["Schnitz"], fixed: true },
  "Combo: Schnitz 4": { products: ["Schnitz"], fixed: true },
  "Combo: Large Chips": { products: ["Large Chips"], fixed: true },
  "Combo: Large Chips 2": { products: ["Large Chips"], fixed: true },
  "Combo: Salad": { products: ["Merle's 3 Classic Salad"], fixed: true },
  "Sauce": { products: SAUCES },
  "Second Sauce": { products: SAUCES },
  "Cold Drink": { products: DRINKS },
};

const COMBOS = {
  "MERLE'S COMBOS": [
    ["Solo Schnitz Combo", 130, ["Combo: Schnitz and Chips", "Sauce", "Cold Drink"]],
    ["Schnitz for Two", 240, ["Combo: Schnitz and Chips", "Combo: Schnitz and Chips 2", "Sauce", "Second Sauce"]],
    ["Family Schnitz", 420, [
      "Combo: Schnitz", "Combo: Schnitz 2", "Combo: Schnitz 3", "Combo: Schnitz 4",
      "Combo: Large Chips", "Combo: Large Chips 2", "Combo: Salad",
    ]],
  ],
};

const key = process.env.YOCO_API_KEY;
const create = process.argv.includes("--create");
if (!key) {
  console.error("Set YOCO_API_KEY to the Yoco API key for the Tommy Sugo account.");
  process.exit(1);
}

async function yoco(path, init = {}) {
  const res = await fetch(API + path, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const detail = [body?.detail, ...(body?.errors ?? []).map((e) => e.detail)].filter(Boolean).join(" ");
    throw new Error(`${init.method ?? "GET"} ${path.split("?")[0]}: Yoco said ${res.status}. ${detail}`);
  }
  return body;
}

async function listAll(path, extra = "") {
  const all = [];
  let cursor = null;
  do {
    const page = await yoco(`${path}?limit=100${extra}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    all.push(...(page.data ?? []));
    cursor = page.next_cursor ?? null;
  } while (cursor);
  return all;
}

const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
const findByName = (list, name) => list.find((x) => sameName(x.name, name));
const money = (rand) => ({ amount: Math.round(rand * 100), currency: "ZAR" });

const items = await listAll("/v1/items/", "&expand=location_availability");
const categories = await listAll("/v1/item_categories/");
const groups = await listAll("/v1/modifier_groups/");

const template = findByName(items, TEMPLATE_ITEM);
if (!template) throw new Error(`Couldn't find ${TEMPLATE_ITEM} to copy tax and location settings from.`);
const taxIds = (template.taxes ?? []).map((t) => t.id);
const availability = template.location_availability
  ? {
    is_available_at_all_locations: template.location_availability.is_available_at_all_locations,
    excluded_location_ids: template.location_availability.excluded_location_ids ?? [],
    included_location_ids: template.location_availability.included_location_ids ?? [],
  }
  : null;

// Stops before anything is created if a drink the combos need isn't in Yoco.
for (const name of DRINKS) {
  if (!findByName(items, name)) throw new Error(`Couldn't find the drink "${name}" in Yoco.`);
}

console.log(create ? "Creating:" : "Would create (dry run, add --create to do it):");
console.log(`  Tax and locations copied from ${template.name}: ` +
  `${taxIds.length ? (template.taxes ?? []).map((t) => `${t.name} ${t.percentage}% ${t.type}`).join(", ") : "business default tax"}, ` +
  `${availability && !availability.is_available_at_all_locations ? `${availability.included_location_ids.length} location(s)` : "all locations"}.`);

const counts = { items: 0, groups: 0, skipped: 0 };

async function category(name) {
  const found = findByName(categories, name);
  if (found) return found;
  console.log(`  + category ${name}`);
  if (!create) return { id: `(new ${name})`, name };
  const made = await yoco("/v1/item_categories/", { method: "POST", body: JSON.stringify({ name }) });
  categories.push(made);
  return made;
}

async function item(categoryName, name, rand, groupIds = []) {
  if (findByName(items, name)) {
    console.log(`  = ${name} is already in Yoco, left alone`);
    counts.skipped++;
    return;
  }
  const cat = await category(categoryName);
  console.log(`  + ${categoryName} · ${name} · R${rand}${groupIds.length ? ` · ${groupIds.length} groups` : ""}`);
  counts.items++;
  if (!create) {
    items.push({ name, variants: [{ id: `(new ${name})` }] });
    return;
  }
  const made = await yoco("/v1/items/", {
    method: "POST",
    body: JSON.stringify({
      name,
      type: "product",
      default_price: money(rand),
      category_id: cat.id,
      tax_ids: taxIds.length ? taxIds : null,
      location_availability: availability,
      modifier_groups: groupIds.length ? groupIds.map((id, i) => ({ id, ordinal: i })) : null,
    }),
  });
  items.push(made);
}

function variantOf(name) {
  const found = findByName(items, name);
  const variants = found?.variants ?? [];
  if (variants.length !== 1) throw new Error(`"${name}" needs exactly one variant in Yoco to be part of a combo.`);
  return variants[0].id;
}

async function group(name) {
  const found = findByName(groups, name);
  if (found) {
    console.log(`  = group ${name} is already in Yoco, left alone`);
    counts.skipped++;
    return found.id;
  }
  const { products, fixed } = GROUPS[name];
  console.log(`  + group ${name}: ${fixed ? products[0] + " (included)" : "choose 1 of " + products.join(", ")}`);
  counts.groups++;
  const body = {
    name,
    min_selections: 1,
    max_selections: 1,
    modifiers: products.map((product, i) => ({
      name: product,
      ordinal: i,
      pricing_strategy: "free",
      variant_id: variantOf(product),
      is_selected_by_default: !!fixed,
    })),
  };
  if (!create) return `(new ${name})`;
  const made = await yoco("/v1/modifier_groups/", { method: "POST", body: JSON.stringify(body) });
  groups.push(made);
  return made.id;
}

for (const [categoryName, entries] of Object.entries(MENU)) {
  for (const [name, rand] of entries) await item(categoryName, name, rand);
}
const groupIds = {};
for (const name of Object.keys(GROUPS)) groupIds[name] = await group(name);
for (const [categoryName, entries] of Object.entries(COMBOS)) {
  for (const [name, rand, parts] of entries) await item(categoryName, name, rand, parts.map((p) => groupIds[p]));
}

console.log(`${create ? "Created" : "Would create"} ${counts.items} items and ${counts.groups} modifier groups. ` +
  `${counts.skipped} already there.`);
