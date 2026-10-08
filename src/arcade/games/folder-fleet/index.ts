// Folder Fleet: a side-scrolling space shooter. The round's trashed and
// deleted files fly in as an enemy fleet that lines up in formation and
// dives at you; the kept ones are power capsules. Rules live in logic.ts,
// the art in sprites.ts, drawing in draw.ts.

import type { Game, GameModule } from "../../types";
import { render } from "./draw";
import { newWorld, step, type World } from "./logic";
import { backdrop, makeArt, type Art } from "./sprites";

/** The game plus its state, so tests can look inside. */
export interface FleetGame extends Game {
  readonly world: World;
}

export const game: GameModule = {
  id: "folder-fleet",
  title: "Folder Fleet",
  inspiredBy: "Inspired by side-scrolling and formation space shooters",
  blurb: "Trashed and deleted files are an enemy fleet that swoops in and dives at you (bigger files take more hits); kept files are power capsules and new guns. Each wave is named after one of your folders.",
  controls: [["Arrows", "move"], ["Space", "fire (hold)"], ["X", "power pulse"]],
  size: [320, 180],
  create(ctx) {
    const world = newWorld(ctx.cast, () => ctx.rng(), ctx.folders);
    let art: Art | null | undefined;
    let ended = false;
    const g: FleetGame = {
      world,
      update() {
        if (ended) return;
        step(world, ctx.input, () => ctx.rng());
        for (const s of world.sounds) ctx.sfx(s);
        if (world.result) {
          ended = true;
          ctx.end(world.result);
        }
      },
      // The art is made on the first draw (and stays null without a canvas).
      draw() {
        if (art === undefined) {
          art = makeArt();
          // every stage's backdrop now, so a stage change never stalls a frame
          if (art) for (const st of world.stages) backdrop(art, st.theme);
        }
        render(world, ctx, art);
      },
    };
    return g;
  },
};
