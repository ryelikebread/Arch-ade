// Dragon Hoard skin: a cave lit by torches, a mountain of gold on the right
// (rubies, emeralds, sapphires, crowns, the Ark, the Holy Grail and the
// Sopranos-ending film reel with its onion rings), and on top a ferocious red
// dragon puffing smoke rings from a gilded hookah. A princess who adores him
// sits at his side. On the left an adventurer holds up the glittering file,
// come to challenge the dragon. Every decision ends with that adventurer's
// demise; their bones join the pile in the corner, the princess cheers, and
// a new adventurer of another class (ranger, wizard, knight, paladin,
// barbarian, rogue, cleric, bard, valkyrie, druid) walks in.
//
// keep   = the dragon plucks up adventurer and file, tosses the adventurer
//          and sets the file back down; or a golden smoke ring turns them to
//          gold; or a mimic chest eats them; or a coin avalanche buries them;
// move   = the princess kisses the adventurer, who drops the file, and she
//          files it on the sorted piles; or the dragon places it there with
//          great care; or a dragon whelp carries it there while the
//          adventurer opens the Ark;
// rename = the dragon fire-brands the new name onto a gold tag, or the
//          princess writes it with her quill on a (cursed) scroll, or the
//          adventurer drinks from the wrong grail while she relabels it;
// trash  = stomped flat, burned to ash, eaten whole, or swatted by the tail;
// delete = devoured for good.
// All art is original and drawn here in code.
import { blank, set } from "./lib.mjs";

const W = 176;
const H = 116;
const FLOOR = 100;

// ---------- pixel grids: drawn as hex colors, turned into frames at the end ----------

const grid = (w, h) => ({ w, h, c: new Array(w * h).fill(null) });
const at = (g, x, y) => (x < 0 || y < 0 || x >= g.w || y >= g.h ? null : g.c[y * g.w + x]);
function put(g, x, y, c) {
  x = Math.round(x);
  y = Math.round(y);
  if (c && x >= 0 && y >= 0 && x < g.w && y < g.h) g.c[y * g.w + x] = c;
}
function rect(g, x, y, w, h, c) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(g, x + i, y + j, typeof c === "function" ? c(x + i, y + j) : c);
}
function ell(g, cx, cy, rx, ry, c) {
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++)
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
      if (d <= 1) put(g, x, y, typeof c === "function" ? c(x, y, d) : c);
    }
}
function poly(g, pts, c) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++)
    for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
      const px = x + 0.5, py = y + 0.5;
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) put(g, x, y, typeof c === "function" ? c(x, y) : c);
    }
}
/** A line from radius r0 to r1 (discs stamped along it). */
function thick(g, x0, y0, x1, y1, r0, r1, c) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
  for (let i = 0; i <= n; i++) {
    const u = i / n, r = r0 + (r1 - r0) * u;
    const cx = x0 + (x1 - x0) * u, cy = y0 + (y1 - y0) * u;
    if (r < 0.75) put(g, cx, cy, c);
    else ell(g, cx, cy, r, r, c);
  }
}
function line(g, x0, y0, x1, y1, c) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let i = 0; i <= n; i++) put(g, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c);
}
const bez = (a, b, c, t) => [(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * b[0] + t * t * c[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * b[1] + t * t * c[1]];
/** A dark rim around everything drawn (4-neighbours). */
function outline(g, c) {
  const out = { ...g, c: g.c.slice() };
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++)
      if (!at(g, x, y) && (at(g, x - 1, y) || at(g, x + 1, y) || at(g, x, y - 1) || at(g, x, y + 1))) out.c[y * g.w + x] = c;
  return out;
}
function stamp(dst, src, dx, dy) {
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) put(dst, dx + x, dy + y, src.c[y * src.w + x]);
  return dst;
}
const copy = (g) => ({ ...g, c: g.c.slice() });
function mapG(g, fn) {
  const out = grid(g.w, g.h);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const c = g.c[y * g.w + x];
    if (c) out.c[y * g.w + x] = fn(c, x, y);
  }
  return out;
}
function flipX(g) {
  const out = grid(g.w, g.h);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) out.c[y * g.w + x] = g.c[y * g.w + (g.w - 1 - x)];
  return out;
}
/** A quarter turn clockwise. */
function rotCW(g) {
  const out = grid(g.h, g.w);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) out.c[x * out.w + (g.h - 1 - y)] = g.c[y * g.w + x];
  return out;
}
/** Nearest-neighbour resize. */
function resize(g, w, h) {
  const out = grid(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out.c[y * w + x] = g.c[Math.floor((y * g.h) / h) * g.w + Math.floor((x * g.w) / w)];
  return out;
}
/** `g` centered on a w x h canvas, sitting on its bottom edge. */
function onCanvas(g, w, h, dy = 0) {
  return stamp(grid(w, h), g, Math.floor((w - g.w) / 2), h - g.h - dy);
}
function toFrame(g) {
  const f = blank(g.w, g.h);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.c[y * g.w + x]) set(f, x, y, g.c[y * g.w + x]);
  return f;
}
function hash(a, b, s = 0) {
  let h = (a * 374761393 + b * 668265263 + s * 1442695041) >>> 0;
  h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) % 1000;
}
function mix(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * Math.max(0, Math.min(1, t))).toString(16).padStart(2, "0")).join("");
}
/** ASCII rows with a palette (. is empty). */
function rows(lines, pal) {
  const w = Math.max(...lines.map((r) => r.length));
  const g = grid(w, lines.length);
  lines.forEach((r, y) => [...r].forEach((ch, x) => put(g, x, y, pal[ch])));
  return g;
}

// ---------- palette ----------

const GOLD = { hi: "#fff4b0", lt: "#f8d860", md: "#e8b030", dk: "#b07818", dp: "#7a4a10" };
const GEM = {
  ruby: ["#ff6a80", "#e02040", "#8a1028"],
  emerald: ["#7af0a0", "#28b860", "#0e6034"],
  sapphire: ["#8ab8ff", "#2e6af0", "#14307a"],
  amethyst: ["#d8a0ff", "#a050e0", "#5a2088"],
};
const INK = "#1a0c14";
const RED = { hi: "#ff7a5a", lt: "#f04a38", md: "#d0282a", dk: "#9a1620", dp: "#5e0a14" };
const BELLY = { lt: "#f8d890", md: "#e8b868", dk: "#b88440" };
const BONE = { lt: "#fff8e8", md: "#e8dcc0", dk: "#a89878" };

// ---------- layout ----------

const DRAGON = [88, 0]; // the dragon's canvas on the stage
const DW = 88, DH = 64;
const HERO = [16, 76]; // the adventurer's sprite (16x24), feet on the floor
const FILE = [16, 60]; // the file, held up over their head
const PRINCESS = [128, 42]; // her sprite (16x24), sitting by the dragon's chest
const HOOKAH = [92, 28]; // the hookah's canvas (hose up to the dragon's mouth)
const PILE = [142, 64]; // the bone pile (34x38), bottom right
const SORTED = [48, 44]; // the sorted piles on a ledge, where moved files go (42x17)
const SORT_SPOTS = [[46, 32], [60, 32], [74, 32]]; // where a moved file lands, one per pile
const ARK = [116, 84];
const GRAIL = [78, 60];
const REEL = [54, 78];
const MIMIC = [34, 88]; // a chest at the adventurer's side (for the mimic)
const CHEEK = [DRAGON[0] + 26, DRAGON[1] + 28];
const MOUTH = [DRAGON[0] + 4, DRAGON[1] + 31];

// ---------- the cave and the hoard (one backdrop) ----------

/** Top of the gold at column x. */
function moundTop(x) {
  const base = x >= 112 ? 60 : 60 + 0.0526 * (112 - x) ** 1.6;
  return Math.min(FLOOR + 1, Math.round(base + Math.sin(x * 0.6) * 1.2 + Math.sin(x * 0.23) * 1.5));
}

function cave(g) {
  const ROCK = ["#2a1e34", "#33253f", "#3c2c4a", "#463656"];
  for (let y = 0; y < FLOOR; y++)
    for (let x = 0; x < W; x++) {
      const cell = hash(Math.floor((x + (Math.floor(y / 5) % 2) * 3) / 6), Math.floor(y / 5), 1);
      let k = cell % 3;
      if ((y % 5 === 0 && hash(x >> 1, y, 2) < 600) || (x + Math.floor(y / 5) * 3) % 6 === 0) k = 0; // cracks
      let c = ROCK[k + (cell > 900 ? 1 : 0)];
      c = mix(c, "#120a18", Math.max(0, 0.55 - y / 120)); // darker toward the ceiling
      // Warm light off the gold, and the torches' glow.
      const glow = Math.max(0, 1 - Math.hypot((x - 130) / 70, (y - 70) / 50)) * 0.45;
      const torch = Math.max(...TORCHES.map(([tx, ty]) => Math.max(0, 1 - Math.hypot(x - tx - 2, y - ty) / 22) * 0.5));
      c = mix(c, "#a0603a", glow + torch * 0.6);
      put(g, x, y, c);
    }
  // Stalactites.
  for (const [x, len, w] of [[4, 10, 5], [18, 6, 3], [30, 14, 5], [52, 8, 4], [70, 12, 5], [84, 5, 3], [150, 9, 4], [166, 13, 5]]) {
    poly(g, [[x, 0], [x + w, 0], [x + w / 2, len]], (px, py) => (px < x + w / 2 ? "#4e3e60" : "#2e2240"));
    put(g, x + Math.floor(w / 2), len, "#6e5a84");
  }
  // Torch sconces.
  for (const [tx, ty] of TORCHES) {
    rect(g, tx, ty + 6, 5, 2, "#5a4a40");
    rect(g, tx + 1, ty + 8, 3, 4, "#3a2e28");
    put(g, tx + 2, ty + 12, "#3a2e28");
  }
  // Flagstone floor.
  for (let y = FLOOR; y < H; y++)
    for (let x = 0; x < W; x++) {
      const row = Math.floor((y - FLOOR) / 5);
      const mortar = (y - FLOOR) % 5 === 4 || (x + row * 7) % 14 === 0;
      let c = mortar ? "#1c1220" : hash(Math.floor((x + row * 7) / 14), row, 3) % 2 ? "#3e2e40" : "#46344a";
      if (y === FLOOR) c = "#5a4458";
      c = mix(c, "#7a4a34", Math.max(0, 1 - Math.abs(x - 120) / 70) * 0.35);
      put(g, x, y, c);
    }
}
const TORCHES = [[8, 30], [40, 22]];

function coins(g) {
  // The gold itself: rows of overlapping coins, lit from the top.
  for (let x = 0; x < W; x++) {
    const top = moundTop(x);
    for (let y = top; y <= FLOOR + 1; y++) {
      const d = y - top;
      let c = d < 2 ? GOLD.lt : GOLD.md;
      if (d > 26) c = GOLD.dk;
      put(g, x, y, c);
    }
  }
  for (let y = 40; y <= FLOOR + 2; y += 2)
    for (let x = (y / 2) % 2 ? 0 : 2; x < W; x += 4) {
      const jx = x + (hash(x, y, 4) % 3) - 1;
      const top = moundTop(jx);
      if (y < top || y > FLOOR + 1) continue;
      const deep = y - top > 26;
      put(g, jx, y, deep ? GOLD.md : GOLD.hi);
      put(g, jx + 1, y, deep ? GOLD.dk : GOLD.lt);
      put(g, jx + 2, y, deep ? GOLD.dp : GOLD.md);
      put(g, jx + 1, y + 1, deep ? GOLD.dp : GOLD.dk);
    }
  // Stray coins on the floor.
  for (let i = 0; i < 26; i++) {
    const x = 44 + (hash(i, 9, 5) % 120), y = FLOOR + 1 + (hash(i, 7, 5) % 12);
    if (x < moundEdge()) continue;
    put(g, x, y, GOLD.lt);
    put(g, x + 1, y, GOLD.dk);
  }
}
const moundEdge = () => {
  for (let x = 0; x < W; x++) if (moundTop(x) <= FLOOR) return x;
  return W;
};

function gem(g, x, y, kind, big = false) {
  const [l, m, d] = GEM[kind];
  if (big) {
    rows(["..o..", ".olm.", "olmmd", ".mdd.", "..d.."], { o: "#ffffff", l, m, d }).c.forEach((c, i) => c && put(g, x + (i % 5), y + Math.floor(i / 5), c));
    put(g, x + 2, y, INK);
  } else {
    put(g, x + 1, y, l);
    put(g, x, y + 1, l);
    put(g, x + 1, y + 1, m);
    put(g, x + 2, y + 1, d);
    put(g, x + 1, y + 2, d);
  }
}

function crown(g, x, y) {
  const p = { o: INK, y: GOLD.lt, Y: GOLD.dk, r: GEM.ruby[1], b: GEM.sapphire[1], w: GOLD.hi };
  stamp(g, rows(["o.o.o.o", "ywywywy", "yyyyyyy", "yrybyry", "YYYYYYY"], p), x, y);
}
function goblet(g, x, y) {
  stamp(g, rows([".www.", "yyyyy", "yGyGy", ".yyy.", "..y..", "..y..", ".YYY."], { w: GOLD.hi, y: GOLD.lt, Y: GOLD.dk, G: GEM.emerald[1] }), x, y);
}
function sword(g, x, y, len = 12) {
  for (let i = 0; i < len; i++) put(g, x, y + i, i === 0 ? "#ffffff" : "#c8d0e0");
  rect(g, x - 2, y + len, 5, 1, GOLD.md);
  rect(g, x, y + len + 1, 1, 3, "#6a3a20");
  put(g, x, y + len + 4, GOLD.lt);
}
function shieldProp(g, x, y, c1, c2) {
  ell(g, x + 4, y + 5, 4.5, 5.5, (px, py) => ((px + py) % 2 ? c1 : c1));
  rect(g, x + 3, y + 1, 3, 9, c2);
  rect(g, x, y + 4, 9, 2, c2);
}

