import { afterEach, describe, expect, it, vi } from "vitest";
import { textWidth } from "../../../pixel/font";
import { cast } from "../../round";
import { file, harness, sampleRound } from "../../testing";
import type { ArcadeFile, ArcadeRound, Cast, Friend, Perk } from "../../types";
import { tagText } from "./draw";
import { game, type BrickGame } from "./index";
import {
  ARMOR_Y, BALL, CELL, END_TICKS, H, LEFT, MAX_BALLS, MAX_ROWS, MIN_FOES, PADDLE_SHORT, PADDLE_W, PADDLE_Y, READY_TICKS, RIGHT,
  aliveBalls, applyPerk, damage, hitsFor, isWide, jammed, step, visible, type Brick, type State,
} from "./logic";

const round = (...files: ArcadeFile[]): ArcadeRound => ({ source: "Plan", files });

function start(r: ArcadeRound | Cast = sampleRound(), seed = 1) {
  const t = harness(game, r, seed);
  const s = (t.game as BrickGame).state;
  return { t, s };
}

/** Past READY, ball still on the paddle. */
function playing(r: ArcadeRound | Cast = sampleRound(), seed = 1) {
  const g = start(r, seed);
  g.t.run(READY_TICKS + 1);
  expect(g.s.phase).toBe("play");
  return g;
}

const brickOf = (s: State, name: string) => s.bricks.find((b) => b.foe?.file?.name === name && b.alive)!;
const overlaps = (a: Brick, b: Brick) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const friend = (perk: Perk, power = 5): Friend => ({ file: file(`${perk}.dat`, "unknown", 10, "kept"), label: perk, family: "other", perk, power });

/** Keep every ball parked on the paddle (so it can't hit anything while we look). */
function park(s: State) {
  for (const b of s.balls) if (b.alive) b.stuck = true;
  s.stuckT = 0;
}

function ticks(s: State, n: number, parked = false) {
  for (let i = 0; i < n; i++) {
    if (parked) park(s);
    step(s);
  }
}

afterEach(() => vi.restoreAllMocks());

