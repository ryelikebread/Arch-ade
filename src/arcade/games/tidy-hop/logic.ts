// Tidy Hop's rules, with no drawing: a hopping player crosses a scrolling
// level; trashed files walk it as critters, kept files wait in item blocks,
// and file slabs drop on whatever walks below once you've walked across
// them. Everything moves in whole ticks (30 a second) and only the round's
// rng decides anything random, so the same round replays the same.

import type { SfxName } from "../../../audio/sfx";
import type { Kind } from "../../../types";
import { filler } from "../../round";
import type { Ability, Cast, Foe, Friend, GameResult, Input } from "../../types";
import { BASE, buildLevel, LADDER, oneWay, ROWS, sectionAt, solid, standable, T, tileAt, VIEW_W, type Level, type ThemeId } from "./level";

export const READY_TICKS = 45;
export const MIN_FOES = 10;
export const MAX_ACTIVE = 14;
/** Balls in the air at once: enough for rapid + spread (3 every 5 ticks, each lasting SHOT_LIFE). */
export const MAX_SHOTS = 27;
export const SHOT_LIFE = 45;
export const MAX_WAVES = 10;
export const MAX_PARTS = 64;
export const START_SHOTS = 5;
export const MAX_HEARTS = 5;
export const INV_TICKS = 60;
export const SLAB_H = 7;
export const FLASH_CYCLE = 150;
export const GOAL_TICKS = 50;
export const GOAL_PER_FOE = 100;
export const OVER_TICKS = 30;
/** How long a level's title shows when you walk into it. */
export const TITLE_TICKS = 75;
export const POPUP_TICKS = 40;
export const MAX_POPUPS = 4;
/** How far the magnet reaches, in pixels. */
export const MAGNET_R = 72;

/** Power-ups that aren't files: they wait in some coin blocks, float once per level, and elites drop them. */
export const POWERS = ["wings", "star", "magnet", "zoom"] as const;
export type PowerId = (typeof POWERS)[number];
/** How long each lasts, in ticks. */
export const POWER_TICKS: Record<PowerId, number> = { wings: 600, star: 240, magnet: 540, zoom: 420 };
/** Said over your head when you pick it up. */
export const POWER_LABEL: Record<PowerId, string> = { wings: "DOUBLE JUMP", star: "STAR", magnet: "MAGNET", zoom: "SPEED UP" };
/** Said when a kept file's perk is picked up. */
export const PERK_LABEL: Record<string, string> = {
  health: "HEARTS", armor: "HELMET", ally: "HELPER", rapid: "RAPID THROW", spread: "TRIPLE THROW", ammo: "PAPER BALLS", power: "BIG", points: "BONUS",
};

// Player physics, in pixels per tick.
const G = 0.42;
const G_HOLD = 0.2;
const HOLD = 12;
export const JUMP_V = 5.2;
const MAX_FALL = 6;
const RUN = 2;
const ACC = 0.3;
/** Running with the speed boost. */
export const RUN_FAST = 3;
const ACC_FAST = 0.45;
/** The double jump: a little less than a ground jump. */
const AIR_JUMP_V = 4.6;
const FRICTION = 0.35;
const CLIMB = 1.5;
const COYOTE = 5;
const LEDGE = 6;

export const SMALL = { w: 10, h: 14 };
export const BIG = { w: 10, h: 20 };

export interface Body {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  onGround: boolean;
}

export interface Player extends Body {
  facing: 1 | -1;
  climbing: boolean;
  hearts: number;
  maxHearts: number;
  lives: number;
  armor: number;
  big: boolean;
  stompDmg: number;
  shots: number;
  rapidT: number;
  spreadT: number;
  inv: number;
  stun: number;
  throwCd: number;
  holdT: number;
  /** A few ticks after walking off an edge when a jump still works. */
  coyote: number;
  /** Ticks left of the death animation (0 when alive). */
  dead: number;
  /** Slab under the feet, or -1. */
  onSlab: number;
  prevBottom: number;
  respawnX: number;
  /** Ticks moving, for the run cycle. */
  anim: number;
  /** Ticks left of each power-up (0 when off). */
  pw: Record<PowerId, number>;
  /** Double jumps left before landing. */
  airJumps: number;
}

export type How = "stomp" | "shot" | "squash" | "ally" | "bump" | "fall" | "star";

export interface Enemy extends Body {
  foe: Foe | null;
  label: string;
  kind: Kind | null;
  ability: Ability;
  elite: boolean;
  hits: number;
  maxHits: number;
  shield: boolean;
  dir: 1 | -1;
  speed: number;
  /** Ticks alive, and a per-foe offset for the flash cycle. */
  timer: number;
  phase: number;
  /** Ability countdown (teleport, sonic, tank slam). */
  cd: number;
  /** Flash: out of sight and untouchable. */
  hidden: boolean;
  /** Sonic: ticks of the shout pose. */
  shout: number;
  /** Teleport: ticks of the arrival sparkle. */
  blink: number;
  mini: boolean;
  /** Split: index of the foe a mini came from; that foe's minis still around. */
  parent: number;
  kids: number;
  active: boolean;
  state: "alive" | "dying" | "gone";
  dieT: number;
  how: How | "";
  /** Ticks of the white hit flash. */
  hurt: number;
}

export interface Slab {
  x: number;
  y: number;
  len: number;
  pressed: number[];
  count: number;
  state: "rest" | "fall" | "landed" | "gone";
  vy: number;
  landY: number;
  squashed: number;
}

export interface Block {
  c: number;
  r: number;
  /** Index into friends, or -1 for a coin or power-up block. */
  friend: number;
  power: PowerId | null;
  used: boolean;
  bump: number;
}

export interface Pickup {
  /** Index into friends, or -1 for a power-up. */
  friend: number;
  power: PowerId | null;
  x: number;
  y: number;
  /** float: waits in the air; pop: rises out of a block, then flies to you. */
  mode: "float" | "pop";
  t: number;
  taken: boolean;
}

export interface Coin {
  x: number;
  y: number;
  taken: boolean;
}

export interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

export interface Wave {
  x: number;
  y: number;
  vx: number;
  life: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: number;
}

export interface Ally extends Body {
  on: boolean;
  t: number;
  dmg: number;
  cd: number;
  friend: number;
  facing: 1 | -1;
}

/** Words over the player's head for a moment (what was just picked up). */
export interface Popup {
  text: string;
  color: number;
  x: number;
  y: number;
  t: number;
}

/** A level: one section of the strip, titled after one of the round's folders. */
export interface Stage {
  x: number;
  title: string;
  theme: ThemeId;
}

export interface Env {
  cast: Cast;
  /** Folder names for level titles (the game context always has some). */
  folders?: readonly string[];
  rng(): number;
  sfx(name: SfxName): void;
  end(r: GameResult): void;
}

