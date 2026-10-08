import { describe, expect, it } from "vitest";
import { cast, levelFolders, seeded } from "../../round";
import { file, harness, nullContext, sampleRound } from "../../testing";
import type { ArcadeFile, ArcadeRound, Friend, GameContext, GameResult, Input, Perk } from "../../types";
import { game, type TidyHopGame } from "./index";
import { BASE, buildLevel, MAX_GAP, MAX_PLAT, MAX_STEP, SAFE_COL, sectionsFor, T, targetCols, THEME_IDS, THEMES, VIEW_W, type ThemeId } from "./level";
import {
  applyPerk, applyPower, blocked, camTarget, createWorld, die, FLASH_CYCLE, folderTitle, GOAL_PER_FOE, hitEnemy, hitsFor, hurtPlayer, JUMP_V, MAX_ACTIVE,
  MAX_SHOTS, MIN_FOES, POWER_LABEL, POWER_TICKS, POWERS, READY_TICKS, RUN_FAST, step, type Enemy, type World,
} from "./logic";

const round = (...files: ArcadeFile[]): ArcadeRound => ({ source: "Plan", files });
const empty = (): ArcadeRound => round();
const big = (): ArcadeRound => {
  const kinds = ["image", "pdf", "markdown", "audio", "video", "archive", "installer", "unknown", "xlsx", "json"] as const;
  return round(...Array.from({ length: 120 }, (_, i) => file(`file-${i}.dat`, kinds[i % kinds.length], 1000 * 3 ** (i % 12), i % 3 ? "trashed" : i % 2 ? "kept" : "deleted")));
};
/** One foe of each ability, so every behavior can be found. */
const zoo = () =>
  round(
    file("pic.jpg", "image", 50_000, "trashed"),
    file("doc.pdf", "pdf", 50_000, "trashed"),
    file("code.md", "markdown", 50_000, "trashed"),
    file("tune.mp3", "audio", 50_000, "trashed"),
    file("film.mp4", "video", 50_000, "trashed"),
    file("pack.zip", "archive", 50_000, "trashed"),
    file("setup.dmg", "diskImage", 50_000, "trashed"),
    file("blob.bin", "unknown", 50_000, "trashed"),
  );

function start(r: ArcadeRound = sampleRound(), seed = 1) {
  const t = harness(game, r, seed);
  return { t, w: (t.game as TidyHopGame).world };
}

/** Past READY, standing at the start. */
function playing(r: ArcadeRound = sampleRound(), seed = 1) {
  const g = start(r, seed);
  g.t.run(READY_TICKS + 1);
  expect(g.w.phase).toBe("play");
  return g;
}

const idle: Input = { held: () => false, pressed: () => false, pointerX: () => null, clicked: () => false, mouseHeld: () => false, pointerDX: () => 0, captured: () => false };
const holding = (...bs: string[]): Input => ({ held: (b) => bs.includes(b), pressed: () => false, pointerX: () => null, clicked: () => false, mouseHeld: () => false, pointerDX: () => 0, captured: () => false });
const ticks = (w: World, n: number, input: Input = idle) => {
  for (let i = 0; i < n; i++) step(w, input);
};
const friend = (perk: Perk, power = 5): Friend => ({ file: file(`${perk}.dat`, "unknown", 10, "kept"), label: perk, family: "other", perk, power });
const foeOf = (w: World, ability: string) => w.enemies.find((e) => e.ability === ability && !e.mini && e.state === "alive")!;

/** Put a foe on the flat start ground at x, facing dir, and make sure it's awake. */
function place(e: Enemy, x: number, dir: 1 | -1 = -1) {
  e.x = x;
  e.y = BASE * T - e.h;
  e.vy = 0;
  e.dir = dir;
  e.active = true;
}

/** Park every other foe far away so only the ones under test act. */
function isolate(w: World, ...keep: Enemy[]) {
  for (const e of w.enemies) if (!keep.includes(e)) e.state = "gone";
}

const snapshot = (w: World) =>
  JSON.stringify({
    p: w.player, e: w.enemies, s: w.slabs, b: w.blocks, k: w.pickups, c: w.coins, sh: w.shots, wv: w.waves,
    a: w.ally, score: w.score, tick: w.tick, d: w.defeated, col: w.collected, cam: w.cam, phase: w.phase,
  });

describe("tidy hop: casting", () => {
  it("module shape", () => {
    expect(game.id).toBe("tidy-hop");
    expect(game.title).toBe("Tidy Hop");
    expect(game.size[0] * game.size[1]).toBeLessThanOrEqual(320 * 180);
    expect(game.controls.length).toBeGreaterThan(0);
  });

  it("trashed files become critters whose toughness comes from file size", () => {
    const { w } = start();
    const c = cast(sampleRound());
    expect(w.enemies.length).toBe(Math.max(MIN_FOES, c.foes.length));
    expect(w.foesTotal).toBe(w.enemies.length);
    for (const e of w.enemies) {
      expect(e.hits).toBe(hitsFor(e.foe!));
      expect(e.label).toBe(e.foe!.label);
      expect(e.kind).toBe(e.foe!.file?.kind ?? null);
    }
    const byName = (n: string) => w.enemies.find((e) => e.foe?.file?.name === n)!;
    // A 300 MB disk image takes more stomps than a 1 KB file.
    expect(byName("setup.dmg").hits).toBeGreaterThan(byName("thing.bin").hits);
    expect(byName("thing.bin").hits).toBe(1);
    // Bigger never means weaker; elites take one more.
    for (let hp = 1; hp < 10; hp++) {
      const f = { file: null, label: "X", family: "other" as const, ability: "basic" as const, hp, elite: false };
      expect(hitsFor({ ...f, hp: hp + 1 })).toBeGreaterThanOrEqual(hitsFor(f));
      expect(hitsFor({ ...f, elite: true })).toBe(hitsFor(f) + 1);
    }
    expect(byName("backup.zip").elite).toBe(true);
    // Easier foes first along the level.
    const sorted = [...w.enemies].sort((a, b) => a.x - b.x);
    expect(sorted[0].foe!.hp).toBeLessThanOrEqual(sorted[sorted.length - 1].foe!.hp);
  });

  it("a tiny round is topped up with filler critters", () => {
    const { w } = start(round(file("one.txt", "text", 10, "trashed")));
    expect(w.enemies.length).toBe(MIN_FOES);
    expect(w.enemies.filter((e) => e.foe?.file).length).toBe(1);
    expect(w.enemies.filter((e) => !e.foe?.file).every((e) => e.hits === 1)).toBe(true);
  });

  it("kept files sit in item blocks, points files float; the level grows with the foes", () => {
    const { w } = start();
    const inBlocks = w.blocks.filter((b) => b.friend >= 0).map((b) => w.friends[b.friend].perk);
    expect(inBlocks.length).toBe(7);
    expect(inBlocks).not.toContain("points");
    expect(w.pickups.filter((k) => k.mode === "float" && k.friend >= 0).map((k) => w.friends[k.friend].perk)).toEqual(["points"]);
    expect(w.slabs.length).toBeGreaterThanOrEqual(3);
    const small = start(empty()).w.level.cols;
    expect(start(big()).w.level.cols).toBeGreaterThan(small * 1.5);
  });
});

