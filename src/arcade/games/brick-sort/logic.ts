// Brick Sort's rules, with no drawing. Trashed and deleted files are bricks
// in a wall, kept files are power-up capsules hidden inside some of them,
// and a few extra capsules drop out of plain bricks. A big round's wall is
// split into levels, each named after a folder and built in a random theme.
// Everything is counted in ticks (30 a second) and every random number comes
// from ctx.rng, so the same round and seed always play out the same.

import type { SfxName } from "../../../audio/sfx";
import { textWidth } from "../../../pixel/font";
import type { Kind } from "../../../types";
import { MAX_FOES, filler } from "../../round";
import type { Ability, Foe, Friend, GameContext, GameResult, Perk } from "../../types";
import { THEMES, inPattern, levelCount, levelTitle, type Pattern, type Theme } from "./levels";

// ---------- the playfield ----------
export const W = 320;
export const H = 180;
/** Inside edges of the walls. */
export const LEFT = 4;
export const RIGHT = 316;
export const TOP = 12;
/** The brick grid: 13 columns of 24px, rows 11px apart. */
export const COLS = 13;
export const CELL = 24;
export const ROW = 11;
export const BRICK_H = 10;
export const GRID_Y = 16;
export const MAX_ROWS = 8;
export const PADDLE_Y = 160;
export const PADDLE_H = 5;
export const PADDLE_W = 44;
export const PADDLE_SHORT = 28;
export const PADDLE_WIDE = 64;
export const BALL = 4;
export const ARMOR_Y = 171;
export const DRONE_Y = 128;

export const READY_TICKS = 45;
export const END_TICKS = 50;
/** Fewer foes than this and filler bricks join in, so there's a level to play. */
export const MIN_FOES = 12;
export const START_LIVES = 3;
export const MAX_LIVES = 6;
export const MAX_RESERVE = 5;
export const BASE_SPEED = 1.7;
export const MAX_SPEED = 3;
/** The slow capsule's ball speed. */
export const SLOW_SPEED = 1.25;
const SPEED_UP = 0.0006;
const PADDLE_SPEED = 5;
const SERVE_AUTO = 150;
const TIMER_CAP = 900;
/** A caught ball lets go on its own after this long. */
export const CATCH_AUTO = 75;
/** Ticks between random capsule drops. */
const DROP_GAP = 240;

export const MAX_BALLS = 8;
export const MAX_WAVES = 10;
export const MAX_BOLTS = 24;
export const MAX_PARTS = 160;
export const MAX_POPUPS = 5;

// ---------- pieces ----------
export type Phase = "ready" | "play" | "clear" | "over" | "done";

export interface Brick {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** The foe this brick stands for; null for a plain wall brick (not needed to win). */
  foe: Foe | null;
  /** Index into State.foes, -1 for wall bricks. */
  ref: number;
  ability: Ability;
  hits: number;
  maxHits: number;
  shield: number;
  maxShield: number;
  elite: boolean;
  alive: boolean;
  /** One of the two halves a split brick breaks into. */
  half: boolean;
  /** Ability countdown (teleport, sonic). */
  timer: number;
  /** Blink offset (flash). */
  phase: number;
  /** Sliding speed (fast). */
  vx: number;
  /** Ticks since it last bounced, and how boxed in it is (fast). */
  run: number;
  jam: number;
  /** Ticks of shimmer left before a teleport. */
  warn: number;
  /** Ticks of white flash after a hit. */
  flash: number;
  /** A fireball can't hurt the same brick again until this is 0. */
  pierced: number;
  /** Friends (indexes into State.friends) that fall out when it breaks. */
  capsules: number[];
  /** Extra capsules (not files) that fall out when it breaks. */
  drops: Pickup[];
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alive: boolean;
  /** Sitting on the paddle, waiting for a launch. */
  stuck: boolean;
  off: number;
}

/**
 * What a capsule gives: the kept files' perks, plus three that only drop out
 * of plain bricks (wide paddle, catch paddle, slow ball).
 */
export type Pickup = Perk | "wide" | "catch" | "slow";
export const DROPS: Pickup[] = ["spread", "wide", "catch", "slow"];

/** friend: index into State.friends, or -1 for a drop that isn't a file. */
export interface Capsule { x: number; y: number; friend: number; pickup: Pickup; alive: boolean }
export interface Wave { x0: number; x: number; y: number; t: number; alive: boolean }
export interface Bolt { x: number; y: number; alive: boolean }
export interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string }
export interface Popup { text: string; x: number; y: number; t: number; color: string }
interface Blast { x: number; y: number; w: number; h: number }

export interface State {
  ctx: GameContext;
  tick: number;
  phase: Phase;
  phaseT: number;
  foes: Foe[];
  friends: Friend[];
  /** Live bricks per foe (a split foe has two halves). */
  left: number[];
  defeated: number;
  collected: number;
  score: number;
  lives: number;
  reserve: number;
  /** Big rounds take fewer hits per brick so they stay short. */
  big: boolean;
  /** Current level (0-based) and how many there are. */
  level: number;
  levels: number;
  /** This level's foes are State.foes[levelStart..levelEnd). */
  levelStart: number;
  levelEnd: number;
  /** Index into THEMES, the wall's shape, and "LEVEL 2 - DOWNLOADS". */
  theme: number;
  pattern: Pattern;
  title: string;
  rows: number;
  /** Top of the first brick row. */
  gridY: number;
  bricks: Brick[];
  nextId: number;
  paddle: { x: number; w: number; shrink: number; lastPointer: number | null };
  balls: Ball[];
  speed: number;
  serveT: number;
  stuckT: number;
  armor: number;
  rapid: number;
  rapidRate: number;
  rapidCd: number;
  fire: number;
  /** Timers for the wide paddle, the catch paddle and the slow ball. */
  wide: number;
  catch: number;
  slow: number;
  /** A ball was caught (not served): it lets go on a press, not on a held key. */
  caught: boolean;
  dropCd: number;
  drone: { t: number; x: number; tx: number; cd: number; rate: number };
  capsules: Capsule[];
  waves: Wave[];
  bolts: Bolt[];
  parts: Particle[];
  partAt: number;
  popups: Popup[];
  blasts: Blast[];
  shake: number;
  /** The file brick hit last, for the HUD. */
  lastHit: Brick | null;
  lastHitT: number;
  sinceTouch: number;
  /** Only a few file bricks left: rising balls curve toward them. */
  homing: boolean;
  /** Clear bonus, for the banner. */
  bonus: number;
  sfxAt: Partial<Record<SfxName, number>>;
  result: GameResult | null;
}

