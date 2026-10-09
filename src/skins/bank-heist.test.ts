import { describe, expect, it } from "vitest";
import { STEPS_PER_BAR } from "../audio/music";
import { songs } from "../audio/songs/bank-heist";
import { effects } from "../audio/effects/bank-heist";
import { parseLine } from "../audio/synth";
import heist from "./builtin/bank-heist/manifest.json";
import { encoreFor, validateSkin, type Animation, type SkinManifest } from "./format";

describe("bank heist skin", () => {
  const m = validateSkin(heist);

  it("is valid and animates every action", () => {
    expect(Array.isArray(m) ? m : []).toEqual([]);
    const ok = m as SkinManifest;
    expect(ok.size).toEqual([160, 130]);
    for (const ev of ["keep", "move", "rename", "trash", "delete"] as const) {
      const all: Animation[] = [ok.animations[ev]!, ...(ok.variants?.[ev] ?? [])];
      for (const a of all) {
        expect(a, ev).toBeTruthy();
        expect(a.duration).toBeGreaterThanOrEqual(1500);
        expect(a.duration).toBeLessThanOrEqual(2600);
        expect(a.sounds?.length, `${ev} has its own sounds`).toBeGreaterThan(0);
      }
    }
    expect(ok.music).toBe("bank-heist");
  });

  it("has several outcomes per action", () => {
    const ok = m as SkinManifest;
    expect(ok.variants?.keep).toHaveLength(2); // + SWAT: hero cop, locked in the vault
    expect(ok.variants?.move).toHaveLength(1); // + rope grab: the disguised stroll
    expect(ok.variants?.rename).toHaveLength(1); // + explorer swap: the double-cross
    expect(ok.variants?.trash).toHaveLength(3); // + dye pack: crossfire, showdown, van crash
    expect(ok.variants?.delete).toBeUndefined();
  });

  it("makes a getaway after every fifth move, and the van fills up", () => {
    const ok = m as SkinManifest;
    expect(ok.encore?.on).toEqual(["move"]);
    expect(ok.encore?.every).toBe(5);
    expect(ok.encore?.animations).toHaveLength(3);
    for (const a of ok.encore!.animations) {
      expect(a.duration).toBeLessThanOrEqual(2600);
      expect(a.sounds?.length).toBeGreaterThan(0);
    }
    expect(encoreFor(ok, "move", { move: 4 }, 0)).toBeNull();
    expect(encoreFor(ok, "move", { move: 5 }, 0)).toBe(ok.encore!.animations[0]);
    expect(encoreFor(ok, "keep", { move: 5, keep: 1 }, 0)).toBeNull();
    const van = ok.scene!.find((p) => p.tally);
    expect(van?.tally?.on).toEqual(["move"]);
    expect(van?.tally?.sprites).toHaveLength(5);
  });

  it("names its effects with the heist prefix", () => {
    for (const name of Object.keys(effects)) expect(name).toMatch(/^heist[A-Z]/);
  });

  it("has songs whose bars add up", () => {
    expect(songs.map((s) => s.id)).toEqual(["bank-heist", "getaway-van"]);
    for (const song of songs) {
      expect(song.station).toBe("Heist Radio");
      song.bars.forEach((bar, i) => {
        const notes = parseLine(bar.lead);
        const named = bar.lead.trim().split(/\s+/).filter((tok) => !tok.startsWith("-"));
        expect(notes.filter((n) => n.hz !== null)).toHaveLength(named.length);
        expect(notes.reduce((s, n) => s + n.steps, 0), `${song.id} bar ${i + 1}`).toBe(STEPS_PER_BAR);
      });
    }
  });
});
