// Drawing Undelete: walls, floor and ceiling raycast into one small pixel
// buffer (160x80, shown at 2x), then sprites as billboards clipped against
// the walls column by column, then the weapon and the HUD at full size.

import type { Ability, GameContext, Perk } from "../../types";
import { cloak, gunOf, primed, type Ally, type Fx, type GunMode, type Pickup, type Tone, type Wave, type World, type Zombie } from "./logic";
import type { Maze } from "./maze";
import {
  ABILITY_COLOR,
  blankCanvas,
  boomPixels,
  BOT_SLOT,
  botPixels,
  CARD_SLOT,
  cardPixels,
  CEIL_ART,
  CEIL_LIT_ART,
  COLORS,
  dustMark,
  eyesPixels,
  fade,
  FLOOR_ART,
  gunPixels,
  HUD_ICONS,
  mapPixels,
  muzzlePixels,
  PERK_COLOR,
  puffPixels,
  px,
  shaded,
  Shelf,
  SHIELD_SLOT,
  shieldPixels,
  silhouette,
  sparkPixels,
  toCanvas,
  unknownMark,
  WALL_ART,
  warpPixels,
  wavePixels,
  zapPixels,
  ZOMBIE_H,
  ZOMBIE_SLOT,
  ZOMBIE_W,
  zombiePixels,
  type Pixels,
  type ZombieFrame,
} from "./sprites";

const W = 320;
const H = 180;
/** The 3D view's own pixels; shown at 2x above the HUD. */
const VW = 160;
const VH = 80;
const S = 2;
const HUD_Y = VH * S;
const PLANE = 0.72;
/** Focal length in view pixels: a 1-cell-tall wall at distance d is F/d pixels tall. */
const F = VW / 2 / PLANE;
const HORIZON = VH / 2;
/** Sprites drawn per frame, nearest first. */
const MAX_DRAWN = 48;
const POOL = 160;
/** Sprite fog steps: near, mid, far. */
const SPRITE_FADE = [1, 0.72, 0.48];

/** Pickups and bots float up and down a little. */
const bob = (w: World, seed: number) => Math.sin(w.tick * 0.12 + seed) * 0.04;
const fogStep = (d: number) => Math.min(6, (d / 1.8) | 0);
const spriteFog = (d: number) => (d < 4 ? 0 : d < 8 ? 1 : 2);

const ABILITIES: Ability[] = ["flash", "shield", "teleport", "sonic", "fast", "split", "tank", "basic"];
const PERKS: Perk[] = ["health", "armor", "ally", "rapid", "spread", "ammo", "power", "points"];
const FRAMES: ZombieFrame[] = ["walkA", "walkB", "swipe"];
const GUNS: GunMode[] = ["basic", "spread", "power"];
const GUN_COLOR = [COLORS.yellow, COLORS.orange, COLORS.pink];
const HUD_NAMES = ["heart", "armor", "ammo", "skull", "coin"] as const;
/** Puff colors by index (Fx.color strings map onto these; unknown is lilac). */
const PUFF_COLORS = [COLORS.lilac, COLORS.yellow, ABILITY_COLOR.basic, COLORS.cyan];

const TONE: Record<Tone, string> = { ...PERK_COLOR, info: COLORS.ink, warn: COLORS.red };

/** A sprite at a fog step (0 near .. 2 far). */
const fogged = (p: Pixels, fog: number) => (fog ? mapPixels(p, (c) => fade(c, SPRITE_FADE[fog])) : p);

/** Zombie looks: fog 0..2, 3 the white hit flash, 4 the red blink of a tank about to burst. */
const LOOKS = 5;
const zombieIndex = (ability: Ability, frame: number, elite: boolean, look: number) => ((ABILITIES.indexOf(ability) * 3 + frame) * 2 + (elite ? 1 : 0)) * LOOKS + look;
function zombieLook(i: number): Pixels {
  const look = i % LOOKS;
  const elite = ((i / LOOKS) | 0) % 2 === 1;
  const frame = ((i / LOOKS / 2) | 0) % 3;
  const p = zombiePixels(ABILITIES[(i / LOOKS / 6) | 0], FRAMES[frame], elite);
  return look === 3 ? silhouette(p, COLORS.ink) : look === 4 ? silhouette(p, COLORS.red) : fogged(p, look);
}