// ---------- colors shared with the renderer (particles and popups) ----------
export const C = {
  bg: "#07040f", cyan: "#4de1ff", pink: "#ff4dd2", yellow: "#ffd23f", green: "#6bff8f", red: "#ff4d6d",
  lilac: "#a493c4", ink: "#f4ecff", orange: "#ff9f43", violet: "#b07bff", steel: "#8796b8", pale: "#d7c8f0",
  dust: "#a3906f", wall: "#30254f",
};

export const FAMILY_COLOR: Record<string, string> = {
  picture: C.pink, document: C.cyan, sheet: C.green, code: C.violet, audio: C.yellow,
  video: C.red, archive: C.orange, package: C.steel, other: C.pale,
};

export const PICKUP_COLOR: Record<Pickup, string> = {
  health: C.pink, armor: C.green, ally: C.violet, rapid: C.orange, spread: C.cyan, ammo: C.lilac, power: C.red, points: C.yellow,
  wide: "#5a8cff", catch: "#d9dff0", slow: "#3fd1b0",
};
export const PERK_COLOR: Record<Perk, string> = PICKUP_COLOR;

/** The letter on each capsule (all different). */
export const PICKUP_LETTER: Record<Pickup, string> = {
  health: "P", armor: "G", ally: "D", rapid: "L", spread: "M", ammo: "X", power: "F", points: "B", wide: "E", catch: "C", slow: "S",
};

/** Plain wall bricks take the level theme's color. */
export function brickColor(b: Brick, wall: string = C.wall): string {
  if (!b.foe) return wall;
  if (!b.foe.file) return C.dust;
  return FAMILY_COLOR[b.foe.family] ?? C.pale;
}

export const themeOf = (s: State): Theme => THEMES[s.theme];
const colorOf = (s: State, b: Brick) => brickColor(b, themeOf(s).wall);

// ---------- setup ----------

/** Hits to break a foe's brick: bigger files take more, tanks and elites one more each. */
export function hitsFor(foe: Foe, big: boolean): number {
  return Math.max(1, Math.ceil(foe.hp / (big ? 3 : 2))) + (foe.ability === "tank" ? 1 : 0) + (foe.elite ? 1 : 0);
}

/** Tanks and big files get a double-width brick (with room for the label). */
export const isWide = (foe: Foe) => foe.file !== null && (foe.ability === "tank" || foe.hp >= 6);

export const cellX = (c: number) => LEFT + c * CELL + 1;
export const rowY = (s: State, r: number) => s.gridY + r * ROW;

function brick(s: State, x: number, y: number, w: number, foe: Foe | null, ref: number, rng: () => number): Brick {
  const ability: Ability = foe ? foe.ability : "basic";
  const hits = foe ? hitsFor(foe, s.big) : 1;
  const shield = ability === "shield" && foe ? 1 + (foe.hp >= 7 ? 1 : 0) : 0;
  const b: Brick = {
    id: s.nextId++, x, y, w, h: BRICK_H, foe, ref, ability, hits, maxHits: hits, shield, maxShield: shield,
    elite: !!foe?.elite, alive: true, half: false, timer: 0, phase: Math.floor(rng() * 96), vx: 0, run: 0, jam: 0, warn: 0, flash: 0, pierced: 0,
    capsules: [], drops: [],
  };
  if (ability === "teleport") b.timer = 120 + Math.floor(rng() * 120);
  if (ability === "sonic") b.timer = 60 + Math.floor(rng() * 120);
  if (ability === "fast") b.vx = (rng() < 0.5 ? -1 : 1) * (0.45 + 0.05 * (foe?.hp ?? 1));
  return b;
}

/** In-pattern cells, and in-pattern pairs for wide bricks (on even columns), for a wall of `rows` rows. */
function capacity(p: Pattern, rows: number): [number, number] {
  let cells = 0, pairs = 0;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < COLS; c++) {
      if (!inPattern(p, r, c, rows, COLS)) continue;
      cells++;
      if (c % 2 === 0 && c + 1 < COLS && inPattern(p, r, c + 1, rows, COLS)) pairs++;
    }
  return [cells, pairs];
}

/**
 * Lay this level's foes out on the grid at random, inside the level's shape,
 * then fill the rest of the shape with plain wall bricks. The wall never has
 * more than MAX_ROWS rows: with 48 foes at most it always fits (wide bricks on
 * even columns: 6 per row, 48 in 8 rows). A shape too small for the level's
 * foes grows rows; if it still can't hold them it becomes a full wall, and a
 * foe that finds no room in the shape goes outside it (never left out).
 */
