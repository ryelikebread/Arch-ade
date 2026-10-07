// Undelete's rules: the maze, the player, zombies (trashed and deleted
// files) and pickups (kept files). Pure state and logic, no drawing; the
// host ticks it 30 times a second and counts time in ticks.

import type { SfxName } from "../../../audio/sfx";
import type { Kind } from "../../../types";
import { filler } from "../../round";
import type { Ability, Cast, Foe, Friend, GameResult, Input, Perk } from "../../types";
import { buildMaze, isWall, reach, type Maze } from "./maze";

export const READY_TICKS = 45;
export const END_TICKS = 45;
/** Fewer foes than this and filler zombies join so the maze isn't empty. */
export const MIN_ZOMBIES = 10;
/** On the map at once, split minis included. */
export const MAX_ZOMBIES = 72;
export const MAX_ALLIES = 4;
export const MAX_AMMO = 199;
const MAX_WAVES = 24;
const MAX_FX = 48;
/** This many left and the rest come looking for you. */
export const HUNT_AT = 3;

const PLAYER_R = 0.22;
const MOVE = 0.1;
const TURN = 0.075;
const AIM_ASSIST = 0.12;
export const SPREAD_RAYS = [-0.075, 0, 0.075];
const CENTER_RAY = [0];
/** Hits from within this angle of where a shield zombie faces land on its shield. */
const SHIELD_ARC = 1.35;

export type Phase = "ready" | "play" | "won" | "lost" | "done";
export type Tone = Perk | "info" | "warn";
export type FxType = "puff" | "boom" | "spark" | "warp" | "zap" | "shard";

export interface Player {
  x: number;
  y: number;
  a: number;
  hp: number;
  armor: number;
  ammo: number;
  cd: number;
  recoil: number;
  /** Ticks left of each timed power. */
  rapid: number;
  spread: number;
  power: number;
  /** Ticks of red flash after a hit; ticks of no damage after a hit. */
  hurt: number;
  inv: number;
  /** Ticks of glow after a pickup. */
  glow: number;
  walk: number;
  moving: boolean;
}

export interface Zombie {
  id: number;
  label: string;
  /** The file's kind, for its icon; null for filler. */
  kind: Kind | null;
  ability: Ability;
  elite: boolean;
  /** A small half of a split zombie: doesn't count as a foe of its own. */
  mini: boolean;
  /** Counts toward "defeated" when beaten. */
  counts: boolean;
  x: number;
  y: number;
  face: number;
  hp: number;
  maxHp: number;
  shield: number;
  shieldMax: number;
  radius: number;
  height: number;
  speed: number;
  dmg: number;
  atkCd: number;
  value: number;
  awake: boolean;
  sees: boolean;
  cd: number;
  swing: number;
  shout: number;
  /** Ability clock: flash phase, teleport countdown, sonic reload. */
  timer: number;
  warp: number;
  hurt: number;
  shieldHit: number;
  step: number;
  moving: boolean;
  /** Ticks left following the maze instead of walking straight at the player (after getting snagged). */
  detour: number;
  dead: boolean;
  dying: number;
}

export interface Pickup {
  friend: Friend;
  x: number;
  y: number;
  taken: boolean;
}

export interface Ally {
  label: string;
  kind: Kind;
  x: number;
  y: number;
  ttl: number;
  cd: number;
  rate: number;
  flash: number;
}

export interface Wave {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ttl: number;
  dmg: number;
}

export interface Fx {
  type: FxType;
  x: number;
  y: number;
  /** Height above the floor and size, in cells. */
  z: number;
  size: number;
  t: number;
  ttl: number;
  color: string;
}

export interface World {
  rng: () => number;
  maze: Maze;
  tick: number;
  phase: Phase;
  phaseT: number;
  won: boolean;
  player: Player;
  zombies: Zombie[];
  pickups: Pickup[];
  allies: Ally[];
  waves: Wave[];
  fx: Fx[];
  score: number;
  defeated: number;
  foes: number;
  /** Foes that are files (the rest are filler). */
  files: number;
  /** Damage taken is scaled by this: big rounds hit softer, so the long fight stays fair. */
  crowd: number;
  collected: number;
  /** Zombies not yet beaten (minis included). */
  alive: number;
  hunting: boolean;
  msg: { text: string; tone: Tone; t: number };
  /** The zombie under the crosshair. */
  target: Zombie | null;
  shots: number;
  lastRays: number;
  flow: Int16Array;
  flowCell: number;
  queue: Int32Array;
  sounds: SfxName[];
  lastSfx: Map<SfxName, number>;
  nextId: number;
}

export interface Io {
  input: Input;
  sfx(name: SfxName): void;
  end(r: GameResult): void;
}

// ---------- setting up ----------

/** How many shots a zombie takes: half the file's strength, rounded up; elite +1, tanks half again. */
export function hitsFor(foe: Foe): number {
  let hits = Math.ceil(foe.hp / 2) + (foe.elite ? 1 : 0);
  if (foe.ability === "tank") hits = Math.ceil(hits * 1.5) + 1;
  return hits;
}