export interface World {
  level: Level;
  foes: Foe[];
  friends: Friend[];
  player: Player;
  enemies: Enemy[];
  slabs: Slab[];
  blocks: Block[];
  pickups: Pickup[];
  coins: Coin[];
  shots: Shot[];
  waves: Wave[];
  parts: Particle[];
  partAt: number;
  ally: Ally;
  popups: Popup[];
  stages: Stage[];
  /** The level you're in, and the tick you walked into it (its title shows for a while). */
  stage: number;
  stageT: number;
  checkpoints: { x: number; on: boolean }[];
  goalX: number;
  cam: number;
  shake: number;
  tick: number;
  phase: "ready" | "play" | "goal" | "over" | "done";
  phaseT: number;
  score: number;
  defeated: number;
  foesTotal: number;
  collected: number;
  won: boolean;
  /** The foe hit most recently, for the HUD, and when. */
  lastHit: number;
  lastHitT: number;
  /** Last tick each sound played (rate limit). */
  lastSfx: Record<string, number>;
  env: Env;
}

/** Stomps or shots a foe takes: bigger files need more, elites and tanks one more. */
export function hitsFor(f: Foe): number {
  return Math.min(6, Math.ceil(f.hp / 3) + (f.elite ? 1 : 0) + (f.ability === "tank" ? 1 : 0));
}

const SPEED: Record<Ability, number> = { flash: 0.5, shield: 0.45, teleport: 0.5, sonic: 0.4, fast: 1.5, split: 0.55, tank: 0.3, basic: 0.5 };
export const SIZE = { normal: { w: 14, h: 17 }, tank: { w: 22, h: 23 }, mini: { w: 10, h: 13 } };

// ---------- building ----------

/** A folder name as a level title: upper case, short enough for the banner. */
export function folderTitle(name: string): string {
  const s = name.toUpperCase().replace(/[^A-Z0-9 ._-]+/g, " ").replace(/\s+/g, " ").trim() || "FILES";
  return s.length > 14 ? s.slice(0, 13) + "." : s;
}

/** `themes` forces the levels' themes, for tests. */
export function createWorld(env: Env, themes?: readonly ThemeId[]): World {
  const rng = env.rng;
  const foes = [...env.cast.foes];
  if (foes.length < MIN_FOES) foes.push(...filler(MIN_FOES - foes.length, rng));
  const friends = env.cast.friends;
  const inBlocks = friends.map((_, i) => i).filter((i) => friends[i].perk !== "points");
  const floating = friends.map((_, i) => i).filter((i) => friends[i].perk === "points");
  const level = buildLevel(foes.length, inBlocks.length, rng, themes);
  const folders = env.folders?.length ? env.folders : ["Files"];

  const w: World = {
    level, foes, friends,
    player: newPlayer(level),
    enemies: [], slabs: [], blocks: [], pickups: [], coins: [], shots: [], waves: [],
    parts: Array.from({ length: MAX_PARTS }, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, color: 0 })),
    partAt: 0,
    ally: { on: false, t: 0, dmg: 1, cd: 0, friend: -1, facing: 1, x: 0, y: 0, w: 8, h: 16, vx: 0, vy: 0, onGround: false },
    popups: [],
    stages: level.sections.map((s, i) => ({ x: s.col * T, title: folderTitle(folders[i % folders.length]), theme: s.theme })),
    stage: 0, stageT: 0,
    checkpoints: level.checkpoints.map((x) => ({ x, on: false })),
    goalX: level.goalCol * T,
    cam: 0, shake: 0, tick: 0, phase: "ready", phaseT: 0,
    score: 0, defeated: 0, foesTotal: foes.length, collected: 0, won: false,
    lastHit: -1, lastHitT: 0, lastSfx: {}, env,
  };

  // Blocks: friends spread evenly through them, the rest give a coin.
  w.blocks = level.blocks.map(({ c, r }) => ({ c, r, friend: -1, power: null, used: false, bump: 0 }));
  inBlocks.forEach((fi, j) => {
    const b = w.blocks[Math.floor(((j + 0.5) * w.blocks.length) / inBlocks.length)];
    if (b && b.friend < 0) b.friend = fi;
    else w.pickups.push(floatAt(w, fi, j, inBlocks.length));
  });
  // Points files float like big coins.
  const air = level.airSlots;
  floating.forEach((fi, j) => {
    const a = floating.length <= air.length ? air[Math.floor(((j + 0.5) * air.length) / floating.length)] : air[j];
    w.pickups.push(a ? { friend: fi, power: null, x: a.x - 6, y: a.y - 6, mode: "float", t: 0, taken: false } : floatAt(w, fi, j, floating.length));
  });
  placePowers(w);
  w.coins = level.coins.map(({ x, y }) => ({ x, y, taken: false }));
  w.slabs = level.slabs.map(({ c, r, len }) => ({
    x: c * T, y: r * T, len, pressed: new Array<number>(len).fill(0), count: 0, state: "rest" as const, vy: 0, landY: 0, squashed: 0,
  }));
  placeFoes(w);
  w.cam = camTarget(w);
  return w;
}

function newPlayer(lv: Level): Player {
  const x = lv.startCol * T;
  return {
    x, y: BASE * T - SMALL.h, w: SMALL.w, h: SMALL.h, vx: 0, vy: 0, onGround: true,
    facing: 1, climbing: false, hearts: 3, maxHearts: 3, lives: 3, armor: 0, big: false, stompDmg: 1,
    shots: START_SHOTS, rapidT: 0, spreadT: 0, inv: 0, stun: 0, throwCd: 0, holdT: 0, coyote: 0, dead: 0, onSlab: -1,
    prevBottom: BASE * T, respawnX: x, anim: 0, pw: { wings: 0, star: 0, magnet: 0, zoom: 0 }, airJumps: 0,
  };
}

/** A floating pickup over solid ground, for friends that found no block or air slot. */
function floatAt(w: World, fi: number, j: number, n: number): Pickup {
  const lv = w.level;
  let c = Math.floor(20 + ((j + 0.5) * (lv.cols - 50)) / Math.max(1, n));
  while (c < lv.cols - 1 && lv.ground[c] < 0) c++;
  const gy = (lv.ground[c] < 0 ? BASE : lv.ground[c]) * T;
  return { friend: fi, power: null, x: c * T + 1, y: gy - 40, mode: "float", t: 0, taken: false };
}

/**
 * Power-ups: one floats in each level (at a free air spot), and about a third
 * of the blocks with no file in them hold one. Dealt from a shuffled deck so
 * a round sees every kind before any repeats.
 */
function placePowers(w: World) {
  const rng = w.env.rng;
  let deck: PowerId[] = [];
  const draw = (): PowerId => {
    if (!deck.length) {
      deck = [...POWERS];
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
    }
    return deck.pop()!;
  };
  const lv = w.level;
  const taken = (x: number, y: number) => w.pickups.some((k) => Math.abs(k.x + 6 - x) < 24 && Math.abs(k.y + 6 - y) < 24);
  lv.sections.forEach((sec, i) => {
    const end = lv.sections[i + 1]?.col ?? lv.cols;
    // Not the very start: the first level's power-up waits a little way in.
    const spots = lv.airSlots.filter((a) => a.x >= Math.max(sec.col, 30) * T && a.x < end * T && !taken(a.x, a.y));
    const a = spots[Math.floor(rng() * spots.length)];
    if (a) w.pickups.push({ friend: -1, power: draw(), x: a.x - 6, y: a.y - 6, mode: "float", t: 0, taken: false });
  });
  for (const b of w.blocks) if (b.friend < 0 && rng() < 0.34) b.power = draw();
}

