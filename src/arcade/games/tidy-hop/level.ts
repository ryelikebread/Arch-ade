// Tidy Hop's level: a strip of 8px tiles built from short chunks (flat runs,
// gaps, floating platforms, item blocks, file slabs, cabinets, terraces),
// laid out with the round's rng so the same round builds the same level.
// The strip is cut into a few sections, each a "level" of its own with a
// theme picked at random: the theme sets the look (sprites.ts) and nudges
// the layout (which chunks, gap widths, platform heights, ladders, foes).
// Pure data: no drawing, no game state.

export const T = 8;
export const ROWS = 23;
/** The usual ground row: its top surface is at y = 152. */
export const BASE = 19;
export const VIEW_W = 320;
export const VIEW_H = 180;

// Tiles
export const EMPTY = 0;
export const DIRT = 1;
export const PLAT = 2; // one-way: land on top, jump up through
export const LADDER = 3; // the top rung is one-way too
export const BLOCK = 4; // item block (2x2 tiles), solid
export const CABINET = 5; // filing cabinet obstacle, solid
export const BRICK = 6; // the stairs before the flag, solid

const START = 18;
const END = 28;
const MIN_COLS = 330;
const MAX_COLS = 640;
/** No pit starts before this column: about 12 s of running from the start (at col 3, 7.5 cols a second). */
export const SAFE_COL = 96;

/** Widest pit, in tiles: a fast foe hops 3, a tap jump clears it, every theme stays under it. */
export const MAX_GAP = 3;
/** Highest floating platform above the ground under it, in tiles (a held jump rises about 7). */
export const MAX_PLAT = 6;
/** Highest ground step (terraces), in tiles. */
export const MAX_STEP = 3;

export type ThemeId = "stacks" | "garden" | "server" | "dunes" | "frost";

type Chunk = "flat" | "gap" | "plats" | "blocks" | "slab" | "cabinet" | "terrace";

/** How a theme shapes its section: all within MAX_GAP, MAX_PLAT and MAX_STEP. */
export interface ThemeRules {
  id: ThemeId;
  /** Shown under the level title. */
  name: string;
  /** Filler chunks, picked evenly (repeat a kind to weight it). */
  fill: readonly Chunk[];
  /** Pit width range, tiles. */
  gap: [number, number];
  /** About one pit per this many columns. */
  gapEvery: number;
  /** Floating platform height range above the ground, tiles. */
  plat: [number, number];
  ladder: number;
  /** Chance of a second, higher platform. */
  upper: number;
  /** Terrace height range, tiles. */
  step: [number, number];
  /** Chance a flat run gets an extra foe spot (more foes close together elsewhere when low). */
  crowd: number;
  /** Chance a flat run gets a row of coins. */
  coins: number;
}

export const THEMES: Record<ThemeId, ThemeRules> = {
  stacks: {
    id: "stacks", name: "FOLDER STACKS", fill: ["flat", "flat", "plats", "cabinet", "terrace"],
    gap: [2, 3], gapEvery: 50, plat: [5, 5], ladder: 0.6, upper: 0.45, step: [2, 2], crowd: 0.3, coins: 0.5,
  },
  garden: {
    id: "garden", name: "MOSS GARDEN", fill: ["flat", "plats", "plats", "terrace", "flat"],
    gap: [2, 2], gapEvery: 65, plat: [4, 5], ladder: 0.85, upper: 0.6, step: [2, 2], crowd: 0.15, coins: 0.7,
  },
  server: {
    id: "server", name: "SERVER ROOM", fill: ["flat", "cabinet", "cabinet", "plats", "flat"],
    gap: [3, 3], gapEvery: 45, plat: [5, 6], ladder: 0.9, upper: 0.3, step: [2, 2], crowd: 0.6, coins: 0.4,
  },
  dunes: {
    id: "dunes", name: "SUNSET DUNES", fill: ["flat", "terrace", "terrace", "flat", "plats"],
    gap: [3, 3], gapEvery: 38, plat: [5, 6], ladder: 0.35, upper: 0.2, step: [2, 3], crowd: 0.2, coins: 0.5,
  },
  frost: {
    id: "frost", name: "FROST ARCHIVE", fill: ["flat", "plats", "terrace", "flat", "cabinet"],
    gap: [2, 3], gapEvery: 55, plat: [4, 6], ladder: 0.5, upper: 0.7, step: [2, 3], crowd: 0.35, coins: 0.8,
  },
};
export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

/** One stretch of the strip with its own theme; the first starts at column 0. */
export interface Section {
  col: number;
  theme: ThemeId;
}

/** Where a foe can start: x is the center, y the feet. */
export interface Slot {
  x: number;
  y: number;
  ground: boolean;
}

export interface Level {
  cols: number;
  tiles: Uint8Array;
  /** Top ground row per column, -1 over a pit. */
  ground: Int8Array;
  /** Top-left tile of each 2x2 item block. */
  blocks: { c: number; r: number }[];
  slabs: { c: number; r: number; len: number }[];
  cabinets: { c: number; r: number }[];
  foeSlots: Slot[];
  /** Spots in the air for floating pickups. */
  airSlots: { x: number; y: number }[];
  coins: { x: number; y: number }[];
  checkpoints: number[];
  goalCol: number;
  startCol: number;
  /** The level's sections in order (each one past the first starts at a checkpoint). */
  sections: Section[];
}

