/* The landing page's two trucks and shopfront, and its opening.

   The trucks: Tommy Sugo's truck and the Merle's Kombi stand nose to nose just above the Events, Trucks & Catering
   heading, hatches up as awnings (the Kombi a little smaller than Tommy's truck: it's the smaller vehicle). A little
   Tommy Sugo shopfront stands just above The Shop's heading, door open. Each is the same share of its square's height
   as the logos are of their doors', and sits midway between the top of its square and the top of its heading's
   words. They stay there.

   The opening (every time the page loads): the page starts as the bare squares, no words. Tommy's truck putters in
   from the left and the Kombi from the right, big, along the bottom of the doors. They meet in the middle with a
   friendly bump and stop. Their hatches fold up into awnings, and Tommy and Merle pop up at the counters. They turn to
   each other, then their faces spin up out of the trucks into the logos' places and open out into the full logos. The
   trucks fade away as both doors' words and buttons come in. Then Events, Trucks & Catering and the Shop come in
   together, as the trucks roll back in from either side, smaller, to meet above the Events heading; then the
   shopfront builds itself above The Shop's heading and opens its door.
   (On a phone the trucks meet on a split screen of their own, then reappear above the Events heading, and the
   shopfront builds when The Shop is scrolled to.)

   The faces are the logo files themselves (tommy-seal.png, merles-logo.svg), cropped down to the face, so the hand-over
   to the real logos is exact. The drawing is #intro-stage in index.html; the inline script there hides the squares'
   contents before they're drawn. The page scrolls while it plays (it's all drawn in page pixels, so it scrolls along).
   A click, tap or key press (other than the scrolling keys) skips to the end. ?intro=off skips it, and ?intro-t=5200
   holds it at that moment (in ms), for checking one step of it. */