function layout(s: State, rng: () => number) {
  const wide: number[] = [];
  const single: number[] = [];
  for (let i = s.levelStart; i < s.levelEnd; i++) (isWide(s.foes[i]) ? wide : single).push(i);
  const fast = (i: number) => s.foes[i].ability === "fast";
  // Fast bricks want a free cell beside them to slide into (a lane).
  let fasts = 0;
  for (let i = s.levelStart; i < s.levelEnd; i++) if (fast(i)) fasts++;
  const need = wide.length * 2 + single.length + fasts;
  const fits = (p: Pattern, rows: number) => {
    const [cells, pairs] = capacity(p, rows);
    return cells >= need * 1.3 && pairs >= wide.length * 1.4;
  };
  let rows = Math.max(4, Math.min(MAX_ROWS, Math.ceil((need * 1.3) / COLS)));
  while (rows < MAX_ROWS && !fits(s.pattern, rows)) rows++;
  if (!fits(s.pattern, rows)) {
    s.pattern = "full";
    rows = Math.max(4, Math.min(MAX_ROWS, Math.ceil((need * 1.3) / COLS)));
  }
  s.rows = rows;
  // A short wall hangs a little lower, leaving a channel above it.
  s.gridY = GRID_Y + Math.floor((MAX_ROWS - rows) / 2) * ROW;
  const shape: boolean[] = [];
  for (let k = 0; k < rows * COLS; k++) shape.push(inPattern(s.pattern, Math.floor(k / COLS), k % COLS, rows, COLS));
  // 0 free, 1 taken, 2 kept empty (a lane for a sliding brick)
  const occ: number[] = new Array(rows * COLS).fill(0);
  const shuffle = (a: number[]) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
  };
  // Shuffled, then fast ones first so they get their lanes while there's room.
  const fastFirst = (a: number, b: number) => Number(fast(b)) - Number(fast(a));
  shuffle(wide);
  shuffle(single);
  wide.sort(fastFirst);
  single.sort(fastFirst);

  const slots: number[] = [];
  const open = (k: number, lanes: boolean, inside: boolean) => (occ[k] === 0 || (lanes && occ[k] === 2)) && (!inside || shape[k]);
  /** Fill `slots` with where a brick of `cells` fits; `lanes` lets it take a lane, `room` wants a free cell beside it, `inside` keeps it in the shape. */
  const find = (cells: number, lanes: boolean, room: boolean, inside: boolean) => {
    slots.length = 0;
    // Wide bricks sit on even columns so they can never strand each other.
    for (let r = 0; r < rows; r++)
      for (let c = 0; c + cells <= COLS; c += cells) {
        const k = r * COLS + c;
        if (!open(k, lanes, inside) || (cells === 2 && !open(k + 1, lanes, inside))) continue;
        if (room && !(c > 0 && occ[k - 1] === 0) && !(c + cells < COLS && occ[k + cells] === 0)) continue;
        slots.push(k);
      }
    return slots.length > 0;
  };
  const place = (i: number, cells: number) => {
    // A spot with room to slide for fast bricks, else any free spot in the shape; a crowded wall uses the lanes, then cells outside the shape.
    const found =
      (fast(i) && find(cells, false, true, true)) || find(cells, false, false, true) || find(cells, true, false, true) ||
      find(cells, false, false, false) || find(cells, true, false, false);
    if (!found) {
      // Can't happen (see above), but never leave a foe that can't be beaten.
      s.left[i] = 0;
      s.defeated++;
      return;
    }
    const at = slots[Math.floor(rng() * slots.length)];
    for (let k = 0; k < cells; k++) occ[at + k] = 1;
    const r = Math.floor(at / COLS), c = at % COLS;
    const b = brick(s, cellX(c), rowY(s, r), cells * CELL - 2, s.foes[i], i, rng);
    s.bricks.push(b);
    if (b.ability === "fast") {
      if (c > 0 && occ[at - 1] === 0) occ[at - 1] = 2;
      if (c + cells < COLS && occ[at + cells] === 0) occ[at + cells] = 2;
    }
  };
  for (const i of wide) place(i, 2);
  for (const i of single) place(i, 1);
  const fill = themeOf(s).fill;
  for (let k = 0; k < occ.length; k++)
    if (occ[k] === 0 && shape[k] && rng() < fill) s.bricks.push(brick(s, cellX(k % COLS), rowY(s, Math.floor(k / COLS)), CELL - 2, null, -1, rng));
}

/** Hide this level's friends in bricks spread across the wall (file bricks first, then wall bricks), and two drops in wall bricks. */
function hideCapsules(s: State, rng: () => number) {
  const byColumn = (a: Brick, b: Brick) => a.x - b.x || a.y - b.y;
  const foeBricks = s.bricks.filter((b) => b.foe).sort(byColumn);
  const wallBricks = s.bricks.filter((b) => !b.foe).sort(byColumn);
  const nf = s.friends.length, L = s.levels;
  const first = Math.floor((s.level * nf) / L), end = Math.floor(((s.level + 1) * nf) / L);
  const n = end - first;
  if (n > 0) {
    const pick = (list: Brick[], k: number) => Array.from({ length: Math.min(k, list.length) }, (_, i) => list[Math.floor(((i + 0.5) * list.length) / k)]);
    const hosts = n <= foeBricks.length ? pick(foeBricks, n) : [...foeBricks, ...pick(wallBricks, n - foeBricks.length)];
    for (let i = 0; i < n; i++) hosts[i % hosts.length].capsules.push(first + i);
  }
  // Every level hides a multiball and one other drop in plain bricks.
  const free = wallBricks.filter((b) => !b.capsules.length);
  const hosts = free.length ? free : s.bricks.filter((b) => !b.capsules.length);
  for (const d of ["spread", DROPS[1 + Math.floor(rng() * (DROPS.length - 1))]] as Pickup[]) {
    if (!hosts.length) break;
    hosts.splice(Math.floor(rng() * hosts.length), 1)[0].drops.push(d);
  }
}

export function newState(ctx: GameContext): State {
  const rng = () => ctx.rng();
  // (cast() already caps foes at MAX_FOES; the wall is sized for that)
  const foes = ctx.cast.foes.slice(0, MAX_FOES);
  if (foes.length < MIN_FOES) foes.push(...filler(MIN_FOES - foes.length, rng));
  const s: State = {
    ctx, tick: 0, phase: "ready", phaseT: READY_TICKS,
    foes, friends: [...ctx.cast.friends], left: foes.map(() => 1), defeated: 0, collected: 0,
    score: 0, lives: START_LIVES, reserve: 0, big: foes.length > 24,
    level: 0, levels: levelCount(foes.length), levelStart: 0, levelEnd: 0, theme: 0, pattern: "full", title: "",
    rows: 4, gridY: GRID_Y, bricks: [], nextId: 1,
    paddle: { x: (W - PADDLE_W) / 2, w: PADDLE_W, shrink: 0, lastPointer: null },
    balls: Array.from({ length: MAX_BALLS }, () => ({ x: 0, y: 0, vx: 0, vy: 0, alive: false, stuck: false, off: 0 })),
    speed: BASE_SPEED, serveT: 0, stuckT: 0,
    armor: 0, rapid: 0, rapidRate: 8, rapidCd: 0, fire: 0, wide: 0, catch: 0, slow: 0, caught: false, dropCd: 0,
    drone: { t: 0, x: W / 2, tx: W / 2, cd: 0, rate: 30 },
    capsules: [], waves: [], bolts: [],
    parts: Array.from({ length: MAX_PARTS }, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, color: C.ink })),
    partAt: 0, popups: [], blasts: [], shake: 0, lastHit: null, lastHitT: 0, sinceTouch: 0, homing: false, bonus: 0, sfxAt: {}, result: null,
  };
  startLevel(s, 0);
  return s;
}