/** Every sprite, built on first use; the index packs the variant (see each `get` call). */
const art = () => ({
  zombies: new Shelf(zombieLook),
  eyes: new Shelf((fog) => fogged(eyesPixels(), fog)),
  // shield: cracked * 4 + (fog 0..2, or 3 = hit flash)
  shields: new Shelf((i) => ((i & 3) === 3 ? silhouette(shieldPixels(i > 3), COLORS.ink) : fogged(shieldPixels(i > 3), i & 3))),
  cards: new Shelf((i) => fogged(cardPixels(PERKS[(i / 3) | 0]), i % 3)),
  // bot: (awake * 2 + firing) * 3 + fog
  bots: new Shelf((i) => fogged(botPixels(i >= 6, ((i / 3) | 0) % 2 === 1), i % 3)),
  waves: new Shelf(wavePixels),
  booms: new Shelf(boomPixels),
  puffs: new Shelf((i) => puffPixels(i & 1, PUFF_COLORS[i >> 1])),
  warps: new Shelf(warpPixels),
  zap: new Shelf(zapPixels),
  spark: new Shelf(sparkPixels),
  guns: new Shelf((i) => gunPixels(GUNS[i >> 1], (i & 1) === 1)),
  muzzles: new Shelf((i) => muzzlePixels(GUN_COLOR[i])),
  hud: new Shelf((i) => HUD_ICONS[HUD_NAMES[i]]),
  marks: new Shelf((i) => (i ? dustMark() : unknownMark())),
});

/** Number strings, made once each. */
const NUMS: string[] = [];
const num = (n: number) => (n >= 0 && n < 1000 && n === Math.floor(n) ? (NUMS[n] ??= String(n)) : String(n));

/** What rose from the bin: files (trashed or deleted) and filler junk. */
export function readyLine(files: number, junk: number): string {
  if (!files) return "NOTHING BINNED: ONLY JUNK RISES";
  const rose = `${files} BINNED FILE${files === 1 ? "" : "S"} ROSE AS ZOMBIES`;
  return junk ? `${rose} (+${junk} JUNK)` : rose;
}

const MAX_LABELS = 8;
const MAP_SIZE = 44;
const MAP_X = W - MAP_SIZE - 4;
const MAP_Y = 4;

const enum T {
  Zombie,
  Pickup,
  Ally,
  Wave,
  Fx,
}

interface Bill {
  type: T;
  ref: Zombie | Pickup | Ally | Wave | Fx | null;
  depth: number;
  /** Screen x of the center, in view pixels. */
  sx: number;
  /** Where it was drawn (view pixels), for labels. */
  left: number;
  top: number;
  w: number;
  h: number;
}

export class View {
  private g: CanvasRenderingContext2D;
  private view = blankCanvas(VW, VH);
  private img: ImageData | null;
  private buf: Uint32Array;
  private zbuf = new Float32Array(VW);
  private walls = WALL_ART.map(shaded);
  private floor = shaded(FLOOR_ART);
  private ceil = shaded(CEIL_ART);
  private ceilLit = shaded(CEIL_LIT_ART);
  private art = art();
  private pool: Bill[] = Array.from({ length: POOL }, () => ({ type: T.Fx, ref: null, depth: 0, sx: 0, left: 0, top: 0, w: 0, h: 0 }));
  private count = 0;
  private map: { maze: Maze; canvas: HTMLCanvasElement | null } | null = null;
  /** Label boxes drawn this frame (x, y, width, spare; screen pixels), so labels don't pile up. */
  private boxes = new Float32Array(MAX_LABELS * 4);
  private score = -1;
  private scoreText = "0";
  private readyText: string | null = null;
  // camera, per frame
  private dirX = 1;
  private dirY = 0;

  constructor(private ctx: GameContext) {
    this.g = ctx.g;
    this.img = this.view ? this.view.g.createImageData(VW, VH) : null;
    this.buf = this.img ? new Uint32Array(this.img.data.buffer) : new Uint32Array(VW * VH);
  }

  draw(w: World) {
    const g = this.g;
    g.imageSmoothingEnabled = false;
    this.raycast(w);
    if (this.view && this.img) {
      this.view.g.putImageData(this.img, 0, 0);
      g.drawImage(this.view.canvas, 0, 0, W, HUD_Y);
    } else {
      g.fillStyle = COLORS.bg;
      g.fillRect(0, 0, W, HUD_Y);
    }
    this.gather(w);
    const n = Math.min(this.count, MAX_DRAWN);
    for (let i = n - 1; i >= 0; i--) this.billboard(w, this.pool[i]);
    this.labels(w, n);
    this.weapon(w);
    this.crosshair(w);
    this.minimap(w);
    this.hud(w);
    this.overlays(w);
  }

  // ---------- walls, floor, ceiling ----------