/** Easier foes first: sorted by strength along the level, tanks only on the ground. */
function placeFoes(w: World) {
  const slots = [...w.level.foeSlots].sort((a, b) => a.x - b.x);
  const uses = new Array<number>(slots.length).fill(0);
  const order = w.foes.map((_, i) => i).sort((a, b) => w.foes[a].hp - w.foes[b].hp || a - b);
  const first = slots[0]?.x ?? 200;
  const last = slots[slots.length - 1]?.x ?? first;
  order.forEach((fi, k) => {
    const f = w.foes[fi];
    const tank = f.ability === "tank";
    const ideal = first + ((k + 0.5) / order.length) * (last - first);
    let best = -1;
    for (const pass of [0, 1]) {
      for (let i = 0; i < slots.length; i++) {
        if ((tank && !slots[i].ground) || (pass === 0 && uses[i] > 0)) continue;
        if (best < 0 || Math.abs(slots[i].x - ideal) < Math.abs(slots[best].x - ideal)) best = i;
      }
      if (best >= 0) break;
    }
    const s = best >= 0 ? slots[best] : { x: ideal, y: BASE * T, ground: true };
    let x = s.x;
    if (best >= 0 && uses[best] > 0) {
      const nx = s.x + (uses[best] % 2 ? 14 : -14) * Math.ceil(uses[best] / 2);
      if (standable(w.level, Math.floor(nx / T), Math.floor(s.y / T))) x = nx;
    }
    if (best >= 0) uses[best]++;
    w.enemies.push(newEnemy(w, f, x, s.y));
  });
}

function newEnemy(w: World, f: Foe, cx: number, feet: number): Enemy {
  const size = f.ability === "tank" ? SIZE.tank : SIZE.normal;
  const hits = hitsFor(f);
  const rng = w.env.rng;
  return {
    x: cx - size.w / 2, y: feet - size.h, w: size.w, h: size.h, vx: 0, vy: 0, onGround: false,
    foe: f, label: f.label, kind: f.file?.kind ?? null, ability: f.ability, elite: f.elite,
    hits, maxHits: hits, shield: f.ability === "shield", dir: -1,
    speed: SPEED[f.ability] * (f.elite ? 1.2 : 1),
    timer: 0, phase: Math.floor(rng() * FLASH_CYCLE),
    cd: f.ability === "tank" ? 90 + Math.floor(rng() * 60) : 40 + Math.floor(rng() * 80),
    hidden: false, shout: 0, blink: 0, mini: false, parent: -1, kids: 0, active: false,
    state: "alive", dieT: 0, how: "", hurt: 0,
  };
}

// ---------- shared movement ----------

/** Move along x; stop at walls. True when a wall was hit. */
export function moveX(lv: Level, b: Body): boolean {
  if (b.vx === 0) return false;
  b.x += b.vx;
  const top = Math.floor(b.y / T);
  const bot = Math.floor((b.y + b.h - 1) / T);
  if (b.vx > 0) {
    const c = Math.floor((b.x + b.w - 1) / T);
    for (let r = top; r <= bot; r++) if (solid(lv, c, r)) return (b.x = c * T - b.w), true;
  } else {
    const c = Math.floor(b.x / T);
    for (let r = top; r <= bot; r++) if (solid(lv, c, r)) return (b.x = (c + 1) * T), true;
  }
  return false;
}

/** Move along y; land on solid and one-way tops. Returns the tile index the head bumped, or -1. */
export function moveY(lv: Level, b: Body): number {
  const prevBottom = b.y + b.h;
  b.y += b.vy;
  b.onGround = false;
  const l = Math.floor(b.x / T);
  const rt = Math.floor((b.x + b.w - 1) / T);
  if (b.vy > 0) {
    const r = Math.floor((b.y + b.h - 0.001) / T);
    const top = r * T;
    for (let c = l; c <= rt; c++) {
      if (solid(lv, c, r) || (oneWay(lv, c, r) && prevBottom <= top + 0.01)) {
        b.y = top - b.h;
        b.vy = 0;
        b.onGround = true;
        return -1;
      }
    }
  } else if (b.vy < 0) {
    // Check the column over the middle first, so a bump hits the block above the head.
    const r = Math.floor(b.y / T);
    const mid = Math.floor((b.x + b.w / 2) / T);
    for (let k = 0; k < 3; k++) {
      const c = k === 0 ? mid : k === 1 ? l : rt;
      if (solid(lv, c, r)) {
        b.y = (r + 1) * T;
        b.vy = 0;
        return r * lv.cols + c;
      }
    }
  }
  return -1;
}

const overlap = (a: { x: number; y: number; w: number; h: number }, x: number, y: number, w: number, h: number) =>
  a.x < x + w && a.x + a.w > x && a.y < y + h && a.y + a.h > y;

/** True when a solid tile overlaps this box. */
export function blocked(lv: Level, x: number, y: number, w: number, h: number): boolean {
  const l = Math.floor(x / T);
  const rt = Math.floor((x + w - 1) / T);
  const bot = Math.floor((y + h - 1) / T);
  for (let c = l; c <= rt; c++) for (let r = Math.floor(y / T); r <= bot; r++) if (solid(lv, c, r)) return true;
  return false;
}

/** True when a body of this size can stand with its feet at y + h, at x. */
function canStand(lv: Level, x: number, y: number, w: number, h: number): boolean {
  if (x < 0 || x + w > lv.cols * T) return false;
  const r = Math.floor((y + h) / T);
  const l = Math.floor(x / T);
  const rt = Math.floor((x + w - 1) / T);
  for (let c = l; c <= rt; c++) for (let rr = Math.floor(y / T); rr < r; rr++) if (solid(lv, c, rr)) return false;
  return standable(lv, l, r) && standable(lv, rt, r);
}

// ---------- effects ----------

function sfx(w: World, name: SfxName) {
  const last = w.lastSfx[name];
  if (last !== undefined && w.tick - last < 4) return;
  w.lastSfx[name] = w.tick;
  w.env.sfx(name);
}

/** Particle colors, by index (draw.ts has the matching list). */
export const PART = { dust: 0, spark: 1, coin: 2, paper: 3, red: 4, cyan: 5, pink: 6, green: 7 } as const;

function burst(w: World, x: number, y: number, n: number, color: number, speed = 1.5) {
  for (let i = 0; i < n; i++) {
    const p = w.parts[w.partAt];
    w.partAt = (w.partAt + 1) % MAX_PARTS;
    const a = (i / n) * Math.PI * 2 + w.tick * 0.7;
    p.x = x;
    p.y = y;
    p.vx = Math.cos(a) * speed;
    p.vy = Math.sin(a) * speed - 0.8;
    p.life = 14 + (i % 3) * 4;
    p.color = color;
  }
}

// ---------- the tick ----------

