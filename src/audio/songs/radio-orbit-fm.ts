// More songs for Orbit FM. Original, CC0 (see MUSIC_CREDITS.md).
import type { Song } from "../music";

export const songs: Song[] = [
  {
    id: "satellite-lullaby",
    title: "Satellite Lullaby",
    station: "Orbit FM",
    bpm: 80,
    lead: { wave: "sine", vol: 0.26 },
    harmony: { wave: "sine", vol: 0.1 },
    bass: "long",
    arpEvery: 2,
    drums: "soft",
    bars: [
      { chord: "Gm", lead: "G5:8 Bb5:4 D6:4", harmony: "D5:16" },
      { chord: "Eb", lead: "Eb6:6 D6:2 Bb5:8", harmony: "G5:16" },
      { chord: "Bb", lead: "F5:4 Bb5:4 D6:4 F6:4", harmony: "D5:16" },
      { chord: "F", lead: "C6:12 -:4", harmony: "A5:16" },
      { chord: "Gm", lead: "D6:4 Bb5:4 G5:8", harmony: "Bb4:16" },
      { chord: "Eb", lead: "G5:4 Bb5:4 Eb6:8", harmony: "Bb4:16" },
      { chord: "F", lead: "F6:6 Eb6:2 C6:4 A5:4", harmony: "A4:16" },
      { chord: "D", lead: "F#5:12 -:4", harmony: "D5:16" },
    ],
  },
  {
    id: "zero-g-inbox",
    title: "Zero-G Inbox",
    station: "Orbit FM",
    bpm: 88,
    lead: { wave: "sine", vol: 0.27 },
    bass: "long",
    arpEvery: 1,
    arp: { wave: "sine", vol: 0.04, octave: 5 },
    drums: "soft",
    bars: [
      { chord: "D", lead: "F#5:4 A5:4 D6:6 -:2" },
      { chord: "A", lead: "C#6:4 E6:4 A5:8" },
      { chord: "Bm", lead: "B5:6 D6:2 F#6:8" },
      { chord: "G", lead: "G6:4 F#6:4 D6:4 B5:4" },
      { chord: "D", lead: "A5:8 F#5:4 D5:4" },
      { chord: "A", lead: "E5:4 A5:4 C#6:8" },
      { chord: "G", lead: "B5:4 D6:4 G6:4 F#6:4" },
      { chord: "A", lead: "E6:12 -:4" },
    ],
  },
];
