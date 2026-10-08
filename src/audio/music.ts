// The built-in radio stations: original chiptune loops written here as notes
// and rendered once into a looping buffer, so playing one costs no
// JavaScript at all. All of it is original and dedicated to the public
// domain (CC0); see MUSIC_CREDITS.md.

import { noteHz, parseLine, render, soften, type Voice, type Wave } from "./synth";

export const STEPS_PER_BAR = 16;

/** Chord tones by name; the first is the bass note, the last the fifth. */
const ROOTS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;
const at = (i: number) => ROOTS[((i % 12) + 12) % 12];
/** Every major and minor triad (C, Cm, F#, F#m, Bb, Bbm…), spelled with the names noteHz knows. */
const CHORDS = Object.fromEntries(
  ROOTS.flatMap((r, i) => [
    [r, [r, at(i + 4), at(i + 7)]],
    [`${r}m`, [r, at(i + 3), at(i + 7)]],
  ]),
) as Record<string, readonly [string, string, string]>;
type Root = (typeof ROOTS)[number];
export type Chord = Root | `${Root}m`;

export interface Song {
  id: string;
  title: string;
  /** The station it plays on. */
  station: string;
  bpm: number;
  lead: Instrument;
  /** A second voice that plays each bar's `harmony` line. */
  harmony?: Instrument;
  /**
   * eighths: root in octaves; bounce: island rhythm; long: one note a bar; drive: fast 16ths;
   * walk: jazz quarter notes stepping into the next chord; lazy: a laid-back root and fifth.
   */
  bass: "eighths" | "bounce" | "long" | "drive" | "walk" | "lazy";
  /** Chord tones, 1 per `arpEvery` steps; 0 turns it off. */
  arpEvery: number;
  /** The arp's sound; by default a thin square (a high sine with soft drums). */
  arp?: { wave: Wave; vol: number; octave: number };
  /**
   * basic: kick + hats (+ snare in the second half); soft: one kick a bar; rock: everything, every beat;
   * half: half-time, snare on beat 3; swing: ride cymbal and brushes; lofi: a dusty, lazy hip-hop beat.
   */
  drums: "basic" | "soft" | "rock" | "half" | "swing" | "lofi";
  /** Shuffle: what falls on the second 8th of a beat lands this many steps late (0.33 is a lazy swing). */
  swing?: number;
  bars: { chord: Chord; lead: string; harmony?: string }[];
}

export interface Instrument {
  wave: Wave;
  vol: number;
  duty?: number;
}

