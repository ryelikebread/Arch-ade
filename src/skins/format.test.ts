import { describe, expect, it } from "vitest";
import { normalize, textWidth, _glyphsForTest } from "../pixel/font";
import space from "./builtin/space/manifest.json";
import volcano from "./builtin/volcano/manifest.json";
import { animationFor, caption, castMember, ease, encoreFor, frameAt, parseCastRef, poseAt, propSprite, resolveSprite, validateSkin, type SkinManifest } from "./format";

describe("skin manifests", () => {
  it("built-in skins are valid and animate every action", () => {
    for (const raw of [volcano, space]) {
      const m = validateSkin(raw);
      expect(Array.isArray(m) ? m : [], (raw as { id: string }).id).toEqual([]);
      const ok = m as SkinManifest;
      for (const ev of ["keep", "move", "rename", "trash", "delete"] as const) expect(ok.animations[ev], ev).toBeTruthy();
    }
  });

  it("rejects broken skins with reasons", () => {
    const bad = JSON.parse(JSON.stringify(volcano));
    bad.id = "Bad Id";
    bad.sprites.file = { x: 0, y: 0, w: 1, h: 1 };
    delete bad.animations.move;
    bad.animations.keep.tracks.push({ sprite: "nope", keys: [{ t: 0, x: 0, y: 0 }] });
    bad.animations.trash.tracks[0].keys = [{ t: 0.9, x: 0, y: 0 }, { t: 0.1, x: 0, y: 0 }];
    const errs = validateSkin(bad) as string[];
    expect(errs.join("\n")).toMatch(/id must be/);
    expect(errs.join("\n")).toMatch(/"file" is reserved/);
    expect(errs.join("\n")).toMatch(/animations.move is required/);
    expect(errs.join("\n")).toMatch(/unknown sprite nope/);
    expect(errs.join("\n")).toMatch(/in order/);
    expect(validateSkin("nope")).toEqual(["manifest is not a JSON object"]);
  });

  it("plays an encore after every Nth listed decision", () => {
    const m = JSON.parse(JSON.stringify(volcano));
    const bonus = { duration: 1200, tracks: [], sounds: [{ at: 0, sfx: "chime" }] };
    m.encore = { on: ["move"], every: 3, animations: [bonus] };
    const ok = validateSkin(m) as SkinManifest;
    expect(Array.isArray(ok) ? ok : []).toEqual([]);
    expect(encoreFor(ok, "move", { move: 2 }, 0)).toBeNull();
    expect(encoreFor(ok, "move", { move: 3 }, 0.5)).toEqual(bonus);
    expect(encoreFor(ok, "keep", { move: 3 }, 0)).toBeNull();
    expect(encoreFor(ok, "move", { move: 6 }, 0.99)).toEqual(bonus);
    m.encore = { on: ["nope"], every: 0, animations: [] };
    const errs = (validateSkin(m) as string[]).join("\n");
    expect(errs).toMatch(/encore.on/);
    expect(errs).toMatch(/encore.every/);
    expect(errs).toMatch(/encore.animations/);
  });

  it("picks a random variant for an action, each with its own sounds", () => {
    const m = JSON.parse(JSON.stringify(volcano));
    const alt = { ...JSON.parse(JSON.stringify(m.animations.trash)), sounds: [{ at: 0, sfx: "chime" }] };
    m.variants = { trash: [alt] };
    const ok = validateSkin(m) as SkinManifest;
    expect(Array.isArray(ok) ? ok : []).toEqual([]);
    expect(animationFor(ok, "trash", 0.1)!.anim).toBe(ok.animations.trash);
    expect(animationFor(ok, "trash", 0.9)!.cues).toEqual([{ at: 0, sfx: "chime" }]);
    m.variants = { nope: [] };
    expect((validateSkin(m) as string[]).join()).toMatch(/unknown action nope/);
  });

  it("scene props can change as decisions add up", () => {
    const sprite = Object.keys(volcano.sprites)[0];
    const p = { sprite, x: 0, y: 0, tally: { on: ["keep" as const], sprites: [sprite + "1", sprite + "2"] } };
    expect(propSprite(p, {})).toBe(sprite);
    expect(propSprite(p, { keep: 1, move: 4 })).toBe(sprite + "1");
    expect(propSprite(p, { keep: 9 })).toBe(sprite + "2");
  });

  it("casts a new member in a role after each decision", () => {
    const m = JSON.parse(JSON.stringify(volcano));
    const sprite = Object.keys(m.sprites)[0];
    m.sprites["ann.walk"] = m.sprites["bo.walk"] = m.sprites[sprite];
    m.cast = { hero: { members: ["ann", "bo"] } };
    m.scene.push({ sprite: "@hero.walk", x: 0, y: 0, idle: true });
    m.animations.keep.tracks.push({ sprite: "@hero+1.walk", keys: [{ t: 0, x: 0, y: 0 }] });
    const ok = validateSkin(m) as SkinManifest;
    expect(Array.isArray(ok) ? ok : []).toEqual([]);
    expect(parseCastRef("@hero+1.walk")).toEqual({ role: "hero", ahead: 1, suffix: ".walk" });
    expect(parseCastRef("plain")).toBeNull();
    expect(castMember(ok.cast!.hero, {})).toBe("ann");
    expect(resolveSprite(ok, "@hero.walk", { trash: 1 })).toBe("bo.walk");
    expect(resolveSprite(ok, "@hero+1.walk", { trash: 1 })).toBe("ann.walk"); // wraps round
    expect(resolveSprite(ok, sprite, { trash: 1 })).toBe(sprite);
    // A member missing a pose, an unknown role and a bad idle flag are all caught.
    delete m.sprites["bo.walk"];
    m.scene.push({ sprite: "@villain.walk", x: 0, y: 0 }, { sprite, x: 0, y: 0, idle: "yes" });
    const errs = (validateSkin(m) as string[]).join("\n");
    expect(errs).toMatch(/unknown sprite @hero.walk/);
    expect(errs).toMatch(/unknown sprite @villain.walk/);
    expect(errs).toMatch(/idle must be true or false/);
  });
});