function ark(g, x, y) {
  // The Ark: a gold chest on carrying poles, two winged figures on the lid.
  const o = INK, Y = GOLD.lt, M = GOLD.md, D = GOLD.dk, h = GOLD.hi, w = "#8a5a2a";
  const art = rows([
    "...h.............h....",
    "..hYh...........hYh...",
    "..YMYh.........hYMY...",
    "...YMYY.......YYMY....",
    "....DMYYY...YYYMD.....",
    "....oYMDYYYYYDMYo.....",
    "...hYYYYYYYYYYYYYh....",
    "...YMMMMMMMMMMMMMY....",
    "wwwYMhMMhMMMhMMhMYwwww",
    "wwwYMMMMMMMMMMMMMYwwww",
    "...YMDDDDDDDDDDDDY....",
    "...YMDhDDDhDDDhDDY....",
    "...YMDDDDDDDDDDDDY....",
    "...DDDDDDDDDDDDDDD....",
    "...o.o.........o.o....",
  ], { o, Y, M, D, h, w });
  stamp(g, outline(art, o), x - 1, y - 1);
}
function grail(g, x, y) {
  const art = rows([
    ".hYYYh.",
    "YMMMMMY",
    "YMRMRMY",
    ".YMMMY.",
    "..YMY..",
    "...M...",
    "...M...",
    "..YMY..",
    ".DDDDD.",
  ], { h: GOLD.hi, Y: GOLD.lt, M: GOLD.md, D: GOLD.dk, R: GEM.ruby[1] });
  stamp(g, outline(art, INK), x - 1, y - 1);
}
function reel(g, x, y) {
  // A film reel with its strip unspooled; the last frames are cut to black.
  const r = grid(18, 18);
  ell(r, 9, 9, 8.5, 8.5, (px, py, d) => (d > 0.8 ? "#b8bcc8" : "#7a7e90"));
  for (const [hx, hy] of [[9, 4], [5, 11], [13, 11]]) ell(r, hx, hy, 2, 2, "#2a2230");
  ell(r, 9, 9, 1.5, 1.5, "#e8ecf4");
  stamp(g, outline(r, INK), x - 1, y - 1);
  // The strip runs down to the floor; frames show a little scene, then black.
  const strip = [[x + 14, y + 12], [x + 18, y + 25], [x + 36, y + 23]];
  for (let i = 0; i < 14; i++) {
    const [px, py] = bez(strip[0], strip[1], strip[2], i / 13);
    const black = i >= 9;
    rect(g, px, py, 4, 3, black ? "#000000" : i % 3 === 0 ? "#5a3a2a" : "#e8c8a0");
    put(g, px - 1, py, "#3a3040");
    put(g, px + 4, py, "#3a3040");
  }
  // A basket of onion rings beside it.
  const ox = x + 2, oy = y + 18;
  rect(g, ox, oy + 3, 9, 4, "#a06a30");
  rect(g, ox, oy + 3, 9, 1, "#c8904a");
  for (const [rx, ry] of [[ox + 1, oy], [ox + 4, oy - 1], [ox + 6, oy + 1]]) {
    ell(g, rx + 1.5, ry + 1.5, 2, 1.6, "#e0a050");
    put(g, rx + 1, ry + 1, "#a06a30");
  }
}
function idol(g, x, y) {
  stamp(g, outline(rows([".YYY.", "YeYeY", "YYMYY", ".YMY.", "YMMMY", "YMMMY", ".DDD."], { Y: GOLD.lt, M: GOLD.md, D: GOLD.dk, e: GEM.emerald[1] }), INK), x - 1, y - 1);
}
function lamp(g, x, y) {
  stamp(g, outline(rows(["....YY...", "...YMMY..", "MYYMMMMYY", ".DMMMMMD.", "..DDDDD..", "...DDD..."], { Y: GOLD.lt, M: GOLD.md, D: GOLD.dk }), INK), x - 1, y - 1);
}
function sortedPiles(g, x, y) {
  // Three neat stacks of files with little banner flags on a stone ledge: the sorted section.
  rect(g, x - 3, y + 12, 48, 3, "#6a5a70");
  rect(g, x - 3, y + 12, 48, 1, "#8a7a90");
  rect(g, x - 1, y + 15, 44, 1, "#1c1220");
  for (const bx of [x, x + 38]) rect(g, bx, y + 15, 4, 3, "#4a3a52");
  const colors = [GEM.ruby[1], GEM.emerald[1], GEM.sapphire[1]];
  colors.forEach((c, i) => {
    const px = x + i * 14, py = y + 4;
    for (let k = 0; k < 4; k++) rect(g, px + (k % 2), py + 9 - k * 2, 11, 2, k % 2 ? "#e8e4dc" : "#c8c0b0");
    rect(g, px, py + 11, 12, 1, "#5a4a40");
    line(g, px + 11, py - 3, px + 11, py + 10, "#6a4a30");
    rect(g, px + 7, py - 3, 4, 3, c);
  });
}

function hoard() {
  const g = grid(W, H);
  cave(g);
  coins(g);
  // Treasures in and on the gold.
  sword(g, 168, 44, 14);
  shieldProp(g, 156, 50, GEM.sapphire[1], GOLD.lt);
  crown(g, 112, 66);
  goblet(g, 150, 58);
  lamp(g, 92, 90);
  idol(g, 140, 72);
  sword(g, 84, 70, 10);
  sword(g, 72, 82, 9);
  reel(g, REEL[0], REEL[1]);
  grail(g, GRAIL[0], GRAIL[1]);
  ark(g, ARK[0], ARK[1]);
  const kinds = Object.keys(GEM);
  for (let i = 0; i < 70; i++) {
    const x = 50 + (hash(i, 1, 6) % 124), y = moundTop(x) + 2 + (hash(i, 2, 6) % 36);
    if (y >= FLOOR) continue;
    gem(g, x, y, kinds[i % 4], i % 9 === 0);
  }
  sortedPiles(g, SORTED[0], SORTED[1]);
  return g;
}

/** Glints on the gems: a few stars that come and go. */
function twinkles(i) {
  const g = grid(W - 50, 50);
  for (let k = 0; k < 9; k++) {
    if ((k + i) % 3 !== 0) continue;
    const x = (hash(k, 3, 7) % (g.w - 4)) + 2, y = (hash(k, 4, 7) % 30) + 10;
    const top = moundTop(x + 50) - 50;
    const yy = Math.max(y, top + 4);
    put(g, x, yy, "#ffffff");
    if ((k + i) % 2) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(g, x + dx, yy + dy, "#fff4b0c0");
  }
  return g;
}

function torchFlame(i) {
  const g = grid(5, 8);
  const h = [7, 8, 6][i];
  for (let y = 8 - h; y < 8; y++) {
    const u = (y - (8 - h)) / h;
    const half = u < 0.3 ? 0 : u < 0.6 ? 1 : 2;
    const sway = i === 1 && y < 4 ? 1 : i === 2 && y < 4 ? -1 : 0;
    for (let x = 2 - half; x <= 2 + half; x++) put(g, x + sway, y, Math.abs(x - 2) < half ? "#fff0a0" : u < 0.4 ? "#ff8a2a" : "#f0c040");
  }
  return g;
}

// ---------- the dragon ----------

/**
 * The dragon, facing left. Options: breath (0/1, chest rises), blink, jaw
 * (0 closed, 1..5 open), up (head raised to roar), smile, claw (front leg
 * reaching forward), hose (hookah hose in the mouth corner), wings (0 folded
 * up, 1 spread wide).
 */
function dragon({ breath = 0, blink = false, jaw = 0, up = false, smile = false, claw = false, wings = 0, hose = true, blush = false } = {}) {
  // Parts are drawn as codes first, then shaded and outlined.
  const g = grid(DW, DH);
  const R = "R", B = "B", Hn = "H", Wm = "W", Wb = "w", C = "C";
  const hy = up ? -6 : 0;
  const hx = up ? 3 : 0;
  // Wings, behind everything.
  if (wings) {
    poly(g, [[46, 30], [30, 4], [44, 10], [52, -2], [62, 8], [76, 0], [80, 14], [88, 18], [70, 30], [60, 32]], Wm);
  } else {
    poly(g, [[46, 30 - breath], [40, 6 - breath], [50, 10 - breath], [58, 0 - breath], [66, 8 - breath], [78, 4 - breath], [82, 18 - breath], [72, 30], [60, 34]], Wm);
  }
  const tips = wings ? [[30, 4], [52, -2], [76, 0], [88, 18]] : [[40, 6 - breath], [58, 0 - breath], [78, 4 - breath], [82, 18 - breath]];
  for (const [tx, ty] of tips) thick(g, 54, 26, tx, ty, 1.2, 0.5, Wb);
  // Tail curling down over the gold, ending in a spade.
  const tail = [[70, 50], [92, 50], [80, 62]];
  for (let i = 0; i <= 20; i++) {
    const [x, y] = bez(tail[0], tail[1], tail[2], i / 20);
    ell(g, x, y, 5 - i * 0.2, 5 - i * 0.2, R);
  }
  poly(g, [[80, 58], [86, 63], [78, 63], [74, 60]], R);
  // Back leg.
  ell(g, 64, 50, 11, 10, R);
  rect(g, 54, 58, 14, 4, R);
  // Body.
  ell(g, 52, 44 - breath, 24, 15 + breath, (x, y) => (y > 47 - breath && x < 56 ? B : R));
  // Neck: a thick curve up to the head, belly plates on its front.
  const neck = [[42, 40], [30, 36], [24 + hx, 26 + hy]];
  for (let i = 0; i <= 24; i++) {
    const [x, y] = bez(neck[0], neck[1], neck[2], i / 24);
    const r = 8 - i * 0.12;
    ell(g, x, y, r, r, (px, py) => ((px - x) * 0.7 + (py - y) > r * 0.45 ? B : R));
  }
  // Head.
  const ox = hx, oy = hy - breath;
  ell(g, 20 + ox, 24 + oy, 9, 7, R);
  // Upper snout, and the jaw dropping open by `jaw`.
  poly(g, [[3 + ox, 24 + oy], [14 + ox, 19 + oy], [20 + ox, 22 + oy], [16 + ox, 30 + oy], [3 + ox, 30 + oy]], R);
  poly(g, [[4 + ox, 31 + oy + jaw], [16 + ox, 30 + oy], [24 + ox, 30 + oy], [22 + ox, 34 + oy + jaw * 0.5], [8 + ox, 35 + oy + jaw]], B);
  if (jaw) {
    poly(g, [[5 + ox, 30 + oy], [17 + ox, 30 + oy], [16 + ox, 31 + oy + jaw * 0.6], [6 + ox, 31 + oy + jaw]], "M");
    for (let tx = 6; tx < 16; tx += 3) put(g, tx + ox, 30 + oy, "T"), put(g, tx + 1 + ox, 31 + oy + jaw - 1, "T");
  } else if (smile) {
    line(g, 6 + ox, 30 + oy, 14 + ox, 29 + oy, "m");
    put(g, 15 + ox, 28 + oy, "m");
  } else line(g, 5 + ox, 30 + oy, 15 + ox, 30 + oy, "m");
  // Horns sweeping back, and frills down the neck.
  thick(g, 22 + ox, 18 + oy, 36 + ox, 8 + oy, 2.2, 0.6, Hn);
  thick(g, 18 + ox, 18 + oy, 28 + ox, 6 + oy, 1.8, 0.5, Hn);
  for (let i = 0; i < 6; i++) {
    const [x, y] = bez(neck[0], neck[1], neck[2], 1 - i / 6);
    poly(g, [[x + 2, y - 7], [x + 7, y - 9 - (i % 2)], [x + 5, y - 4]], "S");
  }
  for (let i = 0; i < 6; i++) poly(g, [[44 + i * 6, 30 - breath + Math.abs(i - 2)], [47 + i * 6, 25 - breath + Math.abs(i - 2)], [50 + i * 6, 31 - breath + Math.abs(i - 2)]], "S");
  // Front leg: planted, or reaching forward with claws out.
  if (claw) {
    thick(g, 36, 46, 18, 50, 5, 4, R);
    for (const [cx, cy] of [[12, 47], [11, 51], [13, 54]]) thick(g, 16, 50, cx, cy, 1.4, 0.5, C);
  } else {
    thick(g, 34, 44, 32, 58, 5, 4.5, R);
    for (const cx of [27, 31, 35]) thick(g, cx + 1, 60, cx - 1, 63, 1.2, 0.5, C);
  }
  // Eye, nostril, brow.
  const ex = 19 + ox, ey = 21 + oy;
  if (blink) line(g, ex - 1, ey + 1, ex + 2, ey + 1, "k");
  else {
    rect(g, ex - 1, ey, 4, 3, "E");
    put(g, ex + 1, ey, "k");
    put(g, ex + 1, ey + 1, "k");
    put(g, ex + 1, ey + 2, "k");
  }
  line(g, ex - 2, ey - 1, ex + 3, ey - 2, "k");
  put(g, 5 + ox, 24 + oy, "k");
  put(g, 6 + ox, 25 + oy, "k");
  if (blush) for (const [bx, by] of [[22, 27], [24, 27], [23, 28]]) put(g, bx + ox, by + oy, "P");
  if (hose && !jaw && !up) {
    // The hookah's mouthpiece in the corner of the mouth.
    rect(g, 2, 29, 3, 2, "G");
  }

  // Shade: scales on the red, plates on the belly, bone on horns and claws.
  const shaded = mapG(g, (c, x, y) => {
    const above = at(g, x, y - 1), left = at(g, x - 1, y);
    switch (c) {
      case R: {
        if (!above || !left) return RED.hi;
        const s = (x + (Math.floor(y / 2) % 2) * 2) % 4 === 0 && y % 2 === 0;
        if (s) return RED.dk;
        return y > 48 ? RED.md : (x + y) % 7 === 0 ? RED.lt : RED.md;
      }
      case B: return y % 3 === 0 ? BELLY.dk : x % 5 === 0 ? BELLY.lt : BELLY.md;
      case Wm: return (x + y * 2) % 9 === 0 ? "#c03040" : y > 22 ? "#8a1828" : "#a82434";
      case Wb: return RED.dp;
      case Hn: case C: return !above ? BONE.lt : BONE.md;
      case "S": return "#f0e0b0";
      case "E": return "#ffe040";
      case "k": return INK;
      case "M": return "#5a0a18";
      case "T": return "#ffffff";
      case "m": return RED.dp;
      case "P": return "#ff8ab0";
      case "G": return GOLD.lt;
      default: return c;
    }
  });
  return outline(shaded, "#3a0610");
}

/** Fire breathed straight up (the idle roar); frames flicker. */
function fireUp(i) {
  const g = grid(22, 30);
  for (let k = 0; k < 40; k++) {
    const u = k / 39;
    const x = 15 - u * 8 + Math.sin(u * 9 + i * 2) * 1.5, y = 29 - u * 29;
    const r = 1.5 + u * 4.5 + ((k + i) % 3 === 0 ? 1 : 0);
    ell(g, x, y, r, r, (px, py) => {
      const d = Math.hypot(px + 0.5 - x, py + 0.5 - y) / r;
      if (u > 0.85 && hash(px, py, i) % 3 === 0) return null;
      return d < 0.4 ? "#fff8c0" : d < 0.75 ? "#ffb030" : "#e8402a";
    });
  }
  return g;
}

/** A stream of fire from the dragon's mouth down to the adventurer. */
function fireStream(i, len = 70, drop = 56) {
  const g = grid(len + 14, drop + 18);
  for (let k = 0; k <= 60; k++) {
    const u = k / 60;
    const x = len + 6 - u * len, y = 6 + u * drop + Math.sin(u * 12 + i * 2.1) * 1.5;
    const r = 1.5 + u * 6 + ((k + i) % 4 === 0 ? 1 : 0);
    ell(g, x, y, r, r, (px, py) => {
      const d = Math.hypot(px + 0.5 - x, py + 0.5 - y) / r;
      if (d > 0.8 && hash(px, py, i + 3) % 3 === 0) return null;
      return d < 0.35 ? "#fffbe0" : d < 0.6 ? "#ffd040" : d < 0.85 ? "#ff8a2a" : "#d83020";
    });
  }
  return g;
}

/** A fine, precise jet of fire (for branding a name). */
function fireJet(i) {
  const g = grid(46, 8);
  for (let x = 0; x < 46; x++) {
    const w = 1 + (x > 30 ? 1 : 0) + ((x + i) % 5 === 0 ? 1 : 0);
    for (let y = 4 - w; y <= 4 + w - 1; y++) put(g, x, y + (x % 7 === i % 7 ? 1 : 0), Math.abs(y - 3.5) < 1 ? "#fff8c0" : "#ff9a2a");
  }
  return g;
}

/** Smoke rings rising from the dragon's mouth: 16 frames, empty for the second half. */
function smokeRings(i) {
  const g = grid(24, 36);
  if (i >= 8) return g;
  for (const start of [0, 4]) {
    const k = i - start;
    if (k < 0 || k > 5) continue;
    const r = 2.5 + k * 0.9;
    const cx = 16 - k * 1.6, cy = 31 - k * 5;
    const alpha = ["ff", "f0", "e0", "b0", "80", "50"][k];
    ell(g, cx, cy, r + 1, r * 0.6 + 1, (px, py) => {
      const d = ((px + 0.5 - cx) / (r + 1)) ** 2 + ((py + 0.5 - cy) / (r * 0.6 + 1)) ** 2;
      return d > 0.3 ? `${py < cy ? "#f0eaf8" : "#b8b0c8"}${alpha}` : null;
    });
  }
  return g;
}

