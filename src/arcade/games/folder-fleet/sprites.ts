// Folder Fleet's pixel art, all original and drawn in code: small character
// grids (one character per pixel, "." is clear) built by hand or with a few
// shape helpers, painted once to offscreen canvases and reused every frame.
// Without a 2D context (tests run in jsdom) makeArt() returns null and the
// renderer falls back to plain rectangles.

import { drawText, normalize, textWidth } from "../../../pixel/font";
import { seeded } from "../../round";
import type { Ability, Perk } from "../../types";
import { H, MAX_RING_R, W } from "./logic";

export type Img = HTMLCanvasElement;

export const C = {
  bg: "#07040f",
  cyan: "#4de1ff",
  pink: "#ff4dd2",
  yellow: "#ffd23f",
  green: "#6bff8f",
  red: "#ff4d6d",
  lilac: "#a493c4",
  ink: "#f4ecff",
  orange: "#ff9a3c",
  gold: "#ffd23f",
  goldDk: "#a8741a",
  window: "#120a22",
  panel: "#1a1030",
  dim: "#3a2f5c",
} as const;

/** Hull colors per ability: main, dark, highlight. */
const HULL: Record<Ability, [string, string, string]> = {
  basic: [C.lilac, "#4b3f6b", C.ink],
  fast: [C.red, "#7a1f3d", "#ffd0d8"],
  shield: ["#5b8cff", "#24346e", "#bfe9ff"],
  sonic: [C.green, "#1f6e45", "#e0ffe8"],
  teleport: [C.cyan, "#1d5f78", "#e8fbff"],
  flash: [C.pink, "#6e1f66", "#ffd6f6"],
  split: [C.orange, "#7a4012", "#ffe2b8"],
  tank: ["#8f93b5", "#3e4160", "#e4e6f5"],
};

export const PERK_COLOR: Record<Perk, string> = {
  health: C.red, armor: C.cyan, ally: C.lilac, rapid: C.yellow, spread: C.pink, ammo: C.orange, power: C.green, points: C.ink,
};

/** A one-letter tag drawn over each capsule. */
export const PERK_TAG: Record<Perk, string> = {
  health: "+", armor: "A", ally: "D", rapid: "R", spread: "S", ammo: "M", power: "L", points: "P",
};

// ---------- character grids ----------

type Grid = string[][];

const grid = (w: number, h: number): Grid => Array.from({ length: h }, () => Array<string>(w).fill("."));
const rowsOf = (g: Grid) => g.map((r) => r.join(""));

function fill(g: Grid, x: number, y: number, w: number, h: number, ch: string) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (g[j] && i >= 0 && i < g[j].length) g[j][i] = ch;
}

/** A filled ellipse; centers and radii can be halves. */
function oval(g: Grid, cx: number, cy: number, rx: number, ry: number, ch: string) {
  for (let j = 0; j < g.length; j++)
    for (let i = 0; i < g[j].length; i++) {
      const dx = (i + 0.5 - cx) / rx;
      const dy = (j + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) g[j][i] = ch;
    }
}

/** Grow by n clear pixels on every side (room for an outline). */
function pad(rows: string[], n: number): string[] {
  const w = rows[0].length + n * 2;
  const blank = ".".repeat(w);
  return [...Array(n).fill(blank), ...rows.map((r) => ".".repeat(n) + r + ".".repeat(n)), ...Array(n).fill(blank)];
}

/** Clear pixels touching a filled one become `ch`: a 1px outline. */
function outline(rows: string[], ch: string): string[] {
  const at = (x: number, y: number) => (rows[y]?.[x] ?? ".") !== ".";
  return rows.map((r, y) => [...r].map((c, x) => (c === "." && (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) ? ch : c)).join(""));
}

/** Every filled pixel becomes `ch` (a white hit flash). */
const solid = (rows: string[], ch: string) => rows.map((r) => r.replace(/[^.]/g, ch));

// ---------- painting ----------

