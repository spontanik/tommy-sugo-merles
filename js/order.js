/* The order for a brand page: one cart holding menu items (for collection) and shop items.
   Rules:
     - Menu items are collection only, so any food in the cart makes the whole order a collection from the kitchen.
     - Delivery is only offered when the cart holds nothing but shop items.
     - Sold-out shop items have no stepper, so they can't get into the cart.
   Anything with [data-product] and a stepper counts as a line; [data-food] marks the menu items (see catalog.js).
   Page copy comes from window.ORDER_COPY. Checkout is still a prototype: nothing is saved or charged. */
(function () {
  var form = document.getElementById("shop-form");
  if (!form) return;
  var copy = window.ORDER_COPY;
  var $ = function (id) { return document.getElementById(id); };
  var PRICE_TBC = "TBC";
  var MAX_QTY = 20;
  var wanted = "delivery"; // what the customer picked; food in the cart overrides it
  var mode = wanted;

  var style = document.createElement("style");
  style.textContent =
    ".pill:disabled{opacity:.45;cursor:not-allowed}" +
    ".cart-lines li .line-name{flex:1;min-width:0}" +
    ".line-remove{min-height:44px;margin:-12px 0;padding:0 0 0 4px;background:none;border:0;color:inherit;font:inherit;font-size:14px;text-decoration:underline;cursor:pointer}" +
    ".order-bar{position:sticky;bottom:0;z-index:10;background:var(--surface);color:var(--ink);border-top:3px solid var(--ink);padding-bottom:env(safe-area-inset-bottom,0px)}" +
    ".order-bar-in{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-top:12px;padding-bottom:12px;font-weight:700}" +
    'main[data-view="shop"]:not([hidden]) ~ .order-bar{display:none}';
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

  function renderCart() {
    var lines = $("cart-lines");
    lines.textContent = "";
    var count = 0, total = 0, allPriced = true, hasFood = false, hasShop = false;
    products().forEach(function (p) {
      var q = qtyOf(p);
      if (p.hasAttribute("data-food")) p.classList.toggle("has-qty", q > 0);
      if (!q) return;
      count += q;
      if (p.hasAttribute("data-food")) hasFood = true; else hasShop = true;
      var each = p.getAttribute("data-price");
      if (each === null) allPriced = false; else total += q * Number(each);
      var label = p.getAttribute("data-product");
      var li = document.createElement("li");
      var name = document.createElement("span");
      name.className = "line-name";
      name.textContent = q + " × " + label;
      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "line-remove";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", "Remove " + label);
      remove.addEventListener("click", function () {
        setQty(p, 0);
        renderCart();
        var h = $("cart-h");
        h.setAttribute("tabindex", "-1");
        h.focus();
      });
      var price = document.createElement("span");
      price.textContent = each === null ? PRICE_TBC : rand(q * Number(each));
      li.appendChild(name); li.appendChild(remove); li.appendChild(price);
      lines.appendChild(li);
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
    var canOrderFood = !!document.querySelector("[data-food]");
    document.querySelectorAll("[data-order-note]").forEach(function (n) { n.hidden = !canOrderFood; });
    renderCart();
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var err = $("shop-err");
    var email = $("shop-email");
    var problem = "";
    if (!renderCart()) problem = copy.errEmpty;
    else if (mode === "delivery" && !$("shop-address").value.trim()) problem = copy.errAddress;
    else if (!$("shop-name").value.trim()) problem = copy.errName;
    else if (!email.value.trim() || !email.checkValidity()) problem = "Add an email address so we can send your confirmation.";
    if (problem) { err.textContent = problem; err.hidden = false; return; }
    $("shop-done-email").textContent = email.value.trim();
    $("shop-done-title").textContent = mode === "collect" ? copy.doneCollect : copy.doneDelivery;
    $("shop-order").hidden = true;
    $("shop-done").hidden = false;
  });

  $("shop-again").addEventListener("click", function () {
    form.reset();
    products().forEach(function (p) { if (p.querySelector("output")) setQty(p, 0); });
    wanted = "delivery";
    renderCart();
    $("shop-done").hidden = true;
    $("shop-order").hidden = false;
  });

  renderCart();
})();
