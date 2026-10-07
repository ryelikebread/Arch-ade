// The arcade screen: pick a game, play it, see how it went. Loaded only when
// a round is actually played, and each game is loaded only when picked.
// The loop runs 30 updates a second, draws at most 30 frames, and stops
// completely while paused, while the window is hidden, and when closed.

import { api } from "../api";
import { sound } from "../audio/player";
import { onWindowHidden } from "../lib/hidden";
import { drawText, textWidth } from "../pixel/font";
import { arcadeIcon } from "../pixel/sprites";
import { h } from "../ui/dom";
import type { Kind } from "../types";
import { KeyInput } from "./input";
import { GAMES, type GameEntry } from "./registry";
import { cast as castRound, seeded, seedOf } from "./round";
import type { ArcadeRound, Game, GameContext, GameModule, GameResult } from "./types";

export const FPS = 30;
const STEP = 1 / FPS;

export interface ArcadeOptions {
  /** A game id or "random". */
  game: string;
  /** Start that game right away instead of showing the picker. */
  autostart: boolean;
}

export function openArcade(round: ArcadeRound, opts: ArcadeOptions) {
  const theCast = castRound(round);
  let attempt = 0;
  let best: Record<string, number> = {};
  api.getSettings().then((s) => (best = (s.arcadeBest as Record<string, number> | undefined) ?? {}), () => {});

  const screen = h("div", { class: "arcade-screen" });
  const dialog = h("dialog", { class: "arcade arcade-host", "aria-label": "Arcade" }, h("div", { class: "arcade-frame" }, screen));
  document.body.append(dialog);
  dialog.addEventListener("cancel", (ev) => ev.preventDefault()); // Esc is handled per screen
  dialog.showModal();
  dialog.focus();

  let keyHandler: ((ev: KeyboardEvent) => void) | null = null;
  // Keys stay in the arcade: File by File and the main window listen on the
  // document, and Esc or an arrow must not close or step them underneath.
  const onKey = (ev: KeyboardEvent) => {
    ev.stopPropagation();
    keyHandler?.(ev);
  };
  dialog.addEventListener("keydown", onKey);
  let stopGame: (() => void) | null = null;

  // Bumped whenever the screen moves on, so a game that finishes loading
  // after the player backed out (or picked another) is dropped.
  let loadSeq = 0;

  function close() {
    loadSeq++;
    keyHandler = null;
    stopGame?.();
    dialog.close();
    dialog.remove();
  }

  // ---------- a list menu like the Sound menu ----------
  function menu(title: string, intro: Node[], items: { label: string; hint?: string; run: () => void }[], start = 0, onEsc = close) {
    let at = Math.min(start, items.length - 1);
    const list = h("div", { class: "arcade-rows" });
    const hint = h("div", { class: "arcade-info" });
    const draw = () => {
      list.replaceChildren(
        ...items.map((it, i) =>
          h(
            "div",
            { class: `arcade-row${i === at ? " sel" : ""}`, onclick: () => it.run(), onmouseenter: () => ((at = i), draw()) },
            h("span", { class: "cursor" }, i === at ? "▶" : ""),
            h("span", { class: "label" }, it.label),
            h("span", { class: "value" }, ""),
          ),
        ),
      );
      hint.textContent = items[at].hint ?? "";
    };
    keyHandler = (ev) => {
      // A key still held from the game (Space to fire) must not pick an item.
      if (ev.repeat) return void ev.preventDefault();
      if (ev.key === "ArrowUp" || ev.key === "ArrowDown") at = (at + (ev.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
      else if (ev.key === "Enter" || ev.key === " ") return void (ev.preventDefault(), items[at].run());
      else if (ev.key === "Escape") return void (ev.preventDefault(), onEsc());
      else return;
      ev.preventDefault();
      draw();
    };
    screen.replaceChildren(h("h2", {}, title), ...intro, list, hint, h("div", { class: "arcade-keys" }, "↑↓ select   Enter OK   Esc back"));
    draw();
  }

  function summary(): Node {
    const n = round.files.length;
    const foes = theCast.foes.length;
    const friends = theCast.friends.length;
    return h(
      "p",
      { class: "arcade-sub" },
      `${n} file${n === 1 ? "" : "s"} from ${round.source}: ${foes} trashed or deleted become foes, ${friends} kept become pickups and allies.` +
        (theCast.benched ? ` ${theCast.benched} more sit this one out.` : ""),
    );
  }

  function picker(start = 0) {
    loadSeq++;
    const items = [
      ...GAMES.map((g) => ({ label: g.title, hint: g.inspiredBy, run: () => play(g) })),
      { label: "Random", hint: "Any of the four", run: () => play(randomGame()) },
      { label: "Close", hint: "", run: close },
    ];
    menu("Arcade", [summary()], items, start);
  }

  function randomGame(): GameEntry {
    // Varies per attempt without Math.random, so it's still reproducible for a round.
    const r = seeded(seedOf(round) + attempt * 977)();
    return GAMES[Math.floor(r * GAMES.length)];
  }

  // ---------- playing ----------
  async function play(entry: GameEntry) {
    stopGame?.();
    const token = ++loadSeq;
    screen.replaceChildren(h("h2", {}, entry.title), h("p", { class: "arcade-sub" }, "Loading…"));
    keyHandler = (ev) => ev.key === "Escape" && picker();
    const current = () => token === loadSeq && dialog.open;
    let mod: GameModule;
    try {
      mod = await entry.load();
    } catch (e) {
      if (current()) failed(entry, `couldn't load: ${e}`);
      return;
    }
    if (!current()) return;
    attempt++;
    run(entry, mod);
  }

  function run(entry: GameEntry, mod: GameModule) {
    stopGame?.(); // never two games at once
    const [w, h0] = mod.size;
    const canvas = h("canvas", { class: "arcade-canvas", width: w, height: h0 });
    const g = canvas.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    const input = new KeyInput();
    const icons = new Map<Kind, HTMLImageElement>();
    for (const k of new Set([...theCast.foes, ...theCast.friends].flatMap((x) => (x.file ? [x.file.kind] : [])))) {
      const img = new Image();
      img.src = arcadeIcon(k);
      icons.set(k, img);
    }
    const hud = h("div", { class: "arcade-keys" }, `${mod.controls.map(([k, d]) => `${k} ${d}`).join("   ")}   Esc pause`);
    screen.replaceChildren(h("div", { class: "arcade-stage" }, canvas), hud);
    const fit = () => {
      const scale = Math.max(1, Math.floor(Math.min((window.innerWidth * 0.86) / w, (window.innerHeight * 0.72) / h0)));
      canvas.style.width = `${w * scale}px`;
      canvas.style.height = `${h0 * scale}px`;
    };
    fit();

    const rng = seeded(seedOf(round) ^ Math.imul(attempt, 0x9e3779b9));
    let result: GameResult | null = null;
    const ctx: GameContext = {
      width: w,
      height: h0,
      g,
      cast: theCast,
      input,
      rng,
      sfx: (name) => sound.fx(name),
      icon: (kind) => {
        const img = icons.get(kind);
        return img && img.complete && img.naturalWidth ? img : null;
      },
      text: (s, x, y, color, scale = 1) => drawText(g, s, x, y, color, scale),
      textWidth: (s) => textWidth(s),
      end: (r) => {
        result ??= r;
      },
    };

    let game: Game;
    try {
      game = mod.create(ctx);
    } catch (e) {
      return failed(entry, String(e));
    }

    let raf = 0;
    let last = 0;
    let lastDraw = 0;
    let acc = 0;
    let paused = false;
    let hidden = document.hidden;
    let stopped = false;

    const halt = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const tick = (now: number) => {
      raf = 0;
      if (stopped || paused || hidden) return;
      // Driven by animation frames alone, skipping those that come too soon:
      // every 2nd frame on a 60 Hz screen, so a steady 30 fps with one update each.
      if (now - lastDraw < 1000 / FPS - 4) {
        raf = requestAnimationFrame(tick);
        return;
      }
      lastDraw = now;
      acc += Math.min(0.2, (now - last) / 1000);
      last = now;
      try {
        // Fixed steps; never more than 3 per frame so a slow frame can't snowball.
        let steps = 0;
        while (acc >= STEP && steps < 3 && !result) {
          game.update(STEP);
          input.endTick();
          acc -= STEP;
          steps++;
        }
        if (steps === 3) acc = 0;
        game.draw();
      } catch (e) {
        stop();
        return failed(entry, String(e));
      }
      if (result) {
        const r = result;
        stop();
        return finished(entry, mod, r);
      }
      raf = requestAnimationFrame(tick);
    };
    const resume = () => {
      halt();
      if (stopped || paused || hidden) return;
      last = performance.now();
      acc = STEP; // one update right away
      lastDraw = 0;
      raf = requestAnimationFrame(tick);
    };

    const unhide = onWindowHidden((hd) => {
      if (hd === hidden) return;
      hidden = hd;
      if (hd) {
        input.release();
        halt();
      } else resume();
    });
    const onUp = (ev: KeyboardEvent) => input.keyup(ev.key) && ev.preventDefault();
    // Losing focus pauses: the game can't hear the keys any more.
    const onBlur = () => {
      input.release();
      if (!stopped && !paused && !hidden) showPause();
    };
    const onMove = (ev: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      input.pointer(((ev.clientX - r.left) / r.width) * w);
    };
    const onDown = () => input.pointerDown();
    dialog.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    window.addEventListener("resize", fit);
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mousedown", onDown);

    function stop() {
      if (stopped) return;
      stopped = true;
      halt();
      unhide();
      dialog.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("resize", fit);
      try {
        game.destroy?.();
      } catch {
        // a broken destroy shouldn't keep the arcade open
      }
      if (stopGame === stop) stopGame = null;
    }
    stopGame = stop;

    const pauseOverlay = h("div", { class: "arcade-pause" });
    const showPause = () => {
      paused = true;
      halt();
      input.release();
      let at = 0;
      const items: [string, () => void][] = [
        ["Resume", () => unpause()],
        ["Restart", () => (stop(), run(entry, mod))],
        ["Other game", () => (stop(), picker())],
        ["Close arcade", () => close()],
      ];
      const draw = () =>
        pauseOverlay.replaceChildren(
          h("h2", {}, "Paused"),
          h("div", { class: "arcade-rows" }, ...items.map(([l, f], i) => h("div", { class: `arcade-row${i === at ? " sel" : ""}`, onclick: f }, h("span", { class: "cursor" }, i === at ? "▶" : ""), h("span", { class: "label" }, l), h("span")))),
          h("div", { class: "arcade-info" }, ...mod.controls.map(([k, d]) => h("p", {}, `${k}: ${d}`))),
        );
      pauseOverlay.dataset.at = "0";
      screen.querySelector(".arcade-stage")?.append(pauseOverlay);
      draw();
      keyHandler = (ev) => {
        ev.preventDefault();
        if (ev.repeat) return; // a held Esc or Space mustn't flip pause back and forth
        if (ev.key === "ArrowUp" || ev.key === "ArrowDown") at = (at + (ev.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
        else if (ev.key === "Enter" || ev.key === " ") return items[at][1]();
        else if (ev.key === "Escape" || ev.key === "p" || ev.key === "P") return unpause();
        draw();
      };
    };
    const unpause = () => {
      pauseOverlay.remove();
      paused = false;
      keyHandler = playKeys;
      resume();
    };
    const playKeys = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" || ev.key === "p" || ev.key === "P") {
        ev.preventDefault();
        return showPause();
      }
      if (ev.metaKey || ev.ctrlKey) return;
      if (input.keydown(ev.key)) ev.preventDefault();
    };
    keyHandler = playKeys;
    resume();
  }

  function finished(entry: GameEntry, mod: GameModule, r: GameResult) {
    sound.fx(r.won ? "win" : "gameover");
    const prev = best[entry.id] ?? 0;
    const record = r.score > prev;
    if (record) {
      best = { ...best, [entry.id]: r.score };
      api.setSetting("arcadeBest", best).catch(() => {});
    }
    menu(
      r.won ? "You win!" : "Game over",
      [
        h("p", { class: "arcade-big" }, `Score ${r.score}${record ? "  New best!" : `  Best ${Math.max(prev, r.score)}`}`),
        h("p", { class: "arcade-sub" }, `${r.defeated} of ${r.foes} foes beaten · ${r.collected} pickup${r.collected === 1 ? "" : "s"} collected`),
      ],
      [
        { label: "Play again", run: () => (attempt++, run(entry, mod)) },
        { label: "Other game", run: () => picker(GAMES.indexOf(entry)) },
        { label: "Close", run: close },
      ],
    );
  }

  function failed(entry: GameEntry, why: string) {
    stopGame?.();
    menu(entry.title, [h("p", { class: "arcade-sub bad" }, `This game hit a problem and stopped: ${why}`)], [
      { label: "Other game", run: () => picker() },
      { label: "Close", run: close },
    ]);
  }

  const chosen = GAMES.find((g) => g.id === opts.game);
  if (opts.autostart) play(chosen ?? randomGame());
  else picker(chosen ? GAMES.indexOf(chosen) : GAMES.length);
}
