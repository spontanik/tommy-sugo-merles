/* Add more, without leaving the order. The cart's add-more tiles (.add-tile with data-add-brand, data-add-kind and
   data-add-title) open a sheet over Your Order listing that brand's menu or shop, so the customer adds things where
   they are: up from the bottom on a phone, a panel from the right on a wider screen.
     - Menu items follow the menu's rules (catalog.js): only items the team has marked orderable, with a price. One with
       Yoco sizes or extras opens the same options dialog as the menu (window.Order.openOptions, from order.js).
     - Shop items follow the shop's: sold out (or switched off in Yoco) can't be added, and counted stock caps the qty.
     - Everything goes into the shared order (js/cart.js), so the other brand's food joins this order just as it would
       on that brand's own site.
   The tile stays a plain link to the menu, the other site or the shop: it still works if this script, Supabase or
   the item lists aren't there, and a Ctrl/Cmd-click opens the page as before. */
(function () {
  var conf = window.SITE_SUPABASE || {};
  var C = window.Cart, O = window.Order, CFG = window.CATALOG_CONFIG;
  if (!C || !O || !CFG || !conf.url || !conf.key || /YOUR-/.test(conf.url + conf.key)) return;
  var tiles = document.querySelectorAll(".add-tile[data-add-brand]");
  if (!tiles.length) return;
  var MAX_QTY = C.MAX_QTY || 20;

  var style = document.createElement("style");
  style.textContent =
    // Merle's borders are 3px of ink; Tommy Sugo's are 2px rules.
    "body{--am-line:var(--rule,var(--ink));--am-bw:2px}body[data-brand=merles]{--am-bw:3px}" +
    "html.am-open{overflow:hidden}" +
    ".am-sheet{position:fixed;inset:auto 0 0 0;margin:0;width:100%;max-width:none;height:88dvh;max-height:88dvh;padding:0;" +
      "background:var(--surface);color:var(--ink);border:0;border-top:var(--am-bw) solid var(--am-line);" +
      "display:flex;flex-direction:column;animation:am-up .22s ease-out}" +
    ".am-sheet:not([open]){display:none}" +
    ".am-sheet::backdrop{background:rgba(0,0,0,.6)}" +
    "@media (min-width:720px){.am-sheet{inset:0 0 0 auto;width:min(460px,100vw);height:100dvh;max-height:100dvh;" +
      "border-top:0;border-left:var(--am-bw) solid var(--am-line);animation-name:am-in}}" +
    "@keyframes am-up{from{transform:translateY(40px);opacity:0}}@keyframes am-in{from{transform:translateX(40px);opacity:0}}" +
    "@media (prefers-reduced-motion:reduce){.am-sheet{animation:none}}" +
    ".am-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 16px 12px 20px}" +
    ".am-head h2{margin:0;font-size:22px;line-height:1.15;text-transform:uppercase;letter-spacing:.04em}" +
    "body[data-brand=tommy] .am-head h2{font-family:var(--poster);font-weight:600;font-size:26px}" +
    "body[data-brand=merles] .am-head h2{font-family:var(--sans);font-weight:800}" +
    ".am-close{flex:none;width:44px;height:44px;display:grid;place-items:center;background:transparent;color:var(--ink);" +
      "border:var(--am-bw) solid var(--am-line);font:inherit;font-size:26px;line-height:1;cursor:pointer}" +
    ".am-close:hover{background:var(--ink);color:var(--surface)}" +
    ".am-chips{display:flex;gap:8px;overflow-x:auto;padding:0 20px 12px;scrollbar-width:none;flex:none}" +
    ".am-chips::-webkit-scrollbar{display:none}" +
    ".am-chip{flex:none;min-height:36px;padding:0 12px;background:transparent;color:var(--ink);border:var(--am-bw) solid var(--am-line);" +
      "font:inherit;font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;cursor:pointer}" +
    ".am-chip[aria-current=true],.am-chip:hover{background:var(--ink);color:var(--surface)}" +
    ".am-list{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:0 20px 16px;border-top:var(--am-bw) solid var(--am-line)}" +
    ".am-list:focus{outline:none}" +
    ".am-sec h3{margin:20px 0 4px;font-size:13px;font-weight:800;letter-spacing:.15em;text-transform:uppercase}" +
    ".am-row{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--am-line)}" +
    ".am-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}" +
    ".am-name{font-weight:700}" +
    ".am-desc{font-size:13px;color:var(--ink-muted,var(--ink));overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}" +
    ".am-count{font-size:13px;font-weight:700}" +
    ".am-price{flex:none;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}" +
    ".am-ctl{flex:none;display:flex;justify-content:flex-end;min-width:44px}" +
    ".am-add{width:44px;height:44px;display:grid;place-items:center;background:transparent;color:var(--ink);" +
      "border:var(--am-bw) solid var(--am-line);font:inherit;font-size:24px;font-weight:800;line-height:1;cursor:pointer}" +
    ".am-add:hover{background:var(--ink);color:var(--surface)}" +
    ".am-choose{min-height:44px;padding:0 12px;font-size:14px}" +
    ".am-sold{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.08em}" +
    ".am-row.is-sold .am-info,.am-row.is-sold .am-price{opacity:.5}" +
    ".am-note{margin:24px 0;font-weight:700}" +
    ".am-note a{color:inherit}" +
    ".am-foot{flex:none;padding:12px 20px calc(12px + env(safe-area-inset-bottom,0px));border-top:var(--am-bw) solid var(--am-line)}" +
    ".am-foot .btn{width:100%}";
  document.head.appendChild(style);

  // ---------- Helpers ----------
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function money(v) {
    if (v === null || v === undefined || v === "") return null;
    var n = Number(v);
    return "R" + (n % 1 ? n.toFixed(2) : String(n));
  }
  function plural(n) { return n + (n === 1 ? " item" : " items"); }
  // Same test as catalog.js: Yoco gives the item more than one variant, or something to choose on its variant.
  function hasChoices(variants) {
    if (!variants || !variants.length) return false;
    return variants.length > 1 || variants.some(function (v) { return (v.groups || []).length; });
  }
  function get(path) {
    return fetch(conf.url.replace(/\/$/, "") + "/rest/v1/" + path, {
      headers: { apikey: conf.key, Authorization: "Bearer " + conf.key }
    }).then(function (r) {
      if (!r.ok) throw new Error(path + " " + r.status);
      return r.json();
    });
  }

  // ---------- Loading a brand's menu or shop, grouped by its sections in the admin's order ----------
  var cache = {};
  function load(brand, kind) {
    var key = brand + "|" + kind;
    if (cache[key]) return cache[key];
    var table = kind === "shop" ? "shop_items" : "menu_items";
    cache[key] = Promise.all([
      get(table + "?select=*&brand=eq." + brand + "&is_hidden=eq.false&order=sort_order.asc,name.asc"),
      get("sections?select=*&brand=eq." + brand + "&kind=eq." + kind + "&order=sort_order.asc").catch(function () { return null; })
    ]).then(function (res) {
      var rows = res[0], live = res[1] && res[1].length ? res[1] : null;
      var secs = (live || (CFG.brands[brand] || {})[kind] || []).map(function (s) { return { key: s.key, title: s.title, items: [] }; });
      var byKey = {};
      secs.forEach(function (s) { byKey[s.key] = s; });
      rows.forEach(function (it) {
        if (kind === "menu" && !(it.is_orderable && money(it.price))) return; // the menu's Add rules
        var s = byKey[it.section];
        if (!s) {
          if (live) return; // a section the admin has hidden
          s = byKey[it.section] = { key: it.section, title: it.section, items: [] };
          secs.push(s);
        }
        s.items.push(it);
      });
      return secs.filter(function (s) { return s.items.length; });
    }).catch(function (e) {
      delete cache[key]; // try again next time
      throw e;
    });
    return cache[key];
  }

  // ---------- The sheet ----------
  var dlg = el("dialog", "am-sheet");
  dlg.setAttribute("aria-labelledby", "am-title");
  var head = el("div", "am-head");
  var title = el("h2");
  title.id = "am-title";
  var close = el("button", "am-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Close");
  head.appendChild(title); head.appendChild(close);
  var chips = el("nav", "am-chips");
  chips.setAttribute("aria-label", "Sections");
  var list = el("div", "am-list");
  list.tabIndex = -1;
  var foot = el("div", "am-foot");
  var done = el("button", "btn", "Done");
  done.type = "button";
  foot.appendChild(done);
  dlg.appendChild(head); dlg.appendChild(chips); dlg.appendChild(list); dlg.appendChild(foot);
  document.body.appendChild(dlg);

  var current = null; // { brand, kind, tile, sections }
  var redraws = [];   // each row's redraw, run after any change to the order

  function shut() { if (dlg.open) dlg.close(); }
  close.addEventListener("click", shut);
  done.addEventListener("click", shut);
  // A tap on the dimmed page around the sheet closes it too.
  dlg.addEventListener("click", function (e) { if (e.target === dlg) shut(); });
  dlg.addEventListener("close", function () {
    document.documentElement.classList.remove("am-open");
    if (current && current.tile) current.tile.focus();
    current = null;
  });

  function footer() {
    var lines = C.lines(), n = 0, total = 0, priced = true;
    lines.forEach(function (l) { n += l.qty; if (l.each === null) priced = false; else total += l.qty * l.each; });
    done.textContent = n ? "Done · " + plural(n) + " · " + (priced ? money(total) : "TBC") : "Done";
  }
  function changed() {
    O.render(); // the cart behind the sheet, the header count and the page's own steppers
    redraws.forEach(function (f) { f(); });
    footer();
  }

  // A plain item: + to add, then a stepper.
  function plainControl(item, max, box, label) {
    function draw() {
      box.textContent = "";
      var q = C.qty(item.brand, item.kind, item.id);
      if (!q) {
        var add = el("button", "am-add", "+");
        add.type = "button";
        add.setAttribute("aria-label", "Add " + label);
        add.addEventListener("click", function () {
          C.setQty(item, 1);
          changed();
          var more = box.querySelector('[data-am="1"]');
          if (more) more.focus();
        });
        box.appendChild(add);
        return;
      }
      var st = el("div", "stepper");
      var minus = el("button", null, "−");
      minus.type = "button"; minus.setAttribute("data-am", "-1"); minus.setAttribute("aria-label", "One less " + label);
      var out = el("output", null, String(q)); out.setAttribute("aria-live", "polite");
      var plus = el("button", null, "+");
      plus.type = "button"; plus.setAttribute("data-am", "1"); plus.setAttribute("aria-label", "One more " + label);
      plus.disabled = q >= max;
      st.appendChild(minus); st.appendChild(out); st.appendChild(plus);
      minus.addEventListener("click", function () {
        C.setQty(item, q - 1);
        changed();
        var next = box.querySelector('[data-am="-1"]') || box.querySelector(".am-add");
        if (next) next.focus();
      });
      plus.addEventListener("click", function () {
        C.setQty(item, Math.min(max, q + 1));
        changed();
        var next = box.querySelector('[data-am="1"]');
        if (next) next.focus();
      });
      box.appendChild(st);
    }
    return draw;
  }

  function menuRow(it, brand) {
    var row = el("div", "am-row");
    var info = el("div", "am-info");
    info.appendChild(el("span", "am-name", it.name));
    if (it.description && it.description.trim()) info.appendChild(el("span", "am-desc", it.description));
    row.appendChild(info);
    var choices = hasChoices(it.yoco_options);
    // Sizes with their own prices show the lowest, as "from".
    var prices = (it.yoco_options || []).map(function (v) { return Number(v.price); }).filter(function (n) { return n > 0; });
    var from = choices && prices.length > 1 && Math.min.apply(null, prices) !== Math.max.apply(null, prices);
    row.appendChild(el("span", "am-price", (from ? "from " + money(Math.min.apply(null, prices)) : money(it.price))));
    var box = el("div", "am-ctl");
    row.appendChild(box);
    if (!choices) {
      var item = { brand: brand, kind: "menu", id: it.id, name: it.name, each: Number(it.price), stock: null };
      var draw = plainControl(item, MAX_QTY, box, it.name);
      draw();
      return { row: row, draw: draw };
    }
    // Sizes or extras: the menu's options dialog, opened over the sheet. Each choice is its own line in the order.
    var count = el("span", "am-count");
    info.appendChild(count);
    var choose = el("button", "pill am-choose", "Choose");
    choose.type = "button";
    choose.setAttribute("aria-label", "Choose options for " + it.name);
    choose.addEventListener("click", function () {
      var src = el("div");
      src.setAttribute("data-options", JSON.stringify(it.yoco_options));
      src.setAttribute("data-option-name", it.name);
      src.setAttribute("data-option-item", it.id);
      src.setAttribute("data-option-default", it.yoco_id || "");
      src.setAttribute("data-brand", brand);
      var opt = O.openOptions(src);
      if (opt) opt.addEventListener("close", function () { changed(); choose.focus(); }, { once: true });
    });
    box.appendChild(choose);
    function drawCount() {
      var n = C.lines().reduce(function (sum, l) {
        return l.brand === brand && l.kind === "menu" && l.id === it.id ? sum + l.qty : sum;
      }, 0);
      count.textContent = n ? n + " in order" : "";
    }
    drawCount();
    return { row: row, draw: drawCount };
  }

  function shopRow(it, brand) {
    var label = it.cart_name || it.name;
    var counted = it.stock !== null && it.stock !== undefined;
    // The shop's rules (catalog.js): switched off in Yoco, marked sold out, or none left.
    var soldOut = it.is_sold_out || (it.yoco_id && !money(it.price)) || (counted && it.stock <= 0);
    var row = el("div", "am-row" + (soldOut ? " is-sold" : ""));
    var info = el("div", "am-info");
    info.appendChild(el("span", "am-name", it.name));
    if (it.description && it.description.trim()) info.appendChild(el("span", "am-desc", it.description));
    if (counted && !soldOut) info.appendChild(el("span", "am-desc", it.stock + " in stock"));
    row.appendChild(info);
    row.appendChild(el("span", "am-price", money(it.price) || "TBC"));
    var box = el("div", "am-ctl");
    row.appendChild(box);
    if (soldOut) {
      box.appendChild(el("span", "am-sold", "Sold out"));
      return { row: row, draw: function () {} };
    }
    var item = { brand: brand, kind: "shop", id: it.id, name: label,
      each: money(it.price) ? Number(it.price) : null, stock: counted ? Number(it.stock) : null };
    var max = counted ? Math.min(MAX_QTY, Math.max(0, it.stock)) : MAX_QTY;
    var draw = plainControl(item, max, box, label);
    draw();
    return { row: row, draw: draw };
  }

  function fill(sections) {
    list.textContent = "";
    chips.textContent = "";
    redraws = [];
    if (!sections.length) {
      list.appendChild(note("Nothing to add from here right now."));
      chips.hidden = true;
      return;
    }
    chips.hidden = sections.length < 2;
    sections.forEach(function (s, i) {
      var sec = el("section", "am-sec");
      var h = el("h3", null, s.title);
      h.id = "am-sec-" + i;
      sec.setAttribute("aria-labelledby", h.id);
      sec.appendChild(h);
      s.items.forEach(function (it) {
        var r = current.kind === "shop" ? shopRow(it, current.brand) : menuRow(it, current.brand);
        sec.appendChild(r.row);
        redraws.push(r.draw);
      });
      list.appendChild(sec);
      var chip = el("button", "am-chip", s.title);
      chip.type = "button";
      chip.addEventListener("click", function () {
        Array.prototype.forEach.call(chips.children, function (c) { c.removeAttribute("aria-current"); });
        chip.setAttribute("aria-current", "true");
        list.scrollTo({ top: sec.offsetTop - list.offsetTop, behavior: "smooth" });
      });
      if (!i) chip.setAttribute("aria-current", "true");
      chips.appendChild(chip);
    });
  }

  function note(text, href) {
    var p = el("p", "am-note", text);
    if (href) {
      p.appendChild(document.createTextNode(" "));
      var a = el("a", null, "Open the full page instead");
      a.href = href;
      p.appendChild(a);
    }
    return p;
  }

  function open(tile) {
    var brand = tile.getAttribute("data-add-brand"), kind = tile.getAttribute("data-add-kind");
    current = { brand: brand, kind: kind, tile: tile };
    title.textContent = tile.getAttribute("data-add-title") || "Add more";
    chips.textContent = "";
    chips.hidden = true;
    list.textContent = "";
    list.appendChild(note("Loading…"));
    footer();
    document.documentElement.classList.add("am-open");
    dlg.showModal();
    var mine = current;
    load(brand, kind).then(function (sections) {
      if (current !== mine) return; // closed, or another tile opened, while it loaded
      fill(sections);
      list.scrollTop = 0;
    }).catch(function (e) {
      console.warn("Add more: couldn't load the items.", e);
      if (current !== mine) return;
      list.textContent = "";
      list.appendChild(note("This list couldn't load just now.", tile.href));
    });
  }

  Array.prototype.forEach.call(tiles, function (tile) {
    tile.addEventListener("click", function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return; // opening the page in a new tab
      e.preventDefault();
      e.stopPropagation(); // the page's view switcher would otherwise move to #menu or #shop behind the sheet
      open(tile);
    });
  });

  // Once Your Order is on screen, fetch the lists its tiles open, so the sheet fills straight away.
  function warm() {
    if (location.hash !== "#cart") return;
    Array.prototype.forEach.call(tiles, function (t) {
      load(t.getAttribute("data-add-brand"), t.getAttribute("data-add-kind")).catch(function () {});
    });
  }
  window.addEventListener("hashchange", warm);
  setTimeout(warm, 800);
})();
