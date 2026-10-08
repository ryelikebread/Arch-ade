// Draws a Tidy Hop world: backdrop, the pre-painted level pages, then the
// moving parts and the HUD. Reads the world, never changes it; anything
// that wiggles is timed from the world's tick, so drawing more or less
// often can't change how a round plays.

import type { GameContext } from "../../types";
import { BASE, T, THEMES, VIEW_H, VIEW_W } from "./level";
import { FLASH_CYCLE, foesLeft, POWER_TICKS, POWERS, READY_TICKS, SLAB_H, TITLE_TICKS, type Enemy, type World } from "./logic";
import { BODY, C, ICON_AT, LOOKS, PART_COLORS, PERK_COLOR, POWER_COLOR, type Art } from "./sprites";

type Ctx = CanvasRenderingContext2D;

const ABILITY_WORD: Record<string, string> = {
  flash: "FLASH", shield: "SHIELD", teleport: "BLINK", sonic: "SHOUT", fast: "FAST", split: "SPLIT", tank: "TANK", basic: "WALKER",
};

export function drawWorld(ctx: GameContext, w: World, art: Art) {
  const g = ctx.g;
  const cam = Math.round(w.cam);
  const sy = w.shake > 0 ? (w.tick % 4 < 2 ? 2 : -1) : 0;

  // Each level's backdrop fills its part of the screen; where two levels meet, the view is cut in two.
  const off = -(Math.round(cam * 0.3) % VIEW_W);
  for (let i = 0; i < w.stages.length; i++) {
    const x0 = Math.max(0, w.stages[i].x - cam);
    const x1 = Math.min(VIEW_W, (w.stages[i + 1]?.x ?? Infinity) - cam);
    if (x1 <= x0) continue;
    const theme = w.stages[i].theme;
    const bg = art.bgs[theme];
    const whole = x0 <= 0 && x1 >= VIEW_W;
    if (!whole) {
      g.save();
      g.beginPath();
      g.rect(x0, 0, x1 - x0, VIEW_H);
      g.clip();
    }
    g.fillStyle = LOOKS[theme].sky;
    g.fillRect(x0, 0, x1 - x0, VIEW_H);
    if (bg) {
      g.drawImage(bg, off, 0);
      g.drawImage(bg, off + VIEW_W, 0);
    }
    if (!whole) g.restore();
  }
  for (const p of art.pages) if (p.x < cam + VIEW_W && p.x + p.img.width > cam) g.drawImage(p.img, p.x - cam, sy);

  const inView = (x: number, wd: number) => x + wd > cam - 8 && x < cam + VIEW_W + 8;

  // Checkpoints (each one starts a level: a board with its number) and the goal.
  for (let i = 0; i < w.checkpoints.length; i++) {
    const cp = w.checkpoints[i];
    if (!inView(cp.x - 6, 20)) continue;
    const x = cp.x - cam;
    const top = BASE * T - 22 + sy;
    const n = String(i + 2);
    const bw = ctx.textWidth(n) + 6;
    rect(g, x - 4, top - 12, bw + 2, 10, C.lilac);
    rect(g, x - 3, top - 11, bw, 8, C.bg);
    ctx.text(n, x, top - 9, cp.on ? C.green : C.ink);
    g.fillStyle = C.lilac;
    g.fillRect(x, top, 1, 22);
    const pen = art.pennant[cp.on ? 1 : 0];
    if (pen) g.drawImage(pen, x + 1, top);
    else rect(g, x + 1, top, 6, 3, cp.on ? C.green : C.lilac);
  }
  if (inView(w.goalX - 14, 20)) {
    const x = w.goalX - cam;
    const top = (BASE - 13) * T + sy;
    rect(g, x, top, 2, BASE * T - top + sy, C.ink);
    rect(g, x - 1, top - 3, 4, 4, C.yellow);
    rect(g, x - 3, BASE * T - 4 + sy, 8, 4, C.lilac);
    // The flag drops down the pole when you reach it.
    const drop = w.phase === "goal" || (w.phase === "done" && w.won) ? Math.min(1, w.phaseT / 30) : 0;
    const fy = top + 2 + Math.round(drop * (BASE * T - top - 14));
    if (art.flag) g.drawImage(art.flag, x - 12, fy);
    else rect(g, x - 12, fy, 12, 8, C.pink);
  }

  // Coins.
  const coinImg = art.coin[Math.floor(w.tick / 8) % 2];
  for (const c of w.coins) {
    if (c.taken || !inView(c.x - 3, 6)) continue;
    if (coinImg) g.drawImage(coinImg, Math.round(c.x - cam - 2), Math.round(c.y - 3) + sy);
    else rect(g, c.x - cam - 2, c.y - 3 + sy, 5, 7, C.yellow);
  }

  // Item blocks: the kept file's icon shows on the block until it's bumped.
  for (const b of w.blocks) {
    const bx = b.c * T;
    if (!inView(bx, 16)) continue;
    const lift = b.bump > 4 ? 8 - b.bump : b.bump;
    const x = bx - cam;
    const y = b.r * T - lift + sy;
    const img = b.used ? art.blocks.used : b.friend >= 0 ? art.blocks.item : art.blocks.coin;
    if (img) g.drawImage(img, x, y);
    else rect(g, x, y, 16, 16, b.used ? "#4a3d66" : C.yellow);
    if (!b.used && b.friend >= 0) iconAt(ctx, w.friends[b.friend].file.kind, x + 4, y + 4, PERK_COLOR[w.friends[b.friend].perk]);
  }

  // File slabs.
  for (const s of w.slabs) {
    if (s.state === "gone" || !inView(s.x, s.len * T)) continue;
    for (let i = 0; i < s.len; i++) {
      const done = s.state !== "rest" || s.pressed[i] === 1;
      const sag = s.state === "rest" && s.pressed[i] ? 2 : 0;
      const img = i === 0 ? (done ? art.slab.leftDone : art.slab.left) : i === s.len - 1 ? (done ? art.slab.rightDone : art.slab.right) : done ? art.slab.midDone : art.slab.mid;
      const x = s.x + i * T - cam;
      const y = Math.round(s.y) + sag + sy;
      if (img) g.drawImage(img, x, y);
      else rect(g, x, y, T, SLAB_H, done ? C.green : C.yellow);
    }
  }

  // Floating and popped pickups.
  const p = w.player;
  for (const k of w.pickups) {
    if (k.taken || !inView(k.x, 12)) continue;
    const bob = k.mode === "float" ? (Math.floor((w.tick + k.friend * 7) / 10) % 2) : 0;
    const x = Math.round(k.x - cam);
    const y = Math.round(k.y) + bob + sy;
    if (k.power) {
      // A power-up: its own sprite with a twinkle going round it.
      const img = art.powers[k.power];
      if (img) g.drawImage(img, x, y);
      else rect(g, x, y, 12, 12, POWER_COLOR[k.power]);
      const a = (w.tick / 6) % (Math.PI * 2);
      rect(g, x + 6 + Math.round(Math.cos(a) * 8), y + 6 + Math.round(Math.sin(a) * 8), 1, 1, "#ffffff");
      continue;
    }
    const f = w.friends[k.friend];
    const card = art.cards[f.perk];
    if (card) g.drawImage(card, x, y);
    else rect(g, x, y, 12, 12, PERK_COLOR[f.perk]);
    iconAt(ctx, f.file.kind, x + 2, y + 2, PERK_COLOR[f.perk]);
    if (Math.abs(k.x + 6 - (p.x + p.w / 2)) < 48) label(ctx, f.label, x + 6, y - 7, PERK_COLOR[f.perk]);
  }

  // Foes, then the labels of the nearest few on top.
  for (const e of w.enemies) if (e.state !== "gone" && inView(e.x, e.w)) drawEnemy(ctx, w, art, e, cam, sy);
  drawFoeLabels(ctx, w, cam, sy);

  // Sound waves.
  for (const v of w.waves) {
    if (!inView(v.x, 6)) continue;
    const img = art.wave[Math.floor(w.tick / 4) % 2][v.vx > 0 ? 0 : 1];
    if (img) g.drawImage(img, Math.round(v.x - cam), Math.round(v.y) + sy);
    else rect(g, v.x - cam, v.y + sy, 6, 10, C.pink);
  }

  // The helper.
  const a = w.ally;
  if (a.on && (a.t > 60 || w.tick % 4 < 2)) {
    const img = art.ally[Math.abs(a.vx) > 0.2 ? Math.floor(w.tick / 5) % 2 : 0][a.facing > 0 ? 0 : 1];
    const x = Math.round(a.x - cam);
    const y = Math.round(a.y) + sy;
    if (img) g.drawImage(img, x, y);
    else rect(g, x, y, a.w, a.h, C.green);
    const f = w.friends[a.friend];
    iconAt(ctx, f ? f.file.kind : null, x, y + 6, C.green);
  }

  drawPlayer(ctx, w, art, cam, sy);

  // What was just picked up, rising over your head.
  for (const q of w.popups) {
    if (q.t < 8 && q.t % 2) continue;
    label(ctx, q.text, q.x - cam, Math.round(q.y) + sy, PART_COLORS[q.color]);
  }

  // Paper balls.
  for (const s of w.shots) {
    if (art.ball) g.drawImage(art.ball, Math.round(s.x - cam), Math.round(s.y) + sy);
    else rect(g, s.x - cam, s.y + sy, 4, 4, C.ink);
  }

  // Particles.
  for (const q of w.parts) {
    if (q.life <= 0) continue;
    rect(g, q.x - cam, q.y + sy, q.life > 8 ? 2 : 1, q.life > 8 ? 2 : 1, PART_COLORS[q.color]);
  }

  drawHud(ctx, w, art);
}

