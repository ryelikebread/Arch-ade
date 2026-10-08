import { describe, expect, it } from "vitest";
import { songsOn, STEPS_PER_BAR } from "../audio/music";
import { isSfx } from "../audio/sfx";
import { parseLine } from "../audio/synth";
import { effects } from "../audio/effects/pigeon-court";
import { songs } from "../audio/songs/pigeon-court";
import raw from "./builtin/pigeon-court/manifest.json";
import { validateSkin, type SkinManifest } from "./format";

describe("Pigeon Court skin", () => {
  it("is valid and animates every action", () => {
    const m = validateSkin(raw);
    expect(Array.isArray(m) ? m : []).toEqual([]);
    const ok = m as SkinManifest;
    for (const ev of ["keep", "move", "rename", "trash", "delete"] as const) {
      const a = ok.animations[ev]!;
      expect(a, ev).toBeTruthy();
      expect(a.duration).toBeGreaterThanOrEqual(1500);
      expect(a.duration).toBeLessThanOrEqual(2600);
    }
    expect(ok.music).toBe("order-in-the-coop");
  });

  it("uses only known sounds, and its own effects are prefixed", () => {
    for (const name of Object.keys(effects)) {
      expect(name).toMatch(/^court[A-Z]/);
      expect(isSfx(name)).toBe(true);
    }
  });

  it("has two songs on its station, every bar 16 steps", () => {
    expect(songs.map((s) => s.id)).toContain("order-in-the-coop");
    expect(songsOn("Pigeon Court Radio").length).toBe(2);
    for (const song of songs)
      song.bars.forEach((bar, i) => {
        const steps = parseLine(bar.lead).reduce((sum, n) => sum + n.steps, 0);
        expect(steps, `${song.id} bar ${i + 1}`).toBe(STEPS_PER_BAR);
      });
  });
});
