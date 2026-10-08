// The mini-games, by id. Only this list is in the main bundle; each game's
// code is a separate chunk loaded when it's picked.

import type { GameModule } from "./types";

export interface GameEntry {
  id: string;
  title: string;
  inspiredBy: string;
  load: () => Promise<GameModule>;
}

export const GAMES: GameEntry[] = [
  { id: "undelete", title: "Undelete", inspiredBy: "Inspired by 90s first-person maze shooters", load: () => import("./games/undelete").then((m) => m.game) },
  { id: "brick-sort", title: "Brick Sort", inspiredBy: "Inspired by brick-breaker paddle games", load: () => import("./games/brick-sort").then((m) => m.game) },
  { id: "tidy-hop", title: "Tidy Hop", inspiredBy: "Inspired by side-scrolling platformers and kitchen stack-'em-ups", load: () => import("./games/tidy-hop").then((m) => m.game) },
  { id: "folder-fleet", title: "Folder Fleet", inspiredBy: "Inspired by side-scrolling and formation space shooters", load: () => import("./games/folder-fleet").then((m) => m.game) },
];

export const GAME_IDS = GAMES.map((g) => g.id);
