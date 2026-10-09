// Heist Radio: the Bank Heist skin's station. Original tunes, CC0 like the rest.
import type { Song } from "../music";

export const songs: Song[] = [
  {
    // The theme: a slinky, tiptoeing caper in A minor with a walking bass.
    id: "bank-heist",
    title: "Bank Heist",
    station: "Heist Radio",
    bpm: 104,
    lead: { wave: "square", vol: 0.11, duty: 0.25 },
    bass: "walk",
    arpEvery: 0,
    drums: "swing",
    swing: 0.25,
    bars: [
      { chord: "Am", lead: "A4:2 -:1 C5:1 -:2 E5:2 Eb5:2 D5:2 C5:2 -:2" },
      { chord: "Dm", lead: "D5:3 F5:1 -:2 A5:2 G#5:2 A5:4 -:2" },
      { chord: "Am", lead: "E5:2 -:1 E5:1 F5:2 E5:2 Eb5:2 D5:2 C5:4" },
      { chord: "E", lead: "B4:2 G#4:2 -:2 E4:2 F4:2 G#4:2 B4:4" },
      { chord: "Am", lead: "A4:1 C5:1 E5:2 -:2 A5:2 G5:2 E5:2 C5:4" },
      { chord: "F", lead: "F5:3 E5:1 F5:2 A5:2 C6:4 B5:2 A5:2" },
      { chord: "Dm", lead: "D6:2 -:2 C6:2 A5:2 F5:2 D5:2 E5:4" },
      { chord: "E", lead: "E5:6 -:2 G#4:2 B4:2 D5:4" },
      { chord: "Dm", lead: "F5:2 -:1 F5:1 A5:2 F5:2 D5:2 F5:2 G#5:4" },
      { chord: "Am", lead: "A5:4 E5:2 C5:2 A4:4 -:4" },
      { chord: "Bb", lead: "Bb4:2 D5:2 F5:2 Bb5:2 A5:2 F5:2 D5:4" },
      { chord: "E", lead: "E5:2 G#5:2 B5:2 E6:2 D6:2 B5:2 G#5:4" },
      { chord: "Am", lead: "C6:3 B5:1 A5:2 E5:2 F5:2 E5:2 Eb5:2 D5:2" },
      { chord: "Dm", lead: "D5:2 F5:2 A5:3 G#5:1 A5:2 D6:2 C6:4" },
      { chord: "E", lead: "B5:2 A5:2 G#5:2 F5:2 E5:2 D5:2 B4:4" },
      { chord: "Am", lead: "A4:6 -:2 E4:2 -:1 A4:1 -:4" },
    ],
  },
  {
    // Foot down, sirens behind: the drive away from the bank.
    id: "getaway-van",
    title: "Getaway Van",
    station: "Heist Radio",
    bpm: 140,
    lead: { wave: "saw", vol: 0.08 },
    bass: "drive",
    arpEvery: 2,
    drums: "rock",
    bars: [
      { chord: "Dm", lead: "D5:2 D5:2 F5:2 D5:2 A5:4 G5:2 F5:2" },
      { chord: "Bb", lead: "F5:2 D5:2 Bb4:2 D5:2 F5:4 Bb5:4" },
      { chord: "C", lead: "E5:2 G5:2 C6:4 Bb5:2 G5:2 E5:4" },
      { chord: "A", lead: "C#5:2 E5:2 A5:6 -:2 G5:2 E5:2" },
      { chord: "Dm", lead: "A5:2 F5:2 D5:2 F5:2 A5:2 D6:2 C6:4" },
      { chord: "Gm", lead: "Bb5:3 A5:1 G5:2 D5:2 G5:4 Bb5:4" },
      { chord: "A", lead: "A5:2 G5:2 F5:2 E5:2 C#5:2 E5:2 A4:4" },
      { chord: "Dm", lead: "D5:8 -:4 A4:2 D5:2" },
    ],
  },
];
