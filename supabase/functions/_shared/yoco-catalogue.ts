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
};

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

// Turns Yoco items into catalogue rows, one per variant and one per modifier.
export function catalogueRows(items: Yoco[], brand: string, locationId: string | null): CatalogueRow[] {
  const variantPrices = new Map<string, number | null>();
  const rows: CatalogueRow[] = [];

  for (const item of items) {
    const itemAvailable = availableAt(item.location_availability, locationId);
    const category = item.category?.name ?? null;
    for (const variant of item.variants ?? []) {
      const cents = overrideAt(variant.price_overrides, locationId) ??
        overrideAt(item.price_overrides, locationId) ??
        variant.price?.amount ?? item.default_price?.amount;
      const price = toRand(cents, item.taxes);
      variantPrices.set(variant.id, price);
      const options = (variant.selected_options ?? []).map((o: Yoco) => o.value).filter(Boolean);
      rows.push({
        brand,
        yoco_id: variant.id,
        kind: "variant",
        item_id: item.id,
        name: item.name,
        option_label: options.length ? options.join(" / ") : null,
        category,
        price,
        is_available: variant.is_enabled !== false && itemAvailable &&
          availableAt(variant.location_availability, locationId),
      });
    }
  }

  // Modifiers are shared between items, so each one becomes a single row.
  const seen = new Set<string>();
  for (const item of items) {
    const groups = [...(item.modifier_groups ?? []), ...(item.variants ?? []).flatMap((v: Yoco) => v.modifier_groups ?? [])];
    for (const group of groups) {
      for (const modifier of group.modifiers ?? []) {
        if (seen.has(modifier.id)) continue;
        seen.add(modifier.id);
        let price: number | null = null;
        if (modifier.pricing_strategy === "fixed_price") price = toRand(modifier.fixed_price?.amount, null);
        else if (modifier.pricing_strategy === "free") price = 0;
        else if (modifier.variant_id) price = variantPrices.get(modifier.variant_id) ?? null;
        rows.push({
          brand,
          yoco_id: modifier.id,
          kind: "modifier",
          item_id: null,
          name: modifier.name,
          option_label: null,
          category: "Modifier: " + group.name,
          price,
          is_available: true,
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
