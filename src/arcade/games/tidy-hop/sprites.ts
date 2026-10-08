// Tidy Hop's pixel art, all original and drawn in code: ASCII sprites (one
// character per pixel) and the level's static tiles, each painted once to
// an offscreen canvas and reused every frame. Each level theme recolors the
// tiles, adds its own tile tops, props and backdrop. Without a 2D context
// (tests run in jsdom) every canvas comes back null and the renderer skips it.

import type { Ability, Perk } from "../../types";
import { BASE, BRICK, DIRT, LADDER, PLAT, ROWS, sectionAt, T, THEME_IDS, tileAt, VIEW_H, VIEW_W, type Level, type ThemeId } from "./level";
import type { PowerId } from "./logic";

type Img = HTMLCanvasElement;

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
  purple: "#b07cff",
  steel: "#8a8fa8",
  night: "#120a22",
  dirt: "#2a1745",
};

/** Letters used in the ASCII sprites. "." is clear; b/B are the critter body, x its outline. */
const PAL: Record<string, string> = {
  k: C.bg, i: C.ink, w: "#ffffff",
  c: C.cyan, C: "#1f7f99",
  p: C.pink, P: "#9e2a86",
  y: C.yellow, Y: "#a8841a",
  g: C.green, G: "#2a8f4a",
  r: C.red, R: "#9a2338",
  l: C.lilac, L: "#4a3d66",
  o: C.orange, O: "#a85a1a",
  u: C.purple, U: "#5c3a99",
  s: C.steel, S: "#4a4e66",
  d: C.dirt, D: "#3b2260", e: "#1c0f30",
  m: "#6a2c5e", M: "#3a1534",
  n: C.night, N: "#1a1030",
  x: C.bg,
};

/** Each ability's body: main color, shade, outline. */
export const BODY: Record<Ability, [string, string, string]> = {
  flash: [C.yellow, "#b8901a", "#5c4410"],
  shield: [C.cyan, "#1f8fb0", "#0f4458"],
  teleport: [C.purple, "#6f45b8", "#33205c"],
  sonic: [C.pink, "#b02a96", "#561448"],
  fast: [C.green, "#2a9a50", "#14502a"],
  split: [C.orange, "#b8641c", "#5c300e"],
  tank: [C.red, "#a8283e", "#560f1e"],
  basic: [C.steel, "#5a5f7a", "#2c2f40"],
};

export const PERK_COLOR: Record<Perk, string> = {
  health: C.red, armor: C.cyan, ally: C.green, rapid: C.pink, spread: C.purple, ammo: C.orange, power: C.yellow, points: C.yellow,
};

/** Particle colors by index (logic's PART). */
export const PART_COLORS = [C.lilac, "#ffffff", C.yellow, C.ink, C.red, C.cyan, C.pink, C.green];

let canvasOk: boolean | undefined;

/** An offscreen canvas and its context, or null when there's no 2D canvas. */
function surface(w: number, h: number): { c: Img; g: CanvasRenderingContext2D } | null {
  if (canvasOk === false || typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  let g: CanvasRenderingContext2D | null = null;
  try {
    g = c.getContext("2d");
  } catch {
    g = null;
  }
  canvasOk = !!g;
  return g ? { c, g } : null;
}

function paintOn(g: CanvasRenderingContext2D, rows: string[], ox: number, oy: number, pal: Record<string, string>) {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = pal[row[x]];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(ox + x, oy + y, 1, 1);
    }
  });
}

function paint(rows: string[], pal: Record<string, string> = PAL): Img | null {
  const s = surface(Math.max(...rows.map((r) => r.length)), rows.length);
  if (!s) return null;
  paintOn(s.g, rows, 0, 0, pal);
  return s.c;
}

const flip = (rows: string[]) => rows.map((r) => [...r].reverse().join(""));
const swap = (rows: string[], from: string, to: string) => rows.map((r) => [...r].map((ch) => (from.includes(ch) ? to[from.indexOf(ch)] : ch)).join(""));

// ---------- the player: a tidy little sweeper in a pink cap ----------

const HEAD = [
  "...pppp...",
  "..pppppp..",
  "..pppppPPP",
  "..Liiiii..",
  "..iiikik..",
  "..iiikikp.",
  "...iiii...",
];
const LEGS = {
  stand: ["...cccc...", "...C..C...", "..LL..LL..", "..LL..LLL."],
  runA: ["...cccc...", "..CC..CC..", ".LL....LL.", ".L......LL"],
  runB: ["...cccc...", "....CC....", "...LLL....", "...LLLL..."],
  jump: ["..cccccc..", "..CC..CC..", "..LL...LL.", "........."],
};
const BODY_ROWS = ["..cyyyyc..", ".iCccccCi.", ".i.cccc.i."];
const ARMS_UP = ["i.cyyyyc.i", ".cccccccc.", "..cccccc.."];
const BACK = ["...pppp...", "..pppppp..", "..pppppp..", "..LLLLLL..", "..LLLLLL..", "..LLLLLL..", "...LLLL..."];

