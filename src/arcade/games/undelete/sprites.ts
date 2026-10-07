// Original pixel art for Undelete, drawn in code: ASCII rows turned into
// pixel arrays (for the raycaster's textures) and small offscreen canvases
// (for sprites). Nothing here draws to the screen by itself.

import type { Ability, Perk } from "../../types";

// ---------- colors ----------

export const COLORS = {
  bg: "#07040f",
  cyan: "#4de1ff",
  pink: "#ff4dd2",
  yellow: "#ffd23f",
  green: "#6bff8f",
  red: "#ff4d6d",
  lilac: "#a493c4",
  ink: "#f4ecff",
  // a few more of our own
  night: "#120a20",
  plum: "#2b1d45",
  grape: "#5a3f86",
  orange: "#ff9a3c",
};

export const PERK_COLOR: Record<Perk, string> = {
  health: COLORS.green,
  armor: COLORS.cyan,
  ally: COLORS.cyan,
  rapid: COLORS.yellow,
  spread: COLORS.orange,
  ammo: COLORS.lilac,
  power: COLORS.pink,
  points: COLORS.ink,
};

/** Skin and skin shadow per ability, so each kind of zombie reads at a glance. */
const SKIN: Record<Ability, [string, string]> = {
  flash: ["#ff8fe0", "#b8329a"],
  shield: ["#c9b8f0", "#7a65a6"],
  teleport: ["#86ecff", "#2a8fb0"],
  sonic: ["#ffe27a", "#b08612"],
  fast: ["#8cffaa", "#2f9e57"],
  split: ["#ffb26b", "#b0601c"],
  tank: ["#ff8a9c", "#a32640"],
  basic: ["#a8c49a", "#5e7a55"],
};

export const ABILITY_COLOR: Record<Ability, string> = {
  flash: COLORS.pink,
  shield: COLORS.lilac,
  teleport: COLORS.cyan,
  sonic: COLORS.yellow,
  fast: COLORS.green,
  split: COLORS.orange,
  tank: COLORS.red,
  basic: "#a8c49a",
};

// ---------- pixels ----------

export interface Pixels {
  w: number;
  h: number;
  data: Uint32Array;
}

const LITTLE = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

const pack = (r: number, g: number, b: number) =>
  LITTLE ? ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0 : ((r << 24) | (g << 16) | (b << 8) | 255) >>> 0;

/** "#rrggbb" as a pixel for a Uint32Array view of ImageData. */
export function px(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return pack((n >> 16) & 255, (n >> 8) & 255, n & 255);
}

const BG = parseInt(COLORS.bg.slice(1), 16);
const BG_RGB = [(BG >> 16) & 255, (BG >> 8) & 255, BG & 255];

/** A pixel faded toward the background by `m` (1 = unchanged, 0 = background). Transparent stays transparent. */
export function fade(c: number, m: number): number {
  if (!c) return 0;
  const r = LITTLE ? c & 255 : (c >>> 24) & 255;
  const g = LITTLE ? (c >> 8) & 255 : (c >> 16) & 255;
  const b = LITTLE ? (c >> 16) & 255 : (c >> 8) & 255;
  const mix = (v: number, k: number) => Math.round(BG_RGB[k] + (v - BG_RGB[k]) * m);
  return pack(mix(r, 0), mix(g, 1), mix(b, 2));
}

/** ASCII rows to pixels: each character looks up its color; anything not in the palette is transparent. */
export function paint(rows: string[], pal: Record<string, string>): Pixels {
  const w = Math.max(...rows.map((r) => r.length));
  const h = rows.length;
  const data = new Uint32Array(w * h);
  const cache: Record<string, number> = {};
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const hex = pal[row[x]];
      if (hex) data[y * w + x] = cache[row[x]] ??= px(hex);
    }
  });
  return { w, h, data };
}

export const mapPixels = (p: Pixels, f: (c: number) => number): Pixels => ({ w: p.w, h: p.h, data: p.data.map(f) });

/** Left halves made whole: each row followed by itself reversed. */
export const mirror = (rows: string[]) => rows.map((r) => r + [...r].reverse().join(""));