/** An offscreen canvas and its context, or null when there's no 2D canvas. */
function surface(w: number, h: number): { c: Img; g: CanvasRenderingContext2D } | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  let g: CanvasRenderingContext2D | null = null;
  try {
    g = c.getContext("2d");
  } catch {
    g = null;
  }
  if (!g) return null;
  g.imageSmoothingEnabled = false;
  return { c, g };
}

/** Paint a grid; runs of one color are drawn as one rect. */
function paint(rows: string[], colors: Record<string, string>): Img | null {
  const s = surface(rows[0].length, rows.length);
  if (!s) return null;
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let n = 1;
      while (row[x + n] === ch) n++;
      const col = colors[ch];
      if (col) {
        s.g.fillStyle = col;
        s.g.fillRect(x, y, n, 1);
      }
      x += n;
    }
  });
  return s.c;
}

// ---------- hulls (enemy ships face left; "w" is the window the file icon sits in) ----------

function hullGrid(ability: Ability): Grid {
  switch (ability) {
    case "basic": {
      const g = grid(22, 14);
      oval(g, 11, 7, 11, 7, "a");
      oval(g, 11, 7, 9.6, 5.8, "b");
      fill(g, 7, 2, 10, 10, "w");
      fill(g, 0, 6, 2, 2, "c");
      fill(g, 20, 5, 2, 4, "e");
      fill(g, 10, 0, 2, 1, "c");
      fill(g, 10, 13, 2, 1, "c");
      return g;
    }
    case "fast": {
      // a dart: long spike nose, fins swept back
      const g = grid(24, 14);
      fill(g, 8, 1, 13, 12, "a");
      fill(g, 9, 2, 11, 10, "b");
      for (let x = 0; x < 9; x++) {
        const half = Math.floor(x / 2);
        fill(g, x, 6 - half, 1, 2 + half * 2, x < 4 ? "c" : "a");
      }
      fill(g, 15, 0, 8, 1, "a");
      fill(g, 20, 1, 4, 1, "a");
      fill(g, 15, 13, 8, 1, "a");
      fill(g, 20, 12, 4, 1, "a");
      fill(g, 21, 5, 3, 4, "e");
      fill(g, 9, 2, 10, 10, "w");
      return g;
    }
    case "shield": {
      // a boxy hull behind a big front plate
      const g = grid(22, 14);
      fill(g, 6, 1, 14, 12, "a");
      fill(g, 7, 2, 12, 10, "b");
      fill(g, 1, 0, 5, 14, "c");
      fill(g, 2, 1, 3, 12, "a");
      fill(g, 3, 3, 1, 8, "b");
      fill(g, 20, 5, 2, 4, "e");
      fill(g, 8, 2, 10, 10, "w");
      return g;
    }
    case "sonic": {
      // a speaker cone up front
      const g = grid(22, 14);
      oval(g, 14, 7, 8, 7, "a");
      oval(g, 14, 7, 6.8, 5.8, "b");
      fill(g, 0, 1, 1, 12, "c");
      fill(g, 1, 2, 1, 10, "a");
      fill(g, 2, 3, 1, 8, "b");
      fill(g, 3, 3, 1, 8, "c");
      fill(g, 4, 4, 1, 6, "b");
      fill(g, 5, 5, 4, 4, "a");
      fill(g, 21, 5, 1, 4, "e");
      fill(g, 9, 2, 10, 10, "w");
      return g;
    }
    case "teleport": {
      // a diamond with antenna tips
      const g = grid(22, 14);
      for (let y = 0; y < 14; y++) {
        const d = Math.abs(y + 0.5 - 7);
        const half = 11 - d * 1.45;
        fill(g, Math.round(11 - half), y, Math.round(half * 2), 1, "a");
        if (half > 2.5) fill(g, Math.round(12.5 - half), y, Math.round(half * 2 - 3), 1, "b");
      }
      fill(g, 6, 2, 10, 10, "w");
      fill(g, 0, 6, 1, 2, "c");
      fill(g, 21, 6, 1, 2, "c");
      fill(g, 10, 0, 2, 1, "c");
      fill(g, 10, 13, 2, 1, "c");
      return g;
    }
    case "flash": {
      // a ghost: round front, wavy trailing edge
      const g = grid(22, 14);
      oval(g, 8, 7, 8, 7, "a");
      fill(g, 8, 0, 10, 14, "a");
      oval(g, 8, 7, 6.8, 5.8, "b");
      fill(g, 8, 1, 9, 12, "b");
      for (let y = 0; y < 14; y++) fill(g, 18, y, y % 4 < 2 ? 4 : 1, 1, "a");
      fill(g, 6, 2, 10, 10, "w");
      fill(g, 1, 4, 1, 1, "c");
      fill(g, 2, 9, 1, 1, "c");
      return g;
    }
    case "split": {
      // two halves zipped together
      const g = grid(22, 14);
      oval(g, 11, 7, 11, 7, "a");
      oval(g, 11, 7, 9.6, 5.8, "b");
      fill(g, 0, 6, 22, 2, ".");
      for (let x = 1; x < 22; x += 2) fill(g, x, 6, 1, 1, "c");
      for (let x = 2; x < 22; x += 2) fill(g, x, 7, 1, 1, "c");
      fill(g, 7, 2, 10, 10, "w");
      fill(g, 20, 3, 2, 2, "e");
      fill(g, 20, 9, 2, 2, "e");
      return g;
    }
    case "tank": {
      // armored, a cannon up front, hazard stripes
      const g = grid(28, 18);
      fill(g, 4, 2, 22, 14, "a");
      fill(g, 5, 3, 20, 12, "b");
      for (let x = 4; x < 24; x++) {
        const ch = (x >> 1) % 2 ? "y" : "k";
        fill(g, x, 0, 1, 2, ch);
        fill(g, x, 16, 1, 2, ch);
      }
      fill(g, 0, 8, 5, 2, "c");
      fill(g, 0, 7, 2, 4, "a");
      for (const [x, y] of [[6, 4], [6, 13], [22, 4], [22, 13]]) fill(g, x, y, 1, 1, "c");
      fill(g, 26, 6, 2, 6, "e");
      fill(g, 9, 4, 10, 10, "w");
      return g;
    }
  }
}

