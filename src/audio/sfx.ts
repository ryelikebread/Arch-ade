// Sound effects for the animated skins, built from synth voices. All
// original: each one is a few lines of pitch sweeps and filtered noise.
// Skins pick them by name in their manifest's "sounds" (docs/SKINS.md).

import { noteHz, render, type Voice } from "./synth";

const n = (name: string) => noteHz(name)!;

const RECIPES = {
  /** A short bright tick. */
  blip: [{ wave: "square", start: 0, dur: 0.06, f0: 1320, vol: 0.25, duty: 0.25 }],
  /** A cork popping. */
  pop: [
    { wave: "square", start: 0, dur: 0.07, f0: 900, f1: 220, vol: 0.3, decay: 20 },
    { wave: "noise", start: 0, dur: 0.05, f0: 9000, vol: 0.2, decay: 40 },
  ],
  /** Two rising bell notes: something went well. */
  chime: [
    { wave: "triangle", start: 0, dur: 0.45, f0: n("E6"), vol: 0.35, decay: 7 },
    { wave: "triangle", start: 0.09, dur: 0.6, f0: n("B6"), vol: 0.3, decay: 6 },
  ],
  /** Air rushing past. */
  whoosh: [{ wave: "noise", start: 0, dur: 0.45, f0: 12000, vol: 0.45, attack: 0.18, release: 0.2, lp: [400, 2600] }],
  /** Something hot hitting liquid. */
  sizzle: [{ wave: "noise", start: 0, dur: 0.7, f0: 16000, vol: 0.25, decay: 3.5, lp: [7000, 3000] }],
  /** A low rumble from underground. */
  rumble: [
    { wave: "noise", start: 0, dur: 1, f0: 320, f1: 90, vol: 0.55, attack: 0.05, decay: 2.8, lp: [700, 200] },
    { wave: "triangle", start: 0, dur: 0.8, f0: 55, f1: 40, vol: 0.4, decay: 3 },
  ],
  /** A hand drum. */
  tom: [{ wave: "triangle", start: 0, dur: 0.2, f0: 170, f1: 85, vol: 0.6, decay: 14 }],
  /** A higher hand drum, to answer the low one. */
  tomHi: [{ wave: "triangle", start: 0, dur: 0.16, f0: 260, f1: 140, vol: 0.5, decay: 16 }],
  /** A boat horn: two low notes a fifth apart. */
  horn: [
    { wave: "saw", start: 0, dur: 0.65, f0: 98, vol: 0.18, attack: 0.05, release: 0.18, lp: [900, 600] },
    { wave: "square", start: 0, dur: 0.65, f0: 147, vol: 0.1, attack: 0.05, release: 0.18 },
  ],
  /** Water splashing. */
  splash: [{ wave: "noise", start: 0, dur: 0.5, f0: 9000, f1: 3000, vol: 0.45, decay: 5, lp: [5000, 700] }],
  /** Engines igniting and climbing. */
  launch: [
    { wave: "noise", start: 0, dur: 1.1, f0: 500, f1: 3000, vol: 0.45, attack: 0.25, release: 0.3, lp: [600, 2400] },
    { wave: "square", start: 0.1, dur: 0.9, f0: 70, f1: 320, vol: 0.12, duty: 0.25, release: 0.3 },
  ],
  /** A big bang that crumbles away. */
  explosion: [
    { wave: "noise", start: 0, dur: 1.1, f0: 1400, f1: 60, vol: 0.7, decay: 3.2 },
    { wave: "square", start: 0, dur: 0.35, f0: 110, f1: 30, vol: 0.3, decay: 6 },
  ],
  /** A wobbling tractor beam. */
  beam: [{ wave: "square", start: 0, dur: 0.95, f0: 280, f1: 880, vol: 0.18, duty: 0.25, attack: 0.08, release: 0.2, vib: [11, 2.5] }],
  /** A quick news-desk sting. */
  jingle: [
    ...(["G5", "C6", "E6"] as const).map((name, i): Voice => ({ wave: "square", start: i * 0.09, dur: 0.09, f0: n(name), vol: 0.2, duty: 0.25 })),
    { wave: "square", start: 0.27, dur: 0.45, f0: n("G6"), vol: 0.2, duty: 0.25, decay: 3, vib: [6, 0.3] },
    { wave: "triangle", start: 0.27, dur: 0.45, f0: n("C4"), vol: 0.3, decay: 3 },
  ],
  // ---------- arcade ----------
  /** A small blaster shot. */
  shoot: [{ wave: "square", start: 0, dur: 0.09, f0: 1400, f1: 300, vol: 0.18, duty: 0.25, decay: 10 }],
  /** Something takes a hit. */
  hit: [
    { wave: "noise", start: 0, dur: 0.08, f0: 5000, vol: 0.3, decay: 30 },
    { wave: "square", start: 0, dur: 0.07, f0: 300, f1: 120, vol: 0.15, decay: 20 },
  ],
  /** The player gets hurt. */
  hurt: [{ wave: "saw", start: 0, dur: 0.25, f0: 420, f1: 90, vol: 0.25, decay: 6 }],
  /** A hop. */
  jump: [{ wave: "square", start: 0, dur: 0.16, f0: 260, f1: 700, vol: 0.16, duty: 0.25, release: 0.04 }],
  /** A coin or point pickup. */
  coin: [
    { wave: "square", start: 0, dur: 0.06, f0: n("B5"), vol: 0.16, duty: 0.25 },
    { wave: "square", start: 0.06, dur: 0.22, f0: n("E6"), vol: 0.16, duty: 0.25, decay: 6 },
  ],
  /** A power-up: a fast rising arpeggio. */
  powerup: (["C5", "E5", "G5", "C6", "E6", "G6"] as const).map((name, i): Voice => ({ wave: "square", start: i * 0.05, dur: 0.06, f0: n(name), vol: 0.15, duty: 0.25 })),
  /** A ball bouncing off a paddle or wall. */
  bounce: [{ wave: "triangle", start: 0, dur: 0.06, f0: 520, vol: 0.4, decay: 25 }],
  /** Game over: a slow falling line. */
  gameover: (["E5", "C5", "A4", "E4"] as const).map((name, i): Voice => ({ wave: "triangle", start: i * 0.22, dur: 0.24, f0: n(name), vol: 0.35, decay: i === 3 ? 2 : 4 })),
  /** A win fanfare. */
  win: [
    ...(["C5", "E5", "G5"] as const).map((name, i): Voice => ({ wave: "square", start: i * 0.1, dur: 0.1, f0: n(name), vol: 0.16, duty: 0.25 })),
    { wave: "square", start: 0.3, dur: 0.5, f0: n("C6"), vol: 0.16, duty: 0.25, decay: 2, vib: [6, 0.3] },
    { wave: "triangle", start: 0.3, dur: 0.5, f0: n("C4"), vol: 0.3, decay: 2 },
  ],
} satisfies Record<string, Voice[]>;

export type SfxName = keyof typeof RECIPES;
export const SFX_NAMES = Object.keys(RECIPES) as SfxName[];

export function isSfx(name: unknown): name is SfxName {
  return typeof name === "string" && Object.hasOwn(RECIPES, name);
}

/** Samples for one effect, with a short tail of silence trimmed off. */
export function renderSfx(name: SfxName, sampleRate: number): Float32Array {
  const voices: Voice[] = RECIPES[name];
  const seconds = Math.max(...voices.map((v) => v.start + v.dur));
  const buf = render(voices, sampleRate, seconds);
  let peak = 0;
  for (const s of buf) peak = Math.max(peak, Math.abs(s));
  if (peak > 0.95) for (let i = 0; i < buf.length; i++) buf[i] *= 0.95 / peak;
  return buf;
}
