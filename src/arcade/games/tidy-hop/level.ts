// Tidy Hop's level: a strip of 8px tiles built from short chunks (flat runs,
// gaps, floating platforms, item blocks, file slabs, cabinets, terraces),
// laid out with the round's rng so the same round builds the same level.
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
}

type Chunk = "flat" | "gap" | "plats" | "blocks" | "slab" | "cabinet" | "terrace";

const ESTIMATE: Record<Chunk, number> = { flat: 9, gap: 6, plats: 15, blocks: 12, slab: 15, cabinet: 9, terrace: 11 };

const pick = <X>(rng: () => number, xs: readonly X[]): X => xs[Math.floor(rng() * xs.length)];
const int = (rng: () => number, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));

function lengthOf(kind: Chunk, rng: () => number): number {
  switch (kind) {
    case "flat": return int(rng, 7, 11);
    case "gap": return 4 + int(rng, 2, 3);
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

export function buildLevel(nFoes: number, nBlockFriends: number, rng: () => number): Level {
  const target = targetCols(nFoes);
  const middle = target - START - END;
  const list: Chunk[] = [];
  const add = (k: Chunk, n: number) => {
    for (let i = 0; i < n; i++) list.push(k);
  };
  add("slab", Math.max(3, Math.round(target / 70)));
  add("blocks", Math.max(2, Math.ceil(nBlockFriends / 2) + 1));
  add("gap", Math.max(2, Math.round(target / 50)));
  let est = list.reduce((s, k) => s + ESTIMATE[k], 0);
  while (est < middle) {
    const k = pick(rng, ["flat", "flat", "plats", "cabinet", "terrace"] as const);
    list.push(k);
    est += ESTIMATE[k];
  }
  // Shuffle, then keep gaps apart and out of the first stretch (no pit before SAFE_COL).
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  const plan: { kind: Chunk; len: number }[] = [{ kind: "flat", len: 6 }];
  let col = START + 6;
  for (let i = 0; i < list.length; i++) {
    if (list[i] === "gap" && col < SAFE_COL) {
      const j = list.findIndex((k, n) => n > i && k !== "gap");
      if (j >= 0) [list[i], list[j]] = [list[j], list[i]];
    }
    const kind = list[i];
    if (kind === "gap" && plan[plan.length - 1].kind === "gap") {
      plan.push({ kind: "flat", len: 5 });
      col += 5;
    }
    const len = lengthOf(kind, rng);
    plan.push({ kind, len });
    col += len;
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
    checkpoints: [], goalCol: cols - 10, startCol: 3,
  };
  const g = BASE;
  const gy = g * T;
  const foe = (c: number, y = gy, onGround = true) => lv.foeSlots.push({ x: c * T, y, ground: onGround });
  const coin = (x: number, y: number) => lv.coins.push({ x, y });
  const ladder = (c: number, top: number) => {
    for (let r = top; r < g; r++) set(c, r, LADDER);
  };

  let s = START;
  const starts: { col: number; kind: Chunk }[] = [];
  for (const { kind, len: n } of plan) {
    starts.push({ col: s, kind });
    switch (kind) {
      case "flat":
        foe(s + 2);
        if (n >= 8) foe(s + n - 2);
        lv.airSlots.push({ x: (s + n / 2) * T, y: gy - 34 });
        if (rng() < 0.5) for (let i = -1; i <= 1; i++) coin((s + n / 2 + i * 1.5) * T, gy - 20);
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
        for (let c = a; c < a + len; c++) set(c, g - 5, PLAT);
        if (rng() < 0.6) ladder(s + 2, g - 5);
        if (rng() < 0.45) for (let c = a + 2; c < a + 6; c++) set(c, g - 10, PLAT);
        foe(a + len / 2, (g - 5) * T, false);
        foe(s + n - 2);
        for (let i = 0; i < 3; i++) coin((a + 1 + i * 1.5) * T, (g - 5) * T - 10);
        lv.airSlots.push({ x: (a + len / 2) * T, y: (g - 5) * T - 28 });
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
        const top = g - 2;
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

  // Checkpoints at the chunk starts nearest a third and two thirds of the way.
  for (const frac of [1 / 3, 2 / 3]) {
    const want = cols * frac;
    let best = starts[0];
    for (const st of starts) if (st.kind !== "gap" && Math.abs(st.col - want) < Math.abs(best.col - want)) best = st;
    if (best && !lv.checkpoints.includes(best.col * T + 4)) lv.checkpoints.push(best.col * T + 4);
  }
  lv.coins.splice(80);
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
