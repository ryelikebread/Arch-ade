// Brick Sort's renderer. It only reads the state (no rng, no changes), so
// drawing more or less often never changes how a round plays.

import type { GameContext } from "../../types";
import {
  ARMOR_Y, BALL, BRICK_H, C, DRONE_Y, H, LEFT, PADDLE_H, PADDLE_W, PADDLE_Y, PERK_COLOR, RIGHT, W,
  brickColor, foesLeft, jammed, visible, type Brick, type State,
} from "./logic";
import type { Foe } from "../../types";
import type { Art, FaceKind } from "./sprites";

const LABEL_INK = "#1a1030";

/** Up to n characters, with a dot when cut. */
const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}.` : s);

/** Name tag on a wide brick: 7 characters; a cut keeps a number at the end, so VIDEO-23 and VIDEO-24 stay apart. */
export function tagText(foe: Foe): string {
  const name = foe.file?.name ?? foe.label;
  const dot = name.lastIndexOf(".");
  const stem = (dot > 0 ? name.slice(0, dot) : name).trim() || name;
  if (stem.length <= 7) return stem;
  const tail = /\d{1,3}$/.exec(stem)?.[0] ?? "";
  return `${stem.slice(0, 6 - tail.length)}.${tail}`;
}

export function render(s: State, ctx: GameContext, art: Art | null) {
  const g = ctx.g;
  if (art?.bg) g.drawImage(art.bg, 0, 0);
  else {
    g.fillStyle = C.bg;
    g.fillRect(0, 0, W, H);
  }
  const shaking = s.shake > 0;
  if (shaking) {
    g.save();
    g.translate(((s.tick * 7) % 3) - 1, ((s.tick * 5) % 3) - 1);
  }
  bricks(s, ctx, art);
  falling(s, ctx, art);
  player(s, ctx, art);
  effects(s, ctx, art);
  if (shaking) g.restore();
  hud(s, ctx, art);
  banner(s, ctx);
}

/** A cached text image when there's a canvas; the host's pixel text otherwise. */
function label(ctx: GameContext, art: Art | null, text: string, x: number, y: number, color: string) {
  const img = art?.label(text, color) ?? null;
  if (img) ctx.g.drawImage(img, Math.round(x), Math.round(y));
  else ctx.text(text, Math.round(x), Math.round(y), color);
}

function faceKind(b: Brick): FaceKind {
  if (!b.foe) return "wall";
  if (!b.foe.file) return "filler";
  return b.ability === "tank" ? "tank" : "file";
}

// Each brick's face and name tag, looked up once per brick (not every frame).
const faces = new WeakMap<Brick, CanvasImageSource | null>();
const tags = new WeakMap<Brick, CanvasImageSource | null>();

function faceOf(art: Art, b: Brick) {
  let img = faces.get(b);
  if (img === undefined) faces.set(b, (img = art.face(faceKind(b), brickColor(b), b.w, b.elite)));
  return img;
}

function tagOf(art: Art, b: Brick) {
  let img = tags.get(b);
  if (img === undefined) tags.set(b, (img = b.foe ? art.label(tagText(b.foe), LABEL_INK) : null));
  return img;
}

function bricks(s: State, ctx: GameContext, art: Art | null) {
  const g = ctx.g;
  for (const b of s.bricks) {
    if (!b.alive) continue;
    let x = Math.round(b.x);
    const y = b.y;
    if (!visible(s, b)) {
      // blinked out: only a faint glint now and then (it's still solid)
      if ((s.tick + b.phase) % 16 < 3) {
        g.fillStyle = C.lilac;
        g.fillRect(x + (b.w >> 1), y + 4, 1, 1);
      }
      continue;
    }
    if (b.warn > 0) x += s.tick & 2 ? 1 : -1; // about to teleport: it shivers
    if (b.ability === "fast") {
      if (jammed(b)) x += s.tick & 1; // boxed in: it revs in place
      else speedLines(ctx, b, x);
    }
    const face = art ? (b.flash > 0 ? art.white(b.w) : faceOf(art, b)) : null;
    if (face) g.drawImage(face, x, y);
    else {
      g.fillStyle = b.flash > 0 ? C.ink : brickColor(b);
      g.fillRect(x, y, b.w, BRICK_H);
    }
    if (b.foe && b.flash === 0) {
      if (b.hits < b.maxHits && art) {
        const ck = art.crack(b.w, b.hits * 3 <= b.maxHits ? 2 : 1);
        if (ck) g.drawImage(ck, x, y);
      }
      // (sprites.ts: icon well at 1..8, name tag at 10..36, pips at w-7..w-3)
      if (b.foe.file) {
        const icon = ctx.icon(b.foe.file.kind) ?? art?.fileMark ?? null;
        if (icon) g.drawImage(icon, x + 1, y + 1);
        else {
          g.fillStyle = C.ink;
          g.fillRect(x + 3, y + 2, 4, 6);
        }
      }
      if (b.maxHits > 1 && b.w > 10) {
        const pips = art?.pips(b.hits) ?? null;
        if (pips) g.drawImage(pips, x + b.w - 7, y + 1);
      }
      if (b.w >= 40) {
        const tag = art ? tagOf(art, b) : null;
        if (tag) g.drawImage(tag, x + 10, y + 3);
        else ctx.text(tagText(b.foe), x + 10, y + 3, LABEL_INK);
      }
    }
    if (b.shield > 0) {
      const ring = art?.shield(b.w, b.shield) ?? null;
      if (ring) g.drawImage(ring, x - 2, y - 2);
      else {
        g.fillStyle = C.ink;
        g.fillRect(x - 1, y - 1, b.w + 2, 1);
        g.fillRect(x - 1, y + BRICK_H, b.w + 2, 1);
      }
    }
    if (s.homing && b.foe && s.tick & 8) {
      // last files: corner brackets mark the targets
      g.fillStyle = C.cyan;
      g.fillRect(x - 2, y - 2, 3, 1);
      g.fillRect(x + b.w - 1, y - 2, 3, 1);
      g.fillRect(x - 2, y + BRICK_H + 1, 3, 1);
      g.fillRect(x + b.w - 1, y + BRICK_H + 1, 3, 1);
    }
    if (b.warn > 0 && s.tick & 1) {
      g.fillStyle = C.ink;
      g.fillRect(x + ((s.tick * 5) % b.w), y - 1, 1, 1);
      g.fillRect(x + ((s.tick * 3 + 7) % b.w), y + BRICK_H, 1, 1);
    }
  }
}

/** Streaks behind a sliding brick, never longer than the way it came (so they don't cross a neighbor). */
function speedLines(ctx: GameContext, b: Brick, x: number) {
  const len = Math.min(7, Math.floor(b.run * Math.abs(b.vx)) - 2);
  if (len < 3) return;
  const g = ctx.g;
  const tx = b.vx > 0 ? x - 1 - len : x + b.w + 1;
  g.fillStyle = C.lilac;
  g.fillRect(tx, b.y + 2, len, 1);
  g.fillRect(b.vx > 0 ? tx + 2 : tx, b.y + 6, len - 2, 1);
}

/** Capsules, sound waves and bolts. */
function falling(s: State, ctx: GameContext, art: Art | null) {
  const g = ctx.g;
  for (const c of s.capsules) {
    const f = s.friends[c.friend];
    const x = Math.round(c.x - 11), y = Math.round(c.y);
    const color = PERK_COLOR[f.perk];
    const pill = art?.capsule(f.perk, color) ?? null;
    if (pill) g.drawImage(pill, x, y);
    else {
      g.fillStyle = color;
      g.fillRect(x, y, 22, 10);
    }
    const icon = ctx.icon(f.file.kind) ?? art?.fileMark ?? null;
    if (icon) g.drawImage(icon, x + 3, y + 1);
    // name tag beside it (on the left near the right wall), unless another capsule is in the way
    const name = short(f.label, 8);
    const tw = ctx.textWidth(name);
    const lx = x + 24 + tw > RIGHT ? x - tw - 2 : x + 24;
    if (!s.capsules.some((o) => o !== c && Math.abs(o.y - c.y) < 11 && o.x + 11 > lx && o.x - 11 < lx + tw)) label(ctx, art, name, lx, y + 3, color);
  }
  for (const w of s.waves) {
    const img = art?.waves[(w.t >> 3) & 1] ?? null;
    if (img) g.drawImage(img, Math.round(w.x) - 4, Math.round(w.y));
    else {
      g.fillStyle = C.yellow;
      g.fillRect(Math.round(w.x) - 4, Math.round(w.y), 9, 2);
    }
  }
  g.fillStyle = C.yellow;
  for (const t of s.bolts) g.fillRect(t.x, Math.round(t.y), 1, 4);
}

/** Paddle, safety bar, drone and balls. */
function player(s: State, ctx: GameContext, art: Art | null) {
  const g = ctx.g;
  if (s.armor > 0 && (s.armor > 60 || s.tick & 4)) {
    if (art?.armorBar) g.drawImage(art.armorBar, LEFT, ARMOR_Y);
    else {
      g.fillStyle = C.green;
      g.fillRect(LEFT, ARMOR_Y, RIGHT - LEFT, 3);
    }
  }
  const d = s.drone;
  if (d.t > 0 && (d.t > 60 || s.tick & 4)) {
    const y = DRONE_Y + ((s.tick >> 3) & 1);
    if (art?.drone) g.drawImage(art.drone, Math.round(d.x) - 4, y);
    else {
      g.fillStyle = C.green;
      g.fillRect(Math.round(d.x) - 4, y, 9, 5);
    }
  }
  const p = s.paddle;
  const x = Math.round(p.x);
  const img = (p.shrink > 0 ? art?.paddleHurt : art?.paddle) ?? null;
  if (img) {
    // three slices: the caps stay, the middle stretches
    g.drawImage(img, 0, 0, 6, PADDLE_H, x, PADDLE_Y, 6, PADDLE_H);
    g.drawImage(img, 6, 0, 1, PADDLE_H, x + 6, PADDLE_Y, p.w - 12, PADDLE_H);
    g.drawImage(img, PADDLE_W - 6, 0, 6, PADDLE_H, x + p.w - 6, PADDLE_Y, 6, PADDLE_H);
  } else {
    g.fillStyle = p.shrink > 0 ? C.yellow : C.cyan;
    g.fillRect(x, PADDLE_Y, p.w, PADDLE_H);
  }
  if (s.rapid > 0) {
    g.fillStyle = C.orange;
    g.fillRect(x + 2, PADDLE_Y - 2, 2, 2);
    g.fillRect(x + p.w - 4, PADDLE_Y - 2, 2, 2);
  }
  const ball = (s.fire > 0 ? art?.fireball : art?.ball) ?? null;
  for (const b of s.balls) {
    if (!b.alive) continue;
    if (ball) g.drawImage(ball, Math.round(b.x), Math.round(b.y));
    else {
      g.fillStyle = C.ink;
      g.fillRect(Math.round(b.x), Math.round(b.y), BALL, BALL);
    }
  }
}

function effects(s: State, ctx: GameContext, art: Art | null) {
  const g = ctx.g;
  for (const p of s.parts) {
    if (p.life <= 0) continue;
    g.fillStyle = p.color;
    g.fillRect(Math.round(p.x), Math.round(p.y), p.life > 18 ? 2 : 1, p.life > 18 ? 2 : 1);
  }
  for (const p of s.popups) {
    if (p.t < 10 && p.t & 1) continue;
    label(ctx, art, p.text, p.x - ctx.textWidth(p.text) / 2, p.y, p.color);
  }
}

function hud(s: State, ctx: GameContext, art: Art | null) {
  const g = ctx.g;
  ctx.text(String(Math.round(s.score)).padStart(6, "0"), 5, 2, C.yellow);
  for (let i = 0; i < s.lives; i++) {
    if (art?.heart) g.drawImage(art.heart, 32 + i * 6, 2);
    else {
      g.fillStyle = C.red;
      g.fillRect(32 + i * 6, 2, 5, 5);
    }
  }
  for (let i = 0; i < s.reserve; i++) {
    const bx = 34 + s.lives * 6 + i * 5;
    if (art?.ball) g.drawImage(art.ball, bx, 3);
    else {
      g.fillStyle = C.cyan;
      g.fillRect(bx, 3, 4, 4);
    }
  }
  // the file brick being hit: icon, name, hits left
  const b = s.lastHit;
  if (b?.foe && s.lastHitT > 0) {
    const name = b.foe.label;
    const tw = ctx.textWidth(name);
    const x0 = Math.round(W / 2 - (tw + 12 + b.maxHits * 3) / 2);
    const icon = b.foe.file ? ctx.icon(b.foe.file.kind) ?? art?.fileMark ?? null : null;
    if (icon) g.drawImage(icon, x0, 1);
    label(ctx, art, name, x0 + 10, 2, b.elite ? C.yellow : brickColor(b));
    for (let i = 0; i < b.maxHits; i++) {
      g.fillStyle = i < b.hits ? C.ink : "#3b2e63";
      g.fillRect(x0 + 12 + tw + i * 3, 4, 2, 2);
    }
  } else label(ctx, art, "BRICK SORT", W / 2 - 19, 2, C.lilac);
  const foes = `FOES ${foesLeft(s)}`;
  ctx.text(foes, RIGHT - ctx.textWidth(foes) - 1, 2, C.cyan);

  // active power-ups along the bottom: symbol and a shrinking bar
  if (s.phase !== "play" || !art) return;
  let x = LEFT + 3;
  const show = (perk: Parameters<Art["sym"]>[0], t: number, color: string) => {
    if (t <= 0) return;
    const sym = art.sym(perk, color);
    if (sym) g.drawImage(sym, x, 174);
    g.fillStyle = color;
    g.fillRect(x + 7, 176, Math.min(24, Math.ceil(t / 30)), 1);
    x += 36;
  };
  show("armor", s.armor, PERK_COLOR.armor);
  show("rapid", s.rapid, PERK_COLOR.rapid);
  show("power", s.fire, PERK_COLOR.power);
  show("ally", s.drone.t, PERK_COLOR.ally);
}

/** READY / launch hint / CLEAR! / GAME OVER. */
function banner(s: State, ctx: GameContext) {
  const big = (text: string, y: number, color: string) => ctx.text(text, Math.round(W / 2 - ctx.textWidth(text)), y, color, 2);
  const small = (text: string, y: number, color: string) => ctx.text(text, Math.round(W / 2 - ctx.textWidth(text) / 2), y, color);
  if (s.phase === "ready") {
    big("READY", 116, C.yellow);
    // foe bricks carry a file icon (or a scrap mark); plain wall bricks don't
    small(`BREAK ALL ${s.foes.length} MARKED BRICKS`, 134, C.lilac);
    small("PLAIN WALL BRICKS ARE OPTIONAL", 141, "#7d6aa6");
  } else if (s.phase === "play") {
    // (not while a popup floats through that line)
    const hint = s.serveT === 0 && s.stuckT < 150 && s.balls.some((b) => b.alive && b.stuck) && !s.popups.some((p) => p.y > 133 && p.y < 147);
    if (hint && s.tick & 8) small("SPACE OR CLICK TO LAUNCH", 140, C.ink);
  } else if (s.phase === "clear" || (s.phase === "done" && s.result?.won)) {
    big("CLEAR!", 116, C.green);
    small(`BONUS +${s.bonus}`, 134, C.yellow);
  } else big("GAME OVER", 116, C.red);
}
