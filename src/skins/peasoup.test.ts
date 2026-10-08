import { describe, expect, it } from "vitest";
import { SONGS, STEPS_PER_BAR } from "../audio/music";
import { isSfx } from "../audio/sfx";
import { parseLine } from "../audio/synth";
import peasoup from "./builtin/peasoup/manifest.json";
import { SKIN_EVENTS, propSprite, validateSkin, type SkinManifest } from "./format";

describe("peasoup skin", () => {
  it("is valid and animates every action", () => {
    const m = validateSkin(peasoup);
    expect(Array.isArray(m) ? m : []).toEqual([]);
    const ok = m as SkinManifest;
    for (const ev of SKIN_EVENTS) expect(ok.animations[ev], ev).toBeTruthy();
  });

  it("fills the pot as files are kept, and fattens the dog as it's fed", () => {
    const m = peasoup as unknown as SkinManifest;
    const pot = m.scene!.find((p) => p.sprite === "pot")!;
    const dog = m.scene!.find((p) => p.sprite === "dog")!;
    expect(pot.tally?.on).toEqual(["keep"]);
    expect(pot.tally!.sprites.length).toBeGreaterThanOrEqual(5);
    expect(dog.tally?.on).toEqual(["trash", "delete"]);
    expect(propSprite(pot, {})).toBe("pot");
    expect(propSprite(pot, { keep: 1, trash: 4 })).toBe("pot1");
    expect(propSprite(pot, { keep: 99 })).toBe(pot.tally!.sprites.at(-1));
    expect(propSprite(dog, { trash: 1, delete: 1 })).toBe("dog2");
    // Every stage animates like the base sprite and is the same size, so keep overlays line up.
    for (const p of [pot, dog])
      for (const name of p.tally!.sprites) {
        const a = m.sprites[p.sprite], b = m.sprites[name];
        expect([b.w, b.h, b.frames], name).toEqual([a.w, a.h, a.frames]);
      }
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