/** Build level k: its theme, shape, wall and capsules, with a fresh ball on the paddle. Lives, spare balls and score carry over. */
export function startLevel(s: State, k: number, force?: { theme: number; pattern: Pattern }) {
  const rng = () => s.ctx.rng();
  const n = s.foes.length;
  s.level = k;
  s.levelStart = Math.floor((k * n) / s.levels);
  s.levelEnd = Math.floor(((k + 1) * n) / s.levels);
  // A random theme, never the same one twice in a row.
  let t = Math.floor(rng() * (k ? THEMES.length - 1 : THEMES.length));
  if (k && t >= s.theme) t++;
  const shapes = THEMES[t].patterns;
  s.pattern = shapes[Math.floor(rng() * shapes.length)];
  s.theme = t;
  // (tests build every theme and shape)
  if (force) [s.theme, s.pattern] = [force.theme, force.pattern];
  s.title = levelTitle(s.ctx.folders, k);
  s.phase = "ready";
  s.phaseT = READY_TICKS;
  s.bricks = [];
  s.capsules.length = s.waves.length = s.bolts.length = s.blasts.length = s.popups.length = 0;
  for (const b of s.balls) b.alive = b.stuck = false;
  s.armor = s.rapid = s.fire = s.wide = s.catch = s.slow = s.dropCd = s.drone.t = 0;
  s.caught = false;
  s.paddle.shrink = 0;
  s.speed = BASE_SPEED;
  s.homing = false;
  s.lastHit = null;
  s.lastHitT = s.sinceTouch = s.bonus = 0;
  layout(s, rng);
  hideCapsules(s, rng);
  serveBall(s, 0);
}

// ---------- small helpers ----------

const overlap = (ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) =>
  ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Drop dead entries in place (no new array). */
function compact<T extends { alive: boolean }>(a: T[]) {
  let j = 0;
  for (let i = 0; i < a.length; i++) if (a[i].alive) a[j++] = a[i];
  a.length = j;
}

/** The same effect at most every 4 ticks. */
export function sfx(s: State, name: SfxName) {
  const at = s.sfxAt[name];
  if (at !== undefined && s.tick - at < 4) return;
  s.sfxAt[name] = s.tick;
  s.ctx.sfx(name);
}

export function spark(s: State, x: number, y: number, n: number, color: string, speed = 1.2) {
  for (let i = 0; i < n; i++) {
    const p = s.parts[s.partAt];
    s.partAt = (s.partAt + 1) % MAX_PARTS;
    const a = s.ctx.rng() * Math.PI * 2;
    const v = speed * (0.3 + s.ctx.rng() * 0.7);
    p.x = x;
    p.y = y;
    p.vx = Math.cos(a) * v;
    p.vy = Math.sin(a) * v - 0.4;
    p.life = 12 + Math.floor(s.ctx.rng() * 14);
    p.color = color;
  }
}

/** Floating text centered on x, kept whole between the side walls. */
function popup(s: State, text: string, x: number, y: number, color: string) {
  if (s.popups.length >= MAX_POPUPS) s.popups.shift();
  const half = Math.ceil(textWidth(text) / 2);
  s.popups.push({ text, x: Math.round(clamp(x, LEFT + 2 + half, RIGHT - 2 - half)), y, t: 45, color });
}

/** How few foes left turns homing on. */
export const homingAt = (s: State) => Math.max(4, Math.ceil((s.levelEnd - s.levelStart) * 0.2));

export const aliveBalls = (s: State) => s.balls.reduce((n, b) => n + (b.alive ? 1 : 0), 0);
/** Foes left in this level. */
export const foesLeft = (s: State) => s.levelEnd - s.defeated;
export const paddleCenter = (s: State) => s.paddle.x + s.paddle.w / 2;

/** A new ball sitting on the paddle; it can launch after `delay` ticks. */
function serveBall(s: State, delay: number) {
  const b = s.balls.find((x) => !x.alive);
  if (!b) return;
  b.alive = true;
  b.stuck = true;
  b.off = 0;
  b.vx = b.vy = 0;
  b.x = paddleCenter(s) - BALL / 2;
  b.y = PADDLE_Y - BALL;
  s.serveT = delay;
  s.stuckT = 0;
}

function aim(s: State, b: Ball, angle: number) {
  b.vx = Math.sin(angle) * s.speed;
  b.vy = -Math.cos(angle) * s.speed;
}

function launch(s: State) {
  let any = false;
  for (const b of s.balls)
    if (b.alive && b.stuck) {
      b.stuck = false;
      const r = (s.ctx.rng() - 0.5) * 0.6;
      // a caught ball goes where it sits on the paddle, like a bounce
      aim(s, b, b.off ? clamp(b.off / (s.paddle.w / 2), -1, 1) * 1.05 : r);
      b.off = 0;
      any = true;
    }
  s.caught = false;
  if (any) {
    sfx(s, "launch");
    s.sinceTouch = 0;
  }
}

/** Is the brick drawn right now? Flash bricks blink out (they stay solid). */
export function visible(s: State, b: Brick): boolean {
  if (b.ability !== "flash" || b.flash > 0) return true;
  return (s.tick + b.phase) % 96 < 60;
}

// ---------- damage ----------

/** Hit a brick for n: shields take it first, then hits; at 0 it breaks. */
export function damage(s: State, b: Brick, n: number) {
  if (!b.alive || s.phase !== "play") return;
  b.flash = 4;
  if (b.foe) {
    s.lastHit = b;
    s.lastHitT = 90;
  }
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  if (b.shield > 0) {
    b.shield--;
    n--;
    s.score += 20;
    spark(s, cx, cy, 6, C.cyan);
    sfx(s, "tomHi");
    if (n <= 0) return;
  }
  b.hits -= n;
  if (b.hits > 0) {
    spark(s, cx, cy, 3, colorOf(s, b), 0.8);
    sfx(s, "hit");
    return;
  }
  breakBrick(s, b);
}