const ESTIMATE: Record<Chunk, number> = { flat: 9, gap: 6, plats: 15, blocks: 12, slab: 15, cabinet: 9, terrace: 11 };

const pick = <X>(rng: () => number, xs: readonly X[]): X => xs[Math.floor(rng() * xs.length)];
const int = (rng: () => number, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));

function lengthOf(kind: Chunk, rng: () => number, th: ThemeRules): number {
  switch (kind) {
    case "flat": return int(rng, 7, 11);
    case "gap": return 4 + int(rng, th.gap[0], th.gap[1]);
    case "plats": return int(rng, 14, 16);
    case "blocks": return 12;
    case "slab": return 15;
    case "cabinet": return 9;
    case "terrace": return int(rng, 10, 12);
  }
}

/** Level length from the number of foes: about 9 columns each, 330..640 columns in all. */
export function targetCols(nFoes: number): number {
  return Math.max(MIN_COLS, Math.min(MAX_COLS, 180 + nFoes * 9));
}

/** How many sections (levels) a strip of this many columns gets. */
export function sectionsFor(target: number): number {
  return target < 450 ? 3 : 4;
}

/** Share i of n, so the shares add up to exactly `total`. */
const share = (total: number, i: number, n: number) => Math.floor(((i + 1) * total) / n) - Math.floor((i * total) / n);

/**
 * `themes` forces the sections' themes (cycled), for tests; otherwise each
 * section picks one with the rng, never the same as the one before.
 */
