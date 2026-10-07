// Brick Sort's pixel art: small ASCII sprites and brick faces, each drawn
// once to an offscreen canvas and then reused every frame. Without a 2D
// context (tests run in jsdom) every getter returns null and the renderer
// falls back to plain rectangles.

import { drawText, textWidth } from "../../../pixel/font";
import type { Perk } from "../../types";
import { BRICK_H, C, H, LEFT, PADDLE_H, PADDLE_W, RIGHT, TOP, W } from "./logic";

type Img = HTMLCanvasElement;

/** The dark well behind a kind icon. */
const WELL = "#120a22";
const DARK = "#1a1030";
const GOLD = "#ffd23f";
const GOLD_DK = "#9a6a10";

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

/** An ASCII sprite: one character per pixel, "." is clear. */
function paint(rows: string[], colors: Record<string, string>): Img | null {
  const s = surface(rows[0].length, rows.length);
  if (!s) return null;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = colors[row[x]];
      if (col) {
        s.g.fillStyle = col;
        s.g.fillRect(x, y, 1, 1);
      }
    }
  });
  return s.c;
}

/** Blend two #rrggbb colors. */
export function mix(a: string, b: string, t: number): string {
  const p = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  const ch = (i: number) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t).toString(16).padStart(2, "0");
  return `#${ch(0)}${ch(1)}${ch(2)}`;
}

// ---------- ASCII sprites ----------

const BALL = [".oo.", "oOOo", "oOOo", ".oo."];
const HEART = ["##.##", "#####", "#####", ".###.", "..#.."];
const DRONE = ["...###...", ".#######.", "#.o.o.o.#", ".#######.", "..#...#.."];
const WAVE = [
  [".#######.", "#.......#", "..#####..", ".#.....#.", "...###..."],
  ["#.......#", ".#######.", ".#.....#.", "..#####..", "...#.#..."],
];
/** A page with a folded corner: the mark for a file whose icon isn't loaded. */
const FILE_MARK = ["#####...", "#...##..", "#....##.", "#.....#.", "#.##..#.", "#.....#.", "#.###.#.", "#######."];
/** A crumpled scrap: filler bricks that aren't files. */
const JUNK = ["........", "..###...", ".#..##..", "#.##..#.", "#...#.##", "##.#..#.", ".#..##..", "..###..."];

const PERK_SYM: Record<Perk, string[]> = {
  health: ["##.##", "#####", "#####", ".###.", "..#.."],
  armor: [".....", "#####", "#.#.#", "#####", "....."],
  ally: ["..#..", ".###.", "#####", "#.#.#", "....."],
  rapid: ["..##.", ".##..", "####.", "..##.", ".##.."],
  spread: ["#...#", ".#.#.", "..#..", "..#..", "..#.."],
  ammo: [".###.", "##.##", "#...#", "##.##", ".###."],
  power: ["..#..", ".##..", ".###.", "#####", ".###."],
  points: ["..#..", ".###.", "#####", ".###.", "..#.."],
};

export type FaceKind = "file" | "tank" | "wall" | "filler" | "white";

/** All the pre-rendered art; created on the first draw. */
export class Art {
  readonly bg: Img | null;
  readonly ball: Img | null;
  readonly fireball: Img | null;
  readonly heart: Img | null;
  readonly drone: Img | null;
  readonly waves: (Img | null)[];
  readonly fileMark: Img | null;
  readonly paddle: Img | null;
  readonly paddleHurt: Img | null;
  readonly armorBar: Img | null;
  /** Icon wells are light (the theme's icons are dark). */
  private faces = new Map<string, Img | null>();
  private whites = new Map<number, Img | null>();
  private shields = new Map<number, Img | null>();
  private cracks = new Map<number, Img | null>();
  private pipImgs = new Map<number, Img | null>();
  private syms = new Map<string, Img | null>();
  private caps = new Map<Perk, Img | null>();
  private labels = new Map<string, Img | null>();

