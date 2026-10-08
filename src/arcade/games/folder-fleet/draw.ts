// Draws Folder Fleet from the world state; nothing here changes it. Art comes
// from sprites.ts, and with no art (tests have no canvas) things fall back to
// plain rectangles. A frame is a few hundred drawImage/fillRect calls.

import type { GameContext } from "../../types";
import { CLOAK, GUN_MAX, GUN_NAME, H, LUNGE_AT, MAX_GUN_LV, MAX_RING_R, METER_MAX, W, WEAPON_NAME, foesLeft, look, lunging, podAt, themeOf, waveHalf, type Ship, type World } from "./logic";
import { C, PERK_COLOR, PERK_TAG, WEAPON_COLOR, WEAPON_TAG, backdrop, bossArt, glyphs, keyColor, label, ringArt, waveArt, type Art, type HullArt, type Img, type TextColor } from "./sprites";
import { THEMES } from "./themes";

type G = CanvasRenderingContext2D;

const PART_COLORS = [C.orange, C.cyan, C.gold, C.red, C.green];
const MAX_LABELS = 4;
/** Ship labels drawn this frame (x, y, w per label), so none lands on another. */
const labelBoxes = new Float32Array(MAX_LABELS * 3);
const RING_PTS = 48;
const RING_COS = Array.from({ length: RING_PTS }, (_, i) => Math.cos((i / RING_PTS) * Math.PI * 2));
const RING_SIN = Array.from({ length: RING_PTS }, (_, i) => Math.sin((i / RING_PTS) * Math.PI * 2));

/** A sprite at (x, y) top left, or a plain box without art. */
function blit(g: G, img: Img | null | undefined, x: number, y: number, color: string, w: number, h: number) {
  if (img) g.drawImage(img, Math.round(x), Math.round(y));
  else {
    g.fillStyle = color;
    g.fillRect(Math.round(x), Math.round(y), w, h);
  }
}

/** HUD text: from the glyph atlas when there is one. */
function say(ctx: GameContext, art: Art | null, s: string, x: number, y: number, color: TextColor) {
  if (!art || !glyphs(art, ctx.g, s, Math.round(x), Math.round(y), color)) ctx.text(s, Math.round(x), Math.round(y), color);
}

/** A cached label with a shadow (labels, banners). */
function tag(ctx: GameContext, art: Art | null, s: string, x: number, y: number, color: string, scale = 1) {
  const img = art ? label(art, s, color, scale) : null;
  if (img) ctx.g.drawImage(img, Math.round(x), Math.round(y));
  else ctx.text(s, Math.round(x), Math.round(y), color, scale);
}

function centered(ctx: GameContext, art: Art | null, s: string, y: number, color: string, scale = 1) {
  tag(ctx, art, s, (W - ctx.textWidth(s) * scale) / 2, y, color, scale);
}

export function render(w: World, ctx: GameContext, art: Art | null) {
  const g = ctx.g;
  stars(w, g, art);
  capsules(w, ctx, art);
  ships(w, ctx, art);
  playerShots(w, g, art);
  player(w, g, art);
  foeShots(w, g, art);
  effects(w, ctx, art);
  hud(w, ctx, art);
  banners(w, ctx, art);
}

function stars(w: World, g: G, art: Art | null) {
  const stage = w.stages[Math.min(w.stage, w.stages.length - 1)];
  const th = THEMES[stage.theme];
  const layers = art ? backdrop(art, stage.theme) : null;
  const speeds = [0.25, 0.7, 1.6];
  if (!layers || !layers[0]) {
    g.fillStyle = th.bg;
    g.fillRect(0, 0, W, H);
  } else {
    const off = Math.floor((w.scroll * speeds[0]) % W);
    g.drawImage(layers[0], -off, 0);
    g.drawImage(layers[0], W - off, 0);
  }
  // the data grid: lines that scroll with the mid layer
  if (th.props === "grid") {
    g.fillStyle = th.prop[0];
    const off = (w.scroll * speeds[1]) % 32;
    for (let x = 32 - off; x < W; x += 32) g.fillRect(Math.round(x), 11, 1, 158);
    g.fillStyle = th.prop[1];
    for (let y = 24; y < 168; y += 24) g.fillRect(0, y, W, 1);
  }
  if (!layers) return;
  for (let i = 1; i < layers.length; i++) {
    const img = layers[i];
    if (!img) continue;
    const off = Math.floor((w.scroll * speeds[i]) % W);
    g.drawImage(img, -off, 0);
    g.drawImage(img, W - off, 0);
  }
}