describe("animation timing", () => {
  const keys = [{ t: 0.2, x: 0, y: 0 }, { t: 0.6, x: 40, y: 10, arc: 8 }, { t: 1, x: 40, y: 10, alpha: 0 }];
  it("is off stage outside its keys", () => {
    expect(poseAt(keys, 0.1)).toBeNull();
    expect(poseAt(keys, 0.2)).toMatchObject({ x: 0, y: 0, alpha: 1, scale: 1 });
  });
  it("interpolates with a hop in the middle", () => {
    const mid = poseAt(keys, 0.4)!;
    expect(mid.x).toBeCloseTo(20);
    expect(mid.y).toBeCloseTo(5 - 8);
    expect(poseAt(keys, 0.8)!.alpha).toBeCloseTo(0.5);
  });
  it("eases and picks frames", () => {
    expect(ease("in", 0.5)).toBeCloseTo(0.25);
    expect(ease("out", 0.5)).toBeCloseTo(0.75);
    expect(ease(undefined, 0.3)).toBeCloseTo(0.3);
    expect(frameAt(4, 10, 250)).toBe(2);
    expect(frameAt(4, 10, 450)).toBe(0);
    expect(frameAt(4, undefined, 450)).toBe(0);
    expect(frameAt(4, 10, 450, true)).toBe(3);
    expect(frameAt(4, 10, -50, true)).toBe(0);
  });
  it("fills captions", () => {
    expect(caption("TO {dest}: {name}", { name: "a.jpg", dest: "Photos" })).toBe("TO Photos: a.jpg");
    expect(caption("{newName}", { name: "a" })).toBe("");
  });
});

describe("pixel font", () => {
  it("has 3x5 glyphs and draws anything", () => {
    for (const [c, rows] of Object.entries(_glyphsForTest)) {
      expect(rows.length, c).toBe(5);
      for (const r of rows) expect(r.length, c).toBe(3);
    }
    expect(normalize("Café 2026 ✓")).toBe("CAFE 2026 ?");
    expect(textWidth("AB")).toBe(7);
    expect(textWidth("")).toBe(0);
  });
});