export function step(w: World, input: Input) {
  if (w.phase === "done") return;
  w.tick++;
  if (w.shake > 0) w.shake--;
  updateParticles(w);
  updatePopups(w);
  if (w.phase === "ready") {
    if (++w.phaseT >= READY_TICKS) {
      w.phase = "play";
      w.phaseT = 0;
    }
    return;
  }
  if (w.phase === "goal") return goalSlide(w);
  if (w.phase === "over") {
    if (++w.phaseT >= OVER_TICKS) finish(w, false);
    return;
  }
  updatePlayer(w, input);
  if (w.phase !== "play") return;
  touchThings(w);
  if (w.phase !== "play") return;
  updateEnemies(w);
  playerVsEnemies(w);
  updateAlly(w);
  updateSlabs(w);
  updateShots(w);
  updateWaves(w);
  updatePickups(w);
  for (const b of w.blocks) if (b.bump > 0) b.bump--;
  w.cam += (camTarget(w) - w.cam) * 0.25;
  const st = sectionAt(w.level, w.player.x + w.player.w / 2);
  if (st > w.stage) {
    w.stage = st;
    w.stageT = w.tick;
  }
}

/** Words over the player's head; the oldest goes when there are too many. */
export function popup(w: World, text: string, color: number) {
  const p = w.player;
  if (w.popups.length >= MAX_POPUPS) w.popups.shift();
  // Stack under one still rising, so two pickups in a row stay readable.
  const y = Math.max(p.y - 10, ...w.popups.filter((q) => q.t > POPUP_TICKS - 12).map((q) => q.y + 8));
  w.popups.push({ text, color, x: p.x + p.w / 2, y, t: POPUP_TICKS });
}

function updatePopups(w: World) {
  for (let i = w.popups.length - 1; i >= 0; i--) {
    const q = w.popups[i];
    if (--q.t <= 0) w.popups.splice(i, 1);
    else if (q.t > 10) q.y -= 0.5;
  }
}

export function camTarget(w: World): number {
  const p = w.player;
  const max = w.level.cols * T - VIEW_W;
  return Math.max(0, Math.min(max, p.x + p.w / 2 - 140));
}

export function finish(w: World, won: boolean) {
  if (w.phase === "done") return;
  w.phase = "done";
  w.won = won;
  w.env.end({ won, score: Math.round(w.score), defeated: Math.min(w.defeated, w.foesTotal), foes: w.foesTotal, collected: w.collected });
}

function updateParticles(w: World) {
  for (const p of w.parts) {
    if (p.life <= 0) continue;
    p.life--;
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.15;
  }
}

// ---------- player ----------

function updatePlayer(w: World, inp: Input) {
  const p = w.player;
  const lv = w.level;
  if (p.dead > 0) {
    p.vy = Math.min(p.vy + G, MAX_FALL);
    p.y += p.vy;
    if (--p.dead === 0) {
      if (p.lives <= 0) {
        w.phase = "over";
        w.phaseT = 0;
      } else respawn(w);
    }
    return;
  }
  if (p.inv > 0) p.inv--;
  if (p.throwCd > 0) p.throwCd--;
  if (p.rapidT > 0) p.rapidT--;
  if (p.spreadT > 0) p.spreadT--;
  for (const k of POWERS) if (p.pw[k] > 0) p.pw[k]--;
  const free = p.stun === 0;
  if (p.stun > 0) p.stun--;
  const dir = free ? (inp.held("right") ? 1 : 0) - (inp.held("left") ? 1 : 0) : 0;
  const jumpHeld = inp.held("fire");

  if (p.climbing) climb(w, inp, dir);
  else {
    const run = p.pw.zoom > 0 ? RUN_FAST : RUN;
    if (dir) {
      p.vx = Math.max(-run, Math.min(run, p.vx + dir * (p.pw.zoom > 0 ? ACC_FAST : ACC)));
      p.facing = dir as 1 | -1;
      p.anim++;
    } else if (p.onGround || free) p.vx = Math.abs(p.vx) <= FRICTION ? 0 : p.vx - Math.sign(p.vx) * FRICTION;
    if (free && (inp.held("up") || inp.held("down"))) startClimb(w, inp.held("up"));
    if (!p.climbing) {
      // Hold fire on landing to keep hopping; a jump still works just after leaving an edge.
      if (p.onGround) p.coyote = COYOTE;
      else if (p.coyote > 0) p.coyote--;
      if (free && jumpHeld && (p.onGround || (p.coyote > 0 && p.vy >= 0))) {
        p.vy = -JUMP_V - (p.big ? 0.3 : 0);
        p.holdT = HOLD;
        p.onGround = false;
        p.coyote = 0;
        sfx(w, "jump");
      } else if (free && !p.onGround && p.airJumps > 0 && p.pw.wings > 0 && inp.pressed("fire")) {
        // Wings: one more jump in the air, with a puff under the feet.
        p.airJumps--;
        p.vy = -AIR_JUMP_V;
        p.holdT = HOLD / 2;
        burst(w, p.x + p.w / 2, p.y + p.h, 6, PART.cyan, 1.2);
        sfx(w, "jump");
      }
      const g = p.vy < 0 && jumpHeld && p.holdT > 0 ? G_HOLD : G;
      p.holdT = jumpHeld && p.holdT > 0 ? p.holdT - 1 : 0;
      p.vy = Math.min(p.vy + g, MAX_FALL);
      p.prevBottom = p.y + p.h;
      if (moveX(lv, p) && dir) ledgeAssist(lv, p, dir);
      const bumped = moveY(lv, p);
      p.onSlab = -1;
      if (!p.onGround && p.vy >= 0) landOnSlab(w);
      if (bumped >= 0) bumpBlock(w, bumped);
      if (p.onGround) p.airJumps = 1;
      if (p.onGround && !dir) p.anim = 0;
    }
  }

  // Throw a paper ball (three with spread); rapid lets you hold the button.
  const wantThrow = inp.pressed("alt") || (inp.held("alt") && p.rapidT > 0);
  if (wantThrow && p.throwCd === 0 && p.shots > 0 && !p.climbing) throwBalls(w);

  if (p.y > ROWS * T + 8) die(w, true);
}

/** Falling just short of a ledge: if the feet are a few pixels under its top, step up onto it. */
function ledgeAssist(lv: Level, p: Player, dir: number) {
  if (p.vy < 0) return;
  const c = Math.floor((dir > 0 ? p.x + p.w : p.x - 1) / T);
  const r = Math.floor((p.y + p.h - 1) / T);
  const top = r * T;
  if (!solid(lv, c, r) || solid(lv, c, r - 1) || p.y + p.h - top > LEDGE) return;
  for (let rr = Math.floor((top - p.h) / T); rr < r; rr++) if (solid(lv, c, rr)) return;
  p.y = top - p.h;
  p.x += dir;
  p.vy = 0;
  p.onGround = true;
}

function landOnSlab(w: World) {
  const p = w.player;
  const bottom = p.y + p.h;
  for (let i = 0; i < w.slabs.length; i++) {
    const s = w.slabs[i];
    if (s.state !== "rest") continue;
    if (p.prevBottom <= s.y + 0.01 && bottom >= s.y && p.x + p.w > s.x && p.x < s.x + s.len * T) {
      p.y = s.y - p.h;
      p.vy = 0;
      p.onGround = true;
      p.onSlab = i;
      return;
    }
  }
}

