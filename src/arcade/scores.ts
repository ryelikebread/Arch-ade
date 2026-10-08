// The local leaderboard: past arcade scores, kept in settings on this
// machine only (nothing leaves it). Pure, so it's tested without the app.

export interface ScoreEntry {
  game: string;
  score: number;
  won: boolean;
  /** Milliseconds since 1970. */
  at: number;
  /** The round's main folder, to tell the entries apart. */
  folder: string;
  files: number;
  source: string;
}

/** Entries kept per game. */
export const KEEP = 10;

/** Saved scores with anything malformed dropped; old best scores become entries. */
export function normalizeScores(raw: unknown, oldBest?: unknown): ScoreEntry[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: ScoreEntry[] = list
    .filter((e): e is ScoreEntry => !!e && typeof e === "object" && typeof e.game === "string" && Number.isFinite(e.score) && Number.isFinite(e.at))
    .map((e) => ({ game: e.game, score: Math.max(0, Math.round(e.score)), won: e.won === true, at: e.at, folder: String(e.folder ?? ""), files: Number(e.files) || 0, source: String(e.source ?? "") }));
  if (!out.length && oldBest && typeof oldBest === "object")
    for (const [game, score] of Object.entries(oldBest as Record<string, unknown>))
      if (typeof score === "number" && score > 0) out.push({ game, score, won: false, at: 0, folder: "", files: 0, source: "" });
  return trim(out);
}

/** Best first; ties go to the earlier score. */
export function forGame(list: ScoreEntry[], game: string): ScoreEntry[] {
  return list.filter((e) => e.game === game).sort((a, b) => b.score - a.score || a.at - b.at);
}

function trim(list: ScoreEntry[]): ScoreEntry[] {
  const games = [...new Set(list.map((e) => e.game))];
  return games.flatMap((g) => forGame(list, g).slice(0, KEEP));
}

/** Add a score: the new list and its place on that game's board (1-based), or null if it didn't make it. */
export function addScore(list: ScoreEntry[], e: ScoreEntry): { list: ScoreEntry[]; rank: number | null } {
  const next = trim([...list, e]);
  const i = forGame(next, e.game).indexOf(next.find((x) => x === e)!);
  return { list: next, rank: i >= 0 ? i + 1 : null };
}
