import { describe, expect, it } from "vitest";
import { addScore, forGame, KEEP, normalizeScores, type ScoreEntry } from "./scores";

const e = (game: string, score: number, at = score): ScoreEntry => ({ game, score, won: false, at, folder: "Downloads", files: 3, source: "Plan" });

describe("leaderboard", () => {
  it("ranks best first and keeps the top scores per game", () => {
    let list: ScoreEntry[] = [];
    for (let i = 1; i <= KEEP + 3; i++) list = addScore(list, e("a", i * 10)).list;
    list = addScore(list, e("b", 5)).list;
    expect(forGame(list, "a").map((x) => x.score)).toEqual(Array.from({ length: KEEP }, (_, i) => (KEEP + 3 - i) * 10));
    expect(forGame(list, "b")).toHaveLength(1);
  });
  it("says where a new score landed, or null when it didn't make it", () => {
    let list: ScoreEntry[] = [];
    for (let i = 0; i < KEEP; i++) list = addScore(list, e("a", 100 + i)).list;
    expect(addScore(list, e("a", 105, 9999)).rank).toBe(6);
    expect(addScore(list, e("a", 1)).rank).toBeNull();
  });
  it("drops junk and carries over old best scores", () => {
    expect(normalizeScores([{ game: "a" }, null, e("a", 3)])).toHaveLength(1);
    expect(normalizeScores(undefined, { a: 40, b: 0 })).toEqual([{ game: "a", score: 40, won: false, at: 0, folder: "", files: 0, source: "" }]);
  });
});
