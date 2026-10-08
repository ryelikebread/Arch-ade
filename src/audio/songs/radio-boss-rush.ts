// More songs for Boss Rush. Original, CC0 (see MUSIC_CREDITS.md).
import type { Song } from "../music";

export const songs: Song[] = [
  {
    id: "disk-full",
    title: "Disk Full",
    station: "Boss Rush",
    bpm: 160,
    lead: { wave: "square", vol: 0.12, duty: 0.5 },
    bass: "drive",
    arpEvery: 0,
    drums: "rock",
    bars: [
      { chord: "Am", lead: "A5:1 A5:1 C6:2 A5:2 E6:2 D6:2 C6:2 B5:4" },
      { chord: "F", lead: "C6:2 A5:2 F5:2 A5:2 C6:4 F6:4" },
      { chord: "G", lead: "D6:2 B5:2 G5:2 B5:2 D6:2 G6:2 F6:4" },
      { chord: "E", lead: "E6:4 D6:2 C6:2 B5:4 G#5:4" },
      { chord: "Am", lead: "A5:2 E5:2 A5:2 C6:2 E6:4 A6:4" },
      { chord: "Dm", lead: "F6:2 E6:2 D6:2 C6:2 A5:4 D6:4" },
      { chord: "E", lead: "B5:2 G#5:2 E5:2 G#5:2 B5:2 D6:2 E6:4" },
      { chord: "E", lead: "G#6:4 E6:4 B5:4 -:4" },
    ],
  },
  {
    id: "corrupted-archive",
    title: "Corrupted Archive",
    station: "Boss Rush",
    bpm: 144,
    lead: { wave: "saw", vol: 0.16 },
    harmony: { wave: "square", vol: 0.08, duty: 0.25 },
    bass: "drive",
    arpEvery: 0,
    drums: "rock",
    bars: [
      { chord: "Dm", lead: "D5:2 F5:2 A5:2 D6:2 C6:2 A5:2 F5:2 A5:2", harmony: "A4:8 D5:8" },
      { chord: "Bb", lead: "Bb5:4 A5:2 F5:2 D5:4 F5:4", harmony: "F4:8 Bb4:8" },
      { chord: "C", lead: "C6:2 G5:2 E5:2 G5:2 C6:2 E6:2 D6:4", harmony: "G4:8 C5:8" },
      { chord: "A", lead: "C#6:6 A5:2 E5:4 -:4", harmony: "A4:6 E4:2 C#5:4 -:4" },
      { chord: "Dm", lead: "A5:2 A5:1 A5:1 F5:2 D5:2 A5:4 D6:4", harmony: "F4:8 A4:8" },
      { chord: "Bb", lead: "D6:2 C6:2 Bb5:2 A5:2 F5:4 Bb5:4", harmony: "Bb4:8 D5:8" },
      { chord: "C", lead: "G5:2 C6:2 E6:2 G6:2 E6:4 C6:4", harmony: "E5:8 G4:8" },
      { chord: "A", lead: "E6:2 C#6:2 A5:2 E5:2 A5:8", harmony: "C#5:8 E5:8" },
    ],
  },
];