/** `over` drawn on top of `base`, where it isn't ".". */
export function overlay(base: string[], over: (string | null)[]): string[] {
  return base.map((row, y) => {
    const o = over[y];
    if (!o) return row;
    return [...row].map((c, x) => (o[x] && o[x] !== "." ? o[x] : c)).join("");
  });
}

// ---------- offscreen canvases ----------

let noCanvas = false;

/** An offscreen canvas holding these pixels, or null where there's no 2D canvas (tests). */
export function toCanvas(p: Pixels): HTMLCanvasElement | null {
  if (noCanvas || typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = p.w;
  c.height = p.h;
  let g: CanvasRenderingContext2D | null = null;
  try {
    g = c.getContext("2d");
  } catch {
    g = null;
  }
  if (!g) {
    noCanvas = true; // don't keep asking (jsdom logs every attempt)
    return null;
  }
  const img = g.createImageData(p.w, p.h);
  new Uint32Array(img.data.buffer).set(p.data);
  g.putImageData(img, 0, 0);
  return c;
}

/** A canvas you draw into yourself (the 3D view), with its context; null without canvas support. */
export function blankCanvas(w: number, h: number): { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D } | null {
  if (noCanvas || typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  let g: CanvasRenderingContext2D | null = null;
  try {
    g = canvas.getContext("2d");
  } catch {
    g = null;
  }
  if (!g) {
    noCanvas = true;
    return null;
  }
  g.imageSmoothingEnabled = false;
  return { canvas, g };
}

/**
 * Sprites built on first use and kept, looked up by a small number (art
 * variant, fog step...), so drawing a frame makes no keys or closures.
 */
export class Shelf {
  private made: (HTMLCanvasElement | null | undefined)[] = [];
  constructor(private make: (i: number) => Pixels) {}
  get(i: number): HTMLCanvasElement | null {
    let c = this.made[i];
    if (c === undefined) c = this.made[i] = toCanvas(this.make(i));
    return c;
  }
}

// ---------- wall, floor and ceiling textures (16x16 and 8x8) ----------

const BRICK = [
  "hhhhhhh.hhhhhhh.",
  "bbbbbbb.bbbdbbb.",
  "bbbbbbs.bbbbbbs.",
  "................",
  "hhh.hhhhhhh.hhhh",
  "bbb.bbbbbbb.bbbb",
  "bbs.bbbbbbs.bbbb",
  "................",
  "hhhhhhh.hhhhhhh.",
  "bbbdbbb.bbbbbbb.",
  "bbbbbbs.bbbbbbs.",
  "................",
  "hhh.hhhhhhh.hhhh",
  "bbb.bbbbbbb.bdbb",
  "bbs.bbbbbbs.bbbb",
  "................",
];

const PANEL = [
  "dddddddddddddddd",
  "dhhhhhhhdhhhhhhh",
  "dhpppppsdhpppppp",
  "dhprpppsdhprpppp",
  "dhpppppsdhpppppp",
  "dhpppppsdhpppppp",
  "dhcccccsdhcccccc",
  "dhpppppsdhpppppp",
  "dhpppppsdhpppppp",
  "dhpppppsdhpppppp",
  "dhpppppsdhpppppp",
  "dhprpppsdhprpppp",
  "dhpppppsdhpppppp",
  "dhpppppsdhpppppp",
  "dsssssssdsssssss",
  "dddddddddddddddd",
];

const CABINET_DRAWER = [
  "kkkkkkkkkkkkkkkk",
  "khhhhhhhhhhhhhhk",
  "khbbbbbbbbbbbbsk",
  "khbbbbwwwwbbbbsk",
  "khbbbbbbbbbbbbsk",
  "khbbbbbnnbbbbbsk",
  "kssssssssssssssk",
  "kkkkkkkkkkkkkkkk",
];

const CIRCUIT = [
  "bbbbbbbbbbbbbbbb",
  "bggggGbbbbbbGbbb",
  "bbbbbgbbbbbbgbbb",
  "bbbbbgbccccbgbbb",
  "bGggggblcclbgggG",
  "bbbbbbbccccbbbbb",
  "bbbbbbblcclbbbbb",
  "bbGbbbbccccbbGbb",
  "bbgbbbbbbbbbbgbb",
  "bbggggggGbbbbgbb",
  "bbbbbbbbgbbbbgbb",
  "Gggbbbbbgggggggb",
  "bbgbbbbbbbbbbbbb",
  "bbgbbbccccbbbGbb",
  "bbGbbbccccbbbgbb",
  "bbbbbbbbbbbbbgbb",
];

const HAZARD = [
  "kkkkkkkkkkkkkkkk",
  "pp..pp..pp..pp..",
  ".pp..pp..pp..pp.",
  "..pp..pp..pp..pp",
  "kkkkkkkkkkkkkkkk",
  "mmmmmmmmmmmmmmmm",
  "mvvvvvvmmvvvvvvm",
  "mmmmmmmmmmmmmmmm",
  "mvvvvvvmmvvvvvvm",
  "mmmmmmmmmmmmmmmm",
  "mvvvvvvmmvvvvvvm",
  "mmmmmmmmmmmmmmmm",
  "kkkkkkkkkkkkkkkk",
  "pp..pp..pp..pp..",
  ".pp..pp..pp..pp.",
  "kkkkkkkkkkkkkkkk",
];

const FLOOR = [
  "gggggggg",
  "gfffffff",
  "gfffffff",
  "gffFffff",
  "gfffffff",
  "gfffffFf",
  "gfffffff",
  "gfffffff",
];

const CEILING = [
  "kccccccc",
  "kccccccc",
  "kccccccc",
  "kccccccc",
  "kccccccc",
  "kccccccc",
  "kccccccc",
  "kkkkkkkk",
];

const CEILING_LIT = [
  "kccccccc",
  "kcLLLLcc",
  "kcLllLcc",
  "kcLllLcc",
  "kcLllLcc",
  "kcLLLLcc",
  "kccccccc",
  "kkkkkkkk",
];

/** Wall textures by maze cell value (1..5). */
export const WALL_ART: Pixels[] = [
  paint(BRICK, { ".": "#1b1030", h: "#8a74b8", b: "#5a3f86", s: "#3d2a5e", d: "#4a3270" }),
  paint(PANEL, { d: "#0a1a2a", h: "#3aa8c8", p: "#1d5a7a", s: "#123a52", r: COLORS.ink, c: COLORS.cyan }),
  paint([...CABINET_DRAWER, ...CABINET_DRAWER], { k: "#3a2a05", h: COLORS.yellow, b: "#c9a227", s: "#8a6a10", w: COLORS.ink, n: "#2a1f05" }),
  paint(CIRCUIT, { b: "#0d2418", g: "#2f8f4f", G: COLORS.green, c: COLORS.night, l: COLORS.lilac }),
  paint(HAZARD, { k: "#1a0d2b", p: COLORS.pink, ".": "#3a1030", m: "#4a2a5e", v: "#1a0d2b" }),
];
export const FLOOR_ART = paint(FLOOR, { g: "#2b1d45", f: "#1a1030", F: "#3d2a5e" });
export const CEIL_ART = paint(CEILING, { k: "#0b0614", c: "#160d28" });
export const CEIL_LIT_ART = paint(CEILING_LIT, { k: "#0b0614", c: "#160d28", L: "#a493c4", l: COLORS.ink });

/** Distance fog: each step is one palette shade darker. */
export const SHADES = [1, 0.8, 0.63, 0.49, 0.37, 0.27, 0.18];

/** A texture at every fog step. */
export const shaded = (p: Pixels) => SHADES.map((m) => (m === 1 ? p.data : p.data.map((c) => fade(c, m))));

// ---------- zombies (16x24) ----------

// Head: 10 columns in the middle; arms: 3 columns each side.
const HEAD = ["..oooooo..", ".osssssso.", "ossssssddo", "oeessseedo", "osssssssdo", "osmmmmmsdo", ".osmwmwso.", "..oddddo.."];
const HEAD_SHOUT = ["..oooooo..", ".osssssso.", "ossssssddo", "oeessseedo", "osmmmmmsdo", "omwmmmwmdo", ".osmmmmso.", "..oddddo.."];
const PLATE = ["pppppppppp", ...Array(8).fill("pccccccccp"), "pppppppppp"];
const ARMS_L = [".oo", "oss", "osd", "osd", "osd", "oss", "ss.", "s.s", "...", "..."];
const ARMS_R = ["oo.", "sso", "dso", "dso", "dso", "sso", ".ss", "s.s", "...", "..."];
const RAISED_HEAD_L = ["...", "...", "s.s", "sss", "oso", ".os", "..o", "..."];
const RAISED_HEAD_R = ["...", "...", "s.s", "sss", "oso", "so.", "o..", "..."];
const RAISED_L = [".oo", "..o", "...", "...", "...", "...", "...", "...", "...", "..."];
const RAISED_R = ["oo.", "o..", "...", "...", "...", "...", "...", "...", "...", "..."];
const LEGS_A = ["...rRrRrrRrRr...", "....oll..llo....", "...oll....llo...", "...off....ffo...", "..ooo......ooo.."];
const LEGS_B = ["...RrRrrRrRrR...", "....oll..llo....", ".....ollllo.....", ".....offffo.....", "....oooooooo...."];

export type ZombieFrame = "walkA" | "walkB" | "swipe";

function zombieRows(frame: ZombieFrame): string[] {
  const swipe = frame === "swipe";
  const head = (swipe ? HEAD_SHOUT : HEAD).map((m, i) => (swipe ? RAISED_HEAD_L[i] : "...") + m + (swipe ? RAISED_HEAD_R[i] : "..."));
  const body = PLATE.map((m, i) => (swipe ? RAISED_L[i] : ARMS_L[i]) + m + (swipe ? RAISED_R[i] : ARMS_R[i]));
  return ["................", ...head, ...body, ...(frame === "walkB" ? LEGS_B : LEGS_A)];
}

/** Per-ability extras on top of the base zombie (rows from the top). */
const GEAR: Record<Ability, (string | null)[]> = {
  flash: ["......kyyk......", ".......kk......."],
  shield: [".....xxxxxx.....", "....xxxxxxxx...."],
  teleport: ["..g..........g..", null, ".g............g.", null, null, "g..............g"],
  sonic: ["....kkkkkkkk....", "...k........k...", "..kk........kk..", "..yk........ky..", "..kk........kk.."],
  fast: [null, null, null, "...hhhhhhhhhh...", null, null, null, null, null, null, null, "h..............h", null, "h..............h"],
  split: [null, ".......z........", ".......k........", ".......z........", null, ".......z........", ".......k........", null, ".......z........"],
  tank: ["....HHHHHHHH....", "...HhhhhhhhhH...", "...HHHHHHHHHH...", null, null, null, null, null, null, ".HHH........HHH.", "HHbH........HbHH"],
  basic: [null, null, null, null, null, null, ".......d........"],
};

/** Where the file icon sits on a zombie (texture pixels). */
export const ZOMBIE_SLOT = { x: 4, y: 10, w: 8, h: 8 };
export const ZOMBIE_W = 16;
export const ZOMBIE_H = 24;

export function zombiePixels(ability: Ability, frame: ZombieFrame, elite: boolean): Pixels {
  const [s, d] = SKIN[ability];
  const trim = elite ? COLORS.yellow : COLORS.night;
  return paint(overlay(zombieRows(frame), GEAR[ability]), {
    o: trim,
    s,
    d,
    e: COLORS.red,
    m: COLORS.night,
    w: COLORS.ink,
    p: elite ? COLORS.yellow : COLORS.plum,
    c: "#0b0614",
    r: COLORS.grape,
    R: "#3d2a5e",
    l: COLORS.plum,
    f: COLORS.night,
    k: "#1a0d2b",
    y: COLORS.yellow,
    g: COLORS.cyan,
    h: COLORS.red,
    z: COLORS.ink,
    x: COLORS.ink,
    H: "#7d6aa0",
    b: COLORS.yellow,
  });
}

/** Only the glowing eyes: what's left of a zombie that flashed out of sight. */
export function eyesPixels(): Pixels {
  return paint(zombieRows("walkA").map((r) => r.replace(/[^e]/g, ".")), { e: COLORS.red });
}

/** All opaque pixels one color: the hit flash. */
export const silhouette = (p: Pixels, hex: string) => {
  const c = px(hex);
  return mapPixels(p, (v) => (v ? c : 0));
};

// ---------- the front shield of a document zombie (12x13) ----------

// A paper sheet with a dark window in the middle, where the file's icon shows.
const SHIELD = mirror(["oooooo", "olllll", "olpppp", "olpppp", "olpppp", "olpppp", "olpppp", "olpppp", ".olppp", ".olppp", "..olll", "...oll", "....oo"]);
const CRACKS = [null, "..x.....xx..", ".x..........", null, "..........x.", null, ".x..........", null, null, "..........x.", "...x.xx.....", ".....x......"];
/** Where the file icon sits on the shield (texture pixels). */
export const SHIELD_SLOT = { x: 2, y: 2, w: 8, h: 8 };

export const shieldPixels = (cracked: boolean) =>
  paint(cracked ? overlay(SHIELD, CRACKS) : SHIELD, { o: COLORS.grape, l: COLORS.ink, p: "#0b0614", x: COLORS.grape });

// ---------- helper bot (16x18), awake or waiting to be picked up ----------

const BOT = mirror([
  ".......o",
  ".......y",
  ".......o",
  "...ooooo",
  "..occccc",
  ".occcccc",
  ".occKKKK",
  "occcKKKK",
  "occcKKKK",
  "occcKKKK",
  "occcKKKK",
  "occcKKKK",
  "occcKKKK",
  ".occKKKK",
  ".occcccc",
  "..oooooo",
  "....oTTT",
  ".....ttt",
]);
export const BOT_SLOT = { x: 4, y: 6, w: 8, h: 8 };

export function botPixels(awake: boolean, firing: boolean): Pixels {
  return paint(awake ? BOT : BOT.map((r, i) => (i >= 16 ? "" : r)), {
    o: awake ? "#0f3a4a" : COLORS.plum,
    c: awake ? COLORS.cyan : "#6b5a8e",
    K: "#0b0614",
    y: firing ? COLORS.ink : awake ? COLORS.yellow : COLORS.plum,
    T: COLORS.lilac,
    t: firing ? COLORS.yellow : COLORS.pink,
  });
}

// ---------- pickups: a file card in the perk's color (12x15) ----------

const CARD = [
  "FFFFFFFFf...",
  "FPPPPPPPFf..",
  "FPPPPPPPFFf.",
  "FPPPPPPPPPFF",
  ...Array(10).fill("FPPPPPPPPPPF"),
  "FFFFFFFFFFFF",
];
export const CARD_SLOT = { x: 2, y: 3, w: 8, h: 8 };

const SYMBOL: Record<Perk, string[]> = {
  health: ["..XX..", "XXXXXX", "..XX.."],
  armor: ["XXXXXX", ".XXXX.", "..XX.."],
  ally: ["X.XX.X", "XXXXXX", ".X..X."],
  rapid: ["X..X..", ".X..X.", "X..X.."],
  spread: ["X.XX.X", ".XXXX.", "..XX.."],
  ammo: ["XXXXXX", "X....X", "X....X"],
  power: [".XXXX.", "XXXXXX", ".XXXX."],
  points: ["..XX..", ".XXXX.", "..XX.."],
};

export function cardPixels(perk: Perk): Pixels {
  const sym = SYMBOL[perk].map((r) => "..." + r + "...");
  return paint(overlay(CARD, [...Array(11).fill(null), ...sym]), { F: PERK_COLOR[perk], f: COLORS.ink, P: "#1a0d2b", X: COLORS.ink });
}

// ---------- shots and effects ----------

const WAVE = [
  "...yyyyyy...",
  "..y......y..",
  ".y..YYYY..y.",
  "y..Y....Y..y",
  "y.Y..yy..Y.y",
  "y.Y.y..y.Y.y",
  "y.Y.y..y.Y.y",
  "y.Y..yy..Y.y",
  "y..Y....Y..y",
  ".y..YYYY..y.",
  "..y......y..",
  "...yyyyyy...",
];
export const wavePixels = (frame: number) => paint(WAVE, frame ? { y: COLORS.yellow, Y: COLORS.ink } : { y: COLORS.ink, Y: COLORS.yellow });

const SPARK = ["..W..", ".yWy.", "WWWWW", ".yWy.", "..W.."];
export const sparkPixels = () => paint(SPARK, { W: COLORS.ink, y: COLORS.yellow });

const ZAP = ["c..c..c", ".c.c.c.", "..CCC..", "ccCWCcc", "..CCC..", ".c.c.c.", "c..c..c"];
export const zapPixels = () => paint(ZAP, { c: COLORS.cyan, C: "#b8f4ff", W: COLORS.ink });

const WARP = [
  "...c....",
  "...c..c.",
  ".c.C..c.",
  ".c.C....",
  ".C.c.c..",
  "...c.C..",
  "c..C.C..",
  "c..c.c.c",
  "C..c...c",
  "c.cC...C",
  "..cc..c.",
  "..C...c.",
  ".....cC.",
  "..c..c..",
  "..c.....",
  "........",
];
export const warpPixels = (frame: number) => paint(frame ? WARP.map((r) => [...r].reverse().join("")) : WARP, { c: COLORS.cyan, C: COLORS.ink });

/** A cheap repeatable "noise" for procedural effects (no rng: art must look the same every time). */
const hash = (x: number, y: number, s: number) => {
  let n = Math.imul(x * 374761393 + y * 668265263 + s * 2147483647, 1274126177);
  n ^= n >>> 13;
  return ((Math.imul(n, 1597334677) >>> 0) % 1000) / 1000;
};

/** An explosion 16x16 at stage 0..2 (growing, then breaking up). */
export function boomPixels(stage: number): Pixels {
  const size = 16;
  const data = new Uint32Array(size * size);
  const ring = [px(COLORS.ink), px(COLORS.yellow), px(COLORS.orange), px(COLORS.pink), px(COLORS.red)];
  const reach = [4.5, 7, 8][stage];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5) + hash(x, y, 1) * 2.2 - 1;
      if (d > reach) continue;
      if (stage === 2 && hash(x, y, 7) < 0.45) continue;
      const band = Math.min(4, Math.floor((d / reach) * 4 + stage * 0.8));
      data[y * size + x] = ring[Math.max(0, band)];
    }
  return { w: size, h: size, data };
}

