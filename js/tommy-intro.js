/* The landing page's Tommy Sugo door, introduced: a terminal cursor types five dots and deletes them, then types
   "Last night a pizza saved my life." while eight pizza slices (drawn like the menu's pizza icons) drop from the top
   of the door into the seal's place. They snap together, the pizza spins up and flips over into the seal, the line
   about the bases and the Enter button fade up; a second after the spin ends, Tommy winks.

   - Plays every time the landing page loads, reloads included.
   - People who ask their device for less motion, and anyone without scripts, see the door exactly as it was.
   - A click or a key press on the door skips to the end.
   - Everything is in its final place from the start, just hidden, so nothing on the page moves when it finishes.
   The drawing is in index.html (#ti-logo). */
(function () {
  var NS = "http://www.w3.org/2000/svg";
  var $ = function (id) { return document.getElementById(id); };
  var logo = $("ti-logo");
  if (!logo) return;
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return;

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var prog = function (t, a, b) { return clamp((t - a) / (b - a), 0, 1); };
  var easeIn = function (p) { return p * p; };
  var easeOut = function (p) { return 1 - Math.pow(1 - p, 3); };
  var easeInOut = function (p) { return p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; };
  var easeOutBack = function (p) { var c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };

  var PAPER = "#f2f2f2", RED = "#ec1c24";
  var R = 150, N = 8, GAP = 12;
  function rng(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
  var rand = rng(11);
  function polar(r, a) { return [Math.cos(a) * r, Math.sin(a) * r]; }

  // ---- Timeline, in ms at full speed; it plays at SPEED ----
  var SPEED = 1;
  var DOTS = 5, DOT_AT = 300, DOT_EVERY = 160, DOTS_GONE = [1500, 1800];
  var TYPE_AT = 1900, CHAR = 70;
  var ORDER = [0, 4, 2, 6, 1, 5, 3, 7], STAGGER = 260, FALL = 600, FALL_AT = 1900;
  var SNAP = [4350, 4600], SPIN = [4650, 6050], FLIP = [5350, 5850], LAND = [6050, 6400];
  // The wink comes 1 s after the spin ends, just after the Enter button appears.
  var LEDE = [6300, 6800], BTN = [6700, 7200], CURSOR_GONE = 6300, WINK = [7050, 7190], SPARKLE = [7060, 7420];
  var TOTAL = 7500, TURNS = 3;

  // ---- Build the eight slices once, drawn like the menu's pizza icons ----
  // Black ink, hand-drawn (every line wobbles a little), on a paper-white pizza; a crust band of grass-like flicks;
  // salami as white rounds with four dots, black olives, outlined basil; a thick red ring set slightly off.
  var INK = "#000";
  function jitter(pts, amp) {
    return pts.map(function (p) { return [p[0] + (rand() - .5) * amp, p[1] + (rand() - .5) * amp]; });
  }
  function line(pts, close) {
    return "M" + pts.map(function (p) { return p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" L") + (close ? " Z" : "");
  }
  function arcPts(r, a0, a1, n, wob) {
    var out = [];
    for (var j = 0; j <= n; j++) {
      var a = a0 + (a1 - a0) * j / n;
      out.push(polar(r + (wob ? wob(a) : 0), a));
    }
    return out;
  }
  function ink(d, w, parent, extra) {
    return el("path", Object.assign({ d: d, fill: "none", stroke: INK, "stroke-width": w, "stroke-linecap": "round", "stroke-linejoin": "round" }, extra || {}), parent);
  }
  function wobblyCircle(cx, cy, r, n) {
    var pts = [];
    for (var j = 0; j < n; j++) { var a = j / n * Math.PI * 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    return line(jitter(pts, r * .08), true);
  }
  function flick(x, y, ang, len, parent, w) {
    var x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
    var mx = (x + x2) / 2 + Math.cos(ang + 1.57) * len * .18, my = (y + y2) / 2 + Math.sin(ang + 1.57) * len * .18;
    ink("M" + x.toFixed(1) + " " + y.toFixed(1) + " Q" + mx.toFixed(1) + " " + my.toFixed(1) + " " + x2.toFixed(1) + " " + y2.toFixed(1), w || 1.2, parent);
  }

  var pizza = $("ti-pizza"), slices = [];
  var CRUST_IN = R - 24;
  for (var i = 0; i < N; i++) {
    var a0 = i * (Math.PI * 2 / N) - Math.PI / 2, a1 = a0 + Math.PI * 2 / N, mid = (a0 + a1) / 2;
    var g = el("g", {}, pizza);
    // The red ring, off-register behind the rim
    el("path", { d: line(arcPts(R + 9, a0, a1, 16)), fill: "none", stroke: RED, "stroke-width": 10, "stroke-linecap": "butt", transform: "translate(3 2.5)" }, g);
    // The slice: paper fill, wobbly ink outline
    var outline = [[0, 0]].concat(arcPts(R, a0, a1, 22)).concat([[0, 0]]);
    el("path", { d: line(jitter(outline, 1.6), true), fill: PAPER, stroke: INK, "stroke-width": 2.6, "stroke-linejoin": "round" }, g);
    // A second, lighter rim line, like a double-drawn edge
    ink(line(jitter(arcPts(R - 5, a0 + .03, a1 - .03, 14), 1.2)), 1.2, g);
    // Inner edge of the crust: bumpy, where the cheese meets it
    var bump = function (a) { return Math.sin(a * 46) * 2.2 + Math.sin(a * 17) * 1.5; };
    ink(line(jitter(arcPts(CRUST_IN, a0 + .02, a1 - .02, 26, bump), 1)), 1.8, g);
    // Grass-like flicks in the crust band, pointing in
    for (var k = 0; k < 13; k++) {
      var fa = a0 + .05 + (a1 - a0 - .1) * (k + rand() * .6) / 13;
      var fr = CRUST_IN + 2 + rand() * 5;
      var fp = polar(fr, fa);
      flick(fp[0], fp[1], fa + Math.PI + (rand() - .5) * .9, 6 + rand() * 7, g, 1.1);
    }
    // Short ticks along the rim
    for (k = 0; k < 9; k++) {
      var ta = a0 + .06 + (a1 - a0 - .12) * (k + rand() * .5) / 9, tp = polar(R - 13, ta);
      flick(tp[0], tp[1], ta + (rand() - .5) * 1.4, 4 + rand() * 3, g, 1);
    }
    // Toppings: salami rounds with four dots, an olive, a basil leaf
    var tops = [
      { kind: "salami", r: R * .62, a: mid + (i % 2 ? .12 : -.1) },
      { kind: i % 2 ? "olive" : "salami", r: R * .3, a: mid - .15 },
      { kind: "basil", r: R * .48, a: mid + .3 * (i % 2 ? -1 : 1) },
      { kind: "olive", r: R * .78, a: mid - .28 }
    ];
    tops.forEach(function (tp) {
      var p = polar(tp.r, tp.a), x = p[0], y = p[1];
      if (tp.kind === "salami") {
        el("path", { d: wobblyCircle(x, y, 15, 18), fill: PAPER, stroke: INK, "stroke-width": 2.2, "stroke-linejoin": "round" }, g);
        [[-5, -4], [5, -5], [-4, 5], [5, 4]].forEach(function (o) { el("circle", { cx: (x + o[0]).toFixed(1), cy: (y + o[1]).toFixed(1), r: 2.1, fill: INK }, g); });
      } else if (tp.kind === "olive") {
        el("circle", { cx: x.toFixed(1), cy: y.toFixed(1), r: 6.5, fill: INK }, g);
        el("circle", { cx: x.toFixed(1), cy: y.toFixed(1), r: 2.6, fill: PAPER }, g);
      } else {
        var rot = (tp.a * 180 / Math.PI + 90 + (rand() - .5) * 60).toFixed(0);
        var leaf = el("g", { transform: "translate(" + x.toFixed(1) + " " + y.toFixed(1) + ") rotate(" + rot + ")" }, g);
        ink("M0 -13 Q9 -4 0 12 Q-9 -4 0 -13 Z", 2, leaf, { fill: PAPER });
        ink("M0 -9 L0 9 M0 -2 L-4 -6 M0 -2 L4 -6 M0 4 L-4 0 M0 4 L4 0", 1.3, leaf);
      }
    });
    // A few cheese flecks
    for (k = 0; k < 4; k++) {
      var ca = a0 + .15 + rand() * (a1 - a0 - .3), cp = polar(28 + rand() * (CRUST_IN - 50), ca);
      flick(cp[0], cp[1], rand() * 6.28, 5 + rand() * 4, g, 1.2);
    }
    slices.push({ g: g, mid: mid, startX: (rand() - .5) * 260, spin: (rand() - .5) * 400, order: ORDER.indexOf(i) });
  }


  // ---- The headline: one span per letter, in place but unseen ----
  var door = logo.closest(".door"), h1 = door.querySelector("h1");
  var lede = door.querySelector(".lede"), btn = door.querySelector(".btn");
  var full = h1.textContent.replace(/\s+/g, " ").trim();
  h1.setAttribute("aria-label", full);
  var chars = [];
  h1.querySelectorAll(".line").forEach(function (line) {
    var text = line.textContent;
    line.textContent = "";
    line.setAttribute("aria-hidden", "true");
    var inner = document.createElement("span");
    inner.className = "inner";
    line.appendChild(inner);
    text.split("").forEach(function (c) {
      var s = document.createElement("span");
      s.className = "ch";
      s.textContent = c;
      inner.appendChild(s);
      chars.push(s);
    });
  });
  var NCH = chars.length, TYPE_END = TYPE_AT + NCH * CHAR;
  var dots = document.createElement("span");
  dots.className = "dots";
  chars[0].parentNode.appendChild(dots);
  var cur = document.createElement("span");
  cur.className = "cur";

  var toss = $("ti-toss"), seal = $("ti-seal"), wink = $("ti-wink"), spk = $("ti-sparkle");
  var FROM = 0;
  function fallFrom() {
    var d = door.getBoundingClientRect(), l = logo.getBoundingClientRect();
    FROM = -((l.top - d.top) * (320 / l.width) + 160 + R + 40);
  }
  fallFrom();
  window.addEventListener("resize", fallFrom);

  function render(t, now) {
    var nd = 0;
    if (t >= DOT_AT && t < DOTS_GONE[0]) nd = Math.min(DOTS, Math.floor((t - DOT_AT) / DOT_EVERY) + 1);
    else if (t >= DOTS_GONE[0] && t < DOTS_GONE[1]) nd = DOTS - Math.floor(prog(t, DOTS_GONE[0], DOTS_GONE[1]) * DOTS);
    dots.textContent = new Array(nd + 1).join(".");
    var typed = t < TYPE_AT ? 0 : Math.min(NCH, Math.floor((t - TYPE_AT) / CHAR) + 1);
    chars.forEach(function (c, i) { c.classList.toggle("on", i < typed); });
    if (t >= CURSOR_GONE) { if (cur.parentNode) cur.parentNode.removeChild(cur); }
    else if (typed === 0) dots.appendChild(cur);
    else { var last = chars[typed - 1]; last.parentNode.insertBefore(cur, last.nextSibling); }
    var busy = (t >= DOT_AT && t < DOTS_GONE[1]) || (t >= TYPE_AT && t < TYPE_END);
    cur.classList.toggle("off", !busy && Math.floor(now / 530) % 2 === 1);

    var snap = easeOutBack(prog(t, SNAP[0], SNAP[1]));
    slices.forEach(function (s) {
      var start = FALL_AT + s.order * STAGGER, p = prog(t, start, start + FALL);
      if (p <= 0) { s.g.style.display = "none"; return; }
      s.g.style.display = "";
      var gap = GAP * (1 - snap), gx = Math.cos(s.mid) * gap, gy = Math.sin(s.mid) * gap, x, y, rot;
      if (p < .78) {
        var q = easeIn(p / .78);
        x = s.startX * .5 * (1 - q) + gx; y = FROM * (1 - q) + gy; rot = s.spin * (1 - q);
      } else {
        var b = (p - .78) / .22;
        x = gx; y = gy - Math.sin(b * Math.PI) * 12; rot = 0;
      }
      s.g.setAttribute("transform", "translate(" + x.toFixed(2) + " " + y.toFixed(2) + ") rotate(" + rot.toFixed(2) + ")");
    });

    var sp = prog(t, SPIN[0], SPIN[1]);
    var theta = 360 * TURNS * easeInOut(sp), lift = Math.sin(sp * Math.PI) * 46, scale = 1 + Math.sin(sp * Math.PI) * .08;
    var fp = prog(t, FLIP[0], FLIP[1]);
    var sx = fp > 0 && fp < 1 ? Math.abs(Math.cos(fp * Math.PI)) : 1;
    var lp = prog(t, LAND[0], LAND[1]);
    var squash = lp > 0 && lp < 1 ? Math.sin(lp * Math.PI) * Math.exp(-3 * lp) * .07 : 0;
    toss.setAttribute("transform", "translate(0 " + (-lift).toFixed(2) + ") scale(" + (sx * scale * (1 + squash)).toFixed(4) + " " + (scale * (1 - squash)).toFixed(4) + ") rotate(" + theta.toFixed(2) + ")");
    var showSeal = fp >= .5;
    pizza.style.display = showSeal ? "none" : "";
    seal.style.display = showSeal ? "" : "none";

    wink.style.display = t >= WINK[0] && t < WINK[1] ? "" : "none";
    var kp = prog(t, SPARKLE[0], SPARKLE[1]);
    spk.style.display = kp > 0 && kp < 1 ? "" : "none";
    if (kp > 0 && kp < 1) {
      var pop = kp < .35 ? easeOutBack(kp / .35) * .72 : .72 - (kp - .35) / .65 * .26;
      spk.setAttribute("transform", "translate(-12 -13) rotate(" + (kp * 90).toFixed(1) + ") scale(" + pop.toFixed(3) + ")");
      spk.setAttribute("opacity", (kp < .7 ? 1 : 1 - (kp - .7) / .3).toFixed(2));
    }

    [[lede, LEDE], [btn, BTN]].forEach(function (pair) {
      var p = easeOut(prog(t, pair[1][0], pair[1][1]));
      pair[0].style.opacity = p.toFixed(3);
      pair[0].style.transform = "translateY(" + (10 * (1 - p)).toFixed(2) + "px)";
      pair[0].style.pointerEvents = p > .5 ? "" : "none";
    });
  }

  // Back to the door as it is in the page, once the intro is over (or skipped).
  function finish() {
    done = true;
    chars.forEach(function (c) { c.classList.add("on"); });
    dots.textContent = "";
    if (cur.parentNode) cur.parentNode.removeChild(cur);
    slices.forEach(function (s) { s.g.style.display = "none"; });
    toss.removeAttribute("transform");
    seal.style.display = "";
    wink.style.display = spk.style.display = "none";
    [lede, btn].forEach(function (n) { n.style.opacity = n.style.transform = n.style.pointerEvents = ""; });
    door.removeEventListener("click", skip);
    document.removeEventListener("keydown", skip);
  }
  function skip(e) {
    if (done || (e.target && e.target.closest && e.target.closest("a"))) return;
    finish();
  }
  door.addEventListener("click", skip);
  document.addEventListener("keydown", skip);

  var start = null, done = false;
  function frame(now) {
    if (done) return;
    if (start == null) start = now;
    var t = (now - start) * SPEED;
    if (t >= TOTAL) { finish(); return; }
    render(t, now);
    requestAnimationFrame(frame);
  }
  render(0, 0);
  requestAnimationFrame(frame);
})();
