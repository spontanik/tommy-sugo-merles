// PayFast custom integration: the signed payment request that sends a customer to PayFast, and the checks on the
// payment notification (ITN) PayFast posts back. See https://developers.payfast.co.za/docs (Custom Integration).
import { createHash } from "node:crypto";

export const PAYFAST_HOSTS = { live: "www.payfast.co.za", sandbox: "sandbox.payfast.co.za" } as const;
export type PayfastMode = keyof typeof PAYFAST_HOSTS;

// PayFast refuses payments under R5.
export const PAYFAST_MIN_CENTS = 500;

// The order PayFast lists its checkout fields in. The signature has to follow it, not alphabetical order.
const FIELD_ORDER = [
  "merchant_id", "merchant_key", "return_url", "cancel_url", "notify_url", "fica_idnumber",
  "name_first", "name_last", "email_address", "cell_number",
  "m_payment_id", "amount", "item_name", "item_description",
  "custom_int1", "custom_int2", "custom_int3", "custom_int4", "custom_int5",
  "custom_str1", "custom_str2", "custom_str3", "custom_str4", "custom_str5",
  "email_confirmation", "confirmation_address", "payment_method",
];

// PHP's urlencode, which PayFast's signatures are built with: upper-case escapes, spaces as "+", and nothing left
// unescaped except letters, digits and "-_.".
export function phpUrlencode(value: string) {
  return encodeURIComponent(value)
    .replace(/[!'()*~]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/%20/g, "+");
}

const md5 = (text: string) => createHash("md5").update(text, "utf8").digest("hex");

// The checkout's query string: non-blank fields in PayFast's order, trimmed, plus the signature.
export function signedCheckoutQuery(fields: Record<string, string | undefined>, passphrase: string | null) {
  const unknown = Object.keys(fields).filter((k) => !FIELD_ORDER.includes(k));
  if (unknown.length) throw new Error(`Unknown PayFast field: ${unknown.join(", ")}`);
  const pairs = FIELD_ORDER
    .map((k) => [k, (fields[k] ?? "").trim()] as const)
    .filter(([, v]) => v !== "")
    .map(([k, v]) => `${k}=${phpUrlencode(v)}`);
  const query = pairs.join("&");
  const salted = passphrase ? `${query}&passphrase=${phpUrlencode(passphrase.trim())}` : query;
  return `${query}&signature=${md5(salted)}`;
}

export const checkoutUrl = (mode: PayfastMode, query: string) => `https://${PAYFAST_HOSTS[mode]}/eng/process?${query}`;

// An ITN, parsed in the order PayFast sent it. `paramString` is every field before the signature, encoded the way
// PayFast signs it; it's also what gets posted back to PayFast to confirm the payment.
export function parseNotification(body: string) {
  const fields: Record<string, string> = {};
  const pairs: string[] = [];
  let signature: string | null = null;
  for (const [key, value] of new URLSearchParams(body)) {
    if (key === "signature") {
      signature = value;
      break;
    }
    fields[key] = value;
    pairs.push(`${key}=${phpUrlencode(value)}`);
  }
  return { fields, signature, paramString: pairs.join("&") };
}

export function notificationSignatureValid(paramString: string, signature: string | null, passphrase: string | null) {
  if (!signature) return false;
  const salted = passphrase ? `${paramString}&passphrase=${phpUrlencode(passphrase.trim())}` : paramString;
  return md5(salted) === signature.toLowerCase();
}

// Asks PayFast whether it really sent this notification. Only "VALID" counts.
export async function confirmWithPayfast(mode: PayfastMode, paramString: string) {
  const res = await fetch(`https://${PAYFAST_HOSTS[mode]}/eng/query/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: paramString,
  });
  return res.ok && (await res.text()).trim() === "VALID";
}

// Splits "Thandi van der Merwe" into PayFast's first and last name fields.
export function splitName(name: string) {
  const parts = name.trim().split(/\s+/);
  return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
}
