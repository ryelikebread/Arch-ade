import { describe, expect, it } from "vitest";
import type { FileEntry } from "../types";
import { FbfSession, fbfKey, quickPicks, remember, stemRange } from "./fbf";

const file = (name: string) => ({ name, path: `/r/${name}`, isDir: false }) as FileEntry;
const key = (k: string, extra: Partial<{ metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
  key: k, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...extra,
});

describe("File-by-File session", () => {
  it("records, skips and wraps to undecided files", () => {
    const s = new FbfSession([file("a"), file("b"), file("c")]);
    s.skip(); // leave a
    expect(s.current?.name).toBe("b");
    s.record({ action: "keep", planId: null, dryRun: false });
    expect(s.current?.name).toBe("c");
    s.record({ action: "trash", planId: 7, dryRun: false });
    expect(s.current?.name, "wraps back to the skipped file").toBe("a");
    s.record({ action: "move", planId: 8, dryRun: false, detail: "Photos" });
    expect(s.done).toBe(true);
    expect(s.counts()).toMatchObject({ keep: 1, trash: 1, move: 1 });
    expect(s.results().map((r) => r.entry.name)).toEqual(["a", "b", "c"]);
  });

  it("undo goes back newest first and reopens that file", () => {
    const s = new FbfSession([file("a"), file("b"), file("c")]);
    s.record({ action: "keep", planId: null, dryRun: false });
    s.record({ action: "rename", planId: 3, dryRun: false });
    expect(s.undoLast()?.record.planId).toBe(3);
    expect(s.current?.name).toBe("b");
    expect(s.recordFor()).toBeUndefined();
    expect(s.undoLast()?.index).toBe(0);
    expect(s.undoLast()).toBeNull();
  });

  it("a sealed decision (permanent delete) stays decided but leaves the undo list", () => {
    const s = new FbfSession([file("a"), file("b")]);
    s.record({ action: "keep", planId: null, dryRun: false });
    s.record({ action: "delete", planId: 9, dryRun: false });
    s.sealLast();
    expect(s.done).toBe(true);
    expect(s.last()?.index).toBe(0);
  });

  it("re-deciding a kept file replaces the old decision", () => {
    const s = new FbfSession([file("a"), file("b")]);
    s.record({ action: "keep", planId: null, dryRun: false });
    s.back();
    s.record({ action: "trash", planId: 1, dryRun: false });
    expect(s.counts()).toMatchObject({ keep: 0, trash: 1 });
    expect(s.undoLast()?.record.action).toBe("trash");
    expect(s.last()).toBeNull();
  });

  it("back and forward stop at the ends", () => {
    const s = new FbfSession([file("a"), file("b")]);
    s.back();
    expect(s.index).toBe(0);
    s.forward();
    s.forward();
    expect(s.index).toBe(1);
  });
});

describe("File-by-File keys", () => {
  it("maps plain keys", () => {
    expect(fbfKey(key("k"), true)).toEqual({ do: "keep" });
    expect(fbfKey(key("M"), false)).toEqual({ do: "move" });
    expect(fbfKey(key("F2"), false)).toEqual({ do: "rename" });
    expect(fbfKey(key("Backspace"), true)).toEqual({ do: "trash" });
    expect(fbfKey(key("ArrowRight"), true)).toEqual({ do: "skip" });
    expect(fbfKey(key("ArrowLeft"), true)).toEqual({ do: "back" });
    expect(fbfKey(key("3"), true)).toEqual({ do: "quick", slot: 3 });
    expect(fbfKey(key("0"), true)).toBeNull();
    expect(fbfKey(key("Escape"), true)).toEqual({ do: "close" });
  });

  it("needs Shift for delete permanently, and the platform modifier for undo", () => {
    expect(fbfKey(key("Delete", { shiftKey: true }), false)).toEqual({ do: "delete" });
    expect(fbfKey(key("Backspace", { shiftKey: true }), true)).toEqual({ do: "delete" });
    expect(fbfKey(key("z", { metaKey: true }), true)).toEqual({ do: "undo" });
    expect(fbfKey(key("z", { ctrlKey: true }), false)).toEqual({ do: "undo" });
    expect(fbfKey(key("z", { ctrlKey: true }), true)).toBeNull();
    expect(fbfKey(key("k", { metaKey: true }), true)).toBeNull();
    expect(fbfKey(key("k", { shiftKey: true }), true)).toBeNull();
    expect(fbfKey(key("t", { altKey: true }), true)).toBeNull();
  });
});

describe("quick-pick", () => {
  it("puts recent folders first without repeats", () => {
    expect(quickPicks(["/r/B", "/x"], ["/r/A", "/r/B"])).toEqual(["/r/B", "/x", "/r/A"]);
    expect(quickPicks([], Array.from({ length: 12 }, (_, i) => `/r/${i}`))).toHaveLength(9);
    expect(remember(["/a", "/b", "/c"], "/c")).toEqual(["/c", "/a", "/b"]);
  });

  it("selects the name without the extension for renaming", () => {
    expect(stemRange("photo.final.jpg")).toEqual([0, 11]);
    expect(stemRange("README")).toEqual([0, 6]);
    expect(stemRange(".bashrc")).toEqual([0, 7]);
  });
});