export function buildLevel(nFoes: number, nBlockFriends: number, rng: () => number, themes?: readonly ThemeId[]): Level {
  const target = targetCols(nFoes);
  const middle = target - START - END;
  const nSec = sectionsFor(target);
  const picked: ThemeId[] = [];
  for (let i = 0; i < nSec; i++) {
    if (themes?.length) picked.push(themes[i % themes.length]);
    else {
      const options = THEME_IDS.filter((t) => t !== picked[i - 1]);
      picked.push(pick(rng, options));
    }
  }
  const nSlabs = Math.max(3, Math.round(target / 70));
  const nBlocks = Math.max(2, Math.ceil(nBlockFriends / 2) + 1);

  const plan: { kind: Chunk; len: number; sec: number }[] = [{ kind: "flat", len: 6, sec: 0 }];
  const sections: Section[] = [];
  let col = START + 6;
  for (let sec = 0; sec < nSec; sec++) {
    const th = THEMES[picked[sec]];
    sections.push({ col: sec === 0 ? 0 : col, theme: th.id });
    const room = share(middle, sec, nSec) - (sec === 0 ? 6 : 0);
    const list: Chunk[] = [];
    const add = (k: Chunk, n: number) => {
      for (let i = 0; i < n; i++) list.push(k);
    };
    add("slab", share(nSlabs, sec, nSec));
    add("blocks", share(nBlocks, sec, nSec));
    // The first section has no pits at all (the start is safe); later ones at least one.
    if (sec > 0) add("gap", Math.max(1, Math.round(room / th.gapEvery)));
    let est = list.reduce((s, k) => s + ESTIMATE[k], 0);
    while (est < room) {
      const k = pick(rng, th.fill);
      list.push(k);
      est += ESTIMATE[k];
    }
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    // A section never opens on a pit: its checkpoint stands on its first chunk.
    if (list[0] === "gap") {
      const j = list.findIndex((k) => k !== "gap");
      if (j > 0) [list[0], list[j]] = [list[j], list[0]];
    }
    for (const kind of list) {
      // Two pits in a row get a landing between them that even a sped-up jump can land on.
      if (kind === "gap" && plan[plan.length - 1].kind === "gap") {
        plan.push({ kind: "flat", len: 7, sec });
        col += 7;
      }
      const len = lengthOf(kind === "gap" && col < SAFE_COL ? "flat" : kind, rng, th);
      plan.push({ kind: kind === "gap" && col < SAFE_COL ? "flat" : kind, len, sec });
      col += len;
    }
  }

  const cols = col + END;
  const tiles = new Uint8Array(cols * ROWS);
  const ground = new Int8Array(cols).fill(BASE);
  const set = (c: number, r: number, t: number) => {
    if (c >= 0 && c < cols && r >= 0 && r < ROWS) tiles[r * cols + c] = t;
  };
  for (let c = 0; c < cols; c++) for (let r = BASE; r < ROWS; r++) set(c, r, DIRT);

  const lv: Level = {
    cols, tiles, ground, blocks: [], slabs: [], cabinets: [], foeSlots: [], airSlots: [], coins: [],
    checkpoints: [], goalCol: cols - 10, startCol: 3, sections,
  };
  const g = BASE;
  const gy = g * T;
  const foe = (c: number, y = gy, onGround = true) => lv.foeSlots.push({ x: c * T, y, ground: onGround });
  const coin = (x: number, y: number) => lv.coins.push({ x, y });
  const ladder = (c: number, top: number) => {
    for (let r = top; r < g; r++) set(c, r, LADDER);
  };

  let s = START;
  for (const { kind, len: n, sec } of plan) {
    const th = THEMES[picked[sec]];
    switch (kind) {
      case "flat":
        foe(s + 2);
        if (n >= 8) foe(s + n - 2);
        if (rng() < th.crowd) foe(s + n / 2);
        lv.airSlots.push({ x: (s + n / 2) * T, y: gy - 34 });
        if (rng() < th.coins) for (let i = -1; i <= 1; i++) coin((s + n / 2 + i * 1.5) * T, gy - 20);
        break;
      case "gap": {
        const gw = n - 4;
        for (let c = s + 2; c < s + 2 + gw; c++) {
          ground[c] = -1;
          for (let r = 0; r < ROWS; r++) set(c, r, EMPTY);
        }
        const mid = (s + 2 + gw / 2) * T;
        coin(mid - 12, gy - 26);
        coin(mid, gy - 34);
        coin(mid + 12, gy - 26);
        lv.airSlots.push({ x: mid, y: gy - 50 });
        break;
      }
      case "plats": {
        const len = int(rng, 5, 7);
        const a = s + 3;
        const top = g - int(rng, th.plat[0], th.plat[1]);
        for (let c = a; c < a + len; c++) set(c, top, PLAT);
        if (rng() < th.ladder) ladder(s + 2, top);
        // The upper one sits 5 rows over the lower (a plain jump), never up in the HUD.
        if (rng() < th.upper) for (let c = a + 2; c < a + 6; c++) set(c, Math.max(4, top - 5), PLAT);
        foe(a + len / 2, top * T, false);
        foe(s + n - 2);
        for (let i = 0; i < 3; i++) coin((a + 1 + i * 1.5) * T, top * T - 10);
        lv.airSlots.push({ x: (a + len / 2) * T, y: top * T - 28 });
        break;
      }
      case "blocks":
        for (const c of [s + 3, s + 7]) {
          for (let dc = 0; dc < 2; dc++) for (let dr = 0; dr < 2; dr++) set(c + dc, g - 6 + dr, BLOCK);
          lv.blocks.push({ c, r: g - 6 });
        }
        foe(s + n - 2);
        break;
      case "slab": {
        const len = int(rng, 6, 8);
        ladder(s + 3, g - 5);
        lv.slabs.push({ c: s + 4, r: g - 5, len });
        foe(s + 6);
        foe(s + 4 + len - 2);
        break;
      }
      case "cabinet":
        for (let c = s + 4; c < s + 6; c++) for (let r = g - 3; r < g; r++) set(c, r, CABINET);
        lv.cabinets.push({ c: s + 4, r: g - 3 });
        foe(s + 1.5);
        foe(s + 7.5);
        coin((s + 5) * T, (g - 3) * T - 8);
        break;
      case "terrace": {
        const top = g - int(rng, th.step[0], th.step[1]);
        for (let c = s + 2; c < s + n - 2; c++) {
          ground[c] = top;
          for (let r = top; r < g; r++) set(c, r, DIRT);
        }
        foe(s + n / 2, top * T);
        coin((s + n / 2 - 1) * T, top * T - 12);
        coin((s + n / 2 + 1) * T, top * T - 12);
        break;
      }
    }
    s += n;
  }

  // The end: stairs up, a drop, then the flag on flat ground.
  const e = cols - END;
  for (let i = 0; i < 6; i++) {
    const hgt = Math.min(4, i + 1);
    const c = e + 4 + i;
    ground[c] = g - hgt;
    for (let r = g - hgt; r < g; r++) set(c, r, BRICK);
  }
  lv.goalCol = e + 18;

  // A checkpoint at the start of every section after the first.
  for (const sec of sections.slice(1)) lv.checkpoints.push(sec.col * T + 4);
  lv.coins.splice(90);
  return lv;
}

// ---------- reading tiles ----------

export function tileAt(lv: Level, c: number, r: number): number {
  if (c < 0 || c >= lv.cols || r < 0 || r >= ROWS) return EMPTY;
  return lv.tiles[r * lv.cols + c];
}

/** Walls block bodies; the level's two ends are walls too. */
export function solid(lv: Level, c: number, r: number): boolean {
  if (c < 0 || c >= lv.cols) return true;
  const t = tileAt(lv, c, r);
  return t === DIRT || t === BLOCK || t === CABINET || t === BRICK;
}

/** Surfaces you can land on from above but pass through from below. */
export function oneWay(lv: Level, c: number, r: number): boolean {
  const t = tileAt(lv, c, r);
  return t === PLAT || (t === LADDER && tileAt(lv, c, r - 1) !== LADDER);
}

export const standable = (lv: Level, c: number, r: number) => solid(lv, c, r) || oneWay(lv, c, r);

/** The section (index into lv.sections) a world x falls in. */
export function sectionAt(lv: Level, x: number): number {
  const c = Math.floor(x / T);
  let i = 0;
  while (i + 1 < lv.sections.length && lv.sections[i + 1].col <= c) i++;
  return i;
}
