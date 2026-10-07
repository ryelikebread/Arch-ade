// The small, always-loaded part of Arcade mode: settings and the launcher.
// The host and the games are separate chunks fetched only when a game opens,
// so with Arcade mode off (the default) none of it is ever loaded.

import { api } from "../api";
import { h } from "../ui/dom";
import { GAME_IDS, GAMES } from "./registry";
import { normalizeArcade, type ArcadeSettings } from "./round";
import type { ArcadeRound } from "./types";

let current: ArcadeSettings = normalizeArcade(undefined, GAME_IDS);

export function arcadeSettings(): ArcadeSettings {
  return current;
}

export function loadArcadeSettings(raw: unknown) {
  current = normalizeArcade(raw, GAME_IDS);
}

function saveArcade(patch: Partial<ArcadeSettings>) {
  current = normalizeArcade({ ...current, ...patch }, GAME_IDS);
  api.setSetting("arcade", current).catch(() => {});
}

/** Whether a round should lead to a game at all. */
export function arcadeWanted(round: ArcadeRound): boolean {
  return current.mode !== "off" && round.files.length > 0;
}

/** Open the arcade for a round. `autostart` skips the game picker. */
export async function launchArcade(round: ArcadeRound, autostart = current.mode === "auto") {
  const { openArcade } = await import("./host");
  openArcade(round, { game: current.game, autostart });
}

/** The Arcade section of Settings. */
export function arcadeSettingsSection(): Node {
  const mode = h(
    "select",
    { onchange: () => saveArcade({ mode: mode.value as ArcadeSettings["mode"] }) },
    h("option", { value: "off" }, "Off (nothing is loaded)"),
    h("option", { value: "offer" }, "Offer a game after a round of edits"),
    h("option", { value: "auto" }, "Start a game after a round of edits"),
  );
  mode.value = current.mode;
  const game = h(
    "select",
    { onchange: () => saveArcade({ game: game.value }) },
    h("option", { value: "random" }, "Random game"),
    ...GAMES.map((g) => h("option", { value: g.id }, g.title)),
  );
  game.value = current.game;
  return h(
    "div",
    {},
    h("div", { class: "head" }, "Arcade mode"),
    h("div", { class: "form-row" }, mode, game),
    h("p", { class: "note" }, "After File by File or an applied plan, the files you processed come back as a mini-game: trashed files are the enemies, kept files are pickups and allies."),
  );
}
