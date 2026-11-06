/* Loads the live menu and shop items from Supabase and draws them into the page.
   The page's own HTML is the fallback: if Supabase isn't configured or can't be reached, nothing changes.
   Hooks in the page:
     [data-menu-items="section-key"]  (optional data-part="1" / "2" to split a section over two columns)
     [data-shop-items="section-key"]  the .products grid for that shop section
     [data-price-of="Item name"]      a price elsewhere on the page (e.g. featured cards) kept in sync with the menu */
(function () {
  var conf = window.SITE_SUPABASE || {};
  var brand = document.body.getAttribute("data-brand");
  if (!brand || !conf.url || !conf.key || /YOUR-/.test(conf.url + conf.key)) return;

  var cfg = window.CATALOG_CONFIG.brands[brand];

  var style = document.createElement("style");
  style.textContent =
    ".item-thumb{display:block;width:100%;max-height:200px;object-fit:cover;margin-bottom:8px}" +
    ".pz .item-thumb{grid-column:1/-1}" +
    ".product.sold-out .ill{opacity:.45}" +
    ".product .sold{font-weight:700;text-transform:uppercase;letter-spacing:.08em;font-size:13px}" +
    ".order-opts{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 4px}" +
    ".order-opt{display:flex;align-items:center;gap:8px}" +
    ".pill.order-add{min-height:44px;padding:0 14px;font-size:14px}" +
    ".order-size{font-weight:700;font-size:14px}" +
    ".order-opt.has-qty .order-add,.order-opt:not(.has-qty) .order-size,.order-opt:not(.has-qty) .stepper{display:none}";
  document.head.appendChild(style);

  function get(table) {
    var q = conf.url.replace(/\/$/, "") + "/rest/v1/" + table +
      "?select=*&brand=eq." + brand + "&is_hidden=eq.false&order=sort_order.asc,name.asc";
    return fetch(q, { headers: { apikey: conf.key, Authorization: "Bearer " + conf.key } }).then(function (r) {
      if (!r.ok) throw new Error(table + " " + r.status);
      return r.json();
    });
  }

  function money(v) {
    if (v === null || v === undefined || v === "") return null;
    var n = Number(v);
    return "R" + (n % 1 ? n.toFixed(2) : String(n));
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  // Item images may be uploads (full URLs) or the site's own files (relative paths).
  function img(src, cls, alt) {
    var i = el("img", cls);
    i.src = src;
    i.alt = alt || "";
    i.loading = "lazy";
    i.decoding = "async";
    return i;
  }

  function priceSpan(cls, v) {
    var s = el("span", cls, money(v) || "–");
    if (!money(v)) s.setAttribute("aria-label", "Not available");
    return s;
  }

  function stepper(label) {
    var st = el("div", "stepper");
    var minus = el("button", null, "−");
    minus.type = "button"; minus.setAttribute("data-step", "-1"); minus.setAttribute("aria-label", "One less " + label);
    var out = el("output", null, "0"); out.setAttribute("aria-live", "polite");
    var plus = el("button", null, "+");
    plus.type = "button"; plus.setAttribute("data-step", "1"); plus.setAttribute("aria-label", "One more " + label);
    st.appendChild(minus); st.appendChild(out); st.appendChild(plus);
    return st;
  }

  // Add buttons for a menu item the team has marked orderable: one per size that has a Collect price.
  function orderControls(it, kind) {
    if (!it.is_orderable) return null;
    var choices = kind === "pizza"
      ? [{ size: "Large", cart: it.name + ", large", price: it.price }, { size: "Medium", cart: it.name + ", medium", price: it.price_medium }]
      : [{ size: "", cart: it.name, price: it.price }];
    choices = choices.filter(function (c) { return money(c.price); });
    if (!choices.length) return null;
    var wrap = el("div", "order-opts");
    choices.forEach(function (c) {
      var opt = el("div", "order-opt");
      opt.setAttribute("data-product", c.cart);
      opt.setAttribute("data-price", String(Number(c.price)));
      opt.setAttribute("data-food", "");
      var add = el("button", "pill order-add", c.size ? "+ " + c.size + " " + money(c.price) : "+ Add");
      add.type = "button";
      add.setAttribute("data-step", "1");
      add.setAttribute("aria-label", "Add " + c.cart + " to your order, " + money(c.price));
      opt.appendChild(add);
      if (c.size) opt.appendChild(el("span", "order-size", c.size));
      opt.appendChild(stepper(c.cart));
      wrap.appendChild(opt);
    });
    return wrap;
  }

  function menuItem(it, kind) {
    var order = orderControls(it, kind);
    var hasDesc = !!(it.description && it.description.trim());
    var desc = hasDesc ? el("p", "desc", it.description) : null;
    var thumb = it.image_url ? img(it.image_url, "item-thumb", it.name) : null;

    if (brand === "tommy" && kind !== "single") {
      var pz = el("div", kind === "cd" ? "pz two" : "pz");
      if (thumb) pz.appendChild(thumb);
      pz.appendChild(el("span", "name", it.name));
      var cols = kind === "cd" ? ["price", "price_deliver"] : ["price", "price_deliver", "price_medium", "price_medium_deliver"];
      cols.forEach(function (c) { pz.appendChild(priceSpan("p", it[c])); });
      if (desc) pz.appendChild(desc);
      if (order) pz.appendChild(order);
      return pz;
    }

    var row = el("div", "row" + (hasDesc || thumb ? "" : " small") + (kind === "cd" ? " pr" : ""));
    row.appendChild(el("span", null, it.name));
    row.appendChild(priceSpan(null, it.price));
    if (kind === "cd") row.appendChild(priceSpan(null, it.price_deliver));
    if (!hasDesc && !thumb && !order) return row;
    var item = el("div", "item");
    if (thumb) item.appendChild(thumb);
    item.appendChild(row);
    if (desc) item.appendChild(desc);
    if (order) item.appendChild(order);
    return item;
  }

  function shopItem(it) {
    var label = it.cart_name || it.name;
    var a = el("article", "product" + (it.is_sold_out ? " sold-out" : ""));
    a.setAttribute("data-product", label);
    if (money(it.price)) a.setAttribute("data-price", String(Number(it.price)));
    if (it.image_url) a.appendChild(img(it.image_url, "ill", it.image_alt));
    var body = el("div", "product-body");
    body.appendChild(el("h3", null, it.name));
    if (it.description) body.appendChild(el("p", "desc", it.description));
    var foot = el("div", "product-foot");
    foot.appendChild(el("span", "price", money(it.price) || "TBC"));
    if (it.is_sold_out) {
      foot.appendChild(el("span", "sold", "Sold out"));
    } else {
      foot.appendChild(stepper(it.name));
    }
    body.appendChild(foot);
    a.appendChild(body);
    return a;
  }

  function bySection(rows) {
    var map = {};
    rows.forEach(function (r) { (map[r.section] = map[r.section] || []).push(r); });
    return map;
  }

  function drawMenu(rows) {
    var map = bySection(rows);
    cfg.menu.forEach(function (sec) {
      var slots = document.querySelectorAll('[data-menu-items="' + sec.key + '"]');
      if (!slots.length) return;
      var items = map[sec.key] || [];
      var per = Math.ceil(items.length / slots.length);
      slots.forEach(function (slot, i) {
        slot.textContent = "";
        items.slice(i * per, (i + 1) * per).forEach(function (it) { slot.appendChild(menuItem(it, sec.prices)); });
      });
    });
    var byName = {};
    rows.forEach(function (r) { byName[r.name.trim().toLowerCase()] = r; });
    document.querySelectorAll("[data-price-of]").forEach(function (s) {
      var r = byName[s.getAttribute("data-price-of").trim().toLowerCase()];
      if (r && money(r.price)) s.textContent = money(r.price);
    });
  }

  function drawShop(rows) {
    // Keep anything already in the cart if the shopper was quick.
    var qty = {};
    document.querySelectorAll("[data-product]").forEach(function (p) {
      var o = p.querySelector("output");
      if (o && o.textContent !== "0") qty[p.getAttribute("data-product")] = o.textContent;
    });
    var map = bySection(rows);
    cfg.shop.forEach(function (sec) {
      var grid = document.querySelector('[data-shop-items="' + sec.key + '"]');
      if (!grid) return;
      grid.textContent = "";
      (map[sec.key] || []).forEach(function (it) {
        var a = shopItem(it);
        var o = a.querySelector("output");
        if (o && qty[a.getAttribute("data-product")]) o.textContent = qty[a.getAttribute("data-product")];
        grid.appendChild(a);
      });
    });
  }

  Promise.all([get("menu_items"), get("shop_items")]).then(function (res) {
    drawMenu(res[0]);
    drawShop(res[1]);
    document.dispatchEvent(new CustomEvent("catalog:rendered"));
  }).catch(function (err) {
    console.warn("Live menu unavailable, showing the built-in menu.", err);
  });
})();