  private raycast(w: World) {
    const p = w.player;
    const m = w.maze;
    const buf = this.buf;
    const dirX = (this.dirX = Math.cos(p.a));
    const dirY = (this.dirY = Math.sin(p.a));
    const plX = -dirY * PLANE;
    const plY = dirX * PLANE;

    // Floor and ceiling, a row at a time (the ceiling mirrors the floor).
    for (let d = 0; d < HORIZON; d++) {
      const dist = (0.5 * F) / (d + 0.5);
      const lvl = fogStep(dist);
      const fl = this.floor[lvl];
      const c0 = this.ceil[lvl];
      const c1 = this.ceilLit[lvl];
      let fx = p.x + dist * (dirX - plX);
      let fy = p.y + dist * (dirY - plY);
      const sx = (dist * 2 * plX) / VW;
      const sy = (dist * 2 * plY) / VW;
      const fRow = (HORIZON + d) * VW;
      const cRow = (HORIZON - 1 - d) * VW;
      for (let x = 0; x < VW; x++) {
        const t = ((((fy * 8) | 0) & 7) << 3) | (((fx * 8) | 0) & 7);
        buf[fRow + x] = fl[t];
        buf[cRow + x] = ((fx | 0) * 7 + (fy | 0) * 13) % 5 === 0 ? c1[t] : c0[t];
        fx += sx;
        fy += sy;
      }
    }

    // Walls: one ray per column.
    for (let x = 0; x < VW; x++) {
      const cam = (2 * (x + 0.5)) / VW - 1;
      const rx = dirX + plX * cam;
      const ry = dirY + plY * cam;
      let mx = Math.floor(p.x);
      let my = Math.floor(p.y);
      const ddx = Math.abs(1 / rx);
      const ddy = Math.abs(1 / ry);
      const stepX = rx < 0 ? -1 : 1;
      const stepY = ry < 0 ? -1 : 1;
      let sdx = (rx < 0 ? p.x - mx : mx + 1 - p.x) * ddx;
      let sdy = (ry < 0 ? p.y - my : my + 1 - p.y) * ddy;
      let side = 0;
      let cell = 1;
      for (let i = 0; i < 128; i++) {
        if (sdx < sdy) {
          sdx += ddx;
          mx += stepX;
          side = 0;
        } else {
          sdy += ddy;
          my += stepY;
          side = 1;
        }
        if (mx < 0 || my < 0 || mx >= m.w || my >= m.h) {
          cell = 1;
          break;
        }
        cell = m.cells[my * m.w + mx];
        if (cell) break;
      }
      const perp = Math.max(0.05, side === 0 ? sdx - ddx : sdy - ddy);
      this.zbuf[x] = perp;
      let wallX = side === 0 ? p.y + perp * ry : p.x + perp * rx;
      wallX -= Math.floor(wallX);
      let tx = (wallX * 16) | 0;
      if ((side === 0 && rx < 0) || (side === 1 && ry > 0)) tx = 15 - tx;
      const lineH = F / perp;
      const top = HORIZON - lineH / 2;
      const y0 = Math.max(0, Math.floor(top));
      const y1 = Math.min(VH, Math.ceil(top + lineH));
      const tex = this.walls[Math.min(this.walls.length, Math.max(1, cell)) - 1][Math.min(6, fogStep(perp) + side)];
      const step = 16 / lineH;
      let ty = (y0 + 0.5 - top) * step;
      for (let y = y0; y < y1; y++) {
        buf[y * VW + x] = tex[((ty | 0) & 15) * 16 + tx];
        ty += step;
      }
    }
  }

  // ---------- sprites ----------

  private add(w: World, x: number, y: number, type: T, ref: Bill["ref"]) {
    if (this.count >= POOL) return;
    const p = w.player;
    const rx = x - p.x;
    const ry = y - p.y;
    const depth = rx * this.dirX + ry * this.dirY;
    // bots swinging past the camera would fill the view: they show from a little way off
    if (depth < (type === T.Ally ? 0.9 : 0.2) || depth > 22) return;
    const sx = VW / 2 + ((ry * this.dirX - rx * this.dirY) / depth) * F;
    if (sx < -VW / 2 || sx > VW * 1.5) return;
    const b = this.pool[this.count++];
    b.type = type;
    b.ref = ref;
    b.depth = depth;
    b.sx = sx;
    b.w = 0;
  }