function capsules(w: World, ctx: GameContext, art: Art | null) {
  const g = ctx.g;
  const p = w.player;
  let near: (typeof w.capsules)[number] | null = null;
  let best = Infinity;
  for (const c of w.capsules) {
    if (!c.on) continue;
    const x = Math.round(c.x - 7);
    const y = Math.round(c.y - 6);
    const glow = (w.tick >> 3) % 2 === 0;
    if (c.weapon) {
      // weapons: pointed capsules; a kept file still shows its icon, a drop shows the weapon's mark
      const k = c.weapon;
      if (art?.weaponGlow && glow) g.drawImage(art.weaponGlow, x, y);
      blit(g, art?.weaponCapsules[k], x, y, WEAPON_COLOR[k], 14, 12);
      if (c.friend) icon(ctx, c.friend.file.kind, x + 3, y + 2, 1);
      else blit(g, art?.weaponMarks[k], x + 3, y + 2, WEAPON_COLOR[k], 8, 8);
      say(ctx, art, WEAPON_TAG[k], x + 5, y - 6, WEAPON_COLOR[k]);
    } else if (c.friend) {
      const perk = c.friend.perk;
      if (art?.capsuleGlow && glow) g.drawImage(art.capsuleGlow, x, y);
      blit(g, art?.capsules[perk], x, y, PERK_COLOR[perk], 14, 12);
      icon(ctx, c.friend.file.kind, x + 3, y + 2, 1);
      say(ctx, art, PERK_TAG[perk], x + 5, y - 6, PERK_COLOR[perk] as TextColor);
    }
    const d = Math.abs(c.x - p.x) + Math.abs(c.y - p.y);
    if (Math.abs(c.x - p.x) < 70 && Math.abs(c.y - p.y) < 40 && d < best) (best = d), (near = c);
  }
  // name the nearest one once it's close: the file, or the weapon a drop gives
  if (near) {
    const name = near.friend ? near.friend.label : WEAPON_NAME[near.weapon ?? "spread"];
    const color = near.weapon ? WEAPON_COLOR[near.weapon] : PERK_COLOR[near.friend?.perk ?? "points"];
    tag(ctx, art, name, near.x - ctx.textWidth(name) / 2, Math.round(near.y - 6) + 14, color);
  }
}

/** The file's kind icon, or a plain mark when it isn't loaded (or the foe isn't a file). */
function icon(ctx: GameContext, kind: Parameters<GameContext["icon"]>[0] | null, x: number, y: number, scale: number) {
  const img = kind ? ctx.icon(kind) : null;
  const g = ctx.g;
  if (img) {
    g.drawImage(img, x, y, 8 * scale, 8 * scale);
    return;
  }
  if (kind) {
    // a page-shaped stand-in
    g.fillStyle = C.ink;
    g.fillRect(x + 2 * scale, y + 1 * scale, 4 * scale, 6 * scale);
    g.fillStyle = C.dim;
    g.fillRect(x + 3 * scale, y + 3 * scale, 2 * scale, scale);
  } else {
    // filler: a crumpled scrap
    g.fillStyle = C.lilac;
    g.fillRect(x + 2 * scale, y + 3 * scale, 3 * scale, 3 * scale);
    g.fillRect(x + 4 * scale, y + 2 * scale, 2 * scale, 2 * scale);
    g.fillStyle = C.dim;
    g.fillRect(x + 3 * scale, y + 4 * scale, scale, scale);
  }
}

function hullFor(art: Art | null, s: Ship): HullArt | null {
  if (!art) return null;
  return s.kind === "boss" ? bossArt(art, s.ability) : s.kind === "mini" ? art.minis[look(s)] : art.hulls[s.ability];
}

