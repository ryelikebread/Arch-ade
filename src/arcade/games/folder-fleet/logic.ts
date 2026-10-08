// Folder Fleet's rules, with no drawing: waves of trashed files fly into a
// formation on the right and peel off to dive at the ship; kept files ride
// in as power capsules. Randomness only comes from the rng it's handed, and
// time is counted in ticks (30 a second).

import type { SfxName } from "../../../audio/sfx";
import { MAX_FRIENDS, filler } from "../../round";
import type { Ability, Cast, Foe, Friend, GameResult, Input } from "../../types";
import { THEMES, pickThemes, titleOf, type Theme, type ThemeId } from "./themes";

export const W = 320;
export const H = 180;
/** The play area, between the top HUD line and the power meter. */
export const TOP = 12;
export const BOTTOM = 168;
export const READY_TICKS = 45;
export const METER_MAX = 5;
export const MIN_FOES = 19;
export const MAX_WAVES = 4;
export const MAX_LIVES = 6;
export const MAX_ARMOR = 5;
const END_DELAY = 70;
const SLOTS = 12;
const BOSS_X = 262;
/** Every capsule drifts left at the same pace, so they don't pile up. */
const CAPSULE_VX = -0.5;
/** Biggest sound ring (the boss's); ships' rings stop at 28. */
export const MAX_RING_R = 46;

// caps on what's alive at once
const MAX_SHIPS = 30;
const MAX_SHOTS = 64;
const MAX_FOE_SHOTS = 60;
const MAX_RINGS = 10;
const MAX_PARTS = 140;
const MAX_CAPSULES = 8;
const MAX_BOOMS = 24;
const MAX_POPS = 8;
/** A weapon drops from every this many ships beaten (when none is already on screen). */
export const DROP_EVERY = 7;
/** How long a gun or the side pods last, before the file's power adds to it, and the most they can bank. */
export const GUN_TICKS = 540;
export const GUN_MAX = 1500;
export const MAX_GUN_LV = 3;

/** Hitbox sizes; the sprites are a little bigger. */
export const SIZE = { ship: [18, 12], tank: [24, 16], mini: [10, 8], boss: [36, 28] } as const;

/** Flash cycle: seen, blinking, gone (can't be hit), blinking back. */
export const CLOAK = { cycle: 170, blinkOut: 110, hide: 125, show: 160 } as const;
const WARP_TICKS = 18;
/** The fast boss lunges this many ticks after the last one; it shakes for the 20 before. */
export const LUNGE_AT = 190;

/** The fast boss is about to lunge or lunging (it holds its row). */
export const lunging = (s: Ship) => s.kind === "boss" && s.ability === "fast" && s.lunge > LUNGE_AT - 20;

export type Phase = "ready" | "play" | "between" | "warning" | "boss" | "won" | "lost";
export type ShipState = "wait" | "enter" | "formation" | "peel" | "dive" | "return" | "boss";
export type ShipKind = "ship" | "mini" | "boss";

export interface Ship {
  id: number;
  on: boolean;
  foe: Foe;
  kind: ShipKind;
  ability: Ability;
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  state: ShipState;
  /** Ticks in the current state. */
  t: number;
  /** Ticks to wait before flying in. */
  delay: number;
  slot: number;
  // flight path in or back to the slot (a curve from s through c)
  sx: number;
  sy: number;
  cx: number;
  cy: number;
  dur: number;
  // diving
  angle: number;
  turn: number;
  vx: number;
  vy: number;
  speed: number;
  shot: boolean;
  // abilities
  cloak: number;
  warp: number;
  warpT: number;
  sonicT: number;
  fireT: number;
  lunge: number;
  splits: number;
  /** Ticks to flash white and show the label after a hit. */
  hitT: number;
  carries: Friend | null;
  pulseId: number;
  /** The last wave shot that hit it (a wave hits each ship once). */
  waveHit: number;
}

export interface Drone {
  t: number;
  a: number;
  x: number;
  y: number;
}

export interface Player {
  x: number;
  y: number;
  lives: number;
  armor: number;
  invuln: number;
  fireCd: number;
  /** Shots fired, so drones can copy every other one. */
  volley: number;
  rapidCd: number;
  rapidT: number;
  /** The main gun, its level (1..3) and ticks left (back to the blaster at 0). */
  gun: Gun;
  gunLv: number;
  gunT: number;
  /** Side pods: ticks left and level (1: diagonal shots, 2: also backward). */
  sideT: number;
  sideLv: number;
  beamT: number;
  beaming: boolean;
  missiles: number;
  missileCd: number;
  drones: Drone[];
  /** For the engine flame and the lean. */
  dy: number;
}

/** bolt: the main gun; drone/pod: helpers' shots; missile and seek: homing; wave: a piercing arc. */
export type ShotKind = "bolt" | "drone" | "pod" | "missile" | "seek" | "wave";

export interface Shot {
  on: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  kind: ShotKind;
  target: number;
  t: number;
  /** A wave shot's full half-height, and its id (so it hits each ship once). */
  size: number;
  id: number;
}

export interface FoeShot {
  on: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** bullet: a pellet; debris: a chunk of a burst ship; shell: a heavy round. */
  kind: "bullet" | "debris" | "shell";
  t: number;
}

export interface Ring {
  on: boolean;
  x: number;
  y: number;
  r: number;
  vx: number;
  t: number;
  life: number;
  /** Radius at the end of its life. */
  max: number;
}

/** The main guns. The blaster is what you start with; the rest come from pickups and time out. */
export type Gun = "blaster" | "spread" | "seeker" | "wave";
/** Weapon pickups: a gun, or the side pods (an add-on that works with any gun). */
export type Weapon = "spread" | "seeker" | "wave" | "side";
export const WEAPONS: Weapon[] = ["spread", "seeker", "wave", "side"];

export interface Capsule {
  on: boolean;
  /** The kept file it carries, or null for a weapon dropped by a beaten ship. */
  friend: Friend | null;
  /** The weapon it gives (spread and everything-else files, and drops), or null. */
  weapon: Weapon | null;
  x: number;
  y: number;
  base: number;
  vx: number;
  t: number;
}

export interface Part {
  on: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  color: number;
}

export interface Boom {
  on: boolean;
  x: number;
  y: number;
  t: number;
  big: boolean;
}

export interface Pop {
  on: boolean;
  x: number;
  y: number;
  t: number;
  text: string;
}

export interface Slot {
  foe: Foe;
  carries: Friend | null;
}

/** A stage: a wave, or the boss at the end. */
export interface Stage {
  title: string;
  theme: ThemeId;
}

export interface World {
  tick: number;
  phase: Phase;
  phaseT: number;
  score: number;
  defeated: number;
  foes: number;
  collected: number;
  meter: number;
  wave: number;
  waves: Slot[][];
  boss: Foe;
  ships: Ship[];
  nextId: number;
  diveT: number;
  player: Player;
  shots: Shot[];
  foeShots: FoeShot[];
  rings: Ring[];
  capsules: Capsule[];
  parts: Part[];
  booms: Boom[];
  pops: Pop[];
  /** Kept files not riding a ship, waiting to drift in. */
  drift: Friend[];
  driftT: number;
  /** How many of them drift in during this stage. */
  driftLeft: number;
  pulse: { on: boolean; x: number; y: number; r: number; id: number };
  toast: { text: string; t: number; color: string };
  /** One per wave, then the boss: folder titles and themes. */
  stages: Stage[];
  /** The stage on screen (it changes mid-way through the break before the next one). */
  stage: number;
  /** How far the backdrop has scrolled (it speeds up between stages). */
  scroll: number;
  /** Weapons to come, shuffled; drops and everything-else files take the next one. */
  bag: Weapon[];
  /** Ships beaten since the last weapon drop. */
  sinceDrop: number;
  nextShotId: number;
  /** Sounds asked for this tick; index.ts plays them. */
  sounds: SfxName[];
  lastSound: Partial<Record<SfxName, number>>;
  result: GameResult | null;
}

