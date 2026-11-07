/* Loads the live menu and shop items from Supabase and draws them into the page.
   The page's own HTML is the fallback: if Supabase isn't configured or can't be reached, nothing changes.
   Hooks in the page:
     [data-menu-items="section-key"]  (optional data-part="1" / "2" to split a section over two columns)
     [data-shop-items="section-key"]  the .products grid for that shop section
     [data-price-of="Item name"]      a price elsewhere on the page (e.g. featured cards) kept in sync with the menu
     [data-section-title="key"]       a section's heading, swapped for the title set in the admin
     [data-section="key other-key"]   hidden with the section, or once all the sections listed are hidden
   Section titles and price columns come from the brands and sections tables, falling back to catalog-config.js.
   New sections and section order don't reach the page: each slot and its illustration is drawn by hand. */
(function () {
  var conf = window.SITE_SUPABASE || {};
  var brand = document.body.getAttribute("data-brand");
  if (!brand || !conf.url || !conf.key || /YOUR-/.test(conf.url + conf.key)) return;

  var cfg = window.CATALOG_CONFIG.brands[brand];
  var sections = { menu: cfg.menu, shop: cfg.shop };
  var gone = {}; // section keys that are hidden or deleted

  var style = document.createElement("style");
  style.textContent =
    "[data-section][hidden]{display:none!important}" +
    ".item-thumb{display:block;width:100%;max-height:200px;object-fit:cover;margin-bottom:8px}" +
    ".pz .item-thumb{grid-column:1/-1}" +
    ".product.sold-out .ill{opacity:.45}" +
    ".product .sold{font-weight:700;text-transform:uppercase;letter-spacing:.08em;font-size:13px}" +
    ".order-opts{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 4px}" +
    ".order-opt{display:flex;align-items:center;gap:8px}" +
    ".pill.order-add{min-height:44px;padding:0 14px;font-size:14px}" +
    ".order-count{font-weight:700;font-size:14px}" +
    ".order-opt[data-product].has-qty .order-add,.order-opt[data-product]:not(.has-qty) .stepper{display:none}";
  document.head.appendChild(style);

  function get(table) {
    var q = conf.url.replace(/\/$/, "") + "/rest/v1/" + table +
      "?select=*&brand=eq." + brand + "&is_hidden=eq.false&order=sort_order.asc,name.asc";
    return fetch(q, { headers: { apikey: conf.key, Authorization: "Bearer " + conf.key } }).then(function (r) {
      if (!r.ok) throw new Error(table + " " + r.status);
      return r.json();
    });
  }

  // Brands and sections are extras: if they can't be read, the page carries on with catalog-config.js.
  function getOptional(path) {
    var q = conf.url.replace(/\/$/, "") + "/rest/v1/" + path;
    return fetch(q, { headers: { apikey: conf.key, Authorization: "Bearer " + conf.key } }).then(function (r) {
      return r.ok ? r.json() : null;
    }).catch(function () { return null; });
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

  // True when Yoco gives this item more than one variant, or anything to choose on the variant.
  function hasChoices(variants) {
    if (!variants || !variants.length) return false;
    return variants.length > 1 || variants.some(function (v) { return (v.groups || []).length; });
  }

  // The Add button for a menu item the team has marked orderable, if it has a Collect price.
  function orderControls(it) {
    if (!it.is_orderable || !money(it.price)) return null;
    var wrap = el("div", "order-opts");
    var opt = el("div", "order-opt");
    var choices = hasChoices(it.yoco_options);
    var add = el("button", "pill order-add", choices ? "+ Choose " + money(it.price) : "+ Add");
    add.type = "button";
    if (choices) {
      // js/order.js opens the options from these, and the cart keeps each choice as its own line.
      opt.setAttribute("data-options", JSON.stringify(it.yoco_options));
      opt.setAttribute("data-option-name", it.name);
      opt.setAttribute("data-option-item", it.id);
      opt.setAttribute("data-option-default", it.yoco_id || "");
      add.setAttribute("data-configure", "");
      add.setAttribute("aria-label", "Choose options for " + it.name + ", from " + money(it.price));
      opt.appendChild(add);
      opt.appendChild(el("span", "order-count"));
    } else {
      opt.setAttribute("data-product", it.name);
      opt.setAttribute("data-price", String(Number(it.price)));
      opt.setAttribute("data-food", "");
      add.setAttribute("data-step", "1");
      add.setAttribute("aria-label", "Add " + it.name + " to your order, " + money(it.price));
      opt.appendChild(add);
      opt.appendChild(stepper(it.name));
    }
    wrap.appendChild(opt);
    return wrap;
  }

  function menuItem(it, kind) {
    var order = orderControls(it);
    var hasDesc = !!(it.description && it.description.trim());
    var desc = hasDesc ? el("p", "desc", it.description) : null;
    var thumb = it.image_url ? img(it.image_url, "item-thumb", it.name) : null;

    if (brand === "tommy" && kind !== "single") {
      var pz = el("div", "pz");
      if (thumb) pz.appendChild(thumb);
      pz.appendChild(el("span", "name", it.name));
      ["price", "price_deliver"].forEach(function (c) { pz.appendChild(priceSpan("p", it[c])); });
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
    // A shop item linked to Yoco has no price while Yoco has it disabled or deleted.
    var soldOut = it.is_sold_out || (it.yoco_id && !money(it.price));
    var a = el("article", "product" + (soldOut ? " sold-out" : ""));
    a.setAttribute("data-product", label);
    if (money(it.price)) a.setAttribute("data-price", String(Number(it.price)));
    if (it.image_url) a.appendChild(img(it.image_url, "ill", it.image_alt));
    var body = el("div", "product-body");
    body.appendChild(el("h3", null, it.name));
    if (it.description) body.appendChild(el("p", "desc", it.description));
    var foot = el("div", "product-foot");
    foot.appendChild(el("span", "price", money(it.price) || "TBC"));
    if (soldOut) {
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

  // Visitors only get visible sections back, so a section the page knows but the table left out is hidden or deleted.
  // The brand row says the tables are in place and seeded; without it, nothing here changes.
  function applySections(brandRows, sectionRows) {
    if (!brandRows || !brandRows.length || !sectionRows) return;
    ["menu", "shop"].forEach(function (kind) {
      var fromConfig = cfg[kind];
      var live = sectionRows.filter(function (s) { return s.kind === kind; }).map(function (s) {
        return { key: s.key, title: s.title, prices: s.prices };
      });
      var keys = live.map(function (s) { return s.key; });
      fromConfig.forEach(function (s) {
        if (keys.indexOf(s.key) < 0) gone[s.key] = true;
      });
      live.forEach(function (s) {
        drawTitle(s);
        if (kind === "menu") drawColumns(s, fromConfig.filter(function (c) { return c.key === s.key; })[0]);
      });
      sections[kind] = live;
    });
    document.querySelectorAll("[data-section]").forEach(function (box) {
      box.hidden = box.getAttribute("data-section").split(" ").every(function (k) { return gone[k]; });
    });
    Object.keys(gone).forEach(function (key) {
      // Emptied as well as hidden, so nothing in a hidden section can stay in the cart.
      document.querySelectorAll('[data-menu-items="' + key + '"],[data-shop-items="' + key + '"]').forEach(function (slot) { slot.textContent = ""; });
    });
  }

  function drawTitle(sec) {
    document.querySelectorAll('[data-section-title="' + sec.key + '"]').forEach(function (head) {
      // Merle's headings are set in capitals. Tommy Sugo's pizza groups sit under "Pizza", so they drop the prefix.
      var text = brand === "merles" ? sec.title.toUpperCase() : sec.title;
      if (head.classList.contains("grp")) text = text.split(" · ").pop();
      if (head.textContent.replace(/\s+/g, " ").trim() === text) return;
      var ill = head.querySelector(".sec-ill");
      head.textContent = "";
      if (!ill) { head.textContent = text; return; }
      // Keep the illustration on the same line as the last word.
      var words = text.split(" ");
      var end = el("span", "head-end", words.pop());
      end.appendChild(ill);
      if (words.length) head.appendChild(document.createTextNode(words.join(" ") + " "));
      head.appendChild(end);
    });
  }

  // The column labels in the page are written for the section's usual prices. Redraw them only if that has changed.
  function drawColumns(sec, usual) {
    if (!usual || usual.prices === sec.prices) return;
    document.querySelectorAll('[data-menu-items="' + sec.key + '"]').forEach(function (slot) {
      var head = slot.previousElementSibling;
      if (brand === "merles") {
        if (head) head.querySelectorAll(".ch").forEach(function (c) { c.hidden = sec.prices !== "cd"; });
        return;
      }
      var old = head && head.classList.contains("pz-head") ? head : null;
      if (sec.prices === "single" && !old) return;
      var fresh = tommyColumns(sec, old && old.querySelector(".grp"));
      if (old) old.replaceWith(fresh); else slot.parentNode.insertBefore(fresh, slot);
    });
  }

  function tommyColumns(sec, group) {
    var head = el("div", "pz-head");
    head.appendChild(group || el("span", "tag grp"));
    if (sec.prices === "cd") {
      ["Collect", "Deliver"].forEach(function (t, i) { head.appendChild(el("span", i ? "tag ch" : "tag ch c1", t)); });
    }
    return head;
  }

  function drawMenu(rows) {
    var map = bySection(rows);
    sections.menu.forEach(function (sec) {
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
    sections.shop.forEach(function (sec) {
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

  Promise.all([
    get("menu_items"),
    get("shop_items"),
    getOptional("brands?select=*&key=eq." + brand),
    getOptional("sections?select=*&brand=eq." + brand + "&order=sort_order.asc")
  ]).then(function (res) {
    applySections(res[2], res[3]);
    drawMenu(res[0]);
    drawShop(res[1]);
    document.dispatchEvent(new CustomEvent("catalog:rendered"));
  }).catch(function (err) {
    console.warn("Live menu unavailable, showing the built-in menu.", err);
  });
})();