const PLAYER_FRAMES: Record<string, string[]> = {
  stand: [...HEAD, ...BODY_ROWS, ...LEGS.stand],
  runA: [...HEAD, ...BODY_ROWS, ...LEGS.runA],
  runB: [...HEAD, ...BODY_ROWS, ...LEGS.runB],
  jump: [...HEAD, ...ARMS_UP, ...LEGS.jump],
  climbA: [...BACK, "i.cyyyyc..", ".ccccccci.", "...cccc...", ...LEGS.stand],
  climbB: [...BACK, "..cyyyyc.i", ".icccccccc", "...cccc...", ...LEGS.stand],
};

/** The power-up look: a taller body (some rows doubled) and a yellow cap. */
function bigger(rows: string[]): string[] {
  const out: string[] = [];
  rows.forEach((r, i) => {
    out.push(r);
    if (i === 1 || i === 8 || i === 9 || i === 10 || i === 11 || i === 12) out.push(r);
  });
  return swap(out, "pPy", "yYp");
}

// ---------- the critters (trashed files) ----------

/**
 * A walking page: folded top-right corner, big eyes over the file icon's
 * spot, a shaded edge. b/B are the body and its shade, x the outline.
 */
function page(w: number, bodyH: number, fold: number, eye: number, eyeY: number, eyeXs: number[]): string[] {
  const rows: string[] = [];
  for (let y = 0; y < bodyH; y++) {
    let row = "";
    for (let x = 0; x < w; x++) {
      const d = x - (w - 1 - fold);
      let ch: string;
      if (d >= 0 && y <= fold) {
        if (y < d) ch = ".";
        else if (y === d || d === 0 || y === fold) ch = "x";
        else ch = "i";
      } else if (x === 0 || x === w - 1 || y === 0 || y === bodyH - 1) ch = "x";
      else if (y === bodyH - 2 || x === w - 2) ch = "B";
      else ch = "b";
      row += ch;
    }
    rows.push(row);
  }
  for (const ex of eyeXs) {
    for (let dy = 0; dy < eye; dy++) {
      const r = [...rows[eyeY + dy]];
      for (let dx = 0; dx < eye; dx++) r[ex + dx] = dy > 0 && dx === eye - 1 ? "k" : "i";
      rows[eyeY + dy] = r.join("");
    }
  }
  return rows;
}

const CRITTER = page(14, 16, 3, 3, 2, [2, 6]);
const CRITTER_FEET = [".BBB.....BBB..", "...BBB.BBB...."];
const MINI = page(10, 12, 2, 2, 1, [2, 5]);
const MINI_FEET = [".BB....BB.", "..BB..BB.."];
const TANK = page(22, 19, 4, 4, 2, [3, 9]);
const TREADS = [0, 1].map((f) => [
  ".xSSSSSSSSSSSSSSSSSSx.",
  "x" + "sS".repeat(10).slice(f, 20 + f) + "x",
  "x" + "Ss".repeat(10).slice(f, 20 + f) + "x",
  ".xxxxxxxxxxxxxxxxxxxx.",
]);

/** Where the 8x8 file icon sits on each critter. */
export const ICON_AT = { normal: [3, 6], tank: [7, 8], mini: [1, 3] } as const;

function critterRows(ability: Ability, frame: number, mini: boolean): string[] {
  if (mini) return [...MINI, MINI_FEET[frame]];
  if (ability === "tank") return [...TANK, ...TREADS[frame]];
  const rows = [...CRITTER, CRITTER_FEET[frame]];
  if (ability === "split") rows[14] = "xBkBkBkBkBkBBx"; // a zipper
  if (ability === "fast") rows[16] = rows[16].replace(/B/g, "r"); // red sneakers
  return rows;
}

// ---------- items and tiles ----------

