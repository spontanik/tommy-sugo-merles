// Pure logic for the product list and the Menu check, with no Deno or network dependencies so it can be tested on its
// own: reading Xero's and Lightspeed's items, filling the product list the first time, and comparing every product
// with what Xero, Yoco and Lightspeed hold for its SKU.

// deno-lint-ignore no-explicit-any
type Raw = any;

export type Product = {
  sku: string;
  brand: string | null;
  name: string;
  family: string | null;
  option_label: string | null;
  kind: "item" | "extra" | "combo" | "part";
  category: string | null;
  xero_account: string | null;
  price: number | null;
  description: string;
  is_active: boolean;
  yoco_id?: string | null;
  lightspeed_id?: number | null;
};

export type XeroItem = {
  code: string;
  xero_id: string;
  name: string | null;
  description: string | null;
  sales_price: number | null;
  sales_account: string | null;
  tax_type: string | null;
  is_sold: boolean;
  xero_updated_at: string | null;
};

export type YocoRow = {
  brand: string;
  yoco_id: string;
  kind: "variant" | "modifier";
  item_id: string | null;
  sku: string | null;
  name: string;
  option_label: string | null;
  category: string | null;
  price: number | null;
  is_available: boolean;
  is_deleted: boolean;
};

export type LightspeedItem = {
  id: number;
  sku: string | null;
  name: string | null;
  docket_name: string | null;
  price: number | null;
  accounting_group: string | null;
  item_type: string | null;
  active: boolean;
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

// Xero dates come as "/Date(1573755038314+0000)/".
function xeroDate(v: unknown): string | null {
  const m = typeof v === "string" ? v.match(/\/Date\((-?\d+)/) : null;
  if (m) return new Date(Number(m[1])).toISOString();
  return typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null;
}

// One item from GET /api.xro/2.0/Items. Null for anything without a code or id.
export function xeroItemRow(raw: Raw): XeroItem | null {
  const pick = (k: string) => raw?.[k] ?? raw?.[k.charAt(0).toLowerCase() + k.slice(1)];
  const sales = pick("SalesDetails") ?? {};
  const code = text(pick("Code"));
  const id = text(pick("ItemID"));
  if (!code || !id) return null;
  return {
    code,
    xero_id: id,
    name: text(pick("Name")),
    description: text(pick("Description")),
    sales_price: num(sales.UnitPrice ?? sales.unitPrice),
    sales_account: text(sales.AccountCode ?? sales.accountCode),
    tax_type: text(sales.TaxType ?? sales.taxType),
    is_sold: pick("IsSold") !== false,
    xero_updated_at: xeroDate(pick("UpdatedDateUTC")),
  };
}

// Lightspeed's lists come back in a few shapes: a bare array, or an object holding one. This finds the array of
// objects with an id, up to three levels down.
export function findList(json: Raw, depth = 3): Raw[] {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== "object" || depth === 0) return [];
  for (const value of Object.values(json)) {
    if (Array.isArray(value) && value.some((v) => v && typeof v === "object" && "id" in v)) return value;
  }
  for (const value of Object.values(json)) {
    const found = findList(value, depth - 1);
    if (found.length) return found;
  }
  return [];
}

// One item from GET /items/v1/items. Its price is the default price, or failing that the first in its list.
export function lightspeedItemRow(raw: Raw): LightspeedItem | null {
  const id = Number(raw?.id);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const prices: Raw[] = Array.isArray(raw.prices) ? raw.prices : [];
  return {
    id,
    sku: text(raw.sku),
    name: text(raw.name),
    docket_name: text(raw.docketName),
    price: num(raw.defaultPrice ?? prices.find((p) => /default/i.test(String(p?.name ?? "")))?.amount ?? prices[0]?.amount),
    accounting_group: text(raw.accountingGroup?.name),
    item_type: text(raw.itemType),
    active: raw.active !== false,
  };
}

// Xero's codes run by category: two letters and four digits, with the category's first number (PZ2001, CD6010…).
// The "…000" codes are each category's catch-all, and these are fees, tips and services rather than things on a menu.
const NOT_PRODUCTS = new Set(["OT8050", "OT8051", "FE0001", "EV1001", "CB0001"]);
export const isProductCode = (code: string) => /^[A-Z]{2}\d{4}$/.test(code) && !/000$/.test(code) && !NOT_PRODUCTS.has(code);

// What each code prefix is, for products Yoco doesn't describe.
export const PREFIXES: Record<string, { category: string; account: string }> = {
  PZ: { category: "PIZZA", account: "200" },
  PS: { category: "PASTA", account: "201" },
  SH: { category: "MEDITERRANEAN", account: "202" },
  BK: { category: "BREAKFAST", account: "203" },
  OT: { category: "OTHER", account: "203" },
  HD: { category: "HOT DRINKS", account: "230" },
  CD: { category: "COLD DRINKS", account: "231" },
  BR: { category: "BAR", account: "231" },
  AP: { category: "APPRO", account: "240" },
};

const SHARED_CATEGORIES = ["HOT DRINKS", "COLD DRINKS", "BAR"];

function brandOf(category: string | null): string | null {
  const c = (category ?? "").toUpperCase();
  if (c.startsWith("MERLE'S")) return "merles";
  if (SHARED_CATEGORIES.includes(c)) return null;
  return "tommy";
}

function kindOf(code: string, yoco: YocoRow | undefined): Product["kind"] {
  const c = (yoco?.category ?? "").toUpperCase();
  if (c === "MERLE'S COMBO PARTS") return "part";
  if (c === "MERLE'S COMBOS") return "combo";
  if (yoco?.kind === "modifier" || /^PZ25\d\d$/.test(code) || c === "ADD ON") return "extra";
  return "item";
}

// Yoco keeps a copy of the catalogue for each brand, so the same variant can appear twice. One row per Yoco id.
export function uniqueYoco(rows: YocoRow[]): YocoRow[] {
  const seen = new Map<string, YocoRow>();
  for (const r of rows) {
    const had = seen.get(r.yoco_id);
    if (!had || (had.is_deleted && !r.is_deleted)) seen.set(r.yoco_id, r);
  }
  return [...seen.values()];
}

// The first product list: one product for every Xero item that's sold on a menu. Where a Yoco variant already carries
// the code as its SKU, its price (what customers pay today), category and size come with it.
export function importProducts(xero: XeroItem[], yocoRows: YocoRow[]): Product[] {
  const yoco = uniqueYoco(yocoRows).filter((r) => !r.is_deleted && r.sku);
  const bySku = new Map<string, YocoRow>();
  for (const r of yoco) if (!bySku.has(r.sku!)) bySku.set(r.sku!, r);
  return xero.filter((x) => x.is_sold && isProductCode(x.code)).map((x) => {
    const y = bySku.get(x.code);
    const prefix = PREFIXES[x.code.slice(0, 2)];
    const category = y?.category ?? prefix?.category ?? null;
    const sized = !!(y?.kind === "variant" && y.option_label);
    return {
      sku: x.code,
      brand: y ? brandOf(y.category) : (SHARED_CATEGORIES.includes(prefix?.category ?? "") ? null : "tommy"),
      name: (x.name ?? x.description ?? x.code).slice(0, 50),
      family: sized ? y!.name : null,
      option_label: sized ? y!.option_label : null,
      kind: kindOf(x.code, y),
      category,
      xero_account: x.sales_account ?? prefix?.account ?? null,
      price: y?.price ?? (x.sales_price ? x.sales_price : null),
      description: x.description ?? "",
      is_active: true,
      yoco_id: y?.yoco_id ?? null,
    };
  });
}

// The next free code with the same two letters and first digit, e.g. PZ2034 after PZ2033.
export function nextCode(prefix: string, taken: Iterable<string>): string | null {
  const p = prefix.toUpperCase();
  if (!/^[A-Z]{2}\d$/.test(p)) return null;
  let top = Number(p[2]) * 1000;
  for (const code of taken) if (code.startsWith(p) && /^[A-Z]{2}\d{4}$/.test(code)) top = Math.max(top, Number(code.slice(2)));
  const next = top + 1;
  return next < (Number(p[2]) + 1) * 1000 ? p.slice(0, 2) + String(next) : null;
}

export type Issue = { system: "admin" | "xero" | "yoco" | "lightspeed"; level: "missing" | "differs" | "note"; text: string };

export type CheckRow = {
  sku: string;
  product: Product;
  xero: XeroItem | null;
  yoco: YocoRow[];
  lightspeed: LightspeedItem | null;
  issues: Issue[];
};

export type Sources = { xero: boolean; yoco: boolean; lightspeed: boolean };

const same = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? "").trim().replace(/\s+/g, " ").toLowerCase() === (b ?? "").trim().replace(/\s+/g, " ").toLowerCase();
const rands = (n: number | null | undefined) => (n === null || n === undefined ? "no price" : "R" + n.toFixed(2).replace(/\.00$/, ""));
const priceDiffers = (a: number | null | undefined, b: number | null | undefined) =>
  a !== null && a !== undefined && Math.abs((b ?? -1) - a) >= 0.005;