  constructor() {
    this.bg = background();
    this.ball = paint(BALL, { o: C.cyan, O: C.ink });
    this.fireball = paint(BALL, { o: C.red, O: C.yellow });
    this.heart = paint(HEART, { "#": C.red });
    this.drone = paint(DRONE, { "#": C.green, o: C.ink });
    this.waves = WAVE.map((rows, i) => paint(rows, { "#": i ? C.pink : C.yellow }));
    this.fileMark = paint(FILE_MARK, { "#": C.ink });
    this.paddle = paddle(C.cyan, C.pink);
    this.paddleHurt = paddle(C.yellow, C.red);
    this.armorBar = armorBar();
  }

  /** The well behind a kind icon (arcade icons are always light, so it's always dark). */
  well(_color: string): string {
    return WELL;
  }

  /** A brick's face: body, bevel, icon well, and gold trim for elite foes. */
  face(kind: FaceKind, color: string, w: number, elite: boolean): Img | null {
    const key = `${kind}|${color}|${w}|${elite}`;
    let img = this.faces.get(key);
    if (img === undefined) this.faces.set(key, (img = brickFace(kind, color, w, elite, kind === "filler" ? WELL : this.well(color))));
    return img;
  }

  /** A brick lit up white by a hit. */
  white(w: number): Img | null {
    let img = this.whites.get(w);
    if (img === undefined) this.whites.set(w, (img = brickFace("white", C.ink, w, false, WELL)));
    return img;
  }

  /** The outlined shield around a brick: one ring per layer left. */
  shield(w: number, layers: number): Img | null {
    const key = w * 10 + layers;
    let img = this.shields.get(key);
    if (img === undefined) this.shields.set(key, (img = shieldRing(w, layers)));
    return img;
  }

  crack(w: number, level: number): Img | null {
    const key = w * 10 + level;
    let img = this.cracks.get(key);
    if (img === undefined) this.cracks.set(key, (img = crackMarks(w, level)));
    return img;
  }

  /** Dots for hits left (1..6), two columns of three. */
  pips(n: number): Img | null {
    let img = this.pipImgs.get(n);
    if (img === undefined) {
      const s = surface(5, 8);
      if (s) {
        s.g.fillStyle = DARK;
        for (let i = 0; i < Math.min(6, n); i++) s.g.fillRect((i % 2) * 3, 6 - Math.floor(i / 2) * 3, 2, 2);
      }
      this.pipImgs.set(n, (img = s?.c ?? null));
    }
    return img;
  }

  /** A perk's 5x5 symbol in a color. */
  sym(perk: Perk, color: string): Img | null {
    const key = `${perk}|${color}`;
    let img = this.syms.get(key);
    if (img === undefined) this.syms.set(key, (img = paint(PERK_SYM[perk], { "#": color })));
    return img;
  }

  /** A falling capsule: a pill in the perk's color with a well for the file icon. */
  capsule(perk: Perk, color: string): Img | null {
    let img = this.caps.get(perk);
    if (img === undefined) {
      const s = surface(22, 10);
      if (s) {
        const g = s.g;
        g.fillStyle = color;
        g.fillRect(2, 0, 18, 10);
        g.fillRect(1, 1, 20, 8);
        g.fillRect(0, 2, 22, 6);
        g.fillStyle = mix(color, "#ffffff", 0.5);
        g.fillRect(12, 1, 7, 1);
        g.fillStyle = mix(color, "#000000", 0.45);
        g.fillRect(12, 8, 7, 1);
        g.fillRect(20, 3, 1, 4);
        g.fillStyle = this.well(color);
        g.fillRect(3, 1, 8, 8);
        const sym = paint(PERK_SYM[perk], { "#": DARK });
        if (sym) g.drawImage(sym, 13, 2);
      }
      this.caps.set(perk, (img = s?.c ?? null));
    }
    return img;
  }

  /** Text in the 3x5 pixel font, drawn once and kept (labels don't change). */
  label(text: string, color: string): Img | null {
    const key = `${text}|${color}`;
    let img = this.labels.get(key);
    if (img === undefined) {
      if (this.labels.size > 200) this.labels.clear();
      const s = surface(textWidth(text), 5);
      if (s) drawText(s.g, text, 0, 0, color);
      this.labels.set(key, (img = s?.c ?? null));
    }
    return img;
  }
}