/** One big smoke ring (keep: the golden ring). */
function bigRing(i, color = "#e8e0f0") {
  const g = grid(22, 12);
  const r = 7 + i;
  ell(g, 11, 6, Math.min(10.5, r), 4.5 + i * 0.3, (px, py, d) => (d > 0.4 ? (py < 5 ? color : mix(color, "#7a6a8a", 0.4)) : null));
  return g;
}

function puff(i, color = "#c8c0d0") {
  const g = grid(14, 12);
  const r = [3, 4, 5, 5][i];
  for (const [dx, dy] of [[0, 0], [3, -2], [-3, -1], [1, 2]]) ell(g, 7 + dx, 6 + dy, r * 0.6, r * 0.6, i === 3 ? `${color}80` : color);
  return g;
}

function hookah(drop = false, bubble = 0) {
  // A gilded hookah on the gold, its hose up to the dragon's mouth.
  const g = grid(22, 58);
  const base = 40;
  const p = { y: GOLD.lt, Y: GOLD.md, D: GOLD.dk, h: GOLD.hi, g: "#8a3ac8", G: "#5a1a8a", w: "#c8a0f0", r: GEM.ruby[1] };
  const vase = rows([
    "....hyh....",
    "...yYrYy...",
    "....yYy....",
    ".....Y.....",
    "....yYy....",
    "...hyYYy...",
    ".....Y.....",
    ".....Y.....",
    "....yYy....",
    "...gwggg...",
    "..gwgggGg..",
    ".gwggggGGg.",
    ".gggggGGGg.",
    ".ggggGGGGg.",
    "..gGGGGGg..",
    "...yYYYy...",
    "..hyYYYYy..",
    "..DDDDDDD..",
  ], p);
  if (bubble) {
    put(vase, 4 + (bubble % 2), 12 - bubble, "#e8d8ff");
    put(vase, 6, 13 - (bubble % 3), "#e8d8ff");
  }
  stamp(g, outline(vase, INK), 8, base);
  // The hose.
  const from = [17, base + 10];
  if (drop) {
    for (let i = 0; i <= 30; i++) {
      const [x, y] = bez(from, [26, base + 22], [12, base + 16], i / 30);
      put(g, x, y, i % 4 === 0 ? GOLD.lt : "#6a2a8a");
    }
  } else {
    for (let i = 0; i <= 60; i++) {
      const [x, y] = bez(from, [26, base - 10], [1, 2], i / 60);
      put(g, x, y, i % 6 === 0 ? GOLD.lt : "#6a2a8a");
      put(g, x + 1, y, i % 6 === 0 ? GOLD.dk : "#4a1a6a");
    }
  }
  return g;
}

// ---------- the princess ----------

const PR = { s: "#f6d0b0", S: "#d8a888", h: "#f2c040", H: "#c88a20", d: "#e05a9a", D: "#a83070", l: "#ffb0d0", c: GOLD.lt, e: INK, m: "#c02050", k: "#ff8ab0", w: "#ffffff" };
/** The princess, facing left, sitting (16x24). */
function princess({ pose = "sit", blink = false, frame = 0 } = {}) {
  const g = grid(16, 24);
  const P = (x, y, k) => put(g, x, y, PR[k]);
  const R = (x, y, w, h, k) => rect(g, x, y, w, h, PR[k]);
  const lean = pose === "kiss" ? -1 : 0;
  // Hair down her back.
  R(8 + lean, 3, 5, 12, "h");
  R(11 + lean, 6, 2, 9, "H");
  // Head.
  R(5 + lean, 3, 6, 6, "s");
  R(5 + lean, 2, 7, 2, "h");
  R(10 + lean, 3, 2, 4, "h");
  // Crown.
  P(6 + lean, 0, "c"), P(8 + lean, 0, "c"), P(10 + lean, 0, "c");
  R(6 + lean, 1, 5, 1, "c");
  P(8 + lean, 1, "m");
  // Face.
  if (blink || pose === "swoon" || pose === "kiss") R(6 + lean, 5, 2, 1, "e");
  else P(6 + lean, 5, "e"), P(6 + lean, 4, "w");
  P(7 + lean, 7, pose === "kiss" || pose === "blow" ? "m" : "S");
  if (pose === "kiss" || pose === "blow") P(5 + lean, 7, "m");
  P(8 + lean, 6, "k");
  // Dress.
  const sit = pose !== "walk" && pose !== "carry";
  R(6, 9, 5, 6, "d");
  R(7, 9, 3, 1, "l");
  if (sit) {
    // Skirt spread over the gold.
    R(3, 15, 11, 6, "d");
    R(2, 18, 13, 3, "d");
    R(3, 20, 11, 1, "D");
    R(2, 21, 14, 2, "D");
    P(1, 21, "D");
    for (let x = 3; x < 14; x += 3) P(x, 19, "l");
  } else {
    R(5, 15, 7, 7, "d");
    R(4, 19, 9, 3, "d");
    R(4, 21, 9, 1, "D");
    for (let x = 5; x < 12; x += 3) P(x, 18, "l");
    // Little feet stepping.
    P(frame ? 5 : 7, 22, "D"), P(frame ? 9 : 11, 22, "D");
    P(frame ? 5 : 7, 23, "e"), P(frame ? 9 : 11, 23, "e");
  }
  // Arms.
  const A = (pts) => pts.forEach(([x, y]) => P(x, y, "s"));
  switch (pose) {
    case "clap":
      A([[5, 10], [4, 10], [3, 10]]);
      if (frame) R(1, 8, 2, 3, "s");
      else R(0, 8, 1, 3, "s"), R(3, 7, 1, 3, "s");
      break;
    case "cheer":
      A([[5, 10], [4, 9], [3, 8], [3, 7], [2, 6 - frame], [2, 5 - frame], [11, 10], [12, 9], [13, 8], [13, 7], [14, 6 - frame], [14, 5 - frame]]);
      break;
    case "blow":
      A([[5, 10], [4, 9], [4, 8], [5, 7]]);
      break;
    case "swoon":
      A([[5, 10], [5, 11], [6, 12], [7, 12]]);
      break;
    case "kiss":
      A([[5, 11], [4, 12], [3, 12]]);
      break;
    case "carry":
      A([[5, 10], [4, 9], [4, 8], [4, 7], [10, 10], [11, 9], [11, 8], [11, 7]]);
      break;
    default:
      A([[5, 11], [5, 12], [6, 13], [7, 13]]);
  }
  return outline(g, "#4a1030");
}

function heart(color = "#ff4a7a", hi = "#ffb0c8") {
  return rows([".hh.hh.", "hcccccc", "ccccccc", ".ccccc.", "..ccc..", "...c..."].map((r) => r.padEnd(7, ".")), { h: hi, c: color });
}
function hearts(i) {
  // Three hearts floating up and fading.
  const g = grid(20, 22);
  [[2, 14], [10, 10], [5, 4]].forEach(([x, y], k) => {
    const yy = y - i * 2 + k;
    if (yy < -6) return;
    stamp(g, k === 1 ? heart() : resize(heart("#ff6a9a"), 5, 4), x, yy);
  });
  return g;
}

// ---------- adventurers ----------

const SKIN = ["#f6d0b0", "#e0a878", "#b87a50", "#8a5634", "#f0c098", "#6a3e24", "#d89c70", "#a86a44", "#f8dcc0", "#c88a60"];
/**
 * Ten classes; each walks in with its own gear. Gender, armor, emblem,
 * weapon, shield and potion vary so no two look alike.
 */
const CLASSES = [
  { id: "knight", f: false, skin: 0, hair: "#6a3a1a", style: "short", head: "helm", plume: "#e02030", body: "plate", a: "#b8c0d0", A: "#7a8294", t: GOLD.md, legs: "#7a8294", boots: "#4a4e5a", weapon: "sword", shield: { c: "#2e5ad0", e: "cross", ec: GOLD.lt }, potion: "#e02040", accessory: "helm" },
  { id: "ranger", f: true, skin: 4, hair: "#c8401a", style: "long", head: "hood", hood: "#3a7a3a", body: "leather", a: "#4a8a3a", A: "#2a5a24", t: "#8a5a2a", legs: "#5a3a20", boots: "#3a2414", weapon: "bow", shield: null, emblem: "leaf", ec: "#c8e070", potion: "#30d070", accessory: "hood" },
  { id: "wizard", f: false, skin: 8, hair: "#e8e8f0", style: "beard", head: "wizard", hat: "#3040b0", body: "robe", a: "#3a4ac0", A: "#232c80", t: "#f2d040", legs: "#232c80", boots: "#3a2a20", weapon: "staff", orb: "#60e0ff", shield: null, emblem: "star", ec: "#f2d040", potion: "#4a8aff", accessory: "wizard" },
  { id: "paladin", f: true, skin: 2, hair: "#f2d070", style: "braid", head: "circlet", body: "plate", a: "#f0f0f4", A: "#b8b8c8", t: GOLD.md, legs: "#b8b8c8", boots: "#8a6a3a", weapon: "hammer", shield: { c: "#f8f8ff", e: "sun", ec: GOLD.md, round: true }, potion: "#ffd040", accessory: "circlet" },
  { id: "barbarian", f: false, skin: 3, hair: "#2a1a10", style: "beard", head: "horned", body: "fur", a: "#9a6a3a", A: "#6a4422", t: "#d8c8a0", legs: "#6a4422", boots: "#4a3020", weapon: "axe", shield: null, emblem: null, potion: "#ff8a20", accessory: "horned" },
  { id: "rogue", f: true, skin: 6, hair: "#1a1a24", style: "bob", head: "mask", mask: "#4a2a6a", body: "leather", a: "#3a2a4a", A: "#22182c", t: "#8a6ab0", legs: "#22182c", boots: "#141018", weapon: "daggers", shield: null, emblem: "moon", ec: "#c8b8e8", potion: "#b050f0", accessory: "mask" },
  { id: "cleric", f: false, skin: 5, hair: "#1a1010", style: "bald", head: "none", body: "robe", a: "#f0ece0", A: "#c8c0a8", t: "#30a8a0", legs: "#c8c0a8", boots: "#6a4a2a", weapon: "mace", shield: { c: "#30a8a0", e: "heart", ec: "#ffffff" }, potion: "#ff70b0", accessory: "mace" },
  { id: "bard", f: true, skin: 9, hair: "#8a3a1a", style: "long", head: "cap", hat: "#c02a2a", feather: "#f2d040", body: "doublet", a: "#d03a3a", A: "#8a1a24", t: "#f2c040", legs: "#f2c040", boots: "#5a2a1a", weapon: "lute", shield: null, emblem: null, potion: "#30d0c0", accessory: "cap" },
  { id: "valkyrie", f: true, skin: 1, hair: "#f8e8a0", style: "braid", head: "winged", body: "plate", a: "#c88a3a", A: "#8a5a20", t: "#f0e0b0", legs: "#5a3a2a", boots: "#3a2414", weapon: "spear", shield: { c: "#8a5a2a", e: "tree", ec: "#f0e0b0", round: true }, potion: "#80c0ff", accessory: "winged" },
  { id: "druid", f: false, skin: 7, hair: "#5a3a1a", style: "beard", head: "leaves", body: "robe", a: "#7a5a2a", A: "#4e3818", t: "#5ab040", legs: "#4e3818", boots: "#3a2a14", weapon: "branch", shield: null, emblem: "leaf", ec: "#8ae060", potion: "#a0ff60", accessory: "leaves" },
];

const EMBLEMS = {
  cross: [".#.", "###", ".#."],
  sun: ["#.#", ".#.", "#.#"],
  star: [".#.", "###", "#.#"],
  heart: ["#.#", "###", ".#."],
  tree: [".#.", "###", ".#."],
  moon: [".##", "#..", ".##"],
  leaf: ["..#", ".#.", "#.."],
};
function emblem(g, kind, x, y, c) {
  EMBLEMS[kind]?.forEach((r, j) => [...r].forEach((p, i) => p === "#" && put(g, x + i, y + j, c)));
}

/** The weapon, drawn over a 16x24 grid; `held` = in the front hand, else slung on the back. */
function weapon(g, cl, held, step = 0) {
  const steel = "#d0d8e8", wood = "#8a5a2a", dark = "#4a2a14";
  if (!held) {
    // Slung diagonally across the back.
    switch (cl.weapon) {
      case "bow": for (let i = 0; i < 12; i++) put(g, 2 + Math.round(Math.sin((i / 11) * Math.PI) * -1.5) + 1, 8 + i, wood); line(g, 3, 8, 3, 19, "#e8e0c8"); break;
      case "staff": case "branch": line(g, 2, 4, 6, 22, wood); if (cl.weapon === "staff") ell(g, 2, 3, 1.6, 1.6, cl.orb); else put(g, 1, 3, "#5ab040"), put(g, 3, 2, "#5ab040"); break;
      case "spear": line(g, 2, 2, 6, 22, wood); put(g, 2, 1, steel), put(g, 1, 2, steel), put(g, 2, 0, steel); break;
      case "lute": ell(g, 3, 17, 2.5, 3, "#c87a3a"); line(g, 3, 14, 6, 7, dark); put(g, 3, 17, dark); break;
      default: line(g, 2, 9, 6, 19, steel); rect(g, 1, 17, 4, 1, GOLD.md);
    }
    return;
  }
  const hx = 12, hy = 14 - step; // the front hand
  switch (cl.weapon) {
    case "sword": line(g, hx + 1, hy - 1, hx + 1, hy - 9, steel); put(g, hx + 1, hy - 10, "#ffffff"); rect(g, hx - 1, hy - 1, 5, 1, GOLD.md); put(g, hx + 1, hy, dark); break;
    case "bow": for (let i = 0; i < 13; i++) put(g, hx + 2 + Math.round(Math.sin((i / 12) * Math.PI) * 2), hy - 7 + i, wood); line(g, hx + 2, hy - 7, hx + 2, hy + 5, "#e8e0c8"); break;
    case "staff": line(g, hx + 1, hy - 10, hx + 1, hy + 8, wood); ell(g, hx + 1, hy - 11, 1.8, 1.8, cl.orb); put(g, hx + 1, hy - 12, "#ffffff"); break;
    case "branch": line(g, hx + 1, hy - 10, hx + 1, hy + 8, wood); put(g, hx, hy - 10, "#5ab040"); put(g, hx + 2, hy - 11, "#5ab040"); put(g, hx + 2, hy - 8, "#5ab040"); break;
    case "hammer": line(g, hx + 1, hy - 7, hx + 1, hy + 2, wood); rect(g, hx - 1, hy - 10, 5, 3, "#b8c0d0"); rect(g, hx - 1, hy - 10, 5, 1, "#ffffff"); break;
    case "axe": line(g, hx + 1, hy - 9, hx + 1, hy + 3, wood); poly(g, [[hx + 2, hy - 10], [hx + 5, hy - 12], [hx + 5, hy - 4], [hx + 2, hy - 6]], steel); break;
    case "daggers": line(g, hx + 1, hy - 1, hx + 3, hy - 5, steel); put(g, hx + 1, hy, dark); line(g, 3, hy, 1, hy - 4, steel); break;
    case "mace": line(g, hx + 1, hy - 5, hx + 1, hy + 1, wood); ell(g, hx + 1, hy - 7, 2, 2, "#9aa0b0"); put(g, hx + 1, hy - 10, "#9aa0b0"); put(g, hx - 2, hy - 7, "#9aa0b0"); put(g, hx + 4, hy - 7, "#9aa0b0"); break;
    case "spear": line(g, hx + 1, hy - 12, hx + 1, hy + 8, wood); poly(g, [[hx + 1, hy - 16], [hx + 3, hy - 12], [hx - 1, hy - 12]], steel); break;
    case "lute": ell(g, hx - 1, hy + 1, 3, 3.5, "#c87a3a"); ell(g, hx - 1, hy + 1, 1, 1, dark); line(g, hx + 1, hy - 1, hx + 4, hy - 7, dark); break;
  }
}

