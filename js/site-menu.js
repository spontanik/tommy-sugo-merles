/* The burger menu on a brand page's header (tommy-sugo.html, merles-schnitz.html).
   The header is one row: logo, the links with the main button at the end (Make an Enquiry, Order now), and the cart
   and orders icons (js/nav-icons.js). As soon as that row no longer fits, the header goes compact: logo, icons and a
   Menu button, which opens the links and the main button underneath. It's measured, not a fixed width, so it holds
   whatever the fonts, the brand or the wording.
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
    // Compact: one row of logo, icons and Menu. The links and the main button wait in the menu.
    on + " .wrap{flex-wrap:wrap;gap:0}" +
    on + " .wrap>:first-child{margin-right:auto}" +
    on + " .menu-btn{display:inline-flex}" +
    on + " .nav.nav-icon{width:38px}" +
    on + " nav.main{display:none}" +
    // Open: the links stack full width under the top row, each on its own rule, with the main button last.
    on + ".menu-open nav.main{display:flex;order:10;flex:0 0 100%;flex-direction:column;align-items:stretch;gap:0;" +
      "margin-top:16px;border-top:2px solid " + rule + "}" +
    on + ".menu-open nav.main .nav{display:flex;align-items:center;min-height:56px;padding:0;font-size:20px;" +
      "border-bottom:2px solid " + rule + "}" +
    on + ".menu-open nav.main .nav[aria-current]{text-decoration:underline;text-decoration-thickness:3px;text-underline-offset:6px}" +
    on + ".menu-open nav.main .btn{margin:24px 0 8px}";
  document.head.appendChild(style);

  var BARS = "M4 6h16M4 12h16M4 18h16";
  var CROSS = "M6 6l12 12M18 6L6 18";
  var path = btn.querySelector("path");

  function set(open) {
    header.classList.toggle("menu-open", open);
    btn.setAttribute("aria-expanded", String(open));
    btn.setAttribute("aria-label", open ? "Close menu" : "Menu");
    if (path) path.setAttribute("d", open ? CROSS : BARS);
  }

  // Lay the header out full and see whether everything sits inside it on one line.
  function fits() {
    var was = header.classList.contains("compact");
    header.classList.remove("compact");
    var ok = wrap.scrollWidth <= wrap.clientWidth + 1;
    if (was) header.classList.add("compact");
    return ok;
  }

  var width = -1;
  function check() {
    // Only a change of width can change the answer; height changes come from opening the menu itself.
    if (wrap.clientWidth === width) return;
    width = wrap.clientWidth;
    var compact = !fits();
    header.classList.toggle("compact", compact);
    if (!compact) set(false);
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
  nav.addEventListener("click", function (e) { if (e.target.closest("a")) set(false); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && header.classList.contains("menu-open")) { set(false); btn.focus(); }
  });

  window.SiteMenu = { compact: function () { return header.classList.contains("compact"); } };
})();
