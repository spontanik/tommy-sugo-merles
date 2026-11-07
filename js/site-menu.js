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
    // The menu and close icons are the Tommy Sugo design system's brush strokes, filled in ink.
    ".menu-btn svg{fill:currentColor;stroke:none}" +
    // The dropdown is its own strip under the top row, so opening it never pushes the row onto two lines.
    // (Specific enough to beat the page's own "header.site .wrap", which Merle's loads after this.)
    "header.site .wrap.menu-drawer{display:none;padding-block:0 16px}" +
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

  // The design system's menu and close icons (48 by 48), swapped as the menu opens and shuts.
  var BARS = "M6.5 13.0 L7.4 13.6 L8.3 13.9 L9.2 14.1 L10.1 14.3 L11.0 14.4 L11.9 14.6 L12.8 14.7 L13.7 14.8 L14.6 14.9 L15.5 14.8 L16.4 14.8 L17.3 14.9 L18.2 14.9 L19.1 15.0 L20.0 15.0 L20.9 15.0 L21.8 15.0 L22.7 15.0 L23.6 15.0 L24.5 14.8 L25.4 14.8 L26.3 14.8 L27.2 14.7 L28.1 14.7 L29.0 14.6 L29.9 14.6 L30.8 14.5 L31.7 14.4 L32.6 14.4 L33.5 14.2 L34.4 14.1 L35.3 14.0 L36.2 13.9 L37.1 13.7 L38.0 13.6 L38.9 13.4 L39.8 13.2 L40.7 13.0 L41.5 12.5 L41.5 12.5 L40.7 12.0 L39.8 11.8 L38.9 11.6 L38.0 11.5 L37.1 11.4 L36.2 11.3 L35.3 11.2 L34.4 11.1 L33.5 11.1 L32.6 10.9 L31.7 10.8 L30.8 10.8 L29.9 10.8 L29.0 10.7 L28.1 10.7 L27.2 10.7 L26.3 10.7 L25.4 10.7 L24.5 10.7 L23.6 10.5 L22.7 10.5 L21.8 10.5 L20.9 10.6 L20.0 10.6 L19.1 10.7 L18.2 10.7 L17.3 10.8 L16.4 10.9 L15.5 11.0 L14.6 10.9 L13.7 11.0 L12.8 11.1 L11.9 11.3 L11.0 11.4 L10.1 11.6 L9.2 11.8 L8.3 12.1 L7.4 12.4 L6.5 13.0ZM6.5 24.0 L7.4 24.7 L8.3 25.0 L9.2 25.3 L10.1 25.5 L11.0 25.7 L11.9 25.8 L12.8 26.0 L13.7 25.8 L14.6 25.9 L15.5 26.0 L16.4 26.1 L17.3 26.2 L18.2 26.2 L19.1 26.3 L20.0 26.3 L20.9 26.6 L21.8 26.6 L22.7 26.6 L23.6 26.6 L24.5 26.5 L25.4 26.5 L26.3 26.5 L27.2 26.4 L28.1 26.5 L29.0 26.4 L29.9 26.3 L30.8 26.1 L31.7 25.9 L32.6 25.8 L33.5 25.5 L34.4 25.2 L35.0 24.5 L35.0 24.5 L34.4 23.8 L33.5 23.4 L32.6 23.2 L31.7 22.9 L30.8 22.7 L29.9 22.6 L29.0 22.4 L28.1 22.3 L27.2 22.3 L26.3 22.2 L25.4 22.2 L24.5 22.1 L23.6 22.0 L22.7 22.0 L21.8 21.9 L20.9 21.9 L20.0 22.2 L19.1 22.2 L18.2 22.2 L17.3 22.2 L16.4 22.3 L15.5 22.3 L14.6 22.4 L13.7 22.4 L12.8 22.2 L11.9 22.3 L11.0 22.5 L10.1 22.6 L9.2 22.8 L8.3 23.0 L7.4 23.3 L6.5 24.0ZM6.5 35.5 L7.4 36.0 L8.3 36.3 L9.2 36.5 L10.1 36.6 L11.0 36.8 L11.9 36.9 L12.8 37.0 L13.7 37.1 L14.6 37.2 L15.5 37.3 L16.4 37.4 L17.3 37.4 L18.2 37.5 L19.1 37.5 L20.0 37.5 L20.9 37.6 L21.8 37.6 L22.7 37.6 L23.6 37.6 L24.5 37.3 L25.4 37.2 L26.3 37.2 L27.2 37.2 L28.1 37.1 L29.0 37.1 L29.9 37.0 L30.8 37.0 L31.7 36.9 L32.6 36.8 L33.5 36.8 L34.4 36.7 L35.3 36.5 L36.2 36.4 L37.1 36.3 L38.0 36.1 L38.9 36.0 L39.8 35.8 L40.7 35.5 L41.5 35.0 L41.5 35.0 L40.7 34.5 L39.8 34.3 L38.9 34.1 L38.0 34.0 L37.1 33.8 L36.2 33.7 L35.3 33.6 L34.4 33.6 L33.5 33.5 L32.6 33.4 L31.7 33.4 L30.8 33.3 L29.9 33.3 L29.0 33.3 L28.1 33.2 L27.2 33.2 L26.3 33.2 L25.4 33.2 L24.5 33.2 L23.6 32.9 L22.7 33.0 L21.8 33.0 L20.9 33.0 L20.0 33.1 L19.1 33.1 L18.2 33.2 L17.3 33.3 L16.4 33.4 L15.5 33.4 L14.6 33.6 L13.7 33.7 L12.8 33.8 L11.9 33.9 L11.0 34.1 L10.1 34.3 L9.2 34.4 L8.3 34.7 L7.4 34.9 L6.5 35.5Z";
  var CROSS = "M10.5 10.5 L10.8 11.5 L11.2 12.3 L11.7 13.1 L12.2 13.9 L12.8 14.6 L13.3 15.3 L13.9 16.0 L14.4 16.8 L15.0 17.5 L15.6 18.2 L16.1 18.9 L16.7 19.6 L17.3 20.2 L17.9 20.9 L18.5 21.6 L19.1 22.2 L19.7 22.9 L20.3 23.6 L21.0 24.2 L21.6 24.9 L22.2 25.5 L23.1 25.9 L23.7 26.6 L24.4 27.2 L25.0 27.8 L25.7 28.4 L26.3 29.0 L27.0 29.7 L27.6 30.3 L28.3 30.9 L29.0 31.5 L29.7 32.1 L30.1 32.9 L30.8 33.5 L31.5 34.1 L32.2 34.6 L32.9 35.2 L33.7 35.7 L34.4 36.2 L35.2 36.7 L36.0 37.2 L36.8 37.7 L37.5 37.5 L37.5 37.5 L37.7 36.8 L37.2 36.0 L36.7 35.2 L36.2 34.4 L35.7 33.7 L35.2 32.9 L34.6 32.2 L34.1 31.5 L33.5 30.8 L32.9 30.1 L32.1 29.7 L31.5 29.0 L30.9 28.3 L30.3 27.6 L29.7 27.0 L29.0 26.3 L28.4 25.7 L27.8 25.0 L27.2 24.4 L26.6 23.7 L25.9 23.1 L25.5 22.2 L24.9 21.6 L24.2 21.0 L23.6 20.3 L22.9 19.7 L22.2 19.1 L21.6 18.5 L20.9 17.9 L20.2 17.3 L19.6 16.7 L18.9 16.1 L18.2 15.6 L17.5 15.0 L16.8 14.4 L16.0 13.9 L15.3 13.3 L14.6 12.8 L13.9 12.2 L13.1 11.7 L12.3 11.2 L11.5 10.8 L10.5 10.5ZM37.5 10.5 L36.5 10.8 L35.7 11.3 L35.0 11.8 L34.2 12.3 L33.5 12.9 L32.8 13.4 L32.1 14.0 L31.4 14.6 L30.7 15.1 L30.0 15.7 L29.1 16.1 L28.5 16.7 L27.8 17.3 L27.1 17.9 L26.4 18.5 L25.8 19.1 L25.1 19.7 L24.4 20.4 L23.8 21.0 L23.2 21.6 L22.5 22.2 L22.1 23.1 L21.4 23.7 L20.8 24.4 L20.2 25.0 L19.6 25.7 L19.0 26.3 L18.3 27.0 L17.7 27.6 L17.1 28.3 L16.5 29.0 L15.9 29.7 L15.3 30.3 L14.7 31.0 L14.1 31.7 L13.6 32.4 L13.0 33.1 L12.5 33.8 L11.9 34.6 L11.4 35.3 L10.9 36.1 L10.4 36.9 L10.5 37.5 L10.5 37.5 L11.1 37.6 L11.9 37.1 L12.7 36.6 L13.4 36.1 L14.2 35.5 L14.9 35.0 L15.6 34.4 L16.3 33.9 L17.0 33.3 L17.7 32.7 L18.3 32.1 L19.0 31.5 L19.7 30.9 L20.4 30.3 L21.0 29.7 L21.7 29.0 L22.3 28.4 L23.0 27.8 L23.6 27.2 L24.3 26.6 L24.9 25.9 L25.8 25.5 L26.4 24.8 L27.0 24.2 L27.6 23.6 L28.3 22.9 L28.9 22.2 L29.5 21.6 L30.1 20.9 L30.7 20.2 L31.3 19.5 L31.9 18.9 L32.3 18.0 L32.9 17.3 L33.4 16.6 L34.0 15.9 L34.6 15.2 L35.1 14.5 L35.7 13.8 L36.2 13.0 L36.7 12.3 L37.2 11.5 L37.5 10.5Z";
  var svg = btn.querySelector("svg");
  var path = btn.querySelector("path");
  if (svg) svg.setAttribute("viewBox", "0 0 48 48");

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