describe("brick sort: files become bricks", () => {
  it("every foe file is a brick, with hits from its size", () => {
    const { s } = start();
    const c = s.ctx.cast;
    for (const foe of c.foes) {
      const b = s.bricks.find((x) => x.foe === foe)!;
      expect(b).toBeTruthy();
      expect(b.maxHits).toBe(hitsFor(foe, false));
      expect(b.elite).toBe(foe.elite);
      expect(b.w).toBe(isWide(foe) ? 46 : 22);
    }
    // bigger file, tougher brick
    expect(brickOf(s, "setup.dmg").maxHits).toBeGreaterThan(brickOf(s, "notes.md").maxHits);
    expect(brickOf(s, "clip.mp4").maxHits).toBeGreaterThan(brickOf(s, "thing.bin").maxHits);
    // deleted files are elite
    expect(brickOf(s, "backup.zip").elite).toBe(true);
    // few foes: filler joins (not files), and counts as foes
    expect(s.foes.length).toBe(MIN_FOES);
    expect(s.bricks.filter((b) => b.foe && !b.foe.file).length).toBe(MIN_FOES - c.foes.length);
    // plain wall bricks fill the gaps but aren't foes
    expect(s.bricks.some((b) => !b.foe)).toBe(true);
    // no two bricks overlap
    const live = s.bricks.filter((b) => b.alive);
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) expect(overlaps(live[i], live[j])).toBe(false);
  });

  it("friends hide in bricks spread across the wall", () => {
    const { s } = start();
    const hosts = s.bricks.filter((b) => b.capsules.length);
    expect(hosts.reduce((n, b) => n + b.capsules.length, 0)).toBe(s.friends.length);
    const xs = new Set(hosts.map((b) => b.x));
    expect(xs.size).toBeGreaterThan(s.friends.length / 2);
  });

  it("a big round fits (48 foes, 32 friends) with no overlaps", () => {
    const files = Array.from({ length: 120 }, (_, i) => file(`f${i}.zip`, i % 2 ? "diskImage" : "archive", 1000 * 3 ** (i % 12), i % 3 ? "trashed" : "kept"));
    const { s } = start(round(...files));
    expect(s.foes.length).toBe(48);
    expect(s.friends.length).toBe(32);
    const live = s.bricks.filter((b) => b.alive);
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) expect(overlaps(live[i], live[j])).toBe(false);
    expect(Math.max(...live.map((b) => b.y + b.h))).toBeLessThan(PADDLE_Y - 40);
  });

  it("a wall of big videos (wide sliding bricks) stays above the paddle and every foe gets a brick", () => {
    const videos = (n: number) => Array.from({ length: n }, (_, i) => file(`vid-${i}.mov`, "video", 50_000_000, "trashed"));
    const notes = (n: number) => Array.from({ length: n }, (_, i) => file(`note-${i}.txt`, "text", 500, "trashed"));
    const photos = (n: number) => Array.from({ length: n }, (_, i) => file(`img-${i}.jpg`, "image", 3_000_000, "trashed"));
    const rounds = [round(...videos(48)), round(...videos(36), ...notes(12)), round(...videos(24), ...photos(24)), round(...videos(20), ...notes(28))];
    for (const r of rounds)
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const { t, s } = start(r, seed);
        expect(s.rows).toBeLessThanOrEqual(MAX_ROWS);
        expect(s.defeated).toBe(0); // nobody was left out of the wall
        for (const foe of s.foes) expect(s.bricks.some((b) => b.foe === foe)).toBe(true);
        const live = s.bricks.filter((b) => b.alive);
        for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) expect(overlaps(live[i], live[j])).toBe(false);
        expect(Math.max(...live.map((b) => b.y + b.h))).toBeLessThan(PADDLE_Y - 40);
        // and the ball's serve spot under the wall is clear
        t.run(READY_TICKS + 1);
        for (const b of live) expect(b.y + b.h).toBeLessThan(s.balls[0].y - 40);
      }
  });

  it("fast bricks get room to slide; a boxed-in one revs in place (and is drawn that way)", () => {
    const mixed = round(...Array.from({ length: 48 }, (_, i) => file(`f${i}.bin`, (["video", "image", "text", "unknown"] as const)[i % 4], 4000 * 2 ** (i % 12), "trashed")));
    const videos = round(...Array.from({ length: 48 }, (_, i) => file(`v${i}.mov`, "video", 50_000_000, "trashed")));
    for (const r of [mixed, videos])
      for (const seed of [1, 2, 3]) {
        const { s } = playing(r, seed);
        const fast = s.bricks.filter((b) => b.alive && b.ability === "fast");
        const lo = fast.map((b) => b.x), hi = fast.map((b) => b.x);
        for (let i = 0; i < 300; i++) {
          ticks(s, 1, true);
          fast.forEach((b, k) => ((lo[k] = Math.min(lo[k], b.x)), (hi[k] = Math.max(hi[k], b.x))));
        }
        // every one of them visibly travels (fast foes are placed first, next to a free cell)
        fast.forEach((_, k) => expect(hi[k] - lo[k]).toBeGreaterThanOrEqual(4));
      }
    // box one in on both sides: it jams (and puffs exhaust) instead of looking like a plain brick
    const { s } = playing();
    const b = brickOf(s, "clip.mp4");
    for (const o of s.bricks) if (o !== b && o.alive && o.y === b.y) o.alive = false;
    const wall = (x: number) => ({ ...b, id: 999 + x, x, ability: "basic" as const, foe: null, ref: -1, vx: 0, w: CELL - 2, capsules: [] });
    s.bricks.push(wall(b.x - CELL), wall(b.x + b.w + 2));
    ticks(s, 30, true);
    expect(jammed(b)).toBe(true);
    expect(s.parts.some((p) => p.life > 0 && p.color === "#a493c4")).toBe(true);
    // a neighbor breaks: it slides off again
    s.bricks[s.bricks.length - 1].alive = false;
    ticks(s, 60, true);
    expect(jammed(b)).toBe(false);
    expect(b.run).toBeGreaterThan(5);
  });

  it("deleted (elite) bricks always take more hits than the same file trashed", () => {
    for (const bytes of [100, 3000, 60_000, 400_000, 2e6, 3e7, 2e8, 6e8, 5e9]) {
      const c = cast(round(file("a.bin", "unknown", bytes, "trashed"), file("b.bin", "unknown", bytes, "deleted"), file("c.dmg", "diskImage", bytes, "trashed"), file("d.dmg", "diskImage", bytes, "deleted")));
      const [plain, elite, tank, eliteTank] = ["a.bin", "b.bin", "c.dmg", "d.dmg"].map((n) => c.foes.find((f) => f.file?.name === n)!);
      for (const big of [false, true]) {
        expect(hitsFor(elite, big)).toBeGreaterThan(hitsFor(plain, big));
        expect(hitsFor(eliteTank, big)).toBeGreaterThan(hitsFor(tank, big));
      }
    }
    // and in a real big round
    const files = Array.from({ length: 60 }, (_, i) => file(`f${i}.bin`, "unknown", 1000 * 4 ** (i % 10), i % 2 ? "trashed" : "deleted"));
    const { s } = start(round(...files));
    expect(s.big).toBe(true);
    for (const e of s.bricks.filter((b) => b.elite && !b.half)) {
      const twin = s.bricks.find((b) => b.foe && !b.elite && b.foe.file!.bytes === e.foe!.file!.bytes);
      if (twin) expect(e.maxHits).toBeGreaterThan(twin.maxHits);
    }
  });

  it("wide bricks show a 7-character name tag that keeps a trailing number", () => {
    const tag = (name: string) => tagText({ file: file(name, "video", 1, "trashed"), label: "", family: "video", ability: "fast", hp: 6, elite: false });
    expect(tag("holiday.mov")).toBe("holiday");
    expect(tag("movie-23.mov")).toBe("movi.23");
    expect(tag("movie-24.mov")).toBe("movi.24");
    expect(tag("IMG_20240501_1234.mov")).toBe("IMG.234");
    expect(tag("screenshot.mov")).toBe("screen.");
    for (const n of ["holiday.mov", "movie-23.mov", "IMG_20240501_1234.mov", "a-very-long-file-name.pdf"]) expect(textWidth(tag(n))).toBeLessThanOrEqual(27);
  });
});