/** Bits of a beaten zombie flying apart (10x10), stage 0..1. */
export function puffPixels(stage: number, hex: string): Pixels {
  const size = 10;
  const data = new Uint32Array(size * size);
  const cols = [px(hex), px(COLORS.ink), px(COLORS.lilac)];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - 4.5, y - 4.5);
      const h = hash(x, y, 3 + stage);
      if (d > 2 + stage * 2.5 || h < (stage ? 0.75 : 0.45)) continue;
      data[y * size + x] = cols[Math.floor(hash(x, y, 9) * 3)];
    }
  return { w: size, h: size, data };
}

/** Marks for a chest with no file icon: a "?" (icon not loaded) and a dust swirl (filler foes). */
export const unknownMark = () => paint(["........", "..xxxx..", ".x....x.", ".....x..", "....x...", "........", "....x...", "........"], { x: COLORS.lilac });
export const dustMark = () => paint(["........", "...xx...", "..x..x..", ".x.xx.x.", ".x.x..x.", "..x..x..", "...xx...", "........"], { x: "#8a7a6a" });

// ---------- the player's weapon (32x30, seen from behind, held in both hands) ----------

const GUN_LEFT = [
  "...........ooooo",
  "...........oSSSS",
  "...........oSyyy",
  "...........oSSSS",
  "...........ohhhh",
  "...........ohmmm",
  "...........ohmmm",
  "...........ohmmm",
  "..........oohmmm",
  "......oooooohhhh",
  ".....ohhhhhhhhhh",
  "....ohmmmmmmmmmm",
  "....ohmcccmmmmmm",
  "....ohmcCcmmmmmm",
  "....ohmcccmmmmmm",
  "....ohmmmmmmmmmm",
  "....ohmkkkkkkkkk",
  "....ohmmmmmmmkSS",
  "....ohmmmmmmmkyy",
  "..oooooommmmmkSS",
  ".oGgGgGommmmmkyy",
  ".ogogogommmmmkSS",
  "oggggggommmmmkyy",
  "oggggggommmmmkSS",
  "ogggggggommmmkyy",
  "ogggggggommmmkSS",
  "oggggggggommmkyy",
  "oggggggggommmkSS",
  "oggggggggommmkyy",
  "oggggggggommmkSS",
];