// ---------- how files become ships ----------

/** Hits to beat a foe: bigger file, more hits (2..8), tanks twice that, elites one more. */
export function hitsFor(foe: Foe): number {
  let n = Math.max(2, 1 + Math.floor(foe.hp * 0.7));
  if (foe.ability === "tank") n *= 2;
  if (foe.elite) n += 1;
  return n;
}

/** The boss: a long health bar (the armored tank boss takes half damage from plain shots). */
export function bossHits(foe: Foe): number {
  return (foe.ability === "tank" ? 20 + foe.hp * 5 : 30 + foe.hp * 7) + (foe.elite ? 8 : 0);
}

/** Front shield hit points for shield foes. */
export function shieldFor(foe: Foe): number {
  return 1 + Math.floor(foe.hp / 3) + (foe.elite ? 1 : 0);
}

/**
 * The biggest foe is the boss; the rest make two to four waves of at most 12,
 * easy to hard, with any filler spread through them so every wave has real
 * files. Half the kept files ride in on enemy ships (dropped when the ship is
 * beaten); the rest, and any with no ship left to ride, drift in.
 */
export function buildWaves(cast: Cast, rng: () => number): { boss: Foe; waves: Slot[][]; total: number; drift: Friend[] } {
  const extra = filler(Math.max(0, MIN_FOES - cast.foes.length), rng);
  const boss = cast.foes[0] ?? extra.shift()!;
  const real = cast.foes
    .slice(1)
    .map((foe, i) => ({ foe, i }))
    .sort((a, b) => a.foe.hp - b.foe.hp || a.i - b.i)
    .map(({ foe }) => foe);
  const n = real.length + extra.length;
  const count = Math.max(2, Math.min(MAX_WAVES, Math.ceil(n / 6)));
  const waves: Slot[][] = [];
  let r = 0;
  let f = 0;
  for (let k = 0; k < count; k++) {
    const size = Math.floor((n + k) / count);
    const fill = Math.floor((extra.length + k) / count);
    const wave: Slot[] = [];
    for (let i = 0; i < size; i++) {
      const isFiller = Math.floor(((i + 1) * fill) / size) > Math.floor((i * fill) / size);
      wave.push({ foe: isFiller ? extra[f++] : real[r++], carries: null });
    }
    waves.push(wave);
  }
  const slots = waves.flat();
  const drift: Friend[] = [];
  cast.friends.forEach((friend, i) => {
    const free = i % 2 === 0 ? slots.filter((s) => !s.carries) : [];
    if (free.length) free[Math.floor(rng() * free.length)].carries = friend;
    else drift.push(friend);
  });
  return { boss, waves, total: n + 1, drift };
}

/** Stage titles cycle through the round's folders; themes are picked at random. */
export function buildStages(waves: number, folders: string[], rng: () => number): Stage[] {
  const names = folders.length ? folders : ["Files"];
  const themes = pickThemes(waves + 1, rng);
  return themes.map((theme, i) => ({ title: titleOf(names[i % names.length]), theme }));
}

export function newWorld(cast: Cast, rng: () => number, folders: string[] = ["Files"]): World {
  const { boss, waves, total, drift } = buildWaves(cast, rng);
  const stages = buildStages(waves.length, folders, rng);
  const w: World = {
    tick: 0,
    phase: "ready",
    phaseT: 0,
    score: 0,
    defeated: 0,
    foes: total,
    collected: 0,
    meter: 0,
    wave: 0,
    waves,
    boss,
    ships: [],
    nextId: 1,
    diveT: 150,
    player: {
      x: 40, y: (TOP + BOTTOM) / 2, lives: 3, armor: 0, invuln: 0, fireCd: 0, volley: 0, rapidCd: 5, rapidT: 0,
      gun: "blaster", gunLv: 1, gunT: 0, sideT: 0, sideLv: 0, beamT: 0, beaming: false, missiles: 0, missileCd: 0, drones: [], dy: 0,
    },
    shots: [],
    foeShots: [],
    rings: [],
    capsules: [],
    parts: [],
    booms: [],
    pops: [],
    drift,
    driftT: 0,
    driftLeft: 0,
    pulse: { on: false, x: 0, y: 0, r: 0, id: 0 },
    toast: { text: "", t: 0, color: "" },
    stages,
    stage: 0,
    scroll: 0,
    bag: [],
    sinceDrop: 0,
    nextShotId: 1,
    sounds: [],
    lastSound: {},
    result: null,
  };
  startWave(w, 0, rng, 12);
  return w;
}

// ---------- small helpers ----------

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** A free (or new, under the cap) object from a pool. */
function take<T extends { on: boolean }>(pool: T[], cap: number, make: () => T): T | null {
  for (const o of pool) if (!o.on) return o;
  if (pool.length >= cap) return null;
  const o = make();
  pool.push(o);
  return o;
}

/** Ask for a sound; the same one at most every 4 ticks. */
export function play(w: World, name: SfxName) {
  const last = w.lastSound[name];
  if (last !== undefined && w.tick - last < 4) return;
  w.lastSound[name] = w.tick;
  w.sounds.push(name);
}

/** The theme of the stage on screen. */
export const themeOf = (w: World): Theme => THEMES[w.stages[Math.min(w.stage, w.stages.length - 1)].theme];
/** The theme the current wave's formation uses. */
const waveTheme = (w: World): Theme => THEMES[w.stages[Math.min(w.wave, w.stages.length - 1)].theme];

/** Formation slots: the wave's theme sets where they are and how they sway. */
export function slotAt(t: Theme, slot: number, tick: number): [number, number] {
  const [bx, by] = t.slots[slot % t.slots.length];
  const s = t.sway;
  return [bx + Math.sin(tick * 0.021 + by * s.px) * s.ax, by + Math.sin(tick * 0.04 + bx * s.py) * s.ay];
}

export function slotX(w: World, slot: number): number {
  return slotAt(waveTheme(w), slot, w.tick)[0];
}

export function slotY(w: World, slot: number): number {
  return slotAt(waveTheme(w), slot, w.tick)[1];
}

export const canFire = (w: World) => w.phase === "play" || w.phase === "boss";
const canHurt = (w: World) => w.phase === "play" || w.phase === "between" || w.phase === "warning" || w.phase === "boss";

export function cloaked(s: Ship): boolean {
  return s.ability === "flash" && s.state !== "wait" && s.cloak >= CLOAK.hide && s.cloak < CLOAK.show;
}

/** Can be hit right now (not cloaked, not mid-warp, not off screen). */
export function targetable(s: Ship): boolean {
  return s.on && s.state !== "wait" && s.warp === 0 && !cloaked(s) && s.x < W + 4 && s.x > -12;
}

// ---------- spawning ----------

function makeShip(w: World, foe: Foe, kind: ShipKind, rng: () => number): Ship {
  const ability = foe.ability;
  const [sw, sh] = kind === "boss" ? SIZE.boss : kind === "mini" ? SIZE.mini : ability === "tank" ? SIZE.tank : SIZE.ship;
  const hp = kind === "boss" ? bossHits(foe) : kind === "mini" ? 1 : hitsFor(foe);
  const shield = ability !== "shield" || kind === "mini" ? 0 : kind === "boss" ? 6 : shieldFor(foe);
  const speed = (ability === "fast" ? 3.3 : ability === "tank" ? 1.0 : kind === "mini" ? 2.4 : 2.0) * (foe.elite ? 1.1 : 1);
  return {
    id: w.nextId++, on: true, foe, kind, ability, x: W + 40, y: -40, w: sw, h: sh, hp, maxHp: hp, shield, maxShield: shield,
    state: "wait", t: 0, delay: 0, slot: 0, sx: 0, sy: 0, cx: 0, cy: 0, dur: 60,
    angle: Math.PI, turn: 0, vx: 0, vy: 0, speed, shot: false,
    cloak: Math.floor(rng() * CLOAK.cycle), warp: 0, warpT: 90 + Math.floor(rng() * 120), sonicT: 90 + Math.floor(rng() * 120),
    fireT: 90 + Math.floor(rng() * 200), lunge: 0, splits: 0, hitT: 0, carries: null, pulseId: 0, waveHit: 0,
  };
}