function miniGrid(): Grid {
  const g = grid(12, 10);
  oval(g, 6.5, 5, 6.5, 5, "a");
  fill(g, 3, 1, 8, 8, "w");
  fill(g, 0, 4, 1, 2, "c");
  fill(g, 11, 4, 1, 2, "e");
  return g;
}

function bossGrid(): Grid {
  const g = grid(48, 36);
  // swept fins top and bottom
  for (let y = 0; y < 8; y++) {
    fill(g, 26 - y, y, 16 + y, 1, "a");
    fill(g, 26 - y, 35 - y, 16 + y, 1, "a");
  }
  oval(g, 25, 18, 22, 13, "a");
  oval(g, 25, 18, 20.5, 11.5, "b");
  // front prongs
  fill(g, 0, 7, 14, 4, "a");
  fill(g, 0, 25, 14, 4, "a");
  fill(g, 0, 7, 2, 4, "c");
  fill(g, 0, 25, 2, 4, "c");
  fill(g, 3, 8, 9, 2, "x");
  fill(g, 3, 26, 9, 2, "x");
  // ability stripes and engines
  fill(g, 36, 10, 6, 2, "x");
  fill(g, 36, 24, 6, 2, "x");
  fill(g, 6, 17, 6, 2, "x");
  fill(g, 44, 13, 4, 4, "e");
  fill(g, 44, 19, 4, 4, "e");
  // window frame and window (a 2x icon goes in it)
  fill(g, 15, 8, 20, 20, "c");
  fill(g, 16, 9, 18, 18, "w");
  return g;
}

export interface HullArt {
  normal: Img | null;
  elite: Img | null;
  white: Img | null;
  /** The boss's hit flash: the hull lights up, the window and icon stay. */
  lit: Img | null;
  litElite: Img | null;
  /** Where the icon goes, from the sprite's top left, and how big. */
  ix: number;
  iy: number;
  iconScale: number;
  w: number;
  h: number;
}

