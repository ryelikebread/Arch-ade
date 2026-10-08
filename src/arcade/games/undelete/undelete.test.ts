import { describe, expect, it } from "vitest";
import { game, type UndeleteGame } from ".";
import { KeyInput } from "../../input";
import { cast, seeded } from "../../round";
import { file, harness, sampleRound } from "../../testing";
import type { ArcadeFile, ArcadeRound, Button, GameResult } from "../../types";
import { readyLine } from "./draw";
import { aim, arm, BURST_RANGE, cloak, collect, createWorld, enterLevel, GUN, gunOf, SPECIAL_GUNS, hitsFor, hitZombie, hurtPlayer, los, lootFor, MAX_AMMO, MIN_ZOMBIES, primed, step, type World, type Zombie } from "./logic";
import { buildMaze, CLASSIC, isWall, reach } from "./maze";
import { levelsFor, levelTitle, THEMES } from "./themes";
import { CARD_SLOT, gunCardPixels, gunPixels, propPixels, px, SHIELD_SLOT, shieldPixels, zombiePixels, ZOMBIE_H, ZOMBIE_W } from "./sprites";

const KEY: Record<Button, string> = { left: "ArrowLeft", right: "ArrowRight", up: "ArrowUp", down: "ArrowDown", fire: " ", alt: "x" };

/** Logic-only runner: a world, scripted input, and what it sent out. */
function rig(files: ArcadeFile[], seed = 1) {
  const w = createWorld(cast({ source: "Plan", files }), seeded(seed));
  const input = new KeyInput();
  const ends: GameResult[] = [];
  const sounds: string[] = [];
  const io = { input, sfx: (n: string) => sounds.push(n), end: (r: GameResult) => ends.push(r) };
  return {
    w,
    ends,
    sounds,
    run(ticks: number, hold: Button[] = []) {
      for (const k of Object.values(KEY)) input.keyup(k);
      for (const b of hold) input.keydown(KEY[b]);
      for (let i = 0; i < ticks; i++) {
        step(w, io as never);
        input.endTick();
      }
    },
  };
}

/** Knock the maze down to an open room, put the player in the middle facing east, and drop filler. */
function arena(w: World) {
  const m = w.maze;
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) m.cells[y * m.w + x] = x === 0 || y === 0 || x === m.w - 1 || y === m.h - 1 ? 1 : 0;
  w.player.x = m.w / 2;
  w.player.y = m.h / 2;
  w.player.a = 0;
  w.phase = "play";
  w.flowCell = -1;
  w.zombies = w.zombies.filter((z) => z.kind !== null);
  w.pickups.forEach((pk) => (pk.taken = true));
  // park the zombies in a far corner, asleep and still
  w.zombies.forEach((z, i) => Object.assign(z, { x: 2 + (i % 4) * 0.7, y: 2 + Math.floor(i / 4) * 0.7, awake: false, speed: 0 }));
  return w;
}

/** Put a zombie `d` cells in front of the player, facing them, awake. */
function front(w: World, z: Zombie, d: number, speed?: number) {
  Object.assign(z, { x: w.player.x + d, y: w.player.y, face: Math.PI, awake: true, sees: true });
  if (speed !== undefined) z.speed = speed;
}

const trashed = (name: string, kind: ArcadeFile["kind"], bytes: number) => file(name, kind, bytes, "trashed");

const angTo = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/**
 * A sloppy auto-player: walks toward the nearest zombie, turns at game
 * speed, reacts `react` ticks late, wobbles its aim, and fires only when
 * something is in the crosshair. Returns the result (null if out of time).
 */
function autoPlay(round: ArcadeRound, seed: number, react = 10, wobble = 0.04, themes?: Set<string>): GameResult | null {
  const t = harness(game, round, seed);
  const w = (t.game as UndeleteGame).world;
  let last: Zombie | null = null;
  let seen = 0;
  for (let tick = 0; tick < 30 * 60 * 5 && !t.result(); tick++) {
    const p = w.player;
    const m = w.maze; // a new one each floor
    themes?.add(w.theme.id);
    // the nearest zombie in sight (a flickering one it was already tracking counts)
    let vis: Zombie | null = null;
    let vd = 9;
    for (const z of w.zombies) {
      if (z.dead || (cloak(z) === 2 && z !== last)) continue;
      const d = Math.hypot(z.x - p.x, z.y - p.y);
      if (d < vd && los(m, p.x, p.y, z.x, z.y)) ((vis = z), (vd = d));
    }
    seen = vis === last ? seen + 1 : 0;
    last = vis;
    const hold: Button[] = [];
    let goal = p.a;
    if (vis && seen >= react) {
      goal = Math.atan2(vis.y - p.y, vis.x - p.x) + wobble * Math.sin(tick * 0.21);
      if (vd > 3) hold.push("up");
      if (vd < 1.2) hold.push("down");
    } else {
      // one cell along the shortest way to the nearest zombie
      const steps = reach(m, Math.floor(p.x), Math.floor(p.y));
      let near: Zombie | null = null;
      for (const z of w.zombies) if (!z.dead && (!near || steps[Math.floor(z.y) * m.w + Math.floor(z.x)] < steps[Math.floor(near.y) * m.w + Math.floor(near.x)])) near = z;
      if (near) {
        const back = reach(m, Math.floor(near.x), Math.floor(near.y));
        const cx = Math.floor(p.x);
        const cy = Math.floor(p.y);
        let [nx, ny, best] = [near.x, near.y, back[cy * m.w + cx]];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const v = back[(cy + dy) * m.w + cx + dx];
          if (v >= 0 && v < best) [nx, ny, best] = [cx + dx + 0.5, cy + dy + 0.5, v];
        }
        goal = Math.atan2(ny - p.y, nx - p.x);
        if (Math.abs(angTo(goal, p.a)) < 0.6) hold.push("up");
      }
    }
    const da = angTo(goal, p.a);
    if (da > 0.06) hold.push("right");
    else if (da < -0.06) hold.push("left");
    else if (vis && !w.target) hold.push("alt", tick % 60 < 30 ? "left" : "right"); // a corner's in the way: sidestep
    if (w.target) hold.push("fire");
    for (const k of Object.values(KEY)) t.input.keyup(k);
    for (const b of hold) t.input.keydown(KEY[b]);
    t.game.update(1 / 30);
    t.input.endTick();
  }
  return t.result();
}

