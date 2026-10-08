// Pigeon Court Radio: the skin's bouncy, slightly pompous courtroom march,
// and a calmer tune for the recess. Original, CC0 like the rest.

import type { Song } from "../music";

const STATION = "Pigeon Court Radio";

export const songs: Song[] = [
  {
    id: "order-in-the-coop",
    title: "Order in the Coop",
    station: STATION,
    bpm: 116,
    lead: { wave: "square", vol: 0.12, duty: 0.5 },
    bass: "eighths",
    arpEvery: 4,
    drums: "basic",
    bars: [
      { chord: "Bb", lead: "Bb4:3 C5:1 D5:2 Bb4:2 F5:4 D5:4" },
      { chord: "F", lead: "C5:3 D5:1 Eb5:2 C5:2 A4:4 F4:4" },
      { chord: "Eb", lead: "G4:2 Bb4:2 Eb5:3 D5:1 C5:2 Bb4:2 G4:4" },
      { chord: "F", lead: "A4:2 C5:2 F5:6 -:2 F4:2 F4:2" },
      { chord: "Bb", lead: "D5:3 Eb5:1 F5:2 D5:2 Bb5:4 A5:2 G5:2" },
      { chord: "Gm", lead: "G5:3 F5:1 Eb5:2 D5:2 G4:4 Bb4:4" },
      { chord: "Cm", lead: "C5:2 Eb5:2 G5:4 F5:2 Eb5:2 C5:4" },
      { chord: "F", lead: "F5:4 C5:2 A4:2 F4:4 -:4" },
      { chord: "Eb", lead: "Eb5:3 Eb5:1 Eb5:2 G5:2 Bb5:6 -:2" },
      { chord: "Bb", lead: "D5:3 D5:1 D5:2 F5:2 Bb5:6 -:2" },
      { chord: "Cm", lead: "C5:2 D5:2 Eb5:2 F5:2 G5:4 Eb5:4" },
      { chord: "F", lead: "F5:2 G5:2 A5:2 Bb5:2 C6:6 -:2" },
      { chord: "Gm", lead: "Bb5:3 A5:1 G5:2 D5:2 G5:4 Bb5:4" },
      { chord: "Eb", lead: "Bb5:3 G5:1 Eb5:2 G5:2 Bb5:4 Eb6:4" },
      { chord: "F", lead: "D6:2 C6:2 Bb5:2 A5:2 C6:4 A5:4" },
      { chord: "Bb", lead: "Bb5:6 F5:2 D5:2 F5:2 Bb4:4" },
    ],
  },
  {
    id: "recess-crumbs",
    title: "Recess Crumbs",
    station: STATION,
    bpm: 84,
    lead: { wave: "triangle", vol: 0.3 },
    bass: "long",
    arpEvery: 2,
    drums: "soft",
    bars: [
      { chord: "F", lead: "A4:4 C5:4 F5:6 -:2" },
      { chord: "Dm", lead: "E5:4 D5:4 A4:8" },
      { chord: "Bb", lead: "Bb4:2 D5:2 F5:4 E5:2 D5:2 C5:4" },
      { chord: "C", lead: "G4:6 A4:2 C5:8" },
      { chord: "F", lead: "C5:4 A5:4 G5:4 F5:4" },
      { chord: "Am", lead: "E5:6 C5:2 A4:8" },
      { chord: "Bb", lead: "D5:4 F5:4 Bb5:4 D5:4" },
      { chord: "C", lead: "E5:4 G5:4 C6:6 -:2" },
    ],
  },
];