describe("brick sort: abilities", () => {
  it("flash bricks blink out but stay solid", () => {
    const { s } = playing();
    const b = brickOf(s, "holiday.jpg");
    expect(b.ability).toBe("flash");
    const seen = new Set<boolean>();
    let hidden = 0;
    for (let i = 0; i < 100; i++) {
      seen.add(visible(s, b));
      if (!visible(s, b)) hidden = s.tick;
      ticks(s, 1, true);
    }
    expect(seen).toEqual(new Set([true, false]));
    while (s.tick !== hidden + 96) ticks(s, 1, true); // same blink phase again: hidden
    expect(visible(s, b)).toBe(false);
    const before = b.hits;
    damage(s, b, 1);
    expect(b.hits).toBe(before - 1);
    expect(visible(s, b)).toBe(true); // a hit lights it up
  });

  it("shield bricks lose their shield before any hits", () => {
    const { s } = playing();
    const b = brickOf(s, "old-report.pdf");
    expect(b.ability).toBe("shield");
    expect(b.shield).toBe(2); // big document: two layers
    const hits = b.hits;
    damage(s, b, 1);
    damage(s, b, 1);
    expect(b.shield).toBe(0);
    expect(b.hits).toBe(hits);
    damage(s, b, 1);
    expect(b.hits).toBe(hits - 1);
  });

  it("teleport bricks jump to an empty slot", () => {
    const { s } = playing();
    const b = brickOf(s, "notes.md");
    expect(b.ability).toBe("teleport");
    const [x0, y0] = [b.x, b.y];
    b.timer = 1;
    ticks(s, 2, true);
    expect(b.warn).toBeGreaterThan(0); // shimmers first
    ticks(s, 25, true);
    expect([b.x, b.y]).not.toEqual([x0, y0]);
    for (const o of s.bricks) if (o !== b && o.alive) expect(overlaps(o, b)).toBe(false);
  });

  it("sonic bricks drop sound waves that shrink the paddle", () => {
    const { s } = playing();
    const b = brickOf(s, "song.mp3");
    expect(b.ability).toBe("sonic");
    b.timer = 1;
    ticks(s, 1, true);
    expect(s.waves.length).toBe(1);
    const w = s.waves[0];
    expect(w.y).toBe(b.y + b.h + 0.7);
    // slow
    ticks(s, 10, true);
    expect(w.y).toBeLessThan(b.y + b.h + 10);
    // put it right over the paddle
    w.x0 = s.paddle.x + s.paddle.w / 2;
    w.y = PADDLE_Y - 3;
    ticks(s, 3, true);
    expect(s.paddle.shrink).toBeGreaterThan(0);
    expect(s.paddle.w).toBe(PADDLE_SHORT);
    ticks(s, 160, true);
    expect(s.paddle.w).toBe(PADDLE_W);
  });

  it("fast bricks slide side to side", () => {
    const { s } = playing();
    const b = brickOf(s, "clip.mp4");
    expect(b.ability).toBe("fast");
    const xs = new Set<number>();
    for (let i = 0; i < 120; i++) {
      ticks(s, 1, true);
      xs.add(Math.round(b.x));
    }
    expect(xs.size).toBeGreaterThan(10);
  });

  it("split bricks break into two halves; the foe is beaten when both are gone", () => {
    const { s } = playing();
    const b = brickOf(s, "backup.zip");
    expect(b.ability).toBe("split");
    const before = s.defeated;
    damage(s, b, b.hits);
    expect(b.alive).toBe(false);
    const halves = s.bricks.filter((x) => x.alive && x.half && x.foe === b.foe);
    expect(halves.length).toBe(2);
    expect(halves.every((h) => h.w < b.w && h.elite)).toBe(true);
    expect(s.defeated).toBe(before);
    damage(s, halves[0], halves[0].hits);
    expect(s.defeated).toBe(before);
    damage(s, halves[1], halves[1].hits);
    expect(s.defeated).toBe(before + 1);
  });

  it("tanks are wide and armored, and blow up their neighbors", () => {
    const { s } = playing();
    const b = brickOf(s, "setup.dmg");
    expect(b.ability).toBe("tank");
    expect(b.w).toBe(46);
    expect(b.maxHits).toBe(Math.ceil(b.foe!.hp / 2) + 1);
    // make sure it has a neighbor: a plain wall brick right next to it
    const n = s.bricks.find((o) => o.alive && !o.foe && !o.capsules.length)!;
    for (const o of s.bricks) if (o !== n && o !== b && o.alive && o.y === b.y && o.x > b.x && o.x < b.x + b.w + 30) o.alive = false;
    n.x = b.x + b.w + 2;
    n.y = b.y;
    damage(s, b, b.hits);
    step(s);
    expect(n.alive).toBe(false);
    expect(s.shake).toBeGreaterThan(0);
  });

  it("basic bricks are plain", () => {
    const { s } = playing();
    const b = brickOf(s, "thing.bin");
    expect(b.ability).toBe("basic");
    expect([b.shield, b.vx, b.maxHits]).toEqual([0, 0, 1]);
    damage(s, b, 1);
    expect(b.alive).toBe(false);
  });
});