function startWave(w: World, n: number, rng: () => number, firstDelay = 0) {
  w.wave = n;
  w.stage = n;
  w.ships = w.ships.filter((s) => s.on);
  const slots = Array.from({ length: SLOTS }, (_, i) => i);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  let prev: Ship | null = null;
  const theme = waveTheme(w);
  w.waves[n].forEach((it, i) => {
    const s = makeShip(w, it.foe, "ship", rng);
    s.carries = it.carries;
    s.slot = slots[i % SLOTS];
    entry(theme, s, i);
    s.dur = s.ability === "fast" ? 50 : s.ability === "tank" ? 95 : 72;
    // a beat behind the one ahead (more next to a big tank), never catching up with a slow one
    const gap = prev && (prev.ability === "tank" || s.ability === "tank") ? 16 : 9;
    s.delay = prev ? Math.max(prev.delay + gap, prev.delay + prev.dur + gap - s.dur) : firstDelay;
    prev = s;
    w.ships.push(s);
  });
  w.diveT = 150;
  // this wave's share of the drifting capsules (the boss gets a share too)
  w.driftLeft = Math.ceil(w.drift.length / (w.waves.length - n + 1));
  w.driftT = 60;
}

/** Where a ship flies in from (s) and the curve it takes (c); every path stays on the right half of the screen. */
function entry(theme: Theme, s: Ship, i: number) {
  const mid = (TOP + BOTTOM) / 2;
  const [bx, by] = theme.slots[s.slot];
  s.sx = W + 16;
  switch (theme.entry) {
    case "corners": {
      // groups of four swoop in from the top right, then the bottom right
      const fromTop = Math.floor(i / 4) % 2 === 0;
      s.sy = fromTop ? TOP + 6 : BOTTOM - 6;
      s.cx = 205;
      s.cy = fromTop ? BOTTOM - 10 : TOP + 10;
      break;
    }
    case "split":
      // out of the middle, looping up or down
      s.sy = mid + (i % 2 ? 12 : -12);
      s.cx = 198;
      s.cy = i % 2 ? BOTTOM - 8 : TOP + 8;
      break;
    case "march":
      // straight in along its own row
      s.sy = by;
      s.cx = W - 10;
      s.cy = by;
      break;
    case "drop":
      // in over the top and bottom edges, curving through the middle
      s.sx = Math.min(W - 12, bx + 24);
      s.sy = i % 2 ? BOTTOM + 14 : TOP - 14;
      s.cx = 200;
      s.cy = mid;
      break;
    case "weave":
      // corners, one at a time
      s.sy = i % 2 ? TOP + 4 : BOTTOM - 4;
      s.cx = 198;
      s.cy = mid;
      break;
  }
}

function spawnBoss(w: World, rng: () => number) {
  const s = makeShip(w, w.boss, "boss", rng);
  s.state = "boss";
  s.x = W + 30;
  s.y = (TOP + BOTTOM) / 2;
  s.fireT = 100;
  s.warpT = 150;
  s.sonicT = 90;
  // it sweeps up and down on its own (vy), and the fast one lunges (cx: how far)
  s.vy = (rng() < 0.5 ? -1 : 1) * (s.ability === "fast" ? 0.8 : s.ability === "tank" ? 0.45 : 0.6);
  w.ships.push(s);
}

/** Minis fly plain, but keep the look of the ship they came from. */
export const look = (s: Ship): Ability => (s.kind === "mini" ? s.foe.ability : s.ability);

function spawnMini(w: World, parent: Ship, dy: number, rng: () => number) {
  if (w.ships.filter((s) => s.on).length >= MAX_SHIPS) return;
  const s = makeShip(w, parent.foe, "mini", rng);
  s.ability = "basic";
  s.state = "dive";
  s.x = parent.x;
  s.y = clamp(parent.y + dy, TOP + 4, BOTTOM - 4);
  s.speed = 2.4;
  s.vx = -2;
  s.vy = dy > 0 ? 1.3 : -1.3;
  s.shot = true;
  w.ships.push(s);
}

function aimed(w: World, x: number, y: number, speed: number, spread: number, kind: FoeShot["kind"] = "bullet") {
  const p = w.player;
  const a = Math.atan2(p.y - y, p.x - x) + spread;
  const b = take(w.foeShots, MAX_FOE_SHOTS, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, kind: "bullet" as FoeShot["kind"], t: 0 }));
  if (!b) return;
  b.on = true;
  b.x = x;
  b.y = y;
  b.vx = Math.cos(a) * speed;
  b.vy = Math.sin(a) * speed;
  b.kind = kind;
  b.t = 0;
}

function ring(w: World, x: number, y: number, life: number, max = 28, vx = -1.25) {
  const r = take(w.rings, MAX_RINGS, () => ({ on: false, x: 0, y: 0, r: 0, vx: 0, t: 0, life: 0, max: 0 }));
  if (!r) return;
  r.on = true;
  r.x = x;
  r.y = y;
  r.r = 3;
  r.vx = vx;
  r.t = 0;
  r.life = life;
  r.max = Math.min(MAX_RING_R, max);
  play(w, "horn");
}

function debris(w: World, x: number, y: number, n: number, rng: () => number) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng() * 0.4;
    const sp = 0.9 + rng() * 0.8;
    const b = take(w.foeShots, MAX_FOE_SHOTS, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, kind: "debris" as FoeShot["kind"], t: 0 }));
    if (!b) return;
    b.on = true;
    b.x = x;
    b.y = y;
    b.vx = Math.cos(a) * sp - 0.3;
    b.vy = Math.sin(a) * sp;
    b.kind = "debris";
    b.t = 0;
  }
}

export function sparks(w: World, x: number, y: number, n: number, color: number, rng: () => number, speed = 1.6) {
  for (let i = 0; i < n; i++) {
    const p = take(w.parts, MAX_PARTS, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, t: 0, color: 0 }));
    if (!p) return;
    const a = rng() * Math.PI * 2;
    const sp = (0.3 + rng()) * speed;
    p.on = true;
    p.x = x;
    p.y = y;
    p.vx = Math.cos(a) * sp;
    p.vy = Math.sin(a) * sp;
    p.t = 12 + Math.floor(rng() * 14);
    p.color = color;
  }
}

function boom(w: World, x: number, y: number, big: boolean) {
  const b = take(w.booms, MAX_BOOMS, () => ({ on: false, x: 0, y: 0, t: 0, big: false }));
  if (!b) return;
  b.on = true;
  b.x = x;
  b.y = y;
  b.t = 0;
  b.big = big;
}

function pop(w: World, x: number, y: number, text: string) {
  const p = take(w.pops, MAX_POPS, () => ({ on: false, x: 0, y: 0, t: 0, text: "" }));
  if (!p) return;
  p.on = true;
  p.x = x;
  p.y = y;
  p.t = 0;
  p.text = text;
}

/** The next weapon from the shuffled bag (every weapon comes round before any repeats). */
export function nextWeapon(w: World, rng: () => number): Weapon {
  if (!w.bag.length) {
    w.bag = WEAPONS.slice();
    for (let i = w.bag.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [w.bag[i], w.bag[j]] = [w.bag[j], w.bag[i]];
    }
  }
  return w.bag.shift()!;
}