const SPEED: Record<Ability, number> = { flash: 0.028, shield: 0.024, teleport: 0.026, sonic: 0.024, fast: 0.056, split: 0.028, tank: 0.018, basic: 0.028 };

export function makeZombie(id: number, foe: Foe, x: number, y: number, face: number, rng: () => number): Zombie {
  const tank = foe.ability === "tank";
  const hp = hitsFor(foe);
  const shieldMax = foe.ability === "shield" ? 2 + Math.floor(foe.hp / 3) : 0;
  const dmg = (tank ? 10 : foe.ability === "fast" ? 4 : 5) * (foe.elite ? 1.25 : 1);
  return {
    id,
    label: foe.label,
    kind: foe.file?.kind ?? null,
    ability: foe.ability,
    elite: foe.elite,
    mini: false,
    counts: true,
    x,
    y,
    face,
    hp,
    maxHp: hp,
    shield: shieldMax,
    shieldMax,
    radius: tank ? 0.36 : 0.26,
    height: tank ? 1.0 : 0.78,
    speed: SPEED[foe.ability],
    dmg: Math.round(dmg),
    atkCd: tank ? 42 : foe.ability === "fast" ? 22 : 30,
    value: Math.round((50 + foe.hp * 25) * (foe.elite ? 2 : 1)),
    awake: false,
    sees: false,
    cd: 0,
    swing: 0,
    shout: 0,
    timer: Math.floor(rng() * 120),
    warp: 0,
    hurt: 0,
    shieldHit: 0,
    step: rng() * 4,
    moving: false,
    detour: 0,
    dead: false,
    dying: 0,
  };
}