const HULL_COLOR: Record<string, string> = {
  basic: C.lilac, fast: C.red, shield: "#5b8cff", sonic: C.green, teleport: C.cyan, flash: C.pink, split: C.orange, tank: "#8f93b5",
};

function ships(w: World, ctx: GameContext, art: Art | null) {
  const g = ctx.g;
  for (const s of w.ships) {
    if (!s.on || s.state === "wait") continue;
    const ha = hullFor(art, s);
    const hw = ha ? ha.w : s.w + 4;
    const hh = ha ? ha.h : s.h + 2;
    let x = Math.round(s.x - hw / 2);
    const y = Math.round(s.y - hh / 2);
    // the fast boss shakes before it lunges, and marks the lane it will take
    if (lunging(s) && s.lunge <= LUNGE_AT) {
      x += (w.tick >> 1) % 2 ? 1 : -1;
      g.fillStyle = (w.tick >> 2) % 2 ? C.red : C.orange;
      const top = Math.round(s.y - s.h / 2 - 2);
      for (let lx = Math.round(s.x - s.w / 2 - 6); lx > s.x - s.cx - s.w / 2 - 4; lx -= 8) {
        g.fillRect(lx - 4, top, 4, 1);
        g.fillRect(lx - 4, top + s.h + 3, 4, 1);
      }
    }

    // flash: blinks, then only a few glints show where it is
    if (s.ability === "flash") {
      const c = s.cloak;
      if (c >= CLOAK.hide && c < CLOAK.show) {
        glints(g, s, w.tick);
        continue;
      }
      if (c >= CLOAK.blinkOut && (w.tick >> 1) % 2) continue;
    }
    // teleport: flickers out and in with a beam of light
    if (s.warp > 0) {
      g.fillStyle = C.cyan;
      const k = Math.abs(s.warp - 9);
      g.fillRect(Math.round(s.x) - 1, y - 4 + k, 2, hh + 8 - k * 2);
      g.fillRect(x + 2, Math.round(s.y), hw - 4, 1);
      if (s.warp % 4 < 2) continue;
    }
    // fast: a fading trail while diving
    if (s.ability === "fast" && (s.state === "peel" || s.state === "dive") && ha?.normal) {
      const dx = s.state === "peel" ? Math.cos(s.angle) * s.speed : s.vx;
      const dy = s.state === "peel" ? Math.sin(s.angle) * s.speed : s.vy;
      g.globalAlpha = 0.35;
      g.drawImage(ha.normal, Math.round(x - dx * 3), Math.round(y - dy * 3));
      g.globalAlpha = 0.15;
      g.drawImage(ha.normal, Math.round(x - dx * 6), Math.round(y - dy * 6));
      g.globalAlpha = 1;
    }
    // a white flash for two ticks after a hit; the boss (hit all the time)
    // only lights up its hull, so its file icon always shows
    const flash = s.hitT >= 44;
    const white = flash && s.kind !== "boss";
    const elite = s.foe.elite;
    const img = !ha ? null : white ? ha.white : flash && s.kind === "boss" ? (elite ? ha.litElite : ha.lit) : elite ? ha.elite : ha.normal;
    if (img) g.drawImage(img, x, y);
    else {
      g.fillStyle = elite ? C.gold : HULL_COLOR[look(s)];
      g.fillRect(x, y, hw, hh);
    }
    if (!white) icon(ctx, s.foe.file?.kind ?? null, x + (ha ? ha.ix : 3), y + (ha ? ha.iy : 2), ha ? ha.iconScale : 1);
    if (s.shield > 0) shield(g, s, x, y, hh, w.tick);
    if (s.carries && (w.tick >> 2) % 2 === 0) {
      g.fillStyle = C.ink;
      g.fillRect(x + hw - 3, Math.round(s.y) - 3, 5, 6);
      g.fillStyle = PERK_COLOR[s.carries.perk];
      g.fillRect(x + hw - 2, Math.round(s.y) - 2, 3, 4);
    }
  }
  // labels on top: whatever was just hit first, then the biggest files; a few at most
  let shown = 0;
  for (let pass = 0; pass < 2 && shown < MAX_LABELS; pass++)
    for (const s of w.ships) {
      if (shown >= MAX_LABELS) break;
      if (!s.on || s.state === "wait" || s.kind === "boss" || s.warp > 0) continue;
      if (s.ability === "flash" && s.cloak >= CLOAK.hide && s.cloak < CLOAK.show) continue;
      const hit = s.hitT > 0;
      if (pass === 0 ? !hit : hit || s.kind !== "ship" || !(s.foe.hp >= 8 || s.ability === "tank")) continue;
      if (hit && s.maxHp > 1) {
        g.fillStyle = C.dim;
        g.fillRect(Math.round(s.x) - 7, Math.round(s.y - s.h / 2) - 4, 14, 2);
        g.fillStyle = s.foe.elite ? C.gold : C.green;
        g.fillRect(Math.round(s.x) - 7, Math.round(s.y - s.h / 2) - 4, Math.max(1, Math.round((14 * s.hp) / s.maxHp)), 2);
      }
      // skip a label that would run into one already drawn
      const lw = ctx.textWidth(s.foe.label);
      const lx = Math.round(s.x - lw / 2);
      const ly = Math.round(s.y + s.h / 2 + 3);
      let clash = false;
      for (let k = 0; k < shown * 3; k += 3)
        if (lx < labelBoxes[k] + labelBoxes[k + 2] + 3 && labelBoxes[k] < lx + lw + 3 && Math.abs(ly - labelBoxes[k + 1]) < 8) clash = true;
      if (clash) continue;
      labelBoxes[shown * 3] = lx;
      labelBoxes[shown * 3 + 1] = ly;
      labelBoxes[shown * 3 + 2] = lw;
      shown++;
      tag(ctx, art, s.foe.label, lx, ly, s.foe.elite ? C.gold : C.ink);
    }
}

