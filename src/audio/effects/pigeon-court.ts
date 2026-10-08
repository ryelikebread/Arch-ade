// Sound effects for the Pigeon Court skin: gavel knocks, pigeon coos, a
// cheering gallery, a boo, the bailiff's whistle and clucks, a cell door.
// All original, made from synth voices.

import { noteHz, type Voice } from "../synth";

const n = (name: string) => noteHz(name)!;

/** A short brass-ish note for the stings. */
const brass = (start: number, dur: number, note: string, vol = 0.16): Voice[] => [
  { wave: "saw", start, dur, f0: n(note), vol, attack: 0.01, decay: 1.5, release: 0.05, lp: [3200, 1800] },
  { wave: "square", start, dur, f0: n(note), vol: vol * 0.5, duty: 0.25, decay: 2, release: 0.05 },
];

export const effects: Record<string, Voice[]> = {
  /** A wooden gavel striking the sound block. */
  courtGavel: [
    { wave: "triangle", start: 0, dur: 0.1, f0: 950, f1: 320, vol: 0.55, decay: 38 },
    { wave: "noise", start: 0, dur: 0.05, f0: 7000, vol: 0.35, decay: 70, lp: [4500, 1500] },
    { wave: "square", start: 0, dur: 0.07, f0: 190, f1: 120, vol: 0.18, decay: 30 },
  ],
  /** A pigeon: "coo-rooo". */
  courtCoo: [
    { wave: "sine", start: 0, dur: 0.16, f0: 330, f1: 410, vol: 0.4, attack: 0.03, release: 0.05 },
    { wave: "sine", start: 0.18, dur: 0.4, f0: 410, f1: 300, vol: 0.4, attack: 0.04, release: 0.14, vib: [9, 0.7] },
    { wave: "triangle", start: 0.18, dur: 0.4, f0: 205, f1: 150, vol: 0.12, attack: 0.04, release: 0.14 },
  ],
  /** The gallery cheers: a swell of noise with happy chirps on top. */
  courtCheer: [
    { wave: "noise", start: 0, dur: 1.1, f0: 5000, vol: 0.32, attack: 0.12, release: 0.45, lp: [1400, 2400] },
    ...[0.04, 0.16, 0.25, 0.38, 0.5, 0.63].map((start, i): Voice => ({
      wave: "square", start, dur: 0.12, f0: 620 + ((i * 137) % 300), f1: 820 + ((i * 89) % 260), vol: 0.06, duty: 0.25, vib: [14, 0.6], release: 0.04,
    })),
  ],
  /** Wings flapping. */
  courtFlutter: Array.from({ length: 9 }, (_, i): Voice => ({
    wave: "noise", start: i * 0.05, dur: 0.04, f0: 3200 - i * 120, vol: 0.32 - i * 0.02, decay: 50, lp: [2600, 1200],
  })),
  /** A low, wobbly "booo" from the gallery. */
  courtBoo: [
    { wave: "saw", start: 0, dur: 0.8, f0: 185, f1: 130, vol: 0.16, attack: 0.1, release: 0.25, lp: [900, 450], vib: [5, 0.4] },
    { wave: "saw", start: 0.03, dur: 0.78, f0: 192, f1: 136, vol: 0.12, attack: 0.1, release: 0.25, lp: [900, 450], vib: [6, 0.5] },
    { wave: "noise", start: 0, dur: 0.7, f0: 2000, vol: 0.08, attack: 0.1, release: 0.25, lp: [700, 400] },
  ],
  /** The bailiff's whistle: two trilled blasts. */
  courtWhistle: [
    { wave: "square", start: 0, dur: 0.13, f0: 2600, vol: 0.11, duty: 0.4, vib: [34, 0.8], release: 0.02 },
    { wave: "square", start: 0.18, dur: 0.42, f0: 2600, f1: 2500, vol: 0.11, duty: 0.4, vib: [34, 0.8], release: 0.06 },
    { wave: "noise", start: 0.18, dur: 0.42, f0: 9000, vol: 0.04, release: 0.06, lp: [6000, 5000] },
  ],
  /** A chicken: "bok bok bagok". */
  courtCluck: [
    ...[0, 0.13, 0.24, 0.31].map((start, i): Voice => ({
      wave: "square", start, dur: i === 3 ? 0.14 : 0.07, f0: i === 3 ? 900 : 720, f1: i === 3 ? 1100 : 430, vol: 0.18, duty: 0.3, decay: i === 3 ? 8 : 24,
    })),
    ...[0, 0.13, 0.24].map((start): Voice => ({ wave: "noise", start, dur: 0.02, f0: 6000, vol: 0.15, decay: 80 })),
  ],
  /** A heavy door shutting. */
  courtDoor: [
    { wave: "noise", start: 0, dur: 0.22, f0: 1600, vol: 0.4, decay: 20, lp: [1600, 400] },
    { wave: "triangle", start: 0, dur: 0.22, f0: 120, f1: 60, vol: 0.5, decay: 14 },
  ],
  /** Iron bars slamming shut. */
  courtSlam: [
    { wave: "noise", start: 0, dur: 0.45, f0: 3200, f1: 400, vol: 0.55, decay: 9, lp: [3200, 600] },
    { wave: "square", start: 0, dur: 0.6, f0: 330, f1: 310, vol: 0.14, decay: 6 },
    { wave: "square", start: 0, dur: 0.6, f0: 471, f1: 450, vol: 0.09, decay: 7 },
    { wave: "triangle", start: 0, dur: 0.3, f0: 90, f1: 45, vol: 0.5, decay: 10 },
  ],
  /** A short, proud fanfare: not guilty! */
  courtFanfare: [
    ...brass(0, 0.1, "Bb4"), ...brass(0.1, 0.1, "D5"), ...brass(0.2, 0.1, "F5"),
    ...brass(0.3, 0.55, "Bb5", 0.18),
    { wave: "triangle", start: 0.3, dur: 0.55, f0: n("Bb3"), vol: 0.3, decay: 2 },
  ],
  /** A grave three-note sting: guilty. */
  courtDun: [
    ...brass(0, 0.16, "E3", 0.22), ...brass(0.2, 0.16, "E3", 0.22), ...brass(0.4, 0.7, "C3", 0.24),
    { wave: "triangle", start: 0.4, dur: 0.7, f0: n("C2"), vol: 0.35, decay: 1.5 },
  ],
  /** A slide whistle going up and tumbling down: chaos. */
  courtChaos: [
    { wave: "sine", start: 0, dur: 0.32, f0: 480, f1: 1500, vol: 0.28, attack: 0.02 },
    { wave: "sine", start: 0.34, dur: 0.42, f0: 1500, f1: 380, vol: 0.28, vib: [12, 0.8], release: 0.08 },
  ],
};