/** What weapon a kept file's capsule gives: spread files the spread gun, everything-else files the next new weapon. */
function weaponFor(w: World, friend: Friend, rng: () => number): Weapon | null {
  if (friend.perk === "spread") return "spread";
  if (friend.perk === "points") {
    const n = nextWeapon(w, rng);
    return n === "spread" ? nextWeapon(w, rng) : n;
  }
  return null;
}

/**
 * A capsule for a kept file (or, with no friend, a weapon a beaten ship
 * dropped). Each friend makes one, so the pool never runs out.
 */
function dropCapsule(w: World, friend: Friend | null, x: number, y: number, weapon: Weapon | null) {
  const c = take(w.capsules, MAX_FRIENDS + MAX_CAPSULES, () => ({ on: false, friend, weapon, x: 0, y: 0, base: 0, vx: 0, t: 0 }));
  if (!c) return;
  c.on = true;
  c.friend = friend;
  c.weapon = weapon;
  c.x = x;
  c.y = clamp(y, TOP + 8, BOTTOM - 8);
  c.base = c.y;
  c.vx = CAPSULE_VX;
  c.t = 0;
}

/** A kept file drifts in from the right, away from capsules already coming. */
function driftIn(w: World, friend: Friend, rng: () => number) {
  let y = 0;
  for (let k = 0; k < 4; k++) {
    y = TOP + 20 + rng() * (BOTTOM - TOP - 40);
    if (!w.capsules.some((c) => c.on && c.x > W - 70 && Math.abs(c.base - y) < 22)) break;
  }
  dropCapsule(w, friend, W + 8, y, weaponFor(w, friend, rng));
}

// ---------- damage ----------

/**
 * Hit a ship. Shots from the front land on a shield first; `force` (the
 * meter pulse) ignores shields and cloaks. Returns whether it connected.
 */
export function damage(w: World, s: Ship, amount: number, fromFront: boolean, rng: () => number, force = false): boolean {
  // once the ship is lost nothing it fired counts (a last shot can't win it)
  if (!s.on || w.phase === "lost" || (!force && !targetable(s))) return false;
  if (s.shield > 0 && fromFront && !force) {
    s.shield--;
    s.hitT = 45;
    sparks(w, s.x - s.w / 2 - 2, s.y, 3, 1, rng);
    play(w, "bounce");
    if (s.shield === 0) {
      w.score += 20;
      sparks(w, s.x - s.w / 2 - 2, s.y, 8, 1, rng, 2.2);
      play(w, "pop");
    }
    return true;
  }
  // The tank boss is armored: plain shots only dent it.
  if (s.kind === "boss" && s.ability === "tank" && amount === 1 && !force) amount = 0.5;
  s.hp -= amount;
  s.hitT = 45;
  if (s.hp <= 0.001) kill(w, s, rng);
  else play(w, "hit");
  return true;
}

function kill(w: World, s: Ship, rng: () => number) {
  s.on = false;
  const big = s.kind === "boss" || s.ability === "tank";
  boom(w, s.x, s.y, big);
  sparks(w, s.x, s.y, big ? 16 : 7, s.foe.elite ? 2 : 0, rng, big ? 2.4 : 1.6);
  play(w, big ? "explosion" : "pop");
  if (s.kind === "mini") {
    w.score += 30;
    pop(w, s.x, s.y - 8, "30");
    w.meter = Math.min(METER_MAX, w.meter + 0.1);
    return;
  }
  w.defeated = Math.min(w.foes, w.defeated + 1);
  w.meter = Math.min(METER_MAX, w.meter + 0.25);
  const pts = s.kind === "boss" ? 1500 + 150 * s.foe.hp : 50 * s.maxHp + (s.foe.elite ? 150 : 0);
  w.score += pts;
  pop(w, s.x, s.y - 10, String(pts));
  if (s.carries) {
    dropCapsule(w, s.carries, s.x, s.y, weaponFor(w, s.carries, rng));
    s.carries = null;
  } else if (s.kind === "ship" && ++w.sinceDrop >= DROP_EVERY && s.x > 70 && !w.capsules.some((c) => c.on && !c.friend)) {
    // now and then a beaten ship leaves a weapon behind
    w.sinceDrop = 0;
    dropCapsule(w, null, s.x, s.y, nextWeapon(w, rng));
  }
  // split: two minis fly on; tank: bursts into debris that hurts
  if (s.ability === "split" && s.kind === "ship") {
    spawnMini(w, s, -7, rng);
    spawnMini(w, s, 7, rng);
    play(w, "whoosh");
  }
  if (s.ability === "tank" && s.kind === "ship") {
    debris(w, s.x, s.y, 8, rng);
    play(w, "rumble");
  }
  if (s.kind === "boss") {
    w.phase = "won";
    w.phaseT = 0;
    w.score += w.player.lives * 500;
    for (const o of w.ships) if (o.on) (o.on = false), boom(w, o.x, o.y, false);
    for (const b of w.foeShots) b.on = false;
    for (const r of w.rings) r.on = false;
    // the big one goes up in a shower (harmless now)
    sparks(w, s.x, s.y, s.ability === "tank" ? 40 : 24, 0, rng, 3);
    play(w, "rumble");
    // kept files still waiting float in now (only when the boss went down fast)
    w.drift.forEach((f, k) => dropCapsule(w, f, W - 14, TOP + 16 + ((k + 0.5) / w.drift.length) * (BOTTOM - TOP - 32), weaponFor(w, f, rng)));
    w.drift.length = 0;
  }
}

export function hurt(w: World, rng: () => number) {
  const p = w.player;
  if (p.invuln > 0 || !canHurt(w)) return;
  if (p.armor > 0) {
    p.armor--;
    p.invuln = 40;
    sparks(w, p.x, p.y, 8, 1, rng);
    play(w, "bounce");
    return;
  }
  p.lives--;
  p.invuln = 100;
  // a lost life costs a gun level (the last level drops back to the blaster)
  if (p.gun !== "blaster") {
    if (p.gunLv > 1) p.gunLv--;
    else (p.gun = "blaster"), (p.gunT = 0);
  }
  boom(w, p.x, p.y, false);
  sparks(w, p.x, p.y, 12, 3, rng, 2);
  play(w, "hurt");
  // a little breathing room
  for (const b of w.foeShots) if (b.on && Math.abs(b.x - p.x) < 60 && Math.abs(b.y - p.y) < 60) b.on = false;
  if (p.lives <= 0) {
    p.lives = 0;
    w.phase = "lost";
    w.phaseT = 0;
    boom(w, p.x, p.y, true);
    play(w, "explosion");
    // its shots, drones and pulse go with it
    for (const b of w.shots) b.on = false;
    for (const d of p.drones) boom(w, d.x, d.y, false);
    p.drones.length = 0;
    p.beaming = false;
    w.pulse.on = false;
  }
}

// ---------- perks ----------

export const PERK_NAME: Record<string, string> = {
  health: "LIFE", armor: "ARMOR", ally: "DRONE", rapid: "RAPID FIRE", spread: "SPREAD", ammo: "MISSILES", power: "LASER", points: "BONUS",
};

