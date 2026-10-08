import { describe, expect, it } from "vitest";
import { KeyInput } from "./input";
import { cast, filler, label, normalizeArcade, roundFromFbf, roundFromPlan, seeded, seedOf, strength } from "./round";
import { GAME_IDS, GAMES } from "./registry";
import { file, harness, sampleRound } from "./testing";
import type { FileEntry, Plan } from "../types";

describe("casting files", () => {
  it("trashed and deleted files are foes, the rest are friends", () => {
    const c = cast(sampleRound());
    expect(c.foes.length).toBe(8);
    expect(c.friends.length).toBe(8);
    expect(c.benched).toBe(0);
    expect(c.foes.every((f) => f.file && (f.file.fate === "trashed" || f.file.fate === "deleted"))).toBe(true);
  });
  it("bigger files are stronger; deleted ones are elite", () => {
    expect(strength(0)).toBe(1);
    expect(strength(2_000)).toBe(1);
    expect(strength(1_000_000)).toBeGreaterThanOrEqual(5);
    expect(strength(10_000_000_000)).toBe(10);
    const c = cast(sampleRound());
    const zip = c.foes.find((f) => f.file?.name === "backup.zip")!;
    expect(zip.elite).toBe(true);
    expect(zip.hp).toBe(Math.min(10, strength(40_000_000) + 2));
    // biggest first
    expect(c.foes[0].file!.name).toBe("setup.dmg");
  });
  it("kind sets the ability and perk", () => {
    const c = cast(sampleRound());
    const by = (n: string) => c.foes.find((f) => f.file?.name === n)!.ability;
    expect(by("holiday.jpg")).toBe("flash");
    expect(by("old-report.pdf")).toBe("shield");
    expect(by("notes.md")).toBe("teleport");
    expect(by("song.mp3")).toBe("sonic");
    expect(by("clip.mp4")).toBe("fast");
    expect(by("backup.zip")).toBe("split");
    expect(by("setup.dmg")).toBe("tank");
    expect(by("thing.bin")).toBe("basic");
    const perk = (n: string) => c.friends.find((f) => f.file.name === n)!.perk;
    expect([perk("photo.png"), perk("budget.xlsx"), perk("script.json"), perk("mix.mp3"), perk("movie.mov"), perk("bundle.zip"), perk("tool.pkg"), perk("misc.dat")])
      .toEqual(["health", "armor", "ally", "rapid", "spread", "ammo", "power", "points"]);
  });
  it("caps big rounds, spreading the picks across sizes", () => {
    const files = Array.from({ length: 200 }, (_, i) => file(`f${i}.txt`, "text", (i + 1) * 1000, i % 2 ? "kept" : "trashed"));
    const c = cast({ source: "Plan", files }, { foes: 10, friends: 5 });
    expect(c.foes.length).toBe(10);
    expect(c.friends.length).toBe(5);
    expect(c.benched).toBe(185);
    expect(c.foes[0].file!.bytes).toBeGreaterThan(c.foes[9].file!.bytes * 5);
  });
  it("labels are short and drop the extension", () => {
    expect(label("holiday.jpg")).toBe("holiday");
    expect(label("a-very-long-file-name.txt")).toBe("a-very-lo.");
    expect(label(".bashrc")).toBe(".bashrc");
  });
  it("filler foes aren't files", () => {
    const f = filler(3, seeded(1));
    expect(f.length).toBe(3);
    expect(f.every((x) => x.file === null && x.hp === 1)).toBe(true);
  });
  it("seeds are stable per round", () => {
    expect(seedOf(sampleRound())).toBe(seedOf(sampleRound()));
    const a = seeded(5), b = seeded(5);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe("rounds", () => {
  const entry = (name: string, kind: FileEntry["kind"], size: number): FileEntry => ({
    path: `/r/${name}`, rel: name, name, ext: "", kind, kindLabel: kind, isDir: false, isSymlink: false, size,
    created: null, modified: null, added: null, source: null, project: null,
  });
  it("from File by File decisions", () => {
    const r = roundFromFbf([
      { entry: entry("a.jpg", "image", 10), record: { action: "keep", planId: null, dryRun: false } },
      { entry: entry("b.pdf", "pdf", 20), record: { action: "delete", planId: 3, dryRun: false } },
      { entry: { ...entry("dir", "folder", 0), isDir: true }, record: { action: "trash", planId: 4, dryRun: false } },
    ]);
    expect(r.files.map((f) => [f.name, f.fate])).toEqual([["a.jpg", "kept"], ["b.pdf", "deleted"]]);
  });
  it("from an applied plan", () => {
    const plan: Plan = {
      label: "x",
      issues: [],
      ops: [
        { type: "mkdir", path: "/r/Images" },
        { type: "move", from: "/r/a.jpg", to: "/r/Images/a.jpg" },
        { type: "move", from: "/r/b.pdf", to: "/r/c.pdf" },
        { type: "trash", path: "/r/d.zip" },
        { type: "trash", path: "/elsewhere/unknown.bin" },
      ],
    };
    const r = roundFromPlan(plan, [entry("a.jpg", "image", 1), entry("b.pdf", "pdf", 2), entry("d.zip", "archive", 3)]);
    expect(r.files.map((f) => [f.name, f.fate])).toEqual([["a.jpg", "moved"], ["b.pdf", "renamed"], ["d.zip", "trashed"]]);
  });
  it("from a plan with several ops per file, and a name swap through a temp name", () => {
    const plan: Plan = {
      label: "x",
      issues: [],
      ops: [
        { type: "tag", path: "/r/a.jpg", tags: ["x"] },
        { type: "archive", from: "/r/d.zip", to: "/r/old.zip" },
        { type: "move", from: "/r/a.jpg", to: "/r/Images/a.jpg" },
        { type: "move", from: "/r/b.pdf", to: "/r/.arch-ade-tmp-1-0" },
        { type: "move", from: "/r/e.txt", to: "/r/b.pdf" },
        { type: "move", from: "/r/.arch-ade-tmp-1-0", to: "/r/e.txt" },
        { type: "trash", path: "/r/d.zip" },
      ],
    };
    const r = roundFromPlan(plan, [entry("a.jpg", "image", 1), entry("b.pdf", "pdf", 2), entry("d.zip", "archive", 3), entry("e.txt", "text", 4)]);
    expect(r.files.map((f) => [f.name, f.fate])).toEqual([["a.jpg", "moved"], ["b.pdf", "renamed"], ["d.zip", "trashed"], ["e.txt", "renamed"]]);
  });
});

describe("settings and input", () => {
  it("arcade is off by default", () => {
    expect(normalizeArcade(undefined, GAME_IDS)).toEqual({ mode: "off", game: "random" });
    expect(normalizeArcade({ mode: "auto", game: GAME_IDS[1] }, GAME_IDS)).toEqual({ mode: "auto", game: GAME_IDS[1] });
    expect(normalizeArcade({ mode: "loud", game: "pong" }, GAME_IDS)).toEqual({ mode: "off", game: "random" });
  });
  it("pressed lasts one tick, held until released", () => {
    const i = new KeyInput();
    i.keydown(" ");
    expect(i.pressed("fire") && i.held("fire")).toBe(true);
    i.endTick();
    expect(i.pressed("fire")).toBe(false);
    expect(i.held("fire")).toBe(true);
    i.keydown(" "); // key repeat isn't a new press
    expect(i.pressed("fire")).toBe(false);
    i.keyup(" ");
    expect(i.held("fire")).toBe(false);
    expect(i.keydown("q")).toBe(false);
  });
});

describe("every game", () => {
  for (const entry of GAMES) {
    it(`${entry.id}: loads lazily and plays without crashing`, async () => {
      const mod = await entry.load();
      expect(mod.id).toBe(entry.id);
      const [w, h] = mod.size;
      expect(w * h).toBeLessThanOrEqual(320 * 180);
      for (const round of [sampleRound(), { source: "Plan" as const, files: [] }, { source: "Plan" as const, files: [file("one.txt", "text", 10, "kept")] }]) {
        const t = harness(mod, round);
        t.run(90, ["right", "fire"]);
        t.run(90, ["left", "up"]);
        t.run(90, ["down", "alt"]);
        t.run(300, ["fire"]);
        const r = t.result();
        if (r) {
          expect(r.defeated).toBeLessThanOrEqual(r.foes);
          expect(Number.isFinite(r.score)).toBe(true);
        }
      }
    });
  }
});

describe("folders for level titles", () => {
  it("come from where the files were, most files first", async () => {
    const { foldersOf, levelFolders } = await import("./round");
    const f = (folder: string) => ({ name: "x", kind: "text" as const, kindLabel: "Text", bytes: 1, fate: "kept" as const, folder });
    expect(foldersOf([f("Work"), f("Photos"), f("Photos")])).toEqual(["Photos", "Work"]);
    expect(levelFolders({ source: "Plan", files: [] })).toEqual(["Files"]);
  });
});