describe("undelete: files become zombies and pickups", () => {
  it("every foe is a zombie, toughness from file size; deleted files are elite and tougher", () => {
    const { w } = rig([trashed("tiny.txt", "text", 500), trashed("huge.mov", "video", 500_000_000), file("gone.mov", "video", 500_000_000, "deleted"), file("kept.png", "image", 1e6, "kept")]);
    const by = (label: string) => w.zombies.find((z) => z.label === label)!;
    expect(w.zombies.length).toBe(MIN_ZOMBIES); // filler joins a small round
    expect(w.foes).toBe(MIN_ZOMBIES);
    expect(w.zombies.filter((z) => z.kind === null).length).toBe(MIN_ZOMBIES - 3);
    expect(by("tiny").hp).toBe(1);
    expect(by("huge").hp).toBeGreaterThanOrEqual(4);
    expect(by("gone").elite).toBe(true);
    expect(by("gone").hp).toBeGreaterThan(by("huge").hp);
    expect(by("huge").kind).toBe("video");
    const c = cast(sampleRound());
    for (const foe of c.foes) expect(hitsFor(foe)).toBeGreaterThanOrEqual(Math.ceil(foe.hp / 2));
    expect(w.pickups.length).toBe(1);
    expect(w.pickups[0].friend!.perk).toBe("health");
  });

  it("the READY line counts binned files and filler junk apart", () => {
    const one = rig([trashed("tiny.txt", "text", 500)]).w;
    expect([one.files, one.foes]).toEqual([1, MIN_ZOMBIES]);
    expect(readyLine(one.files, one.foes - one.files)).toBe("1 BINNED FILE ROSE AS ZOMBIES (+9 JUNK)");
    const empty = rig([]).w;
    expect(empty.files).toBe(0);
    expect(readyLine(empty.files, empty.foes)).toBe("NOTHING BINNED: ONLY JUNK RISES");
    expect(readyLine(48, 0)).toBe("48 BINNED FILES ROSE AS ZOMBIES");
  });

  it("big rooms get filing-cabinet pillars, and every floor cell stays reachable", () => {
    let pillars = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const m = buildMaze(seeded(seed), 48, 32);
      for (const r of m.rooms.slice(1))
        for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (m.cells[y * m.w + x] === 3) pillars++;
      const steps = reach(m, Math.floor(m.start.x), Math.floor(m.start.y));
      for (let i = 0; i < m.cells.length; i++) if (m.cells[i] === 0) expect(steps[i]).toBeGreaterThanOrEqual(0);
    }
    expect(pillars).toBeGreaterThan(20 * 4);
  });

  it("everyone starts on open floor, zombies away from the player", () => {
    for (const seed of [1, 2, 3]) {
      const t = harness(game, sampleRound(), seed);
      const w = (t.game as UndeleteGame).world;
      for (const e of [...w.zombies, ...w.pickups, w.player]) expect(isWall(w.maze, e.x, e.y)).toBe(false);
      for (const z of w.zombies) expect(Math.hypot(z.x - w.player.x, z.y - w.player.y)).toBeGreaterThan(2.5);
    }
  });
});