function breakBrick(s: State, b: Brick) {
  b.alive = false;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  spark(s, cx, cy, b.foe ? 10 : 5, colorOf(s, b), 1.4);
  for (const f of b.capsules) {
    s.capsules.push({ x: cx, y: b.y + 2, friend: f, pickup: s.friends[f].perk, alive: true });
    sfx(s, "blip");
  }
  b.capsules.length = 0;
  for (const d of b.drops) drop(s, cx, b.y + 2, d);
  b.drops.length = 0;
  // now and then a brick with nothing inside drops something anyway
  if (s.dropCd <= 0 && s.ctx.rng() < (b.foe ? 0.07 : 0.035)) {
    drop(s, cx, b.y + 2, DROPS[Math.floor(s.ctx.rng() * DROPS.length)]);
    s.dropCd = DROP_GAP;
  }
  if (!b.foe) {
    s.score += 10;
    sfx(s, "pop");
    return;
  }
  s.score += (b.half ? 20 : 40 * b.maxHits) * (b.elite ? 2 : 1);
  if (b.ability === "split" && !b.half) return split(s, b);
  if (--s.left[b.ref] === 0) s.defeated++;
  if (b.ability === "tank") {
    s.blasts.push({ x: b.x - 14, y: b.y - 7, w: b.w + 28, h: b.h + 14 });
    spark(s, cx, cy, 24, C.orange, 2.4);
    spark(s, cx, cy, 10, C.yellow, 1.6);
    s.shake = 10;
    sfx(s, "explosion");
  } else sfx(s, "pop");
}

function drop(s: State, x: number, y: number, pickup: Pickup) {
  s.capsules.push({ x, y, friend: -1, pickup, alive: true });
  sfx(s, "blip");
}

/** An archive breaks into two halves; the foe is beaten when both are gone. */
function split(s: State, b: Brick) {
  const hw = b.w > CELL ? CELL - 2 : 10;
  const hits = Math.max(1, Math.ceil(b.maxHits / 3));
  for (const dx of [0, b.w - hw]) {
    const c: Brick = {
      ...b, id: s.nextId++, x: b.x + dx, w: hw, ability: "basic", hits, maxHits: hits, shield: 0, maxShield: 0,
      alive: true, half: true, flash: 6, pierced: 6, capsules: [],
    };
    s.bricks.push(c);
  }
  s.left[b.ref]++; // one brick became two
  sfx(s, "pop");
}

/** Tank blasts hurt everything next to them; chains are handled here too. */
function blasts(s: State) {
  for (let guard = 0; s.blasts.length && guard < 400; guard++) {
    const e = s.blasts.shift()!;
    // (halves split off by this blast aren't hit by it again)
    const n = s.bricks.length;
    for (let i = 0; i < n; i++) {
      const o = s.bricks[i];
      if (o.alive && overlap(e.x, e.y, e.w, e.h, o.x, o.y, o.w, o.h)) damage(s, o, 2);
    }
  }
  s.blasts.length = 0;
}

// ---------- perks ----------

export const PICKUP_WORD: Record<Pickup, string> = {
  health: "+LIFE", armor: "SAFETY BAR", ally: "DRONE", rapid: "LASER", spread: "MULTIBALL", ammo: "+SPARE BALL", power: "FIREBALL", points: "BONUS",
  wide: "WIDE PADDLE", catch: "CATCH", slow: "SLOW BALL",
};
export const PERK_WORD: Record<Perk, string> = PICKUP_WORD;

/** What catching a kept file's capsule does; power (1..10) sets how much. */
export const applyPerk = (s: State, f: Friend) => applyPickup(s, f.perk, f.power);

/** What catching a capsule does; power (1..10) sets how much (drops are 5). Returns the word to show. */
export function applyPickup(s: State, pickup: Pickup, p: number) {
  let word = PICKUP_WORD[pickup];
  switch (pickup) {
    case "health":
      s.lives = Math.min(MAX_LIVES, s.lives + 1 + (p >= 8 ? 1 : 0));
      break;
    case "armor":
      s.armor = Math.min(TIMER_CAP, s.armor + 240 + p * 60);
      break;
    case "ally":
      if (s.drone.t <= 0) s.drone.x = s.drone.tx = paddleCenter(s);
      s.drone.t = Math.min(TIMER_CAP, s.drone.t + 300 + p * 45);
      s.drone.rate = Math.max(10, 34 - p * 2);
      break;
    case "rapid":
      s.rapid = Math.min(TIMER_CAP, s.rapid + 240 + p * 36);
      s.rapidRate = 8 - Math.floor(p / 4);
      break;
    case "spread":
      multiball(s);
      break;
    case "ammo":
      s.reserve = Math.min(MAX_RESERVE, s.reserve + 1 + (p >= 7 ? 1 : 0));
      break;
    case "power":
      s.fire = Math.min(TIMER_CAP, s.fire + 150 + p * 30);
      break;
    case "points":
      s.score += 100 * p;
      word = `+${100 * p}`;
      break;
    case "wide":
      s.wide = Math.min(TIMER_CAP, s.wide + 360 + p * 36);
      s.paddle.shrink = 0;
      break;
    case "catch":
      s.catch = Math.min(TIMER_CAP, s.catch + 360 + p * 36);
      break;
    case "slow":
      s.slow = Math.min(TIMER_CAP, s.slow + 300 + p * 30);
      s.speed = Math.min(s.speed, SLOW_SPEED);
      break;
  }
  return word;
}

/** Every ball in flight splits into three (one ball becomes three), up to MAX_BALLS. */
function multiball(s: State) {
  if (!s.balls.some((b) => b.alive && !b.stuck)) launch(s);
  const flying = s.balls.filter((b) => b.alive && !b.stuck);
  for (const src of flying) {
    const base = Math.atan2(src.vx, -src.vy);
    for (const turn of [-0.45, 0.45]) {
      const b = s.balls.find((x) => !x.alive);
      if (!b) return;
      b.alive = true;
      b.stuck = false;
      b.off = 0;
      b.x = src.x;
      b.y = src.y;
      aim(s, b, base + turn);
      if (b.vy > 0) b.vy = -b.vy;
    }
  }
}

// ---------- the tick ----------