/** Null when there's no 2D canvas at all (tests). */
export function makeArt(): Art | null {
  return surface(1, 1) ? new Art() : null;
}

// ---------- painters ----------

function background(): Img | null {
  const s = surface(W, H);
  if (!s) return null;
  const g = s.g;
  g.fillStyle = C.bg;
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#0e0820";
  g.fillRect(0, 0, W, TOP - 2);
  // faint dot grid
  g.fillStyle = "#1b1233";
  for (let y = TOP + 6; y < H; y += 12) for (let x = LEFT + 8; x < RIGHT; x += 12) g.fillRect(x, y, 1, 1);
  // walls: top rail and the two side pillars, with bolts
  const wall = (x: number, y: number, w: number, h: number) => {
    g.fillStyle = "#3b2e63";
    g.fillRect(x, y, w, h);
    g.fillStyle = "#5c4b8f";
    if (w > h) g.fillRect(x, y, w, 1);
    else g.fillRect(x + 1, y, 1, h);
  };
  wall(0, TOP - 2, W, 2);
  wall(0, TOP - 2, LEFT, H);
  wall(RIGHT, TOP - 2, W - RIGHT, H);
  g.fillStyle = C.lilac;
  for (let y = TOP + 8; y < H; y += 16) {
    g.fillRect(1, y, 2, 2);
    g.fillRect(RIGHT + 1, y, 2, 2);
  }
  return s.c;
}

function paddle(body: string, ends: string): Img | null {
  const s = surface(PADDLE_W, PADDLE_H);
  if (!s) return null;
  const g = s.g;
  const w = PADDLE_W;
  g.fillStyle = body;
  g.fillRect(1, 0, w - 2, PADDLE_H);
  g.fillRect(0, 1, w, PADDLE_H - 2);
  g.fillStyle = mix(body, "#ffffff", 0.6);
  g.fillRect(2, 1, w - 4, 1);
  g.fillStyle = mix(body, "#000000", 0.45);
  g.fillRect(1, PADDLE_H - 1, w - 2, 1);
  g.fillStyle = ends;
  g.fillRect(1, 0, 4, PADDLE_H);
  g.fillRect(0, 1, 1, PADDLE_H - 2);
  g.fillRect(w - 5, 0, 4, PADDLE_H);
  g.fillRect(w - 1, 1, 1, PADDLE_H - 2);
  g.fillStyle = C.ink;
  g.fillRect(2, 1, 2, 1);
  g.fillRect(w - 4, 1, 2, 1);
  return s.c;
}

function armorBar(): Img | null {
  const w = RIGHT - LEFT;
  const s = surface(w, 3);
  if (!s) return null;
  const g = s.g;
  g.fillStyle = C.green;
  g.fillRect(0, 0, w, 3);
  g.fillStyle = mix(C.green, "#000000", 0.5);
  for (let x = 2; x < w; x += 6) g.fillRect(x, 1, 3, 1);
  g.fillStyle = C.ink;
  g.fillRect(0, 0, w, 1);
  return s.c;
}