/** An adventurer, facing right (16x24). pose: hold (file overhead), walk (frame 0/1). */
function adventurer(cl, pose = "walk", frame = 0) {
  const g = grid(16, 24);
  const skin = SKIN[cl.skin];
  const shadow = mix(skin, "#000000", 0.25);
  const R = (x, y, w, h, c) => rect(g, x, y, w, h, c);
  const hold = pose === "hold";
  // Weapon slung on the back when the hands are busy holding the file.
  if (hold) weapon(g, cl, false);
  // Long hair falls behind.
  if (cl.style === "long") R(5, 5, 3, 9, cl.hair);
  if (cl.style === "braid") R(5, 6, 2, 10, cl.hair), put(g, 5, 16, cl.t);
  // Legs and boots (walking frames swap them).
  const robe = cl.body === "robe";
  const legs = frame ? [[5, 9], [9, 6]] : [[6, 8], [8, 7]];
  if (!robe) {
    R(legs[0][0], 17, 2, 5, cl.legs);
    R(legs[0][1], 17, 2, 5, mix(cl.legs, "#000000", 0.2));
  }
  R(legs[0][0] - (frame ? 0 : 1), 22, 3, 2, cl.boots);
  R(legs[0][1], 22, 3, 2, cl.boots);
  // Body.
  switch (cl.body) {
    case "robe":
      poly(g, [[5, 10], [11, 10], [12, 22], [4, 22]], cl.a);
      R(7, 10, 2, 12, cl.A);
      R(4, 21, 9, 1, cl.t);
      break;
    case "fur":
      R(6, 10, 5, 5, skin);
      put(g, 7, 12, shadow), put(g, 9, 12, shadow);
      R(5, 15, 7, 3, cl.a);
      for (let x = 5; x < 12; x += 2) put(g, x, 17, cl.A);
      line(g, 6, 10, 10, 14, cl.t);
      break;
    case "doublet":
      R(5, 10, 6, 7, cl.a);
      for (let y = 10; y < 17; y++) put(g, 5 + ((y + 1) % 2) * 5, y, cl.A);
      R(7, 10, 2, 1, "#ffffff");
      break;
    case "plate":
      R(5, 10, 6, 7, cl.a);
      R(5, 10, 6, 1, mix(cl.a, "#ffffff", 0.4));
      R(10, 10, 1, 7, cl.A);
      R(4, 10, 2, 2, cl.A); R(10, 10, 2, 2, cl.A); // pauldrons
      break;
    default: // leather
      R(5, 10, 6, 7, cl.a);
      R(6, 10, 1, 7, cl.A);
      line(g, 5, 10, 10, 15, cl.t);
  }
  if (cl.f && cl.body !== "robe") R(4, 16, 8, 2, cl.a), R(4, 17, 8, 1, cl.A); // a short skirt or tasset
  R(5, 15, 6, 1, cl.t); // belt
  // Potion on the belt.
  put(g, 10, 15, "#d8d8e8");
  rect(g, 10, 16, 2, 2, cl.potion);
  put(g, 11, 16, mix(cl.potion, "#ffffff", 0.5));
  // Emblem on the chest (when there's no shield to carry it).
  if (!cl.shield && cl.emblem) emblem(g, cl.emblem, 7, 11, cl.ec);
  // Head.
  R(6, 4, 5, 6, skin);
  R(6, 8, 1, 2, shadow);
  put(g, 9, 6, INK);
  if (cl.f) put(g, 10, 8, "#c0405a"), put(g, 9, 5, INK);
  else put(g, 10, 8, shadow);
  // Hair.
  switch (cl.style) {
    case "beard": R(8, 8, 3, 3, cl.hair); put(g, 8, 7, cl.hair); put(g, 10, 7, cl.hair); R(6, 3, 5, 2, cl.hair); R(5, 4, 2, 4, cl.hair); break;
    case "bald": put(g, 7, 4, mix(skin, "#ffffff", 0.3)); break;
    case "bob": R(5, 3, 6, 2, cl.hair); R(5, 4, 2, 5, cl.hair); break;
    default: R(6, 3, 5, 2, cl.hair); R(5, 4, 2, 4, cl.hair);
  }
  // Headgear.
  switch (cl.head) {
    case "helm":
      R(5, 2, 7, 6, cl.a); R(5, 2, 7, 1, "#ffffff"); R(8, 5, 4, 1, INK); R(6, 6, 1, 2, cl.A);
      R(7, 0, 3, 2, cl.plume); put(g, 6, 1, cl.plume); put(g, 5, 2, cl.plume);
      break;
    case "hood":
      R(5, 2, 6, 3, cl.hood); R(5, 2, 2, 8, cl.hood); put(g, 4, 9, cl.hood); put(g, 11, 4, cl.hood);
      break;
    case "wizard":
      R(3, 3, 11, 1, cl.hat); R(5, 2, 7, 1, cl.hat); R(6, 1, 5, 1, cl.hat); R(7, 0, 3, 1, cl.hat); put(g, 6, 2, cl.t); put(g, 9, 1, "#f2d040");
      break;
    case "circlet":
      R(6, 3, 5, 1, GOLD.lt); put(g, 9, 3, GEM.sapphire[1]);
      break;
    case "horned":
      R(5, 2, 7, 3, "#9aa0b0"); R(5, 2, 7, 1, "#c8ccd8"); put(g, 4, 1, BONE.md); put(g, 3, 0, BONE.lt); put(g, 12, 1, BONE.md); put(g, 13, 0, BONE.lt); put(g, 4, 2, BONE.md); put(g, 12, 2, BONE.md);
      break;
    case "mask":
      R(7, 6, 4, 1, cl.mask); put(g, 9, 6, "#ffffff"); put(g, 5, 7, cl.mask); put(g, 4, 8, cl.mask);
      break;
    case "cap":
      R(5, 2, 7, 2, cl.hat); put(g, 11, 4, cl.hat); line(g, 5, 2, 2, 0, cl.feather); put(g, 3, 1, cl.feather);
      break;
    case "winged":
      R(5, 2, 7, 3, "#c8ccd8"); R(5, 2, 7, 1, "#ffffff"); put(g, 4, 2, "#ffffff"); put(g, 3, 1, "#ffffff"); put(g, 2, 1, "#e8e8f0"); put(g, 3, 2, "#e8e8f0"); put(g, 12, 2, "#ffffff"); put(g, 13, 1, "#ffffff");
      break;
    case "leaves":
      for (const x of [5, 7, 9, 11]) put(g, x, 3, "#5ab040"), put(g, x + 1, 2, "#8ae060");
      break;
  }
  // Arms.
  if (hold) {
    R(4, 4, 2, 7, cl.body === "fur" ? skin : cl.A); R(4, 2, 2, 2, skin);
    R(11, 4, 2, 7, cl.body === "fur" ? skin : cl.A); R(11, 2, 2, 2, skin);
  } else {
    // Shield on the back arm, weapon raised in the front hand.
    if (cl.shield) {
      const s = cl.shield;
      if (s.round) ell(g, 4, 14, 3.5, 3.5, s.c);
      else poly(g, [[1, 10], [7, 10], [7, 15], [4, 19], [1, 15]], s.c);
      emblem(g, s.e, 3, 12, s.ec);
    } else R(4, 11, 2, 5, cl.body === "fur" ? skin : cl.A), put(g, 4, 16, skin);
    R(11, 11, 2, 3, cl.body === "fur" ? skin : cl.A);
    R(12, 13 - frame, 2, 2, skin);
    weapon(g, cl, true, frame);
  }
  return outline(g, INK);
}

const CHAR = ["#2a2420", "#3a302a", "#1a1412"];
const deaths = {
  /** Burnt to a crisp: charcoal, a few embers. */
  char: (g) => mapG(g, (c, x, y) => (hash(x, y, 11) < 25 ? "#ff7a20" : CHAR[hash(x, y, 12) % 3])),
  /** Turned to stone. */
  stone: (g) => mapG(g, (c, x, y) => {
    const v = parseInt(c.slice(1, 3), 16) + parseInt(c.slice(3, 5), 16) + parseInt(c.slice(5, 7), 16);
    return v < 120 ? "#3a3a42" : v < 330 ? "#7a7a86" : v < 520 ? "#9a9aa6" : "#c0c0cc";
  }),
  /** Turned to gold. */
  gold: (g) => mapG(g, (c, x, y) => {
    const v = parseInt(c.slice(1, 3), 16) + parseInt(c.slice(3, 5), 16) + parseInt(c.slice(5, 7), 16);
    return v < 120 ? GOLD.dp : v < 330 ? GOLD.dk : v < 520 ? GOLD.md : (x + y) % 5 ? GOLD.lt : GOLD.hi;
  }),
};

/** A skeleton (16x24), facing right; with a class's gear on it when given. */
function skeleton(cl = null) {
  const g = grid(16, 24);
  const b = BONE.md, B = BONE.lt, d = BONE.dk;
  rect(g, 6, 3, 5, 5, B); put(g, 7, 5, INK); put(g, 9, 5, INK); rect(g, 7, 8, 3, 1, b); put(g, 8, 8, INK);
  line(g, 8, 9, 8, 16, b);
  for (const y of [10, 12, 14]) line(g, 6, y, 10, y, y === 10 ? B : b);
  line(g, 5, 10, 4, 16, b); line(g, 11, 10, 12, 16, b);
  rect(g, 6, 16, 5, 1, d);
  line(g, 6, 17, 6, 23, b); line(g, 10, 17, 10, 23, b);
  put(g, 5, 23, B); put(g, 11, 23, B);
  if (cl) gearOn(g, cl, 0);
  return outline(g, "#3a2a20");
}
/** A class's signature piece of gear, worn on a skull at (x, y) offset. */
function gearOn(g, cl, dy) {
  const y = 1 + dy;
  switch (cl.accessory) {
    case "helm": rect(g, 5, y, 7, 4, cl.a); rect(g, 7, y - 2, 3, 2, cl.plume); break;
    case "hood": rect(g, 5, y, 7, 3, cl.hood); rect(g, 5, y, 2, 6, cl.hood); break;
    case "wizard": rect(g, 3, y + 2, 11, 1, cl.hat); rect(g, 5, y + 1, 7, 1, cl.hat); rect(g, 6, y, 5, 1, cl.hat); rect(g, 7, y - 1, 3, 1, cl.hat); put(g, 9, y, "#f2d040"); break;
    case "circlet": rect(g, 6, y + 2, 5, 1, GOLD.lt); put(g, 8, y + 2, GEM.sapphire[1]); break;
    case "horned": rect(g, 5, y + 1, 7, 2, "#9aa0b0"); put(g, 4, y, BONE.lt); put(g, 12, y, BONE.lt); put(g, 3, y - 1, BONE.lt); put(g, 13, y - 1, BONE.lt); break;
    case "mask": rect(g, 6, y + 3, 5, 1, cl.mask); break;
    case "mace": line(g, 13, 10, 13, 16, "#8a5a2a"); ell(g, 13, 9, 1.6, 1.6, "#9aa0b0"); break;
    case "cap": rect(g, 5, y + 1, 7, 2, cl.hat); line(g, 5, y + 1, 2, y - 1, cl.feather); break;
    case "winged": rect(g, 5, y + 1, 7, 2, "#c8ccd8"); put(g, 4, y + 1, "#ffffff"); put(g, 3, y, "#ffffff"); put(g, 12, y + 1, "#ffffff"); put(g, 13, y, "#ffffff"); break;
    case "leaves": for (const x of [5, 7, 9, 11]) put(g, x, y + 2, "#5ab040"), put(g, x + 1, y + 1, "#8ae060"); break;
  }
}

/** The bone pile after n deaths (34x38): skeletons heaped up, wearing what they came in. */
function bonePile(n) {
  const g = grid(34, 38);
  // A few old bones are always there.
  const bone = (x, y, len, vertical, c = BONE.md) => {
    if (vertical) line(g, x, y, x, y + len, c), put(g, x - 1, y, BONE.lt), put(g, x + 1, y, BONE.lt), put(g, x - 1, y + len, BONE.lt), put(g, x + 1, y + len, BONE.lt);
    else line(g, x, y, x + len, y, c), put(g, x, y - 1, BONE.lt), put(g, x, y + 1, BONE.lt), put(g, x + len, y - 1, BONE.lt), put(g, x + len, y + 1, BONE.lt);
  };
  bone(6, 35, 6, false);
  bone(20, 34, 7, false);
  const skull = (x, y, cl) => {
    rect(g, x, y, 5, 4, BONE.lt);
    rect(g, x + 1, y + 4, 3, 1, BONE.md);
    put(g, x + 1, y + 2, INK); put(g, x + 3, y + 2, INK); put(g, x + 2, y + 4, INK);
    if (cl) {
      const sub = grid(16, 10);
      gearOn(sub, cl, 1);
      stamp(g, sub, x - 6, y - 2);
    }
  };
  // Each death adds a heap of bones, a skull with that class's gear, and its weapon.
  const spots = [[14, 30], [5, 31], [23, 30], [10, 25], [19, 24], [3, 25], [26, 23], [14, 19], [7, 18], [21, 17], [12, 12], [3, 13], [25, 11], [16, 6], [8, 4], [21, 2]];
  for (let k = 0; k < Math.min(n, spots.length); k++) {
    const [x, y] = spots[k];
    const cl = CLASSES[k % CLASSES.length];
    // Bones under it.
    ell(g, x + 2, y + 6, 6, 3, (px, py) => (hash(px, py, k) % 4 === 0 ? BONE.dk : hash(px, py, k + 1) % 3 ? BONE.md : BONE.lt));
    bone(x - 2, y + 7, 6 + (k % 3), false, BONE.dk);
    if (k % 2) bone(x + 6, y + 2, 5, true, BONE.md);
    const wg = grid(16, 24);
    weapon(wg, cl, false);
    if (k % 3 !== 2) stamp(g, wg, x - 3, y - 12);
    skull(x, y + 1, cl);
  }
  return outline(g, "#2a1a14");
}

// ---------- props and effects ----------

/** Glitter around the file (24x24): sparkles chasing round the edge. */
function glitter(i) {
  const g = grid(24, 24);
  const pts = [[1, 1], [12, 0], [22, 2], [23, 12], [21, 22], [11, 23], [0, 21], [1, 11], [6, 3], [18, 20]];
  pts.forEach(([x, y], k) => {
    const phase = (k + i) % 4;
    if (phase === 0) {
      put(g, x, y, "#ffffff");
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(g, x + dx, y + dy, k % 2 ? "#ffe880" : "#ff9ae0");
    } else if (phase === 1) put(g, x, y, k % 3 ? "#ffe880" : "#a0e8ff");
  });
  return g;
}

/** A file crushed flat (the glittery remains). */
function flatFile() {
  const g = grid(20, 4);
  rect(g, 1, 1, 18, 2, "#e8e4dc");
  rect(g, 1, 2, 18, 1, "#b8b0a0");
  for (let x = 2; x < 18; x += 3) put(g, x, 1, x % 2 ? "#ffe880" : "#ff9ae0");
  return outline(g, INK);
}

function ash(i) {
  // A smoking ash heap.
  const g = grid(18, 12);
  ell(g, 9, 11, 8, 4 + i * 0.3, (x, y) => (hash(x, y, 13) % 5 === 0 ? "#ff6a20" : hash(x, y, 14) % 2 ? "#4a4248" : "#2e282e"));
  for (let k = 0; k < 3; k++) put(g, 5 + k * 4, 6 - ((i + k) % 3) * 2, "#8a8090a0");
  return g;
}

