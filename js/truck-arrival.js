/* The events page hero: the Tommy Sugo truck drives in along the road under the buttons, stops in the empty right
   half (on a phone, in its own strip under the buttons), folds its hatch up into an awning and opens for service:
   oven glow, bunting bulbs, an OPEN sign and steam from the flue. It plays once, the first time the hero is on
   screen, then keeps a small idle loop while the hero is visible. People who ask for less motion see it parked and
   open, still. The drawing is in events.html (#tk-stage); this lays it out to match the page and moves it. */
(function () {
  if (!document.getElementById("tk-stage")) return;
  var NS = "http://www.w3.org/2000/svg";
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var easeOutCubic = function (p) { return 1 - Math.pow(1 - p, 3); };
  var easeInOut = function (p) { return p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; };
  var easeOutBack = function (p) { var c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };

  // ---- Timeline (ms) ----
  var DRIVE_END = 2600, SETTLE_END = 3100, OPEN_START = 3400, OPEN_END = 4300, LIGHTS_END = 4800, TOTAL = 5000;
  var X_START = -440, WHEEL_R = 30;

  // ---- Layout: fits the drawing to the hero, in page pixels scaled by L.s ----
  var L = { s: 1, road: 250, stop: 410 };
  var hero = document.querySelector(".hero"), slot = $("truck-slot"), svg = $("tk-stage");

  function drawBunting(x0, x1, top) {
    var g = $("tk-bunting");
    g.textContent = "";
    var span = x1 - x0;
    var y = function (x) { var u = (x - x0) / span; return top + Math.sin(u * Math.PI * 3) * 3 + 22 * Math.sin(u * Math.PI); };
    var pts = [];
    for (var x = x0; x <= x1 + .1; x += span / 40) pts.push(x.toFixed(1) + "," + y(x).toFixed(1));
    el("polyline", { points: pts.join(" "), fill: "none", stroke: "#f2f2f2", "stroke-width": 2, opacity: .7 }, g);
    var n = Math.max(4, Math.floor(span / 56));
    var step = span / n;
    for (var i = 0; i < n; i++) {
      var fx = x0 + i * step + step * .12, a = y(fx), b = y(fx + 30);
      el("polygon", { points: fx + "," + a + " " + (fx + 30) + "," + b + " " + (fx + 15) + "," + ((a + b) / 2 + 30), fill: i % 2 ? "#f2f2f2" : "#ec1c24", opacity: i % 2 ? .22 : .5 }, g);
      if (i < n - 1) el("circle", { class: "bulb", cx: fx + 30 + step * .38, cy: y(fx + 30 + step * .38) + 3, r: 3.2, fill: "#3a3a36" }, g);
    }
    bulbs = svg.querySelectorAll(".bulb");
  }

  function layout() {
    var h = hero.getBoundingClientRect(), sl = slot.getBoundingClientRect();
    var btns = document.querySelector(".hero .btns").getBoundingClientRect();
    var wide = window.innerWidth >= 1000;
    // The truck with its awning is about 400 units wide: full size when there's room, smaller on a phone.
    L.s = Math.min(1, (sl.width - 16) / 400);
    var vw = h.width / L.s, vh = h.height / L.s;
    svg.setAttribute("viewBox", "0 0 " + vw.toFixed(1) + " " + vh.toFixed(1));
    // Wide: the road just under the buttons. Narrow: the truck has its own strip under them.
    L.road = ((wide ? btns.bottom + 26 : sl.bottom - 18) - h.top) / L.s;
    // Park in the middle of the right half (the truck's middle is about 204 units in).
    L.stop = ((sl.left + sl.width / 2) - h.left) / L.s - 204;
    $("tk-road-line").setAttribute("d", "M-10 " + L.road + " L" + (vw * .2) + " " + (L.road - 1) + " L" + (vw * .5) + " " + (L.road + 1) + " L" + (vw * .8) + " " + (L.road - 1) + " L" + (vw + 10) + " " + L.road);
    var dashes = $("tk-dashes");
    dashes.textContent = "";
    for (var x = 20; x < vw; x += 110) el("rect", { x: x, y: L.road + 33, width: 46, height: 4 }, dashes);
    var bx0 = (sl.left - h.left) / L.s, bx1 = (sl.right - h.left) / L.s;
    drawBunting(bx0, bx1, Math.max(14, L.road - 335));
  }
  (function stripes() {
    var g = $("tk-stripes");
    for (var x = 4, i = 0; x < 290; x += 22, i++) {
      if (i % 2 === 0) el("rect", { x: x, y: -238, width: 22, height: 16, fill: "#ec1c24" }, g);
    }
    el("path", { d: "M14 -222 L276 -222", stroke: "#f2f2f2", "stroke-width": 2, fill: "none" }, g);
  })();

  var bulbs = [];
  layout();
  window.addEventListener("resize", function () { layout(); redraw(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { layout(); redraw(); });

  var truck = $("tk-truck"), body = $("tk-body"), spins = svg.querySelectorAll(".spin");
  var hatch = $("tk-hatch"), awning = $("tk-awning"), struts = $("tk-struts"), sign = $("tk-sign");
  var glow = $("tk-glow-rect"), boxes = $("tk-boxes"), tail = $("tk-tail");
  var puffs = $("tk-puffs"), steam = $("tk-steam"), flame = $("tk-flame");

  function xAt(t) { return X_START + (L.stop - X_START) * easeOutCubic(clamp(t / DRIVE_END, 0, 1)); }

  // Exhaust puffs: worked out from t alone, so scrubbing backwards shows exactly what was there.
  function drawPuffs(t) {
    puffs.textContent = "";
    for (var s = 0; s < DRIVE_END - 200; s += 160) {
      var age = t - s;
      if (age < 0 || age > 900) continue;
      var k = age / 900;
      var x0 = xAt(s) - 12, y0 = L.road - 46;
      el("circle", { cx: x0 - 30 * k, cy: y0 - 22 * k, r: 4 + 9 * k, fill: "none", stroke: "#f2f2f2", "stroke-width": 2, opacity: (1 - k) * .55 }, puffs);
    }
  }

  // Lights flicker on: off, on, dim, on, half, on.
  function lightsAt(t) {
    if (t < OPEN_END) return 0;
    var q = (t - OPEN_END) / (LIGHTS_END - OPEN_END);
    if (q >= 1) return 1;
    var seq = [0, 1, .15, 1, .5, 1];
    return seq[Math.floor(q * seq.length)];
  }

  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  function render(t, now) {
    // Drive
    var x = xAt(t);
    var dist = x - X_START;
    var deg = (dist / WHEEL_R) * 180 / Math.PI;
    spins.forEach(function (s) { s.setAttribute("transform", "rotate(" + deg.toFixed(2) + ")"); });

    // Springs while moving; a nose-dip that rocks back after the stop.
    var moving = clamp(1 - t / DRIVE_END, 0, 1);
    var bob = Math.sin(t / 55) * 1.6 * moving + Math.sin(t / 23) * .5 * moving;
    var pitch = 0;
    if (t > DRIVE_END * .55 && t <= DRIVE_END) pitch = 1.6 * Math.sin(((t - DRIVE_END * .55) / (DRIVE_END * .45)) * Math.PI / 2);
    if (t > DRIVE_END) { var d = (t - DRIVE_END) / 1000; pitch = 1.6 * Math.exp(-5.5 * d) * Math.cos(d * 17); }
    truck.setAttribute("transform", "translate(" + x.toFixed(2) + " " + L.road.toFixed(2) + ")");
    body.setAttribute("transform", "rotate(" + pitch.toFixed(3) + " 335 0) translate(0 " + bob.toFixed(2) + ")");
    tail.setAttribute("opacity", t > DRIVE_END * .5 && t < SETTLE_END ? 1 : .55);
    drawPuffs(t);

    // Hatch: folds up to its hinge, then opens out as the awning with a little overshoot.
    var p = clamp((t - OPEN_START) / (OPEN_END - OPEN_START), 0, 1);
    var closed = Math.max(0, 1 - easeInOut(Math.min(p * 2, 1)));
    var open = p > .5 ? easeOutBack((p - .5) * 2) : 0;
    hatch.setAttribute("transform", "translate(0 -188) scale(1 " + closed.toFixed(3) + ") translate(0 188)");
    hatch.style.display = closed <= .001 ? "none" : "";
    awning.setAttribute("transform", "translate(0 -188) scale(1 " + open.toFixed(3) + ") translate(0 188)");
    awning.style.display = open <= .001 ? "none" : "";
    struts.setAttribute("opacity", clamp((p - .6) / .4, 0, 1));

    // Lights, sign, idle
    var lit = lightsAt(t);
    var flick = reduce ? 0 : (Math.sin(now / 90) + Math.sin(now / 37)) * .06;
    glow.setAttribute("opacity", (lit * (.9 + flick)).toFixed(3));
    boxes.setAttribute("opacity", clamp((p - .7) / .3, 0, 1));
    bulbs.forEach(function (b, i) {
      var on = lit > 0 && (t - OPEN_END) > i * 25;
      var tw = reduce ? 1 : .75 + .25 * Math.sin(now / 300 + i * 1.7);
      b.setAttribute("fill", on ? "#ffb39a" : "#3a3a36");
      b.setAttribute("opacity", on ? tw.toFixed(2) : 1);
    });
    flame.setAttribute("transform", reduce ? "" : "translate(199 -126) scale(1 " + (1 + Math.sin(now / 70) * .12 + Math.sin(now / 29) * .06).toFixed(3) + ") translate(-199 126)");
    flame.setAttribute("opacity", .35 + .65 * lit);

    var s = (t - LIGHTS_END + 200) / 1000;
    sign.setAttribute("opacity", s > 0 ? 1 : 0);
    var swing = s > 0 ? 16 * Math.exp(-2.6 * s) * Math.cos(s * 9) : 0;
    if (s > 0 && !reduce) swing += Math.sin(now / 900) * .8;
    sign.setAttribute("transform", "rotate(" + swing.toFixed(2) + " 230 -236)");

    // Steam from the oven flue, once it's open
    steam.textContent = "";
    if (lit > 0 && !reduce) {
      for (var i = 0; i < 4; i++) {
        var k = ((now / 2200) + i / 4) % 1;
        el("circle", { cx: 286 + Math.sin(k * 6 + i) * 6 - k * 10, cy: -232 - k * 60, r: 3 + k * 7, fill: "none", stroke: "#f2f2f2", "stroke-width": 1.8, opacity: (.5 * (1 - k)).toFixed(2) }, steam);
      }
    }
  }

  // ---- Playback: once, from the first time the hero is seen; then the idle loop while it's on screen ----
  var start = null, visible = false, raf = null, lastT = 0;
  function frame(now) {
    if (start == null) start = now;
    lastT = reduce ? TOTAL : Math.min(TOTAL, now - start);
    render(lastT, now);
    raf = visible && !reduce ? requestAnimationFrame(frame) : null;
  }
  function redraw() { render(lastT, performance.now()); }
  function seen(isVisible) {
    visible = isVisible;
    if (visible && !raf && !reduce) raf = requestAnimationFrame(frame);
  }
  render(reduce ? TOTAL : 0, 0);
  if (reduce) lastT = TOTAL;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) { seen(entries[0].isIntersecting); }).observe(hero);
  } else {
    seen(true);
  }
})();