function drawEnemy(ctx: GameContext, w: World, art: Art, e: Enemy, cam: number, sy: number) {
  const g = ctx.g;
  const x = Math.round(e.x - cam);
  const y = Math.round(e.y) + sy;
  if (e.state === "dying") {
    if (e.how === "stomp" || e.how === "squash") {
      // Flattened: a squashed page with the icon peeking out.
      const h = e.how === "squash" ? 3 : 5;
      rect(g, x - 1, y + e.h - h, e.w + 2, h, BODY[e.ability][1]);
      rect(g, x, y + e.h - h, e.w, 1, BODY[e.ability][0]);
      return;
    }
    if (w.tick % 2) return;
  }
  // Flash foes blink out: flicker as they go and come back, a faint glint while away.
  if (e.ability === "flash" && e.state === "alive") {
    const ph = (e.timer + e.phase) % FLASH_CYCLE;
    if (e.hidden) {
      if (w.tick % 12 < 2) rect(g, x + e.w / 2, y + e.h / 2, 1, 1, C.ink);
      return;
    }
    if (((ph >= 90 && ph < 100) || ph >= 140) && w.tick % 4 < 2) return;
  }
  if (e.ability === "teleport" && e.state === "alive" && e.cd <= 12 && w.tick % 2) return;
  const frame = e.vx !== 0 ? Math.floor(e.timer / 6) % 2 : 0;
  const face = e.dir > 0 ? 0 : 1;
  const set = e.mini ? art.minis : art.critters[e.ability];
  const img = set?.[e.elite ? 1 : 0]?.[frame]?.[face] ?? null;
  const shiver = e.ability === "tank" && e.cd < 18 && e.state === "alive" ? (w.tick % 2 ? 1 : -1) : 0;
  if (img) g.drawImage(img, x + shiver, y);
  else rect(g, x, y, e.w, e.h, BODY[e.ability][0]);
  const [ix, iy] = e.mini ? ICON_AT.mini : e.ability === "tank" ? ICON_AT.tank : ICON_AT.normal;
  iconAt(ctx, e.kind, x + ix + shiver, y + iy, BODY[e.ability][1]);
  if (e.hurt > 0 && e.hurt % 2) rect(g, x, y, e.w, 2, C.ink);
  if (e.state !== "alive") return;

  // What each ability adds on top.
  const cx = x + Math.floor(e.w / 2);
  switch (e.ability) {
    case "teleport":
      rect(g, cx, y - 3, 1, 3, C.purple);
      rect(g, cx - 1, y - 5, 3, 2, e.cd <= 12 || e.blink > 0 ? C.ink : C.green);
      break;
    case "flash":
      rect(g, cx - 1, y - 3, 3, 2, w.tick % 20 < 3 ? "#ffffff" : C.yellow);
      rect(g, cx, y - 1, 1, 1, C.lilac);
      break;
    case "sonic":
      if (e.shout > 0) {
        const fx = e.dir > 0 ? x + e.w + 1 : x - 3;
        rect(g, fx, y + 3, 2, 1, C.pink);
        rect(g, fx + e.dir, y + 5, 2, 3, C.pink);
        rect(g, fx, y + 9, 2, 1, C.pink);
      }
      break;
    case "fast":
      if (e.vx !== 0) {
        const bx = e.dir > 0 ? x - 5 : x + e.w + 1;
        rect(g, bx, y + 5, 4, 1, C.green);
        rect(g, bx + (e.dir > 0 ? 1 : -1), y + 9, 3, 1, C.green);
      }
      break;
  }
  if (e.shield) {
    const ring = e.ability === "tank" ? art.ringTank : art.ring;
    if (ring) g.drawImage(ring, x + Math.floor((e.w - ring.width) / 2), y + Math.floor((e.h - ring.height) / 2) - 1);
    else rect(g, x - 2, y - 2, e.w + 4, 1, C.cyan);
  }
  if (e.elite && art.crown) g.drawImage(art.crown, cx - 3, y - (e.ability === "teleport" || e.ability === "flash" ? 9 : 5));
  else if (e.elite) rect(g, cx - 3, y - 4, 7, 3, C.yellow);
}

