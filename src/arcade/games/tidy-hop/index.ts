// Placeholder until the game is built.
import type { GameModule } from "../../types";

export const game: GameModule = {
  id: "tidy-hop",
  title: "tidy-hop",
  inspiredBy: "",
  blurb: "",
  controls: [],
  size: [320, 180],
  create(ctx) {
    return {
      update() {
        if (ctx.input.pressed("fire")) ctx.end({ won: true, score: 0, defeated: 0, foes: ctx.cast.foes.length, collected: 0 });
      },
      draw() {
        ctx.g.fillStyle = "#000";
        ctx.g.fillRect(0, 0, ctx.width, ctx.height);
        ctx.text("PLACEHOLDER", 10, 10, "#fff");
      },
    };
  },
};
