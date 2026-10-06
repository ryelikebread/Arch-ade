import { describe, expect, it } from "vitest";
import { defaultFilters, matches, sortEntries, sourceOptions } from "./filter";
import { formatAge, formatSize } from "./format";
import { label, match } from "./hotkeys";
import { validateTheme } from "./theme";
import type { FileEntry } from "../types";
import themes from "../themes";

const now = Date.UTC(2026, 9, 6);
const day = 86_400_000;

function entry(name: string, over: Partial<FileEntry> = {}): FileEntry {
  return {
    path: `/r/${name}`, rel: name, name, ext: name.split(".").pop() ?? "", kind: "text", kindLabel: "Text",
    isDir: false, isSymlink: false, size: 10, created: now - day, modified: now - day, added: null, source: null, project: null,
    ...over,
  };
}

describe("sorting", () => {
  it("sorts names naturally, folders first", () => {
    const list = [entry("file10.txt"), entry("file2.txt"), entry("Zeta", { isDir: true, kind: "folder" }), entry("alpha.txt")];
    expect(sortEntries(list, "name", true).map((e) => e.name)).toEqual(["Zeta", "alpha.txt", "file2.txt", "file10.txt"]);
    expect(sortEntries(list, "name", false, false).map((e) => e.name)[0]).toBe("Zeta");
  });
  it("puts missing dates last either way", () => {
    const list = [entry("a", { added: null }), entry("b", { added: now - 5 * day }), entry("c", { added: now })];
    expect(sortEntries(list, "added", true).map((e) => e.name)).toEqual(["b", "c", "a"]);
    expect(sortEntries(list, "added", false).map((e) => e.name)).toEqual(["c", "b", "a"]);
  });
});

describe("filters", () => {
  const src = (app: string | null, domain: string | null) => ({
    url: null, referrer: null, domain, app, appConfidence: "reported" as const, downloadedAt: null, zone: null,
  });
  const list = [
    entry("old.pdf", { kind: "pdf", modified: now - 40 * day, size: 5000 }),
    entry("new.png", { kind: "image", modified: now - 2 * day, source: src("Slack", "files.slack.com") }),
    entry("gh.zip", { kind: "archive", source: src(null, "github.com") }),
  ];
  it("by kind, size, age and source", () => {
    const f = defaultFilters();
    expect(list.filter((e) => matches(e, { ...f, kinds: ["pdf"] }, now)).length).toBe(1);
    expect(list.filter((e) => matches(e, { ...f, minSize: 1000 }, now)).map((e) => e.name)).toEqual(["old.pdf"]);
    expect(list.filter((e) => matches(e, { ...f, olderThanDays: 30 }, now)).map((e) => e.name)).toEqual(["old.pdf"]);
    expect(list.filter((e) => matches(e, { ...f, newerThanDays: 7 }, now)).length).toBe(2);
    expect(list.filter((e) => matches(e, { ...f, source: "Slack" }, now)).map((e) => e.name)).toEqual(["new.png"]);
    expect(list.filter((e) => matches(e, { ...f, source: "github.com" }, now)).map((e) => e.name)).toEqual(["gh.zip"]);
    expect(list.filter((e) => matches(e, { ...f, source: "none" }, now)).map((e) => e.name)).toEqual(["old.pdf"]);
    expect(list.filter((e) => matches(e, { ...f, text: "NEW" }, now)).length).toBe(1);
    expect(sourceOptions(list)).toEqual(["files.slack.com", "github.com", "Slack"]);
  });
});

describe("hotkeys", () => {
  const k = (key: string, o: Partial<{ meta: boolean; ctrl: boolean; shift: boolean; alt: boolean }> = {}) => ({
    key, metaKey: !!o.meta, ctrlKey: !!o.ctrl, shiftKey: !!o.shift, altKey: !!o.alt,
  });
  it("uses Cmd on mac and Ctrl elsewhere", () => {
    expect(match(k("z", { meta: true }), true)).toBe("undo");
    expect(match(k("z", { ctrl: true }), true)).toBe(null);
    expect(match(k("z", { ctrl: true }), false)).toBe("undo");
    expect(match(k("z", { meta: true }), false)).toBe(null);
    expect(match(k("Z", { ctrl: true, shift: true }), false)).toBe("redo");
    expect(match(k("y", { ctrl: true }), false)).toBe("redo");
    expect(match(k("F2"), true)).toBe("rename");
    expect(match(k("?", { shift: true }), false)).toBe("help");
    expect(match(k("a"), false)).toBe(null);
  });
  it("labels per OS", () => {
    expect(label("undo", true)).toBe("Cmd+Z");
    expect(label("undo", false)).toBe("Ctrl+Z");
    expect(label("duplicates", false)).toBe("Ctrl+Shift+D");
  });
});

describe("format", () => {
  it("sizes and ages", () => {
    expect(formatSize(500)).toBe("500 B");
    expect(formatSize(1536)).toBe("1.5 KB");
    expect(formatSize(50 * 1024 * 1024)).toBe("50 MB");
    expect(formatAge(now - 3 * day, now)).toBe("3d");
    expect(formatAge(null, now)).toBe("n/a");
  });
});

describe("themes", () => {
  it("bundled themes are valid", () => {
    expect(themes.length).toBeGreaterThan(2);
    for (const t of themes) expect(Array.isArray(validateTheme(t))).toBe(false);
  });
  it("rejects bad themes", () => {
    expect(validateTheme({ id: "X Y", name: "", colors: { bg: "red" } })).toEqual(expect.arrayContaining(["name is required"]));
  });
});