export function step(s: State) {
  if (s.phase === "done") return;
  s.tick++;
  if (s.shake > 0) s.shake--;
  if (s.lastHitT > 0) s.lastHitT--;
  for (const p of s.parts)
    if (p.life > 0) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.06;
      p.life--;
    }
  for (const p of s.popups) {
    p.t--;
    p.y -= 0.4;
  }
  while (s.popups.length && s.popups[0].t <= 0) s.popups.shift();

  switch (s.phase) {
    case "ready":
      movePaddle(s);
      holdStuck(s);
      if (--s.phaseT <= 0) s.phase = "play";
      break;
    case "play":
      play(s);
      break;
    case "clear":
      crumble(s);
      if (--s.phaseT <= 0) {
        if (s.level + 1 < s.levels) startLevel(s, s.level + 1);
        else finish(s);
      }
      break;
    case "over":
      if (--s.phaseT <= 0) finish(s);
      break;
  }
}

/** After a clear, what's left of the wall falls apart (just for show). */
function crumble(s: State) {
  for (const b of s.bricks)
    if (b.alive) {
      b.alive = false;
      spark(s, b.x + b.w / 2, b.y + 5, 4, colorOf(s, b), 1);
      sfx(s, "pop");
      return;
    }
}

function finish(s: State) {
  s.phase = "done";
  s.result = {
    won: s.defeated >= s.foes.length,
    score: Math.max(0, Math.round(s.score)),
    defeated: Math.min(s.defeated, s.foes.length),
    foes: s.foes.length,
    collected: s.collected,
  };
  s.ctx.end(s.result);
}

function play(s: State) {
  const { input } = s.ctx;
  if (s.armor > 0) s.armor--;
  if (s.rapid > 0) s.rapid--;
  if (s.fire > 0) s.fire--;
  if (s.wide > 0) s.wide--;
  if (s.catch > 0) s.catch--;
  if (s.slow > 0) s.slow--;
  if (s.dropCd > 0) s.dropCd--;
  if (s.paddle.shrink > 0) s.paddle.shrink--;
  for (const b of s.bricks) {
    if (b.flash > 0) b.flash--;
    if (b.pierced > 0) b.pierced--;
  }
  movePaddle(s);
  holdStuck(s);

  // Launch: Space/click, or on its own after a few seconds. A caught ball
  // waits for a fresh press (holding Space for the laser doesn't let go of it).
  if (s.balls.some((b) => b.alive && b.stuck)) {
    s.stuckT++;
    if (s.serveT > 0) s.serveT--;
    else if (s.caught ? input.pressed("fire") || input.clicked() || s.stuckT > CATCH_AUTO : input.held("fire") || input.pressed("fire") || input.clicked() || s.stuckT > SERVE_AUTO)
      launch(s);
  }
  // X: send a spare ball up.
  if (input.pressed("alt") && s.reserve > 0 && aliveBalls(s) < MAX_BALLS) {
    s.reserve--;
    const b = s.balls.find((x) => !x.alive)!;
    b.alive = true;
    b.stuck = false;
    b.x = paddleCenter(s) - BALL / 2;
    b.y = PADDLE_Y - BALL - 1;
    aim(s, b, (s.ctx.rng() - 0.5) * 0.8);
    sfx(s, "launch");
  }
  // Rapid fire: bolts from both ends of the paddle while fire is held.
  if (s.rapidCd > 0) s.rapidCd--;
  if (s.rapid > 0 && (input.held("fire") || input.clicked()) && s.rapidCd <= 0 && s.bolts.length <= MAX_BOLTS - 2) {
    s.bolts.push({ x: s.paddle.x + 3, y: PADDLE_Y - 4, alive: true }, { x: s.paddle.x + s.paddle.w - 4, y: PADDLE_Y - 4, alive: true });
    s.rapidCd = s.rapidRate;
    sfx(s, "shoot");
  }

  bricks(s);
  if (s.slow > 0) s.speed = Math.min(s.speed, SLOW_SPEED);
  else if (s.balls.some((b) => b.alive && !b.stuck)) s.speed = Math.min(MAX_SPEED, s.speed + SPEED_UP);
  balls(s);
  bolts(s);
  drone(s);
  waves(s);
  capsules(s);
  blasts(s);

  if (!s.homing && foesLeft(s) <= homingAt(s) && s.defeated < s.foes.length) {
    s.homing = true;
    popup(s, "LAST FILES: BALLS HOME IN", W / 2, 128, C.cyan);
    sfx(s, "beam");
  }
  if (s.defeated >= s.levelEnd) {
    s.phase = "clear";
    s.phaseT = END_TICKS;
    s.bonus = s.lives * 250 + s.reserve * 100;
    s.score += s.bonus;
    for (const c of s.capsules) spark(s, c.x, c.y + 5, 3, PICKUP_COLOR[c.pickup]);
    s.capsules.length = s.waves.length = s.bolts.length = 0;
    sfx(s, "chime");
    return;
  }
  if (aliveBalls(s) === 0) {
    if (s.reserve > 0) {
      s.reserve--;
      serveBall(s, 20);
      popup(s, "SPARE BALL", paddleCenter(s), PADDLE_Y - 14, C.lilac);
      sfx(s, "jump");
    } else {
      s.lives--;
      sfx(s, "hurt");
      s.fire = s.rapid = s.paddle.shrink = s.wide = s.catch = s.slow = 0;
      s.speed = BASE_SPEED;
      s.waves.length = 0;
      if (s.lives <= 0) {
        s.phase = "over";
        s.phaseT = END_TICKS;
      } else {
        serveBall(s, 30);
        popup(s, "MISS", paddleCenter(s), PADDLE_Y - 14, C.red);
      }
    }
  }
}

function movePaddle(s: State) {
  const p = s.paddle;
  const { input } = s.ctx;
  const w = p.shrink > 0 ? PADDLE_SHORT : s.wide > 0 ? PADDLE_WIDE : PADDLE_W;
  if (w !== p.w) {
    p.x += (p.w - w) / 2;
    p.w = w;
  }
  const dir = (input.held("right") ? 1 : 0) - (input.held("left") ? 1 : 0);
  const px = input.pointerX();
  if (dir) p.x += dir * PADDLE_SPEED;
  else if (px !== null && px !== p.lastPointer) p.x = px - p.w / 2;
  p.lastPointer = px;
  p.x = clamp(p.x, LEFT, RIGHT - p.w);
}