const HEART = [".rr.rr.", "rirrrrr", "rirrrrr", ".rrrrr.", "..rrr..", "...r..."];
const HEART_EMPTY = [".LL.LL.", "L..L..L", "L.....L", ".L...L.", "..L.L..", "...L..."];
const HELMET = ["..ssssss..", ".siiiiiss.", "sssssssssS"];
const HELMET_ICON = [".sss.", "siiss", "sssss"];
const BALL = [".ii.", "illi", "iili", ".ll."];
const HEAD_ICON = [".ppp..", "pppppP", "kiiik.", ".iik.."];
const COIN = [
  [".yyy.", "yyiyy", "yiyYy", "yiyYy", "yiyYy", "yyYYy", ".yyy."],
  ["..y..", ".yiy.", ".yiy.", ".yiy.", ".yiy.", ".yYy.", "..y.."],
];
const CROWN = ["y..y..y", "yy.y.yy", "yyyyyyy", "YYYYYYY"];
const WAVE = ["p.....", ".p..p.", "..p..p", "..p..p", "..p..p", "..p..p", "..p..p", "..p..p", ".p..p.", "p....."];
const FLAG = [
  "pppppppppppp",
  "pppppppppPip",
  "ppppppppPiip",
  "ppiPppppiipp",
  "pppiiPpiippp",
  "ppppiiiippp.",
  "pppppiippp..",
  "pppppppp....",
];
const PENNANT = ["xxxx..", "xxxxxx", "xxxx..", "x....."];
const ALLY = [
  "....g...",
  "....G...",
  ".gggggg.",
  "giikiikg",
  "giiiiiig",
  ".GGGGGG.",
];
const ALLY_LEGS = [".gg..gg.", "..gg.gg."];
const SLAB_MID = ["yyyyyyyy", "yyYyyyYy", "pppppppp", "iiiiiiii", "cccccccc", "CcCCcCCc", "LLLLLLLL"];
const SLAB_END = [".yyyyyyy", "yyyyyyYy", "pppppppp", "iiiiiiii", "cccccccc", "CCcCCcCC", ".LLLLLLL"];

const DIRT_TOP = ["gggggggg", "gGgggGgg", "GdGGdGGd", "dddDdddd", "dDdddddd", "dddddDdd", "dDdddddd", "ddddDddd"];
const DIRT_FILL = ["dddDdddd", "dDdddddd", "dddddDdd", "dddddddd", "ddDddddd", "dddddddD", "dDdddddd", "dddddDdd"];
const PLAT_T = ["cccccccc", "cCcccCcc", "CCCCCCCC", ".C....C.", "..C..C..", "...CC...", "........", "........"];
const LADDER_T = [".l....l.", ".llllll.", ".l....L.", ".l....L.", ".l....L.", ".llllll.", ".l....L.", ".l....L."];
const BRICK_T = ["mmmMmmmm", "mmmMmmmm", "mmmMmmmm", "MMMMMMMM", "mMmmmmmm", "mMmmmmmm", "mMmmmmmm", "MMMMMMMM"];

function cabinetRows(): string[] {
  const rows: string[] = [];
  for (let y = 0; y < 24; y++) {
    let row = "";
    for (let x = 0; x < 16; x++) {
      let ch = "s";
      if (x === 0 || x === 15 || y === 0 || y === 23) ch = "k";
      else if (x === 14 || y === 22) ch = "S";
      else {
        const dy = (y - 1) % 7;
        if (dy === 0 || dy === 6) ch = "S";
        else if (dy === 2 && x >= 5 && x <= 10) ch = "i";
        else if (dy === 4 && x >= 6 && x <= 9) ch = "k";
        else if (x === 2 || x === 13) ch = "S";
      }
      row += ch;
    }
    rows.push(row);
  }
  return rows;
}

function blockRows(kind: "item" | "coin" | "used"): string[] {
  const rows: string[] = [];
  const [edge, hi, lo, inner] = kind === "used" ? ["L", "l", "e", "N"] : ["y", "i", "Y", "n"];
  for (let y = 0; y < 16; y++) {
    let row = "";
    for (let x = 0; x < 16; x++) {
      let ch = inner;
      const corner = (x === 0 || x === 15) && (y === 0 || y === 15);
      if (corner) ch = ".";
      else if (y === 0 || x === 0) ch = hi;
      else if (y === 15 || x === 15) ch = lo;
      else if (y === 1 || x === 1 || y === 14 || x === 14) ch = edge;
      else if ((x === 2 || x === 13) && (y === 2 || y === 13)) ch = lo; // rivets
      row += ch;
    }
    rows.push(row);
  }
  if (kind === "coin") {
    // A question mark: there's something inside.
    const q = [".yyy.", "y...y", "...y.", "..y..", "..y..", ".....", "..y.."];
    q.forEach((r, i) => {
      const row = [...rows[4 + i]];
      for (let x = 0; x < r.length; x++) if (r[x] === "y") row[5 + x] = "y";
      rows[4 + i] = row.join("");
    });
  }
  return rows;
}

function cardRows(): string[] {
  const rows: string[] = [];
  for (let y = 0; y < 12; y++) {
    let row = "";
    for (let x = 0; x < 12; x++) {
      const edge = x === 0 || y === 0 || x === 11 || y === 11;
      const corner = (x === 0 || x === 11) && (y === 0 || y === 11);
      row += corner ? "." : edge ? "b" : x === 1 || y === 1 ? "B" : "n";
    }
    rows.push(row);
  }
  return rows;
}