/** Apply a kept file's perk; how strong depends on its power (1..10). Returns the toast text. */
export function applyPerk(w: World, f: Friend): string {
  const p = w.player;
  const n = f.power;
  switch (f.perk) {
    case "health": {
      const add = n >= 7 ? 2 : 1;
      if (p.lives >= MAX_LIVES) {
        w.score += 200 * n;
        return `+${200 * n}`;
      }
      p.lives = Math.min(MAX_LIVES, p.lives + add);
      return `+${add} LIFE`;
    }
    case "armor": {
      const add = 1 + Math.floor(n / 4);
      p.armor = Math.min(MAX_ARMOR, p.armor + add);
      return `ARMOR +${add}`;
    }
    case "ally": {
      const t = 450 + n * 90;
      // a second drone circles opposite the first
      if (p.drones.length < 2) p.drones.push({ t, a: p.drones.length ? p.drones[0].a + Math.PI : 0, x: p.x, y: p.y });
      else {
        const d = p.drones[0].t < p.drones[1].t ? p.drones[0] : p.drones[1];
        d.t = Math.max(d.t, t);
      }
      return "DRONE";
    }
    case "rapid":
      p.rapidT = Math.min(1500, p.rapidT + 200 + n * 36);
      p.rapidCd = Math.min(p.rapidCd, n >= 6 ? 4 : 5);
      return "RAPID FIRE";
    case "spread":
      return applyWeapon(w, "spread", n);
    case "ammo": {
      const add = 2 + n;
      p.missiles = Math.min(30, p.missiles + add);
      return `${add} MISSILES`;
    }
    case "power":
      p.beamT = Math.min(900, p.beamT + 60 + n * 15);
      return "LASER";
    case "points":
      w.score += 100 * n;
      return `+${100 * n}`;
  }
}

export const GUN_NAME: Record<Gun, string> = { blaster: "BLASTER", spread: "SPREAD", seeker: "SEEKER", wave: "WAVE" };
export const WEAPON_NAME: Record<Weapon, string> = { spread: "SPREAD", seeker: "SEEKER", wave: "WAVE GUN", side: "SIDE PODS" };
const SPREAD_NAME = ["", "DOUBLE SHOT", "TRIPLE SHOT", "FIVE-WAY"];

/**
 * Pick up a weapon with power 1..10. Guns replace each other: the same gun
 * again goes up a level (to 3) and gets more time; a new gun swaps in at
 * your level (a strong file starts at 2). The side pods are an add-on that
 * fires along with any gun; a second set adds backward shots. Rapid fire,
 * the laser, missiles and drones all work on top. Returns the toast text.
 */
export function applyWeapon(w: World, weapon: Weapon, power: number): string {
  const p = w.player;
  const time = GUN_TICKS + power * 30;
  if (weapon === "side") {
    p.sideLv = p.sideT > 0 ? 2 : 1;
    p.sideT = Math.min(GUN_MAX, p.sideT + time);
    return p.sideLv === 2 ? "SIDE PODS 2" : "SIDE PODS";
  }
  const base = power >= 5 ? 2 : 1;
  if (p.gun === weapon) {
    p.gunLv = Math.min(MAX_GUN_LV, Math.max(base, p.gunLv + 1));
    p.gunT = Math.min(GUN_MAX, p.gunT + time);
  } else {
    p.gunLv = p.gun === "blaster" ? base : Math.max(base, p.gunLv);
    p.gun = weapon;
    p.gunT = Math.min(GUN_MAX, time);
  }
  return weapon === "spread" ? SPREAD_NAME[p.gunLv] : `${GUN_NAME[weapon]} ${p.gunLv}`;
}

/** The toast color for a capsule (draw.ts maps these keys to colors). */
export const capsuleKey = (c: Pick<Capsule, "friend" | "weapon">): string => c.weapon ?? c.friend?.perk ?? "points";

function collect(w: World, c: Capsule, rng: () => number) {
  c.on = false;
  w.score += 50;
  const f = c.friend;
  let what: string;
  if (f) {
    w.collected++;
    w.meter = Math.min(METER_MAX, w.meter + (f.power >= 7 ? 2 : 1));
    // a spread file's perk is the spread gun; an everything-else file gives its points and a weapon
    what = applyPerk(w, f);
    if (c.weapon && f.perk !== "spread") what = `${applyWeapon(w, c.weapon, f.power)} ${what}`;
    w.toast.text = `${f.label}: ${what}`;
  } else {
    w.meter = Math.min(METER_MAX, w.meter + 0.5);
    what = applyWeapon(w, c.weapon ?? "spread", 4);
    w.toast.text = what;
  }
  w.toast.t = 100;
  w.toast.color = capsuleKey(c);
  sparks(w, c.x, c.y, 8, 4, rng);
  play(w, c.weapon ? "powerup" : f?.perk === "points" ? "coin" : "powerup");
}

// ---------- the tick ----------

export function step(w: World, input: Input, rng: () => number) {
  if (w.result) return;
  w.sounds.length = 0;
  w.tick++;
  w.phaseT++;
  const p = w.player;

  if (w.phase !== "lost") movePlayer(w, input);
  // no shooting under the READY banner
  if (w.phase !== "ready" && w.phase !== "lost" && w.phase !== "won") fire(w, input, rng);
  if (input.pressed("alt")) pulse(w);

  phases(w, rng);
  diving(w, rng);
  for (const s of w.ships) if (s.on) updateShip(w, s, rng);
  moveShots(w, rng);
  moveFoeShots(w, rng);
  moveCapsules(w, rng);
  effects(w);
  if (w.pulse.on) movePulse(w, rng);

  if (p.invuln > 0) p.invuln--;
  if (p.rapidT > 0 && --p.rapidT === 0) p.rapidCd = 5;
  if (p.gunT > 0 && --p.gunT === 0) (p.gun = "blaster"), (p.gunLv = 1);
  if (p.sideT > 0 && --p.sideT === 0) p.sideLv = 0;
  // the backdrop scrolls, faster through the break between stages
  const warp = w.phase === "between" ? Math.sin((Math.PI * Math.min(60, w.phaseT)) / 60) : w.phase === "warning" ? Math.sin((Math.PI * Math.min(80, w.phaseT)) / 80) : 0;
  w.scroll += 1 + warp * 6;
  if (p.beamT > 0 && !p.beaming) p.beamT = Math.max(0, p.beamT - 0.25);
  if (w.toast.t > 0) w.toast.t--;

  if ((w.phase === "won" || w.phase === "lost") && w.phaseT >= END_DELAY) {
    w.result = { won: w.phase === "won", score: Math.round(w.score), defeated: Math.min(w.defeated, w.foes), foes: w.foes, collected: w.collected };
  }
}

function movePlayer(w: World, input: Input) {
  const p = w.player;
  let dx = (input.held("right") ? 1 : 0) - (input.held("left") ? 1 : 0);
  let dy = (input.held("down") ? 1 : 0) - (input.held("up") ? 1 : 0);
  if (dx && dy) (dx *= 0.75), (dy *= 0.75);
  p.x = clamp(p.x + dx * 2.4, 8, 236);
  p.y = clamp(p.y + dy * 2.4, TOP + 6, BOTTOM - 6);
  p.dy = dy;
  for (const d of p.drones) {
    d.a += 0.08;
    d.x = p.x - 2 + Math.cos(d.a) * 15;
    d.y = p.y + Math.sin(d.a) * 13;
    d.t--;
  }
  if (p.drones.some((d) => d.t <= 0)) p.drones = p.drones.filter((d) => d.t > 0);
}

function shot(w: World, x: number, y: number, vx: number, vy: number, kind: ShotKind = "bolt", size = 0) {
  const s = take(w.shots, MAX_SHOTS, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, dmg: 1, kind: "bolt" as ShotKind, target: -1, t: 0, size: 0, id: 0 }));
  if (!s) return;
  s.on = true;
  s.x = x;
  s.y = y;
  s.vx = vx;
  s.vy = vy;
  s.dmg = kind === "missile" ? 2 : 1;
  s.kind = kind;
  s.target = -1;
  s.t = 0;
  s.size = size;
  s.id = w.nextShotId++;
}

/** Ticks between shots for each gun (rapid fire cuts it). */
const GUN_CD: Record<Gun, number> = { blaster: 8, spread: 8, seeker: 10, wave: 13 };

/** A wave shot's half-height right now: it opens up as it flies. */
export const waveHalf = (b: Shot) => Math.min(b.size, 3 + b.t * 1.5);

