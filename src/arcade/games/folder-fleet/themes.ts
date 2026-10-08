// Folder Fleet's stage themes: each wave (and the boss stage) is named after
// one of the round's folders and flies in front of one of these backdrops,
// picked at random. A theme sets the colors and scenery (drawn in sprites.ts
// and draw.ts), the formation the wave lines up in, the way it flies in, and
// a small nudge to how often ships dive. Plain data, no drawing.

export type ThemeId = "space" | "nebula" | "grid" | "belt" | "aurora";
export const THEME_IDS: ThemeId[] = ["space", "nebula", "grid", "belt", "aurora"];

/** How a wave flies in: corners (top then bottom), split (out of the middle), march (straight in), drop (from the top and bottom edges), weave (alternating corners). */
export type Entry = "corners" | "split" | "march" | "drop" | "weave";

export interface Theme {
  name: string;
  /** Formation slots (12), base positions on the right of the screen. */
  slots: [number, number][];
  /** Sway: how far (x, y) and how much each slot's phase follows its position (0 = the formation moves as one). */
  sway: { ax: number; ay: number; px: number; py: number };
  entry: Entry;
  /** Dive timer multiplier (below 1 dives a little more often). */
  dive: number;
  /** Colors: background, two haze colors, far/mid/near stars, scenery. */
  bg: string;
  haze: [string, string];
  far: string[];
  mid: string[];
  near: string[];
  /** Scenery: none, extra clouds, a scrolling grid, drifting rocks, aurora bands. */
  props: "none" | "clouds" | "grid" | "rocks" | "bands";
  prop: string[];
  /** The banner color for the stage title (a HUD text color). */
  accent: "#4de1ff" | "#ff4dd2" | "#6bff8f" | "#ff9a3c" | "#ffd23f";
}

const gridSlots = (): [number, number][] => Array.from({ length: 12 }, (_, i) => [222 + (i % 3) * 32, 42 + Math.floor(i / 3) * 31]);

/** A chevron pointing at the player: two arms of six. */
const chevronSlots = (): [number, number][] =>
  Array.from({ length: 12 }, (_, i) => {
    const k = i % 6;
    return [207 + k * 19, i < 6 ? 80 - k * 10.5 : 100 + k * 10.5];
  });

/** Four staggered columns of three. */
const columnSlots = (): [number, number][] =>
  Array.from({ length: 12 }, (_, i) => {
    const c = i % 4;
    const r = Math.floor(i / 4);
    return [210 + c * 28, 38 + r * 44 + (c % 2) * 22];
  });

/** A diamond: rows of 1, 2, 3, 3, 2, 1. */
const diamondSlots = (): [number, number][] => {
  const out: [number, number][] = [];
  [1, 2, 3, 3, 2, 1].forEach((n, j) => {
    for (let k = 0; k < n; k++) out.push([252 + (k - (n - 1) / 2) * 30, 30 + j * 24]);
  });
  return out;
};

/** Two arcs of six bulging toward the player. */
const arcSlots = (): [number, number][] => {
  const out: [number, number][] = [];
  const arc = (r: number, step: number) => {
    for (let k = 0; k < 6; k++) {
      const a = ((k - 2.5) * step * Math.PI) / 180;
      out.push([318 - Math.cos(a) * r, 90 + Math.sin(a) * r * 0.85]);
    }
  };
  arc(62, 20);
  arc(100, 18);
  return out;
};

export const THEMES: Record<ThemeId, Theme> = {
  space: {
    name: "DEEP SPACE",
    slots: gridSlots(),
    sway: { ax: 6, ay: 12, px: 1 / 31, py: 0.9 / 32 },
    entry: "corners",
    dive: 1,
    bg: "#07040f",
    haze: ["#140b26", "#0d1029"],
    far: ["#2c2550", "#3a3266", "#4a3f7a"],
    mid: ["#a493c4", "#7a6aa8", "#5a8aa8"],
    near: ["#f4ecff", "#4de1ff", "#ffe9a8"],
    props: "none",
    prop: [],
    accent: "#4de1ff",
  },
  nebula: {
    name: "NEBULA",
    slots: chevronSlots(),
    sway: { ax: 4, ay: 5, px: 0, py: 0 },
    entry: "split",
    dive: 1.05,
    bg: "#0a0412",
    haze: ["#2a0e30", "#0e2030"],
    far: ["#3a2650", "#4a2f60", "#2f3a60"],
    mid: ["#b06ab0", "#6a9ac0", "#8a6ab8"],
    near: ["#f4ecff", "#ffc2f0", "#bfe9ff"],
    props: "clouds",
    prop: ["#2e0f36", "#0f2a40", "#381340"],
    accent: "#ff4dd2",
  },
  grid: {
    name: "DATA GRID",
    slots: columnSlots(),
    sway: { ax: 3, ay: 6, px: 0, py: 0 },
    entry: "march",
    dive: 0.95,
    bg: "#020b09",
    haze: ["#06201a", "#04181c"],
    far: ["#12402c", "#163a3a"],
    mid: ["#4aa080", "#3a8a9a"],
    near: ["#f4ecff", "#6bff8f"],
    props: "grid",
    prop: ["#0b2e22", "#0f3a2b"],
    accent: "#6bff8f",
  },
  belt: {
    name: "ASTEROID BELT",
    slots: diamondSlots(),
    sway: { ax: 5, ay: 4, px: 0, py: 0 },
    entry: "drop",
    dive: 1,
    bg: "#0c0706",
    haze: ["#21130c", "#181010"],
    far: ["#4a3828", "#3a2c24"],
    mid: ["#a08060", "#8a7a6a"],
    near: ["#f4ecff", "#ffd9a8"],
    props: "rocks",
    prop: ["#3a2a1e", "#2a1e16", "#4e3a28", "#18110c"],
    accent: "#ff9a3c",
  },
  aurora: {
    name: "AURORA",
    slots: arcSlots(),
    sway: { ax: 4, ay: 5, px: 0, py: 0 },
    entry: "weave",
    dive: 1.05,
    bg: "#030913",
    haze: ["#0a2630", "#0c1a36"],
    far: ["#1f3a5a", "#24485a"],
    mid: ["#6ac0c0", "#7a9ae0"],
    near: ["#f4ecff", "#bfe9ff"],
    props: "bands",
    prop: ["#082c28", "#0a2642", "#0c302c"],
    accent: "#ffd23f",
  },
};

/** A folder name for a title: letters the pixel font has, at most n of them. */
export function titleOf(folder: string, n = 12): string {
  const t = folder
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 .,\-_&+#@()!']/g, "")
    .trim();
  const s = t || "FILES";
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}.` : s;
}

/** Themes for n stages, picked with the rng; never the same twice in a row, and all of them before any repeats. */
export function pickThemes(n: number, rng: () => number): ThemeId[] {
  const out: ThemeId[] = [];
  let bag: ThemeId[] = [];
  while (out.length < n) {
    if (!bag.length) bag = THEME_IDS.slice();
    let i = Math.floor(rng() * bag.length);
    if (bag[i] === out[out.length - 1] && bag.length > 1) i = (i + 1) % bag.length;
    out.push(bag.splice(i, 1)[0]);
  }
  return out;
}