describe("tidy hop: foe abilities", () => {
  it("flash: blinks out of sight now and then, and can't be hit while gone", () => {
    const { w } = playing(zoo());
    const e = foeOf(w, "flash");
    isolate(w, e);
    place(e, 120);
    const seen = new Set<boolean>();
    let missed = false;
    for (let i = 0; i < FLASH_CYCLE + 5; i++) {
      step(w, idle);
      seen.add(e.hidden);
      if (e.hidden && !missed) missed = !hitEnemy(w, e, 1, "shot");
    }
    expect(seen).toEqual(new Set([true, false]));
    expect(missed).toBe(true);
    expect(e.hits).toBe(e.maxHits);
  });

  it("shield: the first stomp knocks the shield off, then it takes damage", () => {
    const { w } = playing(zoo());
    const e = foeOf(w, "shield");
    expect(e.shield).toBe(true);
    hitEnemy(w, e, 1, "stomp");
    expect(e.shield).toBe(false);
    expect(e.hits).toBe(e.maxHits);
    hitEnemy(w, e, 1, "stomp");
    expect(e.hits).toBe(e.maxHits - 1);
  });

  it("teleport: blinks forward or back several tiles at once", () => {
    const { w } = playing(zoo());
    const e = foeOf(w, "teleport");
    isolate(w, e);
    place(e, 90);
    ticks(w, 2);
    e.cd = 1;
    const x0 = e.x;
    step(w, idle);
    expect(Math.abs(e.x - x0)).toBeGreaterThanOrEqual(23);
    expect(e.blink).toBeGreaterThan(0);
  });

  it("sonic: sends a slow sound wave at you that hurts", () => {
    const { w } = playing(zoo());
    const e = foeOf(w, "sonic");
    isolate(w, e);
    place(e, 110);
    ticks(w, 2);
    e.cd = 1;
    step(w, idle);
    expect(w.waves.length).toBe(1);
    expect(w.waves[0].vx).toBeLessThan(0);
    expect(Math.abs(w.waves[0].vx)).toBeLessThan(2);
    ticks(w, 90);
    expect(w.player.hearts).toBe(2);
  });

  it("fast: runs quickly and hops small gaps where a basic foe turns back", () => {
    const { w } = playing(zoo());
    const fast = foeOf(w, "fast");
    const basic = foeOf(w, "basic");
    expect(fast.speed).toBeGreaterThanOrEqual(basic.speed * 2.5);
    isolate(w, fast, basic);
    const lv = w.level;
    // A pit with open flat ground before it (so the basic foe has room to walk back).
    const flatBefore = (c: number) => [1, 2, 3, 4, 5, 6].every((k) => lv.ground[c - k] === BASE && !blocked(lv, (c - k) * T, (BASE - 3) * T, T, 3 * T));
    const gap = Array.from(lv.ground).findIndex((g, c) => g < 0 && flatBefore(c));
    expect(gap).toBeGreaterThan(0);
    let end = gap;
    while (lv.ground[end] < 0) end++;
    w.player.x = gap * T - 100;
    w.player.y = BASE * T - w.player.h;
    w.cam = camTarget(w);
    for (const e of [fast, basic]) place(e, gap * T - e.w - 4, 1);
    w.player.inv = 9999;
    ticks(w, 45);
    expect(fast.state).toBe("alive");
    expect(fast.x).toBeGreaterThan(end * T - 2);
    expect(basic.state).toBe("alive");
    expect(basic.x).toBeLessThan(gap * T);
    expect(basic.dir).toBe(-1);
  });

  it("split: breaks into two minis and counts as beaten when both are", () => {
    const { w } = playing(zoo());
    const e = foeOf(w, "split");
    const before = w.enemies.length;
    for (let i = 0; i < 10 && e.state === "alive"; i++) hitEnemy(w, e, 1, "shot");
    const minis = w.enemies.slice(before);
    expect(minis.length).toBe(2);
    expect(minis.every((m) => m.mini && m.label === e.label && m.kind === e.kind)).toBe(true);
    expect(w.defeated).toBe(0);
    hitEnemy(w, minis[0], 1, "shot");
    expect(w.defeated).toBe(0);
    hitEnemy(w, minis[1], 1, "shot");
    expect(w.defeated).toBe(1);
  });

  it("tank: big, slow and tough, and its stomp shakes the ground and bumps you", () => {
    const { w } = playing(zoo());
    const e = foeOf(w, "tank");
    const basic = foeOf(w, "basic");
    expect(e.w * e.h).toBeGreaterThan(basic.w * basic.h);
    expect(e.speed).toBeLessThan(basic.speed);
    expect(e.hits).toBeGreaterThan(basic.hits);
    isolate(w, e);
    place(e, 110);
    ticks(w, 2);
    expect(w.player.onGround).toBe(true);
    e.cd = 1;
    step(w, idle);
    expect(w.shake).toBeGreaterThan(0);
    expect(w.player.vy).toBeLessThan(0);
    expect(w.player.stun).toBeGreaterThan(0);
    expect(w.player.hearts).toBe(3);
  });

  it("basic: walks and turns at the edge of a platform instead of falling", () => {
    const { w } = playing(zoo());
    const e = foeOf(w, "basic");
    isolate(w, e);
    const lv = w.level;
    // Find a floating platform and stand the foe on it.
    // (Its height depends on the level's theme.)
    let pc = -1;
    let pr = BASE - 5;
    for (let c = 0; c < lv.cols && pc < 0; c++)
      for (let r = BASE - 6; r <= BASE - 4 && pc < 0; r++) if (lv.tiles[r * lv.cols + c] === 2 && lv.tiles[r * lv.cols + c + 1] === 2) [pc, pr] = [c, r];
    expect(pc).toBeGreaterThan(0);
    w.player.x = pc * T - 60;
    w.cam = camTarget(w);
    e.x = pc * T + 2;
    e.y = pr * T - e.h;
    e.dir = -1;
    e.active = true;
    w.player.inv = 9999;
    const dirs = new Set<number>();
    for (let i = 0; i < 200; i++) {
      step(w, idle);
      dirs.add(e.dir);
    }
    expect(dirs.size).toBe(2);
    expect(e.y + e.h).toBe(pr * T);
  });

  it("stomping hurts a foe; walking into one hurts you", () => {
    const { w } = playing(zoo());
    const e = foeOf(w, "basic");
    const t = foeOf(w, "tank");
    isolate(w, e);
    place(e, 60);
    const p = w.player;
    p.x = e.x + 2;
    p.y = e.y - p.h - 1;
    p.vy = 3;
    step(w, idle);
    expect(e.state).not.toBe("alive");
    expect(p.vy).toBeLessThan(0);
    expect(w.defeated).toBe(1);

    t.state = "alive";
    isolate(w, t);
    place(t, p.x + 4);
    p.y = BASE * T - p.h;
    p.vy = 0;
    p.inv = 0;
    step(w, idle);
    expect(p.hearts).toBe(2);
  });
});