function dust(i) {
  const g = grid(36, 14);
  const r = [3, 5, 6, 6][i];
  for (const dx of [-12, -6, 0, 6, 12]) ell(g, 18 + dx * (0.6 + i * 0.15), 10 - Math.abs(dx) * 0.2, r * 0.5, r * 0.45, i === 3 ? "#c8b8a880" : "#d8c8b0");
  return g;
}

function stars(i) {
  // Birdie stars spinning over a dazed head.
  const g = grid(14, 6);
  for (let k = 0; k < 3; k++) {
    const a = ((i + k * 1.33) / 4) * Math.PI * 2;
    const x = 7 + Math.cos(a) * 5, y = 3 + Math.sin(a) * 1.5;
    put(g, x, y, "#ffe040");
    put(g, x + 1, y, "#fff8c0");
  }
  return g;
}

function twinkle(i) {
  const g = grid(9, 9);
  const s = [1, 3, 4, 2][i];
  for (let k = -s; k <= s; k++) put(g, 4 + k, 4, "#ffffff"), put(g, 4, 4 + k, "#ffffff");
  if (s > 2) put(g, 3, 3, "#fff4b0"), put(g, 5, 5, "#fff4b0"), put(g, 3, 5, "#fff4b0"), put(g, 5, 3, "#fff4b0");
  return g;
}

function tail(i) {
  // The dragon's tail sweeping in along the floor.
  const g = grid(70, 16);
  for (let x = 0; x < 64; x++) {
    const r = 1.5 + (x / 64) * 5;
    const y = 10 + Math.sin(x / 8 + i) * 2;
    for (let yy = Math.round(y - r); yy <= Math.round(y + r); yy++) put(g, x + 6, yy, yy < y - r + 1.5 ? RED.hi : (x + yy) % 4 === 0 ? RED.dk : RED.md);
  }
  poly(g, [[0, 10], [8, 4], [8, 16]], RED.md);
  return outline(g, "#3a0610");
}

function mimic(open) {
  const g = grid(14, 14);
  const p = { o: INK, w: "#8a4e28", W: "#6a3a1c", y: GOLD.lt, k: "#2a1810", t: "#ffffff", m: "#7a0a20", r: "#ff5a7a", e: "#ffe040" };
  if (!open) stamp(g, rows(["ooooooooooooo", "owwwwywwwwwwo", "oWWWWyWWWWWWo", "oyyyyyyyyyyyo", "owwwwykwwwwwo", "owwwwwwwwwwwo", "oWWWWWWWWWWWo", "ooooooooooooo"], p), 0, 6);
  else
    stamp(g, rows([
      "ooooooooooooo",
      "owwwwwwwwwwwo",
      "oWeWWWWWWWeWo",
      "otmtmtmtmtmto",
      ".mmmmmmmmmmm.",
      ".mmmmrrrmmmm.",
      ".mmmrrrrrmmm.",
      "otmtmtmtmtmto",
      "oyyyyyyyyyyyo",
      "owwwwykwwwwwo",
      "owwwwwwwwwwwo",
      "oWWWWWWWWWWWo",
      "ooooooooooooo",
    ], p), 0, 1);
  return g;
}

function whelp(i) {
  // A baby dragon, flapping (facing right).
  const g = grid(16, 12);
  ell(g, 8, 7, 4, 3, RED.md);
  ell(g, 12, 5, 2.5, 2, RED.md);
  put(g, 13, 4, INK);
  put(g, 14, 6, RED.dk);
  line(g, 4, 8, 1, 10, RED.md);
  if (i) poly(g, [[6, 5], [3, 0], [10, 4]], "#a82434");
  else poly(g, [[6, 6], [2, 10], [10, 6]], "#a82434");
  put(g, 7, 9, BELLY.md);
  put(g, 8, 9, BELLY.md);
  return outline(g, "#3a0610");
}

function arkGlow(i) {
  // The Ark's lid lifts and ghostly light pours out.
  const g = grid(30, 34);
  for (let k = 0; k < 6; k++) {
    const a = -Math.PI / 2 + (k - 2.5) * 0.35 + Math.sin(i + k) * 0.08;
    for (let r = 4; r < 30; r++) put(g, 15 + Math.cos(a) * r, 30 + Math.sin(a) * r, r > 22 && i % 2 ? null : `#e8f8ff${r > 18 ? "90" : "e0"}`);
  }
  for (let k = 0; k < 3; k++) {
    // Swirling spirits.
    const x = 15 + Math.cos(i * 1.2 + k * 2.1) * (6 + k * 3), y = 14 - k * 4 + Math.sin(i + k) * 2;
    ell(g, x, y, 2, 2.5, "#c8f0ffd0");
    put(g, x - 1, y, INK);
    put(g, x + 1, y, INK);
  }
  return g;
}

function scroll(open, cursed = false) {
  const g = grid(62, 14);
  if (!open) {
    rect(g, 28, 2, 6, 10, "#f0e0b0");
    rect(g, 27, 1, 8, 2, "#c8a870");
    rect(g, 27, 11, 8, 2, "#c8a870");
  } else {
    rect(g, 2, 2, 58, 10, cursed ? "#e8d8f4" : "#f4e8c4");
    rect(g, 0, 1, 3, 12, "#c8a870");
    rect(g, 59, 1, 3, 12, "#c8a870");
    for (let x = 5; x < 57; x += 2) put(g, x, 11, cursed ? "#8a2ac8" : "#d8c8a0");
  }
  return outline(g, "#5a3a20");
}

function quill(i) {
  const g = grid(10, 14);
  poly(g, [[8, 0], [9, 1], [3, 9], [2, 8]], "#ffffff");
  line(g, 9, 0, 2, 11, "#c8c8d8");
  put(g, 1, 12 + (i % 2 ? -1 : 0), INK);
  put(g, 2, 11, INK);
  return g;
}

function tag(i) {
  // A gold name tag, glowing while freshly branded.
  const g = grid(56, 11);
  rect(g, 1, 1, 54, 9, i ? GOLD.md : "#ff9a40");
  rect(g, 1, 1, 54, 1, GOLD.hi);
  rect(g, 1, 9, 54, 1, GOLD.dk);
  put(g, 3, 5, INK);
  return outline(g, GOLD.dp);
}

function curse(i) {
  // Purple sparks spiralling round the cursed reader.
  const g = grid(22, 28);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + i * 0.8;
    const y = 4 + ((k * 3 + i * 4) % 22);
    put(g, 11 + Math.cos(a) * 8, y, k % 2 ? "#c070ff" : "#f0d0ff");
  }
  return g;
}

function rubble() {
  const g = grid(18, 8);
  for (const [x, y, r] of [[4, 5, 3], [10, 5, 3.5], [14, 6, 2], [7, 3, 2]]) ell(g, x, y, r, r * 0.8, (px, py) => ((px + py) % 3 ? "#8a8a96" : "#5a5a66"));
  return outline(g, "#2a2a32");
}

function coinWave(i) {
  // An avalanche of coins pouring down the slope.
  const g = grid(48, 40);
  for (let k = 0; k < 90; k++) {
    const u = (hash(k, 1, 20) / 1000 + i * 0.2) % 1;
    const x = 46 - u * 44 + (hash(k, 2, 20) % 7) - 3, y = 4 + u * 30 + (hash(k, 3, 20) % 6);
    put(g, x, y, GOLD.lt);
    put(g, x + 1, y, GOLD.dk);
  }
  return g;
}

function coinHeap(n) {
  // The heap that buries the adventurer.
  const g = grid(26, 18);
  ell(g, 13, 18, 12, 4 + n * 4, (x, y) => (hash(x, y, 21) % 4 === 0 ? GOLD.hi : (x + y) % 3 ? GOLD.lt : GOLD.dk));
  return g;
}

// ---------- sprites ----------

export const sheetWidth = 1024;

const DRAGON_IDLE = [
  dragon(),
  dragon({ breath: 1 }),
  dragon(),
  dragon({ breath: 1, blink: true }),
  dragon(),
  dragon({ breath: 1 }),
  dragon({ up: true, jaw: 5, hose: false }),
  dragon({ up: true, jaw: 4, hose: false }),
];
const blankG = (w, h) => grid(w, h);

export const sprites = {
  hoard: toFrame(hoard()),
  twinkles: [0, 1, 2].map((i) => toFrame(twinkles(i))),
  torch: [0, 1, 2].map((i) => toFrame(torchFlame(i))),
  torchB: [1, 2, 0].map((i) => toFrame(torchFlame(i))),
  // The idle dragon: 8 frames at 1 fps, the last two a roar of fire into the air.
  dragonIdle: DRAGON_IDLE.map(toFrame),
  // In sync with dragonIdle: 16 frames at 2 fps, fire only in the last four.
  fireIdle: Array.from({ length: 16 }, (_, i) => toFrame(i >= 12 ? fireUp(i % 3) : blankG(22, 30))),
  // Smoke rings: 16 frames at 4 fps; empty while the dragon roars.
  rings: Array.from({ length: 16 }, (_, i) => toFrame(smokeRings(i))),
  dragon: [dragon(), dragon({ breath: 1 })].map(toFrame),
  dragonOpen: toFrame(dragon({ jaw: 5, hose: false })),
  dragonRoar: toFrame(dragon({ up: true, jaw: 5, hose: false, wings: 1 })),
  dragonSmile: toFrame(dragon({ smile: true })),
  dragonBlush: toFrame(dragon({ smile: true, blush: true, blink: true })),
  dragonClaw: toFrame(dragon({ claw: true, hose: false })),
  dragonClawOpen: toFrame(dragon({ claw: true, jaw: 3, hose: false })),
  dragonFly: toFrame(dragon({ wings: 1, hose: false })),
  dragonFlyClaw: toFrame(dragon({ wings: 1, claw: true, hose: false })),
  dragonPuff: toFrame(dragon({ jaw: 1, hose: true })),
  fireUp: [0, 1, 2].map((i) => toFrame(fireUp(i))),
  fire: [0, 1, 2].map((i) => toFrame(fireStream(i))),
  fireJet: [0, 1, 2].map((i) => toFrame(fireJet(i))),
  hookah: [0, 1, 2, 3].map((i) => toFrame(hookah(false, i))),
  hookahDrop: toFrame(hookah(true)),
  ring: [0, 1, 2].map((i) => toFrame(bigRing(i))),
  goldRing: [0, 1, 2].map((i) => toFrame(bigRing(i, "#ffe060"))),
  puff: [0, 1, 2, 3].map((i) => toFrame(puff(i))),
  princess: [princess(), princess(), princess(), princess({ blink: true })].map(toFrame),
  princessClap: [0, 1].map((frame) => toFrame(princess({ pose: "clap", frame }))),
  princessCheer: [0, 1].map((frame) => toFrame(princess({ pose: "cheer", frame }))),
  princessBlow: toFrame(princess({ pose: "blow" })),
  princessSwoon: toFrame(princess({ pose: "swoon" })),
  princessKiss: toFrame(princess({ pose: "kiss" })),
  princessWalk: [0, 1].map((frame) => toFrame(princess({ pose: "walk", frame }))),
  princessCarry: [0, 1].map((frame) => toFrame(princess({ pose: "carry", frame }))),
  princessWalkR: [0, 1].map((frame) => toFrame(flipX(princess({ pose: "walk", frame })))),
  princessCarryR: [0, 1].map((frame) => toFrame(flipX(princess({ pose: "carry", frame })))),
  heart: toFrame(heart()),
  hearts: [0, 1, 2, 3].map((i) => toFrame(hearts(i))),
  heartsIdle: Array.from({ length: 8 }, (_, i) => toFrame(i < 4 ? hearts(i) : blankG(20, 22))),
  pile0: toFrame(bonePile(0)),
  ...Object.fromEntries(Array.from({ length: 16 }, (_, k) => [`pile${k + 1}`, toFrame(bonePile(k + 1))])),
  skeleton: toFrame(skeleton()),
  skeletonLie: toFrame(rotCW(skeleton())),
  bones: [0, 1, 2, 3].map((k) => {
    let g = onCanvas(skeleton(), 24, 24, 0);
    for (let i = 0; i < k; i++) g = rotCW(g);
    return toFrame(g);
  }),
  skull: toFrame(outline(rows(["BBBBB", "BkBkB", "BBBBB", ".bkb."], { B: BONE.lt, b: BONE.md, k: INK }), "#3a2a20")),
  glitter: [0, 1, 2, 3].map((i) => toFrame(glitter(i))),
  flatFile: toFrame(flatFile()),
  ash: [0, 1, 2].map((i) => toFrame(ash(i))),
  dust: [0, 1, 2, 3].map((i) => toFrame(dust(i))),
  stars: [0, 1, 2, 3].map((i) => toFrame(stars(i))),
  twinkle: [0, 1, 2, 3].map((i) => toFrame(twinkle(i))),
  tail: [0, 1].map((i) => toFrame(tail(i))),
  mimic: toFrame(mimic(false)),
  mimicOpen: toFrame(mimic(true)),
  whelp: [0, 1].map((i) => toFrame(whelp(i))),
  arkGlow: [0, 1, 2, 3].map((i) => toFrame(arkGlow(i))),
  scroll: toFrame(scroll(false)),
  scrollOpen: toFrame(scroll(true)),
  scrollCursed: toFrame(scroll(true, true)),
  quill: [0, 1].map((i) => toFrame(quill(i))),
  tag: [0, 1].map((i) => toFrame(tag(i))),
  curse: [0, 1, 2].map((i) => toFrame(curse(i))),
  rubble: toFrame(rubble()),
  coinWave: [0, 1, 2, 3, 4].map((i) => toFrame(coinWave(i))),
  coinHeap: [0, 1, 2].map((n) => toFrame(coinHeap(n))),
  grailDrink: toFrame((() => { const g = grid(9, 11); grail(g, 1, 1); return g; })()),
};

// Each adventurer: how they hold the file, walk, and every way they meet their end.
for (const cl of CLASSES) {
  const walk0 = adventurer(cl, "walk", 0);
  sprites[`${cl.id}.hold`] = toFrame(adventurer(cl, "hold"));
  sprites[`${cl.id}.walk`] = [walk0, adventurer(cl, "walk", 1)].map(toFrame);
  sprites[`${cl.id}.back`] = [walk0, adventurer(cl, "walk", 1)].map((g) => toFrame(flipX(g)));
  sprites[`${cl.id}.lie`] = toFrame(rotCW(rotCW(rotCW(walk0))));
  sprites[`${cl.id}.flat`] = toFrame(outline(resize(walk0, 22, 5), INK));
  sprites[`${cl.id}.char`] = toFrame(deaths.char(walk0));
  sprites[`${cl.id}.stone`] = toFrame(deaths.stone(walk0));
  sprites[`${cl.id}.gold`] = toFrame(deaths.gold(walk0));
  sprites[`${cl.id}.spin`] = [0, 1, 2, 3].map((k) => {
    let g = onCanvas(walk0, 24, 24, 0);
    for (let i = 0; i < k; i++) g = rotCW(g);
    return toFrame(g);
  });
  sprites[`${cl.id}.old`] = toFrame(mapG(walk0, (c, x, y) => (y < 10 && c !== INK ? mix(c, "#d8d8d8", 0.6) : mix(c, "#8a8a7a", 0.45))));
}
const MEMBERS = CLASSES.map((c) => c.id);

// ---------- animations ----------