function holdStuck(s: State) {
  for (const b of s.balls)
    if (b.alive && b.stuck) {
      b.off = clamp(b.off, -(s.paddle.w / 2 - 3), s.paddle.w / 2 - 3);
      b.x = paddleCenter(s) + b.off - BALL / 2;
      b.y = PADDLE_Y - BALL;
    }
}

// ---------- abilities ----------

const slotBuf: number[] = [];

/** A free grid slot the brick fits in, away from the balls; null if none. */
function freeSlot(s: State, b: Brick): [number, number] | null {
  slotBuf.length = 0;
  const cells = b.w > CELL ? 2 : 1;
  for (let r = 0; r < s.rows; r++)
    for (let c = 0; c + cells <= COLS; c++) {
      const x = cellX(c), y = rowY(s, r);
      if (x === b.x && y === b.y) continue;
      let free = true;
      for (const o of s.bricks)
        if (o !== b && o.alive && overlap(x - 1, y, b.w + 2, b.h, o.x, o.y, o.w, o.h)) {
          free = false;
          break;
        }
      if (free)
        for (const ball of s.balls)
          if (ball.alive && overlap(x - 6, y - 6, b.w + 12, b.h + 12, ball.x, ball.y, BALL, BALL)) {
            free = false;
            break;
          }
      if (free) slotBuf.push(x, y);
    }
  if (!slotBuf.length) return null;
  const k = Math.floor(s.ctx.rng() * (slotBuf.length / 2)) * 2;
  return [slotBuf[k], slotBuf[k + 1]];
}

function slide(s: State, b: Brick) {
  const nx = b.x + b.vx;
  let blocked = nx < LEFT + 1 || nx + b.w > RIGHT - 1;
  if (!blocked)
    for (const o of s.bricks)
      if (o !== b && o.alive && o.y === b.y && overlap(nx - 1, b.y, b.w + 2, b.h, o.x, o.y, o.w, o.h)) {
        blocked = true;
        break;
      }
  if (!blocked)
    for (const ball of s.balls)
      if (ball.alive && overlap(nx, b.y, b.w, b.h, ball.x, ball.y, BALL, BALL)) {
        blocked = true;
        break;
      }
  if (blocked) {
    b.vx = -b.vx;
    b.run = 0;
    b.jam = Math.min(30, b.jam + 5);
  } else {
    b.x = nx;
    b.run++;
    if (b.jam > 0) b.jam--;
  }
  // Boxed in (bouncing every tick or two): it revs and puffs exhaust until a neighbor breaks.
  if (jammed(b) && (s.tick + b.phase) % 12 === 0) spark(s, b.vx > 0 ? b.x : b.x + b.w, b.y + b.h - 2, 2, C.lilac, 0.5);
}

/** A fast brick with no room to slide. */
export const jammed = (b: Brick) => b.jam > 10;

function bricks(s: State) {
  const n = s.bricks.length;
  for (let i = 0; i < n; i++) {
    const b = s.bricks[i];
    if (!b.alive) continue;
    switch (b.ability) {
      case "fast":
        slide(s, b);
        break;
      case "teleport":
        if (b.warn > 0 && --b.warn === 0) {
          const to = freeSlot(s, b);
          if (to) {
            spark(s, b.x + b.w / 2, b.y + 5, 8, C.violet);
            b.x = to[0];
            b.y = to[1];
            spark(s, b.x + b.w / 2, b.y + 5, 8, C.violet);
            sfx(s, "whoosh");
          }
          b.timer = 150 + Math.floor(s.ctx.rng() * 120);
        } else if (b.warn === 0 && --b.timer <= 0) b.warn = 20;
        break;
      case "sonic":
        if (--b.timer <= 0) {
          b.timer = 150 - (b.foe?.hp ?? 1) * 6 + Math.floor(s.ctx.rng() * 60);
          if (s.waves.length < MAX_WAVES) {
            const x = b.x + b.w / 2;
            s.waves.push({ x0: x, x, y: b.y + b.h, t: 0, alive: true });
            sfx(s, "beam");
          }
        }
        break;
    }
  }
}

// ---------- moving things ----------

function bounceOffPaddle(s: State, b: Ball) {
  const p = s.paddle;
  const t = clamp((b.x + BALL / 2 - (p.x + p.w / 2)) / (p.w / 2 + BALL / 2), -1, 1);
  aim(s, b, t * 1.05 + (s.ctx.rng() - 0.5) * 0.08);
  b.y = PADDLE_Y - BALL;
  s.sinceTouch = 0;
  sfx(s, "bounce");
}

/** The catch paddle holds the ball where it landed until fire is pressed. */
function catchBall(s: State, b: Ball) {
  b.stuck = true;
  b.off = b.x + BALL / 2 - paddleCenter(s);
  b.vx = b.vy = 0;
  b.y = PADDLE_Y - BALL;
  s.caught = true;
  s.stuckT = 0;
  s.serveT = 0;
  s.sinceTouch = 0;
  sfx(s, "tom");
}

/** Keep the speed, and never let a ball fly nearly flat (no endless side-to-side loops). */
function settle(s: State, b: Ball) {
  if (Math.abs(b.vx) > Math.abs(b.vy) * 2.6) b.vy = (b.vy < 0 ? -1 : 1) * (Math.abs(b.vx) / 2.6);
  const m = Math.hypot(b.vx, b.vy) || 1;
  b.vx = (b.vx / m) * s.speed;
  b.vy = (b.vy / m) * s.speed;
}

/** The first live brick the ball overlaps. */
function brickAt(s: State, b: Ball): Brick | null {
  for (const o of s.bricks) if (o.alive && overlap(b.x, b.y, BALL, BALL, o.x, o.y, o.w, o.h)) return o;
  return null;
}