describe("undelete: abilities", () => {
  it("flash: flickers out of sight, and can't be hit while gone", () => {
    const { w } = rig([trashed("pic.jpg", "image", 3e6)]);
    arena(w);
    const z = w.zombies[0];
    front(w, z, 3, 0);
    const seen = new Set<number>();
    let shotWhileGone = false;
    for (let i = 0; i < 130; i++) {
      z.timer++;
      seen.add(cloak(z));
      if (cloak(z) === 2 && aim(w, 0).z === z) shotWhileGone = true;
    }
    expect([...seen].sort()).toEqual([0, 1, 2]);
    expect(shotWhileGone).toBe(false);
  });

  it("flash: never strikes while out of sight, and shows up (hittable) for the swipe", () => {
    const { w, run } = rig([trashed("pic.jpg", "image", 3e6)]);
    arena(w);
    const z = w.zombies[0];
    front(w, z, 0.6, 0);
    z.timer = 95; // gone
    run(1);
    expect(z.swing).toBe(0);
    let swings = 0;
    for (let i = 0; i < 240; i++) {
      const hp = w.player.hp;
      run(1);
      if (z.swing > 0) {
        swings++;
        expect(cloak(z)).toBe(0);
        expect(aim(w, 0).z).toBe(z);
      }
      if (w.player.hp < hp) expect(cloak(z)).toBe(0);
    }
    expect(swings).toBeGreaterThan(0);
    expect(w.player.hp).toBeLessThan(100);
  });

  it("shield: a shield in front takes the hits until broken; from behind they land", () => {
    const { w, run } = rig([trashed("report.pdf", "pdf", 800_000)]);
    arena(w);
    const z = w.zombies[0];
    front(w, z, 3, 0);
    expect(z.shield).toBeGreaterThan(0);
    const hp = z.hp;
    expect(hitZombie(w, z, 1, w.player.x, w.player.y)).toBe("shield");
    expect(z.hp).toBe(hp);
    expect(hitZombie(w, z, 1, z.x + 2, z.y)).toBe("hit"); // from behind
    expect(z.hp).toBe(hp - 1);
    while (z.shield > 0) hitZombie(w, z, 1, w.player.x, w.player.y);
    expect(hitZombie(w, z, 1, w.player.x, w.player.y)).not.toBe("shield");
    run(1);
  });

  it("teleport: blinks to another cell now and then", () => {
    const { w, run, sounds } = rig([trashed("notes.md", "markdown", 2_000)]);
    arena(w);
    const z = w.zombies[0];
    front(w, z, 6, 0);
    let jumped = false;
    for (let i = 0; i < 200 && !jumped; i++) {
      const [x, y] = [z.x, z.y];
      run(1);
      if (Math.hypot(z.x - x, z.y - y) > 1.5) jumped = true;
    }
    expect(jumped).toBe(true);
    expect(sounds).toContain("whoosh");
    expect(isWall(w.maze, z.x, z.y)).toBe(false);
  });

  it("sonic: fires slow sound waves from range that hurt", () => {
    const { w, run } = rig([trashed("song.mp3", "audio", 5e6)]);
    arena(w);
    const z = w.zombies[0];
    front(w, z, 6, 0);
    let fired = false;
    for (let i = 0; i < 120 && !fired; i++) (run(1), (fired = w.waves.length > 0));
    expect(fired).toBe(true);
    const v = w.waves[0];
    expect(Math.hypot(v.vx, v.vy)).toBeLessThan(0.1); // slow: dodgeable
    const hp = w.player.hp;
    run(120);
    expect(w.player.hp).toBeLessThan(hp);
  });

  it("fast: moves twice as fast as a plain zombie", () => {
    const { w, run } = rig([trashed("clip.mp4", "video", 9e7), trashed("thing.bin", "unknown", 1_000)]);
    arena(w);
    const fast = w.zombies.find((z) => z.ability === "fast")!;
    const plain = w.zombies.find((z) => z.ability === "basic")!;
    expect(fast.speed).toBeCloseTo(plain.speed * 2);
    Object.assign(fast, { x: w.player.x + 8, y: w.player.y - 1, awake: true, speed: 0.056 });
    Object.assign(plain, { x: w.player.x + 8, y: w.player.y + 1, awake: true, speed: 0.028 });
    run(30);
    expect(8 - (fast.x - w.player.x)).toBeGreaterThan((8 - (plain.x - w.player.x)) * 1.7);
  });

  it("split: breaks into two minis that don't count as extra foes", () => {
    const { w } = rig([file("backup.zip", "archive", 4e7, "deleted")]);
    arena(w);
    const z = w.zombies[0];
    front(w, z, 4, 0);
    const before = w.zombies.length;
    while (!z.dead) hitZombie(w, z, 1, w.player.x, w.player.y);
    const minis = w.zombies.filter((m) => m.mini);
    expect(minis.length).toBe(2);
    expect(w.zombies.length).toBe(before + 2);
    expect(minis.every((m) => !m.counts && m.height < z.height && m.maxHp <= 2)).toBe(true);
    expect(w.defeated).toBe(1);
    for (const m of minis) while (!m.dead) hitZombie(w, m, 1, w.player.x, w.player.y);
    expect(w.defeated).toBe(1);
  });

  it("split: the minis live on when a splash shot breaks it", () => {
    const { w, run } = rig([file("backup.zip", "archive", 4e7, "deleted")]);
    arena(w);
    const z = w.zombies[0];
    front(w, z, 2, 0);
    z.hp = 1;
    arm(w, "power", 10);
    run(1, ["fire"]);
    expect(z.dead).toBe(true);
    expect(w.zombies.filter((m) => m.mini && !m.dead).length).toBe(2);
  });

  it("tank: big and tough, and bursts with area damage", () => {
    const { w } = rig([trashed("setup.dmg", "diskImage", 3e8), trashed("thing.bin", "unknown", 3e8)]);
    const tank = w.zombies.find((z) => z.ability === "tank")!;
    const plain = w.zombies.find((z) => z.ability === "basic")!;
    expect(tank.maxHp).toBeGreaterThan(plain.maxHp);
    expect(tank.height).toBeGreaterThan(plain.height);
    expect(tank.speed).toBeLessThan(plain.speed);
    arena(w);
    front(w, tank, 1.2, 0);
    Object.assign(plain, { x: tank.x + 0.8, y: tank.y, awake: true });
    const hp = w.player.hp;
    let warned = false;
    while (!tank.dead) {
      warned ||= primed(tank); // it swells and blinks before it bursts
      hitZombie(w, tank, 1, w.player.x, w.player.y);
    }
    expect(warned).toBe(true);
    expect(w.player.hp).toBeLessThan(hp);
    expect(hp - w.player.hp).toBeLessThanOrEqual(12);
    expect(plain.hp).toBeLessThan(plain.maxHp);
    expect(w.fx.some((f) => f.type === "boom")).toBe(true);
  });

  it("basic: walks up and swipes", () => {
    const { w, run } = rig([trashed("thing.bin", "unknown", 1_000)]);
    arena(w);
    const z = w.zombies[0];
    front(w, z, 3);
    z.speed = 0.028;
    const hp = w.player.hp;
    let swiped = false;
    for (let i = 0; i < 200; i++) (run(1), (swiped ||= z.swing > 0));
    expect(swiped).toBe(true);
    expect(w.player.hp).toBeLessThan(hp);
  });

  it("zombies in sight don't snag on a door frame on the way to you", () => {
    for (const [kind, bytes, speed] of [["unknown", 1_000, 0.028], ["diskImage", 1e8, 0.018]] as const)
      for (const y of [10.1, 10.2, 10.5]) {
        const { w, run } = rig([trashed("x.bin", kind, bytes)]);
        arena(w);
        // a wall down column 10 with a one-cell door at row 10; you stand still, level with its frame
        const m = w.maze;
        for (let r = 1; r < m.h - 1; r++) if (r !== 10) m.cells[r * m.w + 10] = 1;
        Object.assign(w.player, { x: 13.5, y, a: Math.PI });
        const z = w.zombies[0];
        Object.assign(z, { x: 8.5, y, awake: true, speed });
        run(450);
        expect(z.x).toBeGreaterThan(11);
        expect(w.player.hp).toBeLessThan(100);
      }
  });

  it("bumping into a sleeping zombie wakes it, so it doesn't block the way", () => {
    // five of them, so it isn't the last few (who all come hunting anyway)
    const { w, run } = rig(["a", "b", "c", "d", "e"].map((n) => trashed(`${n}.bin`, "unknown", 1_000)));
    arena(w);
    const [a, b, c] = w.zombies;
    Object.assign(a, { x: 2.5, y: 2.5, awake: true });
    Object.assign(b, { x: 2.8, y: 2.5, awake: false });
    Object.assign(c, { x: 2.5, y: 5.5, awake: false });
    run(1);
    expect(b.awake).toBe(true);
    expect(c.awake).toBe(false);
  });
});