const [HX, HY] = HERO;
const hold = (t0, t1, x, y, extra = {}) => [{ t: t0, x, y, ...extra }, { t: t1, x, y, ...extra }];
const at2 = (sprite, t0, t1, [x, y], extra = {}) => ({ sprite, ...extra, keys: hold(t0, t1, x, y) });
const shift = (keys, dx, dy) => keys.map((k) => ({ ...k, x: k.x + dx, y: k.y + dy }));
const fadeOut = (keys, t) => [...keys, { ...keys[keys.length - 1], t, alpha: 0 }];
function hops(t0, t1, a, b, n, arc = 1) {
  const keys = [];
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    keys.push({ t: t0 + (t1 - t0) * k, x: Math.round(a[0] + (b[0] - a[0]) * k), y: Math.round(a[1] + (b[1] - a[1]) * k), arc });
  }
  return keys;
}
/** A caption across the top (or at `y`). */
const say = (text, color, t0, t1 = 1, y = 2) => ({
  text, color, align: "center",
  keys: t1 < 1 ? [{ t: t0, x: W / 2, y, alpha: 0 }, { t: t0 + 0.03, x: W / 2, y }, { t: t1 - 0.03, x: W / 2, y }, { t: t1, x: W / 2, y, alpha: 0 }] : [{ t: t0, x: W / 2, y, alpha: 0 }, { t: t0 + 0.03, x: W / 2, y }, { t: 1, x: W / 2, y }],
});
/** The file with its glitter, following `keys`. */
const glittery = (keys) => [{ sprite: "glitter", fps: 8, keys: shift(keys, -4, -4) }, { sprite: "file", keys }];
const fileHeld = (t1) => glittery(hold(0, t1, FILE[0], FILE[1]));
const heroHolds = (t1) => at2("@hero.hold", 0, t1, HERO);
/** The dragon resting on the hoard, breathing. */
const rest = (t0, t1, sprite = "dragon") => at2(sprite, t0, t1, DRAGON, sprite === "dragon" ? { fps: 2 } : {});
const hookahUp = (t0, t1) => at2("hookah", t0, t1, HOOKAH, { fps: 4 });
const hookahDown = (t0, t1) => at2("hookahDrop", t0, t1, HOOKAH);
/** The next adventurer walks in from the left. */
const arrive = (t0 = 0.8) => ({ sprite: "@hero+1.walk", fps: 8, keys: [{ t: t0, x: -16, y: HY }, ...hops(t0, 1, [-16, HY], HERO, 5, 1)] });
/** Bones (or anything) flung onto the pile. */
const toPile = (t0, t1, from, sprite = "bones", arc = 40) => ({
  sprite, fps: 12,
  keys: [{ t: t0, x: from[0], y: from[1] }, { t: t1, x: PILE[0] + 8, y: PILE[1] + 8, arc, scale: 0.8 }, { t: Math.min(1, t1 + 0.03), x: PILE[0] + 8, y: PILE[1] + 10, scale: 0.8, alpha: 0 }],
});
const FIRE_AT = [16, 25]; // the fire stream's sprite, from the mouth down to the adventurer
const FIRE_UP_AT = [80, -4];

/** The princess for a whole animation: sitting, with a reaction between t0 and t1. */
function princessReacts(kind, t0, t1) {
  const [px, py] = PRINCESS;
  const out = [];
  if (t0 > 0) out.push(at2("princess", 0, t0, PRINCESS, { fps: 1 }));
  if (t1 < 1) out.push(at2("princess", t1, 1, PRINCESS, { fps: 1 }));
  const above = [px - 2, py - 20];
  switch (kind) {
    case "clap":
      out.push(at2("princessClap", t0, t1, PRINCESS, { fps: 8 }));
      out.push({ sprite: "twinkle", fps: 8, keys: hold(t0 + 0.02, t1, px - 6, py + 2) });
      break;
    case "cheer":
      out.push({ sprite: "princessCheer", fps: 6, keys: [{ t: t0, x: px, y: py }, { t: (t0 * 2 + t1) / 3, x: px, y: py, arc: 5 }, { t: (t0 + t1 * 2) / 3, x: px, y: py, arc: 5 }, { t: t1, x: px, y: py, arc: 5 }] });
      out.push({ sprite: "hearts", fps: 5, once: true, keys: hold(t0 + 0.05, t1, above[0], above[1]) });
      break;
    case "blow": {
      out.push(at2("princessBlow", t0, t1, PRINCESS));
      // The kiss she blows floats over to the dragon's cheek.
      out.push({ sprite: "heart", keys: [{ t: t0 + 0.04, x: px + 1, y: py + 4, alpha: 0 }, { t: t0 + 0.08, x: px - 2, y: py + 2 }, { t: t1 - 0.04, x: CHEEK[0] - 2, y: CHEEK[1] - 2, arc: 12 }, { t: t1, x: CHEEK[0] - 2, y: CHEEK[1] - 4, alpha: 0 }] });
      break;
    }
    case "swoon":
      out.push(at2("princessSwoon", t0, t1, PRINCESS));
      out.push({ sprite: "hearts", fps: 5, keys: hold(t0 + 0.03, t1, above[0], above[1]) });
      break;
    case "kiss": {
      // She hops up and kisses his cheek; he blushes, hearts all round.
      const kx = CHEEK[0] - 4, ky = CHEEK[1] - 7;
      const a = t0 + 0.05, b = t1 - 0.05;
      out.push({ sprite: "princessKiss", keys: [{ t: t0, x: px, y: py }, { t: a, x: kx, y: ky, arc: 12 }, { t: b, x: kx, y: ky }, { t: t1, x: px, y: py, arc: 8 }] });
      out.push(at2("dragonBlush", a, b, DRAGON));
      out.push({ sprite: "hearts", fps: 5, keys: hold(a, b, kx - 2, ky - 20) });
      break;
    }
  }
  return out;
}

// --- trash ---

const stomped = {
  duration: 2800,
  sounds: [{ sfx: "dragonFlap", at: 0.1 }, { sfx: "dragonStomp", at: 0.28 }, { sfx: "dragonClap", at: 0.34 }, { sfx: "dragonFlap", at: 0.45 }, { sfx: "dragonBones", at: 0.66 }, { sfx: "dragonFanfare", at: 0.8 }],
  tracks: [
    hookahUp(0, 0.1), hookahDown(0.1, 0.6), hookahUp(0.6, 1),
    ...princessReacts("clap", 0.32, 0.64),
    heroHolds(0.28),
    ...fileHeld(0.28),
    at2("@hero.flat", 0.28, 0.62, [HX - 3, 95]),
    { sprite: "flatFile", keys: fadeOut(hold(0.28, 0.66, HX + 14, 96), 0.72) },
    toPile(0.62, 0.76, [HX, 84]),
    rest(0, 0.1),
    { sprite: "dragonFly", keys: [{ t: 0.1, x: DRAGON[0], y: DRAGON[1] }, { t: 0.28, x: -30, y: 38, arc: 30, ease: "in" }] },
    at2("dragon", 0.28, 0.44, [-30, 38]),
    { sprite: "dragonFly", keys: [{ t: 0.44, x: -30, y: 38 }, { t: 0.6, x: DRAGON[0], y: DRAGON[1], arc: 34 }] },
    rest(0.6, 1),
    { sprite: "dust", fps: 10, once: true, keys: hold(0.28, 0.42, HX - 10, 88) },
    arrive(),
    say("STOMPED FLAT! {name} TRASHED", "#ffffff", 0.3),
  ],
};

const burned = {
  duration: 2800,
  sounds: [{ sfx: "dragonRoar", at: 0.08 }, { sfx: "dragonFlame", at: 0.16 }, { sfx: "dragonSizzle", at: 0.28 }, { sfx: "dragonCrumble", at: 0.48 }, { sfx: "dragonKiss", at: 0.56 }, { sfx: "dragonBones", at: 0.64 }, { sfx: "dragonFanfare", at: 0.8 }],
  tracks: [
    hookahUp(0, 0.1), hookahDown(0.1, 0.46), hookahUp(0.46, 1),
    rest(0, 0.12), at2("dragonOpen", 0.12, 0.44, DRAGON), rest(0.44, 1),
    ...princessReacts("kiss", 0.5, 0.76),
    heroHolds(0.24),
    ...glittery(fadeOut(hold(0, 0.26, FILE[0], FILE[1]), 0.32)),
    at2("@hero.char", 0.24, 0.5, HERO),
    { sprite: "puff", fps: 8, once: true, keys: hold(0.28, 0.44, FILE[0] + 1, FILE[1] + 2) },
    { sprite: "fire", fps: 12, keys: [{ t: 0.16, x: FIRE_AT[0], y: FIRE_AT[1], alpha: 0 }, { t: 0.18, x: FIRE_AT[0], y: FIRE_AT[1] }, { t: 0.4, x: FIRE_AT[0], y: FIRE_AT[1] }, { t: 0.44, x: FIRE_AT[0], y: FIRE_AT[1], alpha: 0 }] },
    { sprite: "ash", fps: 4, keys: fadeOut(hold(0.5, 0.74, HX - 1, 88), 0.8) },
    toPile(0.62, 0.76, [HX, 82], "skull", 44),
    arrive(),
    say("BURNED TO A CRISP! {name} TRASHED", "#ffd040", 0.2),
  ],
};

// The dragon's jaws around the adventurer: where it lunges to.
const LUNGE = [12, 46];
function eatenTracks(burp) {
  return [
    hookahUp(0, 0.06), hookahDown(0.06, 0.52), hookahUp(0.52, 1),
    rest(0, 0.08),
    { sprite: "dragonOpen", keys: [{ t: 0.08, x: DRAGON[0], y: DRAGON[1] }, { t: 0.26, x: LUNGE[0], y: LUNGE[1], ease: "in" }, { t: 0.3, x: LUNGE[0], y: LUNGE[1] }] },
    { sprite: "dragon", keys: [{ t: 0.3, x: LUNGE[0], y: LUNGE[1] }, { t: 0.36, x: LUNGE[0], y: LUNGE[1] - 2 }, { t: 0.52, x: DRAGON[0], y: DRAGON[1], ease: "out" }] },
    heroHolds(0.29),
    ...fileHeld(0.29),
    ...burp,
  ];
}

const eaten = {
  duration: 2800,
  sounds: [{ sfx: "dragonRoar", at: 0.04 }, { sfx: "dragonSwish", at: 0.14 }, { sfx: "dragonChomp", at: 0.3 }, { sfx: "dragonGulp", at: 0.4 }, { sfx: "dragonBurp", at: 0.58 }, { sfx: "dragonBones", at: 0.7 }, { sfx: "dragonFanfare", at: 0.8 }],
  tracks: [
    ...eatenTracks([
      rest(0.52, 0.57), at2("dragonOpen", 0.57, 0.63, DRAGON), rest(0.63, 1),
      { sprite: "puff", fps: 8, once: true, keys: [{ t: 0.57, x: MOUTH[0] - 10, y: MOUTH[1] - 6 }, { t: 0.7, x: MOUTH[0] - 14, y: MOUTH[1] - 12 }] },
      toPile(0.58, 0.72, [MOUTH[0] - 8, MOUTH[1] - 4], "bones", 30),
    ]),
    ...princessReacts("cheer", 0.36, 0.68),
    arrive(),
    say("GULP! {name} EATEN WHOLE", "#ffffff", 0.3),
  ],
};

const swatted = {
  duration: 2800,
  sounds: [{ sfx: "dragonSwish", at: 0.12 }, { sfx: "dragonThud", at: 0.28 }, { sfx: "dragonKiss", at: 0.42 }, { sfx: "dragonTwinkle", at: 0.5 }, { sfx: "dragonBones", at: 0.72 }, { sfx: "dragonFanfare", at: 0.8 }],
  tracks: [
    hookahUp(0, 1),
    rest(0, 0.1), at2("dragonSmile", 0.1, 0.7, DRAGON), rest(0.7, 1),
    ...princessReacts("blow", 0.4, 0.68),
    heroHolds(0.28),
    { sprite: "@hero.spin", fps: 14, keys: [{ t: 0.28, x: HX - 4, y: HY - 2 }, { t: 0.5, x: -4, y: -24, arc: 30, ease: "out" }] },
    ...glittery([{ t: 0, x: FILE[0], y: FILE[1] }, { t: 0.28, x: FILE[0], y: FILE[1] }, { t: 0.5, x: 30, y: -24, arc: 24, ease: "out" }]),
    { sprite: "twinkle", fps: 8, keys: hold(0.5, 0.62, 6, 4) },
    { sprite: "tail", fps: 6, keys: [{ t: 0.08, x: W, y: 86 }, { t: 0.28, x: HX - 6, y: 86, ease: "in" }, { t: 0.34, x: HX - 2, y: 86 }, { t: 0.52, x: W, y: 86, ease: "in" }] },
    { sprite: "dust", fps: 10, once: true, keys: hold(0.27, 0.4, HX - 8, 88) },
    // What's left drops out of the sky onto the pile.
    { sprite: "bones", fps: 12, keys: [{ t: 0.62, x: PILE[0] + 8, y: -24 }, { t: 0.74, x: PILE[0] + 8, y: PILE[1] + 8, ease: "in" }, { t: 0.77, x: PILE[0] + 8, y: PILE[1] + 10, alpha: 0 }] },
    arrive(),
    say("TAIL-SWATTED! {name} TRASHED", "#ffffff", 0.3),
  ],
};

// --- delete ---

const devoured = {
  duration: 2800,
  sounds: [{ sfx: "dragonRoar", at: 0.04 }, { sfx: "dragonSwish", at: 0.14 }, { sfx: "dragonChomp", at: 0.3 }, { sfx: "dragonGulp", at: 0.4 }, { sfx: "dragonRoar", at: 0.56 }, { sfx: "dragonFlame", at: 0.58 }, { sfx: "dragonBones", at: 0.74 }, { sfx: "dragonFanfare", at: 0.82 }],
  tracks: [
    ...eatenTracks([
      rest(0.52, 0.56), at2("dragonRoar", 0.56, 0.72, DRAGON), rest(0.72, 1),
      { sprite: "fireUp", fps: 12, keys: hold(0.57, 0.71, FIRE_UP_AT[0], FIRE_UP_AT[1]) },
      { sprite: "skull", keys: [{ t: 0.64, x: PILE[0] + 14, y: -8 }, { t: 0.76, x: PILE[0] + 14, y: PILE[1] + 4, ease: "in" }, { t: 0.8, x: PILE[0] + 14, y: PILE[1] + 6, alpha: 0 }] },
    ]),
    ...princessReacts("swoon", 0.4, 0.74),
    arrive(0.82),
    say("DEVOURED FOR GOOD", "#ff7a6a", 0.3, 1, 2),
    say("{name} IS GONE", "#ffffff", 0.36, 1, 10),
  ],
};

// --- keep ---