const SPREAD_LEFT = overlay(GUN_LEFT, [
  null,
  null,
  null,
  "......ooo.......",
  ".....oSyo.......",
  ".....oSSo.......",
  "......ohho......",
  ".......ohho.....",
  "........ohho....",
]);

const POWER_LEFT = overlay(GUN_LEFT, [
  ".........ooooooo",
  "........oPPPPPPP",
  ".......oPppppppp",
  "......oPpYYYYYYY",
  "......oPpYWWWWWW",
  "......oPpYWWWWWW",
  "......oPpYYYYYYY",
  ".......oPppppppp",
  "........oPPPPPPP",
]);

export type GunKind = "basic" | "spread" | "power";

export function gunPixels(kind: GunKind, rapid: boolean): Pixels {
  const rows = mirror(kind === "power" ? POWER_LEFT : kind === "spread" ? SPREAD_LEFT : GUN_LEFT);
  const stripe = kind === "power" ? COLORS.pink : kind === "spread" ? COLORS.orange : COLORS.cyan;
  return paint(rows, {
    o: COLORS.night,
    y: COLORS.yellow,
    S: "#0b0614",
    h: "#d9cdf5",
    m: "#7d6aa0",
    k: "#4a3a70",
    C: COLORS.ink,
    c: rapid ? COLORS.yellow : stripe,
    g: "#3aa8c8",
    G: "#b8f4ff",
    P: "#a32686",
    p: COLORS.pink,
    Y: COLORS.yellow,
    W: COLORS.ink,
  });
}