/** A ring around a shielded critter. */
function ringRows(w: number, h: number): string[] {
  const rows: string[] = [];
  const cx = w / 2;
  const cy = h / 2;
  for (let y = 0; y < h; y++) {
    let row = "";
    for (let x = 0; x < w; x++) {
      const d = ((x + 0.5 - cx) / cx) ** 2 + ((y + 0.5 - cy) / cy) ** 2;
      row += d <= 1 && d > 0.78 ? (x < cx && y < cy * 0.8 ? "i" : (x + y) % 3 === 0 ? "C" : "c") : ".";
    }
    rows.push(row);
  }
  return rows;
}

// ---------- power-ups (not files): 12x12 in the level, 7x7 on the HUD ----------

const POWER_ROWS: Record<PowerId, string[]> = {
  // Winged sneaker: double jump.
  wings: [
    "i...........",
    "ii..i.......",
    "iii.ii.i....",
    ".iiiiiiii...",
    "..lllllll...",
    "......cccc..",
    ".....ccCcc..",
    ".....cccccc.",
    ".....cccciic",
    "....cccccccc",
    "....CCCCCCCC",
    "....iiiiiiii",
  ],
  // A star with a face: a short spell of invincibility.
  star: [
    ".....yy.....",
    ".....yy.....",
    "....yiyy....",
    "yyyyyiyyyyyY",
    ".yyyyyyyyyY.",
    "..yykyykyY..",
    "...ykyykY...",
    "...yyyyyY...",
    "..yyyyyyyY..",
    "..yyY..yyY..",
    ".yyY....yyY.",
    ".yY......yY.",
  ],
  // Horseshoe magnet: pulls in coins and pickups.
  magnet: [
    "...rrrrrr...",
    ".rrrrrrrrrr.",
    ".rrirRRrrrr.",
    "rri......rrR",
    "rri......rrR",
    "rri......rrR",
    "rri......rrR",
    "rri......rrR",
    "iii......iii",
    "iii......iii",
    "sss......sss",
    "SSS......SSS",
  ],
  // Lightning bolt: run faster.
  zoom: [
    "......gggg..",
    ".....giggG..",
    "....giggG...",
    "...giggG....",
    "..giggggggg.",
    ".gggggggigG.",
    "......gigG..",
    ".....gigG...",
    "....gigG....",
    "...ggG......",
    "..gG........",
    ".g..........",
  ],
};

const POWER_ICON: Record<PowerId, string[]> = {
  wings: ["i.i.i..", "iiiii..", ".lllcc.", "...cccc", "..ccccc", "..CCCCC", "..iiiii"],
  star: ["...y...", "..yiy..", "yyyyyyy", ".yyyyy.", "..yyy..", ".yy.yy.", ".y...y."],
  magnet: [".rrrrr.", "rr...rr", "rr...rr", "rr...rr", "ii...ii", "ss...ss", "......."],
  zoom: ["....gg.", "...gg..", "..gg...", ".ggggg.", "...gg..", "..gg...", ".g....."],
};

/** Each power-up's color (labels, HUD bars). */
export const POWER_COLOR: Record<PowerId, string> = { wings: C.cyan, star: C.yellow, magnet: C.red, zoom: C.green };

/** A wing on the player's back while double jump is on (two flaps). */
const WING = [["ii.", "iii", ".ii"], ["...", "iii", "iii"]];

// ---------- level themes: tile colors, tile tops, props, backdrop ----------

interface Look {
  sky: string;
  /** Overrides for the tile letters: g/G top, d/D/e dirt, c/C platform, l/L ladder, m/M brick, s/S cabinet. */
  pal: Record<string, string>;
  /** A theme's own ground top, if not the grass one. */
  top?: string[];
  fill?: string[];
  props: string[][];
}

