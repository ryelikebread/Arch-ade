import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameModule } from "./types";

// The host with its app services stubbed and two fake games whose loading the
// test controls, to check what happens around loads and held keys.
vi.mock("../api", () => ({ api: { getSettings: () => Promise.resolve({}), setSetting: () => Promise.resolve() } }));
vi.mock("../audio/player", () => ({ sound: { fx: () => {} } }));
vi.mock("../lib/hidden", () => ({ onWindowHidden: () => () => {} }));
vi.mock("../pixel/sprites", () => ({ arcadeIcon: () => "" }));

const created: Record<string, number> = {};
const pending: Record<string, (m: GameModule) => void> = {};
const fake = (id: string, endAfter = Infinity): GameModule => ({
  id, title: id, inspiredBy: "", blurb: "", controls: [], size: [32, 18],
  create(ctx) {
    created[id] = (created[id] ?? 0) + 1;
    let n = 0;
    return { update: () => void (++n >= endAfter && ctx.end({ won: true, score: 1, defeated: 0, foes: 0, collected: 0 })), draw: () => {} };
  },
});
vi.mock("./registry", () => ({
  GAMES: ["a", "b"].map((id) => ({ id, title: id, inspiredBy: "", load: () => new Promise<GameModule>((res) => (pending[id] = res)) })),
}));

const { openArcade } = await import("./host");
const key = (k: string, repeat = false) => document.querySelector("dialog")!.dispatchEvent(new KeyboardEvent("keydown", { key: k, repeat, bubbles: true }));
const flush = () => new Promise((r) => setTimeout(r, 0));
const round = { source: "Plan" as const, files: [] };

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.open = true; };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.open = false; };
  HTMLCanvasElement.prototype.getContext = (() => ({})) as never;
  for (const k of Object.keys(created)) delete created[k];
});
afterEach(() => document.querySelectorAll("dialog").forEach((d) => d.remove()));

describe("arcade host", () => {
  it("drops a game that finishes loading after the player backed out", async () => {
    openArcade(round, { game: "a", autostart: true });
    key("Escape"); // back to the picker while "a" loads
    pending.a(fake("a"));
    await flush();
    expect(created.a).toBeUndefined();
    expect(document.querySelector("canvas")).toBeNull();
  });

  it("never runs two games when a second is picked during a load", async () => {
    openArcade(round, { game: "a", autostart: true });
    const loadA = pending.a;
    key("Escape");
    key("ArrowDown"); // picker starts on "a": move to "b"
    key("Enter");
    loadA(fake("a"));
    pending.b(fake("b"));
    await flush();
    expect(created).toEqual({ b: 1 });
    expect(document.querySelectorAll("canvas").length).toBe(1);
  });

  it("a key held from the game doesn't pick on the result screen", async () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    try {
      openArcade(round, { game: "a", autostart: true });
      pending.a(fake("a", 1));
      await vi.waitFor(() => expect(created.a).toBe(1));
      vi.advanceTimersByTime(200);
      expect(document.querySelector("h2")?.textContent).toBe("You win!");
      key(" ", true); // Space still held from firing
      expect(created.a).toBe(1);
      expect(document.querySelector("h2")?.textContent).toBe("You win!");
      key(" "); // a fresh press does pick "Play again"
      expect(created.a).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
