// Helpers for testing games without a canvas (vitest runs in jsdom, which
// has no 2D context): a do-nothing context, scripted input, and a runner.

import { KeyInput } from "./input";
import { cast as castRound, levelFolders, seeded } from "./round";
import type { ArcadeFile, ArcadeRound, Cast, Fate, GameContext, GameModule, GameResult } from "./types";
import type { Kind } from "../types";

/** A 2D context whose methods do nothing (measureText returns a width). */
export function nullContext(): CanvasRenderingContext2D {
  const fn = () => undefined;
  return new Proxy({} as CanvasRenderingContext2D, {
    get: (target, key) => {
      if (key in target) return (target as unknown as Record<string | symbol, unknown>)[key];
      if (key === "measureText") return () => ({ width: 0 });
      if (key === "createImageData" || key === "getImageData")
        return (w: number | ImageData, h?: number) => {
          const W = typeof w === "number" ? w : w.width;
          const H = typeof w === "number" ? h! : w.height;
          return { width: W, height: H, data: new Uint8ClampedArray(W * H * 4) };
        };
      if (key === "createLinearGradient" || key === "createRadialGradient" || key === "createPattern") return () => ({ addColorStop: fn });
      return fn;
    },
    set: (target, key, value) => {
      (target as unknown as Record<string | symbol, unknown>)[key] = value;
      return true;
    },
  });
}

export function file(name: string, kind: Kind, bytes: number, fate: Fate): ArcadeFile {
  return { name, kind, kindLabel: kind, bytes, fate };
}

/** A typical round: a few foes of different kinds and sizes, and a few friends. */
export function sampleRound(): ArcadeRound {
  const FOLDERS = ["Downloads", "Photos", "Work", "Music"];
  return {
    source: "File by File",
    folders: FOLDERS,
    files: ([
      file("holiday.jpg", "image", 3_000_000, "trashed"),
      file("old-report.pdf", "pdf", 800_000, "deleted"),
      file("notes.md", "markdown", 2_000, "trashed"),
      file("song.mp3", "audio", 5_000_000, "trashed"),
      file("clip.mp4", "video", 90_000_000, "trashed"),
      file("backup.zip", "archive", 40_000_000, "deleted"),
      file("setup.dmg", "diskImage", 300_000_000, "trashed"),
      file("thing.bin", "unknown", 1_000, "trashed"),
      file("photo.png", "image", 1_000_000, "kept"),
      file("budget.xlsx", "xlsx", 50_000, "moved"),
      file("script.json", "json", 4_000, "renamed"),
      file("mix.mp3", "audio", 4_000_000, "kept"),
      file("movie.mov", "video", 200_000_000, "moved"),
      file("bundle.zip", "archive", 10_000_000, "kept"),
      file("tool.pkg", "installer", 50_000_000, "kept"),
      file("misc.dat", "unknown", 100, "kept"),
    ] as ArcadeFile[]).map((f, i) => ({ ...f, folder: FOLDERS[i % FOLDERS.length] })),
  };
}

export interface Harness {
  ctx: GameContext;
  input: KeyInput;
  result: () => GameResult | null;
  /** Run `ticks` updates (and a draw every `drawEvery`), holding `hold` buttons. Stops early when the game ends. Each call presses `hold` afresh, so they count as "pressed" on its first tick. */
  run(ticks: number, hold?: Parameters<KeyInput["held"]>[0][], drawEvery?: number): GameResult | null;
}

export function harness(mod: GameModule, round: ArcadeRound | Cast = sampleRound(), seed = 1): Harness & { game: ReturnType<GameModule["create"]> } {
  const input = new KeyInput();
  const keyOf = { left: "ArrowLeft", right: "ArrowRight", up: "ArrowUp", down: "ArrowDown", fire: " ", alt: "x" } as const;
  let result: GameResult | null = null;
  let ends = 0;
  const [width, height] = mod.size;
  const ctx: GameContext = {
    width,
    height,
    g: nullContext(),
    cast: "files" in round ? castRound(round) : round,
    folders: levelFolders("files" in round ? round : null),
    input,
    rng: seeded(seed),
    sfx: () => {},
    icon: () => null,
    text: () => {},
    textWidth: (s) => s.length * 4 - 1,
    end: (r) => {
      ends++;
      if (ends > 1) throw new Error("end() called twice");
      result = r;
    },
  };
  const game = mod.create(ctx);
  return {
    ctx,
    input,
    game,
    result: () => result,
    run(ticks, hold = [], drawEvery = 10) {
      for (const b of Object.values(keyOf)) input.keyup(b);
      for (const b of hold) input.keydown(keyOf[b]);
      for (let i = 0; i < ticks && !result; i++) {
        game.update(1 / 30);
        input.endTick();
        if (i % drawEvery === 0) game.draw();
      }
      return result;
    },
  };
}