  /** Everything in view, nearest first. */
  private gather(w: World) {
    this.count = 0;
    for (const z of w.zombies) this.add(w, z.x, z.y, T.Zombie, z);
    for (const a of w.allies) this.add(w, a.x, a.y, T.Ally, a);
    for (const v of w.waves) this.add(w, v.x, v.y, T.Wave, v);
    for (const pk of w.pickups) if (!pk.taken) this.add(w, pk.x, pk.y, T.Pickup, pk);
    for (const f of w.fx) this.add(w, f.x, f.y, T.Fx, f);
    // insertion sort by depth: small n, no allocations
    const a = this.pool;
    for (let i = 1; i < this.count; i++) {
      const b = a[i];
      let j = i - 1;
      while (j >= 0 && a[j].depth > b.depth) {
        a[j + 1] = a[j];
        j--;
      }
      a[j + 1] = b;
    }
  }

  /** Draw part of an image into the view, only in columns where it's nearer than the wall. Rect in view pixels. */
  private blit(img: CanvasImageSource | null, sx: number, sy: number, sw: number, sh: number, left: number, top: number, w: number, h: number, depth: number) {
    if (!img || w <= 0.2 || h <= 0.2) return;
    const g = this.g;
    const c1 = Math.min(VW, Math.ceil(left + w));
    let c = Math.max(0, Math.floor(left));
    const y = Math.round(top * S);
    const hh = Math.max(1, Math.round((top + h) * S) - y);
    while (c < c1) {
      while (c < c1 && this.zbuf[c] <= depth) c++;
      if (c >= c1) break;
      const a = c;
      while (c < c1 && this.zbuf[c] > depth) c++;
      const x0 = Math.max(a, left);
      const x1 = Math.min(c, left + w);
      const dx0 = Math.round(x0 * S);
      const dx1 = Math.round(x1 * S);
      if (dx1 <= dx0) continue;
      const u0 = sx + ((x0 - left) / w) * sw;
      const u1 = sx + ((x1 - left) / w) * sw;
      g.drawImage(img, u0, sy, Math.max(0.01, u1 - u0), sh, dx0, y, dx1 - dx0, hh);
    }
  }

  /** A sprite standing in the world: `size` cells tall, `aspect` wide per tall, bottom `lift` cells above the floor. */
  private stand(b: Bill, img: CanvasImageSource | null, tw: number, th: number, size: number, aspect: number, lift: number, dx = 0) {
    const k = F / b.depth;
    b.h = size * k;
    b.w = size * aspect * k;
    b.top = HORIZON + (0.5 - lift) * k - b.h;
    b.left = b.sx + dx - b.w / 2;
    this.blit(img, 0, 0, tw, th, b.left, b.top, b.w, b.h, b.depth);
  }

  /** The file's icon in a slot of an image drawn at (left, top, w, h) of (tw, th) texture pixels (or a mark when there's no icon). */
  private icon(kind: Zombie["kind"], slot: { x: number; y: number; w: number; h: number }, tw: number, th: number, left: number, top: number, w: number, h: number, depth: number) {
    const img = kind ? this.ctx.icon(kind) ?? this.art.marks.get(0) : this.art.marks.get(1);
    this.blit(img, 0, 0, 8, 8, left + (slot.x / tw) * w, top + (slot.y / th) * h, (slot.w / tw) * w, (slot.h / th) * h, depth - 0.01);
  }

  /** The icon in the slot of a billboard just stood up. */
  private badge(b: Bill, kind: Zombie["kind"], slot: { x: number; y: number; w: number; h: number }, tw: number, th: number) {
    this.icon(kind, slot, tw, th, b.left, b.top, b.w, b.h, b.depth);
  }

  private billboard(w: World, b: Bill) {
    const fog = spriteFog(b.depth);
    const art = this.art;
    switch (b.type) {
      case T.Zombie:
        return this.zombie(w, b, b.ref as Zombie, fog);
      case T.Pickup: {
        const pk = b.ref as Pickup;
        const perk = pk.friend.perk;
        if (perk === "ally") {
          this.stand(b, art.bots.get(fog), 16, 18, 0.4, 16 / 18, 0.04 + bob(w, pk.x * 3));
          return this.badge(b, pk.friend.file.kind, BOT_SLOT, 16, 18);
        }
        this.stand(b, art.cards.get(PERKS.indexOf(perk) * 3 + fog), 12, 15, 0.34, 12 / 15, 0.1 + bob(w, pk.x * 3));
        return this.badge(b, pk.friend.file.kind, CARD_SLOT, 12, 15);
      }
      case T.Ally: {
        const a = b.ref as Ally;
        this.stand(b, art.bots.get((2 + (a.flash > 0 ? 1 : 0)) * 3 + fog), 16, 18, 0.26, 16 / 18, 0.64 + bob(w, a.x));
        return this.badge(b, a.kind, BOT_SLOT, 16, 18);
      }
      case T.Wave:
        return this.stand(b, art.waves.get((w.tick >> 2) & 1), 12, 12, 0.38, 1, 0.26);
      case T.Fx: {
        const f = b.ref as Fx;
        const lift = f.z - f.size / 2;
        if (f.type === "boom") return this.stand(b, art.booms.get(Math.min(2, Math.floor((f.t / f.ttl) * 3))), 16, 16, f.size, 1, lift);
        if (f.type === "puff" || f.type === "shard") {
          const st = f.t < f.ttl / 2 ? 0 : 1;
          return this.stand(b, art.puffs.get(Math.max(0, PUFF_COLORS.indexOf(f.color)) * 2 + st), 10, 10, f.size * (1 + st * 0.4), 1, lift);
        }
        if (f.type === "warp") return this.stand(b, art.warps.get((f.t >> 1) & 1), 8, 16, f.size, 0.5, lift);
        if (f.type === "zap") return this.stand(b, art.zap.get(0), 7, 7, f.size, 1, lift);
        return this.stand(b, art.spark.get(0), 5, 5, f.size, 1, lift);
      }
    }
  }

