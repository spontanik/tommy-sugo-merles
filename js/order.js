/* The order for a brand page: one cart holding menu items (for collection) and shop items. Items are added on the
   Menu and Shop views; the cart and checkout are their own view, #cart (Your Order), reached from the header's cart
   icon and the "View order" bar.
   Rules:
     - Menu items are collection only, so any food in the cart makes the whole order a collection from the kitchen,
       and the Delivery / Collect choice isn't shown at all. Shop items (frozen pizzas, sauce) can come along.
     - Delivery is only offered when the cart holds nothing but shop items.
     - Sold-out shop items have no stepper, so they can't get into the cart. A shop item with [data-stock] (see
       catalog.js) can't go above that many; the server checks the same when the order is placed.
   The order itself lives in js/cart.js, shared by Tommy Sugo, Merle's and the combined Shop, so one order can hold both
   brands and follows the customer between the sites. This script shows it and changes it.
   Anything with [data-product] and a stepper is a plain item; [data-food] marks the menu items (see catalog.js), and
   [data-brand] on an item (the combined Shop) says whose it is, otherwise the page's body[data-brand].
   A menu item with [data-options] has Yoco variants or modifiers: it opens a dialog first, and each combination the
   customer chooses is its own line in the order, since those lines have no stepper on the page.
   Page copy comes from window.ORDER_COPY. With copy.liveCheckout set, the order goes to the order-create function and
   the customer pays on Yoco's page. Otherwise checkout is a prototype: nothing is saved or charged.
   With live checkout and accounts (js/account.js) loaded, checkout starts as a guest: name, email and cell, and the
   order is kept on this device (and emailed). "Have an account? Sign in" opens sign-in or create-account instead, and
   a signed-in order goes on their account. Someone already signed in skips straight to their saved details. */