describe("tidy hop: stomping under a block", () => {
  it("a stomp with no room above squeezes you out beside the foe, never into the block", () => {
    const { w } = playing(zoo());
    const e = foeOf(w, "tank");
    isolate(w, e);
    const b = w.blocks[0];
    const p = w.player;
    // A tank under an item block; you drop onto it with your head at the block's bottom.
    place(e, b.c * T - 3, 1);
    e.cd = 999;
    p.x = b.c * T + 3;
    p.y = (b.r + 2) * T;
    p.vy = 0.5;
    p.inv = 9999;
    w.cam = camTarget(w);
    const x0 = p.x;
    const hits = e.hits;
    let inside = 0;
    let minX = p.x;
    for (let i = 0; i < 60; i++) {
      step(w, holding("right"));
      if (blocked(w.level, p.x, p.y, p.w, p.h)) inside++;
      minX = Math.min(minX, p.x);
    }
    expect(e.hits).toBe(hits - 1);
    expect(inside).toBe(0);
    expect(minX).toBeGreaterThanOrEqual(x0);
    expect(p.x).toBeGreaterThan(e.x + e.w);
  });

  it("a stomp in the open still bounces you up on top of the foe", () => {
    const { w } = playing(zoo());
    const e = foeOf(w, "tank");
    isolate(w, e);
    place(e, 100);
    const p = w.player;
    p.x = e.x + 6;
    p.y = e.y - p.h - 1;
    p.vy = 3;
    step(w, idle);
    expect(p.vy).toBeLessThan(0);
    expect(p.y + p.h).toBeLessThanOrEqual(e.y);
  });
});

