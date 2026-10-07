// The contract between the arcade host and its mini-games. A game is a
// separate module, loaded only when it's picked; it gets a GameContext and
// returns a Game the host ticks at a fixed 30 updates per second.

import type { SfxName } from "../audio/sfx";
import type { Kind } from "../types";

/** What happened to a file in the round of edits. */
export type Fate = "kept" | "moved" | "renamed" | "trashed" | "deleted";

/** A processed file, as the games see it. */
export interface ArcadeFile {
  name: string;
  kind: Kind;
  kindLabel: string;
  bytes: number;
  fate: Fate;
}

export interface ArcadeRound {
  files: ArcadeFile[];
  /** Where the round came from, for the title screen. */
  source: "File by File" | "Plan";
}

/**
 * File families. Each foe family has an ability and each friend family a
 * perk; games decide how that looks and plays.
 */
export type Family = "picture" | "document" | "sheet" | "code" | "audio" | "video" | "archive" | "package" | "other";

/**
 * What a trashed/deleted file does as an enemy:
 * - flash: blinks out of sight now and then (pictures)
 * - shield: takes the first hit(s) on a shield (documents, sheets)
 * - teleport: jumps to a new spot now and then (code and text)
 * - sonic: attacks from range with a sound wave (audio)
 * - fast: moves quickly (video)
 * - split: breaks into two smaller foes when beaten (archives)
 * - tank: slow and tough, bursts when beaten (installers, disk images)
 * - basic: nothing special (everything else)
 */
export type Ability = "flash" | "shield" | "teleport" | "sonic" | "fast" | "split" | "tank" | "basic";

/**
 * What a kept/moved/renamed file gives the player:
 * - health: heals (pictures)
 * - armor: a shield or extra life (documents, sheets)
 * - ally: a CPU helper that fights alongside you (code and text)
 * - rapid: faster firing (audio)
 * - spread: a wider weapon (video)
 * - ammo: more shots or balls (archives)
 * - power: a big weapon or bomb (installers, disk images)
 * - points: bonus points (everything else)
 */
export type Perk = "health" | "armor" | "ally" | "rapid" | "spread" | "ammo" | "power" | "points";

export interface Foe {
  /** The file, or null for filler foes added so a tiny round still plays. */
  file: ArcadeFile | null;
  /** Short label to draw (pixel font, uppercase, up to 10 characters). */
  label: string;
  family: Family;
  ability: Ability;
  /** 1..10, from the file size (bigger file, more health). */
  hp: number;
  /** Permanently deleted files are elite: tougher and worth more. */
  elite: boolean;
}

export interface Friend {
  file: ArcadeFile;
  label: string;
  family: Family;
  perk: Perk;
  /** 1..10, from the file size: how strong the perk is. */
  power: number;
}

export interface Cast {
  foes: Foe[];
  friends: Friend[];
  /** Files left out because a round has a cap on how many take part. */
  benched: number;
}

/** Buttons, the same in every game. */
export type Button = "left" | "right" | "up" | "down" | "fire" | "alt";

export interface Input {
  /** Held right now. */
  held(b: Button): boolean;
  /** Went down since the previous update. */
  pressed(b: Button): boolean;
  /** Mouse/trackpad x on the game canvas (game pixels), or null if it hasn't moved over it. */
  pointerX(): number | null;
  /** Mouse button went down since the previous update. */
  clicked(): boolean;
}

export interface GameResult {
  won: boolean;
  score: number;
  /** Foes beaten, out of how many there were (filler included). */
  defeated: number;
  foes: number;
  /** Friends picked up or freed. */
  collected: number;
}

export interface GameContext {
  /** Game pixels; the host scales the canvas up by whole numbers. */
  readonly width: number;
  readonly height: number;
  readonly g: CanvasRenderingContext2D;
  readonly cast: Cast;
  readonly input: Input;
  /** Seeded random numbers, 0 <= x < 1. Use this, never Math.random, so a round replays the same. */
  rng(): number;
  sfx(name: SfxName): void;
  /** The 8x8 icon for a file kind, ready to draw (null until loaded, or with no canvas). */
  icon(kind: Kind): CanvasImageSource | null;
  /** Pixel-font text (3x5 glyphs, uppercase). */
  text(s: string, x: number, y: number, color: string, scale?: number): void;
  /** Text width in game pixels at scale 1. */
  textWidth(s: string): number;
  /** Finish the game; the host shows the result. Call once. */
  end(r: GameResult): void;
}

export interface Game {
  /** Advance one tick (dt is always 1/30 s). */
  update(dt: number): void;
  /** Draw the current state. */
  draw(): void;
  destroy?(): void;
}

export interface GameModule {
  id: string;
  title: string;
  /** "Inspired by" line for the title screen. Genre words only, no trademarks. */
  inspiredBy: string;
  /** One or two sentences: what files become in this game. */
  blurb: string;
  /** [keys, what they do] for the title and pause screens. */
  controls: [string, string][];
  /** Game pixels [w, h]. Keep it small: 320x180 or less. */
  size: [number, number];
  create(ctx: GameContext): Game;
}