describe("brick sort: perks", () => {
  it("health gives a life, more for big files", () => {
    const { s } = playing();
    applyPerk(s, friend("health", 3));
    expect(s.lives).toBe(4);
    applyPerk(s, friend("health", 9));
    expect(s.lives).toBe(6);
  });

  it("armor puts a safety bar under the paddle for a while", () => {
    const { s } = playing();
    applyPerk(s, friend("armor", 2));
    const short = s.armor;
    applyPerk(s, friend("armor", 9));
    expect(s.armor - short).toBeGreaterThan(short);
    const b = s.balls.find((x) => x.alive)!;
    b.stuck = false;
    s.paddle.x = 250;
    b.x = 40;
    b.y = ARMOR_Y - 8;
    b.vx = 0.3;
    b.vy = 1.7;
    ticks(s, 6);
    expect(b.alive).toBe(true);
    expect(b.vy).toBeLessThan(0);
  });

  it("ally sends a helper drone that shoots", () => {
    const { s } = playing();
    applyPerk(s, friend("ally", 6));
    expect(s.drone.t).toBeGreaterThan(0);
    let shots = 0;
    for (let i = 0; i < 60; i++) {
      const n = s.bolts.length;
      ticks(s, 1, true);
      if (s.bolts.length > n) shots++;
    }
    expect(shots).toBeGreaterThan(1);
  });

  it("rapid lets the paddle shoot bolts while fire is held", () => {
    const g = playing();
    g.t.run(10, ["fire"]);
    expect(g.s.bolts.length).toBe(0);
    applyPerk(g.s, friend("rapid", 8));
    g.t.run(4, ["fire"]);
    expect(g.s.bolts.length).toBeGreaterThan(0);
  });

  it("spread is multiball", () => {
    const g = playing();
    g.t.run(5, ["fire"]);
    expect(aliveBalls(g.s)).toBe(1);
    applyPerk(g.s, friend("spread", 8));
    expect(aliveBalls(g.s)).toBe(4);
    for (let i = 0; i < 5; i++) applyPerk(g.s, friend("spread", 10));
    expect(aliveBalls(g.s)).toBe(MAX_BALLS);
  });

  it("ammo stores spare balls: X launches one, and a lost ball is replaced without losing a life", () => {
    const g = playing();
    applyPerk(g.s, friend("ammo", 8));
    expect(g.s.reserve).toBe(2);
    g.t.run(2, ["fire"]);
    g.t.run(1, ["alt"]);
    expect(aliveBalls(g.s)).toBe(2);
    expect(g.s.reserve).toBe(1);
    for (const b of g.s.balls) b.y = H + 20;
    g.t.run(1);
    expect(g.s.lives).toBe(3);
    expect(g.s.reserve).toBe(0);
    expect(aliveBalls(g.s)).toBe(1);
  });

  it("power makes a fireball that pierces bricks", () => {
    const { s } = playing();
    applyPerk(s, friend("power", 5));
    expect(s.fire).toBeGreaterThan(0);
    const target = s.bricks.filter((o) => o.alive).sort((a, b) => b.y - a.y)[0];
    const b = s.balls.find((x) => x.alive)!;
    b.stuck = false;
    b.x = target.x + target.w / 2 - BALL / 2;
    b.y = target.y + target.h + 4;
    b.vx = 0;
    b.vy = -2;
    const hits = target.hits + target.shield;
    ticks(s, 16);
    expect(b.y).toBeLessThan(target.y); // went straight through
    expect(!target.alive || target.hits + target.shield < hits).toBe(true);
  });

  it("points add bonus score by size", () => {
    const { s } = playing();
    const before = s.score;
    applyPerk(s, friend("points", 7));
    expect(s.score - before).toBe(700);
  });

  it("a catch popup stays whole between the walls", () => {
    const long = { file: file("a-very-long-file-name.pdf", "pdf", 50_000, "kept"), label: "A-VERY-LO.", family: "document" as const, perk: "ammo" as const, power: 7 };
    for (const side of [LEFT, RIGHT - PADDLE_W]) {
      const { s } = playing({ foes: [], friends: [long], benched: 0 });
      s.paddle.x = side;
      s.paddle.lastPointer = null;
      s.capsules.push({ x: side === LEFT ? LEFT + 2 : RIGHT - 2, y: PADDLE_Y - 8, friend: 0, alive: true });
      ticks(s, 6, true);
      const p = s.popups.find((x) => x.text.startsWith("A-VERY-LO."))!;
      expect(p).toBeTruthy();
      const w = textWidth(p.text);
      expect(p.x - w / 2).toBeGreaterThanOrEqual(LEFT);
      expect(p.x + w / 2).toBeLessThanOrEqual(RIGHT);
    }
  });

  it("capsules fall from broken bricks and are caught by the paddle", () => {
    const { s } = playing();
    const host = s.bricks.find((b) => b.alive && b.capsules.length)!;
    const n = host.capsules.length;
    expect(s.capsules.length).toBe(0);
    damage(s, host, host.hits + host.shield);
    expect(host.alive).toBe(false);
    expect(s.capsules.length).toBe(n);
    const c = s.capsules[0];
    c.x = s.paddle.x + s.paddle.w / 2;
    c.y = PADDLE_Y - 12;
    ticks(s, 20, true);
    expect(s.collected).toBeGreaterThan(0);
  });
});