const PERCH = [24, 38]; // the dragon down on the floor beside the adventurer
const kept = {
  duration: 2800,
  sounds: [{ sfx: "dragonFlap", at: 0.08 }, { sfx: "dragonThud", at: 0.22 }, { sfx: "dragonClank", at: 0.3 }, { sfx: "dragonSwish", at: 0.42 }, { sfx: "dragonClap", at: 0.5 }, { sfx: "dragonTwinkle", at: 0.55 }, { sfx: "dragonBones", at: 0.6 }, { sfx: "dragonFlap", at: 0.58 }, { sfx: "dragonFanfare", at: 0.8 }],
  tracks: [
    hookahUp(0, 0.08), hookahDown(0.08, 0.7), hookahUp(0.7, 1),
    rest(0, 0.08),
    { sprite: "dragonFly", keys: [{ t: 0.08, x: DRAGON[0], y: DRAGON[1] }, { t: 0.22, x: PERCH[0], y: PERCH[1], arc: 24 }] },
    { sprite: "dragonClaw", keys: [{ t: 0.22, x: PERCH[0], y: PERCH[1] }, { t: 0.28, x: PERCH[0], y: PERCH[1] }, { t: 0.38, x: PERCH[0], y: PERCH[1] - 24, ease: "out" }, { t: 0.56, x: PERCH[0], y: PERCH[1] - 24 }] },
    { sprite: "dragonFly", keys: [{ t: 0.56, x: PERCH[0], y: PERCH[1] - 24 }, { t: 0.7, x: DRAGON[0], y: DRAGON[1], arc: 10 }] },
    rest(0.7, 1),
    // Plucked up, file and all...
    { sprite: "@hero.hold", keys: [{ t: 0, x: HX, y: HY }, { t: 0.28, x: HX, y: HY }, { t: 0.38, x: HX, y: HY - 24, ease: "out" }, { t: 0.42, x: HX, y: HY - 24 }] },
    // ...the adventurer flicked onto the bone pile...
    { sprite: "@hero.spin", fps: 14, keys: [{ t: 0.42, x: HX - 2, y: HY - 26 }, { t: 0.6, x: PILE[0] + 6, y: PILE[1] + 4, arc: 50 }, { t: 0.63, x: PILE[0] + 6, y: PILE[1] + 6, alpha: 0 }] },
    // ...and the file set down gently: kept.
    ...glittery([{ t: 0, x: FILE[0], y: FILE[1] }, { t: 0.28, x: FILE[0], y: FILE[1] }, { t: 0.38, x: FILE[0], y: FILE[1] - 24, ease: "out" }, { t: 0.44, x: FILE[0], y: FILE[1] - 24 }, { t: 0.56, x: 44, y: 84, ease: "out" }, { t: 0.82, x: 44, y: 84 }, { t: 0.88, x: 44, y: 84, alpha: 0 }]),
    ...princessReacts("clap", 0.46, 0.76),
    arrive(),
    say("PLUCKED AND TOSSED. {name} KEPT", "#ffffff", 0.4),
  ],
};

const gilded = {
  duration: 2800,
  sounds: [{ sfx: "dragonBubble", at: 0.03 }, { sfx: "dragonPuff", at: 0.12 }, { sfx: "dragonGild", at: 0.44 }, { sfx: "dragonTwinkle", at: 0.52 }, { sfx: "dragonHearts", at: 0.56 }, { sfx: "dragonCoins", at: 0.66 }, { sfx: "dragonFanfare", at: 0.8 }],
  tracks: [
    hookahUp(0, 1),
    rest(0, 0.08), at2("dragonPuff", 0.08, 0.3, DRAGON), rest(0.3, 1),
    { sprite: "goldRing", fps: 6, keys: [{ t: 0.12, x: MOUTH[0] - 12, y: MOUTH[1] - 8, scale: 0.4, alpha: 0 }, { t: 0.16, x: MOUTH[0] - 16, y: MOUTH[1] - 8, scale: 0.5 }, { t: 0.4, x: HX - 3, y: HY - 6, scale: 1, arc: -10 }, { t: 0.46, x: HX - 3, y: HY + 14 }, { t: 0.5, x: HX - 3, y: HY + 16, alpha: 0 }] },
    heroHolds(0.46),
    { sprite: "@hero.gold", keys: [{ t: 0.46, x: HX, y: HY }, { t: 0.62, x: HX, y: HY }, { t: 0.74, x: HX + 40, y: HY + 4, ease: "in", alpha: 0 }] },
    { sprite: "twinkle", fps: 8, keys: hold(0.48, 0.62, HX + 6, HY - 2) },
    ...glittery([{ t: 0, x: FILE[0], y: FILE[1] }, { t: 0.46, x: FILE[0], y: FILE[1] }, { t: 0.56, x: 44, y: 84, ease: "out" }, { t: 0.82, x: 44, y: 84 }, { t: 0.88, x: 44, y: 84, alpha: 0 }]),
    ...princessReacts("swoon", 0.5, 0.8),
    arrive(),
    say("TURNED TO GOLD! {name} KEPT", "#ffe060", 0.44),
  ],
};

const mimicked = {
  duration: 2800,
  sounds: [{ sfx: "dragonClank", at: 0.16 }, { sfx: "dragonMimic", at: 0.32 }, { sfx: "dragonChomp", at: 0.36 }, { sfx: "dragonClap", at: 0.44 }, { sfx: "dragonGulp", at: 0.5 }, { sfx: "dragonBones", at: 0.62 }, { sfx: "dragonFanfare", at: 0.8 }],
  tracks: [
    hookahUp(0, 1),
    rest(0, 0.3), at2("dragonSmile", 0.3, 0.8, DRAGON), rest(0.8, 1),
    { sprite: "mimic", keys: [{ t: 0, x: MIMIC[0], y: MIMIC[1] - 2, alpha: 0 }, { t: 0.06, x: MIMIC[0], y: MIMIC[1] - 2 }, { t: 0.32, x: MIMIC[0], y: MIMIC[1] - 2 }] },
    at2("mimicOpen", 0.32, 0.44, [MIMIC[0], MIMIC[1] - 2]),
    { sprite: "mimic", keys: [{ t: 0.44, x: MIMIC[0], y: MIMIC[1] - 2 }, { t: 0.48, x: MIMIC[0] + 1, y: MIMIC[1] - 3 }, { t: 0.52, x: MIMIC[0] - 1, y: MIMIC[1] - 2 }, { t: 0.56, x: MIMIC[0] + 1, y: MIMIC[1] - 3 }, { t: 0.6, x: MIMIC[0], y: MIMIC[1] - 2 }, { t: 0.86, x: MIMIC[0], y: MIMIC[1] - 2 }, { t: 0.92, x: MIMIC[0], y: MIMIC[1] - 2, alpha: 0 }] },
    // The adventurer sets the file down on the chest for a rest...
    heroHolds(0.14),
    { sprite: "@hero.walk", fps: 8, keys: [{ t: 0.14, x: HX, y: HY }, { t: 0.3, x: HX + 10, y: HY, arc: 1 }, { t: 0.33, x: HX + 10, y: HY }] },
    // ...and the chest bites. In they go.
    { sprite: "@hero.spin", fps: 14, keys: [{ t: 0.33, x: HX + 8, y: HY - 4 }, { t: 0.42, x: MIMIC[0] - 4, y: MIMIC[1] - 10, arc: 14 }, { t: 0.44, x: MIMIC[0] - 4, y: MIMIC[1] - 6, alpha: 0 }] },
    ...glittery([{ t: 0, x: FILE[0], y: FILE[1] }, { t: 0.14, x: FILE[0], y: FILE[1] }, { t: 0.3, x: MIMIC[0] - 2, y: MIMIC[1] - 16, arc: 6 }, { t: 0.32, x: MIMIC[0] - 2, y: MIMIC[1] - 16 }, { t: 0.36, x: MIMIC[0] - 2, y: MIMIC[1] - 34, ease: "out" }, { t: 0.46, x: MIMIC[0] - 2, y: MIMIC[1] - 16, ease: "in" }, { t: 0.86, x: MIMIC[0] - 2, y: MIMIC[1] - 16 }, { t: 0.92, x: MIMIC[0] - 2, y: MIMIC[1] - 16, alpha: 0 }]),
    toPile(0.6, 0.74, [MIMIC[0], MIMIC[1] - 8], "bones", 46),
    ...princessReacts("clap", 0.4, 0.72),
    arrive(),
    say("A MIMIC! {name} KEPT", "#ffffff", 0.32),
  ],
};

const buried = {
  duration: 2800,
  sounds: [{ sfx: "dragonRoar", at: 0.05 }, { sfx: "dragonCoins", at: 0.16 }, { sfx: "dragonCoins", at: 0.3 }, { sfx: "dragonThud", at: 0.4 }, { sfx: "dragonTwinkle", at: 0.5 }, { sfx: "dragonBones", at: 0.66 }, { sfx: "dragonFanfare", at: 0.8 }],
  tracks: [
    hookahUp(0, 0.04), hookahDown(0.04, 0.24), hookahUp(0.24, 1),
    rest(0, 0.04), at2("dragonRoar", 0.04, 0.22, DRAGON), rest(0.22, 1),
    heroHolds(0.36),
    { sprite: "coinWave", fps: 10, keys: [{ t: 0.12, x: 20, y: 46, alpha: 0 }, { t: 0.16, x: 18, y: 48 }, { t: 0.42, x: 8, y: 56 }, { t: 0.48, x: 8, y: 58, alpha: 0 }] },
    { sprite: "coinHeap", fps: 6, once: true, keys: [{ t: 0.22, x: HX - 5, y: 84 }, { t: 0.8, x: HX - 5, y: 84 }, { t: 0.86, x: HX - 5, y: 86, alpha: 0 }] },
    // Only the file pops back out, glittering on top of the heap: kept.
    ...glittery([{ t: 0, x: FILE[0], y: FILE[1] }, { t: 0.32, x: FILE[0], y: FILE[1] }, { t: 0.4, x: FILE[0], y: 82, ease: "in" }, { t: 0.5, x: FILE[0] + 2, y: 70, arc: 14 }, { t: 0.8, x: FILE[0] + 2, y: 70 }, { t: 0.86, x: FILE[0] + 2, y: 70, alpha: 0 }]),
    toPile(0.62, 0.78, [HX, 82], "skull", 52),
    ...princessReacts("cheer", 0.3, 0.62),
    arrive(0.84),
    say("BURIED IN GOLD! {name} KEPT", "#ffe060", 0.36),
  ],
};

// --- move ---

const SPOT = SORT_SPOTS[1];
const smitten = {
  duration: 3000,
  sounds: [{ sfx: "dragonPatter", at: 0.05 }, { sfx: "dragonPatter", at: 0.15 }, { sfx: "dragonKiss", at: 0.27 }, { sfx: "dragonHearts", at: 0.3 }, { sfx: "dragonTwinkle", at: 0.55 }, { sfx: "dragonThud", at: 0.46 }, { sfx: "dragonBones", at: 0.64 }, { sfx: "dragonClap", at: 0.84 }, { sfx: "dragonFanfare", at: 0.8 }],
  tracks: [
    hookahUp(0, 1),
    rest(0, 0.2), at2("dragonSmile", 0.2, 1, DRAGON),
    // She comes down off the hoard...
    { sprite: "princessWalk", fps: 6, keys: [{ t: 0, x: PRINCESS[0], y: PRINCESS[1] }, ...hops(0.02, 0.24, PRINCESS, [26, HY], 7, 3)] },
    // ...kisses the adventurer...
    at2("princessKiss", 0.24, 0.36, [24, HY]),
    // ...snatches the dropped file and files it on the sorted piles.
    { sprite: "princessCarryR", fps: 6, keys: [{ t: 0.38, x: 22, y: HY }, ...hops(0.38, 0.5, [22, HY], [SPOT[0] - 4, HY], 4, 1)] },
    at2("princessCarryR", 0.5, 0.56, [SPOT[0] - 4, HY]),
    { sprite: "princessWalkR", fps: 6, keys: [{ t: 0.56, x: SPOT[0] - 4, y: HY }, ...hops(0.56, 0.78, [SPOT[0] - 4, HY], PRINCESS, 7, 3)] },
    at2("princessClap", 0.78, 1, PRINCESS, { fps: 8 }),
    // The adventurer, struck, drops the file and swoons for good.
    heroHolds(0.32),
    at2("@hero.walk", 0.32, 0.44, HERO),
    { sprite: "hearts", fps: 6, keys: hold(0.28, 0.46, HX - 2, HY - 20) },
    { sprite: "stars", fps: 8, keys: hold(0.34, 0.44, HX + 1, HY - 2) },
    at2("@hero.lie", 0.44, 0.58, [HX - 4, 84]),
    { sprite: "skeletonLie", keys: [{ t: 0.52, x: HX - 4, y: 84, alpha: 0 }, { t: 0.58, x: HX - 4, y: 84 }, { t: 0.62, x: HX - 4, y: 84 }] },
    toPile(0.62, 0.76, [HX, 80]),
    ...glittery([{ t: 0, x: FILE[0], y: FILE[1] }, { t: 0.32, x: FILE[0], y: FILE[1] }, { t: 0.36, x: FILE[0] + 2, y: 84, ease: "in" }, { t: 0.38, x: 22, y: HY - 14 }, ...shift(hops(0.38, 0.5, [22, HY], [SPOT[0] - 4, HY], 4, 1), 0, -14), { t: 0.5, x: SPOT[0] - 4, y: HY - 14 }, { t: 0.56, x: SPOT[0], y: SPOT[1], arc: 20 }, { t: 0.9, x: SPOT[0], y: SPOT[1] }, { t: 0.96, x: SPOT[0], y: SPOT[1], alpha: 0 }]),
    arrive(0.8),
    say("SMITTEN! FILED IN {dest}", "#ff9ac0", 0.36),
  ],
};

const placed = {
  duration: 3000,
  sounds: [{ sfx: "dragonFlap", at: 0.08 }, { sfx: "dragonFlap", at: 0.3 }, { sfx: "dragonTwinkle", at: 0.46 }, { sfx: "dragonKiss", at: 0.5 }, { sfx: "dragonSwish", at: 0.54 }, { sfx: "dragonThud", at: 0.58 }, { sfx: "dragonBones", at: 0.74 }, { sfx: "dragonFanfare", at: 0.8 }],
  tracks: (() => {
    const fly = [{ t: 0.08, x: DRAGON[0], y: DRAGON[1] }, { t: 0.22, x: 18, y: 20, arc: 12 }, { t: 0.27, x: 18, y: 21 }, { t: 0.42, x: SPOT[0] - 2, y: -8, ease: "inOut" }, { t: 0.48, x: SPOT[0] - 2, y: -10 }];
    return [
      hookahUp(0, 0.08), hookahDown(0.08, 0.7), hookahUp(0.7, 1),
      rest(0, 0.08),
      { sprite: "dragonFlyClaw", keys: fly },
      { sprite: "dragonFly", keys: [{ t: 0.48, x: SPOT[0] - 2, y: -10 }, { t: 0.57, x: -8, y: 30, ease: "in" }, { t: 0.7, x: DRAGON[0], y: DRAGON[1], arc: 16 }] },
      rest(0.7, 1),
      // The file rides in the claw and is set down with great care.
      ...glittery([{ t: 0, x: FILE[0], y: FILE[1] }, { t: 0.27, x: FILE[0], y: FILE[1] }, ...shift(fly.slice(3), 2, 42), { t: 0.5, x: SPOT[0], y: SPOT[1] - 2 }, { t: 0.54, x: SPOT[0], y: SPOT[1], ease: "out" }, { t: 0.9, x: SPOT[0], y: SPOT[1] }, { t: 0.96, x: SPOT[0], y: SPOT[1], alpha: 0 }]),
      heroHolds(0.27),
      // The adventurer gives chase and gets bowled over onto the pile.
      { sprite: "@hero.walk", fps: 8, keys: [{ t: 0.27, x: HX, y: HY }, ...hops(0.29, 0.56, [HX, HY], [HX + 18, HY], 5, 1)] },
      { sprite: "@hero.spin", fps: 14, keys: [{ t: 0.56, x: HX + 16, y: HY - 2 }, { t: 0.74, x: PILE[0] + 6, y: PILE[1] + 4, arc: 56 }, { t: 0.77, x: PILE[0] + 6, y: PILE[1] + 6, alpha: 0 }] },
      ...princessReacts("blow", 0.46, 0.72),
      arrive(),
      say("CAREFULLY FILED IN {dest}", "#ffffff", 0.42),
    ];
  })(),
};

