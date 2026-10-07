// Brick Sort: a brick-breaker where the round's trashed and deleted files
// are the wall, and the kept ones fall out of it as power-up capsules.
// Rules live in logic.ts, the art in sprites.ts, drawing in draw.ts.

import type { Game, GameModule } from "../../types";
import { render } from "./draw";
import { newState, step, type State } from "./logic";
import { makeArt, type Art } from "./sprites";

/** The game plus its state, so tests can look inside. */
export interface BrickGame extends Game {
  readonly state: State;
}

export const game: GameModule = {
  id: "brick-sort",
  title: "Brick Sort",
  inspiredBy: "Inspired by brick-breaker paddle games",
  blurb: "Trashed and deleted files are the bricks (bigger files take more hits); kept files fall out of them as power-up capsules.",
  controls: [["Arrows/mouse", "move"], ["Space/click", "launch"], ["Hold Space", "rapid fire"], ["X", "spare ball"]],
  size: [320, 180],
  create(ctx) {
    const state = newState(ctx);
    let art: Art | null = null;
    const g: BrickGame = {
      state,
      update: () => step(state),
      // The art is made on the first draw (and stays null without a canvas).
      draw: () => render(state, ctx, (art ??= makeArt())),
    };
    return g;
  },
};