/** A cloaked ship: a few sparkles that drift round where it hides. */
function glints(g: G, s: Ship, tick: number) {
  g.fillStyle = C.pink;
  for (let k = 0; k < 3; k++) {
    const h = ((s.id * 73 + (tick >> 2) * 31 + k * 57) * 2654435761) >>> 0;
    g.fillRect(Math.round(s.x - s.w / 2 + (h % s.w)), Math.round(s.y - s.h / 2 + ((h >>> 8) % s.h)), 1, 1);
  }
}

/** A front shield: a curved dashed bar, thicker with more points. */
function shield(g: G, s: Ship, x: number, y: number, hh: number, tick: number) {
  const thick = Math.min(3, s.shield);
  g.fillStyle = s.hitT > 40 ? C.ink : (tick >> 2) % 2 ? C.cyan : "#bfe9ff";
  const n = Math.floor((hh + 4) / 3);
  const mid = (n - 1) / 2;
  for (let k = 0; k < n; k++) {
    const bend = Math.round(((k - mid) / mid) ** 2 * 3);
    g.fillRect(x - 3 - thick + bend, y - 2 + k * 3, thick, 2);
  }
}

function playerShots(w: World, g: G, art: Art | null) {
  const p = w.player;
  if (p.beaming) {
    const flick = w.tick % 2;
    g.fillStyle = C.pink;
    g.fillRect(Math.round(p.x + 9), Math.round(p.y) - 3 + flick, W, 6 - flick * 2);
    g.fillStyle = C.ink;
    g.fillRect(Math.round(p.x + 9), Math.round(p.y) - 1, W, 2);
    g.fillStyle = C.yellow;
    g.fillRect(Math.round(p.x + 7), Math.round(p.y) - 4, 4, 8);
  }
  for (const b of w.shots) {
    if (!b.on) continue;
    switch (b.kind) {
      case "missile":
        blit(g, art?.missile, b.x - 3, b.y - 1, C.orange, 6, 3);
        g.fillStyle = (w.tick >> 1) % 2 ? C.yellow : C.red;
        g.fillRect(Math.round(b.x - 3 - b.vx), Math.round(b.y - b.vy), 1, 1);
        break;
      case "seek":
        blit(g, art?.seekShot, b.x - 3, b.y - 1, C.mint, 5, 3);
        g.fillStyle = C.mint;
        g.fillRect(Math.round(b.x - 3 - b.vx * 0.6), Math.round(b.y - b.vy * 0.6), 1, 1);
        break;
      case "wave": {
        const h = Math.round(waveHalf(b));
        const img = art ? waveArt(art, h) : null;
        if (img) g.drawImage(img, Math.round(b.x - 4), Math.round(b.y) - (img.height >> 1));
        else {
          g.fillStyle = C.sky;
          g.fillRect(Math.round(b.x), Math.round(b.y - h), 2, h * 2 + 1);
        }
        break;
      }
      case "pod":
        blit(g, art?.podShot, b.x - 1, b.y - 1, C.lime, 3, 3);
        break;
      default:
        blit(g, b.kind === "drone" ? art?.droneShot : art?.shot, b.x - 3, b.y - 1, C.yellow, 6, 3);
    }
  }
}