const ARK_EDGE = [ARK[0] - 18, HY];
const arkOpened = {
  duration: 3000,
  sounds: [{ sfx: "dragonFlap", at: 0.05 }, { sfx: "dragonFlap", at: 0.25 }, { sfx: "dragonTwinkle", at: 0.44 }, { sfx: "dragonClank", at: 0.3 }, { sfx: "dragonZap", at: 0.54 }, { sfx: "dragonCrumble", at: 0.66 }, { sfx: "dragonBones", at: 0.72 }, { sfx: "dragonFanfare", at: 0.82 }],
  tracks: (() => {
    const whelp = [{ t: 0.04, x: W, y: 6 }, { t: 0.2, x: FILE[0], y: FILE[1] - 10, arc: -10 }, { t: 0.24, x: FILE[0], y: FILE[1] - 9 }, { t: 0.42, x: SPOT[0], y: SPOT[1] - 10, ease: "inOut", arc: 10 }, { t: 0.46, x: SPOT[0], y: SPOT[1] - 10 }];
    return [
      hookahUp(0, 1),
      rest(0, 1),
      // A dragon whelp swoops in and couriers the file to the sorted piles.
      { sprite: "whelp", fps: 10, keys: [...whelp, { t: 0.62, x: -20, y: -12, ease: "in" }] },
      ...glittery([{ t: 0, x: FILE[0], y: FILE[1] }, { t: 0.24, x: FILE[0], y: FILE[1] }, ...shift(whelp.slice(3), 0, 9), { t: 0.5, x: SPOT[0], y: SPOT[1], ease: "in" }, { t: 0.9, x: SPOT[0], y: SPOT[1] }, { t: 0.96, x: SPOT[0], y: SPOT[1], alpha: 0 }]),
      // Meanwhile the adventurer goes treasure hunting... and opens the Ark.
      heroHolds(0.24),
      { sprite: "@hero.walk", fps: 8, keys: [{ t: 0.24, x: HX, y: HY }, ...hops(0.26, 0.5, [HX, HY], ARK_EDGE, 8, 1)] },
      at2("@hero.walk", 0.5, 0.6, ARK_EDGE),
      { sprite: "arkGlow", fps: 8, keys: [{ t: 0.5, x: ARK[0] - 4, y: ARK[1] - 30, alpha: 0 }, { t: 0.54, x: ARK[0] - 4, y: ARK[1] - 30 }, { t: 0.7, x: ARK[0] - 4, y: ARK[1] - 30 }, { t: 0.76, x: ARK[0] - 4, y: ARK[1] - 30, alpha: 0 }] },
      at2("@hero.char", 0.6, 0.64, ARK_EDGE),
      at2("skeleton", 0.64, 0.7, ARK_EDGE),
      toPile(0.7, 0.8, ARK_EDGE, "bones", 20),
      ...princessReacts("cheer", 0.62, 0.86),
      arrive(0.82),
      say("FILED IN {dest}", "#ffffff", 0.4, 0.6),
      say("NEVER OPEN THE ARK!", "#c8f0ff", 0.6),
    ];
  })(),
};

// --- rename ---

const TAG = [36, 40];
const TAG_FILE = [56, 22];
const branded = {
  duration: 3000,
  sounds: [{ sfx: "dragonTwinkle", at: 0.06 }, { sfx: "dragonFlame", at: 0.18 }, { sfx: "dragonSizzle", at: 0.24 }, { sfx: "dragonSizzle", at: 0.34 }, { sfx: "dragonFlame", at: 0.5 }, { sfx: "dragonKiss", at: 0.66 }, { sfx: "dragonCrumble", at: 0.7 }, { sfx: "dragonBones", at: 0.78 }, { sfx: "dragonFanfare", at: 0.84 }],
  tracks: [
    hookahUp(0, 0.12), hookahDown(0.12, 0.62), hookahUp(0.62, 1),
    rest(0, 0.14), at2("dragonOpen", 0.14, 0.6, DRAGON), rest(0.6, 1),
    // The file floats up to the dragon...
    ...glittery([{ t: 0, x: FILE[0], y: FILE[1] }, { t: 0.06, x: FILE[0], y: FILE[1] }, { t: 0.16, x: TAG_FILE[0], y: TAG_FILE[1], ease: "out", arc: 8 }, { t: 0.66, x: TAG_FILE[0], y: TAG_FILE[1] }, { t: 0.72, x: TAG_FILE[0], y: TAG_FILE[1] - 6, alpha: 0 }]),
    // ...and its new name is branded onto a gold tag with a fine jet of fire.
    { sprite: "tag", fps: 0, keys: [{ t: 0.16, x: TAG[0], y: TAG[1], alpha: 0 }, { t: 0.2, x: TAG[0], y: TAG[1] }, { t: 0.66, x: TAG[0], y: TAG[1] }, { t: 0.72, x: TAG[0], y: TAG[1] - 6, alpha: 0 }] },
    { sprite: "fireJet", fps: 12, keys: [{ t: 0.18, x: 46, y: 27, alpha: 0 }, { t: 0.2, x: 46, y: 27 }, { t: 0.4, x: 46, y: 27 }, { t: 0.42, x: 46, y: 27, alpha: 0 }] },
    { text: "{newName}", color: "#5a2a08", shadow: GOLD.hi, clip: [TAG[0] + 4, TAG[1] + 2, 48, 7], keys: [{ t: 0.22, x: TAG[0] + 54, y: TAG[1] + 3 }, { t: 0.4, x: TAG[0] + 5, y: TAG[1] + 3 }, { t: 0.66, x: TAG[0] + 5, y: TAG[1] + 3 }, { t: 0.72, x: TAG[0] + 5, y: TAG[1] - 3, alpha: 0 }] },
    // The adventurer, standing too close, is next.
    heroHolds(0.06),
    at2("@hero.walk", 0.06, 0.52, HERO),
    { sprite: "fire", fps: 12, keys: [{ t: 0.48, x: FIRE_AT[0], y: FIRE_AT[1], alpha: 0 }, { t: 0.5, x: FIRE_AT[0], y: FIRE_AT[1] }, { t: 0.58, x: FIRE_AT[0], y: FIRE_AT[1] }, { t: 0.6, x: FIRE_AT[0], y: FIRE_AT[1], alpha: 0 }] },
    at2("@hero.char", 0.52, 0.68, HERO),
    { sprite: "ash", fps: 4, keys: fadeOut(hold(0.68, 0.84, HX - 1, 88), 0.88) },
    toPile(0.72, 0.84, [HX, 82], "skull", 44),
    ...princessReacts("kiss", 0.62, 0.86),
    arrive(0.84),
    say("FIRE-BRANDED: {newName}", "#ffb040", 0.24),
  ],
};

const SCROLL = [22, 46];
const quilled = {
  duration: 3000,
  sounds: [{ sfx: "dragonPatter", at: 0.04 }, { sfx: "dragonQuill", at: 0.26 }, { sfx: "dragonQuill", at: 0.34 }, { sfx: "dragonQuill", at: 0.42 }, { sfx: "dragonPetrify", at: 0.6 }, { sfx: "dragonCrumble", at: 0.74 }, { sfx: "dragonBones", at: 0.78 }, { sfx: "dragonFanfare", at: 0.82 }, { sfx: "dragonClap", at: 0.88 }],
  tracks: [
    hookahUp(0, 1),
    rest(0, 0.1), at2("dragonSmile", 0.1, 1, DRAGON),
    // The princess comes down with her quill and writes the new name on a scroll.
    { sprite: "princessWalk", fps: 6, keys: [{ t: 0, x: PRINCESS[0], y: PRINCESS[1] }, ...hops(0.02, 0.2, PRINCESS, [40, HY], 6, 3)] },
    at2("princessBlow", 0.2, 0.5, [40, HY]),
    { sprite: "princessWalkR", fps: 6, keys: [{ t: 0.56, x: 40, y: HY }, ...hops(0.56, 0.8, [40, HY], PRINCESS, 7, 3)] },
    at2("princessClap", 0.8, 1, PRINCESS, { fps: 8 }),
    { sprite: "scroll", keys: [{ t: 0.18, x: SCROLL[0], y: SCROLL[1], alpha: 0 }, { t: 0.22, x: SCROLL[0], y: SCROLL[1] }] },
    { sprite: "scrollOpen", keys: [{ t: 0.22, x: SCROLL[0], y: SCROLL[1] }, { t: 0.56, x: SCROLL[0], y: SCROLL[1] }] },
    { sprite: "quill", fps: 8, keys: [{ t: 0.22, x: SCROLL[0] + 2, y: SCROLL[1] - 8 }, { t: 0.48, x: SCROLL[0] + 50, y: SCROLL[1] - 8 }, { t: 0.52, x: SCROLL[0] + 54, y: SCROLL[1] - 16, alpha: 0 }] },
    { text: "{newName}", color: "#3a1a40", shadow: false, clip: [SCROLL[0] + 4, SCROLL[1] + 3, 54, 7], keys: [{ t: 0.24, x: SCROLL[0] + 4, y: SCROLL[1] + 4, alpha: 0 }, { t: 0.46, x: SCROLL[0] + 4, y: SCROLL[1] + 4 }, { t: 0.72, x: SCROLL[0] + 4, y: SCROLL[1] + 4 }, { t: 0.76, x: SCROLL[0] + 4, y: SCROLL[1] + 4, alpha: 0 }] },
    // The adventurer reads it: a cursed scroll! Turned to stone, then rubble.
    at2("scrollCursed", 0.56, 0.76, SCROLL),
    { sprite: "curse", fps: 10, keys: hold(0.58, 0.72, HX - 3, HY - 2) },
    heroHolds(0.2),
    at2("@hero.walk", 0.2, 0.6, HERO),
    at2("@hero.stone", 0.6, 0.74, HERO),
    { sprite: "rubble", keys: fadeOut(hold(0.74, 0.86, HX - 1, 93), 0.9) },
    toPile(0.76, 0.86, [HX, 84], "skull", 40),
    ...glittery([{ t: 0, x: FILE[0], y: FILE[1] }, { t: 0.2, x: FILE[0], y: FILE[1] }, { t: 0.26, x: 64, y: 84, ease: "out" }, { t: 0.86, x: 64, y: 84 }, { t: 0.92, x: 64, y: 84, alpha: 0 }]),
    arrive(0.82),
    say("RENAMED: {newName}", "#ffffff", 0.3),
  ],
};

const grailed = {
  duration: 3000,
  sounds: [{ sfx: "dragonBubble", at: 0.03 }, { sfx: "dragonPuff", at: 0.1 }, { sfx: "dragonGild", at: 0.3 }, { sfx: "dragonSlurp", at: 0.42 }, { sfx: "dragonCrumble", at: 0.6 }, { sfx: "dragonHearts", at: 0.62 }, { sfx: "dragonBones", at: 0.72 }, { sfx: "dragonFanfare", at: 0.84 }],
  tracks: [
    hookahUp(0, 1),
    rest(0, 0.06), at2("dragonPuff", 0.06, 0.3, DRAGON), rest(0.3, 1),
    // The adventurer sets the file down; a smoke ring settles round it, and
    // the new name drifts up in smoke.
    heroHolds(0.12),
    ...glittery([{ t: 0, x: FILE[0], y: FILE[1] }, { t: 0.08, x: FILE[0], y: FILE[1] }, { t: 0.16, x: 44, y: 84, ease: "out" }, { t: 0.82, x: 44, y: 84 }, { t: 0.88, x: 44, y: 84, alpha: 0 }]),
    { sprite: "ring", fps: 6, keys: [{ t: 0.1, x: MOUTH[0] - 14, y: MOUTH[1] - 8, scale: 0.4, alpha: 0 }, { t: 0.14, x: MOUTH[0] - 18, y: MOUTH[1] - 8, scale: 0.5 }, { t: 0.32, x: 41, y: 80, scale: 1, arc: -8 }, { t: 0.6, x: 41, y: 86 }, { t: 0.66, x: 41, y: 88, alpha: 0 }] },
    { text: "{newName}", color: "#e8e0f0", shadow: "#5a4a6a", align: "center", keys: [{ t: 0.3, x: 52, y: 72, alpha: 0 }, { t: 0.36, x: 52, y: 70 }, { t: 0.7, x: 52, y: 64 }, { t: 0.76, x: 52, y: 62, alpha: 0 }] },
    // Then they spot a grail and drink... it was the wrong one.
    { sprite: "grailDrink", keys: [{ t: 0.22, x: GRAIL[0], y: GRAIL[1] }, { t: 0.32, x: HX + 12, y: HY + 6, arc: 10 }, { t: 0.4, x: HX + 9, y: HY + 1 }, { t: 0.5, x: HX + 9, y: HY + 1 }, { t: 0.58, x: HX + 14, y: 90, ease: "in" }, { t: 0.66, x: HX + 14, y: 90, alpha: 0 }] },
    at2("@hero.walk", 0.12, 0.48, HERO),
    at2("@hero.old", 0.48, 0.6, HERO),
    at2("skeleton", 0.6, 0.7, HERO),
    { sprite: "dust", fps: 8, once: true, keys: hold(0.66, 0.78, HX - 10, 88) },
    toPile(0.7, 0.82, [HX, 80]),
    ...princessReacts("cheer", 0.6, 0.86),
    arrive(0.84),
    say("RENAMED: {newName}", "#ffffff", 0.3),
    say("CHOSE POORLY", "#c8a0ff", 0.58, 0.86, 10),
  ],
};

const EVERY = ["keep", "move", "rename", "trash", "delete"];

/**
 * Draw order: the hookah, then the dragon, then everything else, then the
 * princess (who sits in front of him), then captions on top.
 */
const LAYER = (t) => (t.text !== undefined ? 4 : /^hookah/.test(t.sprite) ? 0 : /^dragon/.test(t.sprite) ? 1 : /^(princess|heart)/.test(t.sprite) ? 3 : 2);
const layered = (a) => ({ ...a, tracks: a.tracks.map((t, i) => [t, i]).sort((x, y) => LAYER(x[0]) - LAYER(y[0]) || x[1] - y[1]).map(([t]) => t) });

export const manifest = {
  format: 1,
  id: "dragon-hoard",
  name: "Dragon Hoard",
  sheet: "sheet.png",
  size: [W, H],
  music: "dragon-hoard",
  cast: { hero: { members: MEMBERS } },
  scene: [
    { sprite: "hoard", x: 0, y: 0 },
    { sprite: "torch", x: TORCHES[0][0], y: TORCHES[0][1] - 2, fps: 4 },
    { sprite: "torchB", x: TORCHES[1][0], y: TORCHES[1][1] - 2, fps: 4 },
    { sprite: "twinkles", x: 50, y: 50, fps: 3 },
    { sprite: "pile0", x: PILE[0], y: PILE[1], tally: { on: EVERY, sprites: Array.from({ length: 16 }, (_, k) => `pile${k + 1}`) } },
    { sprite: "hookah", x: HOOKAH[0], y: HOOKAH[1], fps: 4, idle: true },
    { sprite: "dragonIdle", x: DRAGON[0], y: DRAGON[1], fps: 1, idle: true },
    { sprite: "fireIdle", x: FIRE_UP_AT[0], y: FIRE_UP_AT[1], fps: 2, idle: true },
    { sprite: "rings", x: MOUTH[0] - 16, y: MOUTH[1] - 38, fps: 4, idle: true },
    { sprite: "princess", x: PRINCESS[0], y: PRINCESS[1], fps: 1, idle: true },
    { sprite: "heartsIdle", x: PRINCESS[0] - 2, y: PRINCESS[1] - 20, fps: 2, idle: true },
    { sprite: "@hero.hold", x: HX, y: HY, idle: true },
    { sprite: "glitter", x: FILE[0] - 4, y: FILE[1] - 4, fps: 4, idle: true },
  ],
  file: FILE,
  animations: {
    keep: layered(kept),
    move: layered(smitten),
    rename: layered(branded),
    trash: layered(stomped),
    delete: layered(devoured),
  },
  variants: {
    keep: [gilded, mimicked, buried].map(layered),
    move: [placed, arkOpened].map(layered),
    rename: [quilled, grailed].map(layered),
    trash: [burned, eaten, swatted].map(layered),
  },
};
