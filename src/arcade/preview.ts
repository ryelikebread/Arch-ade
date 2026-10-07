// Dev-only: runs one mini-game in a plain page (dev/arcade.html), without
// the app around it, so it can be played in a browser or screenshotted.
//   ?game=<id>          which game
//   &round=sample|empty|one|big   which files (default sample)
//   &seed=1             rng seed
//   &script=30:right,fire;60:left   run ticks holding buttons, then stop and show that frame
//   &scale=3            CSS zoom
// Without `script` the game runs live (arrows, Space, X).

import { drawText, textWidth } from "../pixel/font";
import { arcadeIcon } from "../pixel/sprites";
import type { Kind } from "../types";
import { KeyInput } from "./input";
import { GAMES } from "./registry";
import { cast, seeded } from "./round";
import { file, sampleRound } from "./testing";
import type { ArcadeRound, Button, GameContext, GameResult } from "./types";

const q = new URLSearchParams(location.search);
const out = document.createElement("pre");

function roundFor(name: string | null): ArcadeRound {
  if (name === "empty") return { source: "Plan", files: [] };
  if (name === "one") return { source: "Plan", files: [file("lonely.txt", "text", 500, "trashed")] };
  if (name === "big") {
    const kinds: Kind[] = ["image", "pdf", "markdown", "audio", "video", "archive", "installer", "unknown", "xlsx", "json"];
    return {
      source: "Plan",
      files: Array.from({ length: 120 }, (_, i) => file(`file-${i}.dat`, kinds[i % kinds.length], 1000 * 3 ** (i % 12), i % 3 ? "trashed" : i % 2 ? "kept" : "deleted")),
    };
  }
  return sampleRound();
}

async function main() {
  const entry = GAMES.find((g) => g.id === q.get("game")) ?? GAMES[0];
  const mod = await entry.load();
  const [w, h] = mod.size;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const scale = Number(q.get("scale") ?? 3);
  canvas.style.width = `${w * scale}px`;
  canvas.style.height = `${h * scale}px`;
  document.body.append(canvas, out);
  const g = canvas.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  const theCast = cast(roundFor(q.get("round")));
  const icons = new Map<Kind, HTMLImageElement>();
  await Promise.all(
    [...new Set([...theCast.foes, ...theCast.friends].flatMap((x) => (x.file ? [x.file.kind] : [])))].map(
      (k) =>
        new Promise<void>((res) => {
          const img = new Image();
          img.onload = img.onerror = () => res();
          img.src = arcadeIcon(k);
          icons.set(k, img);
        }),
    ),
  );
  const input = new KeyInput();
  let result: GameResult | null = null;
  const ctx: GameContext = {
    width: w,
    height: h,
    g,
    cast: theCast,
    input,
    rng: seeded(Number(q.get("seed") ?? 1)),
    sfx: () => {},
    icon: (k) => icons.get(k) ?? null,
    text: (s, x, y, c, sc = 1) => drawText(g, s, x, y, c, sc),
    textWidth,
    end: (r) => (result ??= r),
  };
  const game = mod.create(ctx);
  const script = q.get("script");
  const keyOf: Record<Button, string> = { left: "ArrowLeft", right: "ArrowRight", up: "ArrowUp", down: "ArrowDown", fire: " ", alt: "x" };
  if (script) {
    let tick = 0;
    for (const part of script.split(";")) {
      const [n, held = ""] = part.split(":");
      for (const k of Object.values(keyOf)) input.keyup(k);
      for (const b of held.split(",").filter(Boolean)) input.keydown(keyOf[b as Button]);
      for (let i = 0; i < Number(n) && !result; i++, tick++) {
        game.update(1 / 30);
        input.endTick();
      }
    }
    game.draw();
    out.textContent = `${mod.title} after ${tick} ticks${result ? `: ended ${JSON.stringify(result)}` : ""}`;
    document.title = "done";
    return;
  }
  addEventListener("keydown", (e) => input.keydown(e.key) && e.preventDefault());
  addEventListener("keyup", (e) => input.keyup(e.key));
  canvas.addEventListener("mousemove", (e) => input.pointer(((e.clientX - canvas.getBoundingClientRect().left) / scale)));
  canvas.addEventListener("mousedown", () => input.pointerDown());
  const loop = () => {
    if (!result) {
      game.update(1 / 30);
      input.endTick();
      game.draw();
      setTimeout(loop, 1000 / 30);
    } else out.textContent = `ended ${JSON.stringify(result)}`;
  };
  loop();
}

main().catch((e) => (out.textContent = String(e?.stack ?? e), document.body.append(out), (document.title = "error")));
