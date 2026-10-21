import { describe, expect, it } from "vitest";
import { STEPS_PER_BAR } from "../audio/music";
import { songs } from "../audio/songs/dragon-hoard";
import { effects } from "../audio/effects/dragon-hoard";
import { parseLine } from "../audio/synth";
import hoard from "./builtin/dragon-hoard/manifest.json";
import { castMember, propSprite, resolveSprite, validateSkin, type Animation, type SkinManifest } from "./format";

const EVENTS = ["keep", "move", "rename", "trash", "delete"] as const;

describe("dragon hoard skin", () => {
  const m = validateSkin(hoard);
  const ok = m as SkinManifest;
  const all = (ev: (typeof EVENTS)[number]): Animation[] => [ok.animations[ev]!, ...(ok.variants?.[ev] ?? [])];

  it("is valid and animates every action, each with its own sounds", () => {
    expect(Array.isArray(m) ? m : []).toEqual([]);
    expect(ok.size).toEqual([176, 116]);
    expect(ok.music).toBe("dragon-hoard");
    for (const ev of EVENTS)
      for (const a of all(ev)) {
        expect(a.duration).toBeGreaterThanOrEqual(2000);
        expect(a.duration).toBeLessThanOrEqual(3200);
        expect(a.sounds?.length, `${ev} has its own sounds`).toBeGreaterThan(0);
      }
  });

  it("has several outcomes per action", () => {
    expect(all("keep")).toHaveLength(4); // plucked, gilded, mimic, buried in gold
    expect(all("move")).toHaveLength(3); // the princess's kiss, the dragon's claw, the whelp (and the Ark)
    expect(all("rename")).toHaveLength(3); // fire-branded tag, the princess's quill, the wrong grail
    expect(all("trash")).toHaveLength(4); // stomped, burned, eaten, tail-swatted
    expect(all("delete")).toHaveLength(1); // devoured for good
  });

  it("sends in a different adventurer after every decision", () => {
    const hero = ok.cast!.hero;
    expect(hero.members).toEqual(["knight", "ranger", "wizard", "paladin", "barbarian", "rogue", "cleric", "bard", "valkyrie", "druid"]);
    expect(castMember(hero, {})).toBe("knight");
    expect(castMember(hero, { trash: 1 })).toBe("ranger");
    expect(castMember(hero, { keep: 2, move: 1 }, 1)).toBe("barbarian");
    expect(castMember(hero, { rename: 10 })).toBe("knight"); // wraps around
    // Every animation kills the adventurer facing it and walks the next one in.
    for (const ev of EVENTS)
      for (const a of all(ev)) {
        const sprites = a.tracks.map((t) => t.sprite ?? "");
        expect(sprites.some((s) => s.startsWith("@hero.")), ev).toBe(true);
        expect(sprites).toContain("@hero+1.walk");
        expect(resolveSprite(ok, "@hero+1.walk", { move: 3 })).toBe("barbarian.walk");
      }
  });

  it("piles up the bones, one more skeleton per decision", () => {
    const pile = ok.scene!.find((p) => p.tally)!;
    expect(pile.tally!.on).toEqual([...EVENTS]);
    expect(propSprite(pile, {})).toBe("pile0");
    expect(propSprite(pile, { trash: 2, keep: 1 })).toBe("pile3");
    expect(propSprite(pile, { move: 99 })).toBe("pile16");
  });

  it("hides the resting dragon, princess and adventurer while an animation draws its own", () => {
    const idle = ok.scene!.filter((p) => p.idle).map((p) => p.sprite);
    expect(idle).toEqual(expect.arrayContaining(["dragonIdle", "princess", "@hero.hold", "hookah", "glitter"]));
  });

  it("names its effects with the dragon prefix, and uses them all", () => {
    const used = new Set(EVENTS.flatMap((ev) => all(ev).flatMap((a) => a.sounds!.map((c) => c.sfx))));
    for (const name of Object.keys(effects)) {
      expect(name).toMatch(/^dragon[A-Z]/);
      expect(used.has(name), `${name} is used`).toBe(true);
    }
  });

  it("has songs whose bars add up", () => {
    expect(songs.map((s) => s.id)).toEqual(["dragon-hoard", "princess-serenade"]);
    for (const song of songs) {
      expect(song.station).toBe("Lair Radio");
      song.bars.forEach((bar, i) => {
        const notes = parseLine(bar.lead);
        const named = bar.lead.trim().split(/\s+/).filter((tok) => !tok.startsWith("-"));
        expect(notes.filter((n) => n.hz !== null)).toHaveLength(named.length);
        expect(notes.reduce((s, n) => s + n.steps, 0), `${song.id} bar ${i + 1}`).toBe(STEPS_PER_BAR);
      });
    }
  });
});
