// Level themes for Undelete: each floor of the maze picks one at random.
// A theme sets the layout (room sizes, corridors, what cover the rooms get),
// which wall textures it uses, the colors everything is tinted toward, the
// floor and ceiling, and the props lying around. Pure data, no drawing.

import { CLASSIC, type Layout } from "./maze";

export type PropKind = "paper" | "plant" | "cable" | "drive" | "box" | "stack" | "peel" | "barrel" | "crystal" | "drift";

export interface Theme {
  id: string;
  /** Shown under the level title. */
  name: string;
  layout: Layout;
  /** Walls blend toward this color by `amount` (0 keeps the textures as drawn). */
  tint: string;
  amount: number;
  /** Floor tile: grout, tile, fleck. */
  floor: [string, string, string];
  /** Ceiling: seams, panel, light rim, light. */
  ceil: [string, string, string, string];
  /** One ceiling tile in this many has a light. */
  lights: number;
  /** Two kinds of prop, and how many per room on average. */
  props: [PropKind, PropKind];
  density: number;
}

export const THEMES: Theme[] = [
  {
    id: "bin",
    name: "THE BIN",
    layout: CLASSIC,
    tint: "#000000",
    amount: 0,
    floor: ["#2b1d45", "#1a1030", "#3d2a5e"],
    ceil: ["#0b0614", "#160d28", "#a493c4", "#f4ecff"],
    lights: 5,
    props: ["paper", "plant"],
    density: 1,
  },
  {
    // narrow, many small rooms in a grid of racks, lots of loops
    id: "server",
    name: "SERVER ROOM",
    layout: { room: [5, 3], rooms: 1.2, wide: 0.15, loops: 2, cover: "racks", pillars: 0, walls: [4, 2, 4], fill: 2, pillar: 4 },
    tint: "#2a6aff",
    amount: 0.3,
    floor: ["#0f2a3a", "#08141f", "#1d5a7a"],
    ceil: ["#04090f", "#0a1622", "#3aa8c8", "#b8f4ff"],
    lights: 3,
    props: ["cable", "drive"],
    density: 1.2,
  },
  {
    // a few big halls full of cabinet pillars, wide corridors
    id: "vault",
    name: "ARCHIVE VAULT",
    layout: { room: [6, 4], rooms: 0.75, wide: 0.7, loops: 4, cover: "corners", pillars: 4, walls: [3, 1, 3], fill: 1, pillar: 3 },
    tint: "#c98a2a",
    amount: 0.35,
    floor: ["#3a2a12", "#21170a", "#5a4220"],
    ceil: ["#0d0904", "#1c1408", "#c9a227", "#ffe9a8"],
    lights: 7,
    props: ["box", "stack"],
    density: 1.4,
  },
  {
    // twisty: many small rooms, narrow corridors, junk piles in the way
    id: "compost",
    name: "COMPOST HEAP",
    layout: { room: [4, 3], rooms: 1.3, wide: 0.1, loops: 2.5, cover: "scatter", pillars: 0, walls: [5, 4, 1, 5], fill: 1, pillar: 5 },
    tint: "#5fbf3a",
    amount: 0.42,
    floor: ["#1f3318", "#111d0c", "#3a5a22"],
    ceil: ["#060b04", "#0f170b", "#6bff8f", "#e0ffd0"],
    lights: 6,
    props: ["peel", "barrel"],
    density: 1.2,
  },
  {
    // open rooms with ice blocks to dodge around, bright walls
    id: "cold",
    name: "COLD STORAGE",
    layout: { room: [5, 4], rooms: 0.9, wide: 0.5, loops: 3, cover: "scatter", pillars: 0, walls: [1, 1, 2], fill: 1, pillar: 2 },
    tint: "#8fdcff",
    amount: 0.45,
    floor: ["#2a3d55", "#16233a", "#4a6a8a"],
    ceil: ["#060a12", "#101a2a", "#86ecff", "#f4fbff"],
    lights: 4,
    props: ["crystal", "drift"],
    density: 1,
  },
];

/** Pick a theme for the next floor: any but the one just played. */
export function pickTheme(rng: () => number, last: Theme | null): Theme {
  const pool = last ? THEMES.filter((t) => t !== last) : THEMES;
  return pool[Math.floor(rng() * pool.length)];
}

/** How many floors a round's zombies are spread over: one for a small round, up to four for a big one. */
export const levelsFor = (zombies: number) => (zombies < 16 ? 1 : Math.min(4, Math.ceil(zombies / 14)));

/** "LEVEL 2 - DOWNLOADS": the level's number and its folder (cycling through the round's folders). */
export function levelTitle(i: number, folders: string[]): string {
  const raw = folders.length ? folders[i % folders.length] : "BIN";
  const name = raw.toUpperCase().replace(/\s+/g, " ").trim();
  return `LEVEL ${i + 1} - ${name.length > 14 ? name.slice(0, 13) + "." : name || "BIN"}`;
}