function player(w: World, g: G, art: Art | null) {
  const p = w.player;
  for (const d of p.drones) {
    if (d.t < 90 && (w.tick >> 2) % 2) continue; // blinking out
    blit(g, art?.drone, d.x - 3, d.y - 3, C.lilac, 7, 7);
  }
  if (w.phase === "lost") return;
  if (p.invuln > 0 && w.phase !== "ready" && (w.tick >> 1) % 2) return;
  const x = Math.round(p.x - 9);
  const y = Math.round(p.y - 5);
  // side pods ride above and below; they blink as they run out
  if (p.sideT > 0 && !(p.sideT < 90 && (w.tick >> 2) % 2))
    for (const k of [-1, 1]) {
      const [px, py] = podAt(p, k);
      blit(g, art?.pod, px - 3, py - 2, C.lime, 6, 4);
    }
  // engine flame
  const f = 2 + ((w.tick >> 1) % 3);
  g.fillStyle = (w.tick >> 1) % 2 ? C.pink : C.yellow;
  g.fillRect(x - f, y + 4, f, 3);
  blit(g, art?.player, x, y, C.cyan, 18, 11);
  if (p.armor > 0) {
    g.fillStyle = (w.tick >> 2) % 2 ? C.cyan : "#bfe9ff";
    for (let i = 0; i < RING_PTS; i += 3) g.fillRect(Math.round(p.x + RING_COS[i] * 13), Math.round(p.y + RING_SIN[i] * 10), 1, 1);
  }
}

function foeShots(w: World, g: G, art: Art | null) {
  for (const b of w.foeShots) {
    if (!b.on) continue;
    if (b.kind === "bullet") blit(g, art?.bullet, b.x - 2, b.y - 2, C.pink, 4, 4);
    else if (b.kind === "shell") blit(g, art?.shell, b.x - 2, b.y - 2, C.orange, 4, 4);
    else blit(g, art?.debris[(b.t >> 3) % 2], b.x - 2, b.y - 2, "#8f93b5", 4, 4);
  }
  for (const r of w.rings) {
    if (!r.on) continue;
    const ri = Math.max(3, Math.min(MAX_RING_R, Math.round(r.r)));
    const img = art ? ringArt(art, ri) : null;
    if (img) g.drawImage(img, Math.round(r.x - img.width / 2), Math.round(r.y - img.height / 2));
    else {
      g.fillStyle = C.green;
      g.fillRect(Math.round(r.x - ri), Math.round(r.y - ri), 2, ri * 2);
    }
  }
}