  private zombie(w: World, b: Bill, z: Zombie, fog: number) {
    const tank = z.ability === "tank";
    const aspect = (ZOMBIE_W / ZOMBIE_H) * (tank ? 1.3 : 1);
    const jitter = z.warp > 0 ? ((w.tick >> 1) & 1 ? 1.5 : -1.5) : 0;
    const hidden = cloak(z) === 2;
    if (hidden) {
      // only the eyes show
      this.stand(b, this.art.eyes.get(fog), ZOMBIE_W, ZOMBIE_H, z.height, aspect, 0);
      return;
    }
    const frame = z.dead ? 0 : z.swing > 0 || z.shout > 0 ? 2 : Math.floor(z.step) & 1;
    const white = (z.hurt > 0 && (z.hurt & 2) > 0) || (z.warp > 0 && (w.tick & 2) > 0);
    // A tank on its last hits swells and blinks red: it's about to burst.
    const fuse = primed(z);
    const look = white ? 3 : fuse && (w.tick & 4) > 0 ? 4 : fog;
    const height = z.height * (fuse ? 1.12 + 0.04 * ((w.tick >> 2) & 1) : 1);
    // Fast zombies leave an afterimage behind them.
    if (z.ability === "fast" && z.moving && !z.dead) {
      const side = Math.cos(z.face) * -this.dirY + Math.sin(z.face) * this.dirX;
      const k = F / b.depth;
      this.stand(b, this.zombieArt(z, frame, 2), ZOMBIE_W, ZOMBIE_H, z.height, aspect, 0, -Math.sign(side || 1) * z.height * aspect * k * 0.4);
    }
    const img = this.zombieArt(z, frame, look);
    if (z.dead) {
      // falling over: squashed toward the floor
      const k = Math.max(0.1, z.dying / 14);
      this.stand(b, img, ZOMBIE_W, ZOMBIE_H, z.height * k, aspect / k, 0);
      return;
    }
    this.stand(b, img, ZOMBIE_W, ZOMBIE_H, height, aspect, 0, jitter);
    this.badge(b, z.kind, ZOMBIE_SLOT, ZOMBIE_W, ZOMBIE_H);
    if (z.shield > 0) this.shield(w, b, z, fog);
  }

  /** Zombie art by ability, frame (walk, walk, swipe), elite and look; built once. */
  private zombieArt(z: Zombie, frame: number, look: number): HTMLCanvasElement | null {
    return this.art.zombies.get(zombieIndex(z.ability, frame, z.elite, look));
  }

  /** A document zombie's shield, held toward where it faces (drawn only when it faces us), with the file's icon on it. */
  private shield(w: World, b: Bill, z: Zombie, fog: number) {
    const p = w.player;
    const toUs = Math.atan2(p.y - z.y, p.x - z.x);
    if (Math.cos(z.face - toUs) < 0.2) return;
    const side = Math.cos(z.face) * -this.dirY + Math.sin(z.face) * this.dirX;
    const k = F / b.depth;
    const cracked = z.shield <= z.shieldMax / 2;
    const img = this.art.shields.get((cracked ? 4 : 0) + (z.shieldHit > 0 ? 3 : fog));
    const sw = 0.42 * k;
    const sh = 0.455 * k;
    const left = b.sx + side * b.w * 0.3 - sw / 2;
    const top = HORIZON + (0.5 - 0.1) * k - sh;
    this.blit(img, 0, 0, 12, 13, left, top, sw, sh, b.depth - 0.05);
    this.icon(z.kind, SHIELD_SLOT, 12, 13, left, top, sw, sh, b.depth - 0.05);
  }

