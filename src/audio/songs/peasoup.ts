// Kitchen Radio: the Peasoup skin's station. Original tunes, CC0 like the rest.
import type { Song } from "../music";

export const songs: Song[] = [
  {
    // The theme: a warm, bouncy tune for chopping along to.
    id: "simmer-down",
    title: "Simmer Down",
    station: "Kitchen Radio",
    bpm: 118,
    lead: { wave: "square", vol: 0.12, duty: 0.25 },
    bass: "bounce",
    arpEvery: 2,
    drums: "basic",
    bars: [
      { chord: "F", lead: "C5:2 F5:2 A5:3 G5:1 F5:2 C5:2 D5:2 F5:2" },
      { chord: "Bb", lead: "D5:3 F5:1 Bb5:4 A5:2 G5:2 F5:4" },
      { chord: "C", lead: "E5:2 G5:2 C6:2 Bb5:2 G5:4 E5:2 C5:2" },
      { chord: "F", lead: "F5:6 A5:2 C6:4 -:4" },
      { chord: "Dm", lead: "D5:2 F5:2 A5:2 F5:2 D6:4 C6:2 A5:2" },
      { chord: "Bb", lead: "Bb5:3 A5:1 G5:2 F5:2 D5:4 F5:4" },
      { chord: "G", lead: "G5:2 B5:2 D6:2 B5:2 G5:2 A5:2 B5:4" },
      { chord: "C", lead: "C6:8 G5:2 E5:2 C5:4" },
      { chord: "Bb", lead: "D6:2 C6:2 Bb5:2 A5:2 Bb5:4 F5:4" },
      { chord: "F", lead: "A5:2 G5:2 F5:2 C5:2 F5:4 A5:4" },
      { chord: "Gm", lead: "G5:3 Bb5:1 D6:4 C6:2 Bb5:2 G5:4" },
      { chord: "C", lead: "E5:2 F5:2 G5:2 A5:2 Bb5:4 C6:4" },
      { chord: "Dm", lead: "D6:4 A5:2 F5:2 D5:4 F5:4" },
      { chord: "Bb", lead: "F5:2 G5:2 A5:2 Bb5:2 D6:6 -:2" },
      { chord: "C", lead: "C6:2 Bb5:2 A5:2 G5:2 E5:4 G5:4" },
      { chord: "F", lead: "F5:10 -:2 C5:2 F5:2" },
    ],
  },
  {
    // Slow Sunday cooking: something on the stove all afternoon.
    id: "sunday-stew",
    title: "Sunday Stew",
    station: "Kitchen Radio",
    bpm: 84,
    lead: { wave: "triangle", vol: 0.3 },
    bass: "long",
    arpEvery: 2,
    drums: "soft",
    bars: [
      { chord: "C", lead: "E5:6 D5:2 C5:4 G4:4" },
      { chord: "Am", lead: "A4:4 C5:4 E5:6 D5:2" },
      { chord: "F", lead: "F5:6 E5:2 D5:4 C5:4" },
      { chord: "G", lead: "D5:8 B4:4 -:4" },
      { chord: "Em", lead: "G5:6 E5:2 B4:4 E5:4" },
      { chord: "Am", lead: "C5:4 E5:4 A5:6 G5:2" },
      { chord: "F", lead: "A5:4 G5:4 F5:4 D5:4" },
      { chord: "C", lead: "C5:12 -:4" },
    ],
  },
];