/** The main gun's volley. */
function gunVolley(w: World) {
  const p = w.player;
  const x = p.x + 9;
  const lv = p.gunLv;
  switch (p.gun) {
    case "blaster":
      shot(w, x, p.y, 7, 0);
      break;
    case "spread":
      if (lv === 1) {
        shot(w, x, p.y - 3, 7, 0);
        shot(w, x, p.y + 3, 7, 0);
      } else {
        shot(w, x, p.y, 7, 0);
        shot(w, x - 1, p.y - 2, 6.8, -1.1);
        shot(w, x - 1, p.y + 2, 6.8, 1.1);
        if (lv >= 3) {
          shot(w, x - 2, p.y - 3, 6.4, -2.2);
          shot(w, x - 2, p.y + 3, 6.4, 2.2);
        }
      }
      break;
    case "seeker":
      // shots that bend toward the nearest ship
      if (lv === 2) {
        shot(w, x, p.y - 3, 6, -0.4, "seek");
        shot(w, x, p.y + 3, 6, 0.4, "seek");
      } else {
        shot(w, x, p.y, 6, 0, "seek");
        if (lv >= 3) {
          shot(w, x - 2, p.y - 4, 5.6, -1.4, "seek");
          shot(w, x - 2, p.y + 4, 5.6, 1.4, "seek");
        }
      }
      break;
    case "wave":
      // a slower arc that opens up and passes through everything in its way
      shot(w, x, p.y, 4.6, 0, "wave", 8 + lv * 5);
      break;
  }
}

function fire(w: World, input: Input, rng: () => number) {
  const p = w.player;
  if (p.fireCd > 0) p.fireCd--;
  if (p.missileCd > 0) p.missileCd--;
  p.beaming = false;
  if (!input.held("fire")) return;
  if (p.beamT > 0) {
    // the laser: pierces everything in its row
    p.beaming = true;
    p.beamT--;
    if (w.tick % 5 === 0)
      for (const s of w.ships) if (s.x > p.x && Math.abs(s.y - p.y) < s.h / 2 + 3) damage(w, s, 1, true, rng);
    play(w, "sizzle");
  } else if (p.fireCd <= 0) {
    const cd = GUN_CD[p.gun];
    p.fireCd = p.rapidT > 0 ? Math.max(3, Math.round((cd * p.rapidCd) / 8)) : cd;
    gunVolley(w);
    // drones copy every other shot, and the side pods fire on the others
    p.volley++;
    if (p.volley % 2 === 0) for (const d of p.drones) shot(w, d.x + 4, d.y, 7, 0, "drone");
    else if (p.sideT > 0)
      for (const k of [-1, 1]) {
        const [px, py] = podAt(p, k);
        shot(w, px + 2, py, 5.6, k * 2.4, "pod");
        if (p.sideLv >= 2) shot(w, px - 3, py, -6, 0, "pod");
      }
    play(w, p.gun === "wave" ? "beam" : "shoot");
  }
  if (p.missiles > 0 && p.missileCd <= 0 && w.ships.some(targetable)) {
    p.missiles--;
    p.missileCd = 18;
    shot(w, p.x, p.y + (p.missiles % 2 ? -4 : 4), 1.5, p.missiles % 2 ? -1.6 : 1.6, "missile");
    play(w, "launch");
  }
}

/** Where a side pod sits: above (k = -1) or below (k = 1) the ship. */
export const podAt = (p: Player, k: number): [number, number] => [p.x - 3, p.y + k * 10];

function pulse(w: World) {
  if (w.meter < METER_MAX || !(w.phase === "play" || w.phase === "boss" || w.phase === "between" || w.phase === "warning")) return;
  w.meter = 0;
  w.pulse.on = true;
  w.pulse.x = w.player.x;
  w.pulse.y = w.player.y;
  w.pulse.r = 0;
  w.pulse.id++;
  w.player.invuln = Math.max(w.player.invuln, 30);
  play(w, "explosion");
  play(w, "whoosh");
}

function movePulse(w: World, rng: () => number) {
  const pu = w.pulse;
  pu.r += 10;
  for (const s of w.ships) {
    if (!s.on || s.pulseId === pu.id || s.state === "wait") continue;
    if (Math.hypot(s.x - pu.x, s.y - pu.y) <= pu.r) {
      s.pulseId = pu.id;
      damage(w, s, s.kind === "boss" ? 6 : 3, true, rng, true);
    }
  }
  for (const b of w.foeShots) if (b.on && Math.hypot(b.x - pu.x, b.y - pu.y) <= pu.r) b.on = false;
  for (const r of w.rings) if (r.on && Math.hypot(r.x - pu.x, r.y - pu.y) <= pu.r + r.r) r.on = false;
  if (pu.r > 380) pu.on = false;
}

function phases(w: World, rng: () => number) {
  switch (w.phase) {
    case "ready":
      if (w.phaseT >= READY_TICKS) (w.phase = "play"), (w.phaseT = 0);
      break;
    case "play":
      if (!w.ships.some((s) => s.on)) {
        w.score += 300;
        w.phase = w.wave + 1 < w.waves.length ? "between" : "warning";
        w.phaseT = 0;
        play(w, w.phase === "warning" ? "rumble" : "chime");
        // the rest of the drifting capsules come in before and as the boss arrives
        if (w.phase === "warning") (w.driftLeft = w.drift.length), (w.driftT = 20);
      }
      break;
    case "between":
      // the next stage's backdrop comes in at full warp
      if (w.phaseT === 30) w.stage = w.wave + 1;
      if (w.phaseT >= 60) {
        startWave(w, w.wave + 1, rng);
        w.phase = "play";
        w.phaseT = 0;
      }
      break;
    case "warning":
      if (w.phaseT === 1) play(w, "horn");
      if (w.phaseT === 40) w.stage = w.waves.length;
      if (w.phaseT >= 80) {
        spawnBoss(w, rng);
        w.phase = "boss";
        w.phaseT = 0;
      }
      break;
    default:
      break;
  }
  // Kept files that aren't riding a ship drift in, a few each wave.
  if (w.drift.length && w.driftLeft > 0 && w.phase !== "ready" && w.phase !== "won" && w.phase !== "lost" && --w.driftT <= 0) {
    if (w.capsules.filter((c) => c.on).length < MAX_CAPSULES) {
      driftIn(w, w.drift.shift()!, rng);
      w.driftLeft--;
      w.driftT = w.phase === "warning" || w.phase === "boss" ? 40 : 75;
    } else w.driftT = 20;
  }
}

/** Every so often a ship in formation peels off and dives; more often as the wave thins out. */
function diving(w: World, rng: () => number) {
  if (w.phase !== "play" || w.phaseT < 30) return;
  if (--w.diveT > 0) return;
  let left = 0;
  let divers = 0;
  for (const s of w.ships) {
    if (!s.on) continue;
    left++;
    if (s.state === "peel" || s.state === "dive") divers++;
  }
  w.diveT = Math.round(Math.max(28, 100 - w.wave * 10 - Math.max(0, 10 - left) * 6) * waveTheme(w).dive);
  if (divers >= Math.min(4, 2 + w.wave)) return;
  // pick one in formation; fast ships are picked twice as often
  let total = 0;
  for (const s of w.ships) if (s.on && s.state === "formation" && s.warp === 0) total += s.ability === "fast" ? 2 : 1;
  if (!total) return;
  let pick = rng() * total;
  for (const s of w.ships) {
    if (!s.on || s.state !== "formation" || s.warp !== 0) continue;
    pick -= s.ability === "fast" ? 2 : 1;
    if (pick < 0) {
      startDive(w, s);
      return;
    }
  }
}

