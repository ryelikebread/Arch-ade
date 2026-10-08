import { describe, expect, it } from "vitest";
import { SONGS, STEPS_PER_BAR } from "../audio/music";
import { isSfx } from "../audio/sfx";
import { parseLine } from "../audio/synth";
import peasoup from "./builtin/peasoup/manifest.json";
import { SKIN_EVENTS, validateSkin, type SkinManifest } from "./format";

describe("peasoup skin", () => {
  it("is valid and animates every action", () => {
    const m = validateSkin(peasoup);
    expect(Array.isArray(m) ? m : []).toEqual([]);
    const ok = m as SkinManifest;
    for (const ev of SKIN_EVENTS) expect(ok.animations[ev], ev).toBeTruthy();
  });

  it("only uses sound effects that exist", () => {
    const m = peasoup as unknown as SkinManifest;
    const anims = [...Object.values(m.animations), ...Object.values(m.variants ?? {}).flat()];
    const cues = [...Object.values(m.sounds ?? {}).flat(), ...anims.flatMap((a) => a?.sounds ?? [])];
    expect(cues.length).toBeGreaterThan(0);
    for (const c of cues) expect(isSfx(c.sfx), c.sfx).toBe(true);
  });

  it("plays its own theme, and every bar on Kitchen Radio adds up", () => {
    expect(SONGS.some((s) => s.id === (peasoup as { music: string }).music)).toBe(true);
    const kitchen = SONGS.filter((s) => s.station === "Kitchen Radio");
    expect(kitchen.length).toBe(2);
    for (const song of kitchen)
      song.bars.forEach((bar, i) => {
        const steps = parseLine(bar.lead).reduce((n, x) => n + x.steps, 0);
        expect(steps, `${song.id} bar ${i + 1}`).toBe(STEPS_PER_BAR);
      });
  });
});