const BASE: Song[] = [
  {
    id: "tidy-up-tonight",
    title: "Tidy Up Tonight",
    station: "Arch-ade FM",
    bpm: 112,
    lead: { wave: "square", vol: 0.13, duty: 0.25 },
    bass: "eighths",
    arpEvery: 1,
    drums: "basic",
    bars: [
      { chord: "Am", lead: "A4:2 C5:2 E5:4 D5:2 C5:2 B4:2 C5:2" },
      { chord: "F", lead: "A4:4 F4:2 A4:2 C5:6 -:2" },
      { chord: "C", lead: "G4:2 C5:2 E5:2 G5:2 E5:4 D5:2 C5:2" },
      { chord: "G", lead: "D5:6 B4:2 G4:4 -:4" },
      { chord: "Am", lead: "A4:2 C5:2 E5:4 A5:4 G5:2 E5:2" },
      { chord: "F", lead: "F5:4 E5:2 C5:2 A4:4 C5:4" },
      { chord: "G", lead: "B4:2 D5:2 G5:4 F5:2 E5:2 D5:4" },
      { chord: "E", lead: "E5:8 G#4:4 B4:4" },
      { chord: "F", lead: "C5:4 A4:2 C5:2 F5:4 E5:2 F5:2" },
      { chord: "G", lead: "G5:6 F5:2 E5:4 D5:4" },
      { chord: "Em", lead: "E5:2 G5:2 B5:4 A5:2 G5:2 E5:4" },
      { chord: "Am", lead: "A5:8 E5:4 C5:4" },
      { chord: "F", lead: "F5:2 E5:2 F5:2 A5:2 G5:4 F5:4" },
      { chord: "G", lead: "D5:2 E5:2 F5:2 G5:2 B5:4 G5:4" },
      { chord: "Am", lead: "A5:4 E5:4 C5:4 B4:4" },
      { chord: "E", lead: "A4:10 -:2 E5:4" },
    ],
  },
  {
    id: "lagoon-shuffle",
    title: "Lagoon Shuffle",
    station: "Island Radio",
    bpm: 100,
    lead: { wave: "triangle", vol: 0.3 },
    bass: "bounce",
    arpEvery: 2,
    drums: "basic",
    bars: [
      { chord: "C", lead: "E5:2 G5:2 -:2 E5:2 C5:4 D5:2 E5:2" },
      { chord: "F", lead: "F5:3 A5:3 F5:2 C5:4 -:4" },
      { chord: "G", lead: "D5:2 G5:2 B5:2 G5:2 D5:4 B4:4" },
      { chord: "C", lead: "C5:6 E5:2 G5:4 -:4" },
      { chord: "Am", lead: "A5:2 G5:2 E5:2 C5:2 A4:4 C5:4" },
      { chord: "F", lead: "F5:2 E5:2 F5:2 A5:2 C6:6 -:2" },
      { chord: "G", lead: "B5:2 A5:2 G5:2 F5:2 D5:4 B4:4" },
      { chord: "C", lead: "C5:8 G4:4 C5:4" },
    ],
  },
  {
    id: "low-orbit",
    title: "Low Orbit",
    station: "Orbit FM",
    bpm: 84,
    lead: { wave: "sine", vol: 0.28 },
    bass: "long",
    arpEvery: 2,
    drums: "soft",
    bars: [
      { chord: "Dm", lead: "D5:8 F5:4 A5:4" },
      { chord: "Bb", lead: "A5:6 G5:2 F5:8" },
      { chord: "F", lead: "C5:4 F5:4 A5:4 C6:4" },
      { chord: "C", lead: "G5:12 -:4" },
      { chord: "Dm", lead: "D6:4 C6:4 A5:4 F5:4" },
      { chord: "Bb", lead: "G5:4 F5:4 D5:8" },
      { chord: "C", lead: "E5:4 G5:4 C6:8" },
      { chord: "A", lead: "C#6:12 -:4" },
    ],
  },
  {
    id: "final-sort",
    title: "Final Sort",
    station: "Boss Rush",
    bpm: 150,
    lead: { wave: "square", vol: 0.12, duty: 0.5 },
    bass: "drive",
    arpEvery: 0,
    drums: "rock",
    bars: [
      { chord: "Em", lead: "E5:2 E5:1 E5:1 G5:2 E5:2 B5:4 A5:2 G5:2" },
      { chord: "C", lead: "G5:2 E5:2 C5:2 E5:2 G5:4 C6:4" },
      { chord: "D", lead: "F#5:2 A5:2 D6:4 C6:2 A5:2 F#5:4" },
      { chord: "B", lead: "D#5:4 F#5:4 B5:8" },
      { chord: "Em", lead: "B5:2 A5:2 G5:2 F#5:2 E5:4 G5:4" },
      { chord: "C", lead: "C6:4 B5:2 A5:2 G5:4 E5:4" },
      { chord: "D", lead: "D5:2 F#5:2 A5:2 D6:2 C6:2 A5:2 F#5:2 D5:2" },
      { chord: "B", lead: "D#5:2 F#5:2 B5:2 D#6:2 F#6:4 -:4" },
    ],
  },
];

// More songs live in songs/*.ts (one file per station or skin), each exporting
// `songs`. A station plays its songs in order, in the order the files sort.
const MORE = import.meta.glob<{ songs: Song[] }>("./songs/*.ts", { eager: true });

export const SONGS: Song[] = [...BASE, ...Object.keys(MORE).sort().flatMap((k) => MORE[k].songs)];

/** The songs on a station, in play order. */
export const songsOn = (station: string) => SONGS.filter((s) => s.station === station);

export const stepSeconds = (song: Song) => 60 / song.bpm / 4;
export const songSeconds = (song: Song) => song.bars.length * STEPS_PER_BAR * stepSeconds(song);

const hz = (name: string, octave: number) => noteHz(`${name}${octave}`)!;
/** Semitones above C2 → Hz. */
const semi = (n: number) => noteHz("C2")! * Math.pow(2, n / 12);