describe("tidy hop: perks", () => {
  it("health refills hearts (a big file adds a heart)", () => {
    const { w } = playing();
    w.player.hearts = 1;
    applyPerk(w, friend("health", 4));
    expect(w.player.hearts).toBe(3);
    applyPerk(w, friend("health", 9));
    expect(w.player.maxHearts).toBe(4);
    expect(w.collected).toBe(2);
  });

  it("armor is a helmet that takes a hit for you", () => {
    const { w } = playing();
    applyPerk(w, friend("armor", 3));
    expect(w.player.armor).toBe(1);
    hurtPlayer(w, 0);
    expect(w.player.armor).toBe(0);
    expect(w.player.hearts).toBe(3);
    applyPerk(w, friend("armor", 9));
    expect(w.player.armor).toBe(2);
  });

  it("ally: a helper walks ahead and bumps foes", () => {
    const { w } = playing(zoo());
    applyPerk(w, friend("ally", 8));
    expect(w.ally.on).toBe(true);
    expect(w.ally.dmg).toBe(2);
    const e = foeOf(w, "tank");
    isolate(w, e);
    place(e, 64);
    w.player.inv = 9999;
    ticks(w, 40);
    expect(e.hits).toBeLessThan(e.maxHits);
    expect(w.ally.x).toBeGreaterThan(w.player.x);
  });

  it("rapid: hold the throw button for a quick stream of paper balls", () => {
    const { w } = playing();
    const before = w.player.shots;
    applyPerk(w, friend("rapid", 6));
    expect(w.player.shots).toBe(before + 6);
    expect(w.player.rapidT).toBeGreaterThan(0);
    let thrown = 0;
    for (let i = 0; i < 30; i++) {
      const s = w.player.shots;
      step(w, holding("alt"));
      if (w.player.shots < s) thrown++;
    }
    expect(thrown).toBeGreaterThanOrEqual(5);
  });

  it("spread: each throw is three paper balls", () => {
    const { w } = playing();
    applyPerk(w, friend("spread", 5));
    step(w, { ...idle, pressed: (b) => b === "alt" });
    expect(w.shots.length).toBe(3);
    expect(new Set(w.shots.map((s) => s.vy)).size).toBe(3);
  });

  it("rapid + spread: every throw that costs a ball launches balls; a full sky waits and keeps the ammo", () => {
    const { w } = playing(empty());
    isolate(w);
    applyPerk(w, friend("rapid", 5));
    applyPerk(w, friend("spread", 5));
    w.player.shots = 60;
    let launched = 0;
    const push = w.shots.push.bind(w.shots);
    w.shots.push = (...b: World["shots"]) => ((launched += b.length), push(...b));
    let spent = 0;
    for (let i = 0; i < 120; i++) {
      const s = w.player.shots;
      launched = 0;
      step(w, holding("alt"));
      if (w.player.shots < s) {
        spent++;
        expect(launched).toBe(3);
      }
    }
    expect(spent).toBeGreaterThanOrEqual(20);
    // Every ball still flying: pressing throw does nothing and costs nothing.
    while (w.shots.length < MAX_SHOTS) w.shots.push({ x: w.player.x, y: 0, vx: 0, vy: 0, life: 45 });
    w.player.throwCd = 0;
    const s = w.player.shots;
    step(w, { ...idle, pressed: (b) => b === "alt" });
    expect(w.player.shots).toBe(s);
    expect(w.player.throwCd).toBe(0);
  });

  it("ammo: more paper balls, more for a bigger file", () => {
    const { w } = playing();
    const s0 = w.player.shots;
    applyPerk(w, friend("ammo", 1));
    const s1 = w.player.shots;
    applyPerk(w, friend("ammo", 10));
    expect(s1 - s0).toBeGreaterThan(0);
    expect(w.player.shots - s1).toBeGreaterThan(s1 - s0);
  });

  it("power: bigger, one hit of protection, stronger stomp", () => {
    const { w } = playing();
    const h = w.player.h;
    applyPerk(w, friend("power", 8));
    expect(w.player.big).toBe(true);
    expect(w.player.h).toBeGreaterThan(h);
    expect(w.player.stompDmg).toBe(3);
    hurtPlayer(w, 0);
    expect(w.player.big).toBe(false);
    expect(w.player.h).toBe(h);
    expect(w.player.hearts).toBe(3);
  });

  it("points: score, scaled by the file's size", () => {
    const { w } = playing();
    applyPerk(w, friend("points", 2));
    const a = w.score;
    applyPerk(w, friend("points", 9));
    expect(w.score - a).toBeGreaterThan(a);
  });

  it("bumping an item block from below lets its file out, and it flies to you", () => {
    const { w } = playing();
    const b = w.blocks.find((b) => b.friend >= 0)!;
    const p = w.player;
    p.x = b.c * T + 3;
    p.y = BASE * T - p.h;
    w.cam = camTarget(w);
    isolate(w);
    let hold: Input = holding("fire");
    for (let i = 0; i < 60 && w.collected === 0; i++) {
      step(w, hold);
      if (b.used) hold = idle;
    }
    expect(b.used).toBe(true);
    expect(w.collected).toBe(1);
  });
});

describe("tidy hop: slabs, ladders, jumping", () => {
  it("walking across a whole file slab drops it on the foes below", () => {
    const { w } = playing(zoo());
    const s = w.slabs[0];
    const e = foeOf(w, "tank");
    isolate(w, e);
    const p = w.player;
    p.x = s.x;
    p.y = s.y - p.h;
    p.onGround = true;
    w.cam = camTarget(w);
    place(e, s.x + 16);
    p.inv = 9999;
    let fell = false;
    for (let i = 0; i < 120 && e.state === "alive"; i++) {
      step(w, holding("right"));
      fell ||= s.state === "fall";
    }
    expect(fell).toBe(true);
    expect(e.how).toBe("squash");
    expect(w.defeated).toBe(1);
    ticks(w, 30);
    expect(s.state).toBe("landed");
    expect(s.y + 7).toBe(BASE * T);
  });

  it("a slab only drops once every part of it has been walked on", () => {
    const { w } = playing();
    const s = w.slabs[0];
    const p = w.player;
    isolate(w);
    p.x = s.x;
    p.y = s.y - p.h;
    w.cam = camTarget(w);
    ticks(w, 5);
    expect(s.count).toBeGreaterThan(0);
    expect(s.count).toBeLessThan(s.len);
    expect(s.state).toBe("rest");
  });

  it("ladders climb up to a platform and back down", () => {
    const { w } = playing();
    isolate(w);
    const lv = w.level;
    let lc = -1;
    for (let c = 0; c < lv.cols && lc < 0; c++) if (lv.tiles[(BASE - 1) * lv.cols + c] === 3) lc = c;
    expect(lc).toBeGreaterThan(0);
    let top = BASE - 1;
    while (lv.tiles[(top - 1) * lv.cols + lc] === 3) top--;
    const p = w.player;
    p.x = lc * T;
    p.y = BASE * T - p.h;
    w.cam = camTarget(w);
    ticks(w, 60, holding("up"));
    expect(p.climbing).toBe(false);
    expect(p.onGround).toBe(true);
    expect(p.y + p.h).toBe(top * T);
    ticks(w, 60, holding("down"));
    expect(p.y + p.h).toBe(BASE * T);
  });

  it("holding jump goes higher than a tap", () => {
    const apex = (holdFor: number) => {
      const { w } = playing();
      isolate(w);
      const y0 = w.player.y;
      let top = y0;
      for (let i = 0; i < 40; i++) {
        step(w, i < holdFor ? holding("fire") : idle);
        top = Math.min(top, w.player.y);
      }
      return y0 - top;
    };
    expect(apex(1)).toBeGreaterThan(25);
    expect(apex(20)).toBeGreaterThan(apex(1) + 20);
    // High enough to reach the floating platforms (40 px up).
    expect(apex(20)).toBeGreaterThan(5 * T + 4);
    expect(JUMP_V).toBeGreaterThan(0);
  });

  it("no pit in the first stretch, and holding right + jump loses no life in the first ten seconds", () => {
    for (const n of [0, 10, 24, 48])
      for (let seed = 1; seed <= 40; seed++) {
        const lv = buildLevel(n, 4, seeded(seed));
        expect(Array.from(lv.ground).findIndex((g) => g < 0)).toBeGreaterThanOrEqual(SAFE_COL);
      }
    for (const r of [sampleRound(), empty(), big()])
      for (let seed = 1; seed <= 10; seed++) {
        const { t, w } = start(r, seed);
        t.run(READY_TICKS + 300, ["right", "fire"]);
        expect(w.player.lives).toBe(3);
      }
  });

  it("even a small round's level takes over 40 s at a flat-out run", () => {
    for (const r of [empty(), round(file("one.txt", "text", 10, "trashed")), sampleRound()]) {
      const { w } = start(r);
      expect((w.goalX - w.player.x) / 2 / 30).toBeGreaterThan(40);
    }
  });

  it("no damage during READY", () => {
    const { w } = start(zoo());
    const e = foeOf(w, "basic");
    place(e, w.player.x);
    ticks(w, READY_TICKS - 2);
    expect(w.player.hearts).toBe(3);
    expect(w.phase).toBe("ready");
  });
});

