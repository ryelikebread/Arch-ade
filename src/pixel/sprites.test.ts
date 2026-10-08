import { describe, expect, it } from "vitest";
import { _spritesForTest } from "./sprites";

describe("sprites", () => {
  it("are all 8x8", () => {
    for (const [name, rows] of Object.entries(_spritesForTest)) {
      expect(rows.length, name).toBe(8);
      for (const r of rows) expect(r.length, `${name}: ${r}`).toBe(8);
    }
  });
});