(function () {
  var root = document.documentElement, stage = document.getElementById("intro-stage");
  if (!stage) return;
  var playing = root.classList.contains("intro");
  window.LandingIntro = true;

  var NS = "http://www.w3.org/2000/svg";
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var lerp = function (a, b, p) { return a + (b - a) * p; };
  var prog = function (t, a, b) { return clamp((t - a) / (b - a), 0, 1); };
  var easeOutCubic = function (p) { return 1 - Math.pow(1 - p, 3); };
  var easeInOut = function (p) { return p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; };
  var easeOutBack = function (p) { var c1 = 1.6, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };

  // ---- Timeline (ms) ----
  var T = {
    drive: [150, 2650],       // puttering in; the bump is at the end of it
    recoil: 380,              // both roll back a touch after the bump
    hatchT: [3000, 3700], hatchM: [3120, 3820],
    popT: [3650, 4100], popM: [3740, 4190],
    handoff: 4250,            // the faces leave the drawings for the logo files that will fly
    turn: [4300, 4750],       // they turn to each other
    spin: [5150, 6200],       // and spin up into the logos' places
    fade: [5250, 5850],       // phone only: the split screen fades away under them
    crop: [6200, 6600],       // each face opens out into its full logo
    away: [6250, 6650],       // the trucks fade away from the doors as the doors' words come in
    events: 7150, shop: 7150, // Events and the Shop come in together,
    backT: [7150, 7750], backM: [7300, 7900],  // as the trucks roll in either side of the Events heading
    build: [8100, 9400],      // then the shopfront builds itself above The Shop's heading
    door: [9550, 10150],      // and its door swings open
    end: 10750
  };
  // Each truck in its own units: the road is y 0. Tommy's truck faces right, its back at x 0 and front bumper at 392;
  // with its awning up it's about 240 tall. The Kombi faces left, front bumper at -4, back at 416, and is drawn at KOMBI
  // times Tommy's scale.
  var T_FRONT = 392, T_HIGH = 240, M_FRONT = -4, KOMBI = .76, RECOIL = 12;
  var ENTRY = .6;                                  // driving in, Tommy's truck is this much of its door's width
  var T_FACE = { x: 100, y: -148, w: 72 };         // the faces in the trucks: centre and width, in truck units
  var M_FACE = { x: 219.7, y: -194, w: 55.5 };
  var TURN = 40, LEAN = 7;                         // how far they turn to each other, in degrees
  // Where each face sits in its full logo. Tommy: the seal's inner circle, this fraction of its width as a radius.
  // Merle: merles-portrait.svg's box inside merles-logo.svg (both drawn on the same grid), as top, right, bottom, left.
  var SEAL_R = .345;
  // Above the headings, in these units: the two trucks nose to nose are about 720 wide; the top of Tommy's awning (the
  // highest point of the pair) is 238 above the road, and the bottom of his wheel arches (the lowest) 7 below it. The
  // shopfront is about 300 wide and its sign's top is 222 above the ground it stands on.
  // Each is sized like the logos above: the logo's share of its door's height is the picture's share of its square's
  // height. Then it sits midway between the top of its square and the top of its heading's capitals, the same gap
  // above as below (at least MIN_GAP, and never wider than its square).
  var PAIR_W = 730, TRUCKS_TOP = 238, TRUCKS_BOTTOM = 7, SHOP_W = 320, SHOP_TOP = 222, MIN_GAP = 12;
  var MC = [1 / 535, 135 / 551, 181 / 535, 144 / 551];

  stage.hidden = false;
  var svg = $("li-svg");
  var tTruck = $("li-t"), tBody = $("li-t-body"), tSpins = svg.querySelectorAll(".li-t-spin");
  var mTruck = $("li-m"), mBody = $("li-m-body"), mSpins = svg.querySelectorAll(".li-m-spin");
  var tFace = $("li-t-face"), mFace = $("li-m-face"), glow = $("li-t-glow-rect");
  var faceT = $("li-face-t"), faceM = $("li-face-m");
  var doorT = document.querySelector(".door.tommy"), doorM = document.querySelector(".door.merles");
  var logoT = doorT.querySelector(".logo"), logoM = doorM.querySelector(".logo");
  var tPuffs = $("li-t-puffs"), mPuffs = $("li-m-puffs"), bump = $("li-bump");
  var evTile = document.querySelector(".shared.events"), shopTile = document.querySelector(".shared.shop");
  var evH = evTile.querySelector("h2"), shopH = shopTile.querySelector("h2");
  var shop = $("li-shop");

  // The awnings: Tommy's red stripes, Merle's black and white ones with a scalloped edge.
  (function () {
    var g = $("li-t-stripes");
    for (var x = 4, i = 0; x < 290; x += 22, i++) {
      if (i % 2 === 0) el("rect", { x: x, y: -238, width: 22, height: 16, fill: "#ec1c24" }, g);
    }
    el("path", { d: "M14 -222 L276 -222", stroke: "#f2f2f2", "stroke-width": 2, fill: "none" }, g);
    g = $("li-m-stripes");
    for (var k = 0; k < 8; k++) {
      el("polygon", { points: (140 + k * 20) + ",-232 " + (160 + k * 20) + ",-232 " + (148 + (k + 1) * 24) + ",-286 " + (124 + k * 24) + ",-286", fill: k % 2 ? "#fff" : "#000" }, g);
    }
    var d = "M124 -286";
    for (var j = 0; j < 8; j++) d += " a12 11 0 0 0 24 0";
    $("li-m-scallop").setAttribute("d", d + " Z");
    // The shopfront's awning: red and black stripes, a red scalloped edge.
    g = $("li-s-stripes");
    for (x = -150, i = 0; x < 150; x += 20, i++) {
      if (i % 2 === 0) el("rect", { x: x, y: -177, width: 20, height: 28, fill: "#ec1c24" }, g);
    }
    d = "M-150 -150";
    for (j = 0; j < 10; j++) d += " a15 9 0 0 0 30 0";
    $("li-s-scallop").setAttribute("d", d + " Z");
  })();

  // ---- Pizza wheels (the same as the Events page truck's, from js/truck-arrival.js): each wheel is a small pizza drawn like the menu's pizza icons (black ink on paper, a crust band,
  // salami rounds with four dots, olives, a basil leaf, eight cuts) inside a thin black tyre. It sits inside .spin,
  // so the toppings roll. ----
  function drawPizzaWheel(g, seed) {
    var s = seed;
    var rand = function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    var INK = "#000", PAPER = "#f2f2f2", R = 29;
    var polar = function (r, a) { return [Math.cos(a) * r, Math.sin(a) * r]; };
    var line = function (pts, close) { return "M" + pts.map(function (p) { return p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" L") + (close ? " Z" : ""); };
    var jit = function (pts, amp) { return pts.map(function (p) { return [p[0] + (rand() - .5) * amp, p[1] + (rand() - .5) * amp]; }); };
    var ring = function (r, n, wob) { var o = []; for (var j = 0; j < n; j++) { var a = j / n * Math.PI * 2; o.push(polar(r + (wob ? wob(a) : 0), a)); } return o; };
    var ink = function (d, w, extra) { var a = { d: d, fill: "none", stroke: INK, "stroke-width": w, "stroke-linecap": "round", "stroke-linejoin": "round" }; for (var k in extra) a[k] = extra[k]; return el("path", a, g); };
    var flick = function (x, y, ang, len, w) {
      var x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
      var mx = (x + x2) / 2 + Math.cos(ang + 1.57) * len * .2, my = (y + y2) / 2 + Math.sin(ang + 1.57) * len * .2;
      ink("M" + x.toFixed(1) + " " + y.toFixed(1) + " Q" + mx.toFixed(1) + " " + my.toFixed(1) + " " + x2.toFixed(1) + " " + y2.toFixed(1), w);
    };
    g.textContent = "";
    // Sits inside a thin black tyre (r 30), so the pizza itself is a little smaller
    g = el("g", { transform: "scale(.82)" }, g);
    // The pizza: paper, wobbly ink rim, a lighter double-drawn rim inside it
    ink(line(jit(ring(R, 30), .9), true), 2.2, { fill: PAPER });
    ink(line(jit(ring(R - 3, 24), .7), true), .8);
    // Inner edge of the crust, bumpy where the cheese meets it, and flicks in the crust band
    var CR = R - 7;
    ink(line(jit(ring(CR, 40, function (a) { return Math.sin(a * 23) * 1 + Math.sin(a * 9) * .6; }), .5), true), 1.2);
    for (var k = 0; k < 16; k++) {
      var fa = k / 16 * Math.PI * 2 + rand() * .2, fp = polar(CR + 1.5 + rand() * 2, fa);
      flick(fp[0], fp[1], fa + Math.PI + (rand() - .5) * .8, 2.5 + rand() * 2, .8);
    }
    // Eight cuts, slightly wandering
    for (k = 0; k < 4; k++) {
      var ca = k * Math.PI / 4 + (rand() - .5) * .06, p0 = polar(-CR + 1, ca), p1 = polar(CR - 1, ca);
      ink(line(jit([p0, [ (p0[0] + p1[0]) * .5, (p0[1] + p1[1]) * .5 ], p1], .9)), 1);
    }
    // Toppings: one per slice, salami and olives alternating, and a basil leaf near the middle
    for (k = 0; k < 8; k++) {
      var ta = (k + .5) * Math.PI / 4 + (rand() - .5) * .25, tr = k % 2 ? 14 + rand() * 3 : 12 + rand() * 3, tp = polar(tr, ta);
      if (k % 2 === 0) {
        ink(line(jit(ring(4.6, 12).map(function (p) { return [p[0] + tp[0], p[1] + tp[1]]; }), .5), true), 1.2, { fill: PAPER });
        [[-1.5, -1.3], [1.6, -1.4], [-1.3, 1.6], [1.5, 1.3]].forEach(function (o) { el("circle", { cx: (tp[0] + o[0]).toFixed(1), cy: (tp[1] + o[1]).toFixed(1), r: .75, fill: INK }, g); });
      } else {
        el("circle", { cx: tp[0].toFixed(1), cy: tp[1].toFixed(1), r: 2.4, fill: INK }, g);
        el("circle", { cx: tp[0].toFixed(1), cy: tp[1].toFixed(1), r: .9, fill: PAPER }, g);
      }
    }
    var leaf = el("g", { transform: "rotate(" + (rand() * 360).toFixed(0) + ") translate(0 -4) scale(.42)" }, g);
    el("path", { d: "M0 -13 Q9 -4 0 12 Q-9 -4 0 -13 Z", fill: PAPER, stroke: INK, "stroke-width": 2.6, "stroke-linejoin": "round" }, leaf);
    el("path", { d: "M0 -9 L0 9 M0 -2 L-4 -6 M0 -2 L4 -6 M0 4 L-4 0 M0 4 L4 0", fill: "none", stroke: INK, "stroke-width": 1.8, "stroke-linecap": "round" }, leaf);
  }
  svg.querySelectorAll(".li-t-spin[data-pizza]").forEach(function (g) { drawPizzaWheel(g, +g.getAttribute("data-pizza")); });

  // ---- Layout, in page pixels (from the page's top-left corner) ----
  // Boxes are measured without the opening's slide-up on the words, so the trucks' size doesn't change as they come in.
  function box(e) {
    var x = 0, y = 0, w = e.offsetWidth, h = e.offsetHeight;
    for (; e; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; }
    return { left: x, top: y, right: x + w, bottom: y + h, width: w, height: h };
  }
  var L = {};
  // A heading's type: its size, its line height, and how far down each line its capitals' tops and its baseline are.
  var ctx = document.createElement("canvas").getContext("2d");
  function type(h) {
    var cs = getComputedStyle(h), fs = parseFloat(cs.fontSize), lh = parseFloat(cs.lineHeight) || fs * 1.02;
    ctx.font = cs.fontWeight + " " + fs + "px " + cs.fontFamily;
    var m = ctx.measureText("E");
    if (!m.fontBoundingBoxAscent || !m.actualBoundingBoxAscent) return { fs: fs, lh: lh, cap: fs * .12, base: lh * .8 };
    var lead = (lh - m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2;
    return { fs: fs, lh: lh, cap: lead + m.fontBoundingBoxAscent - m.actualBoundingBoxAscent, base: lead + m.fontBoundingBoxAscent };
  }
  function faceBox(img, R, fx, fy, fw) {
    img.style.left = R.left + "px"; img.style.top = R.top + "px";
    img.style.width = R.width + "px"; img.style.height = R.height + "px";
    img.style.transformOrigin = fx + "px " + fy + "px";
    return { cx: R.left + fx, cy: R.top + fy, fw: fw };
  }
  function layout() {
    var vw = document.documentElement.clientWidth, vh = window.innerHeight;
    L.vw = vw;
    var dT = box(doorT), dM = box(doorM), bd = $("li-backdrop");
    L.narrow = vw <= 820;
    if (L.narrow) {
      // A phone stacks the doors. For the opening the trucks get two halves of the screen of their own to meet in (as
      // big as half the screen allows); afterwards they're beside the Events heading.
      L.left = 0; L.right = vw; L.c = vw / 2; L.road = Math.round(vh * .62);
      L.s = Math.min(.5, (vw / 2 - 8) / (T_FRONT + RECOIL));
      $("li-bd-t").setAttribute("width", vw / 2); $("li-bd-t").setAttribute("height", vh);
      $("li-bd-m").setAttribute("x", vw / 2); $("li-bd-m").setAttribute("width", vw / 2); $("li-bd-m").setAttribute("height", vh);
    } else {
      // Wide: along the bottom of the two doors, meeting on the middle line. The doors are bare while they're there,
      // so they're big: Tommy's truck is ENTRY of its door's width, as long as both stay under the logos (so the faces
      // have somewhere to spin up to). They fade away as the doors' words come in.
      L.left = dT.left; L.right = dM.right; L.c = dT.right;
      L.road = dT.bottom - clamp(dT.height * .03, 8, 18);
      var under = L.road - Math.max(box(logoT).bottom, box(logoM).bottom) - 24;
      L.s = clamp(Math.min(ENTRY * dT.width / (T_FRONT + RECOIL), under / T_HIGH), .2, 3);
    }
    L.sM = L.s * KOMBI;
    // Where they end up: above each heading, sized like the logos and centred in the room above the heading's words.
    var bw = function (e) { return parseFloat(getComputedStyle(e).borderTopWidth) || 0; };
    var share = (box(logoT).height / dT.height + box(logoM).height / dM.height) / 2;
    var tE = box(evTile), hE = box(evH), tyE = type(evH), topE = tE.top + bw(evTile);
    var tS = box(shopTile), hS = box(shopH), tyS = type(shopH), topS = tS.top + bw(shopTile);
    var capE = hE.top + tyE.cap, capS = hS.top + tyS.cap;
    var pairH = TRUCKS_TOP + TRUCKS_BOTTOM;
    L.sS = clamp(Math.min(share * (tS.bottom - topS) / SHOP_TOP, (capS - topS - 2 * MIN_GAP) / SHOP_TOP,
      (tS.width - 40) / SHOP_W), .1, 1);
    L.sE = clamp(Math.min(share * (tE.bottom - topE) / pairH, (capE - topE - 2 * MIN_GAP) / pairH,
      (tE.width - 40) / PAIR_W), .1, 1);
    var gapS = (capS - topS - SHOP_TOP * L.sS) / 2, gapE = (capE - topE - pairH * L.sE) / 2;
    var roadS = capS - gapS, roadE = capE - gapE - TRUCKS_BOTTOM * L.sE;
    // Where the noses meet: right of the middle, so the pair is centred (Tommy's truck is the longer one).
    var cE = tE.left + tE.width / 2 + ((T_FRONT + 4) - (416 + 4 - M_FRONT) * KOMBI) / 2 * L.sE;
    L.parkT = { x: cE - (T_FRONT + 4) * L.sE, road: roadE, dir: 1 };
    L.parkM = { x: cE - (M_FRONT - 4) * L.sE * KOMBI, road: roadE, dir: -1 };
    L.shop = { x: tS.left + tS.width / 2, road: roadS };
    $("li-t-road").setAttribute("d", "M" + L.left + " " + L.road + " L" + L.c + " " + L.road);
    $("li-m-road").setAttribute("d", "M" + L.c + " " + L.road + " L" + L.right + " " + L.road);
    // Tommy comes in from off the left, the Kombi from off the right; their bumpers meet on the middle line.
    L.tStart = L.left - 410 * L.s; L.tEnd = L.c - T_FRONT * L.s;
    L.mStart = L.right + 12 * L.sM; L.mEnd = L.c - M_FRONT * L.sM;
    // The logos' places on the page, and where the face sits in each.
    var rT = box(logoT), rM = box(logoM);
    L.ft = faceBox(faceT, rT, rT.width / 2, rT.height / 2, 2 * SEAL_R * rT.width);
    L.fm = faceBox(faceM, rM, rM.width * (MC[3] + (1 - MC[3] - MC[1]) / 2), rM.height * (MC[0] + (1 - MC[0] - MC[2]) / 2), rM.width * (1 - MC[1] - MC[3]));
  }

  // ---- Where the trucks are during the opening ----
  function xs(t) {
    var p = prog(t, T.drive[0], T.drive[1]);
    // Puttering: they come in at a steady chug with little surges, still rolling when they bump (no braking).
    var u = p * (1.6 - .6 * p) + .006 * Math.sin(p * Math.PI * 14);
    var back = RECOIL * easeOutCubic(clamp((t - T.drive[1]) / T.recoil, 0, 1));
    return { t: lerp(L.tStart, L.tEnd, u) - back * L.s, m: lerp(L.mStart, L.mEnd, u) + back * L.sM, p: p };
  }

  // Exhaust puffs from the back of each truck, left behind as it drives; slower while they idle after the bump.
  var EMIT = [];
  for (var e = T.drive[0]; e < T.drive[1] - 100; e += 150) EMIT.push(e);
  for (e = T.drive[1] + 200; e < T.spin[0]; e += 420) EMIT.push(e);
  function drawPuffs(t) {
    tPuffs.textContent = ""; mPuffs.textContent = "";
    EMIT.forEach(function (at) {
      var age = t - at;
      if (age < 0 || age > 900) return;
      var k = age / 900, x = xs(at);
      [[tPuffs, L.s, x.t - 12 * L.s, -1, "#f2f2f2"], [mPuffs, L.sM, x.m + 418 * L.sM, 1, "#000"]].forEach(function (a) {
        var s = a[1];
        el("circle", { cx: (a[2] + a[3] * 30 * k * s).toFixed(1), cy: (L.road - (46 + 22 * k) * s).toFixed(1), r: ((4 + 9 * k) * s).toFixed(1), fill: "none", stroke: a[4], "stroke-width": (2 * s).toFixed(2), opacity: ((1 - k) * .5).toFixed(2) }, a[0]);
      });
    });
  }

  // The bump: a little red burst where the bumpers meet, and a heart that floats up.
  var HEART = "M0 5 C-7 -1 -11 -7 -6 -11 C-3 -13 -1 -11 0 -8 C1 -11 3 -13 6 -11 C11 -7 7 -1 0 5 Z";
  function drawBump(t) {
    bump.textContent = "";
    var d = t - T.drive[1], s = Math.max(L.s, .5), cx = L.c, cy = L.road - 46 * L.s;
    if (d > 0 && d < 420) {
      var k = d / 420;
      for (var i = 0; i < 7; i++) {
        var a = -Math.PI / 2 + (i - 3) * .42, r0 = (22 + 30 * k) * s, r1 = r0 + 18 * (1 - k) * s;
        el("path", { d: "M" + (cx + Math.cos(a) * r0).toFixed(1) + " " + (cy + Math.sin(a) * r0).toFixed(1) + " L" + (cx + Math.cos(a) * r1).toFixed(1) + " " + (cy + Math.sin(a) * r1).toFixed(1), stroke: "#ec1c24", "stroke-width": (3.5 * s).toFixed(2), "stroke-linecap": "round", opacity: (1 - k).toFixed(2) }, bump);
      }
    }
    if (d > 80 && d < 1500) {
      var hk = (d - 80) / 1420, sc = easeOutBack(Math.min(hk * 4, 1)) * 2.2 * s;
      var hy = cy - (42 + 70 * easeOutCubic(hk)) * s, op = hk > .7 ? (1 - hk) / .3 : 1;
      el("path", { d: HEART, fill: "#ec1c24", stroke: "#000", "stroke-width": 1.2, transform: "translate(" + cx.toFixed(1) + " " + hy.toFixed(1) + ") rotate(" + (Math.sin(hk * 9) * 8).toFixed(1) + ") scale(" + sc.toFixed(3) + ")", opacity: op.toFixed(2) }, bump);
    }
  }

  // Fading away from the doors, then rolling in beside the Events heading: it fades in a little way out and rolls the
  // rest of the way to its place.
  function moveTo(t, w, x0, r0, s0, P, s1) {
    var out = prog(t, T.away[0], T.away[1]);
    if (t < w[0]) return { x: x0, road: r0, s: s0, o: 1 - out };
    var p = prog(t, w[0], w[1]);
    return { x: P.x - P.dir * (1 - easeOutCubic(p)) * 60 * s1, road: P.road, s: s1, o: clamp(p * 2.5, 0, 1) };
  }

  // The shopfront building itself: the walls go up, the windows and door pop in, the sign drops on, the awning rolls
  // down; then the door swings open (in, on its left hinge) and the light inside comes on.
  var easeOutBounce = function (p) {
    var n = 7.5625, d = 2.75;
    if (p < 1 / d) return n * p * p;
    if (p < 2 / d) return n * (p -= 1.5 / d) * p + .75;
    if (p < 2.5 / d) return n * (p -= 2.25 / d) * p + .9375;
    return n * (p -= 2.625 / d) * p + .984375;
  };
  function part(id, k, tf) {
    var g = $(id);
    g.style.display = k <= .001 ? "none" : "";
    g.setAttribute("transform", tf);
  }
  function drawShop(t) {
    var b = prog(t, T.build[0], T.build[1]);
    shop.style.display = b > 0 ? "" : "none";
    if (!b) return;
    shop.setAttribute("transform", "translate(" + L.shop.x.toFixed(2) + " " + L.shop.road.toFixed(2) + ") scale(" + L.sS.toFixed(4) + ")");
    var w = prog(b, 0, .32), wk = w > 0 ? easeOutBack(w) : 0;
    part("li-s-wall", wk, "scale(1 " + wk.toFixed(3) + ")");
    var wi = prog(b, .28, .48), wik = wi > 0 ? easeOutBack(wi) : 0;
    part("li-s-windows", wik, "translate(0 -86) scale(" + wik.toFixed(3) + ") translate(0 86)");
    var dw = prog(b, .36, .56), dwk = dw > 0 ? easeOutBack(dw) : 0;
    part("li-s-doorway", dwk, "translate(0 -66) scale(" + dwk.toFixed(3) + ") translate(0 66)");
    var sg = prog(b, .5, .76);
    part("li-s-sign", sg, "translate(0 " + (-(1 - easeOutBounce(sg)) * 110).toFixed(2) + ")");
    var aw = prog(b, .72, .96), awk = aw > 0 ? easeOutBack(aw) : 0;
    part("li-s-awning", awk, "translate(0 -176) scale(1 " + awk.toFixed(3) + ") translate(0 176)");
    var o = easeInOut(prog(t, T.door[0], T.door[1]));
    $("li-s-door").setAttribute("transform", "translate(-30 0) scale(" + (1 - .84 * o).toFixed(3) + " 1) translate(30 0)");
    $("li-s-glow").setAttribute("opacity", o.toFixed(3));
  }

  // A hatch folds up to its hinge, then opens out as the awning with a little overshoot; the counter fills up.
  function hatch(id, hinge, p) {
    var closed = Math.max(0, 1 - easeInOut(Math.min(p * 2, 1)));
    var open = p > .5 ? easeOutBack((p - .5) * 2) : 0;
    var h = $(id + "-hatch"), a = $(id + "-awning");
    h.setAttribute("transform", "translate(0 " + hinge + ") scale(1 " + closed.toFixed(3) + ") translate(0 " + (-hinge) + ")");
    h.style.display = closed <= .001 ? "none" : "";
    a.setAttribute("transform", "translate(0 " + hinge + ") scale(1 " + open.toFixed(3) + ") translate(0 " + (-hinge) + ")");
    a.style.display = open <= .001 ? "none" : "";
    $(id + "-struts").setAttribute("opacity", clamp((p - .6) / .4, 0, 1));
    $(id === "li-t" ? "li-t-boxes" : "li-m-goods").setAttribute("opacity", clamp((p - .7) / .3, 0, 1));
  }

  // A flying face: the logo file in the logo's own place, cropped to the face and moved so the face is centred on
  // (x, y) at width w, turned rotY about the upright and leaning rotZ.
  function placeFace(img, f, x, y, w, rotY, rotZ) {
    img.style.transform = "translate(" + (x - f.cx).toFixed(2) + "px," + (y - f.cy).toFixed(2) + "px) perspective(900px) rotateY(" + rotY.toFixed(2) + "deg) rotate(" + rotZ.toFixed(2) + "deg) scale(" + (w / f.fw).toFixed(4) + ")";
  }
  function setCrop(c) {
    faceT.style.clipPath = "circle(" + lerp(SEAL_R * 100, 50.5, c).toFixed(2) + "% at 50% 50%)";
    faceM.style.clipPath = "inset(" + MC.map(function (v) { return (v * (1 - c) * 100).toFixed(2) + "%"; }).join(" ") + ")";
  }

  function render(t) {
    var s = L.s, sM = L.sM, x = xs(t), moving = x.p > 0 && x.p < 1 ? 1 : 0, d = t - T.drive[1];
    // Where each truck is: driving in along the bottom of the doors, then fading away and rolling in beside the Events
    // heading. On a phone, once the faces are in place the trucks are simply there beside it.
    var tp, mp, parked = L.narrow && t >= T.crop[1];
    if (L.narrow) {
      tp = parked ? { x: L.parkT.x, road: L.parkT.road, s: L.sE, o: 1 } : { x: x.t, road: L.road, s: s, o: 1 };
      mp = parked ? { x: L.parkM.x, road: L.parkM.road, s: L.sE * KOMBI, o: 1 } : { x: x.m, road: L.road, s: sM, o: 1 };
    } else {
      tp = moveTo(t, T.backT, x.t, L.road, s, L.parkT, L.sE);
      mp = moveTo(t, T.backM, x.m, L.road, sM, L.parkM, L.sE * KOMBI);
    }

    // Driving: the wheels roll with the distance, the bodies chug up and down, and the engines idle with a shiver once
    // stopped, until they're switched off.
    var degT = (tp.x - L.tStart) / (30 * tp.s) * 180 / Math.PI, degM = (mp.x - L.mStart) / (30 * mp.s) * 180 / Math.PI;
    tSpins.forEach(function (g) { g.setAttribute("transform", "rotate(" + degT.toFixed(2) + ")"); });
    mSpins.forEach(function (g) { g.setAttribute("transform", "rotate(" + degM.toFixed(2) + ")"); });
    var idle = d > 0 && t < T.spin[0] ? Math.sin(t / 45) * .35 : 0;
    var bobT = -Math.abs(Math.sin(t / 85)) * 2.6 * moving + idle;
    var bobM = -Math.abs(Math.sin(t / 85 + 1.1)) * 2.6 * moving - idle;
    // The bump: each nose kicks up and rocks back to rest.
    var imp = d > 0 ? 2.6 * Math.exp(-4.5 * d / 1000) * Math.sin(d / 1000 * 20) : 0;
    var chug = .5 * Math.sin(t / 170) * moving;
    tTruck.setAttribute("transform", "translate(" + tp.x.toFixed(2) + " " + tp.road.toFixed(2) + ") scale(" + tp.s.toFixed(4) + ")");
    mTruck.setAttribute("transform", "translate(" + mp.x.toFixed(2) + " " + mp.road.toFixed(2) + ") scale(" + mp.s.toFixed(4) + ")");
    tTruck.setAttribute("opacity", tp.o.toFixed(3));
    mTruck.setAttribute("opacity", mp.o.toFixed(3));
    tBody.setAttribute("transform", "rotate(" + (-imp + chug).toFixed(3) + " 75 0) translate(0 " + bobT.toFixed(2) + ")");
    mBody.setAttribute("transform", "rotate(" + (imp - chug).toFixed(3) + " 330 0) translate(0 " + bobM.toFixed(2) + ")");
    drawPuffs(t);
    drawBump(t);
    drawShop(shopClock == null ? t : shopClock);

    // The hatches open; the oven glows; Tommy and Merle pop up from behind their counters.
    var hT = prog(t, T.hatchT[0], T.hatchT[1]);
    hatch("li-t", -188, hT);
    hatch("li-m", -232, prog(t, T.hatchM[0], T.hatchM[1]));
    glow.setAttribute("opacity", (clamp((hT - .5) * 2, 0, 1) * .9).toFixed(2));
    var pt = prog(t, T.popT[0], T.popT[1]), pm = prog(t, T.popM[0], T.popM[1]);
    tFace.setAttribute("transform", "translate(0 " + (80 * (1 - (pt > 0 ? easeOutBack(pt) : 0))).toFixed(2) + ")");
    mFace.setAttribute("transform", "translate(0 " + (78 * (1 - (pm > 0 ? easeOutBack(pm) : 0))).toFixed(2) + ")");

    // From here the faces are the logo files, flying.
    var flying = t >= T.handoff && t < T.crop[1];
    tFace.style.display = mFace.style.display = t >= T.handoff ? "none" : "";
    faceT.style.opacity = faceM.style.opacity = flying ? 1 : 0;
    if (flying) {
      // Where each face was in its truck.
      var at = { x: x.t + T_FACE.x * s, y: L.road + T_FACE.y * s, w: T_FACE.w * s };
      var am = { x: x.m + M_FACE.x * sM, y: L.road + M_FACE.y * sM, w: M_FACE.w * sM };
      // They turn to each other, lean in, and give a little hop hello.
      var k = easeInOut(prog(t, T.turn[0], T.turn[1]));
      var hop = -Math.sin(prog(t, T.turn[1], T.spin[0]) * Math.PI) * 5 * s;
      var lean = 5 * s * k;
      // Then spin up into place: over a rising arc, growing to the logo's size, two turns about the upright.
      var q = easeInOut(prog(t, T.spin[0], T.spin[1]));
      var arc = -Math.sin(q * Math.PI) * Math.min(110, window.innerHeight * .12);
      placeFace(faceT, L.ft, lerp(at.x + lean, L.ft.cx, q), lerp(at.y + hop, L.ft.cy, q) + arc, lerp(at.w, L.ft.fw, q), lerp(TURN * k, 720, q), lerp(LEAN * k, 0, q));
      placeFace(faceM, L.fm, lerp(am.x - lean, L.fm.cx, q), lerp(am.y + hop, L.fm.cy, q) + arc, lerp(am.w, L.fm.fw, q), lerp(-TURN * k, -720, q), lerp(-LEAN * k, 0, q));
      setCrop(easeInOut(prog(t, T.crop[0], T.crop[1])));
    }

    // Phone: the split screen and the trucks on it fade away under the faces, then the trucks fade back in, parked.
    $("li-backdrop").setAttribute("display", L.narrow && !parked ? "inline" : "none");
    $("li-t-road").style.display = $("li-m-road").style.display = L.narrow ? "none" : "";
    $("li-t-road").style.opacity = $("li-m-road").style.opacity = (1 - prog(t, T.away[0], T.away[1])).toFixed(3);
    svg.style.opacity = L.narrow ? (parked ? prog(t, T.crop[1], T.crop[1] + 500) : 1 - prog(t, T.fade[0], T.fade[1])).toFixed(3) : "";

    // Then the page comes in: the logos (now the real ones) and both doors, then Events and the Shop together.
    if (playing) {
      root.classList.toggle("logos-in", t >= T.crop[1]);
      root.classList.toggle("show-doors", t >= T.crop[1]);
      root.classList.toggle("show-events", t >= T.events);
      root.classList.toggle("show-shop", t >= T.shop);
    }
  }

  // ---- Playback ----
  var start = null, raf = null, begun = false, lastT = T.end, shopClock = null;
  function remeasure() { layout(); render(lastT); }
  // The page scrolls while it plays. On a phone that shows and hides the address bar, which changes only the screen's
  // height: the trucks stay where they are rather than jumping mid-drive. A change of width lays it all out again.
  function onResize() {
    if (playing && L.narrow && document.documentElement.clientWidth === L.vw) return;
    remeasure();
  }
  // On a phone The Shop is well down the page, so after the opening its shopfront waits, and builds when it's scrolled to.
  function buildShopOnView() {
    if (!L.narrow || !("IntersectionObserver" in window)) return;
    shopClock = T.build[0];
    var io = new IntersectionObserver(function (en) {
      if (!en[0].isIntersecting) return;
      io.disconnect();
      var t0 = null;
      requestAnimationFrame(function step(now) {
        if (t0 == null) t0 = now;
        shopClock = T.build[0] + (now - t0);
        if (shopClock >= T.door[1]) shopClock = null;
        render(lastT);
        if (shopClock != null) requestAnimationFrame(step);
      });
    }, { threshold: .5 });
    io.observe(shopH);
  }
  function settle() {
    // The page's final layout: parked and open, and the page's words all in.
    var played = playing;
    playing = false;
    if (raf) cancelAnimationFrame(raf);
    root.classList.remove("intro", "logos-in", "show-doors", "show-events", "show-shop");
    faceT.remove(); faceM.remove();
    document.removeEventListener("click", settle, true);
    window.removeEventListener("keydown", onKey);
    lastT = T.end;
    layout();
    if (played) buildShopOnView();
    render(lastT);
  }
  window.addEventListener("resize", onResize);
  // Measure again once the fonts and pictures are in, in case they moved things.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);
  window.addEventListener("load", remeasure);
  // A key press skips to the end, except the keys that scroll the page: scrolling leaves it playing.
  var SCROLL_KEYS = /^(ArrowUp|ArrowDown|PageUp|PageDown|Home|End| |Spacebar)$/;
  function onKey(e) { if (!SCROLL_KEYS.test(e.key)) settle(); }

  if (!playing) { settle(); return; }

  // ?intro=preview (intro-preview.html): it doesn't finish or skip, but stops on its last frame, and the preview page
  // drives it through window.LandingIntro: play, pause, seek to a moment, and change the speed.
  var preview = /[?&]intro=preview/.test(location.search), paused = false, speed = 1, prev = null;
  function frame(now) {
    if (prev == null) prev = now;
    if (!paused) lastT += (now - prev) * speed;
    prev = now;
    // It finishes (and the squares can be clicked) as soon as nothing on screen is moving any more: on a phone once
    // Events' and the Shop's words are in (the shopfront builds later, when it's scrolled to), on a wider screen once
    // the shop door is open.
    if (!preview && lastT >= (L.narrow ? T.events + 800 : T.door[1])) return settle();
    if (lastT >= T.end) {
      if (!preview) return settle();
      lastT = T.end; paused = true;
    }
    render(lastT);
    raf = requestAnimationFrame(frame);
  }
  function begin() {
    if (begun || !playing) return;
    begun = true;
    raf = requestAnimationFrame(frame);
  }

  window.scrollTo(0, 0);
  lastT = 0;
  layout();
  setCrop(0);
  render(0);
  var hold = /[?&]intro-t=(\d+)/.exec(location.search);
  if (hold) { lastT = +hold[1]; render(lastT); return; }
  if (preview) {
    window.LandingIntro = {
      steps: T,
      time: function () { return lastT; },
      paused: function () { return paused; },
      play: function () { if (lastT >= T.end) lastT = 0; paused = false; begin(); },
      pause: function () { paused = true; },
      seek: function (t) { lastT = clamp(t, 0, T.end); render(lastT); },
      setSpeed: function (v) { speed = v; }
    };
  } else {
    document.addEventListener("click", settle, true);
    window.addEventListener("keydown", onKey);
  }
  // Start once the pictures are in (the trucks' seal, Merle's portrait, the logos), or after a moment regardless.
  if (document.readyState === "complete") begin();
  else { window.addEventListener("load", begin); setTimeout(begin, 2500); }
})();
