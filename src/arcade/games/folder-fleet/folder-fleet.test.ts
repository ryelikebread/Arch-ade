import { describe, expect, it, vi } from "vitest";
import { cast, strength } from "../../round";
import { file, harness, nullContext, sampleRound } from "../../testing";
import type { ArcadeRound, Button, Cast, Foe, Friend } from "../../types";
import { game, type FleetGame } from ".";
import { applyPerk, bossHits, buildWaves, CLOAK, damage, hitsFor, look, lunging, METER_MAX, MIN_FOES, newWorld, READY_TICKS, shieldFor, step, targetable, type Ship, type World } from "./logic";
import { _gridsForTest } from "./sprites";

const world = (t: { game: unknown }) => (t.game as FleetGame).world;
const rng = (seed = 3) => {
  let a = seed;
  return () => ((a = (a * 16807) % 2147483647) / 2147483647);
};
const noInput = { held: () => false, pressed: () => false, pointerX: () => null, clicked: () => false, mouseHeld: () => false, pointerDX: () => 0, captured: () => false };

const bigRound = (): ArcadeRound => {
  const kinds = ["image", "pdf", "markdown", "audio", "video", "archive", "installer", "unknown", "xlsx", "json"] as const;
  return {
    source: "Plan",
    files: Array.from({ length: 120 }, (_, i) => file(`file-${i}.dat`, kinds[i % kinds.length], 1000 * 3 ** (i % 12), i % 3 ? "trashed" : i % 2 ? "kept" : "deleted")),
  };
};
const empty: ArcadeRound = { source: "Plan", files: [] };
/** Lots of kept files and only a few trashed: more friends than ships to carry them. */
const keepers = (): ArcadeRound => ({
  source: "Plan",
  files: [
    ...Array.from({ length: 40 }, (_, i) => file(`keep-${i}.png`, "image", 2000 * (i + 1), "kept")),
    ...Array.from({ length: 5 }, (_, i) => file(`junk-${i}.txt`, "text", 5000 * (i + 1), "trashed")),
  ],
});
/** Both caps: 48 foes and 32 friends. */
const maxed = (): ArcadeRound => ({
  source: "Plan",
  files: [
    ...Array.from({ length: 60 }, (_, i) => file(`keep-${i}.zip`, "archive", 9000 * (i + 1), "kept")),
    ...Array.from({ length: 60 }, (_, i) => file(`junk-${i}.mp4`, "video", 5000 * (i + 1) ** 2, i % 4 ? "trashed" : "deleted")),
  ],
});

const foe = (ability: Foe["ability"], hp = 4, elite = false): Foe => ({ file: file(`x-${ability}`, "unknown", 1, "trashed"), label: ability.toUpperCase(), family: "other", ability, hp, elite });
const friend = (perk: Friend["perk"], power = 5): Friend => ({ file: file(`k-${perk}`, "unknown", 1, "kept"), label: perk.toUpperCase(), family: "other", perk, power });

/** A world past READY whose first wave is the given foes, all in formation. */
function formed(foes: Foe[], seed = 3): { w: World; r: () => number } {
  const r = rng(seed);
  // tough plain foes fill the rest, so the ones under test are in the first wave
  const rest = Array.from({ length: MIN_FOES - 1 - foes.length }, () => foe("basic", 10));
  const c: Cast = { foes: [foe("basic", 10), ...foes, ...rest], friends: [], benched: 0 };
  const w = newWorld(c, r);
  for (let i = 0; i < 260; i++) step(w, noInput, r);
  return { w, r };
}
/** One tick with a player that can't be hurt (so a test isn't cut short by a game over). */
const safeStep = (w: World, r: () => number) => {
  w.player.invuln = 5;
  step(w, noInput, r);
};
const shipOf = (w: World, ability: Foe["ability"]) => w.ships.find((s) => s.on && s.kind === "ship" && s.ability === ability)!;

