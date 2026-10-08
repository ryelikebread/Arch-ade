// Sound effects for the Royal Court skin (scripts/skins/royal-court.mjs).
// All original: trumpets, a crowd, coins, bells, armor and dungeon doors.

import { noteHz, type Voice } from "../synth";

const n = (name: string) => noteHz(name)!;

/** One brassy trumpet note: a saw and a square a fifth up, softened. */
const trumpet = (note: string, start: number, dur: number, vol = 0.16): Voice[] => [
  { wave: "saw", start, dur, f0: n(note), vol, attack: 0.02, release: 0.06, lp: [2600, 1800], vib: [6, 0.15] },
  { wave: "square", start, dur, f0: n(note), vol: vol * 0.5, duty: 0.3, attack: 0.02, release: 0.06 },
];

/** A handful of claps spread over `dur` seconds. */
const claps = (count: number, dur: number, vol: number): Voice[] =>
  Array.from({ length: count }, (_, i) => ({
    wave: "noise" as const,
    start: ((i * 0.618) % 1) * dur,
    dur: 0.05,
    f0: 7000 + ((i * 1733) % 4000),
    vol: vol * (0.6 + ((i * 37) % 10) / 25),
    decay: 45,
    lp: [5000, 2500] as [number, number],
  }));

/** An armored footstep: a dull stomp and a little metal jingle. */
const step = (start: number): Voice[] => [
  { wave: "triangle", start, dur: 0.12, f0: 110, f1: 60, vol: 0.45, decay: 18 },
  { wave: "noise", start, dur: 0.06, f0: 3000, vol: 0.15, decay: 30, lp: [1200, 600] },
  { wave: "square", start: start + 0.02, dur: 0.08, f0: 2400, vol: 0.05, duty: 0.2, decay: 30 },
];