export const MUZZLE = mirror([".......y", "...y...y", "....y.yW", ".y..yyWW", "..yyyWWW", "...yWWWW"]);
export const muzzlePixels = (hex: string) => paint(MUZZLE, { y: hex, W: COLORS.ink });

// ---------- HUD icons (7x7) ----------

export const HUD_ICONS: Record<"heart" | "armor" | "ammo" | "skull" | "coin", Pixels> = {
  heart: paint([".xx.xx.", "xxxxxxx", "xxxxxxx", "xxxxxxx", ".xxxxx.", "..xxx..", "...x..."], { x: COLORS.pink }),
  armor: paint(["xxxxxxx", "xcccccx", "xcccccx", "xcccccx", ".xcccx.", "..xcx..", "...x..."], { x: COLORS.cyan, c: "#1d5a7a" }),
  ammo: paint(["xxxxxxx", "x.....x", "x.....x", "x.....x", "x.....x", ".......", "......."], { x: COLORS.yellow }),
  skull: paint([".xxxxx.", "xxxxxxx", "x..x..x", "xxxxxxx", ".xx.xx.", ".x.x.x.", "......."], { x: COLORS.red }),
  coin: paint(["..xxx..", ".xyyyx.", "xyyxyyx", "xyyxyyx", "xyyxyyx", ".xyyyx.", "..xxx.."], { x: COLORS.yellow, y: "#a67d00" }),
};