(function () {
  var form = document.getElementById("shop-form");
  if (!form) return;
  var copy = window.ORDER_COPY;
  var $ = function (id) { return document.getElementById(id); };
  var PRICE_TBC = "TBC";
  var MAX_QTY = 20;
  // What the customer picked; food in the cart overrides it. A page without a Delivery choice is collection only.
  var wanted = document.querySelector('[data-get="delivery"]') ? "delivery" : "collect";
  var mode = wanted;
  var C = window.Cart;
  var BRAND = document.body.getAttribute("data-brand"); // "tommy", "merles", or "both" on the combined Shop
  var NAMES = { tommy: "Tommy Sugo", merles: "Merle's" };

  var style = document.createElement("style");
  style.textContent =
    ".pill:disabled{opacity:.45;cursor:not-allowed}" +
    ".stepper button:disabled,.stepper button:disabled:hover{opacity:.35;cursor:not-allowed;background:transparent;color:inherit}" +
    ".cart-lines li .line-name{flex:1;min-width:0}" +
    ".line-remove{min-height:44px;margin:-12px 0;padding:0 0 0 4px;background:none;border:0;color:inherit;font:inherit;font-size:14px;text-decoration:underline;cursor:pointer}" +
    ".acct-toggle{align-self:flex-start;min-height:44px;padding:0;background:none;border:0;color:inherit;font:inherit;font-size:14px;font-weight:700;text-decoration:underline;text-underline-offset:3px;cursor:pointer;text-align:left}" +
    ".order-bar{position:sticky;bottom:0;z-index:10;background:var(--surface);color:var(--ink);border-top:3px solid var(--ink);padding-bottom:env(safe-area-inset-bottom,0px)}" +
    ".order-bar-in{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-top:12px;padding-bottom:12px;font-weight:700}" +
    'main[data-view="cart"]:not([hidden]) ~ .order-bar{display:none}' +
    ".opt-dlg{width:min(520px,calc(100vw - 32px));max-height:calc(100vh - 32px);padding:0;background:var(--surface);color:var(--ink);border:3px solid var(--ink)}" +
    ".opt-dlg::backdrop{background:rgba(0,0,0,.6)}" +
    ".opt-dlg form{display:flex;flex-direction:column;gap:20px;padding:24px}" +
    ".opt-dlg h2{margin:0;font-size:28px;line-height:1.15;overflow-wrap:anywhere}" +
    ".opt-dlg fieldset{border:0;margin:0;padding:0;min-width:0;display:flex;flex-direction:column;gap:4px}" +
    ".opt-dlg legend{padding:0 0 8px;font-weight:700}" +
    ".opt-dlg legend small{font-weight:400;margin-left:8px}" +
    ".opt-choice{display:flex;align-items:center;gap:12px;min-height:44px;cursor:pointer}" +
    ".opt-choice[hidden]{display:none}" +
    ".opt-choice input{width:20px;height:20px;margin:0;flex:none;accent-color:currentColor}" +
    ".opt-choice .opt-name{flex:1;min-width:0}" +
    ".opt-choice .opt-price{font-weight:700;font-variant-numeric:tabular-nums}" +
    ".opt-choice input:disabled~span{opacity:.45}" +
    ".opt-more{align-self:flex-start;min-height:44px;padding:0;background:none;border:0;color:inherit;font:inherit;font-weight:700;text-decoration:underline;text-underline-offset:3px;cursor:pointer}" +
    ".opt-err{margin:0;font-weight:700}" +
    ".opt-foot{display:flex;flex-wrap:wrap;align-items:center;gap:12px;justify-content:space-between}" +
    ".opt-actions{display:flex;flex-wrap:wrap;gap:8px}";
  document.head.appendChild(style);

  var bar = document.createElement("div");
  bar.className = "order-bar";
  bar.hidden = true;
  bar.innerHTML = '<div class="wrap order-bar-in"><span aria-live="polite"></span><a class="btn" href="#cart">View order</a></div>';
  document.body.appendChild(bar);
  var barText = bar.querySelector("span");

  function products() { return Array.prototype.slice.call(document.querySelectorAll("[data-product]")); }
  function brandOf(el) { return el.getAttribute("data-brand") || BRAND; }
  // What the order needs to know about a plain item on the page.
  function itemOf(p) {
    var price = p.getAttribute("data-price"), stock = p.getAttribute("data-stock");
    return {
      brand: brandOf(p),
      kind: p.getAttribute("data-item-kind") || (p.hasAttribute("data-food") ? "menu" : "shop"),
      id: p.getAttribute("data-item-id") || "name:" + p.getAttribute("data-product"),
      name: p.getAttribute("data-product"),
      each: price === null ? null : Number(price),
      stock: stock === null ? null : Number(stock)
    };
  }
  function qtyOf(p) { var i = itemOf(p); return C.qty(i.brand, i.kind, i.id); }
  // The most of one item an order can hold: 20, or fewer when the shop has fewer left.
  function maxOf(p) {
    var stock = p.getAttribute("data-stock");
    return stock === null ? MAX_QTY : Math.min(MAX_QTY, Math.max(0, parseInt(stock, 10) || 0));
  }
  function setQty(p, q) { C.setQty(itemOf(p), Math.max(0, Math.min(maxOf(p), q))); }

  // The page's steppers and "in order" counts follow the order, which may have changed on another site.
  function syncPage() {
    products().forEach(function (p) {
      var item = itemOf(p);
      if (p.hasAttribute("data-item-id")) C.refresh(item); // keep its name, price and stock current
      var q = C.qty(item.brand, item.kind, item.id);
      var out = p.querySelector("output");
      if (out) out.textContent = String(q);
      if (p.hasAttribute("data-food")) p.classList.toggle("has-qty", q > 0);
      var more = p.querySelector('[data-step="1"]');
      if (more) more.disabled = q >= maxOf(p);
    });
    var all = C.lines();
    document.querySelectorAll("[data-options]").forEach(function (box) {
      var id = box.getAttribute("data-option-item"), brand = brandOf(box);
      var n = all.reduce(function (sum, l) { return l.brand === brand && l.kind === "menu" && l.id === id && l.variantId ? sum + l.qty : sum; }, 0);
      box.classList.toggle("has-qty", n > 0);
      box.querySelector(".order-count").textContent = n ? n + " in order" : "";
    });
  }
  function rand(n) { return "R" + (n % 1 ? n.toFixed(2) : n); }
  function plural(n) { return n + (n === 1 ? " item" : " items"); }

  function applyFulfilment(hasFood, hasShop) {
    mode = hasFood ? "collect" : wanted;
    document.querySelectorAll("[data-get]").forEach(function (b) {
      var name = b.getAttribute("data-get");
      b.setAttribute("aria-pressed", String(name === mode));
      if (name === "delivery") b.disabled = hasFood;
    });
    // With food in the order there's nothing to choose: it's collected from the kitchen.
    var how = $("get-how");
    if (how) how.hidden = hasFood;
    $("get-delivery").hidden = mode !== "delivery";
    $("get-collect").hidden = mode !== "collect";
    var note = $("get-note");
    note.hidden = !hasFood;
    if (hasFood) note.textContent = hasShop ? copy.noteMixed : copy.noteFood;
    // Food comes from the kitchen; the other collection points are for shop-only orders.
    var select = $("shop-collect");
    if (select) {
      Array.prototype.forEach.call(select.options, function (o) {
        var kitchen = o.hasAttribute("data-kitchen");
        o.disabled = hasFood && !kitchen;
        if (hasFood && kitchen) o.selected = true;
      });
    }
  }

  function cartLine(text, label, priceText, removeLine) {
    var li = document.createElement("li");
    var name = document.createElement("span");
    name.className = "line-name";
    name.textContent = text;
    var remove = document.createElement("button");
    remove.type = "button";
    remove.className = "line-remove";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", "Remove " + label);
    remove.addEventListener("click", function () {
      removeLine();
      renderCart();
      var h = $("cart-h");
      h.setAttribute("tabindex", "-1");
      h.focus();
    });
    var price = document.createElement("span");
    price.textContent = priceText;
    li.appendChild(name); li.appendChild(remove); li.appendChild(price);
    return li;
  }

  function renderCart() {
    var lines = $("cart-lines");
    lines.textContent = "";
    var count = 0, total = 0, allPriced = true, hasFood = false, hasShop = false;
    syncPage();
    var all = C.lines();
    // With both brands in the order (or another brand's items on this page), each line says whose it is.
    var named = all.some(function (l) { return l.brand !== all[0].brand || (BRAND !== "both" && l.brand !== BRAND); }) || BRAND === "both";
    all.forEach(function (l) {
      count += l.qty;
      if (l.kind === "menu") hasFood = true; else hasShop = true;
      if (l.each === null) allPriced = false; else total += l.qty * l.each;
      var label = (named ? (NAMES[l.brand] || l.brand) + " · " : "") + l.name;
      lines.appendChild(cartLine(l.qty + " × " + label, label, l.each === null ? PRICE_TBC : rand(l.qty * l.each), function () { C.remove(l.key); }));
    });
    var totalText = count && allPriced ? rand(total) : PRICE_TBC;
    lines.hidden = count === 0;
    $("cart-empty").hidden = count > 0;
    $("cart-count").textContent = plural(count);
    $("cart-total").textContent = totalText;
    if (count > 0) $("shop-err").hidden = true;
    applyFulfilment(hasFood, hasShop);
    bar.hidden = count === 0;
    barText.textContent = plural(count) + " · " + totalText;
    if (window.NavIcons) window.NavIcons.cart(count);
    return count;
  }

  // Menu steppers live outside the form, so this listens on the whole page.
  document.addEventListener("click", function (e) {
    var configure = e.target.closest("[data-configure]");
    if (configure) { openOptions(configure.closest("[data-options]")); return; }
    var b = e.target.closest("[data-step]");
    if (!b) return;
    var p = b.closest("[data-product]");
    var before = qtyOf(p);
    setQty(p, before + parseInt(b.getAttribute("data-step"), 10));
    var after = qtyOf(p);
    renderCart();
    // The Add button and the stepper swap places on menu items: keep keyboard focus on what's now showing.
    if (p.hasAttribute("data-food")) {
      if (!before && after) p.querySelector('.stepper [data-step="1"]').focus();
      else if (before && !after) p.querySelector(".order-add").focus();
    }
  });

  // ---------- Options dialog: a Yoco item's variants and modifiers ----------
  function node(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  // One choice from a group with a preset, like a Standard base, always has an answer, even if Yoco calls it optional.
  function isSingleChoice(g) {
    return g.max === 1 && (g.min >= 1 || g.modifiers.some(function (m) { return m.selected; }));
  }

  function ruleText(g) {
    if (isSingleChoice(g)) return "Choose 1";
    if (g.max === 1) return "Optional, choose 1";
    if (g.min && g.max === g.min) return "Choose " + g.min;
    if (g.min) return g.max ? "Choose " + g.min + " to " + g.max : "Choose at least " + g.min;
    return g.max ? "Optional, up to " + g.max : "Optional";
  }

  // Single choices are radio buttons. Everything else is checkboxes, so a choice can be taken off again.
  function choiceRow(type, name, label, price, checked) {
    var row = node("label", "opt-choice");
    var input = node("input");
    input.type = type;
    input.name = name;
    input.checked = checked;
    row.appendChild(input);
    row.appendChild(node("span", "opt-name", label));
    if (price) row.appendChild(node("span", "opt-price", price));
    return { row: row, input: input };
  }

  var SHOWN_CHOICES = 2; // choices in a group shown before View more
  var optDlg = null;
  function openOptions(box) {
    var variants = JSON.parse(box.getAttribute("data-options"));
    var itemName = box.getAttribute("data-option-name");
    var itemId = box.getAttribute("data-option-item");
    var picked = variants.filter(function (v) { return v.id === box.getAttribute("data-option-default"); })[0] || variants[0];
    var qty = 1;

    if (optDlg) optDlg.remove();
    optDlg = node("dialog", "opt-dlg");
    optDlg.setAttribute("aria-labelledby", "opt-title");
    var form = node("form");
    form.noValidate = true;
    var title = node("h2", null, itemName);
    title.id = "opt-title";
    var variantBox = node("div");
    var groupsBox = node("div");
    groupsBox.style.cssText = "display:flex;flex-direction:column;gap:20px";
    var err = node("p", "opt-err");
    err.setAttribute("role", "alert");
    err.hidden = true;
    var foot = node("div", "opt-foot");
    var stepper = node("div", "stepper");
    var minus = node("button", null, "−");
    minus.type = "button";
    minus.setAttribute("aria-label", "One less");
    var out = node("output", null, "1");
    out.setAttribute("aria-live", "polite");
    var plus = node("button", null, "+");
    plus.type = "button";
    plus.setAttribute("aria-label", "One more");
    stepper.appendChild(minus); stepper.appendChild(out); stepper.appendChild(plus);
    var actions = node("div", "opt-actions");
    var cancel = node("button", "pill", "Cancel");
    cancel.type = "button";
    var addBtn = node("button", "btn");
    addBtn.type = "submit";
    actions.appendChild(cancel); actions.appendChild(addBtn);
    foot.appendChild(stepper); foot.appendChild(actions);
    form.appendChild(title); form.appendChild(variantBox); form.appendChild(groupsBox); form.appendChild(err); form.appendChild(foot);
    optDlg.appendChild(form);
    document.body.appendChild(optDlg);

    var fields = []; // the modifier groups on show: { group, inputs: [{ input, modifier }] }

    function selection() {
      var mods = [];
      fields.forEach(function (f) { f.inputs.forEach(function (i) { if (i.input.checked) mods.push(i.modifier); }); });
      return mods;
    }
    function eachPrice() {
      return selection().reduce(function (sum, m) { return sum + Number(m.price); }, Number(picked.price));
    }
    function refresh() {
      out.textContent = String(qty);
      addBtn.textContent = "Add · " + rand(qty * eachPrice());
      // A group at its limit can't take any more.
      fields.forEach(function (f) {
        if (f.inputs[0].input.type !== "checkbox" || !f.group.max) return;
        var n = f.inputs.filter(function (i) { return i.input.checked; }).length;
        f.inputs.forEach(function (i) { i.input.disabled = !i.input.checked && n >= f.group.max && f.group.max > 1; });
      });
    }
    function drawGroups() {
      groupsBox.textContent = "";
      fields = [];
      (picked.groups || []).forEach(function (g, gi) {
        var set = node("fieldset");
        var legend = node("legend", null, g.name);
        legend.appendChild(node("small", null, ruleText(g)));
        set.appendChild(legend);
        var radio = isSingleChoice(g);
        var field = { group: g, inputs: [] };
        g.modifiers.forEach(function (m) {
          var c = choiceRow(radio ? "radio" : "checkbox", "opt-group-" + gi, m.name, Number(m.price) ? "+" + rand(Number(m.price)) : "", !!m.selected);
          if (!radio && g.max === 1) {
            c.input.addEventListener("change", function () {
              if (c.input.checked) field.inputs.forEach(function (i) { if (i.input !== c.input) i.input.checked = false; });
            });
          }
          field.inputs.push({ input: c.input, modifier: m });
          set.appendChild(c.row);
        });
        // Long groups show their first two choices and a View more. A preset further down keeps the group open.
        var extra = field.inputs.slice(SHOWN_CHOICES);
        if (extra.length && !extra.some(function (i) { return i.input.checked; })) {
          var more = node("button", "opt-more", "View " + extra.length + " more");
          more.type = "button";
          field.expand = function () {
            extra.forEach(function (i) { i.input.closest(".opt-choice").hidden = false; });
            more.remove();
          };
          more.addEventListener("click", function () {
            field.expand();
            extra[0].input.focus();
          });
          extra.forEach(function (i) { i.input.closest(".opt-choice").hidden = true; });
          set.appendChild(more);
        }
        fields.push(field);
        groupsBox.appendChild(set);
      });
      groupsBox.hidden = !fields.length;
    }

    if (variants.length > 1) {
      var set = node("fieldset");
      set.appendChild(node("legend", null, "Choose one"));
      variants.forEach(function (v) {
        var c = choiceRow("radio", "opt-variant", v.label || itemName, rand(Number(v.price)), v === picked);
        c.input.addEventListener("change", function () {
          picked = v;
          err.hidden = true;
          drawGroups();
          refresh();
        });
        set.appendChild(c.row);
      });
      variantBox.appendChild(set);
    } else {
      variantBox.hidden = true;
    }

    drawGroups();
    refresh();
    form.addEventListener("change", function () { err.hidden = true; refresh(); });
    minus.addEventListener("click", function () { qty = Math.max(1, qty - 1); refresh(); });
    plus.addEventListener("click", function () { qty = Math.min(MAX_QTY, qty + 1); refresh(); });
    cancel.addEventListener("click", function () { optDlg.close(); });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var short = fields.filter(function (f) {
        return f.inputs.filter(function (i) { return i.input.checked; }).length < f.group.min;
      })[0];
      if (short) {
        if (short.expand) short.expand();
        err.textContent = short.group.name + ": " + ruleText(short.group).toLowerCase() + ".";
        err.hidden = false;
        return;
      }
      var mods = selection();
      // "Standard" and the like are the assumed choice, so they don't need spelling out in the cart.
      var shown = mods.filter(function (m) { return Number(m.price) || !m.selected; }).map(function (m) { return m.name; });
      var parts = (variants.length > 1 && picked.label ? [picked.label] : []).concat(shown);
      var brand = brandOf(box);
      C.add({
        key: [brand, itemId, picked.id].concat(mods.map(function (m) { return m.id; }).sort()).join("|"),
        brand: brand,
        kind: "menu",
        id: itemId,
        qty: qty,
        variantId: picked.id,
        modifierIds: mods.map(function (m) { return m.id; }),
        name: itemName + (parts.length ? " · " + parts.join(", ") : ""),
        each: eachPrice()
      });
      optDlg.close();
      renderCart();
    });

    optDlg.showModal();
    return optDlg;
  }

  // js/add-more.js adds items from a sheet over the cart, with the same options dialog and cart refresh.
  window.Order = { render: renderCart, openOptions: openOptions };

  // ---------- As a guest, or with an account ----------
  var A = window.Account;
  var accounts = !!(copy.liveCheckout && A && A.enabled() && $("acct"));
  // profile: their saved name and cell (null while loading); editing: they tapped Change to type other ones.
  var acct = { use: "device", session: null, profile: null, editing: false };

  function drawAccount() {
    if (!accounts) return;
    var signed = !!acct.session;
    var needAuth = acct.use === "account" && !signed;
    // Signed in, their saved details are shown rather than asked for again, unless they're missing or being changed.
    var summary = acct.use === "account" && signed && !acct.editing;
    $("acct-pitch").hidden = !needAuth;
    $("acct-auth").hidden = !needAuth;
    $("acct-guest").hidden = !needAuth;
    $("acct-signed").hidden = !(acct.use === "account" && signed);
    $("acct-device").hidden = acct.use !== "device";
    document.querySelectorAll("[data-details]").forEach(function (f) { f.hidden = needAuth || summary; });
    $("shop-email").readOnly = acct.use === "account" && signed;
    if (signed) drawSigned();
  }

  function drawSigned() {
    var note = $("acct-signed");
    var p = acct.profile;
    note.textContent = "";
    note.appendChild(document.createTextNode("Signed in as " + acct.session.user.email + ". This order goes on your account."));
    if (!acct.editing) {
      var who = node("span", null, p ? [p.name, p.phone].filter(Boolean).join(" · ") : "Loading your details…");
      who.style.cssText = "display:block;margin-top:8px;font-weight:700;font-size:16px;color:var(--ink, inherit)";
      note.appendChild(who);
    }
    var btns = node("span");
    btns.style.cssText = "display:flex;gap:16px;flex-wrap:wrap;margin-top:4px";
    if (p && !acct.editing) {
      var change = node("button", "line-remove", "Change details");
      change.type = "button";
      change.style.margin = "0";
      change.addEventListener("click", function () {
        acct.editing = true;
        drawAccount();
        $("shop-name").focus();
      });
      btns.appendChild(change);
    }
    var out = node("button", "line-remove", "Sign out");
    out.type = "button";
    out.style.margin = "0";
    out.addEventListener("click", function () {
      A.signOut().then(function () {
        acct.use = "device";
        acct.session = null;
        acct.profile = null;
        acct.editing = false;
        ["shop-email", "shop-name", "shop-phone"].forEach(function (id) { $(id).value = ""; });
        drawAccount();
      });
    });
    btns.appendChild(out);
    note.appendChild(btns);
  }

  function signedIn(session) {
    acct.session = session;
    acct.use = "account";
    acct.profile = null;
    acct.editing = false;
    $("shop-email").value = session.user.email;
    drawAccount();
    A.profile(session.user).then(function (p) {
      if (acct.session !== session) return;
      $("shop-name").value = p.name || "";
      $("shop-phone").value = p.phone || "";
      acct.profile = p;
      // Anything missing from the account is asked for here.
      acct.editing = !p.name || !p.phone;
      drawAccount();
    }).catch(function () {
      // Couldn't load them: let them type them in.
      if (acct.session !== session) return;
      acct.editing = true;
      drawAccount();
    });
  }

  if (accounts) {
    $("acct").hidden = false;
    $("acct-pitch").textContent = A.PITCH;
    A.authForm($("acct-auth"), { prefix: "co-", onSignedIn: signedIn, start: "signin" });
    document.querySelectorAll("[data-acct]").forEach(function (b) {
      b.addEventListener("click", function () {
        acct.use = b.getAttribute("data-acct");
        drawAccount();
        // Keep keyboard focus on what's now showing: the sign-in form, or the guest fields.
        var next = acct.use === "account"
          ? Array.prototype.filter.call($("acct-auth").querySelectorAll("input"), function (i) { return i.offsetParent; })[0]
          : $("shop-name");
        if (next) next.focus();
      });
    });
    A.session().then(function (s) { if (s) signedIn(s); }).catch(function () { /* stays signed out */ });
    // Confirming the email in another tab signs them in there: pick that up here, so the cart isn't lost.
    A.onChange(function (event, s) { if (s && !acct.session && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED")) signedIn(s); });
    drawAccount();
  }

  document.querySelectorAll("[data-get]").forEach(function (b) {
    b.addEventListener("click", function () {
      wanted = b.getAttribute("data-get");
      renderCart();
    });
  });

  document.addEventListener("catalog:rendered", function () {
    var canOrderFood = !!document.querySelector("[data-food],[data-options]");
    document.querySelectorAll("[data-order-note]").forEach(function (n) { n.hidden = !canOrderFood; });
    renderCart();
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var err = $("shop-err");
    var email = $("shop-email");
    var problem = "";
    if (!renderCart()) problem = copy.errEmpty;
    else if (accounts && acct.use === "account" && !acct.session) problem = "Sign in above, or continue as a guest.";
    else if (accounts && acct.use === "account" && !acct.profile && !acct.editing) problem = "Just a moment, we're loading your details.";
    else if (mode === "delivery" && !$("shop-address").value.trim()) problem = copy.errAddress;
    else if (!$("shop-name").value.trim()) problem = copy.errName;
    else if (!email.value.trim() || !email.checkValidity()) problem = "Add an email address so we can send your confirmation.";
    if (!problem && copy.liveCheckout) {
      if (mode === "delivery") problem = copy.errDeliveryLive;
      else if (C.lines().some(function (l) { return l.each === null; })) problem = copy.errUnpriced;
    }
    if (problem) { err.textContent = problem; err.hidden = false; return; }
    if (copy.liveCheckout) { placeOrder(email.value.trim()); return; }
    $("shop-done-email").textContent = email.value.trim();
    $("shop-done-title").textContent = mode === "collect" ? copy.doneCollect : copy.doneDelivery;
    $("shop-order").hidden = true;
    $("shop-done").hidden = false;
  });

  // What's sent is only what was chosen: the server works out every price again from the database.
  function orderLines() {
    return C.lines().map(function (l) {
      var line = { brand: l.brand, kind: l.kind, itemId: l.id, qty: l.qty };
      if (l.variantId) { line.variantId = l.variantId; line.modifierIds = l.modifierIds; }
      return line;
    });
  }

  var submit = form.querySelector('button[type="submit"]');
  var submitText = submit.textContent;
  function submitting(on) {
    submit.disabled = on;
    submit.textContent = on ? "Taking you to payment…" : submitText;
  }
  // Coming back from Yoco's page with the browser's Back button shows this page as it was left.
  window.addEventListener("pageshow", function () { submitting(false); });

  function placeOrder(emailAddress) {
    var conf = window.SITE_SUPABASE;
    var err = $("shop-err");
    var select = $("shop-collect");
    submitting(true);
    // A signed-in order sends the (freshly refreshed) session, so it's saved to their account.
    var who = accounts && acct.use === "account" && acct.session ? A.session() : Promise.resolve(null);
    who.then(function (s) {
      return fetch(conf.url.replace(/\/$/, "") + "/functions/v1/order-create", {
      method: "POST",
      headers: { apikey: conf.key, Authorization: "Bearer " + (s ? s.access_token : conf.key), "Content-Type": "application/json" },
      body: JSON.stringify({
        brand: document.body.getAttribute("data-brand"),
        lines: orderLines(),
        name: $("shop-name").value.trim(),
        email: emailAddress,
        phone: $("shop-phone").value.trim(),
        collectFrom: select ? select.value : "",
        returnBase: /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? location.origin : undefined
      })
      });
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (!res.ok) throw new Error(res.error);
      C.clear(); // the order is saved now: it lives on its own page, not in the cart
      location.href = res.redirectUrl;
    }).catch(function (e) {
      submitting(false);
      err.textContent = e.message && !/fetch|network/i.test(e.message) ? e.message : "We couldn't reach the server. You haven't been charged. Please try again.";
      err.hidden = false;
    });
  }

  $("shop-again").addEventListener("click", function () {
    form.reset();
    C.clear();
    wanted = document.querySelector('[data-get="delivery"]') ? "delivery" : "collect";
    renderCart();
    $("shop-done").hidden = true;
    $("shop-order").hidden = false;
  });

  // Coming back to this page (another tab, the other brand's site, or the Back button) shows the order as it is now.
  document.addEventListener("visibilitychange", function () { if (!document.hidden) renderCart(); });
  window.addEventListener("pageshow", function () { renderCart(); });

  renderCart();
})();
