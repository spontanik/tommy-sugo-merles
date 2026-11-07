/* The burger menu on a brand page's header (tommy-sugo.html, merles-schnitz.html).
   The header is one row: logo, the links with the main button at the end (Make an Enquiry, Order now), and the cart
   and orders icons (js/nav-icons.js). As the row runs out of room, the links move into a Menu button one at a time,
   last link first, so the header keeps as many as fit. The main button stays in the row until every link has gone,
   then follows them. Opening the menu lists only what's tucked away, in the usual order.
   It's measured, not a fixed width, so it holds whatever the fonts, the brand or the wording.
   The links are moved, not copied, so the page's own scripts (which mark the current page) still find them.
   Without this script the Menu button stays hidden and the header wraps as it always has. */
(function () {
  var header = document.querySelector("header.site");
  var wrap = header && header.querySelector(".wrap");
  var nav = document.getElementById("main-nav");
  var btn = header && header.querySelector(".menu-btn");
  if (!wrap || !nav || !btn) return;

  var rule = "var(--rule,var(--ink))";
  var on = "header.site.has-menu.compact";
  var style = document.createElement("style");
  style.textContent =
    "header.site.has-menu .wrap{flex-wrap:nowrap}" +
    "header.site.has-menu nav.main{flex:none;flex-wrap:nowrap}" +
    "header.site.has-menu .nav-icons-slot{flex:none}" +
    "header.site.has-menu nav.main .nav{white-space:nowrap}" +
    ".menu-btn{display:none;flex:none;align-items:center;justify-content:center;width:44px;height:44px;margin-left:4px;padding:0;" +
      "background:none;border:2px solid " + rule + ";color:var(--ink);cursor:pointer}" +
    ".menu-btn svg{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:square}" +
    // The dropdown is its own strip under the top row, so opening it never pushes the row onto two lines.
    "header.site .menu-drawer{display:none;padding-block:0 16px}" +
    // Compact: logo, whatever links still fit (centred between logo and icons), the icons and Menu.
    on + " .wrap{justify-content:flex-start;gap:0}" +
    on + " .wrap>:first-child{margin-right:auto}" +
    on + " nav.main{margin:0 auto 0 32px}" +
    on + " nav.main:empty{display:none}" +
    on + " nav.main:not(:empty)+.nav-icons-slot{margin-left:32px}" +
    on + " .menu-btn{display:inline-flex}" +
    on + " .nav.nav-icon{width:38px}" +
    // Open: the tucked links stack full width under the top row, each on its own rule, with the main button last.
    on + ".menu-open .menu-drawer{display:block}" +
    on + ".menu-open .menu-panel{display:flex;flex-direction:column;align-items:stretch;gap:0;border-top:2px solid " + rule + "}" +
    on + ".menu-open .menu-panel .nav{display:flex;align-items:center;min-height:56px;padding:0;font-size:20px;" +
      "border-bottom:2px solid " + rule + "}" +
    on + ".menu-open .menu-panel .nav[aria-current]{text-decoration:underline;text-decoration-thickness:3px;text-underline-offset:6px}" +
    on + ".menu-open .menu-panel .btn{margin:24px 0 8px}";
  document.head.appendChild(style);

  // Every link and the main button, in page order. They go into the menu last link first, the button after them all.
  var items = Array.prototype.slice.call(nav.children);
  // Drop the whitespace between them, so the row counts as empty once they've all gone.
  Array.prototype.slice.call(nav.childNodes).forEach(function (n) { if (n.nodeType === 3) nav.removeChild(n); });
  var links = items.filter(function (el) { return !el.classList.contains("btn"); });
  var tuckOrder = links.slice().reverse().concat(items.filter(function (el) { return el.classList.contains("btn"); }));

  var drawer = document.createElement("div");
  drawer.className = "wrap menu-drawer";
  var panel = document.createElement("nav");
  panel.className = "menu-panel";
  panel.id = "menu-panel";
  panel.setAttribute("aria-label", "More");
  drawer.appendChild(panel);
  header.appendChild(drawer);
  btn.setAttribute("aria-controls", panel.id);

  var BARS = "M4 6h16M4 12h16M4 18h16";
  var CROSS = "M6 6l12 12M18 6L6 18";
  var path = btn.querySelector("path");

  function set(open) {
    header.classList.toggle("menu-open", open);
    btn.setAttribute("aria-expanded", String(open));
    btn.setAttribute("aria-label", open ? "Close menu" : "Menu");
    if (path) path.setAttribute("d", open ? CROSS : BARS);
  }

  // Does the top row sit inside the header on one line?
  function fits() {
    return wrap.scrollWidth <= wrap.clientWidth + 1;
  }

  // Put the first n of tuckOrder in the menu and the rest in the row, each list in page order.
  function tuck(n) {
    var away = tuckOrder.slice(0, n);
    items.forEach(function (el) { (away.indexOf(el) >= 0 ? panel : nav).appendChild(el); });
    header.classList.toggle("compact", n > 0);
  }

  var width = -1;
  function check() {
    // Only a change of width can change the answer; height changes come from opening the menu itself.
    if (wrap.clientWidth === width) return;
    width = wrap.clientWidth;
    // Start with everything in the row, then tuck one more at a time until the row fits.
    var n = 0;
    tuck(0);
    while (!fits() && n < tuckOrder.length) tuck(++n);
    if (!n) set(false);
  }

  header.classList.add("has-menu");
  btn.hidden = false;
  check();
  if (window.ResizeObserver) new ResizeObserver(check).observe(wrap);
  else window.addEventListener("resize", check);
  // The brand fonts arrive after first paint and change how wide the links are.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { width = -1; check(); });

  btn.addEventListener("click", function () { set(!header.classList.contains("menu-open")); });
  // Picking a link or the main button changes the view, so the menu has done its job.
  panel.addEventListener("click", function (e) { if (e.target.closest("a")) set(false); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && header.classList.contains("menu-open")) { set(false); btn.focus(); }
  });

  // Compact means the Menu button is showing: at least one link is tucked away.
  window.SiteMenu = { compact: function () { return header.classList.contains("compact"); } };
})();