const isLadder = (lv: Level, c: number, r: number) => tileAt(lv, c, r) === LADDER;

function startClimb(w: World, up: boolean) {
  const p = w.player;
  const lv = w.level;
  const c = Math.floor((p.x + p.w / 2) / T);
  const feet = Math.floor((p.y + p.h - 1) / T);
  const mid = Math.floor((p.y + p.h / 2) / T);
  const below = Math.floor((p.y + p.h) / T);
  const ok = up ? isLadder(lv, c, feet) || isLadder(lv, c, mid) : p.onGround && isLadder(lv, c, below);
  if (!ok) return;
  p.climbing = true;
  p.airJumps = 1;
  p.x = c * T + T / 2 - p.w / 2;
  p.vx = 0;
  p.vy = 0;
  p.onGround = false;
  if (!up) p.y += 2;
}

function climb(w: World, inp: Input, dir: number) {
  const p = w.player;
  const lv = w.level;
  if (inp.pressed("fire")) {
    p.climbing = false;
    p.vy = -JUMP_V * 0.8;
    p.vx = dir * RUN;
    sfx(w, "jump");
    return;
  }
  if (dir && !inp.held("up") && !inp.held("down")) {
    // Step off sideways.
    p.climbing = false;
    p.vx = dir * 1.2;
    p.facing = dir as 1 | -1;
    return;
  }
  const vy = inp.held("up") ? -CLIMB : inp.held("down") ? CLIMB : 0;
  if (vy) p.anim++;
  p.y += vy;
  const c = Math.floor((p.x + p.w / 2) / T);
  const feet = Math.floor((p.y + p.h - 1) / T);
  if (!isLadder(lv, c, feet)) {
    p.climbing = false;
    if (vy < 0 || !solid(lv, c, feet)) {
      // Off the top rung: stand on it.
      if (vy <= 0) {
        p.y = (feet + 1) * T - p.h;
        p.onGround = true;
      }
    } else {
      p.y = feet * T - p.h;
      p.onGround = true;
    }
    p.vy = 0;
  }
}

const SPREAD_VY = [-3.2, -1.4, 0.4];

function throwBalls(w: World) {
  const p = w.player;
  // All balls still in the air: wait, and keep the ammo.
  if (w.shots.length >= MAX_SHOTS) return;
  const n = p.spreadT > 0 ? 3 : 1;
  for (let i = 0; i < n && w.shots.length < MAX_SHOTS; i++) {
    const vy = n === 3 ? SPREAD_VY[i] : -1.2;
    w.shots.push({ x: p.x + p.w / 2 - 2 + p.facing * 5, y: p.y + 4, vx: p.facing * 3.6 + p.vx * 0.4, vy, life: SHOT_LIFE });
  }
  p.shots--;
  p.throwCd = p.rapidT > 0 ? 5 : 12;
  sfx(w, "shoot");
}

export function hurtPlayer(w: World, fromX: number) {
  const p = w.player;
  if (p.inv > 0 || p.pw.star > 0 || p.dead > 0 || w.phase !== "play") return;
  if (p.armor > 0) {
    p.armor--;
    sfx(w, "bounce");
    burst(w, p.x + p.w / 2, p.y, 6, PART.cyan);
  } else if (p.big) {
    shrink(p);
    sfx(w, "hurt");
  } else {
    p.hearts--;
    sfx(w, "hurt");
    if (p.hearts <= 0) return die(w, false);
  }
  // A small knock back, so a hit over a pit doesn't also cost the jump.
  p.inv = INV_TICKS;
  p.climbing = false;
  p.vx = (p.x + p.w / 2 < fromX ? -1 : 1) * 1.2;
  p.vy = Math.min(p.vy, -2.5);
  p.onGround = false;
  p.stun = 4;
}

function shrink(p: Player) {
  p.big = false;
  p.stompDmg = 1;
  p.y += p.h - SMALL.h;
  p.h = SMALL.h;
}

function grow(p: Player) {
  if (!p.big) {
    p.y -= BIG.h - p.h;
    p.h = BIG.h;
  }
  p.big = true;
}

export function die(w: World, pit: boolean) {
  const p = w.player;
  if (p.dead > 0) return;
  p.lives--;
  p.dead = pit ? 30 : 45;
  p.vy = pit ? 0 : -5;
  p.vx = 0;
  p.climbing = false;
  p.hearts = 0;
  sfx(w, pit ? "whoosh" : "hurt");
}

function respawn(w: World) {
  const p = w.player;
  const lv = w.level;
  let c = Math.floor(p.respawnX / T);
  while (c < lv.cols - 1 && lv.ground[c] < 0) c++;
  if (p.big) shrink(p);
  p.x = c * T;
  p.y = lv.ground[c] * T - p.h;
  p.vx = p.vy = 0;
  p.hearts = p.maxHearts;
  p.inv = INV_TICKS + 30;
  p.stun = 0;
  p.climbing = false;
  p.onGround = true;
  p.rapidT = p.spreadT = 0;
  for (const k of POWERS) p.pw[k] = 0;
  w.cam = camTarget(w);
}

// ---------- blocks, coins, pickups, checkpoints, goal ----------

function bumpBlock(w: World, idx: number) {
  const c = idx % w.level.cols;
  const r = Math.floor(idx / w.level.cols);
  const b = w.blocks.find((b) => c >= b.c && c <= b.c + 1 && r >= b.r && r <= b.r + 1);
  if (!b) return;
  b.bump = 8;
  // Foes standing on top get knocked.
  for (const e of w.enemies) if (e.state === "alive" && overlap(e, b.c * T, b.r * T - 4, 16, 4)) hitEnemy(w, e, 1, "bump");
  if (b.used) return sfx(w, "tom");
  b.used = true;
  if (b.friend >= 0 || b.power) {
    w.pickups.push({ friend: b.friend, power: b.power, x: b.c * T + 2, y: b.r * T - 4, mode: "pop", t: 0, taken: false });
    sfx(w, "blip");
  } else {
    w.score += 10;
    burst(w, b.c * T + 8, b.r * T - 4, 5, PART.coin);
    sfx(w, "coin");
  }
}

function touchThings(w: World) {
  const p = w.player;
  if (p.dead > 0) return;
  const pcx = p.x + p.w / 2;
  const pcy = p.y + p.h / 2;
  for (const c of w.coins) {
    if (!c.taken && p.pw.magnet > 0) pull(c, pcx, pcy, 0, 0, 3.5);
    if (!c.taken && overlap(p, c.x - 3, c.y - 3, 6, 7)) {
      c.taken = true;
      w.score += 10;
      sfx(w, "coin");
    }
  }
  for (const cp of w.checkpoints) {
    if (!cp.on && p.x > cp.x) {
      cp.on = true;
      p.respawnX = cp.x;
      p.hearts = Math.max(p.hearts, p.maxHearts);
      w.score += 100;
      sfx(w, "chime");
    }
  }
  if (p.x + p.w >= w.goalX) {
    w.phase = "goal";
    w.phaseT = 0;
    // Flag bonus: lives left, how high you grabbed the pole, and every foe tidied on the way.
    const height = Math.max(0, BASE * T - (p.y + p.h));
    w.score += 500 + p.lives * 200 + Math.round(height) * 5 + Math.min(w.defeated, w.foesTotal) * GOAL_PER_FOE;
    p.x = w.goalX - p.w + 1;
    p.vx = 0;
    p.climbing = false;
    sfx(w, "jingle");
  }
}