  /** Names over the target and the nearest zombies, pickups and bots; not where a nearer sprite or label is in the way. */
  private labels(w: World, n: number) {
    let zombies = 0;
    let others = 0;
    let boxes = 0;
    for (let i = 0; i < n; i++) {
      const b = this.pool[i];
      if (b.w <= 0 || b.sx < 0 || b.sx >= VW) continue;
      if (this.zbuf[b.sx | 0] <= b.depth) continue;
      const y = Math.max(2, Math.round(b.top * S) - 9);
      if (this.covered(i, b.sx, (y + 2) / S)) continue;
      let text = "";
      let color = COLORS.ink;
      if (b.type === T.Zombie) {
        const z = b.ref as Zombie;
        if (z.dead || cloak(z) === 2) continue;
        if (z !== w.target && (b.depth > 3.2 || zombies >= 2)) continue;
        zombies++;
        text = z.label;
        color = z.elite ? COLORS.yellow : COLORS.ink;
      } else if (b.type === T.Pickup || b.type === T.Ally) {
        if (b.depth > 2.6 || others >= 2) continue;
        others++;
        if (b.type === T.Pickup) {
          const pk = b.ref as Pickup;
          text = pk.friend.label;
          color = PERK_COLOR[pk.friend.perk];
        } else {
          text = (b.ref as Ally).label;
          color = COLORS.cyan;
        }
      } else continue;
      // one label per spot: skip it if it would land on one already drawn
      const tw = this.ctx.textWidth(text) + 4;
      const x = b.sx * S - tw / 2;
      let clash = false;
      for (let k = 0; k < boxes * 4 && !clash; k += 4) {
        const q = this.boxes;
        clash = x < q[k] + q[k + 2] && q[k] < x + tw && y < q[k + 1] + 9 && q[k + 1] < y + 9; // labels are 9 px tall with backing
      }
      if (clash) continue;
      if (boxes < MAX_LABELS) {
        const k = boxes++ * 4;
        this.boxes[k] = x;
        this.boxes[k + 1] = y;
        this.boxes[k + 2] = tw;
      }
      this.tag(text, b.sx * S, y, color);
    }
  }

  /** Whether a sprite nearer than pool[i] covers the view point (x, y). */
  private covered(i: number, x: number, y: number) {
    for (let j = 0; j < i; j++) {
      const o = this.pool[j];
      if (o.w <= 0 || o.type === T.Fx || o.type === T.Wave) continue;
      if (o.type === T.Zombie && (cloak(o.ref as Zombie) === 2 || (o.ref as Zombie).dead)) continue;
      if (x >= o.left && x < o.left + o.w && y >= o.top && y < o.top + o.h && this.zbuf[x | 0] > o.depth) return true;
    }
    return false;
  }

  /** Text centered on x with a dark backing (kept clear of the minimap). */
  private tag(text: string, cx: number, y: number, color: string, scale = 1) {
    const tw = this.ctx.textWidth(text) * scale;
    const right = y < MAP_Y + MAP_SIZE + 2 ? MAP_X - 3 : W - 1;
    const x = Math.round(Math.max(1, Math.min(right - tw, cx - tw / 2)));
    this.g.fillStyle = COLORS.bg;
    this.g.fillRect(x - 2, y - 2, tw + 4, 5 * scale + 4);
    this.ctx.text(text, x, y, color, scale);
  }

  // ---------- weapon, crosshair, map, HUD ----------

  private weapon(w: World) {
    const p = w.player;
    const mode = GUNS.indexOf(gunOf(p));
    const img = this.art.guns.get(mode * 2 + (p.rapid > 0 ? 1 : 0));
    const bob = p.moving ? Math.abs(Math.sin(p.walk * 0.22)) * 4 : 0;
    const sway = p.moving ? Math.sin(p.walk * 0.11) * 4 : 0;
    const kick = p.recoil > 2 ? 6 : p.recoil > 0 ? 2 : 0;
    const x = Math.round(W / 2 - 32 + sway);
    const y = Math.round(HUD_Y - 54 + bob + kick);
    if (p.recoil > 2) {
      const flash = this.art.muzzles.get(mode);
      if (flash) {
        this.g.drawImage(flash, x + 16, y - 10, 32, 12);
        if (GUNS[mode] === "spread") {
          this.g.drawImage(flash, x - 2, y - 2, 24, 9);
          this.g.drawImage(flash, x + 42, y - 2, 24, 9);
        }
      }
    }
    if (img) this.g.drawImage(img, x, y, 64, 60);
  }