export const effects: Record<string, Voice[]> = {
  /** A short royal fanfare: up the chord, then a held top note. */
  royalFanfare: [
    ...trumpet("C5", 0, 0.1),
    ...trumpet("C5", 0.11, 0.08),
    ...trumpet("E5", 0.2, 0.1),
    ...trumpet("G5", 0.31, 0.12),
    ...trumpet("C6", 0.45, 0.45, 0.18),
    { wave: "triangle", start: 0.45, dur: 0.45, f0: n("C4"), vol: 0.3, decay: 2 },
  ],
  /** A sad descending call for someone being sent away. */
  royalExile: [...trumpet("G4", 0, 0.18), ...trumpet("Eb4", 0.2, 0.18), ...trumpet("C4", 0.4, 0.5, 0.15)],
  /** The court applauding. */
  royalApplause: claps(26, 0.8, 0.35),
  /** The crowd murmuring among themselves. */
  royalMurmur: [
    { wave: "noise", start: 0, dur: 0.9, f0: 900, vol: 0.25, attack: 0.15, release: 0.3, lp: [700, 500] },
    { wave: "saw", start: 0.05, dur: 0.7, f0: 150, f1: 135, vol: 0.05, attack: 0.1, release: 0.3, vib: [5, 1.2], lp: [500, 400] },
    { wave: "saw", start: 0.15, dur: 0.6, f0: 190, f1: 175, vol: 0.04, attack: 0.1, release: 0.3, vib: [4, 1.5], lp: [500, 400] },
  ],
  /** Gold coins landing in a pile. */
  royalCoins: Array.from({ length: 6 }, (_, i): Voice => ({
    wave: "square",
    start: i * 0.055 + (i % 2) * 0.015,
    dur: 0.12,
    f0: 2400 + ((i * 523) % 1300),
    vol: 0.12,
    duty: 0.25,
    decay: 22,
  })),
  /** A platter of food set down: a clink and a pleased little rise. */
  royalPlatter: [
    { wave: "triangle", start: 0, dur: 0.3, f0: 1900, vol: 0.3, decay: 12 },
    { wave: "noise", start: 0, dur: 0.05, f0: 8000, vol: 0.15, decay: 40 },
    { wave: "square", start: 0.12, dur: 0.2, f0: n("G5"), f1: n("C6"), vol: 0.1, duty: 0.25, decay: 6 },
  ],
  /** The jester's hat bells. */
  royalJingleBells: Array.from({ length: 5 }, (_, i): Voice => ({
    wave: "triangle",
    start: i * 0.06,
    dur: 0.25,
    f0: [2600, 3100, 2800, 3400, 2950][i],
    vol: 0.2,
    decay: 14,
    vib: [24, 0.4],
  })),
  /** The town crier's handbell. */
  royalCrierBell: [
    { wave: "triangle", start: 0, dur: 0.5, f0: 1320, vol: 0.4, decay: 6 },
    { wave: "sine", start: 0, dur: 0.5, f0: 3300, vol: 0.12, decay: 9 },
    { wave: "square", start: 0, dur: 0.03, f0: 4000, vol: 0.08, duty: 0.2 },
  ],
  /** A scroll unrolling. */
  royalScroll: [
    { wave: "noise", start: 0, dur: 0.25, f0: 6000, f1: 3000, vol: 0.2, attack: 0.05, decay: 6, lp: [4000, 2000] },
    { wave: "noise", start: 0.12, dur: 0.15, f0: 9000, vol: 0.12, decay: 14 },
  ],
  /** Two guards marching: a few armored steps. */
  royalMarch: [0, 0.16, 0.32, 0.48].flatMap(step),
  /** A heavy lever thrown. */
  royalLever: [
    { wave: "square", start: 0, dur: 0.12, f0: 220, f1: 90, vol: 0.25, decay: 14 },
    { wave: "noise", start: 0, dur: 0.1, f0: 2000, vol: 0.25, decay: 30, lp: [1500, 800] },
    { wave: "triangle", start: 0.08, dur: 0.2, f0: 80, f1: 50, vol: 0.4, decay: 12 },
  ],
  /** An old hinge creaking. */
  royalCreak: [
    { wave: "saw", start: 0, dur: 0.5, f0: 180, f1: 120, vol: 0.12, attack: 0.04, release: 0.1, vib: [19, 2], lp: [1400, 900] },
    { wave: "square", start: 0.05, dur: 0.4, f0: 360, f1: 300, vol: 0.04, duty: 0.15, vib: [23, 1.5] },
  ],
  /** The big castle door swinging. */
  royalDoor: [
    { wave: "saw", start: 0, dur: 0.45, f0: 140, f1: 95, vol: 0.12, attack: 0.05, release: 0.1, vib: [15, 2.5], lp: [1000, 600] },
    { wave: "noise", start: 0.3, dur: 0.25, f0: 600, vol: 0.2, decay: 8, lp: [500, 200] },
  ],
  /** Something falling a long way: a falling whistle. */
  royalFall: [{ wave: "sine", start: 0, dur: 0.75, f0: 1700, f1: 240, vol: 0.25, release: 0.08 }],
  /** Landing in a heap on the dungeon floor. */
  royalThud: [
    { wave: "triangle", start: 0, dur: 0.3, f0: 90, f1: 40, vol: 0.6, decay: 9 },
    { wave: "noise", start: 0, dur: 0.2, f0: 1200, vol: 0.3, decay: 14, lp: [900, 300] },
  ],
  /** The cell door slamming shut. */
  royalClang: [
    { wave: "square", start: 0, dur: 0.7, f0: 620, vol: 0.14, duty: 0.35, decay: 5, vib: [7, 0.2] },
    { wave: "square", start: 0, dur: 0.6, f0: 933, vol: 0.09, duty: 0.2, decay: 6 },
    { wave: "triangle", start: 0, dur: 0.4, f0: 150, f1: 80, vol: 0.45, decay: 10 },
    { wave: "noise", start: 0, dur: 0.08, f0: 9000, vol: 0.3, decay: 30 },
  ],
  /** Bricks being laid: stone knocks and a trowel scrape. */
  royalBricks: [
    ...[0, 0.12, 0.24].map((start): Voice => ({ wave: "noise", start, dur: 0.08, f0: 1500, vol: 0.35, decay: 25, lp: [1200, 500] })),
    { wave: "noise", start: 0.3, dur: 0.18, f0: 7000, vol: 0.12, attack: 0.03, decay: 10, lp: [5000, 2500] },
  ],
  /** A low final chord: banished forever. */
  royalDoom: [
    ...trumpet("C4", 0, 0.7, 0.12),
    ...trumpet("Eb4", 0, 0.7, 0.1),
    { wave: "triangle", start: 0, dur: 0.9, f0: n("C3"), vol: 0.4, decay: 2 },
  ],
  /** A long way down: a fading echo with no bottom. */
  royalEcho: [0, 0.18, 0.36, 0.54].map((start, i): Voice => ({
    wave: "sine",
    start,
    dur: 0.25,
    f0: 330 - i * 30,
    f1: 200 - i * 20,
    vol: 0.2 / (i + 1),
    decay: 8,
  })),
};
