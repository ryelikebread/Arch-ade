// Tidy Hop's pixel art, all original and drawn in code: ASCII sprites (one
// character per pixel) and the level's static tiles, each painted once to
// an offscreen canvas and reused every frame. Without a 2D context (tests
// run in jsdom) every canvas comes back null and the renderer skips it.

import type { Ability, Perk } from "../../types";
import { BASE, BRICK, DIRT, LADDER, PLAT, ROWS, T, tileAt, VIEW_H, VIEW_W, type Level } from "./level";

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

// ---------- the art set ----------

export interface Art {
  player: Record<string, [Img | null, Img | null]>;
  big: Record<string, [Img | null, Img | null]>;
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
  bg: Img | null;
  /** The static level, in pages 512px wide. */
  pages: { x: number; img: Img }[];
}

const both = (rows: string[], pal: Record<string, string> = PAL): [Img | null, Img | null] => [paint(rows, pal), paint(flip(rows), pal)];

export function buildArt(level: Level): Art {
  const player: Art["player"] = {};
  const big: Art["big"] = {};
  for (const [name, rows] of Object.entries(PLAYER_FRAMES)) {
    player[name] = both(rows);
    big[name] = both(bigger(rows));
  }
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
    bg: backdrop(),
    pages: levelPages(level),
  };
}

// ---------- backdrop and level ----------

/** Far-off stacks of folders and a few stars; drawn once, scrolled slowly. */
function backdrop(): Img | null {
  const s = surface(VIEW_W, VIEW_H);
  if (!s) return null;
  const g = s.g;
  g.fillStyle = C.bg;
  g.fillRect(0, 0, VIEW_W, VIEW_H);
  for (let i = 0; i < 46; i++) {
    g.fillStyle = i % 5 === 0 ? "#6a5a8e" : "#2e2250";
    g.fillRect((i * 97 + (i % 7) * 13) % VIEW_W, 14 + ((i * 57) % 92), 1, 1);
  }
  const heights = [62, 88, 50, 104, 74, 58, 96, 70];
  for (let i = 0; i < heights.length; i++) {
    const x = i * 40 + 2;
    const top = VIEW_H - heights[i];
    g.fillStyle = C.night;
    g.fillRect(x + 2, top - 6, 14, 6); // folder tab
    g.fillRect(x, top, 38, heights[i]);
    g.fillStyle = "#1a1030";
    g.fillRect(x, top, 38, 1);
    g.fillRect(x + 2, top - 6, 14, 1);
    // little lit "windows": file labels on the stack
    g.fillStyle = "#24163e";
    for (let wy = top + 8; wy < VIEW_H - 30; wy += 12) g.fillRect(x + 6 + ((wy / 4) % 3) * 8, wy, 10, 3);
  }
  return s.c;
}

const PAGE_W = 512;

function levelPages(lv: Level): { x: number; img: Img }[] {
  const tiles: Record<string, Img | null> = {
    top: paint(DIRT_TOP), fill: paint(DIRT_FILL), plat: paint(PLAT_T), ladder: paint(LADDER_T), brick: paint(BRICK_T),
  };
  const cabinet = paint(cabinetRows());
  const W = lv.cols * T;
  const pages: { x: number; img: Img }[] = [];
  for (let px = 0; px < W; px += PAGE_W) {
    const s = surface(Math.min(PAGE_W, W - px), ROWS * T);
    if (!s) return [];
    const g = s.g;
    const c0 = Math.floor(px / T);
    const c1 = Math.min(lv.cols, Math.ceil((px + PAGE_W) / T));
    for (let c = c0; c < c1; c++) {
      for (let r = 0; r < ROWS; r++) {
        const t = tileAt(lv, c, r);
        let img: Img | null = null;
        if (t === DIRT) img = tileAt(lv, c, r - 1) === DIRT ? tiles.fill : tiles.top;
        else if (t === PLAT) img = tiles.plat;
        else if (t === LADDER) img = tiles.ladder;
        else if (t === BRICK) img = tiles.brick;
        if (img) g.drawImage(img, c * T - px, r * T);
        // pit walls get a dark edge
        if (t === DIRT && (lv.ground[c - 1] === -1 || lv.ground[c + 1] === -1) && r > BASE) {
          g.fillStyle = "#1c0f30";
          g.fillRect(c * T - px + (lv.ground[c - 1] === -1 ? 0 : T - 1), r * T, 1, T);
        }
      }
    }
    if (cabinet) for (const cb of lv.cabinets) if (cb.c * T + 16 > px && cb.c * T < px + PAGE_W) g.drawImage(cabinet, cb.c * T - px, cb.r * T);
    pages.push({ x: px, img: s.c });
  }
  return pages;
}