  private crosshair(w: World) {
    if (w.phase !== "play") return;
    const g = this.g;
    g.fillStyle = w.target ? COLORS.red : COLORS.ink;
    const cx = W / 2;
    const cy = HUD_Y / 2;
    g.fillRect(cx - 5, cy, 3, 1);
    g.fillRect(cx + 3, cy, 3, 1);
    g.fillRect(cx, cy - 5, 1, 3);
    g.fillRect(cx, cy + 3, 1, 3);
    g.fillRect(cx, cy, 1, 1);
  }

  /** A small map of the cells around you, top right. */
  private minimap(w: World) {
    const m = w.maze;
    if (this.map?.maze !== m) {
      const data = new Uint32Array(m.w * 2 * m.h * 2);
      const wall = [0, px("#5a3f86"), px("#1d5a7a"), px("#8a6a10"), px("#2f8f4f"), px("#a32686")];
      const floor = px("#1a0d2b");
      for (let y = 0; y < m.h * 2; y++)
        for (let x = 0; x < m.w * 2; x++) {
          const c = m.cells[(y >> 1) * m.w + (x >> 1)];
          data[y * m.w * 2 + x] = c ? wall[Math.min(5, c)] : floor;
        }
      this.map = { maze: m, canvas: toCanvas({ w: m.w * 2, h: m.h * 2, data }) };
    }
    const g = this.g;
    const SIZE = MAP_SIZE;
    const CELLS = SIZE / 2;
    const X = MAP_X;
    const Y = MAP_Y;
    g.fillStyle = COLORS.grape;
    g.fillRect(X - 1, Y - 1, SIZE + 2, SIZE + 2);
    g.fillStyle = COLORS.bg;
    g.fillRect(X, Y, SIZE, SIZE);
    const p = w.player;
    const ox = p.x - CELLS / 2;
    const oy = p.y - CELLS / 2;
    if (this.map.canvas) {
      let sx = Math.round(ox * 2);
      let sy = Math.round(oy * 2);
      let dx = X;
      let dy = Y;
      let sw = SIZE;
      let sh = SIZE;
      if (sx < 0) ((dx -= sx), (sw += sx), (sx = 0));
      if (sy < 0) ((dy -= sy), (sh += sy), (sy = 0));
      sw = Math.min(sw, m.w * 2 - sx);
      sh = Math.min(sh, m.h * 2 - sy);
      if (sw > 0 && sh > 0) g.drawImage(this.map.canvas, sx, sy, sw, sh, dx, dy, sw, sh);
    }
    for (const pk of w.pickups) if (!pk.taken) this.dot(pk.x - ox, pk.y - oy, COLORS.green);
    for (const a of w.allies) this.dot(a.x - ox, a.y - oy, COLORS.cyan);
    for (const z of w.zombies) if (!z.dead) this.dot(z.x - ox, z.y - oy, z.elite ? COLORS.yellow : COLORS.red);
    this.dot(p.x - ox, p.y - oy, COLORS.ink);
    this.dot(p.x - ox + Math.cos(p.a) * 1.2, p.y - oy + Math.sin(p.a) * 1.2, COLORS.lilac);
  }

  /** A 2x2 dot on the minimap, at cells from its top left corner. */
  private dot(x: number, y: number, color: string) {
    const mx = Math.round(x * 2);
    const my = Math.round(y * 2);
    if (mx < 0 || my < 0 || mx > MAP_SIZE - 2 || my > MAP_SIZE - 2) return;
    this.g.fillStyle = color;
    this.g.fillRect(MAP_X + mx - 1, MAP_Y + my - 1, 2, 2);
  }

