// More songs for Island Radio. Original, CC0 (see MUSIC_CREDITS.md).
import type { Song } from "../music";

export const songs: Song[] = [
  {
    id: "coconut-cache",
    title: "Coconut Cache",
    station: "Island Radio",
    bpm: 104,
    lead: { wave: "triangle", vol: 0.3 },
    bass: "bounce",
    arpEvery: 2,
    drums: "basic",
    bars: [
      { chord: "F", lead: "C5:2 F5:2 A5:2 F5:2 C6:4 A5:4" },
      { chord: "Bb", lead: "Bb5:3 D6:3 Bb5:2 F5:4 D5:4" },
      { chord: "C", lead: "E5:2 G5:2 C6:2 G5:2 E5:2 C5:2 E5:4" },
      { chord: "F", lead: "F5:6 A5:2 C6:4 -:4" },
      { chord: "Dm", lead: "D6:2 C6:2 A5:2 F5:2 D5:4 F5:4" },
      { chord: "Bb", lead: "D5:3 F5:3 Bb5:2 A5:2 G5:2 F5:4" },
      { chord: "C", lead: "G5:2 A5:2 Bb5:2 G5:2 E5:4 C5:4" },
      { chord: "F", lead: "F5:8 C5:4 F5:4" },
    ],
  },
  {
    id: "hammock-hour",
    title: "Hammock Hour",
    station: "Island Radio",
    bpm: 92,
    lead: { wave: "square", vol: 0.11, duty: 0.125 },
    bass: "bounce",
    arpEvery: 2,
    drums: "basic",
    swing: 0.25,
    bars: [
      { chord: "G", lead: "B4:2 D5:2 G5:3 F#5:1 G5:2 B5:2 A5:4" },
      { chord: "C", lead: "G5:2 E5:2 C5:4 E5:2 G5:2 -:4" },
      { chord: "D", lead: "F#5:2 A5:2 D6:4 C6:2 A5:2 F#5:4" },
      { chord: "G", lead: "G5:8 -:2 D5:2 B4:2 D5:2" },
      { chord: "Em", lead: "E5:2 G5:2 B5:3 A5:1 G5:2 E5:2 G5:4" },
      { chord: "C", lead: "C6:4 A5:2 G5:2 E5:4 G5:4" },
      { chord: "D", lead: "A5:2 B5:2 A5:2 F#5:2 D5:4 F#5:4" },
      { chord: "G", lead: "G5:10 -:6" },
    ],
  },
];
