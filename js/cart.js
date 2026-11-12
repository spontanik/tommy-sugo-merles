/* The order (cart) shared by every page that sells: Tommy Sugo, Merle's and the combined Shop. One order can hold both
   brands, so it has to follow the customer between tommy.spontanik.co.za, merles.spontanik.co.za and spontanik.co.za.
   Browser storage is per address, so it's kept in cookies set for the whole spontanik.co.za domain instead (split over
   a few cookies, as each is limited to about 4 KB). On a local copy it's simply cookies for that one address.

   A line: { key, brand, kind ("menu" | "shop"), id, qty, variantId, modifierIds, name, each, stock }
     - key: brand|kind|id for a plain item; brand|id|variant|modifiers for a choice made in the options dialog.
     - each (price) and stock are for showing only: the server prices the order again from the database.
   Cart.lines(), Cart.qty(brand, kind, id), Cart.setQty(item, qty), Cart.add(line), Cart.refresh(item),
   Cart.remove(key), Cart.clear(), Cart.count(). Pages re-read it when they come back into view. */
(function () {
  var NAME = "tsm_cart";
  var CHUNK = 3000;   // characters per cookie
  var MAX_CHUNKS = 6; // about 18 KB in all
  var DAYS = 3;
  var MAX_QTY = 20;
  var DOMAIN = "spontanik.co.za";
  var host = location.hostname;
  var shared = host === DOMAIN || host.slice(-DOMAIN.length - 1) === "." + DOMAIN;
  var attrs = "; path=/; samesite=lax" + (shared ? "; domain=." + DOMAIN : "") + (location.protocol === "https:" ? "; secure" : "");

  function cookies() {
    var out = {};
    document.cookie.split("; ").forEach(function (c) {
      var i = c.indexOf("=");
      if (i > 0) out[c.slice(0, i)] = c.slice(i + 1);
    });
    return out;
  }

  // Stored compactly; handed out as plain objects.
  function unpack(r) {
    return { key: r[0], brand: r[1], kind: r[2], id: r[3], qty: r[4], variantId: r[5] || null, modifierIds: r[6] || [],
      name: r[7], each: r[8] === null || r[8] === undefined ? null : Number(r[8]), stock: r[9] === null || r[9] === undefined ? null : Number(r[9]) };
  }
  function pack(l) {
    return [l.key, l.brand, l.kind, l.id, l.qty, l.variantId || 0, l.modifierIds && l.modifierIds.length ? l.modifierIds : 0, l.name, l.each, l.stock];
  }

  function lines() {
    var c = cookies();
    var n = parseInt(c[NAME + "_n"], 10) || 0;
    var s = "";
    for (var i = 0; i < n; i++) s += c[NAME + "_" + i] || "";
    try {
      var rows = JSON.parse(decodeURIComponent(s) || "[]");
      return Array.isArray(rows) ? rows.map(unpack).filter(function (l) { return l.qty > 0 && l.brand && l.id; }) : [];
    } catch (e) {
      return [];
    }
  }

  function save(list) {
    var s = encodeURIComponent(JSON.stringify(list.map(pack)));
    var parts = [];
    for (var i = 0; i < s.length; i += CHUNK) parts.push(s.slice(i, i + CHUNK));
    if (parts.length > MAX_CHUNKS) return false; // the order is too big to keep: the change is refused
    var before = parseInt(cookies()[NAME + "_n"], 10) || 0;
    var keep = "; max-age=" + DAYS * 86400 + attrs;
    parts.forEach(function (p, j) { document.cookie = NAME + "_" + j + "=" + p + keep; });
    for (var k = parts.length; k < before; k++) document.cookie = NAME + "_" + k + "=; max-age=0" + attrs;
    document.cookie = NAME + "_n=" + parts.length + keep;
    return true;
  }

  function plainKey(item) { return [item.brand, item.kind, item.id].join("|"); }
  function cap(q, stock) { return Math.max(0, Math.min(MAX_QTY, stock === null || stock === undefined ? MAX_QTY : stock, q)); }

  // A plain item (one with a stepper): how many are in the order, and setting that number.
  function qty(brand, kind, id) {
    var key = plainKey({ brand: brand, kind: kind, id: id });
    var line = lines().filter(function (l) { return l.key === key; })[0];
    return line ? line.qty : 0;
  }
  function setQty(item, q) {
    var key = plainKey(item);
    var list = lines();
    var line = list.filter(function (l) { return l.key === key; })[0];
    q = cap(q, item.stock);
    if (!q) return save(list.filter(function (l) { return l.key !== key; }));
    if (line) {
      line.qty = q; line.name = item.name; line.each = item.each; line.stock = item.stock;
    } else {
      list.push({ key: key, brand: item.brand, kind: item.kind, id: item.id, qty: q, variantId: null, modifierIds: [],
        name: item.name, each: item.each, stock: item.stock });
    }
    return save(list);
  }

  // A choice from the options dialog: added to an identical line if there is one.
  function add(line) {
    var list = lines();
    var same = list.filter(function (l) { return l.key === line.key; })[0];
    if (same) same.qty = cap(same.qty + line.qty, null);
    else list.push(Object.assign({ stock: null, modifierIds: [], variantId: null }, line, { qty: cap(line.qty, null) }));
    return save(list);
  }

  // Keeps a plain line's name, price and stock as the page currently shows them. Writes only when something changed.
  function refresh(item) {
    var key = plainKey(item);
    var list = lines();
    var line = list.filter(function (l) { return l.key === key; })[0];
    if (!line) return;
    var q = cap(line.qty, item.stock);
    if (line.name === item.name && line.each === item.each && line.stock === item.stock && line.qty === q) return;
    line.name = item.name; line.each = item.each; line.stock = item.stock; line.qty = q;
    save(q ? list : list.filter(function (l) { return l.key !== key; }));
  }

  function remove(key) { return save(lines().filter(function (l) { return l.key !== key; })); }
  function clear() { return save([]); }
  function count() { return lines().reduce(function (n, l) { return n + l.qty; }, 0); }

  window.Cart = { lines: lines, qty: qty, setQty: setQty, add: add, refresh: refresh, remove: remove, clear: clear, count: count, MAX_QTY: MAX_QTY };
})();