  private hud(w: World) {
    const g = this.g;
    const ctx = this.ctx;
    const p = w.player;
    g.fillStyle = COLORS.bg;
    g.fillRect(0, HUD_Y, W, H - HUD_Y);
    g.fillStyle = COLORS.grape;
    g.fillRect(0, HUD_Y, W, 1);
    const low = p.hp <= 25 && (w.tick >> 3) & 1;
    this.stat(0, 4, num(Math.ceil(p.hp)), low ? COLORS.red : COLORS.ink);
    this.stat(1, 44, num(p.armor), COLORS.ink);
    this.stat(2, 84, num(p.ammo), p.ammo ? COLORS.ink : COLORS.red);

    // Weapon and its timers.
    const mode = gunOf(p);
    if (mode === "power") this.timed("SPLASH CANNON", p.power, HUD_Y + 5, COLORS.pink);
    else if (mode === "spread") this.timed("FAN STAPLER", p.spread, HUD_Y + 5, COLORS.orange);
    else ctx.text("STAPLE BLASTER", 124, HUD_Y + 5, COLORS.lilac);
    if (p.rapid > 0) this.timed("RAPID", p.rapid, HUD_Y + 12, COLORS.yellow);
    else if (!p.ammo && mode !== "power") ctx.text("NO STAPLES: SLOW", 124, HUD_Y + 12, COLORS.red);

    this.stat(3, 214, num(w.alive), COLORS.ink);
    if (w.score !== this.score) ((this.score = w.score), (this.scoreText = num(w.score)));
    const sw = ctx.textWidth(this.scoreText) * 2;
    this.stat(4, W - 4 - sw - 9, this.scoreText, COLORS.yellow);

    // What's under the crosshair, top left, on a dark backing.
    const z = w.target;
    if (z && w.phase === "play") {
      const kind = z.mini ? "MINI" : z.ability === "basic" ? "ZOMBIE" : z.ability;
      const fuse = primed(z);
      const tw = Math.max(40, ctx.textWidth(z.label), ctx.textWidth(kind) + (fuse ? 4 + ctx.textWidth("BURSTS!") : 0));
      g.fillStyle = COLORS.bg;
      g.fillRect(2, 2, tw + 4, z.shield > 0 ? 23 : 21);
      ctx.text(z.label, 4, 4, z.elite ? COLORS.yellow : COLORS.ink);
      ctx.text(kind, 4, 11, ABILITY_COLOR[z.ability]);
      if (fuse && (w.tick & 4) > 0) ctx.text("BURSTS!", 8 + ctx.textWidth(kind), 11, COLORS.red);
      g.fillStyle = COLORS.plum;
      g.fillRect(4, 18, 40, 3);
      g.fillStyle = COLORS.red;
      g.fillRect(4, 18, Math.ceil((40 * Math.max(0, z.hp)) / z.maxHp), 3);
      if (z.shield > 0) {
        g.fillStyle = COLORS.lilac;
        g.fillRect(4, 22, Math.ceil((40 * z.shield) / z.shieldMax), 2);
      }
    }
  }

  /** A HUD icon and its number, big. */
  private stat(icon: number, x: number, value: string, color: string) {
    const img = this.art.hud.get(icon);
    if (img) this.g.drawImage(img, x, HUD_Y + 7);
    this.ctx.text(value, x + 9, HUD_Y + 6, color, 2);
  }

  /** A power's name and the seconds it has left, in the weapon column. */
  private timed(name: string, ticks: number, y: number, color: string) {
    const ctx = this.ctx;
    const x = 124 + ctx.textWidth(name) + 4;
    const secs = num(Math.ceil(ticks / 30));
    ctx.text(name, 124, y, color);
    ctx.text(secs, x, y, color);
    ctx.text("S", x + ctx.textWidth(secs) + 1, y, color);
  }

  private overlays(w: World) {
    const p = w.player;
    // Red edges when hurt, a glow when picking something up.
    if (p.hurt > 0) this.edge(COLORS.red, 3);
    else if (p.glow > 0) this.edge(TONE[w.msg.tone], 2);

    if (w.phase === "ready") {
      this.readyText ??= readyLine(w.files, w.foes - w.files);
      this.banner("READY", this.readyText, COLORS.yellow);
      return;
    }
    if (w.phase === "won") return this.banner("MAZE CLEAN!", "EVERY ZOMBIE FILE PUT TO REST", COLORS.green);
    if (w.phase === "lost" || (w.phase === "done" && !w.won)) return this.banner("DELETED", "THE ZOMBIES GOT YOU", COLORS.red);
    if (w.phase === "done") return this.banner("MAZE CLEAN!", "EVERY ZOMBIE FILE PUT TO REST", COLORS.green);
    if (w.msg.t > 0) this.tag(w.msg.text, W / 2, 30, TONE[w.msg.tone]);
  }

  private edge(color: string, t: number) {
    const g = this.g;
    g.fillStyle = color;
    g.fillRect(0, 0, W, t);
    g.fillRect(0, HUD_Y - t, W, t);
    g.fillRect(0, 0, t, HUD_Y);
    g.fillRect(W - t, 0, t, HUD_Y);
  }

  private banner(title: string, sub: string, color: string) {
    const g = this.g;
    g.fillStyle = COLORS.bg;
    g.fillRect(0, 52, W, 44);
    g.fillStyle = color;
    g.fillRect(0, 52, W, 1);
    g.fillRect(0, 95, W, 1);
    const tw = this.ctx.textWidth(title) * 3;
    this.ctx.text(title, Math.round(W / 2 - tw / 2), 60, color, 3);
    const sw = this.ctx.textWidth(sub);
    this.ctx.text(sub, Math.round(W / 2 - sw / 2), 83, COLORS.ink);
  }
}