function effects(w: World, ctx: GameContext, art: Art | null) {
  const g = ctx.g;
  for (const b of w.booms) {
    if (!b.on) continue;
    const frames = b.big ? art?.boomBig : art?.boomSmall;
    const img = frames?.[Math.min(frames.length - 1, Math.floor(b.t / 3))];
    const size = b.big ? 36 : 16;
    if (img) g.drawImage(img, Math.round(b.x - size / 2), Math.round(b.y - size / 2));
    else {
      g.fillStyle = C.orange;
      g.fillRect(Math.round(b.x - 3), Math.round(b.y - 3), 6, 6);
    }
  }
  for (const q of w.parts) {
    if (!q.on) continue;
    g.fillStyle = PART_COLORS[q.color] ?? C.ink;
    g.fillRect(Math.round(q.x), Math.round(q.y), q.t > 10 ? 2 : 1, q.t > 10 ? 2 : 1);
  }
  for (const q of w.pops) if (q.on) say(ctx, art, q.text, q.x - q.text.length * 2, q.y - q.t * 0.4, C.yellow);
  if (w.pulse.on) {
    const pu = w.pulse;
    for (let i = 0; i < RING_PTS; i++) {
      const x = pu.x + RING_COS[i] * pu.r;
      const y = pu.y + RING_SIN[i] * pu.r;
      if (x < -4 || x > W + 4 || y < -4 || y > H + 4) continue;
      g.fillStyle = i % 2 ? C.pink : C.ink;
      g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
    }
  }
}

function hud(w: World, ctx: GameContext, art: Art | null) {
  const g = ctx.g;
  const p = w.player;
  // top line
  g.fillStyle = C.bg;
  g.fillRect(0, 0, W, 10);
  g.fillStyle = C.dim;
  g.fillRect(0, 10, W, 1);
  say(ctx, art, "SCORE", 3, 3, C.lilac);
  say(ctx, art, String(Math.round(w.score)), 26, 3, C.ink);
  for (let i = 0; i < p.lives; i++) blit(g, art?.life, 76 + i * 9, 3, C.cyan, 7, 5);
  const left = `FOES ${foesLeft(w)}`;
  const leftX = W - 3 - ctx.textWidth(left);
  say(ctx, art, left, leftX, 3, C.pink);

  // the boss's name and health bar take the wave's place, up here out of the way
  const b = w.ships.find((s) => s.on && s.kind === "boss");
  if (b) {
    const name = b.foe.label;
    say(ctx, art, name, 136, 3, b.foe.elite ? C.yellow : C.orange);
    const bx = 136 + ctx.textWidth(name) + 4;
    const bw = leftX - 6 - bx;
    g.fillStyle = C.dim;
    g.fillRect(bx, 2, bw, 7);
    g.fillStyle = C.bg;
    g.fillRect(bx + 1, 3, bw - 2, 5);
    g.fillStyle = b.hitT >= 44 ? C.ink : C.red;
    g.fillRect(bx + 1, 3, Math.max(0, Math.round(((bw - 2) * b.hp) / b.maxHp)), 5);
    if (b.shield > 0) {
      g.fillStyle = C.cyan;
      g.fillRect(bx + 1, 3, Math.round(((bw - 2) * b.shield) / Math.max(1, b.maxShield)), 1);
    }
  } else {
    // the stage: its number and folder title
    const boss = w.phase === "warning" || w.phase === "boss" || w.phase === "won";
    const wave = boss ? "BOSS" : `${w.wave + 1}/${w.waves.length}`;
    say(ctx, art, wave, 140, 3, C.cyan);
    const title = w.stages[boss ? w.stages.length - 1 : Math.min(w.wave, w.stages.length - 1)].title;
    say(ctx, art, title, 140 + ctx.textWidth(wave) + 4, 3, themeOf(w).accent);
  }

  // bottom line: the power meter and what's active
  g.fillStyle = C.bg;
  g.fillRect(0, 170, W, 10);
  g.fillStyle = C.dim;
  g.fillRect(0, 169, W, 1);
  say(ctx, art, "POWER", 3, 173, C.lilac);
  const full = w.meter >= METER_MAX;
  for (let i = 0; i < METER_MAX; i++) {
    const x = 26 + i * 11;
    g.fillStyle = C.dim;
    g.fillRect(x, 172, 10, 6);
    const part = Math.max(0, Math.min(1, w.meter - i));
    if (part > 0) {
      g.fillStyle = full ? ((w.tick >> 2) % 2 ? C.pink : C.yellow) : C.green;
      g.fillRect(x + 1, 173, Math.max(1, Math.round(8 * part)), 4);
    }
  }
  if (full && (w.tick >> 3) % 2 === 0) say(ctx, art, "X PULSE!", 84, 173, C.yellow);
  // the gun: its name, level pips and time left
  let x = 118;
  const gc: TextColor = p.gun === "blaster" ? C.lilac : WEAPON_COLOR[p.gun];
  const name = GUN_NAME[p.gun];
  say(ctx, art, name, x, 173, gc);
  x += ctx.textWidth(name) + 2;
  if (p.gun !== "blaster") {
    for (let i = 0; i < MAX_GUN_LV; i++) {
      g.fillStyle = i < p.gunLv ? gc : C.dim;
      g.fillRect(x + i * 3, 172, 2, 3);
    }
    g.fillStyle = C.dim;
    g.fillRect(x, 176, 8, 2);
    g.fillStyle = p.gunT < 90 && (w.tick >> 2) % 2 ? C.ink : gc;
    g.fillRect(x, 176, Math.max(1, Math.round((8 * Math.min(p.gunT, 690)) / 690)), 2);
    x += 10;
  }
  x += 4;
  const boost = (letter: string, color: TextColor, t: number, max: number) => {
    say(ctx, art, letter, x, 173, color);
    const lw = ctx.textWidth(letter);
    g.fillStyle = C.dim;
    g.fillRect(x + lw + 1, 175, 10, 2);
    g.fillStyle = color;
    g.fillRect(x + lw + 1, 175, Math.max(1, Math.round((10 * Math.min(t, max)) / max)), 2);
    x += lw + 14;
  };
  if (p.sideT > 0) boost(p.sideLv >= 2 ? "P2" : "P", C.lime, p.sideT, Math.min(GUN_MAX, 690));
  if (p.rapidT > 0) boost("R", C.yellow, p.rapidT, 690);
  if (p.beamT > 0) boost("L", C.green, p.beamT, 210);
  for (const d of p.drones) boost("D", C.lilac, d.t, 1350);
  if (p.missiles > 0) {
    say(ctx, art, `M${p.missiles}`, x, 173, C.orange);
    x += 18;
  }
  if (p.armor > 0) say(ctx, art, `A${p.armor}`, x, 173, C.cyan);

  // the last pickup, named
  if (w.toast.t > 0 && w.toast.text) {
    const s = w.toast.text;
    const tw = ctx.textWidth(s);
    g.fillStyle = C.bg;
    g.fillRect(Math.round((W - tw) / 2) - 2, 159, tw + 4, 8);
    say(ctx, art, s, Math.round((W - tw) / 2), 160, keyColor(w.toast.color));
  }
}

