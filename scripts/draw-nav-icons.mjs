// Draws the Menu, Delivery and Shop icons for each brand's header, on a 48 by 48 grid.
//   Tommy Sugo: brush-stroke ink like the design system's cart and bag icons, with the red "misprint" line the
//   illustrations have, offset down and right.
//   Merle's: the poster look of its illustrations, with grey shapes in heavy black outline and a hard black shadow.
// Pass --circle to draw each icon inside a circle: a brush-drawn ring for Tommy Sugo, a solid black ring for Merle's.
// The ring's colours come from the page too (.pic-ring).
// Run `node scripts/draw-nav-icons.mjs` and paste each brand's <svg> into its page's header. Colours come from the
// page through classes (see .nav-pic in tommy-sugo.html and merles-schnitz.html), so the SVGs hold no colours.

const CIRCLE = process.argv.includes("--circle");
// Inside a circle the drawing shrinks to fit, about its centre.
const INNER = "translate(24 24) scale(0.6) translate(-24 -24)";
const SIZE = 48;

// ---------- Shared geometry ----------
let seed = 1;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const r1 = (n) => Math.round(n * 10) / 10;

// A smooth curve through the points (Catmull-Rom), sampled about every 0.8 units.
function smooth(points) {
  if (points.length < 3) {
    const [a, b] = points;
    const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.8));
    return Array.from({ length: n + 1 }, (_, i) => [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]);
  }
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i], p1 = points[i], p2 = points[i + 1], p3 = points[i + 2] ?? p2;
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 0.8));
    for (let s = 0; s < n; s++) {
      const t = s / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
        (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

const arc = (cx, cy, r, from, to, steps = 24) =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const a = (from + (to - from) * i / steps) * Math.PI / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });

const polygon = (pts) => "M" + pts.map((p) => `${r1(p[0])} ${r1(p[1])}`).join(" L") + "Z";
const area = (pts) => pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;

// ---------- Tommy Sugo: brush strokes ----------
// A stroke that swells from a pressed start to a lifted tip, with a little wobble, as one filled shape. Every shape
// winds the same way, so overlapping strokes add up instead of cutting holes.
function brush(points, width, { curve = true } = {}) {
  const line = curve ? smooth(points) : points.flatMap((p, i) => (i ? smooth([points[i - 1], p]).slice(1) : [p]));
  const left = [], right = [];
  line.forEach((p, i) => {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
    const t = i / (line.length - 1);
    const w = width / 2 * (0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.08)) ** 0.6) * (0.92 + rand() * 0.16);
    left.push([p[0] + nx * w, p[1] + ny * w]);
    right.push([p[0] - nx * w, p[1] - ny * w]);
  });
  const shape = left.concat(right.reverse());
  return polygon(area(shape) < 0 ? shape.reverse() : shape);
}

const dot = (x, y, r) => polygon(arc(x, y, r, 0, 360, 12).slice(0, -1));

