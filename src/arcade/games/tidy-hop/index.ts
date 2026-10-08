// Tidy Hop: a side-scrolling platformer. Trashed files walk the level as
// critters (stomp them, throw paper balls, or drop a file slab on them),
// kept files wait in item blocks as power-ups (plus wings, stars, magnets and
// speed boosts that aren't files), and the flag at the end wins. The run is
// split into levels titled after the round's folders, each with a theme.

import type { Game, GameModule } from "../../types";
import { drawWorld } from "./draw";
import { createWorld, step, type World } from "./logic";
import { buildArt, type Art } from "./sprites";

export interface TidyHopGame extends Game {
  world: World;
}

export const game: GameModule = {
  id: "tidy-hop",
  title: "Tidy Hop",
  inspiredBy: "Inspired by side-scrolling platformers and kitchen stack-'em-ups",
  blurb: "Trashed files walk the levels (one per folder, each with its own scenery) as critters to stomp; kept files hide in blocks as power-ups, with wings, stars, magnets and speed boosts besides. Walk across a file slab to drop it on whatever is below.",
  controls: [
    ["Arrows", "run"],
    ["Space", "jump (hold: higher; with wings, again in the air)"],
    ["X", "throw paper ball"],
    ["Up/Down", "climb ladders"],
  ],
  size: [320, 180],
  create(ctx) {
    const world = createWorld(ctx);
    let art: Art | null = null;
    const g: TidyHopGame = {
      world,
      update() {
        step(world, ctx.input);
      },
      draw() {
        art ??= buildArt(world.level);
        drawWorld(ctx, world, art);
      },
    };
    return g;
  },
};