function hullArt(g: Grid, colors: Record<string, string>, iconScale: number, frame: number, litColors?: Record<string, string>): HullArt {
  const rows = pad(rowsOf(g), 1);
  // the window's first pixel tells where the icon goes
  let ix = 0;
  let iy = 0;
  find: for (let y = 0; y < rows.length; y++)
    for (let x = 0; x < rows[y].length; x++)
      if (rows[y][x] === "w") {
        ix = x + frame;
        iy = y + frame;
        break find;
      }
  const lit = litColors ? { ...colors, ...litColors } : null;
  return {
    normal: paint(rows, colors),
    // elites get gold trim: an outline plus gold highlights
    elite: paint(outline(rows, "G"), { ...colors, c: C.gold, G: C.gold }),
    white: lit ? null : paint(solid(rows, "W"), { W: "#ffffff" }),
    lit: lit && paint(rows, lit),
    litElite: lit && paint(outline(rows, "G"), { ...lit, c: C.gold, G: C.gold }),
    ix,
    iy,
    iconScale,
    w: rows[0].length,
    h: rows.length,
  };
}

// ---------- the player and small things ----------

const PLAYER = [
  "..cc..............",
  "..cbc.............",
  "..cbbc............",
  ".ccbbbcccc........",
  "dcbbbbbbbbccc.....",
  "dcbbbiiyybbbbcccci",
  "dcbbbbbbbbccc.....",
  ".ccbbbcccc........",
  "..cbbc............",
  "..cbc.............",
  "..cc..............",
];
const PLAYER_COLORS = { c: C.cyan, b: "#2b67b8", i: C.ink, y: C.yellow, d: "#7a5cff" };

const LIFE = ["cc.....", "cbbcc..", "cbbbbcc", "cbbcc..", "cc....."];

const DRONE = ["..aaa..", ".abbba.", "abbcbba", "abcccba", "abbcbba", ".abbba.", "..aaa.."];

const SHOT = ["..yyii", "yyyiii", "..yyii"];
const DRONE_SHOT = ["..llii", "llliii", "..llii"];
const MISSILE = ["....aa.", "eebbbbr", "....aa."];
const BULLET = [".pp.", "pwwp", "pwwp", ".pp."];
const SHELL = [".oo.", "orro", "orro", ".oo."];
const DEBRIS = [["gg..", "ggg.", ".gaa", "..a."], [".gg.", "gaag", ".gg.", "..g."]];

function capsuleGrid(): string[] {
  const g = grid(12, 10);
  fill(g, 1, 0, 10, 10, "a");
  fill(g, 0, 1, 12, 8, "a");
  fill(g, 2, 1, 8, 8, "w");
  fill(g, 1, 1, 1, 2, "c");
  return pad(rowsOf(g), 1);
}

function ringRows(r: number): string[] {
  const n = r * 2 + 3;
  const g = grid(n, n);
  const c = n / 2;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(i + 0.5 - c, j + 0.5 - c);
      if (Math.abs(d - r) < 0.6) g[j][i] = (i + j) % 2 ? "a" : "c";
      else if (r > 5 && Math.abs(d - (r - 2.5)) < 0.5 && i + 0.5 < c) g[j][i] = "b";
    }
  return rowsOf(g);
}

function boomFrame(k: number, n: number, size: number): string[] {
  const g = grid(size, size);
  const c = size / 2;
  const R = size / 2 - 1;
  const r = 2 + (k / (n - 1)) * (R - 2);
  if (k < n - 2) {
    oval(g, c, c, r, r, "r");
    oval(g, c, c, r * 0.72, r * 0.72, "y");
    if (k < n / 2) oval(g, c, c, r * 0.38, r * 0.38, "i");
  } else {
    for (let j = 0; j < size; j++)
      for (let i = 0; i < size; i++) if (Math.abs(Math.hypot(i + 0.5 - c, j + 0.5 - c) - r) < 0.7 && (i + j) % 2 === 0) g[j][i] = "r";
  }
  return rowsOf(g);
}

// ---------- the starfield ----------