// Reused every frame: the label boxes drawn so far.
const MAX_LABELS = 3;
const boxes = Array.from({ length: MAX_LABELS }, () => ({ x: 0, y: 0, w: 0 }));
const used = new Set<number>();

/**
 * Up to three foe labels: the one just hit first, then the nearest. A label
 * that would cover one already drawn is skipped (so a split pair, both
 * named after the same file, shows its name once).
 */
function drawFoeLabels(ctx: GameContext, w: World, cam: number, sy: number) {
  const p = w.player;
  const pcx = p.x + p.w / 2;
  used.clear();
  let n = 0;
  for (let tries = 0; tries < 8 && n < MAX_LABELS; tries++) {
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < w.enemies.length; i++) {
      const e = w.enemies[i];
      if (used.has(i) || e.state !== "alive" || e.hidden || !(e.x + e.w > cam && e.x < cam + VIEW_W)) continue;
      const dx = Math.abs(e.x + e.w / 2 - pcx);
      const hit = w.lastHit === i && w.tick - w.lastHitT < 45;
      if (!hit && (dx >= 56 || Math.abs(e.y - p.y) >= 60)) continue;
      const d = hit ? -1 : dx;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    if (best < 0) break;
    used.add(best);
    const e = w.enemies[best];
    const top = e.y - (e.elite ? 13 : 8) - (e.shield ? 3 : 0) - (e.ability === "teleport" || e.ability === "flash" ? 3 : 0);
    const b = placeLabel(ctx, e.label, e.x + e.w / 2 - cam, Math.round(top) + sy, boxes[n]);
    let clear = true;
    for (let k = 0; k < n; k++) {
      const o = boxes[k];
      if (b.x - 1 < o.x + o.w + 1 && b.x + b.w + 1 > o.x - 1 && Math.abs(b.y - o.y) < 7) clear = false;
    }
    if (!clear) continue;
    drawLabel(ctx, e.label, b, BODY[e.ability][0]);
    n++;
  }
}