export const LOOKS: Record<ThemeId, Look> = {
  stacks: {
    sky: C.bg,
    pal: {},
    props: [
      [".iiiii..", "LLLLLL..", ".iiiiii.", "LLLLLLL.", "iiiiiiii", "LLLLLLLL"],
      ["..u.y.", "..u.y.", ".LLLLL", ".LlllL", ".LlllL", ".LLLLL"],
      ["..ll....", ".lLLl...", "lLLLLl..", "LLLLLLLL"],
    ],
  },
  garden: {
    sky: "#040f0c",
    pal: { g: "#58d68d", G: "#2a8f4a", d: "#3a2516", D: "#4d3220", e: "#1e1209", c: "#d89a5a", C: "#7a4a22", l: "#6bff8f", L: "#2a8f4a", m: "#5f6f5f", M: "#3a463a", s: "#8f7a5a", S: "#5a4a32" },
    top: ["g.gg.g.g", "gggggggg", "gGgggGgg", "GdGGdGGd", "dddDdddd", "dDdddddd", "dddddDdd", "ddddDddd"],
    props: [
      ["..p..", ".pyp.", "..p..", "..G..", ".GG..", "..G.."],
      ["g..g.g", ".g.gg.", "GgGgGg"],
      [".rrr.", "rrirr", "rrrrr", "..i..", "..i.."],
    ],
  },
  server: {
    sky: "#03060d",
    pal: { g: "#4de1ff", G: "#1f7f99", d: "#1a2333", D: "#26324a", e: "#0b111c", c: "#ff9a3c", C: "#a85a1a", l: "#8a8fa8", L: "#4a4e66", m: "#3a4660", M: "#222b3d", s: "#5a6a8a", S: "#2e3850" },
    top: ["GGGGGGGG", "gggggggg", "DSDDDDSD", "dddddddd", "dDDDDDDd", "dDddddDd", "dDDDDDDd", "dddddddd"],
    fill: ["dDddddDd", "dDDDDDDd", "dddddddd", "dddddddd", "dDddddDd", "dDDDDDDd", "dddddddd", "dddddddd"],
    props: [
      ["SSSSSSS", "SgSrSgS", "SSSSSSS", "SgSgSrS", "SSSSSSS"],
      [".SSSS.", "SccccS", "SCccCS", "SSSSSS", ".S..S."],
      ["..ss....", ".s..s...", "s....s.s", "......s."],
    ],
  },
  dunes: {
    sky: "#120706",
    pal: { g: "#e8b062", G: "#a8743a", d: "#5c3218", D: "#6e3e1e", e: "#2a1408", c: "#c8865a", C: "#7a4a22", l: "#d8b07a", L: "#8a6a3a", m: "#b8642c", M: "#7a3a14", s: "#a88a6a", S: "#6a4a32" },
    top: ["..gggg..", "gggGgggg", "gGgggggG", "GGdGGGdG", "dddDdddd", "dDdddddd", "dddddDdd", "ddddDddd"],
    props: [
      ["..G...", "..G.G.", "G.GGG.", "GGG...", "..G...", "..G..."],
      ["..oo..", ".oOOo.", "oOoOoO"],
      [".LLL..", "LlLLL.", "LLLLLL"],
    ],
  },
  frost: {
    sky: "#040818",
    pal: { g: "#f4ecff", G: "#a9c7e8", d: "#1c2c55", D: "#26386a", e: "#0c1430", c: "#a9e8ff", C: "#4d9fc8", l: "#c8d8f0", L: "#5c7ab0", m: "#5c7ab0", M: "#34507e", s: "#8aa0c8", S: "#4a5e88" },
    top: ["gggggggg", "gGgggGgg", "gG.ggGg.", "G..GG..G", "dddDdddd", "dDdddddd", "dddddDdd", "ddddDddd"],
    props: [
      ["...G...", "..GGG..", ".GGGGG.", "..GGG..", ".GGGGG.", "GGGGGGG", "...D..."],
      ["..i..", ".ici.", ".ici.", "icCci"],
      [".ii.", "ikki", ".ii.", "iiii", "iiii", ".ii."],
    ],
  },
};

// ---------- the art set ----------

export interface Art {
  player: Record<string, [Img | null, Img | null]>;
  big: Record<string, [Img | null, Img | null]>;
  /** The star's flashing colors, small and big. */
  starPlayer: Record<string, [Img | null, Img | null]>;
  starBig: Record<string, [Img | null, Img | null]>;
  powers: Record<PowerId, Img | null>;
  powerIcons: Record<PowerId, Img | null>;
  wing: [Img | null, Img | null][];
  helmet: [Img | null, Img | null];
  /** critters[ability][elite][frame][facing: 0 right, 1 left] */
  critters: Record<string, (Img | null)[][][]>;
  minis: (Img | null)[][][];
  ring: Img | null;
  ringTank: Img | null;
  crown: Img | null;
  ally: (Img | null)[][];
  heart: Img | null;
  heartEmpty: Img | null;
  helmetIcon: Img | null;
  ball: Img | null;
  headIcon: Img | null;
  coin: (Img | null)[];
  wave: (Img | null)[][];
  flag: Img | null;
  pennant: [Img | null, Img | null];
  blocks: { item: Img | null; coin: Img | null; used: Img | null };
  cards: Record<string, Img | null>;
  slab: { mid: Img | null; left: Img | null; right: Img | null; midDone: Img | null; leftDone: Img | null; rightDone: Img | null };
  /** One backdrop per theme the level uses. */
  bgs: Partial<Record<ThemeId, Img | null>>;
  /** The static level, in pages 512px wide. */
  pages: { x: number; img: Img }[];
}

const both = (rows: string[], pal: Record<string, string> = PAL): [Img | null, Img | null] => [paint(rows, pal), paint(flip(rows), pal)];