const tommy = {
  menu() {
    seed = 11;
    return [
      brush([[13, 6.5], [24, 6], [35.5, 6.8]], 3.4),
      brush([[35.8, 6], [36.4, 24], [36, 42]], 3.4),
      brush([[37, 41.6], [24, 42.3], [11.6, 41.8]], 3.4),
      brush([[12.2, 42.5], [11.8, 24], [12.6, 7]], 3.4),
      brush([[17, 13], [24, 12.6], [31, 13.2]], 3.6),
      brush([[17, 20.5], [26.5, 20.4]], 2.4), dot(31, 20.5, 1.5),
      brush([[17, 26.5], [25.5, 26.7]], 2.4), dot(31, 26.5, 1.5),
      brush([[17, 32.5], [27, 32.3]], 2.4), dot(31, 32.5, 1.5),
    ];
  },
  delivery() {
    seed = 23;
    return [
      // Wheels, each left a little open like a quick brush circle.
      brush(arc(11.5, 38.5, 4.6, 210, 520, 30), 3),
      brush(arc(36.5, 38.5, 4.6, 200, 510, 30), 3),
      // The body, from the back over the seat and along the footboard, then the fork and handlebar.
      brush([[5, 34], [5.5, 28.5], [9, 25.2], [18, 24.8], [21.5, 27.5], [22.5, 31], [32, 31]], 3.2),
      brush([[32.5, 15.5], [34.5, 27], [36.5, 38]], 3),
      brush([[29.5, 15.8], [33, 14.8], [37.8, 15.8]], 3),
      // The delivery box sitting on the seat, with its lid line.
      brush([[4.5, 11.5], [11, 11], [18, 11.6]], 3),
      brush([[17.8, 11], [18.2, 22.6]], 3),
      brush([[4.8, 11.2], [4.4, 22.8]], 3),
      brush([[4.6, 22.6], [11, 22.9], [18, 22.4]], 2.6),
      brush([[5, 15.5], [17.4, 15.4]], 1.8),
      // Moving fast.
      brush([[0.4, 27], [3, 27.1]], 1.8),
      brush([[0, 31.5], [3, 31.4]], 1.8),
    ];
  },
  shop() {
    seed = 37;
    const scallops = [];
    for (let i = 0; i < 4; i++) scallops.push(...arc(9.5 + i * 9, 18, 4.5, 180, 0, 10).map(([x, y]) => [x, 18 + (y - 18) * -0.75]).slice(i ? 1 : 0));
    return [
      brush([[4.5, 10.5], [24, 9.6], [43.5, 10.4]], 3.4),
      brush(scallops, 3, { curve: false }),
      brush([[5, 10.5], [5, 18.5]], 2.8),
      brush([[14, 10], [14, 18.5]], 2.2),
      brush([[23, 10], [23, 18.5]], 2.2),
      brush([[32, 10], [32, 18.5]], 2.2),
      brush([[43, 10.5], [43, 18.5]], 2.8),
      brush([[8, 22.5], [8.4, 41.5]], 3),
      brush([[40, 22.5], [39.6, 41.5]], 3),
      brush([[4, 42], [24, 41.4], [44, 42]], 3.4),
      // The door, and the window with its sill.
      brush([[27, 41.5], [27.2, 27.5], [35, 27.2], [35.2, 41.5]], 2.8, { curve: false }),
      brush([[12.5, 27], [22.5, 26.8], [22.6, 35.5], [12.4, 35.6], [12.5, 26.6]], 2.6, { curve: false }),
      dot(33, 34.5, 1.1),
    ];
  },
  // The footer's social links. Instagram is the design system's own brush camera (its Icon component's `instagram`),
  // never Instagram's logo; Facebook is a brush "f" in the same open frame.
  instagram() {
    return ["M19.0 7.0 L19.9 7.4 L20.8 7.5 L21.7 7.7 L22.6 7.8 L23.5 7.9 L24.4 8.0 L25.3 8.1 L26.2 8.2 L27.1 8.2 L28.0 8.3 L28.9 8.4 L29.8 8.4 L30.7 8.5 L31.5 8.6 L32.3 8.7 L33.0 8.9 L33.7 9.2 L34.4 9.5 L34.8 10.1 L35.4 10.5 L35.9 11.0 L36.4 11.5 L36.9 12.1 L37.3 12.6 L37.6 13.2 L37.9 13.8 L38.1 14.5 L38.3 15.1 L38.4 15.8 L38.5 16.5 L38.5 17.3 L38.5 18.1 L38.5 19.0 L38.4 19.9 L38.4 20.8 L38.4 21.7 L38.4 22.6 L39.0 23.5 L39.0 24.4 L39.0 25.3 L39.0 26.2 L39.0 27.1 L39.0 28.0 L39.0 28.9 L39.0 29.8 L39.0 30.7 L39.0 31.5 L38.9 32.2 L38.8 32.9 L38.6 33.6 L38.4 34.3 L38.1 35.0 L37.7 35.6 L37.3 36.2 L36.8 36.8 L36.3 37.3 L35.6 37.6 L35.0 38.0 L34.4 38.4 L33.7 38.7 L33.0 39.0 L32.3 39.2 L31.6 39.3 L30.8 39.4 L29.9 39.5 L29.0 39.6 L28.1 39.7 L27.2 39.7 L26.3 39.8 L25.4 39.9 L24.5 40.0 L23.6 40.1 L22.7 40.3 L21.8 40.4 L20.9 40.6 L20.0 41.0 L20.0 41.0 L20.9 41.4 L21.8 41.6 L22.7 41.7 L23.6 41.9 L24.5 42.0 L25.4 42.1 L26.3 42.2 L27.2 42.3 L28.1 42.3 L29.0 42.4 L29.9 42.5 L30.8 42.6 L31.8 42.6 L32.9 42.5 L33.9 42.4 L34.9 42.1 L35.9 41.8 L36.9 41.3 L37.8 40.8 L38.6 40.0 L39.4 39.3 L40.1 38.5 L40.7 37.7 L41.3 36.8 L41.8 35.8 L42.3 34.8 L42.6 33.8 L42.8 32.8 L42.9 31.7 L43.0 30.7 L43.0 29.8 L43.0 28.9 L43.0 28.0 L43.0 27.1 L43.0 26.2 L43.0 25.3 L43.0 24.4 L43.0 23.5 L43.6 22.6 L43.6 21.7 L43.6 20.8 L43.6 19.9 L43.5 19.0 L43.5 18.1 L43.5 17.1 L43.5 16.1 L43.3 15.0 L43.1 13.9 L42.7 12.9 L42.3 11.8 L41.7 10.8 L41.1 9.9 L40.4 9.1 L39.6 8.3 L38.8 7.6 L37.9 7.0 L36.9 6.4 L35.8 6.3 L34.8 5.9 L33.8 5.7 L32.7 5.5 L31.7 5.5 L30.7 5.5 L29.8 5.6 L28.9 5.6 L28.0 5.7 L27.1 5.8 L26.2 5.8 L25.3 5.9 L24.4 6.0 L23.5 6.1 L22.6 6.2 L21.7 6.3 L20.8 6.5 L19.9 6.6 L19.0 7.0ZM14.9 40.7 L14.2 40.0 L13.5 39.5 L12.8 39.0 L12.2 38.5 L11.6 37.9 L11.1 37.3 L10.7 36.7 L10.3 36.0 L9.9 35.3 L9.6 34.7 L9.4 33.9 L9.2 33.2 L9.1 32.5 L9.0 31.8 L9.0 31.0 L9.1 30.2 L9.1 29.3 L9.1 28.4 L9.2 27.5 L9.2 26.6 L9.2 25.7 L9.2 24.8 L9.5 23.9 L9.5 23.0 L9.5 22.1 L9.5 21.2 L9.5 20.3 L9.4 19.4 L9.4 18.5 L9.4 17.6 L9.3 16.8 L9.3 16.1 L9.3 15.4 L9.0 14.5 L9.2 13.8 L9.4 13.1 L9.8 12.4 L10.1 11.7 L10.6 11.0 L11.1 10.4 L11.6 9.8 L12.2 9.2 L12.9 8.7 L13.6 8.1 L13.9 7.5 L13.9 7.4 L13.2 7.3 L12.3 7.5 L11.3 7.8 L10.4 8.2 L9.6 8.7 L8.8 9.4 L8.1 10.1 L7.4 10.9 L6.8 11.7 L6.3 12.6 L5.9 13.6 L5.1 14.5 L4.9 15.6 L4.7 16.6 L4.6 17.6 L4.6 18.5 L4.6 19.4 L4.5 20.3 L4.5 21.2 L4.5 22.1 L4.5 23.0 L4.5 23.9 L4.8 24.8 L4.8 25.7 L4.8 26.6 L4.8 27.5 L4.9 28.4 L4.9 29.3 L4.9 30.2 L5.0 31.2 L5.1 32.2 L5.3 33.3 L5.6 34.3 L6.0 35.3 L6.5 36.2 L7.0 37.1 L7.7 37.9 L8.4 38.7 L9.3 39.3 L10.1 39.9 L11.0 40.4 L11.9 40.7 L12.9 40.9 L13.9 41.0 L14.9 40.8ZM16.7 28.7 L16.7 27.7 L16.6 26.9 L16.6 26.0 L16.6 25.2 L16.7 24.5 L16.9 23.7 L17.2 23.0 L17.5 22.3 L17.8 21.7 L18.2 21.1 L18.7 20.5 L19.2 20.0 L19.4 19.3 L20.0 18.8 L20.7 18.5 L21.3 18.2 L22.0 18.0 L22.7 17.9 L23.5 17.8 L24.2 17.8 L24.9 17.9 L25.6 18.0 L26.2 18.2 L26.9 18.5 L27.5 18.9 L27.7 19.7 L28.2 20.1 L28.7 20.6 L29.1 21.1 L29.4 21.6 L29.7 22.2 L29.9 22.8 L30.1 23.5 L30.2 24.1 L30.3 24.8 L30.3 25.4 L30.2 26.1 L30.0 26.8 L30.0 27.5 L29.7 28.2 L29.3 28.8 L28.9 29.4 L28.4 30.0 L27.9 30.5 L27.3 30.9 L26.6 31.3 L25.9 31.7 L25.1 31.9 L24.3 32.2 L23.5 32.3 L22.7 32.4 L21.8 32.7 L21.8 32.8 L22.5 33.3 L23.4 33.6 L24.4 33.8 L25.4 33.9 L26.4 33.8 L27.4 33.6 L28.4 33.2 L29.4 32.8 L30.3 32.3 L31.1 31.6 L31.9 30.9 L32.6 30.0 L33.2 29.1 L33.9 28.2 L34.3 27.2 L34.6 26.1 L34.7 25.0 L34.7 23.8 L34.6 22.7 L34.4 21.6 L34.1 20.5 L33.6 19.4 L33.0 18.4 L32.3 17.5 L31.6 16.6 L30.7 15.9 L29.4 15.7 L28.5 15.2 L27.5 14.8 L26.4 14.5 L25.3 14.3 L24.2 14.2 L23.2 14.3 L22.1 14.4 L21.0 14.7 L20.0 15.1 L19.1 15.6 L18.2 16.2 L17.4 16.9 L16.3 17.4 L15.7 18.3 L15.2 19.3 L14.7 20.3 L14.4 21.3 L14.2 22.3 L14.2 23.4 L14.3 24.4 L14.4 25.5 L14.8 26.4 L15.2 27.3 L15.8 28.2 L16.6 28.8ZM37.2 13.5 L37.2 13.8 L37.1 14.1 L37.1 14.3 L37.0 14.6 L36.8 14.8 L36.7 15.1 L36.5 15.3 L36.3 15.5 L36.1 15.7 L35.9 15.8 L35.6 16.0 L35.3 16.1 L35.1 16.1 L34.8 16.2 L34.5 16.2 L34.2 16.2 L33.9 16.1 L33.7 16.1 L33.4 16.0 L33.1 15.8 L32.9 15.7 L32.7 15.5 L32.5 15.3 L32.3 15.1 L32.2 14.8 L32.0 14.6 L31.9 14.3 L31.9 14.1 L31.8 13.8 L31.8 13.5 L31.8 13.2 L31.9 12.9 L31.9 12.7 L32.0 12.4 L32.2 12.2 L32.3 11.9 L32.5 11.7 L32.7 11.5 L32.9 11.3 L33.1 11.2 L33.4 11.0 L33.7 10.9 L33.9 10.9 L34.2 10.8 L34.5 10.8 L34.8 10.8 L35.1 10.9 L35.3 10.9 L35.6 11.0 L35.9 11.2 L36.1 11.3 L36.3 11.5 L36.5 11.7 L36.7 11.9 L36.8 12.1 L37.0 12.4 L37.1 12.7 L37.1 12.9 L37.2 13.2 L37.2 13.5Z"];
  },
  facebook() {
    seed = 61;
    return [
      brush([[11, 7], [24, 6.5], [37, 7.2], [41, 11], [41.5, 24], [41, 37], [37.5, 41]], 3.2),
      brush([[36, 41.5], [24, 41.8], [11, 41], [7, 37.5], [6.6, 24], [7.2, 11.5], [10, 7.6]], 3.2),
      brush([[26.5, 41], [26.2, 28], [26.6, 20], [28.5, 15.5], [33.5, 14]], 3.6),
      brush([[20.5, 25.5], [27, 25.2], [33, 25.6]], 3.2),
    ];
  },
  // WhatsApp: a handset in a speech bubble, in brush strokes, never WhatsApp's own logo.
  whatsapp() {
    seed = 71;
    return [
      brush(arc(24.5, 22.5, 17, 128, 462, 46), 3.2),
      brush([[13.5, 35.5], [9.5, 42.5], [18.5, 38.8]], 3, { curve: false }),
      brush([[18.5, 15.5], [16.8, 20], [19.2, 26.2], [24.2, 31], [29.5, 32.6], [32.6, 30.2]], 3.8),
      dot(18.6, 15.2, 2.6),
      dot(32.8, 30.3, 2.6),
    ];
  },
};