function shuffle<T>(a: T[], rng: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Staples to start with: enough for a good part of the round, since beaten zombies give some back. */
export function startAmmo(zombies: Zombie[]): number {
  let need = 0;
  for (const z of zombies) need += z.maxHp + z.shieldMax;
  return Math.max(60, Math.min(MAX_AMMO, Math.round(need * 0.75) + 10));
}

/** Staples a beaten zombie gives back: about a third of what it took. */
export const lootFor = (z: Zombie) => (z.mini || !z.counts ? 0 : 1 + Math.ceil((z.maxHp + z.shieldMax) / 3));

export function createWorld(cast: Cast, rng: () => number): World {
  const foes = cast.foes.slice(0, 48);
  const files = foes.length;
  if (foes.length < MIN_ZOMBIES) foes.push(...filler(MIN_ZOMBIES - foes.length, rng));
  const friends = cast.friends.slice(0, 32);
  const maze = buildMaze(rng, foes.length, friends.length);
  const sx = Math.floor(maze.start.x);
  const sy = Math.floor(maze.start.y);
  const fromStart = reach(maze, sx, sy);

  // Zombies start well away from the player (relaxing that if the maze is tight).
  const floor: number[] = [];
  for (let i = 0; i < fromStart.length; i++) if (fromStart[i] >= 1) floor.push(i);
  let far: number[] = [];
  for (const min of [9, 6, 3, 1]) {
    far = floor.filter((i) => fromStart[i] >= min);
    if (far.length >= foes.length) break;
  }
  shuffle(far, rng);
  const used = new Set<number>();
  const at = (cell: number, k: number) => ({
    x: (cell % maze.w) + 0.5 + (k > 0 ? (rng() - 0.5) * 0.4 : 0),
    y: Math.floor(cell / maze.w) + 0.5 + (k > 0 ? (rng() - 0.5) * 0.4 : 0),
  });
  const zombies = foes.map((foe, i) => {
    const cell = far.length ? far[i % far.length] : sy * maze.w + sx;
    used.add(cell);
    const p = at(cell, Math.floor(i / Math.max(1, far.length)));
    return makeZombie(i, foe, p.x, p.y, rng() * Math.PI * 2, rng);
  });

  // Pickups anywhere but the start cell, one per cell where possible.
  const spots = shuffle(
    floor.filter((i) => fromStart[i] >= 2 && !used.has(i)),
    rng,
  );
  const pickups: Pickup[] = friends.map((friend, i) => {
    const cell = spots.length ? spots[i % spots.length] : sy * maze.w + sx;
    const p = at(cell, Math.floor(i / Math.max(1, spots.length)));
    return { friend, x: p.x, y: p.y, taken: false };
  });

  // Face down the longest open line from the start.
  let a = 0;
  let best = -1;
  for (const dir of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const d = rayDist(maze, maze.start.x, maze.start.y, Math.cos(dir), Math.sin(dir), 30);
    if (d > best + 0.01) ((best = d), (a = dir));
  }

  const n = maze.w * maze.h;
  return {
    rng,
    maze,
    tick: 0,
    phase: "ready",
    phaseT: READY_TICKS,
    won: false,
    player: { x: maze.start.x, y: maze.start.y, a, hp: 100, armor: 0, ammo: startAmmo(zombies), cd: 0, recoil: 0, rapid: 0, spread: 0, power: 0, hurt: 0, inv: 0, glow: 0, walk: 0, moving: false },
    zombies,
    pickups,
    allies: [],
    waves: [],
    fx: [],
    score: 0,
    defeated: 0,
    foes: foes.length,
    files,
    crowd: Math.max(0.7, Math.min(1, 24 / foes.length)),
    collected: 0,
    alive: zombies.length,
    hunting: false,
    msg: { text: "", tone: "info", t: 0 },
    target: null,
    shots: 0,
    lastRays: 0,
    flow: new Int16Array(n),
    flowCell: -1,
    queue: new Int32Array(n),
    sounds: [],
    lastSfx: new Map(),
    nextId: zombies.length,
  };
}

// ---------- geometry ----------

/** Distance along a unit ray to the first wall (at most `max`). */
export function rayDist(m: Maze, x: number, y: number, dx: number, dy: number, max: number): number {
  let mx = Math.floor(x);
  let my = Math.floor(y);
  const ddx = dx === 0 ? 1e30 : Math.abs(1 / dx);
  const ddy = dy === 0 ? 1e30 : Math.abs(1 / dy);
  const stepX = dx < 0 ? -1 : 1;
  const stepY = dy < 0 ? -1 : 1;
  let sdx = (dx < 0 ? x - mx : mx + 1 - x) * ddx;
  let sdy = (dy < 0 ? y - my : my + 1 - y) * ddy;
  for (let i = 0; i < 200; i++) {
    let d: number;
    if (sdx < sdy) {
      d = sdx;
      sdx += ddx;
      mx += stepX;
    } else {
      d = sdy;
      sdy += ddy;
      my += stepY;
    }
    if (d >= max) return max;
    if (mx < 0 || my < 0 || mx >= m.w || my >= m.h || m.cells[my * m.w + mx] !== 0) return d;
  }
  return max;
}

export function los(m: Maze, ax: number, ay: number, bx: number, by: number): boolean {
  const d = Math.hypot(bx - ax, by - ay);
  if (d < 0.01) return true;
  return rayDist(m, ax, ay, (bx - ax) / d, (by - ay) / d, d) >= d - 1e-6;
}

/** A body of radius r can walk straight from a to b: its center line and both edge lines are clear of walls. */
export function fits(m: Maze, ax: number, ay: number, bx: number, by: number, r: number): boolean {
  const d = Math.hypot(bx - ax, by - ay);
  if (d < 0.01) return true;
  const nx = ((ay - by) / d) * r;
  const ny = ((bx - ax) / d) * r;
  return los(m, ax, ay, bx, by) && los(m, ax + nx, ay + ny, bx + nx, by + ny) && los(m, ax - nx, ay - ny, bx - nx, by - ny);
}

const angDiff = (a: number, b: number) => {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

const blocked = (m: Maze, x: number, y: number, r: number) =>
  isWall(m, x - r, y - r) || isWall(m, x + r, y - r) || isWall(m, x - r, y + r) || isWall(m, x + r, y + r);

/** Move with wall collision, sliding along walls one axis at a time. */
export function moveBody(m: Maze, b: { x: number; y: number }, dx: number, dy: number, r: number) {
  if (!blocked(m, b.x + dx, b.y, r)) b.x += dx;
  if (!blocked(m, b.x, b.y + dy, r)) b.y += dy;
}

// ---------- small helpers ----------

/** Queue a sound, at most once every 4 ticks per sound. */
export function play(w: World, name: SfxName) {
  const last = w.lastSfx.get(name);
  if (last !== undefined && w.tick - last < 4) return;
  w.lastSfx.set(name, w.tick);
  w.sounds.push(name);
}

export function say(w: World, text: string, tone: Tone, t = 60) {
  w.msg = { text, tone, t };
}

export function addFx(w: World, type: FxType, x: number, y: number, z: number, size: number, ttl: number, color = "") {
  if (w.fx.length >= MAX_FX) w.fx.shift();
  w.fx.push({ type, x, y, z, size, t: 0, ttl, color });
}

/**
 * Flash zombies blink out of sight: 0 visible, 1 flickering (still
 * visible this tick), 2 gone (shots pass through). They show up to swipe.
 */
export function cloak(z: Zombie): 0 | 1 | 2 {
  if (z.ability !== "flash" || z.dead || z.swing > 0) return 0;
  const t = z.timer % 120;
  if (t < 66) return 0;
  if (t < 84) return (t >> 1) & 1 ? 2 : 1;
  return 2;
}

export type GunMode = "basic" | "spread" | "power";
export const gunOf = (p: Player): GunMode => (p.power > 0 ? "power" : p.spread > 0 ? "spread" : "basic");

// ---------- damage ----------

const shot: { z: Zombie | null; dist: number } = { z: null, dist: 0 };

/** The first zombie along a ray from the player (or null), and how far the shot goes. Reuses one result object: read it before the next call. */
export function aim(w: World, angle: number, from: { x: number; y: number } = w.player, range = 24): { z: Zombie | null; dist: number } {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let dist = rayDist(w.maze, from.x, from.y, dx, dy, range);
  let z: Zombie | null = null;
  for (const c of w.zombies) {
    if (c.dead || cloak(c) === 2) continue;
    const rx = c.x - from.x;
    const ry = c.y - from.y;
    const along = rx * dx + ry * dy;
    if (along <= 0.05 || along >= dist) continue;
    if (Math.abs(ry * dx - rx * dy) <= c.radius + AIM_ASSIST) ((z = c), (dist = along));
  }
  shot.z = z;
  shot.dist = dist;
  return shot;
}

/** A tank on its last hits: it swells and blinks before it bursts. */
export const primed = (z: Zombie) => z.ability === "tank" && !z.mini && !z.dead && z.hp <= Math.max(1, Math.ceil(z.maxHp / 4));

/** Damage a zombie from a point. Splash goes around shields. */
export function hitZombie(w: World, z: Zombie, dmg: number, fromX: number, fromY: number, splash = false): "miss" | "shield" | "hit" | "kill" {
  if (z.dead) return "miss";
  z.awake = true;
  if (z.shield > 0 && !splash && Math.abs(angDiff(Math.atan2(fromY - z.y, fromX - z.x), z.face)) < SHIELD_ARC) {
    z.shield = Math.max(0, z.shield - dmg);
    z.shieldHit = 5;
    if (z.shield === 0) {
      play(w, "pop");
      addFx(w, "shard", z.x, z.y, 0.3, 0.5, 14, "#a493c4");
    } else play(w, "bounce");
    return "shield";
  }
  z.hp -= dmg;
  z.hurt = 5;
  play(w, "hit");
  if (z.hp <= 0) {
    kill(w, z);
    return "kill";
  }
  return "hit";
}

function kill(w: World, z: Zombie) {
  z.dead = true;
  z.dying = 14;
  z.hp = 0;
  if (z.counts) w.defeated++;
  w.score += z.value;
  w.player.ammo = Math.min(MAX_AMMO, w.player.ammo + lootFor(z)); // its staples fall out
  play(w, "sizzle");
  addFx(w, "puff", z.x, z.y, z.height * 0.4, z.height * 0.7, 16, z.elite ? "#ffd23f" : "#a8c49a");
  if (z.mini) return;
  if (z.ability === "split") split(w, z);
  if (z.ability === "tank") burst(w, z);
}

/** An archive zombie breaks into two minis (they don't count as extra foes). */
function split(w: World, z: Zombie) {
  play(w, "pop");
  const n = Math.min(2, MAX_ZOMBIES - w.zombies.filter((c) => !c.dead).length);
  for (let i = 0; i < n; i++) {
    const side = i === 0 ? 1 : -1;
    const ox = Math.cos(z.face + Math.PI / 2) * 0.3 * side;
    const oy = Math.sin(z.face + Math.PI / 2) * 0.3 * side;
    const m = makeZombie(w.nextId++, { file: null, label: z.label, family: "archive", ability: "split", hp: 1, elite: false }, z.x, z.y, z.face, w.rng);
    moveBody(w.maze, m, ox, oy, 0.18);
    Object.assign(m, { kind: z.kind, mini: true, counts: false, radius: 0.18, height: 0.45, speed: 0.042, dmg: 3, atkCd: 24, value: 25, awake: true, hp: z.elite ? 2 : 1, maxHp: z.elite ? 2 : 1 });
    w.zombies.push(m);
  }
}

export const BURST_R = 2;

/** A tank zombie bursts: damage all around, the player included if close. */
function burst(w: World, z: Zombie) {
  play(w, "explosion");
  addFx(w, "boom", z.x, z.y, 0.6, 1.4, 18);
  const p = w.player;
  const d = Math.hypot(p.x - z.x, p.y - z.y);
  if (d < BURST_R) hurtPlayer(w, Math.round(4 + 8 * (1 - d / BURST_R)));
  // only those already here: minis split off by this burst live on
  for (let i = 0, n = w.zombies.length; i < n; i++) {
    const c = w.zombies[i];
    if (c !== z && !c.dead && Math.hypot(c.x - z.x, c.y - z.y) < BURST_R) hitZombie(w, c, 2, z.x, z.y, true);
  }
}

/** The splash weapon's blast: hurts the first `n` zombies only (not minis split off by this shot). */
function blast(w: World, x: number, y: number, skip: Zombie | null, n: number) {
  play(w, "explosion");
  addFx(w, "boom", x, y, 0.45, 0.8, 12);
  for (let i = 0; i < n; i++) {
    const c = w.zombies[i];
    if (c !== skip && !c.dead && Math.hypot(c.x - x, c.y - y) < 1.4) hitZombie(w, c, 2, x, y, true);
  }
}

export function hurtPlayer(w: World, amount: number) {
  const p = w.player;
  if (w.phase !== "play" || p.inv > 0 || amount <= 0) return;
  amount = Math.max(1, Math.round(amount * w.crowd));
  const soak = Math.min(p.armor, Math.round((amount * 2) / 3));
  p.armor -= soak;
  p.hp = Math.max(0, p.hp - (amount - soak));
  p.inv = 15;
  p.hurt = 8;
  play(w, "hurt");
  if (p.hp <= 0) {
    w.phase = "lost";
    w.phaseT = END_TICKS;
    say(w, "YOU WERE DELETED", "warn", END_TICKS);
  }
}

// ---------- pickups ----------

/** Health, armor and staples stay on the floor while you're full, for later. */
export const wanted = (p: Player, perk: Perk) =>
  perk === "health" ? p.hp < 100 : perk === "armor" ? p.armor < 100 : perk === "ammo" ? p.ammo < MAX_AMMO : true;

const sec = (s: number) => Math.round(s * 30);

/** A kept file's perk, its strength scaled by the file's power (1..10). */
export function collect(w: World, pk: Pickup) {
  if (pk.taken) return;
  pk.taken = true;
  w.collected++;
  const p = w.player;
  const { perk, power, label, file } = pk.friend;
  p.glow = 8;
  let text = "";
  switch (perk) {
    case "health": {
      const heal = 12 + power * 4;
      p.hp = Math.min(100, p.hp + heal);
      text = `+${heal} HEALTH`;
      play(w, "chime");
      break;
    }
    case "armor": {
      const add = 10 + power * 6;
      p.armor = Math.min(100, p.armor + add);
      text = `+${add} ARMOR`;
      play(w, "tomHi");
      break;
    }
    case "ally": {
      const ttl = sec(25 + power * 3);
      const rate = Math.max(8, 26 - power * 2);
      if (w.allies.length < MAX_ALLIES) {
        // it boots up where it hovers, not in your face
        hoverSpot(w, w.allies.length, goal);
        w.allies.push({ label, kind: file.kind, x: goal.x, y: goal.y, ttl, cd: 10, rate, flash: 0 });
        addFx(w, "warp", goal.x, goal.y, 0.75, 0.4, 14);
      } else {
        const weakest = w.allies.reduce((a, b) => (b.ttl < a.ttl ? b : a));
        Object.assign(weakest, { label, kind: file.kind, ttl: weakest.ttl + ttl, rate: Math.min(weakest.rate, rate) });
      }
      text = "BOT ONLINE";
      play(w, "jingle");
      break;
    }
    case "rapid":
      p.rapid += sec(8 + power * 1.5);
      text = "RAPID FIRE";
      play(w, "powerup");
      break;
    case "spread":
      p.spread += sec(10 + power * 2);
      text = "FAN STAPLER";
      play(w, "powerup");
      break;
    case "ammo": {
      const add = 15 + power * 6;
      p.ammo = Math.min(MAX_AMMO, p.ammo + add);
      text = `+${add} STAPLES`;
      play(w, "pop");
      break;
    }
    case "power":
      p.power += sec(6 + power * 1.4);
      text = "SPLASH CANNON";
      play(w, "powerup");
      break;
    case "points":
      w.score += 100 * power;
      text = `+${100 * power}`;
      play(w, "coin");
      break;
  }
  say(w, `${text} (${label})`, perk, 75);
}

// ---------- the tick ----------

export function step(w: World, io: Io) {
  if (w.phase === "done") return;
  w.tick++;
  if (w.msg.t > 0) w.msg.t--;
  ageFx(w);
  const p = w.player;
  if (p.hurt > 0) p.hurt--;
  if (p.glow > 0) p.glow--;

  if (w.phase === "ready") {
    turn(w, io.input); // look around while waiting
    if (w.tick === 1) play(w, "rumble");
    if (--w.phaseT <= 0) {
      w.phase = "play";
      say(w, "SHOOT THE DELETED FILES", "info", 75);
    }
  } else if (w.phase === "won" || w.phase === "lost") {
    for (const z of w.zombies) if (z.dying > 0) z.dying--;
    if (p.recoil > 0) p.recoil--;
    if (--w.phaseT <= 0) {
      w.phase = "done";
      flush(w, io);
      io.end({ won: w.won, score: w.score, defeated: Math.min(w.defeated, w.foes), foes: w.foes, collected: w.collected });
      return;
    }
  } else {
    movePlayer(w, io.input);
    for (const pk of w.pickups) if (!pk.taken && wanted(p, pk.friend.perk) && Math.hypot(pk.x - p.x, pk.y - p.y) < 0.6) collect(w, pk);
    updateFlow(w);
    weapon(w, io.input);
    zombies(w);
    allies(w);
    waves(w);
    w.target = aim(w, p.a).z;
    if (w.phase === "play" && w.alive === 0) {
      w.phase = "won";
      w.won = true;
      w.phaseT = END_TICKS;
      w.score += 500 + p.hp * 5 + p.armor * 2;
      say(w, "MAZE CLEAN!", "info", END_TICKS);
    }
  }
  flush(w, io);
}

function flush(w: World, io: Io) {
  for (const s of w.sounds) io.sfx(s);
  w.sounds.length = 0;
}

function ageFx(w: World) {
  for (let i = w.fx.length - 1; i >= 0; i--) if (++w.fx[i].t >= w.fx[i].ttl) w.fx.splice(i, 1);
}

function turn(w: World, inp: Input) {
  if (inp.held("alt")) return;
  const p = w.player;
  p.a += TURN * ((inp.held("right") ? 1 : 0) - (inp.held("left") ? 1 : 0));
  p.a = Math.atan2(Math.sin(p.a), Math.cos(p.a));
}

function movePlayer(w: World, inp: Input) {
  const p = w.player;
  turn(w, inp);
  const fwd = (inp.held("up") ? 1 : 0) - (inp.held("down") ? 1 : 0);
  const side = inp.held("alt") ? (inp.held("right") ? 1 : 0) - (inp.held("left") ? 1 : 0) : 0;
  const c = Math.cos(p.a);
  const s = Math.sin(p.a);
  const back = fwd < 0 ? 0.7 : 1;
  moveBody(w.maze, p, (c * fwd * back - s * side * 0.85) * MOVE, (s * fwd * back + c * side * 0.85) * MOVE, PLAYER_R);
  p.moving = fwd !== 0 || side !== 0;
  if (p.moving) p.walk++;
  if (p.inv > 0) p.inv--;
}

function weapon(w: World, inp: Input) {
  const p = w.player;
  if (p.cd > 0) p.cd--;
  if (p.recoil > 0) p.recoil--;
  if (p.rapid > 0) p.rapid--;
  if (p.spread > 0) p.spread--;
  if (p.power > 0) p.power--;
  if (!(inp.held("fire") || inp.clicked()) || p.cd > 0) return;
  const mode = gunOf(p);
  let cd = mode === "power" ? 14 : mode === "spread" ? 10 : 8;
  if (p.rapid > 0) cd = Math.ceil(cd / 2);
  if (mode !== "power") {
    if (p.ammo > 0) p.ammo--;
    else cd = Math.ceil(cd * 1.25); // out of staples: still fires, slower
  }
  p.cd = cd;
  p.recoil = 5;
  w.shots++;
  play(w, "shoot");
  const rays = mode === "spread" ? SPREAD_RAYS : CENTER_RAY;
  w.lastRays = rays.length;
  const before = w.zombies.length;
  for (const da of rays) {
    const a = p.a + da;
    const { z, dist } = aim(w, a);
    const ix = p.x + Math.cos(a) * (dist - 0.15);
    const iy = p.y + Math.sin(a) * (dist - 0.15);
    if (z) {
      hitZombie(w, z, mode === "power" ? 3 : 1, p.x, p.y);
      addFx(w, "spark", ix, iy, z.height * 0.55, 0.16, 5);
    } else if (mode !== "power" && dist > 0.8) addFx(w, "spark", ix, iy, 0.5, 0.12, 5);
    if (mode === "power") blast(w, ix, iy, z, before);
  }
  // Shots are loud: anything close wakes up.
  for (const z of w.zombies) if (!z.dead && Math.hypot(z.x - p.x, z.y - p.y) < 5) z.awake = true;
}

/** Steps to the player from every cell, refreshed when the player changes cell. */
function updateFlow(w: World) {
  const p = w.player;
  const cx = Math.floor(p.x);
  const cy = Math.floor(p.y);
  const cell = cy * w.maze.w + cx;
  if (cell === w.flowCell) return;
  w.flowCell = cell;
  reach(w.maze, cx, cy, w.flow, w.queue);
}

/** Where to head for the player from (x, y): straight there when the way is clear, else down the flow field. */
function towardPlayer(w: World, x: number, y: number, straight: boolean, out: { x: number; y: number }) {
  const p = w.player;
  out.x = p.x;
  out.y = p.y;
  if (straight) return;
  const m = w.maze;
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  let best = w.flow[cy * m.w + cx];
  if (best < 0) best = 1 << 14;
  for (const [dx, dy] of DIRS) {
    const nx = cx + dx;
    const ny = cy + dy;
    if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
    const d = w.flow[ny * m.w + nx];
    if (d >= 0 && d < best) {
      best = d;
      out.x = nx + 0.5;
      out.y = ny + 0.5;
    }
  }
}
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const goal = { x: 0, y: 0 };

function zombies(w: World) {
  const p = w.player;
  const m = w.maze;
  const rng = w.rng;
  let alive = 0;
  for (const z of w.zombies) if (!z.dead) alive++;
  if (!w.hunting && alive <= HUNT_AT && alive > 0) {
    w.hunting = true;
    say(w, "THE LAST FILES COME FOR YOU", "warn", 75);
    play(w, "rumble");
  }
  // Every 10 s one more sleeper picks up your scent.
  if (w.tick % 300 === 0) {
    const sleeping = w.zombies.filter((z) => !z.dead && !z.awake);
    if (sleeping.length) sleeping[Math.floor(rng() * sleeping.length)].awake = true;
  }

  for (const z of w.zombies) {
    if (z.dead) {
      if (z.dying > 0) z.dying--;
      continue;
    }
    z.timer++;
    if (z.hurt > 0) z.hurt--;
    if (z.shieldHit > 0) z.shieldHit--;
    if (z.cd > 0) z.cd--;
    if (z.swing > 0) z.swing--;
    if (z.shout > 0) z.shout--;
    const dx = p.x - z.x;
    const dy = p.y - z.y;
    const d = Math.hypot(dx, dy);
    if ((w.tick + z.id) % 6 === 0) {
      z.sees = d < 10 && los(m, z.x, z.y, p.x, p.y);
      if (z.sees && d < 7) z.awake = true;
    }
    if (w.hunting) z.awake = true;
    z.moving = false;
    if (!z.awake) {
      z.step += 0.04; // swaying on the spot
      continue;
    }

    // Abilities.
    if (z.ability === "teleport" && !z.mini) {
      if (z.warp > 0) {
        if (--z.warp === 0) teleport(w, z);
        continue; // glitching in place
      }
      if (z.timer % 150 === 149) z.warp = 14;
    }
    if (z.ability === "sonic" && z.sees && d < 9 && z.timer % 95 === 0 && w.waves.length < MAX_WAVES) {
      const v = 0.07;
      w.waves.push({ x: z.x + (dx / d) * 0.3, y: z.y + (dy / d) * 0.3, vx: (dx / d) * v, vy: (dy / d) * v, ttl: 180, dmg: z.elite ? 8 : 6 });
      z.shout = 10;
      play(w, "horn");
    }

    // Shamble toward the player (sonic ones keep their distance). Straight
    // at them when the whole body fits through; snagged on a corner, follow
    // the maze for a bit.
    const reachD = z.radius + 0.5;
    const holdOff = z.ability === "sonic" && z.sees && d < 3.5;
    if (z.detour > 0) z.detour--;
    if (d > reachD && !holdOff) {
      const straight = z.sees && d < 7 && z.detour === 0 && fits(m, z.x, z.y, p.x, p.y, z.radius);
      towardPlayer(w, z.x, z.y, straight, goal);
      const gx = goal.x - z.x;
      const gy = goal.y - z.y;
      const gl = Math.hypot(gx, gy) || 1;
      const sp = z.speed * (z.swing > 0 ? 0.3 : 1);
      const bx = z.x;
      const by = z.y;
      moveBody(m, z, (gx / gl) * sp, (gy / gl) * sp, z.radius);
      z.moving = z.x !== bx || z.y !== by;
      if (straight && !z.moving && sp > 0) z.detour = 30;
      turnToward(z, Math.atan2(gy, gx), 0.12);
      z.step += sp * 7;
    } else turnToward(z, Math.atan2(dy, dx), 0.15);
    // A tank about to burst ticks like a fuse.
    if (d < 6 && primed(z) && z.timer % 20 === 0) play(w, "tom");

    // Swipe: wind up, then strike if still in reach. Flash zombies show up for it.
    if (d < reachD + 0.1 && z.cd === 0 && z.swing === 0 && cloak(z) !== 2) {
      z.swing = 12;
      z.cd = z.atkCd;
    }
    if (z.swing === 6 && d < reachD + 0.3) hurtPlayer(w, z.dmg);
  }

  // Don't stack up: push overlapping zombies apart, and off the player.
  // Bumping into a sleeper wakes it, so it moves on instead of blocking the
  // way. The one further from you gives way (the other one only if it
  // can't), so two can't jam a corridor mouth shoulder to shoulder.
  const zs = w.zombies;
  for (let i = 0; i < zs.length; i++) {
    const a = zs[i];
    if (a.dead) continue;
    for (let j = i + 1; j < zs.length; j++) {
      const b = zs[j];
      if (b.dead || (!a.awake && !b.awake)) continue;
      const ox = b.x - a.x;
      const oy = b.y - a.y;
      const min = a.radius + b.radius;
      const d2 = ox * ox + oy * oy;
      if (d2 >= min * min || d2 === 0) continue;
      a.awake = b.awake = true;
      const d = Math.sqrt(d2);
      const aFirst = (a.x - p.x) ** 2 + (a.y - p.y) ** 2 <= (b.x - p.x) ** 2 + (b.y - p.y) ** 2;
      const back = aFirst ? b : a;
      const ahead = aFirst ? a : b;
      const ux = ((aFirst ? ox : -ox) / d) * (min - d);
      const uy = ((aFirst ? oy : -oy) / d) * (min - d);
      const bx = back.x;
      const by = back.y;
      moveBody(m, back, ux, uy, back.radius);
      if (back.x === bx && back.y === by) moveBody(m, ahead, -ux, -uy, ahead.radius);
    }
    if (!a.awake) continue;
    const px0 = a.x - p.x;
    const py0 = a.y - p.y;
    const pd = Math.hypot(px0, py0);
    const min = a.radius + PLAYER_R + 0.05;
    if (pd < min && pd > 0) moveBody(m, a, (px0 / pd) * (min - pd), (py0 / pd) * (min - pd), a.radius);
  }

  // Forget the fallen once they've finished falling.
  let n = 0;
  alive = 0;
  for (const z of zs) {
    if (z.dead && z.dying <= 0) continue;
    if (!z.dead) alive++;
    zs[n++] = z;
  }
  zs.length = n;
  w.alive = alive;
}

function turnToward(z: Zombie, a: number, rate: number) {
  const d = angDiff(a, z.face);
  z.face += Math.max(-rate, Math.min(rate, d));
}

/** Blink to a free cell a few steps from the player (not right next to them). */
function teleport(w: World, z: Zombie) {
  const m = w.maze;
  const p = w.player;
  for (let tries = 0; tries < 24; tries++) {
    const cx = Math.floor(p.x + (w.rng() - 0.5) * 14);
    const cy = Math.floor(p.y + (w.rng() - 0.5) * 14);
    if (cx < 0 || cy < 0 || cx >= m.w || cy >= m.h) continue;
    const steps = w.flow[cy * m.w + cx];
    if (steps < 3 || steps > 7) continue;
    if (w.zombies.some((o) => o !== z && !o.dead && Math.floor(o.x) === cx && Math.floor(o.y) === cy)) continue;
    addFx(w, "warp", z.x, z.y, z.height / 2, z.height, 14);
    z.x = cx + 0.5;
    z.y = cy + 0.5;
    z.face = Math.atan2(p.y - z.y, p.x - z.x);
    addFx(w, "warp", z.x, z.y, z.height / 2, z.height, 14);
    play(w, "whoosh");
    return;
  }
}

const spot = { x: 0, y: 0 };

/**
 * Where bot `i` hovers: ahead of you, off to one side (the drawing lifts it
 * above the line of fire); where walls are in the way, tagging along behind.
 */
function hoverSpot(w: World, i: number, out: { x: number; y: number }) {
  const p = w.player;
  const m = w.maze;
  const c = Math.cos(p.a);
  const s = Math.sin(p.a);
  const side = i & 1 ? -0.4 : 0.4;
  out.x = p.x + c * 1.6 - s * side;
  out.y = p.y + s * 1.6 + c * side;
  if (isWall(m, out.x, out.y) || !los(m, p.x, p.y, out.x, out.y)) ((out.x = p.x - c * 0.5), (out.y = p.y - s * 0.5));
  if (isWall(m, out.x, out.y)) ((out.x = p.x), (out.y = p.y));
}

function allies(w: World) {
  const m = w.maze;
  for (let i = w.allies.length - 1; i >= 0; i--) {
    const a = w.allies[i];
    if (a.flash > 0) a.flash--;
    if (--a.ttl <= 0) {
      w.allies.splice(i, 1);
      addFx(w, "puff", a.x, a.y, 0.4, 0.4, 14, "#4de1ff");
      say(w, `BOT ${a.label} SIGNED OFF`, "ally", 60);
      continue;
    }
    hoverSpot(w, i, spot);
    const fx = spot.x;
    const fy = spot.y;
    const d = Math.hypot(fx - a.x, fy - a.y);
    if (d > 0.3) {
      const direct = d < 6 && fits(m, a.x, a.y, fx, fy, 0.15);
      towardPlayer(w, a.x, a.y, direct, goal);
      if (direct) ((goal.x = fx), (goal.y = fy));
      const gx = goal.x - a.x;
      const gy = goal.y - a.y;
      const gl = Math.hypot(gx, gy) || 1;
      const sp = Math.min(0.11, d * 0.5);
      moveBody(m, a, (gx / gl) * sp, (gy / gl) * sp, 0.15);
    }
    // Shoot the nearest zombie it can see.
    if (--a.cd > 0) continue;
    let best: Zombie | null = null;
    let bd = 8;
    for (const z of w.zombies) {
      if (z.dead || cloak(z) === 2) continue;
      const zd = Math.hypot(z.x - a.x, z.y - a.y);
      if (zd < bd && los(m, a.x, a.y, z.x, z.y)) ((best = z), (bd = zd));
    }
    if (!best) {
      a.cd = 5;
      continue;
    }
    hitZombie(w, best, 1, a.x, a.y);
    addFx(w, "zap", best.x, best.y, best.height * 0.5, 0.3, 6);
    a.flash = 4;
    a.cd = a.rate;
    play(w, "blip");
  }
}

function waves(w: World) {
  const p = w.player;
  for (let i = w.waves.length - 1; i >= 0; i--) {
    const v = w.waves[i];
    v.x += v.vx;
    v.y += v.vy;
    v.ttl--;
    if (Math.hypot(p.x - v.x, p.y - v.y) < 0.4) {
      hurtPlayer(w, v.dmg);
      w.waves.splice(i, 1);
    } else if (v.ttl <= 0 || isWall(w.maze, v.x, v.y)) {
      addFx(w, "spark", v.x - v.vx * 2, v.y - v.vy * 2, 0.45, 0.2, 5);
      w.waves.splice(i, 1);
    }
  }
}
