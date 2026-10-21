// Sound effects for the Dragon Hoard skin (scripts/skins/dragon-hoard.mjs).
// All original: a roaring dragon, fire, a bubbling hookah, smoke rings,
// stomps and chomps, rattling bones, coins, kisses and a fanfare for every
// new adventurer who walks in.

import { noteHz, type Voice } from "../synth";

const n = (name: string) => noteHz(name)!;

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

/** One coin landing: a bright little ping. */
const coin = (start: number, hz: number): Voice => ({ wave: "square", start, dur: 0.07, f0: hz, vol: 0.07, duty: 0.25, decay: 30 });

export const effects: Record<string, Voice[]> = {
  /** The dragon's roar: a low growl rising, with a rush of breath. */
  dragonRoar: [
    { wave: "saw", start: 0, dur: 0.9, f0: 70, f1: 130, vol: 0.28, attack: 0.08, release: 0.3, vib: [24, 1.2], lp: [500, 1400] },
    { wave: "square", start: 0.05, dur: 0.8, f0: 105, f1: 160, vol: 0.12, duty: 0.3, release: 0.3, vib: [17, 1] },
    { wave: "noise", start: 0, dur: 0.9, f0: 900, vol: 0.25, attack: 0.1, release: 0.3, lp: [600, 1600] },
  ],
  /** A gout of flame: a crackling roar of noise. */
  dragonFlame: [
    { wave: "noise", start: 0, dur: 1.1, f0: 2400, vol: 0.4, attack: 0.08, release: 0.4, lp: [1200, 3800] },
    ...Array.from({ length: 6 }, (_, i): Voice => ({ wave: "noise", start: 0.1 + i * 0.15, dur: 0.04, f0: 12000, vol: 0.18, decay: 40 })),
  ],
  /** Something sizzling to a crisp. */
  dragonSizzle: [{ wave: "noise", start: 0, dur: 0.6, f0: 16000, vol: 0.22, decay: 4, lp: [8000, 3000] }],
  /** A huge foot slamming down. */
  dragonStomp: [
    { wave: "triangle", start: 0, dur: 0.45, f0: 90, f1: 30, vol: 0.7, decay: 6 },
    { wave: "noise", start: 0, dur: 0.4, f0: 600, f1: 120, vol: 0.5, decay: 7, lp: [900, 200] },
    { wave: "square", start: 0.02, dur: 0.12, f0: 220, f1: 80, vol: 0.12, decay: 20 },
  ],
  /** A softer thump. */
  dragonThud: [
    { wave: "triangle", start: 0, dur: 0.2, f0: 130, f1: 60, vol: 0.5, decay: 14 },
    { wave: "noise", start: 0, dur: 0.12, f0: 1200, vol: 0.2, decay: 25, lp: [1500, 400] },
  ],
  /** Big jaws snapping shut. */
  dragonChomp: [
    { wave: "noise", start: 0, dur: 0.08, f0: 5000, vol: 0.4, decay: 35 },
    { wave: "square", start: 0, dur: 0.1, f0: 300, f1: 90, vol: 0.2, decay: 25 },
    { wave: "noise", start: 0.12, dur: 0.06, f0: 4000, vol: 0.3, decay: 40 },
  ],
  /** A big swallow. */
  dragonGulp: [
    { wave: "sine", start: 0, dur: 0.25, f0: 320, f1: 110, vol: 0.45, attack: 0.02, decay: 6 },
    { wave: "sine", start: 0.18, dur: 0.2, f0: 220, f1: 90, vol: 0.35, decay: 8 },
  ],
  /** A rumbling burp. */
  dragonBurp: [{ wave: "saw", start: 0, dur: 0.5, f0: 95, f1: 70, vol: 0.25, attack: 0.03, release: 0.12, vib: [30, 2], lp: [700, 400] }],
  /** The hookah bubbling. */
  dragonBubble: Array.from({ length: 6 }, (_, i): Voice => ({ wave: "sine", start: i * 0.07, dur: 0.06, f0: 300 + ((i * 97) % 220), f1: 600 + ((i * 131) % 300), vol: 0.22, decay: 20 })),
  /** A smoke ring puffed out. */
  dragonPuff: [{ wave: "noise", start: 0, dur: 0.35, f0: 3000, vol: 0.3, attack: 0.05, release: 0.2, lp: [1500, 400] }],
  /** A kiss: smooch. */
  dragonKiss: [
    { wave: "sine", start: 0, dur: 0.08, f0: 900, f1: 1800, vol: 0.3, decay: 10 },
    { wave: "noise", start: 0.06, dur: 0.04, f0: 9000, vol: 0.2, decay: 50 },
  ],
  /** Hearts floating up: a sweet rising sparkle. */
  dragonHearts: (["E6", "G6", "B6", "E7"] as const).map((name, i): Voice => ({ wave: "triangle", start: i * 0.08, dur: 0.3, f0: n(name), vol: 0.18, decay: 6 })),
  /** The princess clapping. */
  dragonClap: claps(7, 0.55, 0.35),
  /** Light, quick footsteps (the princess). */
  dragonPatter: [0, 0.1, 0.2, 0.3].map((start): Voice => ({ wave: "triangle", start, dur: 0.05, f0: 700, f1: 500, vol: 0.18, decay: 35 })),
  /** Armor clanking. */
  dragonClank: [0, 0.16].flatMap((s): Voice[] => [
    { wave: "square", start: s, dur: 0.07, f0: 2100, vol: 0.06, duty: 0.2, decay: 30 },
    { wave: "triangle", start: s, dur: 0.1, f0: 140, f1: 80, vol: 0.3, decay: 20 },
  ]),
  /** A tail or claw whooshing past. */
  dragonSwish: [{ wave: "noise", start: 0, dur: 0.35, f0: 9000, vol: 0.35, attack: 0.12, release: 0.15, lp: [500, 3500] }],
  /** Wings beating. */
  dragonFlap: [0, 0.18].map((start): Voice => ({ wave: "noise", start, dur: 0.15, f0: 800, vol: 0.4, attack: 0.03, decay: 12, lp: [700, 300] })),
  /** Bones landing on the pile, rattling. */
  dragonBones: Array.from({ length: 7 }, (_, i): Voice => ({ wave: "triangle", start: i * 0.045 + (i % 2) * 0.01, dur: 0.05, f0: 900 + ((i * 263) % 700), vol: 0.22, decay: 35 })),
  /** Coins pouring. */
  dragonCoins: Array.from({ length: 10 }, (_, i) => coin(i * 0.05 + ((i * 7) % 3) * 0.01, 2400 + ((i * 431) % 1600))),
  /** A golden shimmer: something turned to gold. */
  dragonGild: [
    ...(["C6", "E6", "G6", "C7", "E7"] as const).map((name, i): Voice => ({ wave: "square", start: i * 0.05, dur: 0.12, f0: n(name), vol: 0.07, duty: 0.25, decay: 8 })),
    { wave: "triangle", start: 0.25, dur: 0.6, f0: n("G7"), vol: 0.12, decay: 4, vib: [8, 0.3] },
  ],
  /** A twinkle: a star in the distance, or a file set down safely. */
  dragonTwinkle: [
    { wave: "triangle", start: 0, dur: 0.15, f0: n("B6"), vol: 0.2, decay: 12 },
    { wave: "triangle", start: 0.07, dur: 0.3, f0: n("F#7"), vol: 0.16, decay: 8 },
  ],
  /** A mimic: a creaking lid, then teeth. */
  dragonMimic: [
    { wave: "saw", start: 0, dur: 0.25, f0: 180, f1: 320, vol: 0.12, vib: [30, 1], lp: [900, 1400] },
    { wave: "noise", start: 0.24, dur: 0.06, f0: 6000, vol: 0.35, decay: 40 },
  ],
  /** The Ark opening: an eerie rising choir. */
  dragonZap: [
    { wave: "sine", start: 0, dur: 1, f0: n("A4"), f1: n("A5"), vol: 0.18, attack: 0.2, release: 0.3, vib: [5, 0.4] },
    { wave: "sine", start: 0, dur: 1, f0: n("E5"), f1: n("E6"), vol: 0.14, attack: 0.2, release: 0.3, vib: [5.5, 0.4] },
    { wave: "noise", start: 0.4, dur: 0.6, f0: 10000, vol: 0.15, attack: 0.1, decay: 3, lp: [6000, 2000] },
  ],
  /** Turning to stone: a grinding crunch. */
  dragonPetrify: [
    { wave: "noise", start: 0, dur: 0.5, f0: 1500, f1: 400, vol: 0.4, attack: 0.05, decay: 4, lp: [1600, 500] },
    { wave: "square", start: 0, dur: 0.4, f0: 160, f1: 60, vol: 0.1, duty: 0.3, decay: 5 },
  ],
  /** Crumbling into ash, dust or rubble. */
  dragonCrumble: Array.from({ length: 8 }, (_, i): Voice => ({ wave: "noise", start: i * 0.05, dur: 0.06, f0: 2500 - i * 200, vol: 0.25 - i * 0.02, decay: 30, lp: [2000, 800] })),
  /** A quill scratching on parchment. */
  dragonQuill: [0, 0.07, 0.15].map((start): Voice => ({ wave: "noise", start, dur: 0.06, f0: 11000, vol: 0.14, attack: 0.01, decay: 25, lp: [9000, 6000] })),
  /** A long slurp from a cup. */
  dragonSlurp: [{ wave: "noise", start: 0, dur: 0.4, f0: 3500, f1: 1500, vol: 0.25, attack: 0.04, release: 0.1, lp: [2500, 900], vib: [14, 2] }],
  /** A little trumpet: here comes the next adventurer. */
  dragonFanfare: [
    { wave: "square", start: 0, dur: 0.08, f0: n("C5"), vol: 0.1, duty: 0.3 },
    { wave: "square", start: 0.1, dur: 0.08, f0: n("C5"), vol: 0.1, duty: 0.3 },
    { wave: "square", start: 0.2, dur: 0.3, f0: n("G5"), vol: 0.1, duty: 0.3, decay: 4, vib: [6, 0.2] },
    { wave: "triangle", start: 0.2, dur: 0.3, f0: n("C4"), vol: 0.2, decay: 4 },
  ],
};
