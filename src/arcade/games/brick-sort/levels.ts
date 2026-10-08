// Brick Sort's levels: a round's wall is split into up to three levels, each
// titled after one of the round's folders and dressed in a theme picked at
// random (palette, scenery, and the shape the wall is built in). No drawing
// and no randomness here; logic.ts rolls ctx.rng and passes the results in.

/** Shapes a wall can be built in (on the 13-column grid). */
export type Pattern = "full" | "pyramid" | "gaps" | "checker" | "diamond" | "towers";

export type Scenery = "grid" | "windows" | "racks" | "stars" | "scraps";

export interface Theme {
  id: string;
  /** Shown under the level title. */
  name: string;
  bg: string;
  /** The strip behind the HUD. */
  top: string;
  frame: string;
  frameHi: string;
  bolt: string;
  /** Scenery colors: faint, so bricks always read in front of it. */
  deco: string;
  deco2: string;
  /** Plain wall bricks (dim; file bricks keep their family colors). */
  wall: string;
  /** Title text. */
  accent: string;
  scenery: Scenery;
  /** Shapes this theme builds in (one picked per level). */
  patterns: Pattern[];
  /** How many in-pattern cells get a plain wall brick. */
  fill: number;
}

export const THEMES: Theme[] = [
  {
    id: "arcade", name: "NEON ARCADE", bg: "#07040f", top: "#0e0820", frame: "#3b2e63", frameHi: "#5c4b8f", bolt: "#a493c4",
    deco: "#1b1233", deco2: "#140d28", wall: "#30254f", accent: "#ffd23f", scenery: "grid", patterns: ["full", "gaps"], fill: 0.86,
  },
  {
    id: "desktop", name: "DESKTOP", bg: "#04121a", top: "#071c26", frame: "#1f4a5a", frameHi: "#2f7a8a", bolt: "#7fd6e0",
    deco: "#0b2733", deco2: "#0e3341", wall: "#1d4252", accent: "#4de1ff", scenery: "windows", patterns: ["pyramid", "towers"], fill: 0.8,
  },
  {
    id: "server", name: "SERVER ROOM", bg: "#040d07", top: "#08170d", frame: "#24452c", frameHi: "#3d7a4a", bolt: "#6bff8f",
    deco: "#0a170d", deco2: "#1d6b33", wall: "#2f6040", accent: "#6bff8f", scenery: "racks", patterns: ["gaps", "checker"], fill: 0.75,
  },
  {
    id: "cloud", name: "NIGHT CLOUD", bg: "#060a1f", top: "#0a1030", frame: "#2a3266", frameHi: "#4a5aa8", bolt: "#b9c6ff",
    deco: "#121a40", deco2: "#8a94c8", wall: "#2a3270", accent: "#b9c6ff", scenery: "stars", patterns: ["diamond", "pyramid"], fill: 0.8,
  },
  {
    id: "bin", name: "RECYCLE BIN", bg: "#110806", top: "#1c0e09", frame: "#4a2a1a", frameHi: "#7a4a2a", bolt: "#ff9f43",
    deco: "#24130d", deco2: "#2e1a12", wall: "#4d2e24", accent: "#ff9f43", scenery: "scraps", patterns: ["checker", "diamond", "full"], fill: 0.7,
  },
];

/** Is grid cell (r, c) part of the shape, for a wall of `rows` rows and `cols` columns? */
export function inPattern(p: Pattern, r: number, c: number, rows: number, cols: number): boolean {
  const mid = (cols - 1) / 2;
  switch (p) {
    case "full":
      return true;
    case "pyramid":
      // narrow at the top, the full width at the bottom
      return Math.abs(c - mid) <= 1 + Math.round((r * (mid - 1)) / Math.max(1, rows - 1));
    case "gaps":
      // every third row is a gap, and two columns are open shafts
      return r % 3 !== 2 && c !== 4 && c !== 8;
    case "checker":
      // two-cell squares, so wide bricks fit
      return (Math.floor(c / 2) + r) % 2 === 0;
    case "diamond": {
      const rm = (rows - 1) / 2;
      return Math.abs(c - mid) / (mid + 0.5) + Math.abs(r - rm) / (rows / 2) <= 1.05;
    }
    case "towers":
      // pairs of columns with a roof joining them
      return r === 0 || Math.floor(c / 2) % 2 === 0;
  }
}

/** Up to n characters, with a dot when cut. */
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}.` : s);

/** The folder a level is named after (cycling through the round's folders). */
export function levelFolder(folders: string[], level: number): string {
  const name = folders.length ? folders[level % folders.length] : "Files";
  return cut((name.trim() || "Files").toUpperCase(), 14);
}

/** "LEVEL 2 - DOWNLOADS". */
export const levelTitle = (folders: string[], level: number) => `LEVEL ${level + 1} - ${levelFolder(folders, level)}`;

/** Levels for a round of n foes: about 16 foes a level, 1 to 3 levels. */
export const levelCount = (n: number) => Math.max(1, Math.min(3, Math.round(n / 16)));