describe("undelete: perks", () => {
  const kept = (name: string, kind: ArcadeFile["kind"], bytes: number) => file(name, kind, bytes, "kept");
  function pick(f: ArcadeFile) {
    const r = rig([trashed("x.bin", "unknown", 100), f]);
    arena(r.w);
    r.w.pickups[0].taken = false;
    return r;
  }

  it("health heals, more for a bigger file", () => {
    const small = pick(kept("a.png", "image", 1_000)).w;
    const big = pick(kept("b.png", "image", 1e9)).w;
    for (const w of [small, big]) ((w.player.hp = 20), collect(w, w.pickups[0]));
    expect(small.player.hp).toBeGreaterThan(20);
    expect(big.player.hp).toBeGreaterThan(small.player.hp);
    expect(small.collected).toBe(1);
    expect(small.msg.text).toContain("A");
  });

  it("health waits on the floor while you're at full health", () => {
    const { w, run } = pick(kept("a.png", "image", 1_000));
    Object.assign(w.pickups[0], { x: w.player.x + 0.3, y: w.player.y });
    run(2);
    expect(w.pickups[0].taken).toBe(false);
    w.player.hp = 60;
    run(2);
    expect(w.pickups[0].taken).toBe(true);
    expect(w.player.hp).toBeGreaterThan(60);
  });

  it("armor adds armor that soaks damage", () => {
    const { w } = pick(kept("budget.xlsx", "xlsx", 50_000));
    collect(w, w.pickups[0]);
    expect(w.player.armor).toBeGreaterThan(0);
    const armor = w.player.armor;
    hurtPlayer(w, 12);
    expect(w.player.hp).toBe(100 - 4);
    expect(w.player.armor).toBe(armor - 8);
  });

  it("ally: a helper bot follows you and shoots zombies", () => {
    const { w, run } = pick(kept("script.json", "json", 4_000));
    Object.assign(w.pickups[0], { x: w.player.x + 0.4, y: w.player.y });
    collect(w, w.pickups[0]);
    expect(w.allies.length).toBe(1);
    // it boots up out where it hovers, not in your face
    expect(Math.hypot(w.allies[0].x - w.player.x, w.allies[0].y - w.player.y)).toBeGreaterThan(1.2);
    const z = w.zombies[0];
    front(w, z, 4, 0);
    z.dmg = 0;
    Object.assign(w.allies[0], { x: w.player.x - 3, y: w.player.y });
    run(60);
    expect(z.hp < z.maxHp || z.dead).toBe(true);
    expect(Math.hypot(w.allies[0]?.x - w.player.x, w.allies[0]?.y - w.player.y) || 0).toBeLessThan(2);
  });

  it("rapid fires faster; spread fires three rays; ammo refills", () => {
    const r1 = pick(kept("mix.mp3", "audio", 4e6));
    r1.run(1, ["fire"]);
    const slow = r1.w.player.cd;
    r1.w.player.cd = 0;
    collect(r1.w, r1.w.pickups[0]);
    r1.run(1, ["fire"]);
    expect(r1.w.player.cd).toBeLessThan(slow);

    const r2 = pick(kept("movie.mov", "video", 2e8));
    expect(["spread", "burst", "bounce"]).toContain(r2.w.pickups[0].gun);
    r2.w.pickups[0].gun = "spread";
    collect(r2.w, r2.w.pickups[0]);
    expect(gunOf(r2.w.player)).toBe("spread");
    r2.run(1, ["fire"]);
    expect(r2.w.lastRays).toBe(3);

    const r3 = pick(kept("bundle.zip", "archive", 1e7));
    r3.w.player.ammo = 0;
    collect(r3.w, r3.w.pickups[0]);
    expect(r3.w.player.ammo).toBeGreaterThan(15);
  });

  it("power gives a splash cannon that hits a crowd; points add score", () => {
    const { w, run } = pick(kept("tool.pkg", "installer", 5e7));
    expect(["power", "beam"]).toContain(w.pickups[0].gun);
    w.pickups[0].gun = "power";
    collect(w, w.pickups[0]);
    expect(gunOf(w.player)).toBe("power");
    const a = w.zombies[0];
    const b = makeExtra(w, a);
    front(w, a, 3, 0);
    Object.assign(b, { x: a.x + 0.3, y: a.y + 0.6, awake: true });
    run(1, ["fire"]);
    expect(a.hp).toBeLessThan(a.maxHp + 1);
    expect(b.hp < b.maxHp || b.dead).toBe(true);

    const p = pick(kept("misc.dat", "unknown", 1e6)).w;
    const before = p.score;
    collect(p, p.pickups[0]);
    expect(p.score).toBe(before + 100 * p.pickups[0].friend!.power);
  });
});

/** A second plain zombie next to the first, for splash tests. */
function makeExtra(w: World, like: Zombie): Zombie {
  const z = { ...like, id: 999, hp: 3, maxHp: 3, dead: false };
  w.zombies.push(z);
  return z;
}