describe("tidy hop: endings", () => {
  it("reaching the flag wins, with every foe counted once", () => {
    const { t, w } = playing();
    for (let guard = 0; guard < 50 && w.enemies.some((e) => e.state === "alive"); guard++)
      for (const e of w.enemies) if (e.state === "alive") hitEnemy(w, e, 99, "shot");
    expect(w.defeated).toBe(w.foesTotal);
    const p = w.player;
    p.x = w.goalX - 40;
    p.y = BASE * T - p.h;
    w.cam = camTarget(w);
    const r = t.run(200, ["right"]);
    expect(r).not.toBeNull();
    expect(r!.won).toBe(true);
    expect(r!.defeated).toBe(r!.foes);
    expect(r!.foes).toBe(w.foesTotal);
    expect(r!.score).toBeGreaterThan(500);
  });

  it("the flag wins even with foes left; defeated counts only the beaten ones", () => {
    const { t, w } = playing();
    hitEnemy(w, w.enemies[0], 99, "shot");
    w.player.x = w.goalX - 30;
    w.cam = camTarget(w);
    const r = t.run(200, ["right"])!;
    expect(r.won).toBe(true);
    expect(r.defeated).toBe(1);
  });

  it("the flag pays a bonus for every foe beaten", () => {
    const goal = (beaten: number) => {
      const { t, w } = playing();
      isolate(w);
      w.defeated = beaten;
      w.player.x = w.goalX - 30;
      w.cam = camTarget(w);
      w.score = 0;
      return t.run(200, ["right"])!.score;
    };
    expect(goal(4) - goal(0)).toBe(4 * GOAL_PER_FOE);
  });

  it("running out of lives loses", () => {
    const { t, w } = playing();
    isolate(w);
    const lv = w.level;
    const gap = Array.from(lv.ground).findIndex((g) => g < 0);
    w.player.lives = 1;
    w.player.x = gap * T + 1;
    w.player.y = 60;
    w.player.vx = 0;
    const r = t.run(300);
    expect(r).not.toBeNull();
    expect(r!.won).toBe(false);
    expect(r!.defeated).toBeLessThanOrEqual(r!.foes);
  });

  it("hurt three times without armor loses a life and respawns at a checkpoint", () => {
    const { w } = playing();
    for (let i = 0; i < 3; i++) {
      w.player.inv = 0;
      hurtPlayer(w, 0);
    }
    expect(w.player.lives).toBe(2);
    ticks(w, 60);
    expect(w.player.dead).toBe(0);
    expect(w.player.hearts).toBe(3);
    expect(w.phase).toBe("play");
  });

  it("end() is called once; after it, update and draw change nothing", () => {
    const { t, w } = playing();
    w.player.x = w.goalX - 20;
    expect(t.run(200, ["right"])).not.toBeNull();
    const snap = snapshot(w);
    expect(() => {
      for (let i = 0; i < 100; i++) {
        t.game.update(1 / 30);
        t.game.draw();
      }
    }).not.toThrow();
    expect(snapshot(w)).toBe(snap);
  });
});

