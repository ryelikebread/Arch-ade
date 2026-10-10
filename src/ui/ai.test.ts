// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiProgress, FileEntry, Suggestion, SuggestOut } from "../types";

// Categorize with the backend stubbed: the test feeds progress events and
// decides when the run ends, to check minimizing and bringing it back.
let emit: (p: AiProgress) => void = () => {};
let finish: (out: SuggestOut) => void = () => {};
const cancelled = vi.fn();
vi.mock("@tauri-apps/api/event", () => ({ listen: (_: string, fn: (ev: { payload: AiProgress }) => void) => ((emit = (p) => fn({ payload: p })), Promise.resolve(() => {})) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: () => Promise.resolve(null) }));
vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: (p: string) => p }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: () => {} }));
vi.mock("../api", () => ({
  api: {
    aiState: () => Promise.resolve({
      settings: { enabled: false, url: "", textModel: "", visionModel: "", mode: "consistent", renameOnly: false, analyzeImages: false, whitelistId: "w" },
      whitelists: [{ id: "w", name: "Default", categories: [{ name: "Docs", subcategories: [] }], fallback: "Docs" }],
      decisions: 0, pdftotext: false, ffprobe: false,
    }),
    aiSaveSettings: () => Promise.resolve(),
    aiSuggest: () => new Promise<SuggestOut>((res) => (finish = res)),
    aiCancel: () => (cancelled(), Promise.resolve()),
    preview: () => new Promise(() => {}),
  },
}));

const { categorizeDialog, reopenCategorize, watchCategorize } = await import("./ai");

const file = (name: string) => ({ path: `/f/${name}`, name, isDir: false, size: 1 }) as FileEntry;
const suggestion = (name: string) => ({ path: `/f/${name}`, name, kind: "text", category: "Docs", subcategory: "", newName: name, source: "guess", reason: "", newSubcategory: false, screenshot: false, warning: null, domain: null }) as Suggestion;
const flush = () => new Promise((r) => setTimeout(r, 0));
const button = (text: string) => [...document.querySelectorAll("button")].find((b) => b.textContent === text)!;
const said: string[] = [];
const ctx = { root: "/f", entries: [file("a.txt"), file("b.txt")], review: () => {}, say: (t: string) => void said.push(t) };

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.open = true; };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
  document.body.replaceChildren();
  cancelled.mockClear();
});

describe("categorize in the background", () => {
  it("keeps running while minimized, reports progress and comes back", async () => {
    const seen: (string | null)[] = [];
    watchCategorize((bg) => seen.push(bg && `${bg.running ? "running" : "idle"} ${bg.label}`));
    await categorizeDialog(ctx);
    button("Suggest").click();
    await flush();
    emit({ done: 1, total: 2, suggestion: suggestion("a.txt") });

    button("Minimize").click();
    const dialog = document.querySelector("dialog")!;
    expect(dialog.open).toBe(false);
    expect(dialog.isConnected).toBe(true);
    expect(cancelled).not.toHaveBeenCalled();
    expect(seen.at(-1)).toBe("running 1 / 2 · 50%");

    emit({ done: 2, total: 2, suggestion: suggestion("b.txt") });
    expect(seen.at(-1)).toBe("running 2 / 2 · 100%");
    finish({ suggestions: [suggestion("a.txt"), suggestion("b.txt")], aiError: null, cancelled: false, failed: [] });
    await flush();
    expect(seen.at(-1)).toBe("idle Done: 2 file(s)");
    expect(said.at(-1)).toMatch(/Categorize finished: 2 suggestion/);

    // Opening Categorize again brings back the same window and its results.
    await categorizeDialog({ ...ctx, entries: [file("c.txt")] });
    expect(document.querySelectorAll("dialog").length).toBe(1);
    expect(dialog.open).toBe(true);
    expect(dialog.querySelectorAll("tbody tr").length).toBe(2);
    expect(seen.at(-1)).toBeNull();

    button("Cancel").click();
    expect(dialog.isConnected).toBe(false);
    expect(reopenCategorize()).toBe(false);
  });

  it("minimizes on Esc during a run and stops on Cancel", async () => {
    await categorizeDialog(ctx);
    button("Suggest").click();
    await flush();
    const dialog = document.querySelector("dialog")!;
    const esc = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(esc);
    expect(esc.defaultPrevented).toBe(true);
    expect(dialog.open).toBe(false);
    expect(reopenCategorize()).toBe(true);
    expect(dialog.open).toBe(true);
    button("Cancel").click();
    expect(cancelled).toHaveBeenCalledOnce();
    expect(reopenCategorize()).toBe(false);
    finish({ suggestions: [], aiError: null, cancelled: true, failed: [] });
  });
});
