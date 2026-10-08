import { describe, expect, it } from "vitest";
import { STEPS_PER_BAR } from "../audio/music";
import { songs } from "../audio/songs/royal-court";
import { effects } from "../audio/effects/royal-court";
import { parseLine } from "../audio/synth";
import royal from "./builtin/royal-court/manifest.json";
import { validateSkin, type SkinManifest } from "./format";

describe("royal court skin", () => {
  it("is valid and animates every action, with variants for keep and trash", () => {
    const m = validateSkin(royal);
    expect(Array.isArray(m) ? m : []).toEqual([]);
    const ok = m as SkinManifest;
    for (const ev of ["keep", "move", "rename", "trash", "delete"] as const) {
      const a = ok.animations[ev]!;
      expect(a, ev).toBeTruthy();
      expect(a.duration).toBeGreaterThanOrEqual(1500);
      expect(a.duration).toBeLessThanOrEqual(2600);
    }
    expect(ok.variants?.keep).toHaveLength(2);
    expect(ok.variants?.trash).toHaveLength(1);
    // The trap door has its own sounds, unlike the dungeon march.
    expect(ok.variants!.trash![0].sounds?.map((c) => c.sfx)).toContain("royalLever");
    expect(ok.music).toBe("audience-with-the-king");
  });

  it("names its effects with the royal prefix", () => {
    for (const name of Object.keys(effects)) expect(name).toMatch(/^royal[A-Z]/);
  });

  it("has songs whose bars add up", () => {
    expect(songs.map((s) => s.id)).toContain("audience-with-the-king");
    for (const song of songs) {
      expect(song.station).toBe("Castle Radio");
      song.bars.forEach((bar, i) => {
        const notes = parseLine(bar.lead);
        const named = bar.lead.trim().split(/\s+/).filter((tok) => !tok.startsWith("-"));
        expect(notes.filter((n) => n.hz !== null)).toHaveLength(named.length);
        expect(notes.reduce((s, n) => s + n.steps, 0), `${song.id} bar ${i + 1}`).toBe(STEPS_PER_BAR);
      });
    }
  });
});