function goalSlide(w: World) {
  const p = w.player;
  const floor = BASE * T - p.h;
  if (p.y < floor) p.y = Math.min(floor, p.y + 2);
  if (++w.phaseT >= GOAL_TICKS) finish(w, true);
}

/** The magnet: drag a thing (offset ox, oy to its middle) toward the player when close. */
function pull(o: { x: number; y: number }, px: number, py: number, ox: number, oy: number, speed: number) {
  const dx = px - (o.x + ox);
  const dy = py - (o.y + oy);
  const d = Math.hypot(dx, dy);
  if (d > MAGNET_R || d < 0.5) return;
  const v = Math.min(d, speed);
  o.x += (dx / d) * v;
  o.y += (dy / d) * v;
}

function updatePickups(w: World) {
  const p = w.player;
  for (const k of w.pickups) {
    if (k.taken) continue;
    k.t++;
    if (k.mode === "float" && p.pw.magnet > 0 && p.dead === 0) pull(k, p.x + p.w / 2, p.y + p.h / 2, 6, 6, 2.5);
    if (k.mode === "pop") {
      if (k.t <= 10) k.y -= 1.6;
      else {
        // Fly to the player.
        const dx = p.x + p.w / 2 - (k.x + 6);
        const dy = p.y + p.h / 2 - (k.y + 6);
        const d = Math.hypot(dx, dy) || 1;
        const v = Math.min(d, 4);
        k.x += (dx / d) * v;
        k.y += (dy / d) * v;
      }
    }
    if (p.dead === 0 && overlap(p, k.x, k.y, 12, 12)) {
      k.taken = true;
      if (k.power) applyPower(w, k.power);
      else applyPerk(w, w.friends[k.friend]);
    }
  }
}

/** A kept file's perk, scaled by its power (1..10). */
export function applyPerk(w: World, f: Friend) {
  const p = w.player;
  const pw = f.power;
  w.collected++;
  w.score += 50;
  switch (f.perk) {
    case "health":
      if (pw >= 8 && p.maxHearts < MAX_HEARTS) p.maxHearts++;
      p.hearts = Math.min(p.maxHearts, Math.max(p.hearts, 0) + 1 + Math.floor(pw / 4));
      burst(w, p.x + p.w / 2, p.y, 6, PART.red);
      break;
    case "armor":
      p.armor = Math.min(3, p.armor + 1 + (pw >= 7 ? 1 : 0));
      break;
    case "ally": {
      const a = w.ally;
      if (!a.on) {
        a.x = p.x;
        a.y = p.y + p.h - a.h;
        a.vx = a.vy = 0;
      }
      a.on = true;
      a.t = Math.max(a.t, 450 + pw * 60);
      a.dmg = Math.max(a.dmg, 1 + (pw >= 6 ? 1 : 0));
      a.friend = w.friends.indexOf(f);
      break;
    }
    case "rapid":
      p.rapidT = Math.max(p.rapidT, 240 + pw * 45);
      p.shots += 3 + Math.ceil(pw / 2);
      break;
    case "spread":
      p.spreadT = Math.max(p.spreadT, 240 + pw * 45);
      p.shots += 2 + Math.ceil(pw / 3);
      break;
    case "ammo":
      p.shots += 4 + pw * 2;
      break;
    case "power":
      grow(p);
      p.stompDmg = Math.max(p.stompDmg, 2 + (pw >= 7 ? 1 : 0));
      break;
    case "points":
      w.score += 100 * pw;
      burst(w, p.x + p.w / 2, p.y, 8, PART.coin, 2);
      break;
  }
  p.shots = Math.min(99, p.shots);
  popup(w, f.perk === "points" ? `+${100 * pw}` : PERK_LABEL[f.perk], PERK_PART[f.perk]);
  sfx(w, f.perk === "points" ? "coin" : f.perk === "ally" ? "chime" : "powerup");
}

const PERK_PART: Record<string, number> = { health: PART.red, armor: PART.cyan, ally: PART.green, rapid: PART.pink, spread: PART.pink, ammo: PART.paper, power: PART.coin, points: PART.coin };
export const POWER_PART: Record<PowerId, number> = { wings: PART.cyan, star: PART.coin, magnet: PART.red, zoom: PART.green };

/** A power-up: it runs for a while (picking up another of the same kind starts it over). */
export function applyPower(w: World, k: PowerId) {
  const p = w.player;
  p.pw[k] = POWER_TICKS[k];
  if (k === "wings") p.airJumps = Math.max(p.airJumps, 1);
  w.score += 50;
  burst(w, p.x + p.w / 2, p.y + p.h / 2, 8, POWER_PART[k], 2);
  popup(w, POWER_LABEL[k], POWER_PART[k]);
  sfx(w, k === "star" ? "chime" : "powerup");
}

// ---------- foes ----------

function updateEnemies(w: World) {
  const near = w.cam - 40;
  const far = w.cam + VIEW_W + 40;
  let active = 0;
  for (const e of w.enemies) if (e.active && e.state === "alive") active++;
  for (let i = 0; i < w.enemies.length; i++) {
    const e = w.enemies[i];
    if (e.state === "gone") continue;
    if (e.state === "dying") {
      if (e.how !== "stomp" && e.how !== "squash") {
        e.vy = Math.min(e.vy + G, MAX_FALL);
        e.y += e.vy;
      }
      if (--e.dieT <= 0) e.state = "gone";
      continue;
    }
    const inView = e.x + e.w > near && e.x < far;
    if (!e.active && inView && active < MAX_ACTIVE) {
      e.active = true;
      active++;
    } else if (e.active && (e.x + e.w < near - 120 || e.x > far + 120)) {
      e.active = false;
      active--;
    }
    if (e.active) updateEnemy(w, e);
  }
}

