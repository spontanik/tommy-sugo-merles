/* The Shop page hero: the shopfront builds itself in the empty right side (on a phone, under the words) every time the
   page opens. A floor line draws across, the walls go up, the windows and door pop in, the sign drops on with a bounce,
   the awning rolls down, and the door swings open onto the lit shop inside. Then the light inside glows gently while the
   hero is on screen. People who ask for less motion see it built and open, still. The drawing is in shop.html
   (#sf-svg, in its own units: it stands on y 0, centred on x 0); this moves it. The same shopfront closes the landing
   page's opening (js/landing-intro.js). */
(function () {
  var svg = document.getElementById("sf-svg");
  if (!svg) return;
  var $ = function (id) { return document.getElementById(id); };
  var NS = "http://www.w3.org/2000/svg";
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var prog = function (t, a, b) { return clamp((t - a) / (b - a), 0, 1); };
  var easeInOut = function (p) { return p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; };
  var easeOutBack = function (p) { var c1 = 1.6, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };
  var easeOutBounce = function (p) {
    var n = 7.5625, d = 2.75;
    if (p < 1 / d) return n * p * p;
    if (p < 2 / d) return n * (p -= 1.5 / d) * p + .75;
    if (p < 2.5 / d) return n * (p -= 2.25 / d) * p + .9375;
    return n * (p -= 2.625 / d) * p + .984375;
  };

  // ---- Timeline (ms) ----
  var T = { ground: [150, 650], build: [500, 1800], door: [1950, 2550], end: 2600 };

  // The awning: red and black stripes, a red scalloped edge.
  (function () {
    var g = $("sf-stripes");
    for (var x = -150, i = 0; x < 150; x += 20, i++) {
      if (i % 2 === 0) el("rect", { x: x, y: -177, width: 20, height: 28, fill: "#ec1c24" }, g);
    }
    var d = "M-150 -150";
    for (var j = 0; j < 10; j++) d += " a15 9 0 0 0 30 0";
    $("sf-scallop").setAttribute("d", d + " Z");
  })();

  function part(id, k, tf) {
    var g = $(id);
    g.style.display = k <= .001 ? "none" : "";
    g.setAttribute("transform", tf);
  }

  // The shopfront at a moment of its build (ms); after the end, `glow` is how bright the light inside is.
  function render(t, glow) {
    $("sf-ground").setAttribute("stroke-dashoffset", (1 - easeInOut(prog(t, T.ground[0], T.ground[1]))).toFixed(3));
    var b = prog(t, T.build[0], T.build[1]);
    var w = prog(b, 0, .32), wk = w > 0 ? easeOutBack(w) : 0;
    part("sf-wall", wk, "scale(1 " + wk.toFixed(3) + ")");
    var wi = prog(b, .28, .48), wik = wi > 0 ? easeOutBack(wi) : 0;
    part("sf-windows", wik, "translate(0 -86) scale(" + wik.toFixed(3) + ") translate(0 86)");
    var dw = prog(b, .36, .56), dwk = dw > 0 ? easeOutBack(dw) : 0;
    part("sf-doorway", dwk, "translate(0 -66) scale(" + dwk.toFixed(3) + ") translate(0 66)");
    var sg = prog(b, .5, .76);
    part("sf-sign", sg, "translate(0 " + (-(1 - easeOutBounce(sg)) * 110).toFixed(2) + ")");
    var aw = prog(b, .72, .96), awk = aw > 0 ? easeOutBack(aw) : 0;
    part("sf-awning", awk, "translate(0 -176) scale(1 " + awk.toFixed(3) + ") translate(0 176)");
    // The door swings in on its left hinge, and the light inside comes on.
    var o = easeInOut(prog(t, T.door[0], T.door[1]));
    $("sf-door").setAttribute("transform", "translate(-30 0) scale(" + (1 - .84 * o).toFixed(3) + " 1) translate(30 0)");
    $("sf-glow").setAttribute("opacity", (o * (glow == null ? 1 : glow)).toFixed(3));
  }

  // Less motion: built and open, still.
  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) { render(T.end); return; }

  render(0);
  var start = null, visible = true, raf = null, begun = false;
  function frame(now) {
    if (start == null) start = now;
    var t = now - start;
    // Once it's open, the light inside glows gently, like an oven's.
    render(t, t < T.end ? 1 : .86 + .14 * Math.sin((t - T.end) / 420) * Math.sin((t - T.end) / 1130));
    raf = visible ? requestAnimationFrame(frame) : null;
  }
  function go() { if (raf == null && visible && begun) raf = requestAnimationFrame(frame); }
  // Only while the hero is on screen (the glow stops when it's scrolled away, and picks up when it's back).
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (en) { visible = en[0].isIntersecting; go(); }).observe(svg);
  }
  // Start once the fonts are in, so the sign's lettering doesn't change as it drops on, or after a moment regardless.
  function begin() { if (begun) return; begun = true; go(); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(begin);
  setTimeout(begin, 600);
})();