/** An autopilot that plays like a careful casual player: line up, dodge, grab capsules. */
function autopilot(w: World): Button[] {
  const p = w.player;
  const out: Button[] = ["fire"];
  let ty = p.y;
  let tx = 46;
  let best = Infinity;
  for (const s of w.ships) {
    if (!targetable(s) || s.x < p.x) continue;
    const d = Math.abs(s.y - p.y) + (s.x - p.x) * 0.2;
    if (d < best) (best = d), (ty = s.y);
  }
  for (const c of w.capsules) if (c.on && c.x > p.x - 10 && Math.abs(c.x - p.x) < 90) (ty = c.y), (tx = Math.min(140, c.x));
  // dodge whatever is coming close
  let threat = 0;
  for (const b of w.foeShots) if (b.on && b.x > p.x - 6 && b.x - p.x < 36 && Math.abs(b.y - p.y) < 10) threat += b.y > p.y ? -1 : 1;
  for (const s of w.ships)
    if (s.on && s.state !== "formation" && s.x > p.x - 8 && s.x - p.x < 50 && Math.abs(s.y - p.y) < s.h / 2 + 8) threat += s.y > p.y ? -1 : 1;
  for (const r of w.rings) if (r.on && Math.abs(Math.hypot(p.x - r.x, p.y - r.y) - r.r) < 10) threat += r.y > p.y ? -1 : 1;
  // out of the fast boss's marked lane
  for (const s of w.ships) if (s.on && lunging(s) && Math.abs(s.y - p.y) < 26) threat += s.y > p.y ? -2 : 2;
  if (threat) ty = p.y + (threat > 0 ? 20 : -20);
  if (ty < p.y - 2) out.push("up");
  if (ty > p.y + 2) out.push("down");
  if (tx < p.x - 3) out.push("left");
  if (tx > p.x + 3) out.push("right");
  if (w.meter >= METER_MAX) out.push("alt");
  return out;
}

function autoplay(round: ArcadeRound, seed: number, ticks = 9000) {
  const t = harness(game, round, seed);
  const w = world(t);
  let n = 0;
  while (!t.result() && n < ticks) {
    t.run(1, autopilot(w));
    n++;
  }
  return { r: t.result(), ticks: n, w };
}