// Compares every product with the other systems. A system that isn't connected (or hasn't been read yet) isn't
// checked, so it can't fill the list with "missing".
export function menuCheck(
  products: Product[],
  xero: XeroItem[],
  yocoRows: YocoRow[],
  lightspeed: LightspeedItem[],
  sources: Sources,
) {
  const xeroByCode = new Map(xero.map((x) => [x.code, x]));
  const yoco = uniqueYoco(yocoRows).filter((r) => !r.is_deleted);
  const yocoBySku = new Map<string, YocoRow[]>();
  for (const r of yoco) if (r.sku) yocoBySku.set(r.sku, [...(yocoBySku.get(r.sku) ?? []), r]);
  const lsBySku = new Map<string, LightspeedItem[]>();
  for (const l of lightspeed) if (l.sku) lsBySku.set(l.sku, [...(lsBySku.get(l.sku) ?? []), l]);

  const rows: CheckRow[] = products.filter((p) => p.is_active).map((p) => {
    const issues: Issue[] = [];
    const x = xeroByCode.get(p.sku) ?? null;
    const ys = yocoBySku.get(p.sku) ?? [];
    const ls = lsBySku.get(p.sku) ?? [];
    const l = ls[0] ?? null;

    if (p.price === null) issues.push({ system: "admin", level: "missing", text: "No price set." });
    if (!p.xero_account) issues.push({ system: "admin", level: "missing", text: "No Xero sales account set." });

    if (sources.xero) {
      if (!x) issues.push({ system: "xero", level: "missing", text: "No Xero item has this code." });
      else {
        if (!same(x.name, p.name)) issues.push({ system: "xero", level: "differs", text: `Named “${x.name ?? ""}” in Xero.` });
        if (priceDiffers(p.price, x.sales_price)) issues.push({ system: "xero", level: "differs", text: `${rands(x.sales_price)} in Xero, ${rands(p.price)} here.` });
        if (p.xero_account && x.sales_account !== p.xero_account) {
          issues.push({ system: "xero", level: "differs", text: `Sales account ${x.sales_account ?? "not set"} in Xero, ${p.xero_account} here.` });
        }
        if (!x.is_sold) issues.push({ system: "xero", level: "differs", text: "Not marked as sold in Xero." });
      }
    }

    if (sources.yoco) {
      if (!ys.length) issues.push({ system: "yoco", level: "missing", text: "No Yoco item has this SKU." });
      if (ys.length > 1) issues.push({ system: "yoco", level: "differs", text: `${ys.length} Yoco items share this SKU.` });
      for (const y of ys) {
        if (y.kind === "variant") {
          const wantName = p.family ?? p.name;
          if (!same(y.name, wantName) || !same(y.option_label, p.option_label)) {
            issues.push({ system: "yoco", level: "note", text: `Called “${y.name}${y.option_label ? " · " + y.option_label : ""}” in Yoco.` });
          }
        }
        if (priceDiffers(p.price, y.price) && p.kind !== "part") {
          issues.push({ system: "yoco", level: "differs", text: `${rands(y.price)} in Yoco, ${rands(p.price)} here.` });
        }
        if (!y.is_available) issues.push({ system: "yoco", level: "note", text: "Switched off in Yoco." });
      }
    }

    if (sources.lightspeed) {
      if (!l) issues.push({ system: "lightspeed", level: "missing", text: "No Lightspeed item has this SKU." });
      else {
        if (ls.length > 1) issues.push({ system: "lightspeed", level: "differs", text: `${ls.length} Lightspeed items share this SKU.` });
        if (!same(l.name, p.name)) issues.push({ system: "lightspeed", level: "note", text: `Named “${l.name ?? ""}” in Lightspeed.` });
        if (priceDiffers(p.price, l.price)) issues.push({ system: "lightspeed", level: "differs", text: `${rands(l.price)} in Lightspeed, ${rands(p.price)} here.` });
        if (!l.active) issues.push({ system: "lightspeed", level: "differs", text: "Archived in Lightspeed." });
      }
    }
    return { sku: p.sku, product: p, xero: x, yoco: ys, lightspeed: l, issues };
  });

  // What the other systems have that the product list doesn't.
  const known = new Set(products.map((p) => p.sku));
  const extra = {
    xero: sources.xero ? xero.filter((x) => x.is_sold && !known.has(x.code)) : [],
    yoco: sources.yoco
      ? yoco.filter((y) => (y.kind === "variant" || y.sku) && (!y.sku || !known.has(y.sku)))
      : [],
    lightspeed: sources.lightspeed ? lightspeed.filter((l) => l.active && l.sku && !known.has(l.sku)) : [],
    lightspeedNoSku: sources.lightspeed ? lightspeed.filter((l) => l.active && !l.sku).length : 0,
  };
  return { rows, extra };
}
