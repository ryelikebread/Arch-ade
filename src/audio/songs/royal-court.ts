// Castle Radio: the Royal Court skin's songs. Original, CC0 (see MUSIC_CREDITS.md).

import type { Song } from "../music";

export const songs: Song[] = [
  {
    id: "audience-with-the-king",
    title: "Audience with the King",
    station: "Castle Radio",
    bpm: 96,
    lead: { wave: "square", vol: 0.12, duty: 0.25 },
    bass: "long",
    arpEvery: 2,
    drums: "soft",
    bars: [
      { chord: "D", lead: "D5:4 F#5:2 A5:2 D6:6 C#6:2" },
      { chord: "G", lead: "B5:4 A5:2 G5:2 A5:4 B5:4" },
      { chord: "A", lead: "C#6:2 B5:2 A5:4 E5:4 A5:4" },
      { chord: "D", lead: "F#5:8 -:4 A4:2 D5:2" },
      { chord: "Bm", lead: "D5:2 F#5:2 B5:4 A5:2 G5:2 F#5:4" },
      { chord: "G", lead: "G5:4 B5:2 D6:2 C#6:4 B5:4" },
      { chord: "Em", lead: "E5:2 G5:2 B5:2 E6:2 D6:4 B5:4" },
      { chord: "A", lead: "A5:12 -:4" },
      { chord: "D", lead: "A5:2 F#5:2 D5:4 F#5:2 A5:2 D6:4" },
      { chord: "F#m", lead: "C#6:4 A5:2 F#5:2 C#5:4 F#5:4" },
      { chord: "G", lead: "B5:2 D6:2 B5:2 G5:2 D5:4 G5:4" },
      { chord: "D", lead: "F#5:6 E5:2 D5:8" },
      { chord: "Em", lead: "G5:2 F#5:2 E5:2 G5:2 B5:4 E5:4" },
      { chord: "A", lead: "C#6:2 B5:2 A5:2 G5:2 E5:4 C#5:4" },
      { chord: "G", lead: "D5:2 G5:2 B5:4 A5:2 G5:2 E5:4" },
      { chord: "D", lead: "D5:2 F#5:2 A5:4 D6:8" },
    ],
  },
  {
    id: "the-jesters-jig",
    title: "The Jester's Jig",
    station: "Castle Radio",
    bpm: 132,
    lead: { wave: "triangle", vol: 0.3 },
    bass: "bounce",
    arpEvery: 1,
    drums: "basic",
    bars: [
      { chord: "G", lead: "D5:1 G5:1 B5:2 G5:2 D5:2 G5:1 A5:1 B5:2 D6:4" },
      { chord: "C", lead: "E6:2 C6:2 G5:2 E5:2 G5:2 C6:2 E6:4" },
      { chord: "D", lead: "F#5:2 A5:1 F#5:1 D5:2 F#5:2 A5:2 D6:2 C6:2 A5:2" },
      { chord: "G", lead: "B5:2 G5:2 D5:2 B4:2 G4:4 -:4" },
      { chord: "Em", lead: "E5:1 G5:1 B5:2 E6:2 B5:2 G5:1 B5:1 E6:2 D6:4" },
      { chord: "C", lead: "C6:2 B5:1 A5:1 G5:2 E5:2 C5:4 E5:4" },
      { chord: "D", lead: "A5:1 B5:1 C6:2 A5:2 F#5:2 D5:2 F#5:2 A5:2 C6:2" },
      { chord: "G", lead: "B5:2 A5:1 B5:1 G5:8 -:4" },
    ],
  },
];