describe("undelete: playing a round", () => {
  it("wins when every zombie is beaten, with defeated === foes", () => {
    const t = harness(game, sampleRound(), 2);
    const w = (t.game as UndeleteGame).world;
    t.run(50);
    for (let guard = 0; guard < 500 && w.zombies.some((z) => !z.dead); guard++)
      for (const z of w.zombies) if (!z.dead) hitZombie(w, z, 1, z.x + Math.cos(z.face) * 2, z.y + Math.sin(z.face) * 2);
    const r = t.run(120);
    expect(r).not.toBeNull();
    expect(r!.won).toBe(true);
    expect(r!.defeated).toBe(r!.foes);
    expect(r!.foes).toBe(Math.max(MIN_ZOMBIES, cast(sampleRound()).foes.length));
    expect(r!.score).toBeGreaterThan(0);
  });

  it("loses when health runs out", () => {
    const t = harness(game, sampleRound(), 3);
    const w = (t.game as UndeleteGame).world;
    t.run(50);
    w.player.hp = 5;
    hurtPlayer(w, 30);
    const r = t.run(120);
    expect(r).not.toBeNull();
    expect(r!.won).toBe(false);
    expect(r!.defeated).toBeLessThanOrEqual(r!.foes);
  });

  it("no damage during READY", () => {
    const { w } = rig([trashed("thing.bin", "unknown", 1_000)]);
    expect(w.phase).toBe("ready");
    hurtPlayer(w, 50);
    expect(w.player.hp).toBe(100);
  });

  it("empty, tiny and big rounds run 600 ticks without throwing", () => {
    const kinds: ArcadeFile["kind"][] = ["image", "pdf", "markdown", "audio", "video", "archive", "installer", "unknown", "xlsx", "json"];
    const big: ArcadeRound = {
      source: "Plan",
      files: Array.from({ length: 120 }, (_, i) => file(`file-${i}.dat`, kinds[i % kinds.length], 1000 * 3 ** (i % 12), i % 3 ? "trashed" : i % 2 ? "kept" : "deleted")),
    };
    const rounds: ArcadeRound[] = [{ source: "Plan", files: [] }, { source: "Plan", files: [trashed("lonely.txt", "text", 500)] }, big];
    for (const round of rounds) {
      const t = harness(game, round, 7);
      const w = (t.game as UndeleteGame).world;
      expect(w.zombies.length).toBeGreaterThanOrEqual(MIN_ZOMBIES);
      t.run(150, ["up", "fire"], 5);
      t.run(150, ["right", "fire"], 5);
      t.run(150, ["alt", "left", "up"], 5);
      t.run(150, ["down", "fire"], 5);
      if (round === big) expect(w.zombies.length).toBeLessThanOrEqual(72);
    }
  });

  it("the same seed plays out the same", () => {
    const snap = (seed: number) => {
      const t = harness(game, sampleRound(), seed);
      t.run(100, ["up", "fire"]);
      t.run(100, ["left", "fire"]);
      t.run(100, ["alt", "right", "fire"]);
      const w = (t.game as UndeleteGame).world;
      return JSON.stringify({ p: w.player, z: w.zombies.map((z) => [z.x, z.y, z.hp, z.awake]), score: w.score, cells: [...w.maze.cells] });
    };
    expect(snap(4)).toBe(snap(4));
    expect(snap(4)).not.toBe(snap(5));
  });

  it("calls end once, then stays still", () => {
    const t = harness(game, sampleRound(), 1);
    const w = (t.game as UndeleteGame).world;
    t.run(50);
    for (const z of w.zombies) z.hp = 0;
    w.player.hp = 1;
    hurtPlayer(w, 10);
    const r = t.run(200);
    expect(r).not.toBeNull();
    const score = w.score;
    for (let i = 0; i < 100; i++) {
      t.game.update(1 / 30); // harness throws if end() is called again
      t.game.draw();
    }
    expect(w.score).toBe(score);
    expect(w.phase).toBe("done");
  });

  it("staples: scaled to the round, beaten zombies give some back, running dry only slows you a little", () => {
    const small = rig([trashed("thing.bin", "unknown", 1_000)]).w;
    expect(small.player.ammo).toBe(60);
    const kinds: ArcadeFile["kind"][] = ["image", "pdf", "markdown", "audio", "video", "archive", "installer", "unknown"];
    const big = rig(Array.from({ length: 48 }, (_, i) => file(`z${i}.dat`, kinds[i % kinds.length], 10 ** (3 + (i % 6)), "trashed"))).w;
    let need = 0;
    for (const z of big.zombies) need += z.maxHp + z.shieldMax;
    expect(big.player.ammo).toBeGreaterThan(small.player.ammo);
    expect(big.player.ammo).toBeLessThanOrEqual(MAX_AMMO);
    // what you start with plus what the zombies give back covers the round with room to miss
    expect(big.player.ammo + big.zombies.reduce((n, z) => n + lootFor(z), 0)).toBeGreaterThan(need * 1.2);

    const { w, run } = rig([trashed("thing.bin", "unknown", 1_000)]);
    arena(w);
    const z = w.zombies[0];
    front(w, z, 3, 0);
    w.player.ammo = 0;
    run(1, ["fire"]);
    expect(w.player.cd).toBeLessThanOrEqual(12); // 8 with staples
    z.hp = 1;
    hitZombie(w, z, 1, w.player.x, w.player.y);
    expect(w.player.ammo).toBe(lootFor(z));
    expect(lootFor(z)).toBeGreaterThan(0);
  });

  it("a sloppy player can win the biggest rounds, with or without kept files", () => {
    const kinds: ArcadeFile["kind"][] = ["image", "pdf", "markdown", "audio", "video", "archive", "installer", "unknown", "xlsx", "json"];
    // 48 binned files of every kind, nothing kept: no pickups at all
    const junk: ArcadeRound = { source: "Plan", files: Array.from({ length: 60 }, (_, i) => file(`junk-${i}.dat`, kinds[i % kinds.length], 2000 * 3 ** (i % 11), i % 5 ? "trashed" : "deleted")) };
    // a photo cleanup: 40 flashing picture zombies
    const photos: ArcadeRound = {
      source: "Plan",
      files: [
        ...Array.from({ length: 40 }, (_, i) => file(`img-${i}.jpg`, "image", 500_000 + i * 150_000, i % 6 ? "trashed" : "deleted")),
        ...Array.from({ length: 10 }, (_, i) => file(`keep-${i}.jpg`, "image", 2_000_000, "kept")),
      ],
    };
    // big rounds are several floors, so this crosses every theme
    const themes = new Set<string>();
    for (const round of [junk, photos])
      for (const seed of [1, 2, 3]) {
        const r = autoPlay(round, seed, 10, 0.04, themes);
        expect(r?.won).toBe(true);
        expect(r!.defeated).toBe(r!.foes);
      }
    expect(themes.size).toBe(THEMES.length);
  });

  it("a player holding fire and moving survives the first 10 seconds", () => {
    const kinds: ArcadeFile["kind"][] = ["image", "pdf", "markdown", "audio", "video", "archive", "installer", "unknown"];
    const crowd: ArcadeRound = { source: "Plan", files: Array.from({ length: 48 }, (_, i) => file(`z${i}.dat`, kinds[i % kinds.length], 10 ** (3 + (i % 6)), i % 4 ? "trashed" : "deleted")) };
    for (const round of [sampleRound(), crowd])
      for (const seed of [1, 2, 3, 4, 5])
        for (const hold of [["up", "fire"], ["right", "up", "fire"], ["fire", "alt", "left"]] as Button[][]) {
          const t = harness(game, round, seed);
          const w = (t.game as UndeleteGame).world;
          t.run(300, hold, 50);
          expect(t.result()).toBeNull();
          expect(w.player.hp).toBeGreaterThan(0);
        }
  });
});


