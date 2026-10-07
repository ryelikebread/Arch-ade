// The background track: an original 16-bar chiptune loop, written here as
// notes and rendered once into a looping buffer, so playing it costs no
// JavaScript at all.

import { noteHz, parseLine, render, soften, type Voice } from "./synth";

export const TITLE = "Tidy Up Tonight";
export const BPM = 112;
export const STEPS_PER_BAR = 16;
/** Length of one 16th note in seconds. */
export const STEP = 60 / BPM / 4;

/** Chord per bar, as note names (the lowest is the bass note). */
const CHORDS: Record<string, string[]> = {
  Am: ["A", "C", "E"],
  F: ["F", "A", "C"],
  C: ["C", "E", "G"],
  G: ["G", "B", "D"],
  E: ["E", "G#", "B"],
  Em: ["E", "G", "B"],
};

export const BARS: { chord: keyof typeof CHORDS; lead: string }[] = [
  // A: easygoing
  { chord: "Am", lead: "A4:2 C5:2 E5:4 D5:2 C5:2 B4:2 C5:2" },
  { chord: "F", lead: "A4:4 F4:2 A4:2 C5:6 -:2" },
  { chord: "C", lead: "G4:2 C5:2 E5:2 G5:2 E5:4 D5:2 C5:2" },
  { chord: "G", lead: "D5:6 B4:2 G4:4 -:4" },
  { chord: "Am", lead: "A4:2 C5:2 E5:4 A5:4 G5:2 E5:2" },
  { chord: "F", lead: "F5:4 E5:2 C5:2 A4:4 C5:4" },
  { chord: "G", lead: "B4:2 D5:2 G5:4 F5:2 E5:2 D5:4" },
  { chord: "E", lead: "E5:8 G#4:4 B4:4" },
  // B: climbs higher, then turns back to the start
  { chord: "F", lead: "C5:4 A4:2 C5:2 F5:4 E5:2 F5:2" },
  { chord: "G", lead: "G5:6 F5:2 E5:4 D5:4" },
  { chord: "Em", lead: "E5:2 G5:2 B5:4 A5:2 G5:2 E5:4" },
  { chord: "Am", lead: "A5:8 E5:4 C5:4" },
  { chord: "F", lead: "F5:2 E5:2 F5:2 A5:2 G5:4 F5:4" },
  { chord: "G", lead: "D5:2 E5:2 F5:2 G5:2 B5:4 G5:4" },
  { chord: "Am", lead: "A5:4 E5:4 C5:4 B4:4" },
  { chord: "E", lead: "A4:10 -:2 E5:4" },
];

export const SECONDS = BARS.length * STEPS_PER_BAR * STEP;

const hz = (name: string, octave: number) => noteHz(`${name}${octave}`)!;

/** Every note of the loop as synth voices. */
export function score(): Voice[] {
  const v: Voice[] = [];
  BARS.forEach((bar, b) => {
    const t0 = b * STEPS_PER_BAR * STEP;
    const chord = CHORDS[bar.chord];
    const busy = b >= 8; // the B half adds a snare and a brighter arpeggio

    // Lead: a soft pulse with a little vibrato on long notes.
    let step = 0;
    for (const { hz: f, steps } of parseLine(bar.lead)) {
      if (f) v.push({ wave: "square", start: t0 + step * STEP, dur: steps * STEP * 0.92, f0: f, vol: 0.13, duty: 0.25, decay: 0.8, vib: steps >= 4 ? [5.5, 0.15] : undefined });
      step += steps;
    }
    // Bass: root in eighths, jumping an octave.
    for (let i = 0; i < 8; i++)
      v.push({ wave: "triangle", start: t0 + i * 2 * STEP, dur: 2 * STEP * 0.85, f0: hz(chord[0], i % 2 ? 3 : 2), vol: 0.32 });
    // Arpeggio: chord tones in 16ths, quiet.
    for (let i = 0; i < 16; i++)
      v.push({ wave: "square", start: t0 + i * STEP, dur: STEP * 0.7, f0: hz(chord[i % 3], busy && i % 6 >= 3 ? 5 : 4), vol: 0.035, duty: 0.125, decay: 8 });
    // Drums: kick on 1 and 3, hats on eighths, snare on 2 and 4 in the B half.
    for (const s of [0, 8]) v.push({ wave: "triangle", start: t0 + s * STEP, dur: 0.12, f0: 150, f1: 45, vol: 0.5, decay: 18 });
    for (let s = 0; s < 16; s += 2) v.push({ wave: "noise", start: t0 + s * STEP, dur: 0.04, f0: 14000, vol: 0.06, decay: 60 });
    if (busy) for (const s of [4, 12]) v.push({ wave: "noise", start: t0 + s * STEP, dur: 0.14, f0: 6000, vol: 0.16, decay: 22, lp: [5000, 2500] });
  });
  return v;
}

export function renderMusic(sampleRate: number): Float32Array {
  return soften(render(score(), sampleRate, SECONDS, true));
}