function balls(s: State) {
  const fire = s.fire > 0;
  s.sinceTouch++;
  for (const b of s.balls) {
    if (!b.alive || b.stuck) continue;
    // Stuck in a loop that touches nothing for 15 s: tilt it a little.
    if (s.sinceTouch > 450) {
      const a = Math.atan2(b.vx, -b.vy) + (s.ctx.rng() < 0.5 ? -0.35 : 0.35);
      aim(s, b, a);
    }
    if (s.homing && b.vy < 0) home(s, b);
    settle(s, b);
    const steps = Math.ceil(s.speed / 1.5);
    for (let k = 0; k < steps && b.alive && !b.stuck; k++) {
      // x first
      const dx = b.vx / steps;
      b.x += dx;
      if (b.x < LEFT) {
        b.x = LEFT;
        b.vx = Math.abs(b.vx);
        sfx(s, "bounce");
      } else if (b.x + BALL > RIGHT) {
        b.x = RIGHT - BALL;
        b.vx = -Math.abs(b.vx);
        sfx(s, "bounce");
      }
      let o = brickAt(s, b);
      if (o) {
        s.sinceTouch = 0;
        if (fire) {
          if (o.pierced === 0) {
            o.pierced = 10;
            damage(s, o, 2);
          }
        } else {
          b.x -= dx;
          b.vx = -b.vx;
          damage(s, o, 1);
        }
      }
      // then y
      const dy = b.vy / steps;
      b.y += dy;
      if (b.y < TOP) {
        b.y = TOP;
        b.vy = Math.abs(b.vy);
        sfx(s, "bounce");
      }
      o = brickAt(s, b);
      if (o) {
        s.sinceTouch = 0;
        if (fire) {
          if (o.pierced === 0) {
            o.pierced = 10;
            damage(s, o, 2);
          }
        } else {
          b.y -= dy;
          b.vy = -b.vy;
          damage(s, o, 1);
        }
      }
      const p = s.paddle;
      if (b.vy > 0 && overlap(b.x, b.y, BALL, BALL, p.x, PADDLE_Y, p.w, PADDLE_H) && b.y + BALL - dy <= PADDLE_Y + 2) {
        if (s.catch > 0) catchBall(s, b);
        else bounceOffPaddle(s, b);
        continue;
      }
      if (s.armor > 0 && b.vy > 0 && b.y + BALL >= ARMOR_Y) {
        b.y = ARMOR_Y - BALL;
        b.vy = -Math.abs(b.vy);
        sfx(s, "bounce");
      }
      if (b.y > H) b.alive = false;
    }
    if (b.stuck) continue;
    settle(s, b);
    if (fire && s.tick % 2 === 0) spark(s, b.x + BALL / 2, b.y + BALL / 2, 1, s.tick % 4 ? C.orange : C.yellow, 0.3);
  }
  if (s.sinceTouch > 450) s.sinceTouch = 0;
}

/** Turn a rising ball a little toward the nearest file brick above it. */
function home(s: State, b: Ball) {
  let best: Brick | null = null;
  let bestD = Infinity;
  for (const o of s.bricks) {
    if (!o.alive || !o.foe || o.y + o.h > b.y) continue;
    const d = Math.abs(o.x + o.w / 2 - b.x) + (b.y - o.y) * 0.5;
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  if (!best) return;
  const want = Math.atan2(best.x + best.w / 2 - (b.x + BALL / 2), -(best.y + best.h / 2 - (b.y + BALL / 2)));
  const now = Math.atan2(b.vx, -b.vy);
  aim(s, b, now + clamp(want - now, -0.03, 0.03));
}

function bolts(s: State) {
  for (const t of s.bolts) {
    t.y -= 5;
    if (t.y < TOP) {
      t.alive = false;
      continue;
    }
    for (const o of s.bricks)
      if (o.alive && overlap(t.x, t.y, 1, 4, o.x, o.y, o.w, o.h)) {
        damage(s, o, 1);
        t.alive = false;
        break;
      }
  }
  compact(s.bolts);
}

/** The helper drone hovers under the lowest file brick and shoots it. */
function drone(s: State) {
  const d = s.drone;
  if (d.t <= 0) return;
  d.t--;
  if (s.tick % 10 === 0) {
    let best: Brick | null = null;
    for (const o of s.bricks)
      if (o.alive && o.foe && (!best || o.y > best.y || (o.y === best.y && Math.abs(o.x + o.w / 2 - d.x) < Math.abs(best.x + best.w / 2 - d.x)))) best = o;
    if (best) d.tx = best.x + best.w / 2;
  }
  d.x += clamp(d.tx - d.x, -1.5, 1.5);
  if (--d.cd <= 0) {
    d.cd = d.rate;
    if (s.bolts.length < MAX_BOLTS) {
      s.bolts.push({ x: Math.round(d.x), y: DRONE_Y - 4, alive: true });
      sfx(s, "shoot");
    }
  }
}

/** Sound waves fall slowly and wobble; touching one shrinks the paddle for a while. */
function waves(s: State) {
  const p = s.paddle;
  for (const w of s.waves) {
    w.t++;
    w.y += 0.7;
    w.x = w.x0 + Math.sin(w.t * 0.2) * 3;
    if (overlap(w.x - 4, w.y, 9, 5, p.x, PADDLE_Y, p.w, PADDLE_H)) {
      w.alive = false;
      p.shrink = 150;
      spark(s, w.x, PADDLE_Y, 6, C.yellow);
      popup(s, "SHRUNK!", w.x, PADDLE_Y - 12, C.yellow);
      sfx(s, "sizzle");
    } else if (w.y > H) w.alive = false;
  }
  compact(s.waves);
}

function capsules(s: State) {
  const p = s.paddle;
  for (const c of s.capsules) {
    c.y += 0.9;
    if (overlap(c.x - 11, c.y, 22, 10, p.x, PADDLE_Y, p.w, PADDLE_H)) {
      c.alive = false;
      const f = c.friend >= 0 ? s.friends[c.friend] : null;
      const word = f ? applyPerk(s, f) : applyPickup(s, c.pickup, 5);
      if (f) s.collected++;
      s.score += 50;
      const color = PICKUP_COLOR[c.pickup];
      popup(s, f ? `${f.label} ${word}` : word, c.x, PADDLE_Y - 14, color);
      spark(s, c.x, PADDLE_Y, 8, color);
      sfx(s, c.pickup === "points" ? "coin" : "powerup");
    } else if (c.y > H) c.alive = false;
  }
  compact(s.capsules);
}

/** The kind icon for a brick or capsule (null for filler and wall bricks). */
export const kindOf = (b: Brick): Kind | null => b.foe?.file?.kind ?? null;