function startDive(w: World, s: Ship) {
  s.t = 0;
  s.shot = false;
  if (s.ability === "tank") {
    // tanks don't loop: they just push forward
    s.state = "dive";
    s.vx = -s.speed;
    s.vy = 0;
    return;
  }
  s.state = "peel";
  s.angle = 0;
  s.turn = (waveTheme(w).slots[s.slot][1] < (TOP + BOTTOM) / 2 ? -1 : 1) * (Math.PI / (s.ability === "fast" ? 14 : 20));
  play(w, "whoosh");
}

function updateShip(w: World, s: Ship, rng: () => number) {
  s.t++;
  if (s.hitT > 0) s.hitT--;
  if (s.ability === "flash") s.cloak = (s.cloak + 1) % CLOAK.cycle;
  const p = w.player;
  switch (s.state) {
    case "wait":
      if (--s.delay <= 0) (s.state = "enter"), (s.t = 0);
      return;
    case "enter":
    case "return": {
      // a curve from the start, through the control point, into the slot
      const u = Math.min(1, s.t / s.dur);
      const e = 1 - (1 - u) * (1 - u) * (1 - u) * 0.6 - (1 - u) * 0.4;
      const tx = slotX(w, s.slot);
      const ty = slotY(w, s.slot);
      const a = (1 - e) * (1 - e);
      const b = 2 * e * (1 - e);
      const c = e * e;
      s.x = a * s.sx + b * s.cx + c * tx;
      s.y = a * s.sy + b * s.cy + c * ty;
      if (u >= 1) (s.state = "formation"), (s.t = 0);
      break;
    }
    case "formation":
      s.x = slotX(w, s.slot);
      s.y = slotY(w, s.slot);
      if (s.ability === "teleport") teleport(w, s, rng);
      break;
    case "peel":
      s.angle += s.turn;
      s.x += Math.cos(s.angle) * s.speed;
      s.y += Math.sin(s.angle) * s.speed;
      if (Math.abs(s.angle) >= Math.PI) {
        s.state = "dive";
        s.t = 0;
        s.vx = -s.speed;
        s.vy = Math.sin(s.angle) * s.speed;
      }
      break;
    case "dive": {
      // steer toward the ship's row while still to its right, always heading left
      if (s.x > p.x + 20) {
        const acc = s.ability === "fast" ? 0.14 : s.ability === "tank" ? 0.03 : 0.09;
        s.vy = clamp(s.vy + clamp((p.y - s.y) * 0.02, -acc, acc), -s.speed * 0.8, s.speed * 0.8);
      }
      s.vx = -Math.sqrt(Math.max(0.2, s.speed * s.speed - s.vy * s.vy));
      s.x += s.vx;
      s.y += s.vy;
      if (s.x < -20 || s.y < TOP - 30 || s.y > BOTTOM + 30) comeBack(s, rng);
      break;
    }
    case "boss":
      boss(w, s, rng);
      return;
  }
  if (s.warp > 0) s.warp--;
  attack(w, s, rng);
  // ramming the player hurts both
  if (targetable(s) && Math.abs(s.x - p.x) < s.w / 2 + 3 && Math.abs(s.y - p.y) < s.h / 2 + 2 && p.invuln === 0 && canHurt(w)) {
    hurt(w, rng);
    damage(w, s, 2, false, rng);
  }
}

/** Off the left edge: minis wrap round and dive again, the rest fly back to their slot. */
function comeBack(s: Ship, rng: () => number) {
  s.t = 0;
  s.shot = false;
  if (s.kind === "mini") {
    s.x = W + 10;
    s.y = TOP + 16 + rng() * (BOTTOM - TOP - 32);
    s.vy = 0;
    return;
  }
  s.state = "return";
  s.sx = W + 16;
  s.sy = TOP + 16 + rng() * (BOTTOM - TOP - 32);
  s.cx = W - 30;
  s.cy = s.sy;
  s.dur = 50;
  s.x = s.sx;
  s.y = s.sy;
}

/** Teleport ships warp to another slot now and then (swapping if none is free). */
function teleport(w: World, s: Ship, rng: () => number) {
  if (s.warp > 0) {
    if (s.warp === WARP_TICKS / 2) {
      const taken = new Array<boolean>(SLOTS).fill(false);
      for (const o of w.ships) if (o.on && o.kind === "ship" && o !== s) taken[o.slot] = true;
      const free: number[] = [];
      for (let i = 0; i < SLOTS; i++) if (!taken[i] && i !== s.slot) free.push(i);
      if (free.length) s.slot = free[Math.floor(rng() * free.length)];
      else {
        const others = w.ships.filter((o) => o.on && o.kind === "ship" && o !== s && o.state === "formation" && o.warp === 0);
        if (others.length) {
          const o = others[Math.floor(rng() * others.length)];
          [o.slot, s.slot] = [s.slot, o.slot];
          o.warp = WARP_TICKS / 2 - 1;
        }
      }
      play(w, "blip");
    }
    return;
  }
  if (--s.warpT <= 0) {
    s.warp = WARP_TICKS;
    s.warpT = 120 + Math.floor(rng() * 100);
  }
}

function attack(w: World, s: Ship, rng: () => number) {
  if (!canFire(w) || s.state === "enter" || s.state === "wait" || s.x > W - 6 || cloaked(s) || s.warp > 0) return;
  const p = w.player;
  const speed = 1.6 + w.wave * 0.12;
  if (s.ability === "sonic") {
    if (--s.sonicT <= 0 && s.x > p.x + 30) {
      ring(w, s.x - s.w / 2, s.y, 85);
      s.sonicT = 150 + Math.floor(rng() * 100);
    }
    return;
  }
  if (s.state === "formation" && --s.fireT <= 0) {
    s.fireT = Math.max(90, 230 - w.wave * 30) + Math.floor(rng() * 200);
    if (s.x > p.x + 40) {
      if (s.ability === "tank") for (let k = -1; k <= 1; k++) aimed(w, s.x - 10, s.y, speed * 0.8, k * 0.25, "shell");
      else aimed(w, s.x - 8, s.y, speed, 0);
      play(w, "tom");
    }
  }
  if (s.state === "dive" && !s.shot && s.x < p.x + 150 && s.x > p.x + 60) {
    s.shot = true;
    if (rng() < 0.45 + w.wave * 0.1) {
      aimed(w, s.x - 8, s.y, speed + 0.3, 0);
      play(w, "tom");
    }
  }
}