function tommySvg(name) {
  const d = tommy[name]().join("");
  // The red line sits behind the ink, a touch down and to the right, like the illustrations' misprint.
  const art = (cls, shift) => `<path class="${cls}" transform="translate(${shift}) ${CIRCLE ? INNER : ""}" d="${d}"/>`;
  seed = 51;
  // A quick brush circle, its ends overlapping a little where the stroke started.
  const ring = CIRCLE ? brush(arc(24, 24, 21.5, -100, 268, 60), 3.2) : "";
  return `<svg class="nav-pic-svg" viewBox="0 0 48 48" width="${SIZE}" height="${SIZE}" aria-hidden="true" focusable="false">` +
    (ring ? `<path class="pic-red" transform="translate(1.6 1.4)" d="${ring}"/>` : "") + art("pic-red", "1.6 1.4") +
    (ring ? `<path class="pic-ink" d="${ring}"/>` : "") + art("pic-ink", "0 0") + `</svg>`;
}

// ---------- Merle's: poster shapes ----------
// Each part is drawn three times: its shadow (solid black, down and right), then the shape in grey with a heavy
// black outline. Details go on top in black or white.
const rect = (x, y, w, h) => `M${x} ${y}h${w}v${h}h${-w}Z`;
const rrect = (x, y, w, h, r) =>
  `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}Z`;