function brickFace(kind: FaceKind, color: string, w: number, elite: boolean, well: string): Img | null {
  const h = BRICK_H;
  const s = surface(w, h);
  if (!s) return null;
  const g = s.g;
  const px = (x: number, y: number, ww: number, hh: number, c: string) => {
    g.fillStyle = c;
    g.fillRect(x, y, ww, hh);
  };
  if (kind === "white") {
    px(0, 0, w, h, C.ink);
    return s.c;
  }
  const lite = mix(color, "#ffffff", 0.45);
  const dark = mix(color, "#000000", 0.5);
  px(0, 0, w, h, color);
  px(0, 0, w, 1, lite);
  px(0, 0, 1, h, lite);
  px(0, h - 1, w, 1, dark);
  px(w - 1, 0, 1, h, dark);
  if (kind === "wall") {
    // two courses of little bricks with mortar between
    const mortar = mix(color, "#000000", 0.55);
    px(0, 4, w, 1, mortar);
    px(Math.floor(w / 2), 0, 1, 4, mortar);
    px(Math.floor(w / 4), 5, 1, 5, mortar);
    px(Math.floor((w * 3) / 4), 5, 1, 5, mortar);
    px(1, 5, w - 2, 1, mix(color, "#ffffff", 0.2));
    return s.c;
  }
  // Layout of a wide brick: icon well at 1..8, name tag at 10..36, pips at w-7..w-3.
  if (kind === "tank") {
    // armor plate behind the pips, with rivets
    px(w - 8, 1, 7, h - 2, mix(color, "#000000", 0.18));
    g.fillStyle = C.ink;
    for (const x of [w - 8, w - 2]) {
      g.fillRect(x, 1, 1, 1);
      g.fillRect(x, h - 2, 1, 1);
    }
    // red hazard notches on the top and bottom edges (gold is for elites only)
    for (let x = 12; x < w - 10; x += 4) {
      px(x, 0, 2, 1, C.red);
      px(x + 1, h - 1, 2, 1, C.red);
    }
  }
  px(1, 1, 8, 8, well);
  if (kind === "filler") {
    const junk = paint(JUNK, { "#": C.lilac });
    if (junk) g.drawImage(junk, 1, 1);
  }
  if (elite) {
    // braided gold trim: shows on every body color
    for (let x = 0; x < w; x++) {
      px(x, 0, 1, 1, x % 2 ? GOLD : GOLD_DK);
      px(x, h - 1, 1, 1, x % 2 ? GOLD_DK : GOLD);
    }
    for (let y = 0; y < h; y++) {
      px(0, y, 1, 1, y % 2 ? GOLD : GOLD_DK);
      px(w - 1, y, 1, 1, y % 2 ? GOLD_DK : GOLD);
    }
    px(0, 0, 1, 1, C.ink);
    px(w - 1, 0, 1, 1, C.ink);
  }
  return s.c;
}

function shieldRing(w: number, layers: number): Img | null {
  const s = surface(w + 4, BRICK_H + 4);
  if (!s) return null;
  const g = s.g;
  const ring = (i: number, c: string) => {
    const ww = w + 4 - i * 2, hh = BRICK_H + 4 - i * 2;
    g.fillStyle = c;
    g.fillRect(i + 1, i, ww - 2, 1);
    g.fillRect(i + 1, i + hh - 1, ww - 2, 1);
    g.fillRect(i, i + 1, 1, hh - 2);
    g.fillRect(i + ww - 1, i + 1, 1, hh - 2);
  };
  // the first layer sits in the gap around the brick (white reads on every
  // body color, cyan ones included), a second, cyan one outside it
  ring(1, C.ink);
  if (layers > 1) ring(0, C.cyan);
  // bright corners like rivets on a riot shield
  g.fillStyle = C.cyan;
  for (const [x, y] of [[2, 1], [w + 1, 1], [2, BRICK_H + 2], [w + 1, BRICK_H + 2]]) g.fillRect(x, y, 1, 1);
  return s.c;
}

function crackMarks(w: number, level: number): Img | null {
  const s = surface(w, BRICK_H);
  if (!s) return null;
  const g = s.g;
  g.fillStyle = DARK;
  // short jagged cracks from the top and bottom edges (clear of labels)
  const crack = (x: number, down: boolean) => {
    const pts = down ? [[0, 0], [1, 1], [1, 2]] : [[0, 9], [-1, 8]];
    for (const [dx, y] of pts) g.fillRect(x + dx, y, 1, 1);
  };
  crack(Math.floor(w * 0.62), true);
  crack(Math.floor(w * 0.4), false);
  if (level > 1) {
    crack(Math.floor(w * 0.82), false);
    crack(Math.floor(w * 0.5), true);
    crack(Math.floor(w * 0.25), false);
  }
  return s.c;
}
