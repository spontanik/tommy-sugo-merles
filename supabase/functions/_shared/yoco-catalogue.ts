// Pure logic for the Yoco sync, with no Deno or network dependencies so it can be tested on its own.

export type CatalogueRow = {
  brand: string;
  yoco_id: string;
  kind: "variant" | "modifier";
  item_id: string | null;
  name: string;
  option_label: string | null;
  category: string | null;
  price: number | null;
  is_available: boolean;
  modifier_groups: ModifierGroup[] | null;
};

// The choices a customer makes on one variant, in Yoco's order. A group is required when min is above 0, and max is
// null when there's no limit.
export type ModifierGroup = {
  id: string;
  name: string;
  min: number;
  max: number | null;
  modifiers: { id: string; name: string; price: number; selected: boolean }[];
};

// Yoco variants a brand doesn't sell online. They stay on the till but never reach the website or the admin.
const HIDDEN_OPTIONS: Record<string, string[]> = { tommy: ["Medium"] };

// deno-lint-ignore no-explicit-any
type Yoco = any;

function availableAt(availability: Yoco, locationId: string | null): boolean {
  if (!locationId || !availability) return true;
  if (availability.is_available_at_all_locations) {
    return !(availability.excluded_location_ids ?? []).includes(locationId);
  }
  return (availability.included_location_ids ?? []).includes(locationId);
}

function overrideAt(overrides: Yoco[] | null | undefined, locationId: string | null): number | null {
  if (!locationId) return null;
  const match = (overrides ?? []).find((o) => (o.location_ids ?? []).includes(locationId));
  return match?.price?.amount ?? null;
}

// Yoco prices are in cents. An "additive" tax is charged on top, so add it to get what the customer pays.
function toRand(cents: number | null | undefined, taxes: Yoco[] | null | undefined): number | null {
  if (cents === null || cents === undefined) return null;
  const additive = (taxes ?? [])
    .filter((t) => t.type === "additive")
    .reduce((sum, t) => sum + Number(t.percentage), 0);
  return Math.round(cents * (1 + additive / 100)) / 100;
}

function modifierPrice(modifier: Yoco, variantPrices: Map<string, number | null>): number | null {
  if (modifier.pricing_strategy === "fixed_price") return toRand(modifier.fixed_price?.amount, null);
  if (modifier.pricing_strategy === "free") return 0;
  return modifier.variant_id ? variantPrices.get(modifier.variant_id) ?? null : null;
}

const byOrdinal = (a: Yoco, b: Yoco) => (a.ordinal ?? 0) - (b.ordinal ?? 0);

// A variant's choices: the item's groups, which apply to every variant, plus its own. A modifier with no known price
// is left out, so nobody can order it at the wrong price.
function groupsFor(item: Yoco, variant: Yoco, variantPrices: Map<string, number | null>): ModifierGroup[] {
  const seen = new Set<string>();
  return [...(item.modifier_groups ?? []), ...(variant.modifier_groups ?? [])]
    .filter((g: Yoco) => !seen.has(g.id) && seen.add(g.id))
    .sort(byOrdinal)
    .map((g: Yoco) => ({
      id: g.id,
      name: g.name,
      min: g.min_selections ?? 0,
      max: g.max_selections ?? null,
      modifiers: [...(g.modifiers ?? [])].sort(byOrdinal)
        .map((m: Yoco) => ({ m, price: modifierPrice(m, variantPrices) }))
        .filter(({ price }) => price !== null)
        .map(({ m, price }) => ({ id: m.id, name: m.name, price: price as number, selected: !!m.is_selected_by_default })),
    }))
    .filter((g) => g.modifiers.length);
}

// Turns Yoco items into catalogue rows, one per variant and one per modifier.
export function catalogueRows(items: Yoco[], brand: string, locationId: string | null): CatalogueRow[] {
  const hidden = HIDDEN_OPTIONS[brand] ?? [];
  const variantPrices = new Map<string, number | null>();
  const rows: CatalogueRow[] = [];
  const isOffered = (variant: Yoco) =>
    !(variant.selected_options ?? []).some((o: Yoco) => hidden.includes(o.value));

  // Prices first: a modifier can take its price from a variant of any item, including a hidden one.
  for (const item of items) {
    for (const variant of item.variants ?? []) {
      const cents = overrideAt(variant.price_overrides, locationId) ??
        overrideAt(item.price_overrides, locationId) ??
        variant.price?.amount ?? item.default_price?.amount;
      variantPrices.set(variant.id, toRand(cents, item.taxes));
    }
  }

  for (const item of items) {
    const itemAvailable = availableAt(item.location_availability, locationId);
    const category = item.category?.name ?? null;
    for (const variant of (item.variants ?? []).filter(isOffered)) {
      const options = (variant.selected_options ?? []).map((o: Yoco) => o.value).filter(Boolean);
      rows.push({
        brand,
        yoco_id: variant.id,
        kind: "variant",
        item_id: item.id,
        name: item.name,
        option_label: options.length ? options.join(" / ") : null,
        category,
        price: variantPrices.get(variant.id) ?? null,
        is_available: variant.is_enabled !== false && itemAvailable &&
          availableAt(variant.location_availability, locationId),
        modifier_groups: groupsFor(item, variant, variantPrices),
      });
    }
  }

  // Modifiers are shared between items, so each one becomes a single row.
  const seen = new Set<string>();
  for (const item of items) {
    const groups = [...(item.modifier_groups ?? []), ...(item.variants ?? []).filter(isOffered).flatMap((v: Yoco) => v.modifier_groups ?? [])];
    for (const group of groups) {
      for (const modifier of group.modifiers ?? []) {
        if (seen.has(modifier.id)) continue;
        seen.add(modifier.id);
        rows.push({
          brand,
          yoco_id: modifier.id,
          kind: "modifier",
          item_id: null,
          name: modifier.name,
          option_label: null,
          category: "Modifier: " + group.name,
          price: modifierPrice(modifier, variantPrices),
          is_available: true,
          modifier_groups: null,
        });
      }
    }
  }
  return rows;
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

// Standard Webhooks signature check: https://developer.yoco.com/docs/api/webhooks/verifying-events
export async function verifyWebhook(args: {
  secret: string;
  id: string | null;
  timestamp: string | null;
  signatures: string | null;
  body: string;
  nowSeconds: number;
  toleranceSeconds?: number;
}): Promise<boolean> {
  const { secret, id, timestamp, signatures, body, nowSeconds, toleranceSeconds = 300 } = args;
  if (!id || !timestamp || !signatures) return false;
  const sent = Number(timestamp);
  if (!Number.isFinite(sent) || Math.abs(nowSeconds - sent) > toleranceSeconds) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    fromBase64(secret.split("_")[1] ?? ""),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signed = new TextEncoder().encode(`${id}.${timestamp}.${body}`);
  for (const signature of signatures.split(" ")) {
    const [version, value] = signature.split(",");
    if (version !== "v1" || !value) continue;
    let bytes: Uint8Array;
    try {
      bytes = fromBase64(value);
    } catch {
      continue;
    }
    if (await crypto.subtle.verify("HMAC", key, bytes, signed)) return true;
  }
  return false;
}
