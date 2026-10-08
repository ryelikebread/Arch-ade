// More songs for Arch-ade FM. Original, CC0 (see MUSIC_CREDITS.md).
import type { Song } from "../music";

export const songs: Song[] = [
  {
    id: "folder-by-folder",
    title: "Folder by Folder",
    station: "Arch-ade FM",
    bpm: 120,
    lead: { wave: "square", vol: 0.13, duty: 0.25 },
    bass: "eighths",
    arpEvery: 1,
    drums: "basic",
    bars: [
      { chord: "C", lead: "C5:2 E5:2 G5:2 E5:2 C6:4 G5:4" },
      { chord: "G", lead: "B5:2 A5:2 G5:2 D5:2 G5:6 -:2" },
      { chord: "Am", lead: "A5:2 C6:2 B5:2 A5:2 E5:4 C5:4" },
      { chord: "F", lead: "F5:4 A5:2 G5:2 F5:2 E5:2 C5:4" },
      { chord: "C", lead: "E5:2 G5:2 C6:2 D6:2 E6:4 C6:4" },
      { chord: "G", lead: "D6:2 C6:2 B5:2 G5:2 D5:4 G5:4" },
      { chord: "F", lead: "A5:2 G5:2 F5:2 A5:2 C6:4 A5:4" },
      { chord: "G", lead: "B4:2 D5:2 G5:4 F5:4 D5:4" },
    ],
  },
  {
    id: "rename-everything",
    title: "Rename Everything",
    station: "Arch-ade FM",
    bpm: 126,
    lead: { wave: "square", vol: 0.12, duty: 0.125 },
    harmony: { wave: "square", vol: 0.06, duty: 0.25 },
    bass: "eighths",
    arpEvery: 2,
    drums: "basic",
    bars: [
      { chord: "Em", lead: "E5:2 G5:2 B5:4 A5:2 G5:2 F#5:2 G5:2", harmony: "G4:8 B4:8" },
      { chord: "C", lead: "E5:4 C5:2 E5:2 G5:6 -:2", harmony: "C5:8 G4:8" },
      { chord: "G", lead: "D5:2 G5:2 B5:2 D6:2 B5:4 G5:4", harmony: "B4:8 D5:8" },
      { chord: "D", lead: "A5:6 F#5:2 D5:4 -:4", harmony: "D5:6 A4:2 F#4:4 -:4" },
      { chord: "Em", lead: "B5:2 A5:2 G5:2 E5:2 G5:4 B5:4", harmony: "E5:8 G5:8" },
      { chord: "C", lead: "C6:4 B5:2 A5:2 G5:4 E5:4", harmony: "E5:8 C5:8" },
      { chord: "D", lead: "F#5:2 A5:2 D6:2 C6:2 A5:2 F#5:2 A5:4", harmony: "D5:8 F#5:8" },
      { chord: "B", lead: "B5:8 D#5:4 F#5:4", harmony: "F#5:8 B4:8" },
    ],
  },
];