function updateEnemy(w: World, e: Enemy) {
  const p = w.player;
  const lv = w.level;
  e.timer++;
  if (e.hurt > 0) e.hurt--;
  if (e.blink > 0) e.blink--;
  let walk = true;
  switch (e.ability) {
    case "flash": {
      const ph = (e.timer + e.phase) % FLASH_CYCLE;
      e.hidden = ph >= 100 && ph < 140;
      break;
    }
    case "teleport":
      if (--e.cd <= 0) {
        if (e.onGround) teleport(w, e);
        e.cd = 100 + Math.floor(w.env.rng() * 60);
      }
      break;
    case "sonic":
      if (e.shout > 0) {
        e.shout--;
        walk = false;
      }
      if (--e.cd <= 0) {
        const dx = p.x + p.w / 2 - (e.x + e.w / 2);
        const dy = p.y + p.h / 2 - (e.y + e.h / 2);
        if (p.dead === 0 && Math.abs(dx) < 150 && Math.abs(dy) < 48 && w.waves.length < MAX_WAVES) {
          e.dir = dx < 0 ? -1 : 1;
          w.waves.push({ x: e.x + e.w / 2 + e.dir * 6 - 3, y: e.y + 3, vx: e.dir * 1.2, life: 150 });
          e.shout = 12;
          e.cd = 90 + Math.floor(w.env.rng() * 40);
          sfx(w, "beam");
        } else e.cd = 15;
      }
      break;
    case "tank":
      if (--e.cd <= 0) {
        slam(w, e);
        e.cd = 140 + Math.floor(w.env.rng() * 40);
      }
      if (e.cd < 18) walk = false;
      break;
  }
  e.vx = walk ? e.dir * e.speed : 0;
  e.vy = Math.min(e.vy + G, MAX_FALL);
  if (moveX(lv, e)) e.dir = -e.dir as 1 | -1;
  moveY(lv, e);
  if (e.onGround && walk) {
    // Basic and most foes turn at edges; fast ones hop small gaps.
    const lead = e.dir > 0 ? e.x + e.w + 1 : e.x - 2;
    const c = Math.floor(lead / T);
    const r = Math.floor((e.y + e.h + 1) / T);
    if (!standable(lv, c, r)) {
      let hop = false;
      if (e.ability === "fast" && !e.mini) for (let k = 1; k <= 3 && !hop; k++) hop = standable(lv, c + e.dir * k, r);
      if (hop) e.vy = -4.6;
      else e.dir = -e.dir as 1 | -1;
    }
  }
  if (e.y > ROWS * T + 16) {
    e.state = "dying";
    e.dieT = 1;
    countDefeat(w, e, "fall");
  }
}

function teleport(w: World, e: Enemy) {
  const rng = w.env.rng;
  const dist = 24 + Math.floor(rng() * 25);
  const first = rng() < 0.5 ? -1 : 1;
  const p = w.player;
  for (let k = 0; k < 2; k++) {
    const s = k === 0 ? first : -first;
    const nx = e.x + s * dist;
    // Never blink right onto the player.
    if (Math.abs(nx + e.w / 2 - (p.x + p.w / 2)) < 28) continue;
    if (canStand(w.level, nx, e.y, e.w, e.h)) {
      burst(w, e.x + e.w / 2, e.y + e.h / 2, 6, PART.spark);
      e.x = nx;
      e.dir = s as 1 | -1;
      e.blink = 10;
      burst(w, e.x + e.w / 2, e.y + e.h / 2, 6, PART.spark);
      sfx(w, "blip");
      return;
    }
  }
}

function slam(w: World, e: Enemy) {
  const p = w.player;
  w.shake = 14;
  sfx(w, "rumble");
  burst(w, e.x + 2, e.y + e.h, 4, PART.dust);
  burst(w, e.x + e.w - 2, e.y + e.h, 4, PART.dust);
  if (p.dead === 0 && p.onGround && !p.climbing && Math.abs(p.x + p.w / 2 - (e.x + e.w / 2)) < 120) {
    p.vy = -3.5;
    p.vx *= 0.3;
    p.onGround = false;
    p.stun = 10;
  }
}

/** Tangible right now: alive and not blinked out. */
export const touchable = (e: Enemy) => e.state === "alive" && !e.hidden;

/** A hit on a foe: shields go first, then hits; true when it connected. */
export function hitEnemy(w: World, e: Enemy, dmg: number, how: How): boolean {
  if (!touchable(e)) return false;
  const i = w.enemies.indexOf(e);
  w.lastHit = i;
  w.lastHitT = w.tick;
  e.hurt = 6;
  if (e.shield) {
    e.shield = false;
    w.score += 20;
    burst(w, e.x + e.w / 2, e.y, 6, PART.cyan);
    sfx(w, "bounce");
    return true;
  }
  e.hits -= dmg;
  if (e.hits > 0) {
    sfx(w, "hit");
    return true;
  }
  defeat(w, e, i, how);
  return true;
}

function defeat(w: World, e: Enemy, i: number, how: How) {
  e.state = "dying";
  e.how = how;
  e.dieT = how === "squash" ? 30 : 20;
  e.vy = how === "stomp" || how === "squash" ? 0 : -3;
  e.hidden = false;
  e.shield = false;
  const worth = (e.mini ? 50 : 100 * e.maxHits) * (e.elite ? 2 : 1);
  w.score += worth + (how === "squash" ? 300 : 0);
  burst(w, e.x + e.w / 2, e.y + e.h / 2, e.ability === "tank" ? 12 : 6, e.ability === "tank" ? PART.red : PART.paper);
  sfx(w, e.ability === "tank" && !e.mini ? "explosion" : how === "squash" ? "sizzle" : "pop");
  if (e.ability === "split" && !e.mini && how !== "squash" && how !== "fall") {
    // Two minis pop out; the foe counts as beaten when both are.
    for (const s of [-1, 1] as const) {
      const m: Enemy = {
        ...e, x: e.x + e.w / 2 - SIZE.mini.w / 2 + s * 3, y: e.y + e.h - SIZE.mini.h, w: SIZE.mini.w, h: SIZE.mini.h,
        vx: 0, vy: -3.5, onGround: false, hits: 1, maxHits: 1, dir: s, speed: 0.9, mini: true, parent: i, kids: 0,
        state: "alive", dieT: 0, how: "", hurt: 0, blink: 0, active: true, ability: "split",
      };
      w.enemies.push(m);
      e.kids++;
    }
    return;
  }
  countDefeat(w, e, how);
  // Elites (permanently deleted files) sometimes leave a power-up behind.
  if (e.elite && !e.mini && how !== "fall" && w.env.rng() < 0.5) {
    const k = POWERS[Math.floor(w.env.rng() * POWERS.length)];
    w.pickups.push({ friend: -1, power: k, x: e.x + e.w / 2 - 6, y: e.y, mode: "pop", t: 0, taken: false });
  }
}

function countDefeat(w: World, e: Enemy, how: How) {
  e.how ||= how;
  if (e.mini) {
    const parent = w.enemies[e.parent];
    if (parent && --parent.kids === 0) w.defeated++;
  } else if (e.kids === 0) w.defeated++;
}

function playerVsEnemies(w: World) {
  const p = w.player;
  if (p.dead > 0) return;
  for (const e of w.enemies) {
    if (!e.active || !touchable(e) || !overlap(p, e.x, e.y, e.w, e.h)) continue;
    if (p.pw.star > 0) {
      // The star tidies whatever it touches, shields and all.
      e.shield = false;
      hitEnemy(w, e, 99, "star");
      continue;
    }
    if (p.vy > 0 && p.prevBottom <= e.y + 6) {
      hitEnemy(w, e, p.stompDmg, "stomp");
      p.onGround = false;
      const top = Math.min(p.y, e.y - p.h);
      if (!blocked(w.level, p.x, top, p.w, p.h)) {
        p.y = top;
        p.vy = -4.5;
        p.holdT = HOLD / 2;
        return;
      }
      // No room on top (a block overhead): squeeze out past the foe's nearer side instead of
      // bouncing into the block, and the foe turns away so it doesn't walk straight back into you.
      const dx = p.x + p.w / 2 - (e.x + e.w / 2);
      const side = dx < 0 ? -1 : dx > 0 ? 1 : p.facing;
      p.vx = side < 0 ? e.x - p.w - p.x : e.x + e.w - p.x;
      moveX(w.level, p);
      p.vx = side * RUN;
      p.vy = 0;
      p.holdT = 0;
      e.dir = -side as 1 | -1;
      return;
    }
    hurtPlayer(w, e.x + e.w / 2);
    return;
  }
}

