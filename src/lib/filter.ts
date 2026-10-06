import type { FileEntry, Kind } from "../types";

export type SortKey = "name" | "size" | "kind" | "created" | "modified" | "added" | "source";
export type AgeField = "created" | "modified" | "added";

export interface Filters {
  text: string;
  kinds: Kind[]; // empty = all
  /** App name, domain, or the special values "" (any), "none" (no source info). */
  source: string;
  minSize: number | null;
  maxSize: number | null;
  ageField: AgeField;
  /** Only files at least this many days old / at most this many days old. */
  olderThanDays: number | null;
  newerThanDays: number | null;
  showFolders: boolean;
}

export const defaultFilters = (): Filters => ({
  text: "",
  kinds: [],
  source: "",
  minSize: null,
  maxSize: null,
  ageField: "modified",
  olderThanDays: null,
  newerThanDays: null,
  showFolders: true,
});

export function sourceLabel(e: FileEntry): string {
  const s = e.source;
  if (!s) return "";
  return s.app ?? s.domain ?? "";
}

const DAY = 86_400_000;

export function matches(e: FileEntry, f: Filters, now = Date.now()): boolean {
  if (!f.showFolders && e.isDir) return false;
  if (f.text) {
    const q = f.text.toLowerCase();
    if (!e.name.toLowerCase().includes(q) && !e.rel.toLowerCase().includes(q)) return false;
  }
  if (f.kinds.length && !f.kinds.includes(e.kind)) return false;
  if (f.source === "none") {
    if (e.source) return false;
  } else if (f.source) {
    const s = e.source;
    if (!s || (s.app !== f.source && s.domain !== f.source)) return false;
  }
  if (f.minSize != null && e.size < f.minSize) return false;
  if (f.maxSize != null && e.size > f.maxSize) return false;
  const t = e[f.ageField];
  if (f.olderThanDays != null && (t == null || now - t < f.olderThanDays * DAY)) return false;
  if (f.newerThanDays != null && (t == null || now - t > f.newerThanDays * DAY)) return false;
  return true;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function compare(a: FileEntry, b: FileEntry, key: SortKey): number {
  switch (key) {
    case "name":
      // Relative path, so recursive listings group by folder.
      return collator.compare(a.rel, b.rel);
    case "size":
      return a.size - b.size;
    case "kind":
      return collator.compare(a.kindLabel, b.kindLabel) || collator.compare(a.name, b.name);
    case "source":
      return collator.compare(sourceLabel(a), sourceLabel(b)) || collator.compare(a.name, b.name);
    default: {
      // Missing dates sort last regardless of direction is handled in sortEntries.
      return (a[key] ?? 0) - (b[key] ?? 0);
    }
  }
}

export function sortEntries(list: FileEntry[], key: SortKey, asc: boolean, foldersFirst = true): FileEntry[] {
  return [...list].sort((a, b) => {
    if (foldersFirst && a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    if (key === "created" || key === "modified" || key === "added") {
      const an = a[key] == null, bn = b[key] == null;
      if (an !== bn) return an ? 1 : -1;
    }
    const c = compare(a, b, key);
    return asc ? c : -c;
  });
}

/** Distinct source values (apps and domains) for the filter dropdown. */
export function sourceOptions(list: FileEntry[]): string[] {
  const set = new Set<string>();
  for (const e of list) {
    if (e.source?.app) set.add(e.source.app);
    if (e.source?.domain) set.add(e.source.domain);
  }
  return [...set].sort(collator.compare);
}
