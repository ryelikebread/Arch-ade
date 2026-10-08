import { describe, expect, it } from "vitest";
import { parseLine } from "./synth";
import { renderSong, SONGS, songsOn, STEPS_PER_BAR } from "./music";
import { stations } from "../lib/sound";

describe("radio songs", () => {
  it("every bar's lead and harmony add up to one bar", () => {
    for (const song of SONGS)
      song.bars.forEach((bar, i) => {
        for (const line of [bar.lead, bar.harmony]) {
          if (line === undefined) continue;
          const steps = parseLine(line).reduce((n, x) => n + x.steps, 0);
          expect(steps, `${song.title} bar ${i + 1}`).toBe(STEPS_PER_BAR);
        }
      });
  });

  it("songs are 8 or 16 bars with unique ids", () => {
    expect(new Set(SONGS.map((s) => s.id)).size).toBe(SONGS.length);
    for (const song of SONGS) expect([8, 16], song.title).toContain(song.bars.length);
  });

  it("every station has a name and its songs", () => {
    for (const song of SONGS) expect(song.station.trim(), song.id).not.toBe("");
    for (const st of stations().slice(0, -1)) {
      expect(st.name.trim()).not.toBe("");
      expect(songsOn(st.name).length).toBeGreaterThan(0);
    }
  });

  it("each song renders, audible and below clipping", () => {
    for (const song of SONGS) {
      const buf = renderSong(song, 4000);
      expect(buf.length, song.title).toBeGreaterThan(0);
      let peak = 0;
      for (const s of buf) peak = Math.max(peak, Math.abs(s));
      expect(peak, song.title).toBeGreaterThan(0.05);
      expect(peak, song.title).toBeLessThan(1);
    }
  });
});