describe("brick sort: game flow", () => {
  it("wins when every foe brick is broken (filler and split halves included)", () => {
    const { t, s } = playing();
    for (let guard = 0; guard < 50; guard++) {
      const left = s.bricks.filter((b) => b.alive && b.foe);
      if (!left.length) break;
      for (const b of left) damage(s, b, 99);
    }
    expect(s.bricks.some((b) => b.alive && !b.foe)).toBe(true); // wall bricks don't matter
    t.run(END_TICKS + 5);
    const r = t.result()!;
    expect(r.won).toBe(true);
    expect(r.defeated).toBe(r.foes);
    expect(r.foes).toBe(MIN_FOES);
    expect(r.score).toBeGreaterThan(0);
  });

  it("loses when out of lives", () => {
    const { t, s } = playing();
    s.lives = 1;
    for (const b of s.balls) {
      b.stuck = false;
      b.y = H + 10;
    }
    t.run(1);
    expect(s.phase).toBe("over");
    t.run(END_TICKS + 5);
    const r = t.result()!;
    expect(r.won).toBe(false);
    expect(r.defeated).toBeLessThanOrEqual(r.foes);
  });

  it("a tracking player wins the sample round in a few minutes", () => {
    const { t, s } = start();
    for (let i = 0; i < 30 * 240 && !t.result(); i++) {
      const b = s.balls.filter((x) => x.alive).sort((a, c) => c.y + (c.vy > 0 ? 50 : 0) - (a.y + (a.vy > 0 ? 50 : 0)))[0];
      const target = (b ? b.x + 2 : s.paddle.x + s.paddle.w / 2) + ((i >> 7) & 1 ? 7 : -7);
      const cx = s.paddle.x + s.paddle.w / 2;
      t.run(1, target > cx + 2 ? ["fire", "right"] : target < cx - 2 ? ["fire", "left"] : ["fire"]);
    }
    const r = t.result()!;
    expect(r.won).toBe(true);
    expect(r.defeated).toBe(r.foes);
    expect(r.collected).toBeGreaterThan(0);
  });

  it("holding fire and running around doesn't lose in the first 10 seconds", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { t, s } = start(sampleRound(), seed);
      for (let i = 0; i < 10 && !t.result(); i++) t.run(30, i % 2 ? ["fire", "left"] : ["fire", "right"]);
      expect(t.result()).toBeNull();
      expect(s.lives).toBeGreaterThan(0);
    }
  });

  it("the READY hint names the bricks that count, and the launch hint steps aside for popups", () => {
    const texts: string[] = [];
    const { t, s } = start(round());
    t.ctx.text = (str) => void texts.push(str);
    t.game.draw();
    expect(texts).toContain("BREAK ALL 12 MARKED BRICKS");
    expect(texts).toContain("PLAIN WALL BRICKS ARE OPTIONAL");
    t.run(READY_TICKS + 1);
    const hint = () => {
      texts.length = 0;
      for (let i = 0; i < 16; i++) {
        s.tick++; // (both blink phases)
        t.game.draw();
      }
      s.tick -= 16;
      return texts.includes("SPACE OR CLICK TO LAUNCH");
    };
    expect(hint()).toBe(true);
    s.popups.push({ text: "SHRUNK!", x: 160, y: 140, t: 30, color: "#fff" });
    expect(hint()).toBe(false);
  });

  it("no damage during READY", () => {
    const { s } = start();
    const b = brickOf(s, "thing.bin");
    damage(s, b, 5);
    expect(b.alive).toBe(true);
  });

  it("empty, tiny and big rounds run 600 ticks without throwing", () => {
    const big = round(...Array.from({ length: 200 }, (_, i) => file(`f${i}.bin`, (["image", "pdf", "text", "audio", "video", "archive", "installer", "unknown"] as const)[i % 8], 500 * 4 ** (i % 10), i % 5 < 3 ? "trashed" : i % 5 === 3 ? "deleted" : "kept")));
    for (const r of [round(), round(file("one.txt", "text", 10, "trashed")), round(file("one.txt", "text", 10, "kept")), big]) {
      const { t, s } = start(r);
      expect(() => {
        t.run(200, ["right", "fire"], 1);
        t.run(200, ["left", "alt"], 3);
        t.run(200, ["fire"], 7);
      }).not.toThrow();
      expect(s.defeated).toBeLessThanOrEqual(s.foes.length);
      expect(s.parts.length).toBe(160);
      expect(s.waves.length).toBeLessThanOrEqual(10);
      expect(s.bolts.length).toBeLessThanOrEqual(24);
    }
  });

  it("same seed, same game; different seed, different wall", () => {
    const snap = (seed: number, draws: number) => {
      const { t, s } = start(sampleRound(), seed);
      t.run(300, ["right", "fire"], draws);
      t.run(300, ["left", "fire"], draws);
      return JSON.stringify({ score: s.score, lives: s.lives, bricks: s.bricks.map((b) => [b.x, b.y, b.hits, b.alive]), balls: s.balls.map((b) => [b.x, b.y]) });
    };
    expect(snap(7, 10)).toBe(snap(7, 1)); // drawing more often changes nothing
    const layout = (seed: number) => JSON.stringify(start(sampleRound(), seed).s.bricks.map((b) => [b.x, b.y]));
    expect(layout(1)).not.toBe(layout(2));
  });

  it("uses only ctx.rng and no clocks or timers", () => {
    const boom = () => {
      throw new Error("not allowed");
    };
    const spies = [vi.spyOn(Math, "random"), vi.spyOn(Date, "now"), vi.spyOn(performance, "now"), vi.spyOn(globalThis, "setTimeout"), vi.spyOn(globalThis, "setInterval")];
    let error: unknown = null;
    try {
      for (const spy of spies) spy.mockImplementation(boom as never);
      const { t } = start();
      t.run(900, ["fire", "right"], 1);
    } catch (e) {
      error = e;
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
    expect(error).toBeNull();
  });

  it("ends exactly once and stays harmless afterwards", () => {
    const { t, s } = playing();
    s.lives = 1;
    for (const b of s.balls) (b.stuck = false), (b.y = H + 10);
    t.run(END_TICKS + 10);
    const r = t.result();
    expect(r).not.toBeNull();
    const snap = JSON.stringify([s.score, s.phase, s.tick]);
    // the harness throws if end() is called twice
    for (let i = 0; i < 100; i++) {
      t.game.update(1 / 30);
      t.game.draw();
    }
    expect(JSON.stringify([s.score, s.phase, s.tick])).toBe(snap);
    expect(t.result()).toBe(r);
  });

  it("rate-limits sound effects", () => {
    const { t, s } = start();
    const last = new Map<string, number>();
    let tooSoon = 0;
    s.ctx.sfx = (name) => {
      if (s.tick - (last.get(name) ?? -99) < 4) tooSoon++;
      last.set(name, s.tick);
    };
    t.run(1200, ["fire", "right"]);
    expect(tooSoon).toBe(0);
  });
});