describe("tidy hop: robustness", () => {
  for (const [name, r] of [["empty", empty()], ["one", round(file("one.txt", "text", 10, "trashed"))], ["big", big()], ["friends only", round(file("a.jpg", "image", 10, "kept"))]] as const) {
    it(`${name} round runs 600 ticks without throwing`, () => {
      const { t, w } = start(r);
      expect(() => {
        t.run(150, ["right", "fire"], 3);
        t.run(150, ["left", "alt"], 3);
        t.run(150, ["up", "down", "fire"], 3);
        t.run(150, ["right", "alt", "fire"], 3);
      }).not.toThrow();
      // Minis from a split can join the awake foes on top of the cap.
      expect(w.enemies.filter((e) => e.active && e.state === "alive" && !e.mini).length).toBeLessThanOrEqual(MAX_ACTIVE);
      expect(w.shots.length).toBeLessThanOrEqual(MAX_SHOTS);
      const res = t.result();
      if (res) expect(res.defeated).toBeLessThanOrEqual(res.foes);
    });
  }

  it("a big round caps foes and friends and still builds a full level", () => {
    const { w } = start(big());
    expect(w.enemies.length).toBe(48);
    expect(w.friends.length).toBeLessThanOrEqual(32);
    expect(w.level.cols * T).toBeGreaterThan(VIEW_W * 10);
    // Every friend is somewhere: a block or a floating pickup.
    const placed = w.blocks.filter((b) => b.friend >= 0).length + w.pickups.filter((k) => k.friend >= 0).length;
    expect(placed).toBe(w.friends.length);
  });

  it("same seed, same game; another seed, another level", () => {
    const play = (seed: number) => {
      const { t, w } = start(sampleRound(), seed);
      t.run(200, ["right", "fire"]);
      t.run(100, ["left", "alt"]);
      t.run(200, ["right"]);
      return w;
    };
    expect(snapshot(play(7))).toBe(snapshot(play(7)));
    expect(Array.from(play(7).level.tiles)).not.toEqual(Array.from(play(8).level.tiles));
  });

  it("draws file icons and labels for nearby foes and pickups", () => {
    const texts: string[] = [];
    const icons: string[] = [];
    const t = harness(game, sampleRound());
    const ctx = t.ctx as GameContext & { text: GameContext["text"]; icon: GameContext["icon"] };
    Object.assign(ctx, {
      g: nullContext(),
      text: (s: string) => void texts.push(s),
      icon: (k: string) => (icons.push(k), null),
    });
    const w = (t.game as TidyHopGame).world;
    t.run(READY_TICKS + 1);
    const e = w.enemies.find((e) => e.foe?.file)!;
    e.x = w.player.x + 30;
    e.y = BASE * T - e.h;
    e.active = true;
    t.game.draw();
    expect(texts).toContain(e.label);
    expect(icons).toContain(e.kind);
    expect(texts.some((s) => s.startsWith("SCORE"))).toBe(true);
    expect(texts.some((s) => s.startsWith("FOES"))).toBe(true);
  });

  it("labels never pile up: a split pair shows its file's name once", () => {
    const texts: string[] = [];
    const t = harness(game, zoo());
    Object.assign(t.ctx, { g: nullContext(), text: (s: string) => void texts.push(s) });
    const w = (t.game as TidyHopGame).world;
    t.run(READY_TICKS + 1);
    const e = foeOf(w, "split");
    const other = foeOf(w, "basic");
    isolate(w, e, other);
    w.player.x = 150;
    w.cam = camTarget(w);
    place(e, 180);
    place(other, 110);
    for (let i = 0; i < 10 && e.state === "alive"; i++) hitEnemy(w, e, 1, "shot");
    expect(w.enemies.filter((m) => m.mini && m.state === "alive").length).toBe(2);
    texts.length = 0;
    t.game.draw();
    expect(texts.filter((s) => s === e.label).length).toBe(1);
    // A foe further off with its own space still gets its label.
    expect(texts).toContain(other.label);
  });

  it("uses only the round's rng and no timers or clocks", () => {
    const sources = import.meta.glob(["./*.ts", "!./*.test.ts"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    expect(Object.keys(sources).length).toBeGreaterThanOrEqual(5);
    for (const [f, src] of Object.entries(sources)) {
      for (const bad of ["Math.random", "Date.now", "performance.now", "setTimeout", "setInterval", "requestAnimationFrame", "addEventListener", "shadowBlur", "getImageData", "filter ="])
        expect(src.includes(bad), `${f} uses ${bad}`).toBe(false);
    }
  });
});

// ---------- power-ups, levels and themes ----------

/** A world with every level forced to one theme (or picked by the rng when `themes` is empty). */
function themed(r: ArcadeRound, seed: number, themes: ThemeId[]) {
  let res: GameResult | null = null;
  const w = createWorld({ cast: cast(r), rng: seeded(seed), sfx: () => {}, end: (x) => void (res = x), folders: levelFolders(r) }, themes);
  return { w, result: () => res };
}

const input = (held: string[], pressed: string[] = []): Input => ({ ...idle, held: (b) => held.includes(b), pressed: (b) => pressed.includes(b) });

/**
 * A simple bot that only runs right and jumps at pits, walls and when stuck.
 * It checks the ground, not the fighting: the foes (and power-ups, a speed
 * boost makes its full-height jumps too long) are cleared away first, but
 * pits still count, and it has to get across every one of them.
 */
function runBot(w: World, limit = 9000) {
  const lv = w.level;
  isolate(w);
  w.pickups = w.pickups.filter((k) => !k.power);
  for (const b of w.blocks) b.power = null;
  let jumpT = 0;
  let bestX = 0;
  let stuck = 0;
  for (let i = 0; i < limit && w.phase !== "done"; i++) {
    const p = w.player;
    if (w.phase === "play" && p.onGround && jumpT === 0) {
      const col = Math.floor((p.x + p.w + 6) / T);
      // A pit just ahead (off the end of a platform it just walks down).
      const pit = lv.ground[col] < 0 && p.y + p.h >= lv.ground[col - 1] * T - 1;
      const wall = [1, 6].some((dx) => blocked(lv, p.x + p.w + dx - 1, p.y + p.h - 4, 1, 3));
      if (pit || wall || stuck > 20) jumpT = 16;
    }
    step(w, input(jumpT > 0 ? ["right", "fire"] : ["right"]));
    if (jumpT > 0) jumpT--;
    if (p.x > bestX + 0.5) {
      bestX = p.x;
      stuck = 0;
    } else stuck++;
  }
}

describe("tidy hop: levels and themes", () => {
  it("the strip is cut into levels, each titled after one of the round's folders (cycled)", () => {
    const { w } = start(sampleRound());
    expect(w.stages.length).toBe(sectionsFor(targetCols(w.foesTotal)));
    expect(w.stages.map((s) => s.title)).toEqual(["DOWNLOADS", "PHOTOS", "WORK", "MUSIC", "DOWNLOADS"].slice(0, w.stages.length));
    // A round with one folder repeats it; a round with none gets a stand-in.
    const one = start({ ...round(file("a.txt", "text", 10, "trashed")), folders: ["Desktop"] }).w;
    expect(new Set(one.stages.map((s) => s.title))).toEqual(new Set(["DESKTOP"]));
    expect(start(empty()).w.stages[0].title).toBe("FILES");
    expect(folderTitle("my very long folder name!")).toBe("MY VERY LONG .");
    // Each level after the first starts at a checkpoint.
    expect(w.checkpoints.map((c) => c.x)).toEqual(w.stages.slice(1).map((s) => s.x + 4));
  });

  it("the title shows at READY and again when you walk into the next level", () => {
    const texts: string[] = [];
    const t = harness(game, sampleRound());
    Object.assign(t.ctx, { g: nullContext(), text: (s: string) => void texts.push(s) });
    const w = (t.game as TidyHopGame).world;
    t.game.draw();
    expect(texts).toContain("LEVEL 1 - DOWNLOADS");
    expect(texts).toContain(THEMES[w.stages[0].theme].name);
    t.run(READY_TICKS + 1);
    isolate(w);
    w.player.x = w.stages[1].x + 2;
    w.cam = camTarget(w);
    step(w, idle);
    expect(w.stage).toBe(1);
    texts.length = 0;
    t.game.draw();
    expect(texts).toContain("LEVEL 2 - PHOTOS");
    expect(texts).toContain(`2-PHOTOS`);
  });

  it("themes are picked at random, never the same twice in a row, and every theme turns up", () => {
    const seen = new Set<ThemeId>();
    for (let seed = 1; seed <= 40; seed++) {
      const lv = buildLevel(20, 4, seeded(seed));
      lv.sections.forEach((s, i) => {
        seen.add(s.theme);
        if (i > 0) expect(s.theme).not.toBe(lv.sections[i - 1].theme);
      });
    }
    expect([...seen].sort()).toEqual([...THEME_IDS].sort());
    expect(THEME_IDS.length).toBeGreaterThanOrEqual(4);
  });

  for (const id of THEME_IDS) {
    it(`${id}: every pit, step and platform is in reach, and the start is safe`, () => {
      for (const n of [0, 24, 48])
        for (let seed = 1; seed <= 25; seed++) {
          const lv = buildLevel(n, 4, seeded(seed), [id]);
          expect(lv.sections.every((s) => s.theme === id)).toBe(true);
          const ground = Array.from(lv.ground);
          expect(ground.findIndex((g) => g < 0)).toBeGreaterThanOrEqual(SAFE_COL);
          let run = 0;
          for (let c = 1; c < lv.cols; c++) {
            if (ground[c] < 0) {
              run++;
              expect(run).toBeLessThanOrEqual(MAX_GAP);
            } else {
              run = 0;
              // Steps up are never taller than MAX_STEP (dropping down is fine).
              if (ground[c - 1] >= 0) expect(ground[c - 1] - ground[c]).toBeLessThanOrEqual(MAX_STEP);
            }
          }
          // Every platform tile has the ground or another platform at most MAX_PLAT rows under it.
          for (let c = 0; c < lv.cols; c++)
            for (let r = 0; r < BASE; r++) {
              if (lv.tiles[r * lv.cols + c] !== 2) continue;
              expect(r).toBeGreaterThanOrEqual(4);
              let ok = lv.ground[c] >= 0 && lv.ground[c] - r <= MAX_PLAT;
              for (let dc = -3; dc <= 3 && !ok; dc++)
                for (let rr = r + 1; rr <= r + MAX_PLAT && !ok; rr++) ok = lv.tiles[rr * lv.cols + c + dc] === 2;
              expect(ok).toBe(true);
            }
          // Levels open on solid ground (their checkpoint stands there).
          for (const s of lv.sections) expect(lv.ground[s.col]).toBeGreaterThanOrEqual(0);
        }
    });

    it(`${id}: a run-and-jump bot gets from the start to the flag without falling in a pit`, () => {
      for (const [r, seeds] of [[sampleRound(), [1, 2, 3]], [big(), [4]], [empty(), [5]]] as const)
        for (const seed of seeds) {
          const { w, result } = themed(r, seed, [id]);
          runBot(w);
          expect(result()?.won, `${id} seed ${seed}`).toBe(true);
          expect(w.player.lives, `${id} seed ${seed}`).toBe(3);
        }
    });
  }

  it("a level with rng-picked themes is beatable too", () => {
    for (let seed = 1; seed <= 6; seed++) {
      const { w, result } = themed(sampleRound(), seed, []);
      runBot(w);
      expect(result()?.won).toBe(true);
      expect(w.player.lives).toBe(3);
    }
  });

  it("themes change the layout a little: pit widths, pit counts, platform heights, ground steps", () => {
    const stats = (id: ThemeId) => {
      let pits = 0, wide = 0, cols = 0, highPlat = 0, step3 = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const lv = buildLevel(30, 4, seeded(seed), [id]);
        cols += lv.cols;
        // (Up to the stairs before the flag, which are the same everywhere.)
        for (let c = 1; c < lv.goalCol - 20; c++) {
          if (lv.ground[c] < 0 && lv.ground[c - 1] >= 0) {
            pits++;
            if (lv.ground[c + 2] < 0) wide++;
          }
          if (lv.ground[c] === BASE - 3) step3++;
          if (lv.tiles[(BASE - 6) * lv.cols + c] === 2) highPlat++;
        }
      }
      return { pitsPer1000: (pits / cols) * 1000, wide, highPlat, step3 };
    };
    const garden = stats("garden");
    const dunes = stats("dunes");
    const server = stats("server");
    const stacks = stats("stacks");
    expect(dunes.pitsPer1000).toBeGreaterThan(garden.pitsPer1000);
    expect(garden.wide).toBe(0);
    expect(server.wide).toBeGreaterThan(0);
    expect(stacks.highPlat).toBe(0);
    expect(server.highPlat).toBeGreaterThan(0);
    expect(stacks.step3).toBe(0);
    expect(dunes.step3).toBeGreaterThan(0);
  });
});

describe("tidy hop: power-ups", () => {
  it("power-ups wait in some blocks and float once in each level, every kind turning up", () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 6; seed++) {
      const { w } = start(sampleRound(), seed);
      const floating = w.pickups.filter((k) => k.power);
      expect(floating.length).toBe(w.stages.length);
      for (const k of floating) kinds.add(k.power!);
      for (const b of w.blocks) {
        expect(b.friend >= 0 && b.power !== null).toBe(false);
        if (b.power) kinds.add(b.power);
      }
    }
    expect([...kinds].sort()).toEqual([...POWERS].sort());
  });

  it("a power block pops its power-up, which flies to you, says what it is, and shows on the HUD", () => {
    const { t, w } = playing();
    const b = w.blocks.find((b) => b.friend < 0)!;
    b.power = "magnet";
    const p = w.player;
    p.x = b.c * T + 3;
    p.y = BASE * T - p.h;
    w.cam = camTarget(w);
    isolate(w);
    let hold: Input = holding("fire");
    for (let i = 0; i < 60 && p.pw.magnet === 0; i++) {
      step(w, hold);
      if (b.used) hold = idle;
    }
    expect(p.pw.magnet).toBeGreaterThan(0);
    expect(w.popups.map((q) => q.text)).toContain(POWER_LABEL.magnet);
    expect(w.collected).toBe(0);
    const texts: string[] = [];
    Object.assign(t.ctx, { g: nullContext(), text: (s: string) => void texts.push(s) });
    t.game.draw();
    expect(texts).toContain("MAGNET");
  });

  it("every power-up runs out after a while", () => {
    const { w } = playing();
    isolate(w);
    for (const k of POWERS) applyPower(w, k);
    ticks(w, Math.max(...Object.values(POWER_TICKS)) + 1);
    for (const k of POWERS) expect(w.player.pw[k]).toBe(0);
  });

  it("double jump: one more jump in mid-air, and it goes higher", () => {
    const apex = (wings: boolean) => {
      const { w } = playing();
      isolate(w);
      if (wings) applyPower(w, "wings");
      const y0 = w.player.y;
      let top = y0;
      for (let i = 0; i < 60; i++) {
        // Jump, let go, then tap jump again on the way up.
        step(w, i < 12 ? holding("fire") : i === 16 ? input(["fire"], ["fire"]) : idle);
        top = Math.min(top, w.player.y);
      }
      return { rise: y0 - top, w };
    };
    const plain = apex(false);
    const winged = apex(true);
    expect(winged.rise).toBeGreaterThan(plain.rise + 20);
    expect(winged.w.player.airJumps).toBe(1); // back on the ground: ready again
  });

  it("star: foes you touch are beaten and can't hurt you; sound waves too", () => {
    const { w } = playing(zoo());
    const e = foeOf(w, "tank");
    const s = foeOf(w, "shield");
    isolate(w, e, s);
    applyPower(w, "star");
    place(e, w.player.x + 4);
    place(s, w.player.x + 40);
    ticks(w, 40, holding("right"));
    expect(e.state).not.toBe("alive");
    expect(s.state).not.toBe("alive");
    expect(w.defeated).toBe(2);
    expect(w.player.hearts).toBe(3);
    w.waves.push({ x: w.player.x, y: w.player.y + 2, vx: 0, life: 50 });
    step(w, idle);
    expect(w.player.hearts).toBe(3);
  });

  it("magnet: coins in reach fly to you", () => {
    const { w } = playing();
    isolate(w);
    const p = w.player;
    for (const c of w.coins) c.taken = true;
    w.coins.push({ x: p.x + 60, y: p.y - 10, taken: false }, { x: p.x + 160, y: p.y - 10, taken: false });
    ticks(w, 40);
    expect(w.coins.at(-2)!.taken).toBe(false);
    applyPower(w, "magnet");
    const s0 = w.score;
    ticks(w, 40);
    expect(w.coins.at(-2)!.taken).toBe(true);
    expect(w.coins.at(-1)!.taken).toBe(false);
    expect(w.score).toBeGreaterThan(s0);
  });

  it("speed up: you run faster", () => {
    const top = (zoom: boolean) => {
      const { w } = playing();
      isolate(w);
      if (zoom) applyPower(w, "zoom");
      ticks(w, 20, holding("right"));
      return w.player.vx;
    };
    expect(top(false)).toBe(2);
    expect(top(true)).toBe(RUN_FAST);
  });

  it("losing a life ends every power-up", () => {
    const { w } = playing();
    isolate(w);
    for (const k of POWERS) applyPower(w, k);
    die(w, true);
    ticks(w, 40);
    expect(w.player.dead).toBe(0);
    for (const k of POWERS) expect(w.player.pw[k]).toBe(0);
  });

  it("an elite foe sometimes leaves a power-up behind", () => {
    let drops = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const { w } = playing(sampleRound(), seed);
      const e = w.enemies.find((e) => e.elite && e.ability !== "split")!;
      const before = w.pickups.length;
      e.shield = false;
      hitEnemy(w, e, 99, "shot");
      if (w.pickups.length > before) {
        drops++;
        expect(w.pickups.at(-1)!.power).not.toBeNull();
      }
    }
    expect(drops).toBeGreaterThan(0);
    expect(drops).toBeLessThan(12);
  });

  it("kept files say what they gave you too", () => {
    const { w } = playing();
    applyPerk(w, friend("armor", 3));
    expect(w.popups.at(-1)!.text).toBe("HELMET");
    applyPerk(w, friend("points", 3));
    expect(w.popups.at(-1)!.text).toBe("+300");
  });
});
