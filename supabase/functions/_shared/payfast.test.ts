import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { notificationSignatureValid, parseNotification, phpUrlencode, signedCheckoutQuery, splitName } from "./payfast.ts";

const md5 = (s: string) => createHash("md5").update(s, "utf8").digest("hex");

test("encodes like PHP's urlencode", () => {
  assert.equal(phpUrlencode("a b"), "a+b");
  assert.equal(phpUrlencode("https://x.co/o?t=1&p=2"), "https%3A%2F%2Fx.co%2Fo%3Ft%3D1%26p%3D2");
  assert.equal(phpUrlencode("O'Brien (2)! *~"), "O%27Brien+%282%29%21+%2A%7E");
  assert.equal(phpUrlencode("1 × Pizza"), "1+%C3%97+Pizza");
  assert.equal(phpUrlencode("a-b_c.d"), "a-b_c.d");
});

test("signs fields in PayFast's order, skipping blanks and trimming", () => {
  const query = signedCheckoutQuery({ item_name: " Order #1 ", amount: "10.00", merchant_key: "k", merchant_id: "1", name_last: "" }, "salt");
  const base = "merchant_id=1&merchant_key=k&amount=10.00&item_name=Order+%231";
  assert.equal(query, `${base}&signature=${md5(base + "&passphrase=salt")}`);
});

test("refuses fields PayFast doesn't know", () => {
  assert.throws(() => signedCheckoutQuery({ merchant_id: "1", surprise: "x" }, null), /surprise/);
});

test("checks a notification's signature over every field before it, blanks included", () => {
  const sent = "m_payment_id=abc&pf_payment_id=99&payment_status=COMPLETE&item_name=Tommy+Sugo+order+%231001&item_description=&amount_gross=125.00&merchant_id=10000100";
  const signature = md5(sent + "&passphrase=jt7NOE43FZPn");
  const parsed = parseNotification(`${sent}&signature=${signature}`);
  assert.equal(parsed.paramString, sent);
  assert.equal(parsed.fields.item_name, "Tommy Sugo order #1001");
  assert.ok(notificationSignatureValid(parsed.paramString, parsed.signature, "jt7NOE43FZPn"));
  assert.ok(!notificationSignatureValid(parsed.paramString, parsed.signature, "wrong"));
  const tampered = parseNotification(`${sent.replace("125.00", "1.00")}&signature=${signature}`);
  assert.ok(!notificationSignatureValid(tampered.paramString, tampered.signature, "jt7NOE43FZPn"));
  assert.ok(!notificationSignatureValid(sent, null, "jt7NOE43FZPn"));
});

test("splits a full name for PayFast", () => {
  assert.deepEqual(splitName("  Thandi  van der Merwe "), { first: "Thandi", last: "van der Merwe" });
  assert.deepEqual(splitName("Cher"), { first: "Cher", last: "" });
});
