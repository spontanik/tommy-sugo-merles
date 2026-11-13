/* The cart and Your Orders icons in a brand page's header, each with a number badge.
   - Cart: [data-cart-icon]. order.js calls NavIcons.cart(count) whenever the cart changes.
   - Orders: [data-orders-icon]. The badge counts orders that are paid but not collected yet, and pulses while
     any are on the go. Its colour is the stage of the order furthest along (ready beats preparing beats received),
     and it changes colour as the order moves through the stages. Orders come from the signed-in account and from
     this device (js/account.js), and are checked again every 30 seconds while the page is open.
     The stages follow the Tommy Sugo design system's one-red rule: outline when received, solid while it's being
     made, and sauce red when ready. Behind the number, slices pulse outwards in the stage's colour.
   Without js/account.js, or with nothing outstanding, the orders badge stays hidden. */
(function () {
  var STAGES = ["received", "preparing", "ready"]; // in order: the later the stage, the more it matters
  var WORDS = { received: "received", preparing: "being prepared", ready: "ready for collection" };
  var EVERY = 30 * 1000;

  var style = document.createElement("style");
  style.textContent =
    ".nav-icons-slot{display:inline-flex}" +
    ".nav-icons{display:flex;align-items:center;gap:2px}" +
    // On phones, once the icons scroll out of view they float in the top corner.
    ".nav-icons.is-floating{position:fixed;z-index:20;top:calc(env(safe-area-inset-top,0px) + 8px);right:16px;" +
      "padding:0 4px;background:var(--surface);border:2px solid var(--rule,var(--ink))}" +
    ".nav.nav-icon{position:relative;display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;padding:0}" +
    // Tommy Sugo uses its design system's Icon set (cart, and bag for orders): filled brush strokes in ink, with no red
    // line. Merle's has its own poster-style cart and bag (scripts/draw-nav-icons.mjs), coloured by its page.
    ".nav-icon svg{flex:none;width:36px;height:36px;fill:currentColor;stroke:none}" +
    // Badges use only the brand's own colours, and change colour instantly, never by fading or growing.
    ".nav-badge{position:absolute;top:4px;right:0;min-width:17px;height:17px;padding:0 4px;border-radius:9px;" +
      "background:var(--fill,var(--ink));color:var(--on-fill,var(--surface));box-shadow:0 0 0 2px var(--surface);" +
      "font:700 11px/17px var(--sans,sans-serif);text-align:center;font-variant-numeric:tabular-nums}" +
    ".nav-badge[hidden]{display:none}" +
    // Received: an outline. Being prepared: solid. Ready: the red.
    '.nav-badge[data-stage="received"]{--pulse:var(--ink-muted);background:var(--surface);color:var(--ink);box-shadow:inset 0 0 0 2px var(--ink),0 0 0 2px var(--surface)}' +
    '.nav-badge[data-stage="preparing"]{--pulse:var(--ink)}' +
    '.nav-badge[data-stage="ready"]{--pulse:var(--sauce,var(--ink));background:var(--sauce,var(--ink));color:var(--on-sauce,var(--surface))}' +
    // While an order is on the go, a pizza of eight slices grows out from behind the number and fades, slowly.
    // The user chose this over the design system's instant-colour-only motion rule.
    ".nav-badge[data-stage]{z-index:0}" +
    ".nav-badge[data-stage]::before{content:'';position:absolute;inset:0;z-index:-1;border-radius:50%;pointer-events:none;" +
      "background:repeating-conic-gradient(var(--pulse) 0deg 40deg,transparent 40deg 45deg);" +
      "animation:nav-slices 2.8s ease-out infinite}" +
    "@keyframes nav-slices{0%{transform:scale(.4) rotate(0deg);opacity:.9}80%,100%{transform:scale(2.4) rotate(22.5deg);opacity:0}}" +
    "@media (prefers-reduced-motion:reduce){.nav-badge[data-stage]::before{animation:none;opacity:0}}";
  document.head.appendChild(style);

  function badgeOf(link) {
    var b = link.querySelector(".nav-badge");
    if (!b) {
      b = document.createElement("span");
      b.className = "nav-badge";
      b.setAttribute("aria-hidden", "true");
      b.hidden = true;
      link.appendChild(b);
    }
    return b;
  }

  // ---------- Cart ----------
  function cart(count) {
    document.querySelectorAll("[data-cart-icon]").forEach(function (link) {
      var b = badgeOf(link);
      b.hidden = !count;
      b.textContent = count > 99 ? "99+" : String(count || "");
      link.setAttribute("aria-label", count ? "Your cart, " + count + (count === 1 ? " item" : " items") : "Your cart, empty");
    });
  }

  // ---------- Orders ----------
  var links = document.querySelectorAll("[data-orders-icon]");
  var A = window.Account;
  var timer = null;

  function load() {
    var mine = A.session().then(function (s) {
      return s ? A.accountOrders(s).then(function (r) { return r.orders; }) : [];
    });
    return Promise.all([mine, A.lookupDevice()]).then(function (lists) {
      var seen = {};
      return lists[0].concat(lists[1]).filter(function (o) {
        if (seen[o.token]) return false;
        seen[o.token] = true;
        return true;
      });
    });
  }

  function draw(orders) {
    var open = orders.filter(function (o) { return STAGES.indexOf(o.status) >= 0; });
    var stage = open.reduce(function (top, o) {
      return STAGES.indexOf(o.status) > STAGES.indexOf(top) ? o.status : top;
    }, open.length ? open[0].status : null);
    var ready = open.filter(function (o) { return o.status === "ready"; }).length;
    var label = !open.length ? "Your orders"
      : "Your orders, " + open.length + (open.length === 1 ? " order " + WORDS[stage]
        : " orders on the go" + (ready ? ", " + ready + " ready for collection" : ""));
    links.forEach(function (link) {
      var b = badgeOf(link);
      b.hidden = !open.length;
      b.textContent = open.length ? String(open.length) : "";
      if (stage) b.setAttribute("data-stage", stage); else b.removeAttribute("data-stage");
      link.setAttribute("aria-label", label);
      link.title = open.map(function (o) { return "Order " + o.number + ": " + WORDS[o.status]; }).join("\n");
    });
    return open.length;
  }

  function check() {
    clearTimeout(timer);
    load().then(draw, function () { return 0; }).then(function (outstanding) {
      // Keep watching only while something's on the go and the page is in view.
      if (outstanding && !document.hidden) timer = setTimeout(check, EVERY);
    });
  }

  if (links.length && A) {
    check();
    document.addEventListener("visibilitychange", function () { if (!document.hidden) check(); });
    // An order placed or opened in another tab saves its link on this device.
    window.addEventListener("storage", function (e) { if (e.key === "tsm-device-orders") check(); });
    A.onChange(function (event) { if (event === "SIGNED_IN" || event === "SIGNED_OUT") check(); });
  }

  // ---------- Keep the icons in reach on phones ----------
  // A slot holds the icons' place in the header, so nothing below jumps when they float.
  var group = document.querySelector(".nav-icons");
  if (group && "IntersectionObserver" in window && window.matchMedia) {
    var phone = window.matchMedia("(max-width: 1023px)"); // used when js/site-menu.js isn't on the page
    var slot = document.createElement("span");
    slot.className = "nav-icons-slot";
    group.parentNode.insertBefore(slot, group);
    slot.appendChild(group);
    var above = false; // the slot has scrolled up past the top of the screen
    var place = function () {
      // They float whenever the header has gone compact behind a Menu button (js/site-menu.js).
      var float = above && (window.SiteMenu ? window.SiteMenu.compact() : phone.matches);
      if (float === group.classList.contains("is-floating")) return;
      slot.style.width = float ? group.offsetWidth + "px" : "";
      slot.style.height = float ? group.offsetHeight + "px" : "";
      group.classList.toggle("is-floating", float);
    };
    new IntersectionObserver(function (entries) {
      var e = entries[0];
      above = !e.isIntersecting && e.boundingClientRect.top < 0;
      place();
    }).observe(slot);
    if (phone.addEventListener) phone.addEventListener("change", place);
  }

  window.NavIcons = { cart: cart, refresh: check };
})();
