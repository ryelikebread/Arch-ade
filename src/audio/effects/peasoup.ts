// Sound effects for the Peasoup skin (a kitchen with a pot of soup and a
// dog). All original: pitch sweeps and filtered noise.
import { noteHz, type Voice } from "../synth";

const n = (name: string) => noteHz(name)!;

export const effects: Record<string, Voice[]> = {
  /** A little hop off the cutting board. */
  soupHop: [{ wave: "square", start: 0, dur: 0.12, f0: 330, f1: 700, vol: 0.18, duty: 0.25, decay: 10 }],
  /** Something dropping into thick soup. */
  soupPlop: [
    { wave: "sine", start: 0, dur: 0.16, f0: 700, f1: 140, vol: 0.55, decay: 10 },
    { wave: "noise", start: 0.02, dur: 0.35, f0: 6000, f1: 2000, vol: 0.3, decay: 7, lp: [3000, 600] },
  ],
  /** The pot bubbling: blub, blub, blub. */
  soupBubble: [0, 0.11, 0.2, 0.33, 0.42].map((start, i): Voice => ({
    wave: "sine", start, dur: 0.07, f0: 220 + i * 40 + (i % 2) * 70, f1: 520 + i * 60, vol: 0.32, decay: 18,
  })),
  /** A ladle swishing round the pot. */
  soupStir: [
    { wave: "noise", start: 0, dur: 0.55, f0: 3000, vol: 0.22, attack: 0.15, release: 0.2, lp: [500, 1400] },
    { wave: "noise", start: 0.5, dur: 0.5, f0: 3000, vol: 0.18, attack: 0.15, release: 0.2, lp: [1400, 500] },
  ],
  /** The pantry door creaking open. */
  soupCreak: [
    { wave: "saw", start: 0, dur: 0.5, f0: 160, f1: 240, vol: 0.14, vib: [26, 1.2], attack: 0.05, release: 0.1, lp: [1600, 2200] },
    { wave: "square", start: 0.08, dur: 0.35, f0: 330, f1: 290, vol: 0.05, duty: 0.125, vib: [31, 0.8] },
  ],
  /** A jar clinking on a shelf. */
  soupClink: [
    { wave: "triangle", start: 0, dur: 0.25, f0: n("A6"), vol: 0.25, decay: 14 },
    { wave: "triangle", start: 0.07, dur: 0.3, f0: n("E7"), vol: 0.18, decay: 12 },
  ],
  /** The cupboard door shutting. */
  soupLatch: [
    { wave: "triangle", start: 0, dur: 0.12, f0: 180, f1: 90, vol: 0.5, decay: 20 },
    { wave: "noise", start: 0, dur: 0.05, f0: 8000, vol: 0.15, decay: 50 },
  ],
  /** A sticker peeled off its backing. */
  soupTear: [{ wave: "noise", start: 0, dur: 0.22, f0: 11000, vol: 0.2, attack: 0.02, release: 0.05, lp: [2500, 6000] }],
  /** The new label slapped on. */
  soupSlap: [
    { wave: "noise", start: 0, dur: 0.09, f0: 14000, vol: 0.45, decay: 35, lp: [9000, 3000] },
    { wave: "triangle", start: 0, dur: 0.1, f0: 140, f1: 70, vol: 0.4, decay: 25 },
  ],
  /** A kitchen-timer ding. */
  soupDing: [
    { wave: "triangle", start: 0, dur: 0.7, f0: n("C7"), vol: 0.25, decay: 5 },
    { wave: "sine", start: 0, dur: 0.7, f0: n("G7"), vol: 0.06, decay: 6 },
  ],
  /** Two short barks. */
  soupBark: [0, 0.17].flatMap((start): Voice[] => [
    { wave: "square", start, dur: 0.11, f0: 560, f1: 330, vol: 0.2, duty: 0.4, decay: 9, lp: [2200, 1200] },
    { wave: "noise", start, dur: 0.08, f0: 3000, vol: 0.15, decay: 20, lp: [1800, 900] },
  ]),
  /** A big happy gulp. */
  soupGulp: [
    { wave: "sine", start: 0, dur: 0.12, f0: 380, f1: 150, vol: 0.5, decay: 8 },
    { wave: "sine", start: 0.13, dur: 0.1, f0: 260, f1: 110, vol: 0.4, decay: 10 },
  ],
  /** A pleased little yip, rising. */
  soupYip: [
    { wave: "square", start: 0, dur: 0.1, f0: 700, f1: 1100, vol: 0.14, duty: 0.25, decay: 6 },
    { wave: "square", start: 0.13, dur: 0.14, f0: 800, f1: 1300, vol: 0.14, duty: 0.25, decay: 6 },
  ],
  /** Paws pattering across the floor. */
  soupPatter: [0, 0.06, 0.13, 0.19, 0.26, 0.32].map((start, i): Voice => ({
    wave: "noise", start, dur: 0.04, f0: 4000, vol: 0.2 - i * 0.025, decay: 40, lp: [2000, 1500],
  })),
  /** Digging in the yard: scratch, scratch, scratch. */
  soupDig: [0, 0.14, 0.28, 0.42].map((start): Voice => ({
    wave: "noise", start, dur: 0.1, f0: 5000, f1: 1500, vol: 0.3, decay: 14, lp: [2600, 900],
  })),
  /** Earth patted down for good. */
  soupThud: [
    { wave: "triangle", start: 0, dur: 0.25, f0: 110, f1: 50, vol: 0.6, decay: 10 },
    { wave: "noise", start: 0, dur: 0.2, f0: 1200, vol: 0.25, decay: 14, lp: [800, 300] },
  ],
};