/** Every note of a song as synth voices. */
export function score(song: Song): Voice[] {
  const v: Voice[] = [];
  const STEP = stepSeconds(song);
  const half = song.bars.length / 2;
  song.bars.forEach((bar, b) => {
    const t0 = b * STEPS_PER_BAR * STEP;
    const chord = CHORDS[bar.chord];
    const second = b >= half;
    const at = (step: number) => t0 + (step + (song.swing && step % 4 === 2 ? song.swing : 0)) * STEP;

    const play = (line: string, inst: Instrument) => {
      let step = 0;
      for (const { hz: f, steps } of parseLine(line)) {
        if (f)
          v.push({
            wave: inst.wave, start: at(step), dur: steps * STEP * 0.92, f0: f, vol: inst.vol, duty: inst.duty,
            decay: inst.wave === "sine" ? 0.4 : 0.8, vib: steps >= 4 ? [5.5, 0.15] : undefined, attack: inst.wave === "sine" ? 0.04 : undefined,
          });
        step += steps;
      }
    };
    play(bar.lead, song.lead);
    if (song.harmony && bar.harmony) play(bar.harmony, song.harmony);

    const bass = (s: number, len: number, name: string, oct: number, vol = 0.32) =>
      v.push({ wave: "triangle", start: at(s), dur: len * STEP * 0.85, f0: hz(name, oct), vol });
    switch (song.bass) {
      case "eighths":
        for (let i = 0; i < 8; i++) bass(i * 2, 2, chord[0], i % 2 ? 3 : 2);
        break;
      case "bounce":
        for (const [s, len, tone, oct] of [[0, 3, 0, 2], [3, 3, 2, 2], [6, 2, 0, 3], [8, 3, 0, 2], [11, 3, 2, 2], [14, 2, 1, 3]] as const) bass(s, len, chord[tone], oct);
        break;
      case "long":
        bass(0, 16, chord[0], 2, 0.3);
        break;
      case "drive":
        for (let i = 0; i < 16; i++) bass(i, 1, chord[0], i % 4 === 2 ? 3 : 2, 0.3);
        break;
      case "walk": {
        // Root, third, fifth, then a half step below the next chord's root.
        const r = ROOTS.indexOf(chord[0] as Root);
        const next = ROOTS.indexOf(CHORDS[song.bars[(b + 1) % song.bars.length].chord][0] as Root);
        const into = (next + 11) % 12;
        const third = r + (bar.chord.endsWith("m") ? 3 : 4);
        [r, third, r + 7, Math.abs(into - r - 7) < Math.abs(into + 12 - r - 7) ? into : into + 12].forEach((n, i) =>
          v.push({ wave: "triangle", start: at(i * 4), dur: 4 * STEP * 0.85, f0: semi(n), vol: 0.3 }),
        );
        break;
      }
      case "lazy":
        for (const [s, len, tone, oct] of [[0, 6, 0, 2], [6, 2, 2, 2], [10, 6, 0, 2]] as const) bass(s, len, chord[tone], oct);
        break;
    }

    if (song.arpEvery) {
      const soft = song.drums === "soft";
      for (let i = 0; i < 16; i += song.arpEvery) {
        const oct = song.arp ? song.arp.octave : soft ? 6 : second && i % 6 >= 3 ? 5 : 4;
        v.push({ wave: song.arp?.wave ?? (soft ? "sine" : "square"), start: at(i), dur: STEP * song.arpEvery * 0.7, f0: hz(chord[(i / song.arpEvery) % 3], oct), vol: song.arp?.vol ?? (soft ? 0.05 : 0.035), duty: 0.125, decay: 8 });
      }
    }

    const kick = (s: number, vol = 0.5) => v.push({ wave: "triangle", start: at(s), dur: 0.12, f0: 150, f1: 45, vol, decay: 18 });
    const hat = (s: number, vol = 0.06, decay = 60) => v.push({ wave: "noise", start: at(s), dur: decay < 60 ? 0.12 : 0.04, f0: 14000, vol, decay });
    const snare = (s: number, vol = 0.16) => v.push({ wave: "noise", start: at(s), dur: 0.14, f0: 6000, vol, decay: 22, lp: [5000, 2500] });
    switch (song.drums) {
      case "basic":
        [0, 8].forEach((s) => kick(s));
        for (let s = 0; s < 16; s += 2) hat(s);
        if (second) [4, 12].forEach((s) => snare(s));
        break;
      case "soft":
        kick(0, 0.3);
        break;
      case "rock":
        [0, 4, 8, 12].forEach((s) => kick(s));
        for (let s = 0; s < 16; s++) hat(s);
        [4, 12].forEach((s) => snare(s));
        break;
      case "half":
        [0, 10].forEach((s) => kick(s));
        for (let s = 0; s < 16; s += 2) hat(s);
        snare(8, 0.2);
        break;
      case "swing":
        [0, 8].forEach((s) => kick(s, 0.25));
        [0, 4, 6, 8, 12, 14].forEach((s) => hat(s, 0.04, 20));
        [4, 12].forEach((s) => snare(s, 0.05));
        break;
      case "lofi":
        kick(0, 0.4);
        kick(7, 0.25);
        kick(10, 0.35);
        for (let s = 0; s < 16; s += 2) hat(s, 0.03);
        [4, 12].forEach((s) => snare(s, 0.1));
        break;
    }
  });
  return v;
}

export function renderSong(song: Song, sampleRate: number): Float32Array {
  return soften(render(score(song), sampleRate, songSeconds(song), true));
}
