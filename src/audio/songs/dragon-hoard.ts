// Lair Radio: the Dragon Hoard skin's station. Original tunes, CC0 like the rest.
import type { Song } from "../music";

export const songs: Song[] = [
  {
    // The theme: a heavy, swaggering march in D minor for a dragon on his gold.
    id: "dragon-hoard",
    title: "Dragon Hoard",
    station: "Lair Radio",
    bpm: 92,
    lead: { wave: "saw", vol: 0.08 },
    bass: "long",
    arpEvery: 0,
    drums: "half",
    bars: [
      { chord: "Dm", lead: "D4:3 D4:1 F4:2 A4:2 D5:6 C5:2" },
      { chord: "Bb", lead: "Bb4:4 A4:2 G4:2 F4:4 G4:4" },
      { chord: "C", lead: "E4:3 E4:1 G4:2 C5:2 E5:6 D5:2" },
      { chord: "A", lead: "C#5:4 E5:4 A4:8" },
      { chord: "Dm", lead: "A4:2 D5:2 F5:4 E5:2 D5:2 A4:4" },
      { chord: "Gm", lead: "Bb4:2 D5:2 G5:4 F5:2 D5:2 Bb4:4" },
      { chord: "Bb", lead: "F5:3 E5:1 D5:2 C5:2 Bb4:4 D5:4" },
      { chord: "A", lead: "E5:6 C#5:2 A4:4 -:4" },
      { chord: "F", lead: "C5:2 F5:2 A5:4 G5:2 F5:2 C5:4" },
      { chord: "C", lead: "G5:4 E5:2 C5:2 G4:4 C5:4" },
      { chord: "Dm", lead: "D5:3 F5:1 A5:4 C6:2 A5:2 F5:4" },
      { chord: "A", lead: "E5:2 G5:2 C#6:4 Bb5:2 A5:2 G5:2 E5:2" },
      { chord: "Bb", lead: "F5:4 D5:4 Bb4:4 D5:4" },
      { chord: "Gm", lead: "G5:3 F5:1 D5:4 Bb4:4 G4:4" },
      { chord: "A", lead: "A4:2 C#5:2 E5:2 G5:2 F5:2 E5:2 C#5:4" },
      { chord: "Dm", lead: "D5:8 -:4 A4:2 D4:2" },
    ],
  },
  {
    // The princess's love song: a soft, swaying serenade for her dragon.
    id: "princess-serenade",
    title: "Princess's Serenade",
    station: "Lair Radio",
    bpm: 84,
    lead: { wave: "triangle", vol: 0.2 },
    bass: "lazy",
    arpEvery: 2,
    drums: "soft",
    bars: [
      { chord: "F", lead: "A5:6 G5:2 F5:4 C5:4" },
      { chord: "Dm", lead: "D5:4 F5:4 A5:6 -:2" },
      { chord: "Bb", lead: "Bb5:4 A5:2 G5:2 F5:4 D5:4" },
      { chord: "C", lead: "E5:6 F5:2 G5:8" },
      { chord: "F", lead: "C6:6 A5:2 F5:4 A5:4" },
      { chord: "Am", lead: "E5:4 A5:4 C6:4 B5:2 A5:2" },
      { chord: "Bb", lead: "D6:4 C6:2 Bb5:2 A5:4 G5:4" },
      { chord: "F", lead: "F5:12 -:4" },
    ],
  },
];