const circle = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;

const merles = {
  menu() {
    return {
      shapes: [rect(11, 5, 25, 36)],
      ink: [rect(15, 10, 17, 4.5), rect(15, 19, 11, 2.5), rect(15, 25, 9, 2.5), rect(15, 31, 12, 2.5),
        circle(30, 20.25, 1.6), circle(30, 26.25, 1.6), circle(30, 32.25, 1.6)],
      white: [],
    };
  },
  delivery() {
    const body = "M5 31C5 26 9 24 14 24L19 24C21 24 22 26 22 29L22 30L30 30L32.5 17L35 17L33 30.5C35 30.5 37 31.5 37.5 33L37.5 34L5 34Z";
    return {
      shapes: [rect(4, 11, 15, 11), body, circle(11.5, 37.5, 5.5), circle(36.5, 37.5, 5.5)],
      ink: [rect(30, 14, 9, 3), circle(11.5, 37.5, 2), circle(36.5, 37.5, 2), rect(6.5, 15, 10, 2.2),
        rect(0.5, 26, 3, 1.8), rect(0, 30, 3.5, 1.8)],
      white: [rect(24, 31, 5, 1.4)],
    };
  },
  shop() {
    let awning = "M4 8L44 8L44 17";
    for (let i = 4; i > 0; i--) awning += `A5 4 0 0 1 ${4 + (i - 1) * 10} 17`;
    awning += "Z";
    return {
      shapes: [rect(7, 17, 34, 25), awning],
      // Every other awning stripe in black, then the door and the window.
      ink: [`M14 8h10v9A5 4 0 0 1 14 17Z`, `M34 8h10v9A5 4 0 0 1 34 17Z`, rect(27, 26, 9, 16), rect(3, 41, 42, 3)],
      white: [rect(11, 25, 12, 10), rect(33, 33, 1.6, 1.6)],
    };
  },
  // The cart and orders icons too, so Merle's header doesn't borrow Tommy Sugo's brush strokes.
  cart() {
    return {
      shapes: ["M10 13L44 13L40 31L14 31Z", circle(17, 40, 4), circle(36, 40, 4)],
      ink: [rect(2, 7, 9, 3.2), "M8 7.5L11.2 7.5L16.6 31L13.4 31Z", rect(14, 32.5, 26, 3),
        rect(20, 16, 2.4, 12), rect(27, 16, 2.4, 12), rect(34, 16, 2.4, 12), circle(17, 40, 1.4), circle(36, 40, 1.4)],
      white: [],
    };
  },
  // The footer's social links, as the same poster shapes: a camera and an "f", never the platforms' own logos.
  instagram() {
    return {
      shapes: [rrect(6, 6, 36, 36, 9), circle(24, 24, 7.5)],
      ink: [circle(24, 24, 3), circle(34.5, 13.5, 2.3)],
      white: [],
    };
  },
  facebook() {
    return {
      shapes: [rrect(6, 6, 36, 36, 9)],
      ink: ["M23 42L23 27L19 27L19 22L23 22L23 18.5C23 13.5 26 11 30.5 11L34 11L34 16L31.5 16C29.5 16 28.5 17 28.5 19L28.5 22L34 22L33.2 27L28.5 27L28.5 42Z"],
      white: [],
    };
  },
  whatsapp() {
    return {
      // The tail first, so the bubble's fill covers where they meet.
      shapes: ["M11 31L6.5 42.5L18.5 37Z", circle(24.5, 22.5, 17.5)],
      ink: ["M15.5 14.5C17.5 13 20 13.5 20.8 15.8L22 19.5C22.4 21 21.7 22.3 20.5 23C22.2 26.6 24.7 29 28.2 30.6C28.9 29.4 30.2 28.7 31.7 29.1L35.4 30.3C37.6 31 38.1 33.6 36.7 35.5L35.6 36.8C34.3 38.4 32 38.9 29.8 38.2C22 35.6 16.6 30.1 14 22.4C13.3 20.2 13.6 16.2 15.5 14.5Z"],
      white: [],
    };
  },
  orders() {
    return {
      shapes: ["M8 17L40 17L42.5 44L5.5 44Z"],
      ink: ["M14.5 18A9.5 9.5 0 0 1 33.5 18L30.3 18A6.3 6.3 0 0 0 17.7 18Z", rect(8.5, 22, 31, 2.6)],
      white: [rect(11, 28, 2.6, 12)],
    };
  },
};

