/* The Merle's home page: the big MERLE'S wordmark in the frame and the header's small one are the same wordmark. On the
   home view the header leaves its own out while the big one is on screen; as the page scrolls, the big one travels up
   and shrinks into the header's place, following the scroll, and the header's own takes over once it arrives.
   Scrolling back brings it down again. On the other views (menu, delivery, shop, order) the header's wordmark is always
   there. For people who ask for less motion it doesn't travel: the header's simply appears once the big one has gone
   up under the header. */
(function () {
  var hero = document.querySelector(".frame-wordmark img"), head = document.querySelector("header.site");
  var logo = head && head.querySelector(".home-link img"), home = document.querySelector('main[data-view="home"]');
  if (!hero || !logo || !home) return;
  var root = document.documentElement;
  var still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var lerp = function (a, b, p) { return a + (b - a) * p; };
  var ease = function (p) { return p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; };

  // The one that travels: a copy of the wordmark laid over the page, between the two places.
  var fly = document.createElement("img");
  fly.src = hero.currentSrc || hero.src; fly.alt = ""; fly.className = "wordmark-fly";
  fly.setAttribute("aria-hidden", "true");
  document.body.appendChild(fly);

  function update() {
    queued = false;
    if (home.hidden) {
      head.classList.remove("logo-away"); hero.style.visibility = ""; fly.style.display = "none";
      return;
    }
    var h = hero.getBoundingClientRect(), g = logo.getBoundingClientRect(), hd = head.getBoundingClientRect();
    // How far through the journey it is: 0 with the page at the top, 1 once the big one has scrolled up to where the
    // header's wordmark sits (with the header pinned at the top of the screen).
    var travel = h.top + window.scrollY - (g.top - hd.top);
    var p = clamp(window.scrollY / Math.max(travel, 1), 0, 1);
    // During the opening chat the big one isn't in yet, so there's nothing to travel.
    var shown = !root.classList.contains("mchat") || root.classList.contains("m-head");
    head.classList.toggle("logo-away", p < 1);
    if (still || !shown || p <= 0 || p >= 1) {
      fly.style.display = "none";
      hero.style.visibility = p > 0 && !still ? "hidden" : "";
      return;
    }
    // On the way: from where the big one would be now, to the header's place, growing smaller as it goes.
    var q = ease(p);
    fly.style.display = "block";
    fly.style.width = h.width + "px";
    fly.style.transform = "translate(" + lerp(h.left, g.left, q).toFixed(2) + "px," + lerp(h.top, g.top, q).toFixed(2) + "px) scale(" + (lerp(h.width, g.width, q) / h.width).toFixed(4) + ")";
    hero.style.visibility = "hidden";
  }
  var queued = false;
  function soon() { if (!queued) { queued = true; requestAnimationFrame(update); } }
  window.addEventListener("scroll", soon, { passive: true });
  window.addEventListener("resize", soon);
  window.addEventListener("hashchange", function () { setTimeout(update, 0); });
  window.addEventListener("load", update);
  // The opening chat changes whether the big one is in; keep up with it.
  new MutationObserver(soon).observe(root, { attributes: true, attributeFilter: ["class"] });
  update();
})();