describe("undelete: mouse piloting", () => {
  function captured() {
    const r = rig([trashed("x.bin", "unknown", 100)]);
    arena(r.w);
    r.w.zombies.forEach((z) => (z.dmg = 0));
    return r;
  }
  /** One tick with the mouse captured (or not), moved `dx`, and a click and/or a held button. */
  function tick(r: ReturnType<typeof rig>, input: KeyInput, o: { on?: boolean; dx?: number; click?: boolean; hold?: boolean }) {
    input.setCaptured(o.on ?? true);
    if (o.dx) input.look(o.dx);
    if (o.click) input.pointerDown();
    if (!o.hold && !o.click) input.pointerUp();
    step(r.w, { input, sfx: () => {}, end: () => {} });
    if (o.click && !o.hold) input.pointerUp();
    input.endTick();
  }

  it("sideways mouse movement turns while captured (clamped per tick), not otherwise", () => {
    const r = captured();
    const input = new KeyInput();
    tick(r, input, { on: false, dx: 50 });
    expect(r.w.player.a).toBe(0);
    tick(r, input, { dx: 50 });
    expect(r.w.player.a).toBeCloseTo(50 * 0.004);
    tick(r, input, { dx: -50 });
    expect(r.w.player.a).toBeCloseTo(0);
    tick(r, input, { dx: 5000 });
    expect(r.w.player.a).toBeCloseTo(0.35);
  });

  it("the click that captures the mouse doesn't fire; clicks after do, and holding keeps firing at the normal rate", () => {
    const r = captured();
    const input = new KeyInput();
    // the capturing click: not captured yet on its tick, captured while still held
    tick(r, input, { on: false, click: true, hold: true });
    tick(r, input, { hold: true });
    tick(r, input, { hold: true });
    expect(r.w.shots).toBe(0);
    tick(r, input, {});
    tick(r, input, { click: true });
    expect(r.w.shots).toBe(1);
    for (let i = 0; i < 9; i++) tick(r, input, {});
    tick(r, input, { click: true, hold: true });
    for (let i = 0; i < 23; i++) tick(r, input, { hold: true });
    expect(r.w.shots).toBe(1 + 3); // 24 ticks at one shot per 8
    tick(r, input, {});
    for (let i = 0; i < 20; i++) tick(r, input, {});
    expect(r.w.shots).toBe(4);
    // let go of the mouse (Esc): holding the button no longer fires
    tick(r, input, { click: true, hold: true });
    for (let i = 0; i < 10; i++) tick(r, input, { on: false, hold: true });
    expect(r.w.shots).toBe(5);
  });

  it("when a click can't capture the mouse, the pointer's position steers and the button fires", () => {
    const r = captured();
    const input = new KeyInput();
    input.pointer(300); // right side of the 320-wide view
    tick(r, input, { on: false });
    expect(r.w.player.a).toBe(0); // nothing until the mouse has been clicked
    tick(r, input, { on: false, click: true });
    for (let i = 0; i < 6; i++) tick(r, input, { on: false });
    expect(r.w.pointerSteer).toBe(true);
    const a = r.w.player.a;
    tick(r, input, { on: false });
    expect(r.w.player.a).toBeGreaterThan(a);
    input.pointer(160); // the middle: no turning
    const b = r.w.player.a;
    tick(r, input, { on: false });
    expect(r.w.player.a).toBeCloseTo(b);
    const shots = r.w.shots;
    for (let i = 0; i < 10; i++) tick(r, input, { on: false });
    tick(r, input, { on: false, click: true });
    expect(r.w.shots).toBe(shots + 1);
    // a later capture switches back to movement steering
    tick(r, input, {});
    expect(r.w.pointerSteer).toBe(false);
  });

  it("the keys still work while the mouse is captured: walk, strafe, turn, fire", () => {
    const r = captured();
    const input = new KeyInput();
    input.setCaptured(true);
    input.keydown("w");
    input.keydown(" ");
    const x = r.w.player.x;
    for (let i = 0; i < 10; i++) (step(r.w, { input, sfx: () => {}, end: () => {} }), input.endTick());
    expect(r.w.player.x).toBeGreaterThan(x + 0.5);
    expect(r.w.shots).toBeGreaterThan(0);
    input.keydown("ArrowRight");
    for (let i = 0; i < 4; i++) (step(r.w, { input, sfx: () => {}, end: () => {} }), input.endTick());
    expect(r.w.player.a).toBeGreaterThan(0.2);
  });
});