function boss(w: World, s: Ship, rng: () => number) {
  const p = w.player;
  if (s.warp > 0) {
    s.warp--;
    if (s.warp === WARP_TICKS / 2) {
      let ny = s.y;
      for (let k = 0; k < 4 && Math.abs(ny - s.y) < 40; k++) ny = TOP + 20 + rng() * (BOTTOM - TOP - 40);
      s.y = ny;
      play(w, "blip");
    }
  }
  if (s.t <= 70) {
    // fly in
    const u = s.t / 70;
    s.x = W + 30 - (W + 30 - BOSS_X) * (1 - (1 - u) * (1 - u));
    return;
  }
  // fast: lunges at the ship (after a shake to warn, see draw.ts); it aims
  // when the shake starts, so moving out of its row dodges it
  if (s.ability === "fast") {
    s.lunge++;
    if (s.lunge === LUNGE_AT - 19) {
      s.cx = clamp(BOSS_X - (p.x + 12), 40, BOSS_X - 30);
      play(w, "rumble");
    }
    const at = s.lunge - LUNGE_AT;
    s.x = at > 0 && at <= 60 ? BOSS_X - Math.sin((Math.PI * at) / 60) * s.cx : BOSS_X;
    if (at === 0) play(w, "whoosh");
    if (at >= 60) s.lunge = 0;
  }
  // sweep up and down the screen on its own, slowing at the ends (not while lunging)
  if (s.warp === 0 && !lunging(s)) {
    const lo = TOP + 22;
    const hi = BOTTOM - 22;
    if (s.y <= lo) s.vy = Math.abs(s.vy);
    else if (s.y >= hi) s.vy = -Math.abs(s.vy);
    const ease = 0.4 + 0.6 * Math.min(1, (Math.min(s.y - lo, hi - s.y) + 2) / 24);
    s.y = clamp(s.y + s.vy * ease * (s.hp < s.maxHp / 2 ? 1.3 : 1), lo - 1, hi + 1);
  }
  if (!canFire(w)) return;
  if (--s.fireT <= 0) {
    // a bigger file fires more often, and a small one fewer at a time
    s.fireT = 120 - s.foe.hp * 3;
    const ways = (s.ability === "basic" ? 2 : 1) - (s.foe.hp <= 3 ? 1 : 0);
    for (let k = -ways; k <= ways; k++) aimed(w, s.x - 16, s.y, 1.8, k * 0.22, s.ability === "tank" ? "shell" : "bullet");
    play(w, "tom");
  }
  switch (s.ability) {
    case "shield":
      if (s.shield < s.maxShield && s.t % 120 === 0) s.shield++;
      break;
    case "teleport":
      if (--s.warpT <= 0) (s.warp = WARP_TICKS), (s.warpT = 150);
      break;
    case "sonic":
      // big rings that sweep the whole screen
      if (--s.sonicT <= 0) {
        ring(w, s.x - 18, s.y, 120, MAX_RING_R, -1.6);
        s.sonicT = 80;
      }
      break;
    case "split": {
      const due = s.hp < (s.maxHp * 2) / 3 ? (s.hp < s.maxHp / 3 ? 2 : 1) : 0;
      if (s.splits < due) {
        s.splits++;
        spawnMini(w, s, -18, rng);
        spawnMini(w, s, 18, rng);
        play(w, "whoosh");
      }
      break;
    }
    default:
      break;
  }
  if (targetable(s) && Math.abs(s.x - p.x) < s.w / 2 + 3 && Math.abs(s.y - p.y) < s.h / 2 + 2) hurt(w, rng);
}

function moveShots(w: World, rng: () => number) {
  for (const b of w.shots) {
    if (!b.on) continue;
    b.t++;
    if (b.kind === "missile") homing(w, b, 0.16, Math.min(4, Math.hypot(b.vx, b.vy) + 0.15));
    else if (b.kind === "seek" && b.t > 2) homing(w, b, 0.075, 5.6);
    b.x += b.vx;
    b.y += b.vy;
    if (b.x > W + 8 || b.x < -8 || b.y < TOP - 8 || b.y > BOTTOM + 8 || b.t > 150) {
      b.on = false;
      continue;
    }
    if (b.kind === "wave") {
      // pierces: hits each ship it passes once
      const half = waveHalf(b);
      for (const s of w.ships) {
        if (!s.on || s.waveHit === b.id || Math.abs(s.x - b.x) > s.w / 2 + 2 || Math.abs(s.y - b.y) > s.h / 2 + half) continue;
        if (damage(w, s, b.dmg, true, rng)) s.waveHit = b.id;
      }
      continue;
    }
    for (const s of w.ships) {
      if (!s.on || Math.abs(s.x - b.x) > s.w / 2 + 2 || Math.abs(s.y - b.y) > s.h / 2 + 2) continue;
      // shields face front: shots from behind (a missile curling round) get through
      if (damage(w, s, b.dmg, b.vx > 0, rng)) {
        b.on = false;
        break;
      }
    }
  }
}

/** Steer a shot toward the nearest ship it can hit, turning at most `turn` a tick, at speed `sp`. */
function homing(w: World, b: Shot, turn: number, sp: number) {
  let t: Ship | null = null;
  if (b.target >= 0) for (const s of w.ships) if (s.id === b.target && targetable(s)) t = s;
  if (!t) {
    let best = Infinity;
    for (const s of w.ships) {
      if (!targetable(s)) continue;
      const d = Math.hypot(s.x - b.x, s.y - b.y);
      if (d < best) (best = d), (t = s);
    }
    b.target = t ? t.id : -1;
  }
  let a = Math.atan2(b.vy, b.vx);
  if (t) {
    let d = Math.atan2(t.y - b.y, t.x - b.x) - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    a += clamp(d, -turn, turn);
  }
  b.vx = Math.cos(a) * sp;
  b.vy = Math.sin(a) * sp;
}

function moveFoeShots(w: World, rng: () => number) {
  const p = w.player;
  for (const b of w.foeShots) {
    if (!b.on) continue;
    b.t++;
    b.x += b.vx;
    b.y += b.vy;
    if (b.kind === "debris") (b.vx *= 0.995), (b.vy *= 0.995);
    if (b.x < -8 || b.x > W + 8 || b.y < TOP - 6 || b.y > BOTTOM + 6 || (b.kind === "debris" && b.t > 110)) {
      b.on = false;
      continue;
    }
    const r = b.kind === "bullet" ? 1.5 : 2.5;
    if (Math.abs(b.x - p.x) < 4 + r && Math.abs(b.y - p.y) < 2.5 + r && canHurt(w) && p.invuln === 0) {
      b.on = false;
      hurt(w, rng);
    }
  }
  for (const r of w.rings) {
    if (!r.on) continue;
    r.t++;
    r.x += r.vx;
    r.r = 3 + (r.t / r.life) * (r.max - 3);
    if (r.t >= r.life || r.x + r.r < -4) {
      r.on = false;
      continue;
    }
    // the wave hurts where its edge is, not inside it
    const d = Math.hypot(p.x - r.x, p.y - r.y);
    if (r.r > 5 && Math.abs(d - r.r) < 2.5 && canHurt(w) && p.invuln === 0) hurt(w, rng);
  }
}

function moveCapsules(w: World, rng: () => number) {
  const p = w.player;
  const caps = w.capsules;
  // capsules that meet (one dropped by a ship onto one drifting by) ease apart
  for (let i = 0; i < caps.length; i++) {
    const a = caps[i];
    if (!a.on) continue;
    for (let j = i + 1; j < caps.length; j++) {
      const b = caps[j];
      if (!b.on || Math.abs(a.x - b.x) >= 16 || Math.abs(a.base - b.base) >= 16) continue;
      const sx = a.x < b.x ? -1 : 1;
      const sy = a.base < b.base || (a.base === b.base && a.base > (TOP + BOTTOM) / 2) ? -1 : 1;
      a.x += sx * 0.4;
      b.x -= sx * 0.4;
      a.base += sy;
      b.base -= sy;
    }
  }
  for (const c of caps) {
    if (!c.on) continue;
    c.t++;
    c.x += c.vx;
    c.base = clamp(c.base, TOP + 8, BOTTOM - 8);
    // they bob in step with their neighbours, so spaced ones stay spaced
    c.y = c.base + Math.sin(w.tick * 0.08 + c.x * 0.05) * 6;
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const d = Math.hypot(dx, dy);
    if (w.phase !== "lost" && d < 30) {
      // a gentle pull once you're close
      c.x += (dx / (d || 1)) * 1.2;
      c.base += (dy / (d || 1)) * 1.2;
    }
    // (a capsule shows for a few frames first, even one dropped right on the ship)
    if (w.phase !== "lost" && d < 10 && c.t > 6) collect(w, c, rng);
    else if (c.x < -10) c.on = false;
  }
}

function effects(w: World) {
  for (const q of w.parts) {
    if (!q.on) continue;
    q.x += q.vx;
    q.y += q.vy;
    q.vx *= 0.94;
    q.vy *= 0.94;
    if (--q.t <= 0) q.on = false;
  }
  for (const b of w.booms) if (b.on && ++b.t >= (b.big ? 24 : 15)) b.on = false;
  for (const q of w.pops) if (q.on && ++q.t >= 40) q.on = false;
}

/** Ships still to beat, for the HUD (minis don't count, the boss does until it's beaten). */
export function foesLeft(w: World): number {
  return Math.max(0, w.foes - w.defeated);
}