export function buildArt(level: Level): Art {
  const player: Art["player"] = {};
  const big: Art["big"] = {};
  const starPlayer: Art["starPlayer"] = {};
  const starBig: Art["starBig"] = {};
  const starry = (rows: string[]) => swap(rows, "pPcCyL", "yYoOiu");
  for (const [name, rows] of Object.entries(PLAYER_FRAMES)) {
    player[name] = both(rows);
    big[name] = both(bigger(rows));
    starPlayer[name] = both(starry(rows));
    starBig[name] = both(starry(bigger(rows)));
  }
  const powers = {} as Art["powers"];
  const powerIcons = {} as Art["powerIcons"];
  for (const k of Object.keys(POWER_ROWS) as PowerId[]) {
    powers[k] = paint(POWER_ROWS[k]);
    powerIcons[k] = paint(POWER_ICON[k]);
  }
  const bgs: Art["bgs"] = {};
  for (const sec of level.sections) bgs[sec.theme] ??= backdrop(sec.theme);
  const critters: Art["critters"] = {};
  for (const ability of Object.keys(BODY) as Ability[]) {
    const [b, bd, ol] = BODY[ability];
    critters[ability] = [0, 1].map((elite) => {
      const pal = { ...PAL, b, B: bd, x: elite ? C.yellow : ol };
      return [0, 1].map((frame) => [...both(critterRows(ability, frame, false), pal)]);
    });
  }
  const minis = [0, 1].map((elite) => {
    const pal = { ...PAL, b: BODY.split[0], B: BODY.split[1], x: elite ? C.yellow : BODY.split[2] };
    return [0, 1].map((frame) => [...both(critterRows("split", frame, true), pal)]);
  });
  const cards: Art["cards"] = {};
  for (const [perk, col] of Object.entries(PERK_COLOR)) cards[perk] = paint(cardRows(), { ...PAL, b: col, B: perk === "points" ? "#a8841a" : PAL.N });
  const slabDone = (rows: string[]) => swap(rows, "yY", "gG");
  return {
    player,
    big,
    starPlayer,
    starBig,
    powers,
    powerIcons,
    wing: WING.map((rows) => both(rows)),
    helmet: both(HELMET),
    critters,
    minis,
    ring: paint(ringRows(20, 23)),
    ringTank: paint(ringRows(28, 29)),
    crown: paint(CROWN),
    ally: [0, 1].map((f) => [...both([...ALLY, ...Array(8).fill("GggggggG"), ALLY_LEGS[f], ALLY_LEGS[f].replace(/g/g, "G")])]),
    heart: paint(HEART),
    heartEmpty: paint(HEART_EMPTY),
    helmetIcon: paint(HELMET_ICON),
    ball: paint(BALL),
    headIcon: paint(HEAD_ICON),
    coin: COIN.map((r) => paint(r)),
    wave: [0, 1].map((f) => [...both(f ? swap(WAVE, "p", "i") : WAVE)]),
    flag: paint(FLAG),
    pennant: [paint(PENNANT, { ...PAL, x: C.lilac }), paint(PENNANT, { ...PAL, x: C.green })],
    blocks: { item: paint(blockRows("item")), coin: paint(blockRows("coin")), used: paint(blockRows("used")) },
    cards,
    slab: {
      mid: paint(SLAB_MID), left: paint(SLAB_END), right: paint(flip(SLAB_END)),
      midDone: paint(slabDone(SLAB_MID)), leftDone: paint(slabDone(SLAB_END)), rightDone: paint(flip(slabDone(SLAB_END))),
    },
    bgs,
    pages: levelPages(level),
  };
}

// ---------- backdrop and level ----------