function merlesSvg(name) {
  const { shapes, ink, white } = merles[name]();
  const all = shapes.join("");
  const drawing = `<path class="pic-ink" transform="translate(2.5 2.5)" d="${all}"/>` +
    shapes.map((d) => `<path class="pic-shade" d="${d}"/>`).join("") +
    (ink.length ? `<path class="pic-ink" d="${ink.join("")}"/>` : "") +
    (white.length ? `<path class="pic-paper" d="${white.join("")}"/>` : "");
  // A solid black ring, open in the middle so the page shows through.
  const ring = `<circle class="pic-ring" cx="24" cy="24" r="22"/>`;
  return `<svg class="nav-pic-svg" viewBox="-1 -1 50 50" width="${SIZE}" height="${SIZE}" aria-hidden="true" focusable="false">` +
    (CIRCLE ? ring + `<g transform="${INNER}">${drawing}</g>` : drawing) + `</svg>`;
}

// Merle's burger and close icons for the Menu button (js/site-menu.js swaps them as it opens): single paths, since the
// button colours them in ink. Heavy square-ended bars, like the heavy rules on Merle's printed-menu pages.
function bar(cx, cy, length, width, degrees) {
  const a = degrees * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), l = length / 2, w = width / 2;
  return polygon([[cx - ux * l - uy * w, cy - uy * l + ux * w], [cx + ux * l - uy * w, cy + uy * l + ux * w],
    [cx + ux * l + uy * w, cy + uy * l - ux * w], [cx - ux * l + uy * w, cy - uy * l - ux * w]]);
}
const merlesButton = {
  bars: [12.75, 24, 35.25].map((y) => bar(24, y, 36, 5.5, 0)).join(""),
  cross: bar(24, 24, 40, 6, 45) + bar(24, 24, 40, 6, -45),
};

const names = ["menu", "delivery", "shop"];
const out = {
  tommy: Object.fromEntries([...names, "instagram", "facebook", "whatsapp"].map((n) => [n, tommySvg(n)])),
  merles: Object.fromEntries([...names, "cart", "orders", "instagram", "facebook", "whatsapp"].map((n) => [n, merlesSvg(n)])),
  merlesButton,
};
console.log(JSON.stringify(out, null, 2));