function starLayer(seed: number, count: number, colors: string[], opaque: boolean, streak: number): Img | null {
  const s = surface(W, H);
  if (!s) return null;
  const rnd = seeded(seed);
  if (opaque) {
    s.g.fillStyle = C.bg;
    s.g.fillRect(0, 0, W, H);
    // a few faint nebulae, ordered-dithered so they fade out at the edges
    const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    for (let k = 0; k < 3; k++) {
      const cx = rnd() * W;
      const cy = 30 + rnd() * (H - 60);
      const rx = 34 + rnd() * 40;
      const ry = 16 + rnd() * 18;
      s.g.fillStyle = k % 2 ? "#140b26" : "#0d1029";
      for (let y = Math.floor(cy - ry); y < cy + ry; y++)
        for (let x = Math.floor(cx - rx); x < cx + rx; x++) {
          const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
          if (d < 1 && (1 - d) * 22 > bayer[(y & 3) * 4 + (x & 3)] + 4) s.g.fillRect((x + W) % W, y, 1, 1);
        }
    }
  }
  for (let i = 0; i < count; i++) {
    s.g.fillStyle = colors[Math.floor(rnd() * colors.length)];
    s.g.fillRect(Math.floor(rnd() * W), Math.floor(rnd() * H), streak, 1);
  }
  return s.c;
}

// ---------- text ----------

const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,-_:!?'()/&+#@[]";
export const TEXT_COLORS = [C.ink, C.yellow, C.cyan, C.pink, C.green, C.red, C.lilac, C.orange, C.dim] as const;
export type TextColor = (typeof TEXT_COLORS)[number];

/** All glyphs in every HUD color, so a string is one drawImage per letter. */
function glyphAtlas(): Img | null {
  const s = surface(CHARSET.length * 4, TEXT_COLORS.length * 6);
  if (!s) return null;
  TEXT_COLORS.forEach((col, row) => [...CHARSET].forEach((ch, i) => drawText(s.g, ch, i * 4, row * 6, col)));
  return s.c;
}

const GLYPH_INDEX = new Map([...CHARSET].map((ch, i) => [ch, i]));

/** A label with a dark drop shadow, so it reads over stars and ships. */
function labelImg(text: string, color: string, scale: number): Img | null {
  const s = surface((textWidth(text) + 1) * scale, 6 * scale);
  if (!s) return null;
  drawText(s.g, text, scale, scale, C.bg, scale);
  drawText(s.g, text, 0, scale, C.bg, scale);
  drawText(s.g, text, 0, 0, color, scale);
  return s.c;
}

// ---------- everything ----------

export interface Art {
  hulls: Record<Ability, HullArt>;
  minis: Record<Ability, HullArt>;
  boss: HullArt | null;
  player: Img;
  playerWhite: Img | null;
  life: Img | null;
  drone: Img | null;
  shot: Img | null;
  droneShot: Img | null;
  missile: Img | null;
  bullet: Img | null;
  shell: Img | null;
  debris: (Img | null)[];
  capsules: Record<Perk, Img | null>;
  capsuleGlow: Img | null;
  /** Sound rings by radius, made the first time each size is needed. */
  rings: (Img | null | undefined)[];
  boomSmall: (Img | null)[];
  boomBig: (Img | null)[];
  stars: (Img | null)[];
  atlas: Img | null;
  labels: Map<string, Img | null>;
}