describe("undelete: weapons", () => {
  function range() {
    const r = rig([trashed("a.bin", "unknown", 1e6), trashed("b.bin", "unknown", 1e6), trashed("c.bin", "unknown", 1e6)]);
    arena(r.w);
    r.w.zombies.forEach((z) => Object.assign(z, { dmg: 0, hp: 9, maxHp: 9 }));
    return r;
  }

  it("weapon perks give one of their family's guns; any gun's shots run out back to staples", () => {
    const { w, run } = range();
    for (const gun of SPECIAL_GUNS) {
      arm(w, gun, 2);
      expect(gunOf(w.player)).toBe(gun);
      run(1, ["fire"]);
      expect(w.player.gunLeft).toBe(1);
      w.player.cd = 0;
      run(1, ["fire"]);
      expect(gunOf(w.player)).toBe("basic");
      expect(w.msg.text).toContain("BACK TO STAPLES");
      w.player.cd = 0;
    }
    // the same gun again adds shots; another one replaces it
    arm(w, "beam", 5);
    arm(w, "beam", 5);
    expect([w.player.gun, w.player.gunLeft]).toEqual(["beam", 10]);
    arm(w, "burst", 4);
    expect([w.player.gun, w.player.gunLeft, w.player.gunMax]).toEqual(["burst", 4, 4]);
    // specials don't use staples
    const ammo = w.player.ammo;
    w.player.cd = 0;
    run(1, ["fire"]);
    expect(w.player.ammo).toBe(ammo);
    for (const gun of SPECIAL_GUNS) expect(GUN[gun].shots(10)).toBeGreaterThan(GUN[gun].shots(1));
  });

  it("beam: pierces every zombie in the line", () => {
    const { w, run } = range();
    const [a, b] = w.zombies;
    front(w, a, 2, 0);
    front(w, b, 4, 0);
    arm(w, "beam", 5);
    run(1, ["fire"]);
    expect(a.hp).toBe(7);
    expect(b.hp).toBe(7);
  });

  it("ricochet: bounces off a wall to hit a zombie the staple couldn't reach straight", () => {
    const { w, run } = range();
    const z = w.zombies[0];
    // behind you: the staple goes to the east wall and comes back
    w.player.x = w.maze.w - 5;
    Object.assign(z, { x: w.player.x - 2, y: w.player.y, face: 0, awake: true });
    arm(w, "bounce", 5);
    run(1, ["fire"]);
    expect(z.hp).toBe(9 - 2);
    // the plain stapler can't
    const { w: w2, run: run2 } = range();
    w2.player.x = w2.maze.w - 5;
    Object.assign(w2.zombies[0], { x: w2.player.x - 2, y: w2.player.y });
    run2(1, ["fire"]);
    expect(w2.zombies[0].hp).toBe(9);
  });

  it("shredder: shreds up close, does nothing far off", () => {
    const { w, run } = range();
    const [near, far] = w.zombies;
    front(w, near, 1.2, 0);
    front(w, far, BURST_RANGE + 2, 0);
    far.y += 3;
    arm(w, "burst", 5);
    run(1, ["fire"]);
    expect(w.lastRays).toBe(7);
    expect(near.hp).toBeLessThanOrEqual(9 - 3);
    const r2 = range();
    front(r2.w, r2.w.zombies[0], BURST_RANGE + 1, 0);
    arm(r2.w, "burst", 5);
    r2.run(1, ["fire"]);
    expect(r2.w.zombies[0].hp).toBe(9);
  });

  it("file zombies sometimes drop a weapon; picking it up arms it but isn't a friend collected", () => {
    let drops = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const { w } = rig([file("old.pdf", "pdf", 1e6, "deleted"), trashed("x.png", "image", 1e6)], seed);
      arena(w);
      for (const z of w.zombies.slice(0, 2)) ((z.shield = 0), hitZombie(w, z, 99, z.x, z.y));
      const dropped = w.pickups.filter((pk) => !pk.friend && !pk.taken);
      for (const pk of dropped) {
        expect(SPECIAL_GUNS).toContain(pk.gun);
        collect(w, pk);
        expect(gunOf(w.player)).toBe(pk.gun);
        expect(w.collected).toBe(0);
      }
      drops += dropped.length;
    }
    expect(drops).toBeGreaterThan(0);
    expect(drops).toBeLessThan(18);
  });

  it("the HUD and the view draw with every gun in hand and every pickup on the floor", () => {
    const t = harness(game, sampleRound(), 1);
    const w = (t.game as UndeleteGame).world;
    t.run(50);
    for (const gun of SPECIAL_GUNS) {
      w.pickups.push({ friend: null, gun, x: w.player.x + Math.cos(w.player.a) * 1.5, y: w.player.y + Math.sin(w.player.a) * 1.5, taken: false });
      arm(w, gun, 3);
      t.run(3, ["fire"], 1);
    }
  });
});