// ---------- the helper ----------

function updateAlly(w: World) {
  const a = w.ally;
  const p = w.player;
  if (!a.on) return;
  if (--a.t <= 0) {
    a.on = false;
    burst(w, a.x + a.w / 2, a.y + a.h / 2, 8, PART.green);
    return;
  }
  if (a.cd > 0) a.cd--;
  const target = p.x + p.w / 2 + p.facing * 22 - a.w / 2;
  const dx = target - a.x;
  a.vx = Math.abs(dx) < 2 ? 0 : Math.max(-2.2, Math.min(2.2, dx * 0.15));
  if (a.vx) a.facing = a.vx > 0 ? 1 : -1;
  a.vy = Math.min(a.vy + G, MAX_FALL);
  const wall = moveX(w.level, a);
  moveY(w.level, a);
  if (a.onGround) {
    const lead = a.vx > 0 ? a.x + a.w + 1 : a.x - 2;
    const edge = a.vx !== 0 && !standable(w.level, Math.floor(lead / T), Math.floor((a.y + a.h + 1) / T));
    if (wall || edge || p.y + p.h < a.y - 20) a.vy = -5.2;
  }
  // Lost (fell or left behind): pop back next to the player.
  if (a.y > ROWS * T || Math.abs(a.x - p.x) > 200) {
    a.x = p.x;
    a.y = p.y + p.h - a.h;
    a.vx = a.vy = 0;
    burst(w, a.x + a.w / 2, a.y + a.h / 2, 6, PART.green);
  }
  if (a.cd > 0) return;
  for (const e of w.enemies) {
    if (e.active && touchable(e) && overlap(a, e.x, e.y, e.w, e.h)) {
      hitEnemy(w, e, a.dmg, "ally");
      a.cd = 20;
      a.vy = -3;
      e.dir = (e.x + e.w / 2 < a.x + a.w / 2 ? -1 : 1) as 1 | -1;
      sfx(w, "tomHi");
      return;
    }
  }
}

// ---------- slabs ----------

function updateSlabs(w: World) {
  const p = w.player;
  const lv = w.level;
  for (let i = 0; i < w.slabs.length; i++) {
    const s = w.slabs[i];
    if (s.state === "rest") {
      if (p.onSlab !== i || !p.onGround) continue;
      const seg = Math.max(0, Math.min(s.len - 1, Math.floor((p.x + p.w / 2 - s.x) / T)));
      if (!s.pressed[seg]) {
        s.pressed[seg] = 1;
        s.count++;
        w.score += 10;
        sfx(w, "tomHi");
      }
      if (s.count >= s.len) {
        s.state = "fall";
        s.vy = 0;
        s.landY = landingY(lv, s);
        sfx(w, "whoosh");
      }
    } else if (s.state === "fall") {
      const prevY = s.y;
      s.vy = Math.min(s.vy + 0.45, 7);
      s.y = Math.min(s.landY, s.y + s.vy);
      const sweep = s.y + SLAB_H - prevY;
      for (let j = 0; j < w.enemies.length; j++) {
        const e = w.enemies[j];
        if (e.state === "alive" && overlap(e, s.x, prevY, s.len * T, sweep)) {
          e.hidden = false;
          e.shield = false;
          defeat(w, e, j, "squash");
          // More than one under the same slab: each extra one is worth more.
          w.score += 200 * s.squashed;
          s.squashed++;
        }
      }
      if (s.y >= s.landY) {
        if (s.landY > ROWS * T) s.state = "gone";
        else {
          s.state = "landed";
          w.shake = Math.max(w.shake, 8);
          burst(w, s.x + 4, s.y + SLAB_H, 4, PART.dust);
          burst(w, s.x + s.len * T - 4, s.y + SLAB_H, 4, PART.dust);
          sfx(w, "rumble");
        }
      }
    }
  }
}

/** Where a dropped slab comes to rest: the first surface under any of its columns. */
function landingY(lv: Level, s: Slab): number {
  let best = ROWS * T + 40;
  const c0 = Math.floor(s.x / T);
  const r0 = Math.floor((s.y + SLAB_H) / T) + 1;
  for (let c = c0; c < c0 + s.len; c++) {
    for (let r = r0; r < ROWS; r++) {
      if (standable(lv, c, r)) {
        best = Math.min(best, r * T - SLAB_H);
        break;
      }
    }
  }
  return best;
}

// ---------- shots and waves ----------

function updateShots(w: World) {
  const lv = w.level;
  for (let i = w.shots.length - 1; i >= 0; i--) {
    const s = w.shots[i];
    let dead = --s.life <= 0;
    const prevBottom = s.y + 4;
    s.x += s.vx;
    s.vy = Math.min(s.vy + 0.35, 5);
    s.y += s.vy;
    const c = Math.floor((s.x + 2) / T);
    const r = Math.floor((s.y + 4) / T);
    if (s.vy > 0 && standable(lv, c, r) && prevBottom <= r * T + 0.01) {
      s.y = r * T - 4;
      s.vy = -2.8;
    }
    if (solid(lv, c, Math.floor((s.y + 2) / T))) dead = true;
    if (!dead) {
      for (const e of w.enemies) {
        if (e.active && touchable(e) && overlap(e, s.x, s.y, 4, 4)) {
          hitEnemy(w, e, 1, "shot");
          dead = true;
          break;
        }
      }
    }
    if (!dead) {
      for (let j = w.waves.length - 1; j >= 0; j--) {
        const v = w.waves[j];
        if (s.x < v.x + 6 && s.x + 4 > v.x && s.y < v.y + 10 && s.y + 4 > v.y) {
          w.waves.splice(j, 1);
          dead = true;
          break;
        }
      }
    }
    if (dead) {
      burst(w, s.x + 2, s.y + 2, 3, PART.paper, 1);
      w.shots.splice(i, 1);
    }
  }
}

function updateWaves(w: World) {
  const p = w.player;
  for (let i = w.waves.length - 1; i >= 0; i--) {
    const v = w.waves[i];
    v.x += v.vx;
    if (--v.life <= 0) {
      w.waves.splice(i, 1);
      continue;
    }
    if (p.dead === 0 && overlap(p, v.x, v.y, 6, 10)) {
      w.waves.splice(i, 1);
      if (p.pw.star > 0) burst(w, v.x + 3, v.y + 5, 4, PART.coin, 1);
      else hurtPlayer(w, v.x);
    }
  }
}

/** Foes not yet beaten (filler included). */
export const foesLeft = (w: World) => w.foesTotal - w.defeated;
