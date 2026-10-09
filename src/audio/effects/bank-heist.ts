// Sound effects for the Bank Heist skin (scripts/skins/bank-heist.mjs).
// All original: sirens, alarms, headset chatter, sacks of cash, a van, a
// vault door, a shredder and plenty of cartoon crashes.

import { noteHz, type Voice } from "../synth";

const n = (name: string) => noteHz(name)!;

/** A soft tiptoe step. */
const tiptoe = (start: number): Voice => ({ wave: "triangle", start, dur: 0.05, f0: 520, f1: 380, vol: 0.18, decay: 40 });

export const effects: Record<string, Voice[]> = {
  /** Sliding down a rope from the vent. */
  heistZip: [
    { wave: "noise", start: 0, dur: 0.4, f0: 9000, vol: 0.22, attack: 0.03, release: 0.1, lp: [1200, 5000] },
    { wave: "square", start: 0, dur: 0.35, f0: 1400, f1: 500, vol: 0.06, duty: 0.25, release: 0.1 },
  ],
  /** Headset chatter: a squelch, then two beeps. */
  heistRadio: [
    { wave: "noise", start: 0, dur: 0.12, f0: 6000, vol: 0.2, decay: 14, lp: [4000, 2000] },
    { wave: "square", start: 0.13, dur: 0.06, f0: 1760, vol: 0.12, duty: 0.25 },
    { wave: "square", start: 0.22, dur: 0.08, f0: 2350, vol: 0.12, duty: 0.25 },
  ],
  /** Cash stuffed into a canvas sack. */
  heistSack: [
    { wave: "noise", start: 0, dur: 0.18, f0: 5000, vol: 0.3, attack: 0.02, decay: 10, lp: [2500, 900] },
    { wave: "triangle", start: 0.12, dur: 0.12, f0: 140, f1: 80, vol: 0.4, decay: 18 },
  ],
  /** Sneaking: four quick tiptoes. */
  heistSneak: [0, 0.12, 0.24, 0.36].map(tiptoe),
  /** A casual two-note whistle. */
  heistWhistle: [
    { wave: "sine", start: 0, dur: 0.16, f0: n("G6"), f1: n("C7"), vol: 0.22, attack: 0.02, release: 0.04, vib: [7, 0.2] },
    { wave: "sine", start: 0.2, dur: 0.24, f0: n("A6"), f1: n("E6"), vol: 0.2, attack: 0.02, release: 0.08, vib: [7, 0.3] },
  ],
  /** Banknotes fluttering. */
  heistCash: Array.from({ length: 8 }, (_, i): Voice => ({
    wave: "noise",
    start: i * 0.06,
    dur: 0.06,
    f0: 9000 + ((i * 1733) % 4000),
    vol: 0.16,
    decay: 30,
    lp: [6000, 3000],
  })),
  /** The van's engine revving and pulling away. */
  heistVan: [
    { wave: "saw", start: 0, dur: 0.9, f0: 55, f1: 130, vol: 0.2, attack: 0.05, release: 0.3, vib: [18, 0.6], lp: [600, 1400] },
    { wave: "noise", start: 0, dur: 0.9, f0: 400, vol: 0.12, release: 0.3, lp: [300, 900] },
    { wave: "noise", start: 0.05, dur: 0.25, f0: 8000, vol: 0.12, decay: 8, lp: [3000, 1200] },
  ],
  /** A police siren wailing up and down. */
  heistSiren: [
    { wave: "square", start: 0, dur: 0.45, f0: 700, f1: 1100, vol: 0.09, duty: 0.4, attack: 0.03 },
    { wave: "square", start: 0.45, dur: 0.45, f0: 1100, f1: 700, vol: 0.09, duty: 0.4, release: 0.1 },
  ],
  /** The bank alarm bell. */
  heistAlarm: Array.from({ length: 8 }, (_, i): Voice => ({
    wave: "square",
    start: i * 0.09,
    dur: 0.08,
    f0: i % 2 ? 1250 : 1480,
    vol: 0.1,
    duty: 0.3,
  })),
  /** A smoke bomb hissing out. */
  heistSmoke: [
    { wave: "triangle", start: 0, dur: 0.08, f0: 300, f1: 120, vol: 0.4, decay: 20 },
    { wave: "noise", start: 0.04, dur: 0.8, f0: 14000, vol: 0.25, attack: 0.05, decay: 3, lp: [8000, 2000] },
  ],
  /** A dye pack going off with a wet pop. */
  heistDye: [
    { wave: "noise", start: 0, dur: 0.3, f0: 3000, vol: 0.5, decay: 9, lp: [5000, 600] },
    { wave: "sine", start: 0, dur: 0.25, f0: 300, f1: 60, vol: 0.5, decay: 10 },
    { wave: "square", start: 0.25, dur: 0.35, f0: 600, f1: 300, vol: 0.08, duty: 0.25, vib: [9, 1] },
  ],
  /** The vault door's heavy hinge and wheel. */
  heistVault: [
    { wave: "saw", start: 0, dur: 0.6, f0: 70, f1: 55, vol: 0.18, attack: 0.05, release: 0.2, vib: [22, 1], lp: [500, 300] },
    { wave: "square", start: 0.1, dur: 0.4, f0: 220, f1: 200, vol: 0.05, duty: 0.125, vib: [30, 1.4] },
  ],
  /** A door slamming shut. */
  heistSlam: [
    { wave: "triangle", start: 0, dur: 0.3, f0: 120, f1: 45, vol: 0.7, decay: 12 },
    { wave: "noise", start: 0, dur: 0.15, f0: 4000, vol: 0.3, decay: 25, lp: [2000, 500] },
    { wave: "square", start: 0.02, dur: 0.2, f0: 900, vol: 0.05, duty: 0.2, decay: 15 },
  ],
  /** Muffled knocking from inside the vault. */
  heistKnock: [0, 0.14, 0.28].map((start): Voice => ({ wave: "triangle", start, dur: 0.08, f0: 160, f1: 110, vol: 0.4, decay: 25 })),
  /** A demolition blast. */
  heistBlast: [
    { wave: "noise", start: 0, dur: 0.9, f0: 1500, vol: 0.6, decay: 4, lp: [3000, 200] },
    { wave: "sine", start: 0, dur: 0.6, f0: 110, f1: 35, vol: 0.6, decay: 5 },
  ],
  /** A lit fuse fizzing. */
  heistFuse: [{ wave: "noise", start: 0, dur: 0.6, f0: 16000, vol: 0.14, attack: 0.02, release: 0.1, lp: [9000, 7000] }],
  /** Dropping into sewer water. */
  heistSplash: [
    { wave: "sine", start: 0, dur: 0.12, f0: 600, f1: 140, vol: 0.4, decay: 12 },
    { wave: "noise", start: 0.02, dur: 0.3, f0: 7000, f1: 2000, vol: 0.25, decay: 8, lp: [3000, 700] },
  ],
  /** A smug little sting: the crew is too cool. */
  heistSting: [
    { wave: "square", start: 0, dur: 0.1, f0: n("E5"), vol: 0.12, duty: 0.25 },
    { wave: "square", start: 0.12, dur: 0.1, f0: n("G5"), vol: 0.12, duty: 0.25 },
    { wave: "square", start: 0.24, dur: 0.4, f0: n("D#6"), vol: 0.12, duty: 0.25, vib: [6, 0.3], release: 0.15 },
    { wave: "triangle", start: 0.24, dur: 0.4, f0: n("E3"), vol: 0.3, decay: 3 },
  ],
  /** A sleight of hand: a quick shimmer. */
  heistSwap: (["C6", "E6", "G#6", "C7"] as const).map((name, i): Voice => ({ wave: "triangle", start: i * 0.045, dur: 0.12, f0: n(name), vol: 0.2, decay: 10 })),
  /** The wah-wah of a plan gone wrong. */
  heistBetray: [
    { wave: "saw", start: 0, dur: 0.22, f0: n("D4"), vol: 0.12, lp: [1200, 600], release: 0.05 },
    { wave: "saw", start: 0.24, dur: 0.22, f0: n("C#4"), vol: 0.12, lp: [1200, 600], release: 0.05 },
    { wave: "saw", start: 0.48, dur: 0.6, f0: n("C4"), f1: n("B3"), vol: 0.12, lp: [1200, 400], vib: [5, 0.5], release: 0.2 },
  ],
  /** A cartoon blaster. */
  heistPew: [{ wave: "square", start: 0, dur: 0.12, f0: 2200, f1: 400, vol: 0.14, duty: 0.25, decay: 12 }],
  /** Something flying past fast. */
  heistWhoosh: [{ wave: "noise", start: 0, dur: 0.35, f0: 12000, vol: 0.35, attack: 0.12, release: 0.15, lp: [600, 3500] }],
  /** Robot arms clanking. */
  heistClank: [
    { wave: "square", start: 0, dur: 0.1, f0: 1900, vol: 0.1, duty: 0.2, decay: 25 },
    { wave: "triangle", start: 0, dur: 0.12, f0: 260, f1: 180, vol: 0.35, decay: 20 },
    { wave: "square", start: 0.08, dur: 0.08, f0: 2500, vol: 0.07, duty: 0.2, decay: 30 },
  ],
  /** A comic-book punch. */
  heistPow: [
    { wave: "noise", start: 0, dur: 0.15, f0: 2500, vol: 0.5, decay: 18, lp: [4000, 800] },
    { wave: "triangle", start: 0, dur: 0.18, f0: 200, f1: 70, vol: 0.6, decay: 14 },
  ],
  /** Tires screeching. */
  heistSkid: [
    { wave: "saw", start: 0, dur: 0.4, f0: 1600, f1: 1300, vol: 0.08, vib: [40, 0.8], lp: [5000, 3000], release: 0.1 },
    { wave: "noise", start: 0, dur: 0.4, f0: 12000, vol: 0.12, release: 0.1, lp: [6000, 4000] },
  ],
  /** A car crash: crunch and tinkling glass. */
  heistCrash: [
    { wave: "noise", start: 0, dur: 0.5, f0: 3000, vol: 0.6, decay: 6, lp: [5000, 500] },
    { wave: "triangle", start: 0, dur: 0.3, f0: 150, f1: 50, vol: 0.6, decay: 9 },
    ...[0.15, 0.22, 0.3, 0.36].map((start, i): Voice => ({ wave: "triangle", start, dur: 0.12, f0: 3200 + i * 450, vol: 0.12, decay: 18 })),
  ],
  /** The shredder chewing through bills. */
  heistShred: [
    { wave: "saw", start: 0, dur: 0.7, f0: 90, vol: 0.14, vib: [28, 2], lp: [900, 900], attack: 0.03, release: 0.1 },
    { wave: "noise", start: 0, dur: 0.7, f0: 7000, vol: 0.2, vib: [14, 1], lp: [2500, 1800], attack: 0.03, release: 0.1 },
  ],
  /** The hacker typing fast. */
  heistTyping: Array.from({ length: 9 }, (_, i): Voice => ({
    wave: "square",
    start: i * 0.05 + (i % 3) * 0.012,
    dur: 0.025,
    f0: 2600 + ((i * 397) % 900),
    vol: 0.08,
    duty: 0.25,
    decay: 60,
  })),
};