/** A theme's far-off scenery; drawn once, scrolled slowly. Kept dark so the sprites stay easy to read. */
function backdrop(theme: ThemeId): Img | null {
  const s = surface(VIEW_W, VIEW_H);
  if (!s) return null;
  const g = s.g;
  const r = (x: number, y: number, w: number, h: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(Math.round(x), Math.round(y), w, h);
  };
  /** Horizontal bands of color, top to bottom, from y0 down. */
  const bands = (y0: number, cols: string[], h: number) => cols.forEach((col, i) => r(0, y0 + i * h, VIEW_W, h, col));
  r(0, 0, VIEW_W, VIEW_H, LOOKS[theme].sky);
  const stars = (n: number, a: string, b: string, maxY: number) => {
    for (let i = 0; i < n; i++) r((i * 97 + (i % 7) * 13) % VIEW_W, 14 + ((i * 57) % maxY), 1, 1, i % 5 === 0 ? a : b);
  };
  switch (theme) {
    case "stacks": {
      stars(46, "#6a5a8e", "#2e2250", 92);
      const heights = [62, 88, 50, 104, 74, 58, 96, 70];
      for (let i = 0; i < heights.length; i++) {
        const x = i * 40 + 2;
        const top = VIEW_H - heights[i];
        r(x + 2, top - 6, 14, 6, C.night); // folder tab
        r(x, top, 38, heights[i], C.night);
        r(x, top, 38, 1, "#1a1030");
        r(x + 2, top - 6, 14, 1, "#1a1030");
        // little lit "windows": file labels on the stack
        for (let wy = top + 8; wy < VIEW_H - 30; wy += 12) r(x + 6 + ((wy / 4) % 3) * 8, wy, 10, 3, "#24163e");
      }
      break;
    }
    case "garden": {
      stars(30, "#5a8a6a", "#1a3a2a", 60);
      // A pale moon, then two rows of rolling hills with round trees.
      for (let y = -7; y <= 7; y++)
        for (let x = -7; x <= 7; x++) {
          const d = x * x + y * y;
          if (d > 49 || (x - 4) ** 2 + (y + 2) ** 2 <= 30) continue; // a crescent
          r(250 + x, 34 + y, 1, 1, d > 36 ? "#6f9a80" : "#a9d0b4");
        }
      for (let x = 0; x < VIEW_W; x++) {
        const h1 = 70 + Math.round(Math.sin((x / VIEW_W) * Math.PI * 4) * 12 + Math.sin((x / VIEW_W) * Math.PI * 6) * 5);
        r(x, VIEW_H - h1, 1, h1, "#0b2219");
        const h2 = 42 + Math.round(Math.sin((x / VIEW_W) * Math.PI * 2 + 1) * 10);
        r(x, VIEW_H - h2, 1, h2, "#0f2e21");
      }
      for (let i = 0; i < 9; i++) {
        const x = 12 + i * 36 + (i % 3) * 5;
        const y = VIEW_H - 58 + ((i * 7) % 12);
        r(x + 4, y + 8, 2, 14, "#081a12");
        for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) if (dx * dx + dy * dy <= 36) r(x + 5 + dx, y + 4 + dy, 1, 1, "#0d281c");
      }
      for (let i = 0; i < 14; i++) r((i * 71) % VIEW_W, 70 + ((i * 41) % 70), 1, 1, i % 2 ? "#c8ff6b" : "#6bff8f"); // fireflies
      break;
    }
    case "server": {
      bands(0, ["#03060d", "#040912", "#050b16"], 60);
      // Rows of racks, their lights left on.
      for (let i = 0; i < 8; i++) {
        const x = i * 40 + 4;
        const top = 30 + (i % 3) * 6;
        r(x, top, 32, VIEW_H - top, "#0a1220");
        r(x, top, 32, 1, "#16223a");
        r(x + 1, top + 1, 1, VIEW_H - top, "#0e1830");
        for (let u = top + 6; u < VIEW_H - 8; u += 7) {
          r(x + 4, u, 24, 4, "#0e1830");
          const k = (u * 7 + i * 13) % 11;
          r(x + 6, u + 1, 1, 1, k < 5 ? "#2a8f4a" : k < 8 ? "#1f7f99" : "#8a2338");
          r(x + 8, u + 1, 1, 1, k % 3 ? "#1f5f70" : "#2a8f4a");
          r(x + 18, u + 1, 8, 2, "#0a1220");
        }
      }
      for (let y = VIEW_H - 20; y < VIEW_H; y += 5) r(0, y, VIEW_W, 1, "#0b1424");
      break;
    }
    case "dunes": {
      bands(0, ["#120706", "#1a0a0a", "#22100e", "#2c1410", "#381a12", "#462014"], 18);
      r(0, 108, VIEW_W, VIEW_H - 108, "#462014");
      // The low sun, cut by stripes, behind the dunes.
      for (let y = -24; y <= 0; y++)
        for (let x = -24; x <= 24; x++) if (x * x + y * y <= 576 && !(y > -12 && (-y) % 4 === 1)) r(110 + x, 112 + y, 1, 1, y < -14 ? "#8a3a1c" : "#a8481c");
      for (let x = 0; x < VIEW_W; x++) {
        const h1 = 60 + Math.round(Math.sin((x / VIEW_W) * Math.PI * 2) * 14 + Math.sin((x / VIEW_W) * Math.PI * 6) * 4);
        r(x, VIEW_H - h1, 1, h1, "#2a120a");
        r(x, VIEW_H - h1, 1, 1, "#4a2412");
        const h2 = 36 + Math.round(Math.sin((x / VIEW_W) * Math.PI * 4 + 2) * 8);
        r(x, VIEW_H - h2, 1, h2, "#341810");
      }
      for (let i = 0; i < 4; i++) {
        const x = 30 + i * 80;
        const y = VIEW_H - 64 + (i % 2) * 8;
        r(x, y, 3, 16, "#1c0c06");
        r(x - 4, y + 4, 2, 6, "#1c0c06");
        r(x - 4, y + 9, 4, 2, "#1c0c06");
        r(x + 5, y + 2, 2, 6, "#1c0c06");
        r(x + 3, y + 7, 4, 2, "#1c0c06");
      }
      break;
    }
    case "frost": {
      stars(40, "#8aa0d8", "#2a3a6a", 70);
      // An aurora ribbon, snowy peaks, and snow in the air.
      for (let x = 0; x < VIEW_W; x++) {
        const y = 34 + Math.round(Math.sin(x / 23) * 8 + Math.sin(x / 9) * 2);
        r(x, y, 1, 3, x % 3 ? "#123a3a" : "#1a5a4a");
        r(x, y + 3, 1, 4, "#0c2430");
      }
      const peaks = [[20, 70], [80, 96], [150, 64], [210, 104], [280, 78], [340, 90]];
      for (const [px, hgt] of peaks) {
        for (let y = 0; y < hgt; y++) {
          const half = Math.round(y * 0.75);
          const top = VIEW_H - hgt + y;
          r(px - half, top, half * 2 + 1, 1, "#0e1834");
          if (y < hgt / 5) r(px - half, top, half * 2 + 1, 1, "#5c6e98");
          r(px + half, top, 1, 1, "#16234a");
        }
      }
      for (let i = 0; i < 40; i++) r((i * 53 + 7) % VIEW_W, 20 + ((i * 89) % 150), 1, 1, "#a9c7e8");
      break;
    }
  }
  return s.c;
}