/** A stage's title card: "WAVE 2 - DOWNLOADS" in the theme's color, and the theme's name. */
function stageTitle(w: World, ctx: GameContext, art: Art | null, i: number, y: number) {
  const st = w.stages[Math.min(i, w.stages.length - 1)];
  const th = THEMES[st.theme];
  const head = i >= w.waves.length ? `BOSS - ${st.title}` : `WAVE ${i + 1} - ${st.title}`;
  centered(ctx, art, head, y, th.accent);
  centered(ctx, art, th.name, y + 9, C.lilac);
}

function banners(w: World, ctx: GameContext, art: Art | null) {
  const blink = (w.tick >> 3) % 2 === 0;
  switch (w.phase) {
    case "ready":
      if (blink || w.phaseT > 30) centered(ctx, art, "READY", 66, C.yellow, 3);
      stageTitle(w, ctx, art, 0, 88);
      break;
    case "between":
      centered(ctx, art, "WAVE CLEAR", 62, C.green, 2);
      stageTitle(w, ctx, art, w.wave + 1, 80);
      break;
    case "warning":
      if (blink) centered(ctx, art, "WARNING", 58, C.red, 3);
      centered(ctx, art, `BIGGEST FILE: ${w.boss.label}`, 80, C.yellow);
      stageTitle(w, ctx, art, w.waves.length, 92);
      break;
    case "won":
      centered(ctx, art, "FLEET CLEARED!", 70, C.green, 2);
      break;
    case "lost":
      centered(ctx, art, "GAME OVER", 70, C.red, 3);
      break;
    default:
      break;
  }
}