describe("undelete: floors and themes", () => {
  const kinds: ArcadeFile["kind"][] = ["image", "pdf", "markdown", "audio", "video", "archive", "installer", "unknown"];
  const big = (n: number, folders?: string[]): ArcadeRound => ({
    source: "Plan",
    folders,
    files: Array.from({ length: n }, (_, i) => file(`z${i}.dat`, kinds[i % kinds.length], 10 ** (3 + (i % 6)), i % 4 ? "trashed" : "deleted")),
  });

  it("small rounds are one floor, big ones up to four, with every zombie on exactly one", () => {
    expect(levelsFor(10)).toBe(1);
    expect(levelsFor(15)).toBe(1);
    expect(levelsFor(16)).toBe(2);
    expect(levelsFor(48)).toBe(4);
    const w = rig(big(48).files).w;
    expect(w.levels.length).toBe(4);
    const ids = w.levels.flatMap((l) => l.zombies.map((z) => z.id));
    expect(new Set(ids).size).toBe(48);
    expect(w.foes).toBe(48);
    expect(w.zombies).toBe(w.levels[0].zombies);
  });

  it("titles name the level and a folder, cycling through the round's folders", () => {
    expect(levelTitle(0, ["Downloads", "Photos"])).toBe("LEVEL 1 - DOWNLOADS");
    expect(levelTitle(2, ["Downloads", "Photos"])).toBe("LEVEL 3 - DOWNLOADS");
    expect(levelTitle(1, ["a very long folder name"])).toBe("LEVEL 2 - A VERY LONG F.");
    const t = harness(game, big(40, ["Work", "Music"]), 2);
    const w = (t.game as UndeleteGame).world;
    expect(w.title).toBe("LEVEL 1 - WORK");
  });

  it("clearing a floor loads the next, in another theme, with READY again; the last one wins", () => {
    const t = harness(game, big(40, ["Work", "Music"]), 3);
    const w = (t.game as UndeleteGame).world;
    const titles: string[] = [];
    const themes: string[] = [];
    t.run(50);
    for (let guard = 0; guard < 10 && !t.result(); guard++) {
      titles.push(w.title);
      themes.push(w.theme.id);
      for (const z of w.zombies) if (!z.dead) ((z.shield = 0), hitZombie(w, z, 99, z.x, z.y));
      t.run(2);
      if (w.level === w.levels.length - 1) break;
      expect(w.phase).toBe("clear");
      t.run(60);
      if (!t.result()) {
        expect(w.phase).toBe("ready");
        expect(w.zombies.every((z) => !isWall(w.maze, z.x, z.y))).toBe(true);
        t.run(50);
      }
    }
    expect(titles).toEqual(["LEVEL 1 - WORK", "LEVEL 2 - MUSIC", "LEVEL 3 - WORK"]);
    for (let i = 1; i < themes.length; i++) expect(themes[i]).not.toBe(themes[i - 1]);
    t.run(100);
    expect(t.result()?.won).toBe(true);
    expect(t.result()?.defeated).toBe(40);
  });

  it("themes are picked at random: all of them turn up", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) seen.add(rig([trashed("a.txt", "text", 10)], seed).w.theme.id);
    expect(seen.size).toBe(THEMES.length);
    expect(THEMES.length).toBeGreaterThanOrEqual(4);
  });

  it("every theme's mazes: all floor reachable, everyone on open floor, cover where the theme has it", () => {
    for (const theme of THEMES) {
      let cover = 0;
      for (let seed = 1; seed <= 8; seed++) {
        const { w } = rig(big(24).files, seed);
        enterLevel(w, 0, theme);
        const m = w.maze;
        const steps = reach(m, Math.floor(m.start.x), Math.floor(m.start.y));
        for (let i = 0; i < m.cells.length; i++) if (m.cells[i] === 0) expect(steps[i]).toBeGreaterThanOrEqual(0);
        for (const e of [...w.zombies, ...w.pickups, ...w.props, w.player]) expect(isWall(m, e.x, e.y)).toBe(false);
        for (const z of w.zombies) expect(Math.hypot(z.x - w.player.x, z.y - w.player.y)).toBeGreaterThan(2.5);
        for (const r of m.rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (m.cells[y * m.w + x] === theme.layout.pillar) cover++;
        expect(m.cells.every((c) => c <= 5)).toBe(true);
      }
      expect(cover).toBeGreaterThan(8);
    }
    // the classic layout is the default
    expect(buildMaze(seeded(1), 10, 3).cells).toEqual(buildMaze(seeded(1), 10, 3, CLASSIC).cells);
  });
});

describe("undelete: art", () => {
  it("sprites are the sizes the drawing code expects", () => {
    for (const ability of ["flash", "shield", "teleport", "sonic", "fast", "split", "tank", "basic"] as const)
      for (const frame of ["walkA", "walkB", "swipe"] as const) {
        const p = zombiePixels(ability, frame, true);
        expect([p.w, p.h]).toEqual([ZOMBIE_W, ZOMBIE_H]);
      }
    for (const kind of ["basic", ...SPECIAL_GUNS] as const) {
      expect([gunPixels(kind, false).w, gunPixels(kind, true).h]).toEqual([32, 30]);
      expect([gunCardPixels(kind).w, gunCardPixels(kind).h]).toEqual([12, 15]);
    }
    for (const t of THEMES) for (const kind of t.props) expect([propPixels(kind).w, propPixels(kind).h]).toEqual([10, 10]);
    expect(CARD_SLOT.w).toBe(8);
  });

  it("the shield has a dark window where the file's icon shows", () => {
    for (const cracked of [false, true]) {
      const p = shieldPixels(cracked);
      expect([p.w, p.h]).toEqual([12, 13]);
      for (let y = SHIELD_SLOT.y + 1; y < SHIELD_SLOT.y + SHIELD_SLOT.h - 2; y++)
        for (let x = SHIELD_SLOT.x + 2; x < SHIELD_SLOT.x + SHIELD_SLOT.w - 2; x++) expect(p.data[y * p.w + x]).toBe(px("#0b0614"));
    }
  });
});