/** All the art, or null when there's no 2D canvas (tests). */
export function makeArt(): Art | null {
  const player = paint(PLAYER, PLAYER_COLORS);
  if (!player) return null;
  const abilities: Ability[] = ["basic", "fast", "shield", "sonic", "teleport", "flash", "split", "tank"];
  const colorsFor = (a: Ability) => {
    const [m, d, l] = HULL[a];
    return { a: m, b: d, c: l, w: C.window, e: C.yellow, y: C.yellow, k: "#2a2438" };
  };
  const hulls = {} as Record<Ability, HullArt>;
  const minis = {} as Record<Ability, HullArt>;
  for (const a of abilities) {
    hulls[a] = hullArt(hullGrid(a), colorsFor(a), 1, 1);
    minis[a] = hullArt(miniGrid(), colorsFor(a), 1, 0);
  }
  const perks: Perk[] = ["health", "armor", "ally", "rapid", "spread", "ammo", "power", "points"];
  const capsules = {} as Record<Perk, Img | null>;
  const cap = capsuleGrid();
  for (const p of perks) capsules[p] = paint(cap, { a: PERK_COLOR[p], w: C.window, c: C.ink });
  return {
    hulls,
    minis,
    boss: null,
    player,
    playerWhite: paint(solid(PLAYER, "W"), { W: "#ffffff" }),
    life: paint(LIFE, { c: C.cyan, b: "#2b67b8" }),
    drone: paint(DRONE, { a: C.lilac, b: "#4b3f6b", c: C.ink }),
    shot: paint(SHOT, { y: C.yellow, i: C.ink }),
    droneShot: paint(DRONE_SHOT, { l: C.lilac, i: C.ink }),
    missile: paint(MISSILE, { a: "#8f93b5", b: "#d8dcf0", e: C.orange, r: C.red }),
    bullet: paint(BULLET, { p: C.pink, w: C.ink }),
    shell: paint(SHELL, { o: C.orange, r: C.red }),
    debris: DEBRIS.map((d) => paint(d, { g: "#8f93b5", a: C.orange })),
    capsules,
    capsuleGlow: paint(outline(cap, "o").map((r) => r.replace(/[^o]/g, ".")), { o: C.ink }),
    rings: [],
    boomSmall: Array.from({ length: 5 }, (_, k) => paint(boomFrame(k, 5, 16), { r: C.red, y: C.yellow, i: C.ink })),
    boomBig: Array.from({ length: 8 }, (_, k) => paint(boomFrame(k, 8, 36), { r: C.red, y: C.orange, i: C.yellow })),
    stars: [
      starLayer(11, 90, ["#2c2550", "#3a3266", "#4a3f7a"], true, 1),
      starLayer(23, 50, [C.lilac, "#7a6aa8", "#5a8aa8"], false, 1),
      starLayer(37, 22, [C.ink, C.cyan, "#ffe9a8"], false, 2),
    ],
    atlas: glyphAtlas(),
    labels: new Map(),
  };
}

/** The boss sprite, made once for the round's boss (its ability sets the stripes). */
export function bossArt(art: Art, ability: Ability): HullArt {
  if (!art.boss) {
    const colors = { a: "#4a3a78", b: "#22173f", c: C.ink, x: HULL[ability][0], e: C.yellow, w: C.window };
    art.boss = hullArt(bossGrid(), colors, 2, 1, { a: "#a48cf0", b: "#5c45a0", x: HULL[ability][2], e: "#ffffff" });
  }
  return art.boss;
}

/** A sound ring of radius r (3..MAX_RING_R). */
export function ringArt(art: Art, r: number): Img | null {
  const k = Math.max(3, Math.min(MAX_RING_R, Math.round(r)));
  let img = art.rings[k];
  if (img === undefined) {
    img = paint(ringRows(k), { a: C.green, c: "#e0ffe8", b: "#1f6e45" });
    art.rings[k] = img;
  }
  return img;
}

/** A cached label image (scale 1 or more). */
export function label(art: Art, text: string, color: string, scale = 1): Img | null {
  const key = `${color}|${scale}|${text}`;
  let img = art.labels.get(key);
  if (img === undefined) {
    img = labelImg(text, color, scale);
    art.labels.set(key, img);
  }
  return img;
}

/** Draw a string from the glyph atlas: one drawImage per letter. */
export function glyphs(art: Art, g: CanvasRenderingContext2D, s: string, x: number, y: number, color: TextColor): boolean {
  if (!art.atlas) return false;
  const row = TEXT_COLORS.indexOf(color);
  const t = normalize(s);
  for (let i = 0; i < t.length; i++) {
    const at = GLYPH_INDEX.get(t[i]);
    if (at === undefined || at === 36) continue;
    g.drawImage(art.atlas, at * 4, row * 6, 3, 5, x + i * 4, y, 3, 5);
  }
  return true;
}

/** For tests: every hand-drawn grid is rectangular. */
export const _gridsForTest = { PLAYER, LIFE, DRONE, SHOT, DRONE_SHOT, MISSILE, BULLET, SHELL, DEBRIS0: DEBRIS[0], DEBRIS1: DEBRIS[1] };