function drawPlayer(ctx: GameContext, w: World, art: Art, cam: number, sy: number) {
  const g = ctx.g;
  const p = w.player;
  if (p.dead === 0 && p.inv > 0 && p.pw.star === 0 && w.phase === "play" && w.tick % 4 < 2) return;
  let frame = "stand";
  if (p.climbing) frame = Math.floor(p.anim / 6) % 2 ? "climbB" : "climbA";
  else if (!p.onGround || p.dead > 0) frame = "jump";
  else if (p.vx !== 0) frame = Math.floor(p.anim / 4) % 2 ? "runB" : "runA";
  // The star flashes between the usual colors and gold (slower as it runs out).
  const starOn = p.pw.star > 0 && p.dead === 0 && Math.floor(w.tick / (p.pw.star < 60 ? 6 : 3)) % 2 === 0;
  const set = starOn ? (p.big ? art.starBig : art.starPlayer) : p.big ? art.big : art.player;
  const img = set[frame]?.[p.facing > 0 ? 0 : 1] ?? null;
  const x = Math.round(p.x - cam);
  const y = Math.round(p.y) + sy;
  // Speed boost: streaks behind you while running.
  if (p.pw.zoom > 0 && Math.abs(p.vx) > 2.2 && p.dead === 0) {
    const bx = p.vx > 0 ? x - 6 : x + p.w + 1;
    rect(g, bx, y + p.h - 12, 5, 1, C.green);
    rect(g, bx + (p.vx > 0 ? 2 : -2), y + p.h - 8, 4, 1, C.green);
    rect(g, bx + (p.vx > 0 ? 1 : -1), y + p.h - 4, 3, 1, C.green);
  }
  // Wings on your back while double jump is on (flapping in the air).
  if (p.pw.wings > 0 && !p.climbing && p.dead === 0 && (p.pw.wings > 60 || w.tick % 4 < 2)) {
    const wf = !p.onGround && Math.floor(w.tick / 4) % 2 ? 1 : 0;
    const wimg = art.wing[wf][p.facing > 0 ? 0 : 1];
    const wx = p.facing > 0 ? x - 2 : x + p.w - 1;
    if (wimg) g.drawImage(wimg, wx, y + (p.big ? 10 : 7));
    else rect(g, wx, y + 8, 3, 3, C.ink);
  }
  if (img) g.drawImage(img, x, y);
  else rect(g, x, y, p.w, p.h, starOn ? C.yellow : C.pink);
  if (p.armor > 0 && !p.climbing) {
    const hm = art.helmet[p.facing > 0 ? 0 : 1];
    if (hm) g.drawImage(hm, x, y - 1);
    else rect(g, x + 1, y - 1, 8, 3, C.steel);
  }
}

