import { describe, expect, it } from "vitest";
import { normalizeSound, MY_MUSIC, stations, stepStation } from "../lib/sound";
import { fbfKey } from "../lib/fbf";
import { validateSkin } from "../skins/format";
import volcano from "../skins/builtin/volcano/manifest.json";
import space from "../skins/builtin/space/manifest.json";
import { parseLine, noteHz, render } from "./synth";
import { renderSong, songSeconds, SONGS, STEPS_PER_BAR } from "./music";
import { renderSfx, SFX_NAMES } from "./sfx";

const RATE = 8000;
const stats = (buf: Float32Array) => {
  let peak = 0;
  let finite = true;
  for (const s of buf) {
    if (!Number.isFinite(s)) finite = false;
    peak = Math.max(peak, Math.abs(s));
  }
  return { peak, finite };
};

describe("notes", () => {
  it("names to pitches", () => {
    expect(noteHz("A4")).toBe(440);
    expect(noteHz("C#5")!).toBeCloseTo(554.37, 1);
    expect(noteHz("Bb3")!).toBeCloseTo(233.08, 1);
    expect(noteHz("-")).toBeNull();
    expect(() => noteHz("H2")).toThrow();
  });
  it("parses a line", () => {
    expect(parseLine("A4:2 -:2 C5")).toEqual([{ hz: 440, steps: 2 }, { hz: null, steps: 2 }, { hz: noteHz("C5"), steps: 1 }]);
  });
});

describe("songs", () => {
  it("every bar is exactly one bar long", () => {
    for (const song of SONGS)
      song.bars.forEach((bar, i) => {
        const steps = parseLine(bar.lead).reduce((n, x) => n + x.steps, 0);
        expect(steps, `${song.title} bar ${i + 1}`).toBe(STEPS_PER_BAR);
      });
  });
  it("render to clean, audible loops", () => {
    for (const song of SONGS) {
      const buf = renderSong(song, RATE);
      expect(buf.length).toBe(Math.round(songSeconds(song) * RATE));
      const { peak, finite } = stats(buf);
      expect(finite, song.title).toBe(true);
      expect(peak, song.title).toBeGreaterThan(0.1);
      expect(peak, song.title).toBeLessThanOrEqual(1);
    }
  });
  it("one station per song plus My Music", () => {
    const list = stations();
    expect(list.length).toBe(SONGS.length + 1);
    expect(new Set(list.map((s) => s.id)).size).toBe(list.length);
    expect(list[list.length - 1].id).toBe(MY_MUSIC);
    expect(stepStation(list[0].id, -1)).toBe(MY_MUSIC);
    expect(stepStation(MY_MUSIC, 1)).toBe(list[0].id);
  });
});

describe("synth", () => {
  it("wraps sound past the end of a loop to the start", () => {
    const voice = { wave: "square" as const, start: 0.9, dur: 0.2, f0: 100, vol: 0.5 };
    expect(stats(render([voice], RATE, 1, false).subarray(0, 400)).peak).toBe(0);
    expect(stats(render([voice], RATE, 1, true).subarray(0, 400)).peak).toBeGreaterThan(0.3);
  });
});

describe("sound effects", () => {
  it("all render, non-silent and below clipping", () => {
    for (const name of SFX_NAMES) {
      const { peak, finite } = stats(renderSfx(name, RATE));
      expect(finite, name).toBe(true);
      expect(peak, name).toBeGreaterThan(0.05);
      expect(peak, name).toBeLessThanOrEqual(0.95 + 1e-6);
    }
  });
});

describe("settings", () => {
  it("defaults: paused, unmuted, mid volume", () => {
    expect(normalizeSound(undefined)).toEqual({ station: stations()[0].id, playing: false, musicMuted: false, musicVolume: 6, sfxMuted: false, sfxVolume: 7 });
  });
  it("keeps valid values and fixes bad ones", () => {
    const s = normalizeSound({ station: MY_MUSIC, playing: true, musicMuted: true, musicVolume: 14, sfxMuted: "yes", sfxVolume: -2 });
    expect(s).toEqual({ station: MY_MUSIC, playing: true, musicMuted: true, musicVolume: 10, sfxMuted: false, sfxVolume: 0 });
    expect(normalizeSound({ station: "nope" }).station).toBe(stations()[0].id);
  });
  it("Mod+Shift+S opens the Sound menu in File by File", () => {
    const k = { key: "S", metaKey: true, ctrlKey: false, shiftKey: true, altKey: false };
    expect(fbfKey(k, true)).toEqual({ do: "sound" });
    expect(fbfKey({ ...k, key: "s", shiftKey: false, metaKey: false }, true)).toEqual({ do: "skip" });
  });
});

describe("skin sounds", () => {
  it("built-in skins have valid cues for every action", () => {
    for (const raw of [volcano, space]) {
      const m = validateSkin(raw);
      expect(Array.isArray(m) ? m : []).toEqual([]);
      if (!Array.isArray(m)) for (const ev of ["keep", "move", "rename", "trash", "delete"] as const) expect(m.sounds?.[ev]?.length, ev).toBeGreaterThan(0);
    }
  });
  it("rejects unknown sounds and bad timing", () => {
    const bad = { ...volcano, sounds: { keep: [{ sfx: "applause", at: 0 }], trash: [{ sfx: "pop", at: 2 }], jump: [] } };
    const errs = validateSkin(bad) as string[];
    expect(errs.some((e) => e.includes("unknown sound applause"))).toBe(true);
    expect(errs.some((e) => e.includes("at must be 0..1"))).toBe(true);
    expect(errs.some((e) => e.includes("unknown action jump"))).toBe(true);
  });
});