const PAGE_W = 512;

/** A color at 55% brightness. */
function dim(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (sh: number) => Math.round(((n >> sh) & 255) * 0.55).toString(16).padStart(2, "0");
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

/** Small hash for placing props: the same column always gets the same answer. */
const hash = (c: number) => ((c * 2654435761) >>> 0) % 1000;

function levelPages(lv: Level): { x: number; img: Img }[] {
  const looks = new Map<ThemeId, { tiles: Record<string, Img | null>; cabinet: Img | null; props: (Img | null)[]; edge: string }>();
  for (const id of THEME_IDS) {
    if (!lv.sections.some((s) => s.theme === id)) continue;
    const L = LOOKS[id];
    const pal = { ...PAL, ...L.pal };
    // Props are scenery: dimmed, so nothing reads as a pickup or a foe.
    const propPal = Object.fromEntries(Object.entries(pal).map(([k, v]) => [k, dim(v)]));
    looks.set(id, {
      tiles: {
        top: paint(L.top ?? DIRT_TOP, pal), fill: paint(L.fill ?? DIRT_FILL, pal), plat: paint(PLAT_T, pal), ladder: paint(LADDER_T, pal), brick: paint(BRICK_T, pal),
      },
      cabinet: paint(cabinetRows(), pal),
      props: L.props.map((p) => paint(p, propPal)),
      edge: pal.e,
    });
  }
  const themeOf = lv.sections.map((s) => looks.get(s.theme)!);
  const W = lv.cols * T;
  const pages: { x: number; img: Img }[] = [];
  for (let px = 0; px < W; px += PAGE_W) {
    const s = surface(Math.min(PAGE_W, W - px), ROWS * T);
    if (!s) return [];
    const g = s.g;
    const c0 = Math.floor(px / T);
    const c1 = Math.min(lv.cols, Math.ceil((px + PAGE_W) / T));
    for (let c = c0; c < c1; c++) {
      const look = themeOf[sectionAt(lv, c * T)];
      // Props first, so tiles and everything else sit in front.
      const gr = lv.ground[c];
      const h = hash(c);
      if (gr > 0 && h % 7 === 0 && c > lv.startCol + 3 && c < lv.goalCol - 12) {
        const img = look.props[h % look.props.length];
        const wide = img ? Math.ceil(img.width / T) : 1;
        let clear = true;
        for (let k = 0; k < wide; k++) {
          if (lv.ground[c + k] !== gr) clear = false;
          for (let rr = gr - 3; rr < gr; rr++) if (tileAt(lv, c + k, rr) !== 0) clear = false;
        }
        if (img && clear) g.drawImage(img, c * T - px, gr * T - img.height);
      }
      for (let r = 0; r < ROWS; r++) {
        const t = tileAt(lv, c, r);
        let img: Img | null = null;
        if (t === DIRT) img = tileAt(lv, c, r - 1) === DIRT ? look.tiles.fill : look.tiles.top;
        else if (t === PLAT) img = look.tiles.plat;
        else if (t === LADDER) img = look.tiles.ladder;
        else if (t === BRICK) img = look.tiles.brick;
        if (img) g.drawImage(img, c * T - px, r * T);
        // pit walls get a dark edge
        if (t === DIRT && (lv.ground[c - 1] === -1 || lv.ground[c + 1] === -1) && r > BASE) {
          g.fillStyle = look.edge;
          g.fillRect(c * T - px + (lv.ground[c - 1] === -1 ? 0 : T - 1), r * T, 1, T);
        }
      }
    }
    for (const cb of lv.cabinets) {
      const look = themeOf[sectionAt(lv, cb.c * T)];
      if (look.cabinet && cb.c * T + 16 > px && cb.c * T < px + PAGE_W) g.drawImage(look.cabinet, cb.c * T - px, cb.r * T);
    }
    pages.push({ x: px, img: s.c });
  }
  return pages;
}
