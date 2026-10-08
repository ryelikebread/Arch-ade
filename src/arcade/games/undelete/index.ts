// Undelete: a first-person maze shooter. Trashed and deleted files rise as
// zombies (bigger file, more hits; file type, special trick); kept files lie
// around the maze as health, armor, ammo, weapons and helper bots.

import type { Game, GameModule } from "../../types";
import { View } from "./draw";
import { createWorld, step, type World } from "./logic";

export type UndeleteGame = Game & { world: World };

export const game: GameModule = {
  id: "undelete",
  title: "Undelete",
  inspiredBy: "Inspired by 90s first-person maze shooters",
  blurb: "Trashed and deleted files rise as zombies in a maze, floor after floor, one for each folder: bigger files take more hits, and each file type has its own trick. Kept files lie around as health, armor, helper bots and weapons: fan, splash, beam, ricochet and shredder.",
  controls: [
    ["Up/Down", "walk"],
    ["Left/Right", "turn"],
    ["X + Left/Right", "strafe"],
    ["Space", "fire"],
    ["Mouse", "click to steer with the mouse, click to fire"],
  ],
  size: [320, 180],
  mouse: "look",
  create(ctx) {
    const world = createWorld(ctx.cast, () => ctx.rng(), ctx.folders);
    const view = new View(ctx);
    const io = { input: ctx.input, sfx: ctx.sfx, end: ctx.end };
    const g: UndeleteGame = {
      world,
      update() {
        step(world, io);
      },
      draw() {
        view.draw(world);
      },
    };
    return g;
  },
};
