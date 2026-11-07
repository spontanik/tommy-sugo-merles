/* The order for a brand page: one cart holding menu items (for collection) and shop items.
   Rules:
     - Menu items are collection only, so any food in the cart makes the whole order a collection from the kitchen.
     - Delivery is only offered when the cart holds nothing but shop items.
     - Sold-out shop items have no stepper, so they can't get into the cart.
   Anything with [data-product] and a stepper counts as a line; [data-food] marks the menu items (see catalog.js).
   A menu item with [data-options] has Yoco variants or modifiers: it opens a dialog first, and each combination the
   customer chooses is its own line in `chosen`, since those lines have no stepper on the page.
   Page copy comes from window.ORDER_COPY. With copy.liveCheckout set, the order goes to the order-create function and
   the customer pays on Yoco's page. Otherwise checkout is a prototype: nothing is saved or charged.
   With live checkout and accounts (js/account.js) loaded, the customer either signs in or creates an account, or
   chooses No account, and the order is then kept on this device only. A signed-in order goes on their account. */
(function () {
  var form = document.getElementById("shop-form");
  if (!form) return;
  var copy = window.ORDER_COPY;
  var $ = function (id) { return document.getElementById(id); };
  var PRICE_TBC = "TBC";
  var MAX_QTY = 20;
  var wanted = "delivery"; // what the customer picked; food in the cart overrides it
  var mode = wanted;
  var chosen = []; // lines from the options dialog: { key, itemId, label, each, qty, variantId, modifierIds }

  var style = document.createElement("style");
  style.textContent =
    ".pill:disabled{opacity:.45;cursor:not-allowed}" +
    ".cart-lines li .line-name{flex:1;min-width:0}" +
    ".line-remove{min-height:44px;margin:-12px 0;padding:0 0 0 4px;background:none;border:0;color:inherit;font:inherit;font-size:14px;text-decoration:underline;cursor:pointer}" +
    ".order-bar{position:sticky;bottom:0;z-index:10;background:var(--surface);color:var(--ink);border-top:3px solid var(--ink);padding-bottom:env(safe-area-inset-bottom,0px)}" +
    ".order-bar-in{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-top:12px;padding-bottom:12px;font-weight:700}" +
    'main[data-view="shop"]:not([hidden]) ~ .order-bar{display:none}' +
    ".opt-dlg{width:min(520px,calc(100vw - 32px));max-height:calc(100vh - 32px);padding:0;background:var(--surface);color:var(--ink);border:3px solid var(--ink)}" +
    ".opt-dlg::backdrop{background:rgba(0,0,0,.6)}" +
    ".opt-dlg form{display:flex;flex-direction:column;gap:20px;padding:24px}" +
    ".opt-dlg h2{margin:0;font-size:28px;line-height:1.15;overflow-wrap:anywhere}" +
    ".opt-dlg fieldset{border:0;margin:0;padding:0;min-width:0;display:flex;flex-direction:column;gap:4px}" +
    ".opt-dlg legend{padding:0 0 8px;font-weight:700}" +
    ".opt-dlg legend small{font-weight:400;margin-left:8px}" +
    ".opt-choice{display:flex;align-items:center;gap:12px;min-height:44px;cursor:pointer}" +
    ".opt-choice input{width:20px;height:20px;margin:0;flex:none;accent-color:currentColor}" +
    ".opt-choice .opt-name{flex:1;min-width:0}" +
    ".opt-choice .opt-price{font-weight:700;font-variant-numeric:tabular-nums}" +
    ".opt-choice input:disabled~span{opacity:.45}" +
    ".opt-err{margin:0;font-weight:700}" +
    ".opt-foot{display:flex;flex-wrap:wrap;align-items:center;gap:12px;justify-content:space-between}" +
    ".opt-actions{display:flex;flex-wrap:wrap;gap:8px}";
  document.head.appendChild(style);

  var bar = document.createElement("div");
  bar.className = "order-bar";
  bar.hidden = true;
  bar.innerHTML = '<div class="wrap order-bar-in"><span aria-live="polite"></span><a class="btn" href="#shop">View order</a></div>';
  document.body.appendChild(bar);
  var barText = bar.querySelector("span");

  function products() { return Array.prototype.slice.call(document.querySelectorAll("[data-product]")); }
  function qtyOf(p) { var o = p.querySelector("output"); return o ? parseInt(o.textContent, 10) || 0 : 0; }
  function setQty(p, q) { p.querySelector("output").textContent = String(Math.max(0, Math.min(MAX_QTY, q))); }
  function rand(n) { return "R" + (n % 1 ? n.toFixed(2) : n); }
  function plural(n) { return n + (n === 1 ? " item" : " items"); }

  function applyFulfilment(hasFood, hasShop) {
    mode = hasFood ? "collect" : wanted;
    document.querySelectorAll("[data-get]").forEach(function (b) {
      var name = b.getAttribute("data-get");
      b.setAttribute("aria-pressed", String(name === mode));
      if (name === "delivery") b.disabled = hasFood;
    });
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
    chosen.forEach(function (line) {
      count += line.qty;
      total += line.qty * line.each;
      hasFood = true;
      lines.appendChild(cartLine(line.qty + " × " + line.label, line.label, rand(line.qty * line.each), function () {
        chosen.splice(chosen.indexOf(line), 1);
      }));
    });
    document.querySelectorAll("[data-options]").forEach(function (box) {
      var id = box.getAttribute("data-option-item");
      var n = chosen.reduce(function (sum, line) { return line.itemId === id ? sum + line.qty : sum; }, 0);
      box.classList.toggle("has-qty", n > 0);
      box.querySelector(".order-count").textContent = n ? n + " in order" : "";
    });
    products().forEach(function (p) {
      var q = qtyOf(p);
      if (p.hasAttribute("data-food")) p.classList.toggle("has-qty", q > 0);
      if (!q) return;
      count += q;
      if (p.hasAttribute("data-food")) hasFood = true; else hasShop = true;
      var each = p.getAttribute("data-price");
      if (each === null) allPriced = false; else total += q * Number(each);
      var label = p.getAttribute("data-product");
      lines.appendChild(cartLine(q + " × " + label, label, each === null ? PRICE_TBC : rand(q * Number(each)), function () { setQty(p, 0); }));
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
        err.textContent = short.group.name + ": " + ruleText(short.group).toLowerCase() + ".";
        err.hidden = false;
        return;
      }
      var mods = selection();
      // "Standard" and the like are the assumed choice, so they don't need spelling out in the cart.
      var shown = mods.filter(function (m) { return Number(m.price) || !m.selected; }).map(function (m) { return m.name; });
      var parts = (variants.length > 1 && picked.label ? [picked.label] : []).concat(shown);
      var key = [itemId, picked.id].concat(mods.map(function (m) { return m.id; }).sort()).join("|");
      var line = chosen.filter(function (l) { return l.key === key; })[0];
      if (line) {
        line.qty = Math.min(MAX_QTY, line.qty + qty);
      } else {
        chosen.push({
          key: key,
          itemId: itemId,
          label: itemName + (parts.length ? " · " + parts.join(", ") : ""),
          each: eachPrice(),
          qty: qty,
          variantId: picked.id,
          modifierIds: mods.map(function (m) { return m.id; })
        });
      }
      optDlg.close();
      renderCart();
    });

    optDlg.showModal();
  }

  // ---------- With an account, or without ----------
  var A = window.Account;
  var accounts = !!(copy.liveCheckout && A && A.enabled() && $("acct"));
  var acct = { use: "account", session: null };

  function drawAccount() {
    if (!accounts) return;
    var signed = !!acct.session;
    var needAuth = acct.use === "account" && !signed;
    document.querySelectorAll("[data-acct]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-acct") === acct.use));
    });
    $("acct-pitch").hidden = !needAuth;
    $("acct-auth").hidden = !needAuth;
    $("acct-signed").hidden = !(acct.use === "account" && signed);
    $("acct-device").hidden = acct.use !== "device";
    // Until they've signed in, the details come from the account form instead.
    document.querySelectorAll("[data-details]").forEach(function (f) { f.hidden = needAuth; });
    $("shop-email").readOnly = acct.use === "account" && signed;
  }

  function signedIn(session) {
    acct.session = session;
    acct.use = "account";
    $("shop-email").value = session.user.email;
    var note = $("acct-signed");
    note.textContent = "Signed in as " + session.user.email + ". This order goes on your account. ";
    var out = node("button", "line-remove", "Sign out");
    out.type = "button";
    out.style.margin = "0";
    out.addEventListener("click", function () {
      A.signOut().then(function () {
        acct.session = null;
        $("shop-email").value = "";
        drawAccount();
      });
    });
    note.appendChild(out);
    drawAccount();
    A.profile(session.user).then(function (p) {
      if (!$("shop-name").value.trim()) $("shop-name").value = p.name || "";
      if (!$("shop-phone").value.trim()) $("shop-phone").value = p.phone || "";
    }).catch(function () { /* they can type them in */ });
  }

  if (accounts) {
    $("acct").hidden = false;
    $("acct-pitch").textContent = A.PITCH;
    A.authForm($("acct-auth"), { prefix: "co-", onSignedIn: signedIn });
    document.querySelectorAll("[data-acct]").forEach(function (b) {
      b.addEventListener("click", function () {
        acct.use = b.getAttribute("data-acct");
        drawAccount();
      });
    });
    A.session().then(function (s) { if (s) signedIn(s); }).catch(function () { /* stays signed out */ });
    drawAccount();
  }

  // The cart sits below the shop's hero (and, on small screens, below its products): go straight to it.
  bar.querySelector("a").addEventListener("click", function () {
    setTimeout(function () { $("cart-h").scrollIntoView(); }, 0);
  });

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
    else if (accounts && acct.use === "account" && !acct.session) problem = "Create an account or sign in above, or choose No account.";
    else if (mode === "delivery" && !$("shop-address").value.trim()) problem = copy.errAddress;
    else if (!$("shop-name").value.trim()) problem = copy.errName;
    else if (!email.value.trim() || !email.checkValidity()) problem = "Add an email address so we can send your confirmation.";
    if (!problem && copy.liveCheckout) {
      if (mode === "delivery") problem = copy.errDeliveryLive;
      else if (products().some(function (p) { return qtyOf(p) && p.getAttribute("data-price") === null; })) problem = copy.errUnpriced;
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
    var lines = chosen.map(function (l) {
      return { kind: "menu", itemId: l.itemId, qty: l.qty, variantId: l.variantId, modifierIds: l.modifierIds };
    });
    products().forEach(function (p) {
      var q = qtyOf(p);
      if (q) lines.push({ kind: p.getAttribute("data-item-kind"), itemId: p.getAttribute("data-item-id"), qty: q });
    });
    return lines;
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
      location.href = res.redirectUrl;
    }).catch(function (e) {
      submitting(false);
      err.textContent = e.message && !/fetch|network/i.test(e.message) ? e.message : "We couldn't reach the server. You haven't been charged. Please try again.";
      err.hidden = false;
    });
  }

  $("shop-again").addEventListener("click", function () {
    form.reset();
    products().forEach(function (p) { if (p.querySelector("output")) setQty(p, 0); });
    chosen = [];
    wanted = "delivery";
    renderCart();
    $("shop-done").hidden = true;
    $("shop-order").hidden = false;
  });

  renderCart();
})();