function drawHud(ctx: GameContext, w: World, art: Art) {
  const g = ctx.g;
  const p = w.player;
  rect(g, 0, 0, VIEW_W, 10, C.bg);
  rect(g, 0, 10, VIEW_W, 1, "#2a1745");
  ctx.text(`SCORE ${String(Math.round(w.score)).padStart(6, "0")}`, 3, 3, C.ink);
  for (let i = 0; i < p.maxHearts; i++) {
    const img = i < p.hearts ? art.heart : art.heartEmpty;
    if (img) g.drawImage(img, 56 + i * 8, 2);
    else rect(g, 56 + i * 8, 2, 6, 5, i < p.hearts ? C.red : "#4a3d66");
  }
  let x = 56 + p.maxHearts * 8 + 2;
  if (p.armor > 0) {
    if (art.helmetIcon) g.drawImage(art.helmetIcon, x, 3);
    else rect(g, x, 3, 5, 3, C.steel);
    ctx.text(String(p.armor), x + 6, 3, C.cyan);
    x += 12;
  }
  if (art.headIcon) g.drawImage(art.headIcon, x + 2, 2);
  else rect(g, x + 2, 2, 6, 4, C.pink);
  ctx.text(`X${Math.max(0, p.lives)}`, x + 10, 3, C.pink);
  ctx.text(`FOES ${foesLeft(w)}`, 148, 3, C.yellow);
  if (art.ball) g.drawImage(art.ball, 192, 3);
  else rect(g, 192, 3, 4, 4, C.ink);
  ctx.text(String(p.shots), 198, 3, C.ink);
  // Perk timers: rapid, spread, power, ally.
  let px = 216;
  const timer = (on: boolean, letter: string, left: number, full: number, color: string) => {
    if (!on) return;
    ctx.text(letter, px, 3, color);
    rect(g, px + 4, 4, Math.max(1, Math.round((Math.min(left, full) / full) * 12)), 3, color);
    px += 19;
  };
  timer(p.rapidT > 0, "R", p.rapidT, 690, C.pink);
  timer(p.spreadT > 0, "S", p.spreadT, 690, C.purple);
  timer(p.big, "P", 1, 1, C.yellow);
  timer(w.ally.on, "A", w.ally.t, 1050, C.green);

  // Power-ups running: a strip under the HUD on the right, each with its icon and time left.
  let ux = VIEW_W - 2;
  for (const k of POWERS) {
    const left = p.pw[k];
    if (left <= 0) continue;
    ux -= 21;
    if (left < 60 && w.tick % 6 < 3) continue;
    rect(g, ux - 1, 12, 21, 9, C.bg);
    const icon = art.powerIcons[k];
    if (icon) g.drawImage(icon, ux, 13);
    else rect(g, ux, 13, 7, 7, POWER_COLOR[k]);
    rect(g, ux + 9, 16, 10, 2, "#2a1745");
    rect(g, ux + 9, 16, Math.max(1, Math.round((left / POWER_TICKS[k]) * 10)), 2, POWER_COLOR[k]);
  }

  // Bottom line: the foe you're about to meet (or just hit), by name.
  let best: Enemy | null = null;
  if (w.lastHit >= 0 && w.tick - w.lastHitT < 60 && w.enemies[w.lastHit]?.state === "alive") best = w.enemies[w.lastHit];
  else {
    let bd = 150;
    for (const e of w.enemies) {
      if (e.state !== "alive" || e.hidden) continue;
      const d = Math.abs(e.x + e.w / 2 - (p.x + p.w / 2));
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
  }
  if (best && w.phase === "play") {
    const name = `${best.label} ${best.mini ? "MINI" : ABILITY_WORD[best.ability]}${best.elite ? " ELITE" : ""}`;
    const wd = ctx.textWidth(name);
    const pips = best.hits + (best.shield ? 1 : 0);
    rect(g, 2, VIEW_H - 10, wd + 8 + pips * 4, 9, C.bg);
    iconAt(ctx, best.kind, 3, VIEW_H - 9, BODY[best.ability][0]);
    ctx.text(name, 13, VIEW_H - 7, BODY[best.ability][0]);
    for (let i = 0; i < pips; i++) rect(g, 15 + wd + i * 4, VIEW_H - 7, 3, 5, i < best.hits ? C.red : C.cyan);
  }

  // The level you're in, bottom right.
  const st = w.stages[w.stage];
  if (st && w.phase === "play") {
    const t = `${w.stage + 1}-${st.title}`;
    const tw = ctx.textWidth(t);
    rect(g, VIEW_W - tw - 4, VIEW_H - 10, tw + 4, 9, C.bg);
    ctx.text(t, VIEW_W - tw - 2, VIEW_H - 7, C.lilac);
  }

  // Banners.
  const titleOn = w.phase === "play" && w.stage > 0 && w.tick - w.stageT < TITLE_TICKS && p.dead === 0;
  if (w.phase === "ready") {
    stageTitle(ctx, w, 0, 26);
    banner(ctx, w.phaseT > READY_TICKS - 10 ? "GO!" : "READY", w.phaseT > READY_TICKS - 10 ? C.green : C.yellow, 3);
    const hint = "SPACE JUMP   X THROW";
    ctx.text(hint, Math.round(VIEW_W / 2 - ctx.textWidth(hint) / 2), 92, C.lilac);
  } else if (titleOn) stageTitle(ctx, w, w.stage, 40);
  else if (w.phase === "play" && w.tick < READY_TICKS + 20) banner(ctx, "GO!", C.green, 3);
  else if (w.phase === "goal" || (w.phase === "done" && w.won)) banner(ctx, "ALL TIDY!", C.green, 2);
  else if (w.phase === "over" || (w.phase === "done" && !w.won)) banner(ctx, "OUT OF LIVES", C.red, 2);
  else if (p.dead > 0 && p.lives > 0) banner(ctx, `${p.lives} LEFT`, C.pink, 2);
}

// ---------- helpers ----------

function rect(g: Ctx, x: number, y: number, w: number, h: number, color: string) {
  g.fillStyle = color;
  g.fillRect(Math.round(x), Math.round(y), w, h);
}

/** A file icon; a little page mark while it isn't loaded; a dust puff for filler (not a file). */
function iconAt(ctx: GameContext, kind: Parameters<GameContext["icon"]>[0] | null, x: number, y: number, fallback: string) {
  if (!kind) {
    rect(ctx.g, x + 1, y + 3, 6, 3, fallback);
    rect(ctx.g, x + 2, y + 2, 2, 1, fallback);
    rect(ctx.g, x + 4, y + 1, 2, 2, fallback);
    return;
  }
  const img = ctx.icon(kind);
  if (img) return ctx.g.drawImage(img, Math.round(x), Math.round(y));
  rect(ctx.g, x + 1, y, 5, 7, C.ink);
  rect(ctx.g, x + 2, y + 2, 3, 1, fallback);
  rect(ctx.g, x + 2, y + 4, 3, 1, fallback);
}

type Box = { x: number; y: number; w: number };

/** Where a label centred on cx goes: kept on screen and under the HUD. Fills `out`. */
function placeLabel(ctx: GameContext, s: string, cx: number, y: number, out: Box): Box {
  out.w = ctx.textWidth(s);
  out.x = Math.max(1, Math.min(VIEW_W - out.w - 1, Math.round(cx - out.w / 2)));
  out.y = Math.max(12, y);
  return out;
}

function drawLabel(ctx: GameContext, s: string, b: Box, color: string) {
  rect(ctx.g, b.x - 1, b.y - 1, b.w + 2, 7, C.bg);
  ctx.text(s, b.x, b.y, color);
}

const pickupBox: Box = { x: 0, y: 0, w: 0 };
const label = (ctx: GameContext, s: string, cx: number, y: number, color: string) => drawLabel(ctx, s, placeLabel(ctx, s, cx, y, pickupBox), color);

/** "LEVEL 2 - PHOTOS" and the theme's name under it. */
function stageTitle(ctx: GameContext, w: World, i: number, y: number) {
  const st = w.stages[i];
  if (!st) return;
  const head = `LEVEL ${i + 1} - ${st.title}`;
  const name = THEMES[st.theme].name;
  const hw = ctx.textWidth(head) * 2;
  const nw = ctx.textWidth(name);
  const bw = Math.max(hw, nw) + 10;
  const x = Math.round(VIEW_W / 2 - bw / 2);
  rect(ctx.g, x, y - 4, bw, 24, C.bg);
  rect(ctx.g, x, y + 19, bw, 1, C.lilac);
  ctx.text(head, Math.round(VIEW_W / 2 - hw / 2), y, C.ink, 2);
  ctx.text(name, Math.round(VIEW_W / 2 - nw / 2), y + 13, C.cyan);
}

function banner(ctx: GameContext, s: string, color: string, scale: number) {
  const wd = ctx.textWidth(s) * scale;
  const x = Math.round(VIEW_W / 2 - wd / 2);
  const y = 60;
  rect(ctx.g, x - 4, y - 4, wd + 8, 5 * scale + 8, C.bg);
  ctx.text(s, x, y, color, scale);
}