describe("folder fleet", () => {
  it("module looks right", () => {
    expect(game.id).toBe("folder-fleet");
    expect(game.title).toBe("Folder Fleet");
    expect(game.size[0] * game.size[1]).toBeLessThanOrEqual(320 * 180);
    for (const rows of Object.values(_gridsForTest)) expect(new Set(rows.map((r) => r.length)).size).toBe(1);
  });

  it("foes become ships with hits from file size; the biggest is the boss", () => {
    const t = harness(game, sampleRound());
    const w = world(t);
    const c = cast(sampleRound());
    expect(w.boss).toEqual(c.foes[0]);
    expect(w.foes).toBe(Math.max(MIN_FOES, c.foes.length));
    const ships = w.ships.filter((s) => s.foe.file);
    expect(ships.length).toBeGreaterThan(0);
    for (const s of ships) expect(s.maxHp).toBe(hitsFor(s.foe));
    // bigger file, more hits
    expect(hitsFor(foe("basic", 9))).toBeGreaterThan(hitsFor(foe("basic", 2)));
    // even the smallest file (and filler) takes two hits
    expect(hitsFor(foe("basic", 1))).toBe(2);
    expect(hitsFor(foe("basic", 4, true))).toBeGreaterThan(hitsFor(foe("basic", 4)));
    expect(hitsFor(foe("tank", 4))).toBeGreaterThan(hitsFor(foe("basic", 4)));
    expect(bossHits(c.foes[0])).toBeGreaterThan(hitsFor(c.foes[0]));
    const zip = c.foes.find((f) => f.file?.name === "backup.zip")!;
    expect(zip.hp).toBe(Math.min(10, strength(40_000_000) + 2));
  });

  it("a tiny round is padded with filler foes; filler isn't a file", () => {
    const t = harness(game, { source: "Plan", files: [file("one.txt", "text", 10, "trashed")] });
    const w = world(t);
    expect(w.foes).toBe(MIN_FOES);
    expect(w.boss.file?.name).toBe("one.txt");
    expect(w.waves.flat().every((s) => s.foe.file === null)).toBe(true);
  });

  it("filler is spread through the waves, so every wave has real files", () => {
    const w = world(harness(game, sampleRound()));
    expect(w.waves.length).toBe(3);
    for (const wave of w.waves) {
      expect(wave.some((s) => s.foe.file)).toBe(true);
      expect(wave.some((s) => !s.foe.file)).toBe(true);
    }
    const filler = w.ships.find((s) => !s.foe.file)!;
    expect(filler.maxHp).toBe(2);
  });

  it("every kept file rides a ship or drifts in, even with more friends than ships", () => {
    for (const round of [sampleRound(), keepers(), maxed(), bigRound()]) {
      const c = cast(round);
      const { waves, drift } = buildWaves(c, rng());
      const carried = waves.flat().flatMap((s) => (s.carries ? [s.carries] : []));
      expect(new Set([...carried, ...drift]).size).toBe(c.friends.length);
      expect(carried.length + drift.length).toBe(c.friends.length);
    }
  });

  it("every kept file shows up as a capsule before the game is won", () => {
    for (const [round, seed] of [[sampleRound(), 1], [keepers(), 2], [maxed(), 3], [bigRound(), 4]] as const) {
      const t = harness(game, round, seed);
      const w = world(t);
      const seen = new Set<Friend>();
      for (let n = 0; n < 30 * 400 && !t.result(); n++) {
        w.player.invuln = 2; // a player that can't die, so the whole round plays out
        t.run(1, autopilot(w), 1000);
        for (const c of w.capsules) if (c.on) seen.add(c.friend);
      }
      expect(t.result()?.won).toBe(true);
      expect(w.drift.length).toBe(0);
      expect(seen.size).toBe(t.ctx.cast.friends.length);
    }
  });

  it("waves: at most four, at most 12 ships each, easy to hard", () => {
    const w = world(harness(game, bigRound()));
    expect(w.waves.length).toBe(4);
    for (const wave of w.waves) expect(wave.length).toBeLessThanOrEqual(12);
    expect(w.waves[0][0].foe.hp).toBeLessThanOrEqual(w.waves[3][0].foe.hp);
    expect(w.waves.flat().length + 1).toBe(w.foes);
  });

  it("shield: front hits land on the shield first, hits from behind don't", () => {
    const { w, r } = formed([foe("shield", 6)]);
    const s = shipOf(w, "shield");
    expect(s.shield).toBe(shieldFor(s.foe));
    const hp = s.hp;
    damage(w, s, 1, true, r);
    expect(s.shield).toBe(shieldFor(s.foe) - 1);
    expect(s.hp).toBe(hp);
    damage(w, s, 1, false, r);
    expect(s.hp).toBe(hp - 1);
  });

  it("flash: cloaks now and then and can't be hit while cloaked", () => {
    const { w, r } = formed([foe("flash", 6)]);
    const s = shipOf(w, "flash");
    let seen = false;
    let hidden = false;
    for (let i = 0; i < CLOAK.cycle + 2; i++) {
      safeStep(w, r);
      if (targetable(s)) seen = true;
      else if (s.on && s.state !== "wait") {
        hidden = true;
        const hp = s.hp;
        expect(damage(w, s, 1, true, r)).toBe(false);
        expect(s.hp).toBe(hp);
      }
    }
    expect(seen && hidden).toBe(true);
  });

  it("teleport: warps to another formation slot", () => {
    const { w, r } = formed([foe("teleport", 4), foe("basic", 4)]);
    const s = shipOf(w, "teleport");
    const slots = new Set<number>([s.slot]);
    let warped = false;
    for (let i = 0; i < 1200 && slots.size < 2; i++) {
      safeStep(w, r);
      if (s.warp > 0) warped = true;
      if (s.state === "formation") slots.add(s.slot);
    }
    expect(warped).toBe(true);
    expect(slots.size).toBeGreaterThan(1);
  });

  it("sonic: fires expanding rings instead of bullets", () => {
    const { w, r } = formed([foe("sonic", 4)]);
    let biggest = 0;
    for (let i = 0; i < 400; i++) {
      safeStep(w, r);
      for (const g of w.rings) if (g.on) biggest = Math.max(biggest, g.r);
    }
    expect(biggest).toBeGreaterThan(15);
  });

  it("fast: dives faster than a plain ship", () => {
    const { w } = formed([foe("fast", 4), foe("basic", 4)]);
    expect(shipOf(w, "fast").speed).toBeGreaterThan(shipOf(w, "basic").speed * 1.4);
    expect(shipOf(w, "tank" as Foe["ability"])).toBeUndefined();
  });

  it("split: breaks into two minis that aren't counted as extra foes", () => {
    const { w, r } = formed([foe("split", 1)]);
    const s = shipOf(w, "split");
    const before = w.defeated;
    damage(w, s, 5, false, r);
    expect(s.on).toBe(false);
    const minis = w.ships.filter((m) => m.on && m.kind === "mini");
    expect(minis.length).toBe(2);
    // they keep the archive ship's look
    for (const m of minis) expect(look(m)).toBe("split");
    for (const m of minis) damage(w, m, 5, false, r);
    expect(w.defeated).toBe(before + 1);
  });

  it("tank: big, slow, armored, and bursts into debris", () => {
    const { w, r } = formed([foe("tank", 4), foe("basic", 4)]);
    const s = shipOf(w, "tank");
    expect(s.w).toBeGreaterThan(shipOf(w, "basic").w);
    expect(s.speed).toBeLessThan(shipOf(w, "basic").speed);
    expect(s.maxHp).toBeGreaterThan(shipOf(w, "basic").maxHp);
    damage(w, s, 99, false, r);
    expect(w.foeShots.filter((b) => b.on && b.kind === "debris").length).toBeGreaterThanOrEqual(6);
  });

  it("the boss uses its file's ability too", () => {
    const seen: Record<string, boolean> = {};
    for (const ability of ["flash", "shield", "teleport", "sonic", "fast", "split", "tank", "basic"] as const) {
      const r = rng(5);
      const w = newWorld({ foes: [foe(ability, 8)], friends: [], benched: 0 }, r);
      // skip straight to the boss
      for (const s of w.ships) s.on = false;
      w.phase = "play";
      w.wave = w.waves.length - 1;
      let boss: World["ships"][number] | undefined;
      let minX = Infinity;
      for (let i = 0; i < 700; i++) {
        step(w, noInput, r);
        w.player.invuln = 5;
        boss ??= w.ships.find((s) => s.on && s.kind === "boss");
        if (!boss) continue;
        minX = Math.min(minX, boss.x);
        if (ability === "flash" && boss.t > 70 && !targetable(boss)) seen.flash = true;
        if (ability === "teleport" && boss.warp > 0) seen.teleport = true;
        if (ability === "sonic" && w.rings.some((g) => g.on)) seen.sonic = true;
        if (ability === "tank" && w.foeShots.some((b) => b.on && b.kind === "shell")) seen.tank = true;
        if (ability === "shield" && i === 400) (boss.shield = 0), (seen.shieldWas = true);
        if (ability === "shield" && i > 400 && boss.shield > 0) seen.shield = true;
        if (ability === "split" && i === 300) damage(w, boss, boss.maxHp * 0.4, false, r);
        if (ability === "split" && w.ships.some((s) => s.on && s.kind === "mini")) seen.split = true;
        if (ability === "basic" && w.foeShots.filter((b) => b.on).length >= 5) seen.basic = true;
      }
      if (ability === "fast" && minX < 160) seen.fast = true;
      expect(boss?.maxHp).toBe(bossHits(foe(ability, 8)));
    }
    expect(Object.keys(seen).sort()).toEqual(["basic", "fast", "flash", "shield", "shieldWas", "sonic", "split", "tank", "teleport"]);
  });

  /** A world whose boss (with this ability) has just flown in; the player can't be hurt. */
  function bossFight(ability: Foe["ability"], seed = 5, hp = 8) {
    const r = rng(seed);
    const w = newWorld({ foes: [foe(ability, hp)], friends: [], benched: 0 }, r);
    for (const s of w.ships) s.on = false;
    w.phase = "play";
    w.wave = w.waves.length - 1;
    let boss: Ship | undefined;
    for (let i = 0; i < 200 && !(boss && boss.t > 72); i++) {
      step(w, noInput, r);
      boss ??= w.ships.find((s) => s.on && s.kind === "boss");
    }
    return { w, r, boss: boss! };
  }

  it("the boss sweeps up and down on its own, not toward the player", () => {
    const { w, r, boss } = bossFight("basic");
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < 600; i++) {
      w.player.y = 30; // parked at the top
      w.player.invuln = 5;
      step(w, noInput, r);
      lo = Math.min(lo, boss.y);
      hi = Math.max(hi, boss.y);
    }
    expect(hi - lo).toBeGreaterThan(100);
    expect(hi).toBeGreaterThan(130);
  });

  it("the sonic boss's rings and the fast boss's lunge reach a ship on the left", () => {
    const sonic = bossFight("sonic");
    let edge = Infinity;
    for (let i = 0; i < 400; i++) {
      sonic.w.player.invuln = 5;
      step(sonic.w, noInput, sonic.r);
      for (const g of sonic.w.rings) if (g.on) edge = Math.min(edge, g.x - g.r);
    }
    expect(edge).toBeLessThan(25);

    const fast = bossFight("fast");
    let front = Infinity;
    let warned = false;
    for (let i = 0; i < 400; i++) {
      fast.w.player.invuln = 5;
      step(fast.w, noInput, fast.r);
      if (lunging(fast.boss) && fast.boss.x > 250) warned = true;
      front = Math.min(front, fast.boss.x - fast.boss.w / 2);
    }
    expect(warned).toBe(true);
    expect(front).toBeLessThan(fast.w.player.x);
  });

  it("perks: each one does its own thing, scaled by power", () => {
    const w = newWorld(cast(sampleRound()), rng());
    const p = w.player;
    applyPerk(w, friend("health", 3));
    expect(p.lives).toBe(4);
    applyPerk(w, friend("health", 9));
    expect(p.lives).toBe(6);
    applyPerk(w, friend("armor", 1));
    expect(p.armor).toBe(1);
    applyPerk(w, friend("armor", 8));
    expect(p.armor).toBe(4);
    applyPerk(w, friend("ally", 2));
    expect(p.drones.length).toBe(1);
    applyPerk(w, friend("rapid", 8));
    expect(p.rapidT).toBeGreaterThan(0);
    expect(p.rapidCd).toBe(4);
    applyPerk(w, friend("spread", 2));
    expect(p.spreadWays).toBe(2);
    applyPerk(w, friend("spread", 7));
    expect(p.spreadWays).toBe(3);
    applyPerk(w, friend("ammo", 4));
    expect(p.missiles).toBe(6);
    const weak = newWorld(cast(sampleRound()), rng());
    applyPerk(weak, friend("power", 1));
    applyPerk(w, friend("power", 10));
    expect(w.player.beamT).toBeGreaterThan(weak.player.beamT);
    const score = w.score;
    applyPerk(w, friend("points", 6));
    expect(w.score).toBe(score + 600);
  });

  it("two drones circle on opposite sides, whenever the second one came", () => {
    for (const gap of [0, 39, 78, 157]) {
      const t = harness(game, sampleRound());
      const w = world(t);
      t.run(50);
      applyPerk(w, friend("ally", 1));
      t.run(gap);
      applyPerk(w, friend("ally", 9));
      t.run(3);
      const [a, b] = w.player.drones;
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(25);
      // the first one runs out; the other carries on without a jump
      let jump = 0;
      for (let i = 0; i < 900 && w.player.drones.length; i++) {
        w.player.invuln = 5;
        const d = w.player.drones[w.player.drones.length - 1];
        const [x, y] = [d.x, d.y];
        t.run(1);
        if (w.player.drones.includes(d)) jump = Math.max(jump, Math.hypot(d.x - x, d.y - y));
      }
      expect(jump).toBeLessThan(4);
    }
  });

  it("capsules all drift at one pace and ease apart when they meet", () => {
    const t = harness(game, sampleRound());
    const w = world(t);
    t.run(READY_TICKS + 2);
    const [f1, f2] = cast(sampleRound()).friends;
    w.capsules.push({ on: true, friend: f1, x: 200, y: 100, base: 100, vx: -0.5, t: 0 }, { on: true, friend: f2, x: 202, y: 100, base: 100, vx: -0.5, t: 0 });
    w.player.y = 30;
    t.run(40);
    const [a, b] = w.capsules.slice(-2);
    expect(Math.abs(a.base - b.base) >= 16 || Math.abs(a.x - b.x) >= 16).toBe(true);
    // dropped and drifting capsules move alike
    t.run(600, ["fire"]);
    for (const c of w.capsules) expect(c.vx).toBe(-0.5);
  });

  it("no shooting under the READY banner", () => {
    const t = harness(game, sampleRound());
    const w = world(t);
    t.run(READY_TICKS - 1, ["fire"]);
    expect(w.phase).toBe("ready");
    expect(w.shots.some((s) => s.on)).toBe(false);
    t.run(3, ["fire"]);
    expect(w.shots.some((s) => s.on)).toBe(true);
  });

  it("perks in play: armor soaks a hit, drones copy shots, rapid fires faster", () => {
    const count = (setup: (w: World) => void) => {
      const t = harness(game, sampleRound());
      const w = world(t);
      t.run(READY_TICKS + 2);
      setup(w);
      let shots = 0;
      for (let i = 0; i < 30; i++) {
        t.run(1, ["fire"]);
        shots += w.shots.filter((s) => s.on && s.t === 1).length;
      }
      return shots;
    };
    const plain = count(() => {});
    expect(count((w) => applyPerk(w, friend("rapid", 8)))).toBeGreaterThan(plain);
    expect(count((w) => applyPerk(w, friend("ally", 5)))).toBeGreaterThanOrEqual(plain * 1.4);
    expect(count((w) => applyPerk(w, friend("spread", 8)))).toBe(plain * 3);

    const t = harness(game, sampleRound());
    const w = world(t);
    t.run(READY_TICKS + 2);
    applyPerk(w, friend("armor", 1));
    w.player.invuln = 0;
    w.foeShots.push({ on: true, x: w.player.x, y: w.player.y, vx: 0, vy: 0, kind: "bullet", t: 0 });
    t.run(1);
    expect(w.player.armor).toBe(0);
    expect(w.player.lives).toBe(3);
  });

  it("collecting a capsule fills the meter, and a full meter pulses everything", () => {
    const t = harness(game, sampleRound());
    const w = world(t);
    t.run(READY_TICKS + 120);
    const c = w.capsules.find(() => true) ?? { on: false, friend: cast(sampleRound()).friends[0], x: 0, y: 0, base: 0, vx: 0, t: 0 };
    if (!w.capsules.includes(c)) w.capsules.push(c);
    // dropped right on the ship, it still shows for a few frames before it's picked up
    Object.assign(c, { on: true, x: w.player.x + 4, y: w.player.y, base: w.player.y, vx: 0, t: 0 });
    const before = w.collected;
    t.run(1);
    expect(w.collected).toBe(before);
    expect(c.on).toBe(true);
    t.run(8);
    expect(w.collected).toBe(before + 1);
    expect(w.meter).toBeGreaterThan(0);
    w.meter = METER_MAX;
    const hp = w.ships.filter((s) => s.on && s.state !== "wait").map((s) => s.hp + s.shield);
    t.input.keydown("x");
    t.run(40);
    expect(w.pulse.id).toBe(1);
    expect(w.meter).toBeLessThan(METER_MAX);
    const after = w.ships.filter((s) => s.on && s.state !== "wait").map((s) => s.hp + s.shield);
    expect(after.reduce((a, b) => a + b, 0)).toBeLessThan(hp.reduce((a, b) => a + b, 0));
  });

  it("no damage during READY", () => {
    const t = harness(game, sampleRound());
    const w = world(t);
    w.foeShots.push({ on: true, x: w.player.x, y: w.player.y, vx: 0, vy: 0, kind: "bullet", t: 0 });
    t.run(5);
    expect(w.player.lives).toBe(3);
  });

  it("win: beating every wave and the boss ends with won and defeated === foes", () => {
    const t = harness(game, sampleRound());
    const w = world(t);
    let guard = 0;
    while (!t.result() && guard++ < 4000) {
      for (const s of w.ships) if (s.on && s.state !== "wait" && s.state !== "enter" && !(s.kind === "boss" && s.t < 72)) damage(w, s, 999, false, () => 0.5, true);
      t.run(1);
    }
    const r = t.result()!;
    expect(r.won).toBe(true);
    expect(r.defeated).toBe(r.foes);
    expect(r.foes).toBe(w.foes);
    expect(r.score).toBeGreaterThan(0);
  });

  it("lose: out of lives ends with won false", () => {
    const t = harness(game, sampleRound());
    const w = world(t);
    t.run(READY_TICKS + 2);
    let guard = 0;
    while (!t.result() && guard++ < 2000) {
      if (w.player.invuln === 0) w.foeShots.push({ on: true, x: w.player.x, y: w.player.y, vx: 0, vy: 0, kind: "bullet", t: 0 });
      t.run(1);
    }
    const r = t.result()!;
    expect(r.won).toBe(false);
    expect(r.defeated).toBeLessThanOrEqual(r.foes);
    // and nothing changes after the end
    const snap = JSON.stringify(w);
    t.game.update(1 / 30);
    t.game.draw();
    expect(JSON.stringify(w)).toBe(snap);
  });

  it("losing stays a loss: shots still flying when the last life goes can't win it", () => {
    const { w, r, boss } = bossFight("basic", 1);
    boss.hp = 0.5;
    w.player.lives = 1;
    w.player.invuln = 0;
    w.player.missiles = 4;
    // a shot a few ticks from the boss, a bullet on the ship, and a pulse on its way
    w.shots.push({ on: true, x: boss.x - 40, y: boss.y, vx: 7, vy: 0, dmg: 1, missile: false, drone: false, target: -1, t: 0 });
    w.foeShots.push({ on: true, x: w.player.x, y: w.player.y, vx: 0, vy: 0, kind: "bullet", t: 0 });
    Object.assign(w.pulse, { on: true, x: w.player.x, y: w.player.y, r: 0, id: 99 });
    step(w, noInput, r);
    expect(w.phase).toBe("lost");
    for (let i = 0; i < 200 && !w.result; i++) step(w, noInput, r);
    expect(boss.on).toBe(true);
    expect(w.result?.won).toBe(false);
    expect(w.result?.defeated).toBeLessThan(w.foes);
  });

  it("empty and big rounds run 600 ticks without throwing", () => {
    for (const round of [empty, bigRound(), maxed(), keepers(), { source: "Plan" as const, files: [file("lonely.txt", "text", 500, "trashed")] }]) {
      const t = harness(game, round);
      expect(() => {
        t.run(200, ["fire", "up"], 1);
        t.run(200, ["fire", "down", "right"], 1);
        t.run(200, ["fire", "alt", "left"], 1);
      }).not.toThrow();
      const w = world(t);
      expect(w.ships.filter((s) => s.on).length).toBeLessThanOrEqual(30);
      expect(w.parts.length).toBeLessThanOrEqual(140);
    }
  });

  it("same seed, same game", () => {
    const play = (seed: number) => {
      const t = harness(game, bigRound(), seed);
      t.run(150, ["fire", "up"]);
      t.run(150, ["fire", "down", "right"]);
      t.run(150, ["fire", "alt"]);
      return JSON.stringify(world(t));
    };
    expect(play(7)).toBe(play(7));
    expect(play(7)).not.toBe(play(8));
  });

  it("holding fire and moving, you survive the first 10 seconds", () => {
    for (const round of [sampleRound(), bigRound(), empty])
      for (const seed of [1, 2, 3]) {
        const t = harness(game, round, seed);
        for (let i = 0; i < 10; i++) t.run(30, ["fire", i % 2 ? "up" : "down"]);
        expect(t.result()).toBeNull();
        expect(world(t).player.lives).toBeGreaterThan(0);
      }
  });

  it("a busy frame stays within the draw budget, with the real art", () => {
    // a 2D context that counts what's drawn, for the main canvas and the offscreen ones
    let calls = 0;
    const counting = () =>
      new Proxy(nullContext(), {
        get: (target, key) => {
          const v = (target as unknown as Record<string | symbol, unknown>)[key];
          if (key === "fillRect" || key === "drawImage" || key === "putImageData" || key === "fillText") return () => void calls++;
          if (key === "shadowBlur" || key === "filter" || key === "createLinearGradient" || key === "createRadialGradient" || key === "getImageData") throw new Error(`uses ${String(key)}`);
          return v;
        },
      });
    const spy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => counting()) as never);
    try {
      const t = harness(game, bigRound(), 4);
      (t.ctx as { g: CanvasRenderingContext2D }).g = counting();
      const w = world(t);
      let most = 0;
      for (let i = 0; i < 1500 && !t.result(); i++) {
        t.run(1, autopilot(w), 1000);
        calls = 0;
        t.game.draw();
        most = Math.max(most, calls);
      }
      expect(most).toBeGreaterThan(50);
      expect(most).toBeLessThan(1500);
    } finally {
      spy.mockRestore();
    }
  });

  it("a careful player wins in a few minutes; end() is called once", () => {
    const runs = ([[sampleRound(), 1], [empty, 2], [bigRound(), 3], [sampleRound(), 4], [bigRound(), 5]] as const).map(([round, seed]) => autoplay(round, seed, 9000));
    for (const { r, ticks } of runs) {
      expect(r).not.toBeNull();
      expect(r!.won).toBe(true);
      expect(ticks).toBeGreaterThan(30 * 35);
      expect(ticks).toBeLessThan(30 * 200);
    }
  });

  it("holding fire without moving doesn't win", () => {
    for (const seed of [1, 2, 3]) {
      const t = harness(game, sampleRound(), seed);
      t.run(30 * 300, ["fire"], 1000);
      expect(t.result()?.won ?? false).toBe(false);
    }
  });
});

