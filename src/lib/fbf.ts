// File-by-File session state, kept free of the DOM so it can be tested.

import type { Decision, FileEntry } from "../types";
import type { KeyLike } from "./hotkeys";

export type FbfAction = "keep" | "move" | "rename" | "trash" | "delete";

export interface FbfRecord {
  action: FbfAction;
  /** Journal plan that made the change; null for Keep and for dry runs. */
  planId: number | null;
  dryRun: boolean;
  /** Where the file is now (after a move or rename). */
  to?: string;
  /** Folder name or new name, for captions and the summary. */
  detail?: string;
  /** What was decided, kept for dry runs so they can be applied for real later. */
  decision?: Decision;
}

export class FbfSession {
  index = 0;
  private decided = new Map<number, FbfRecord>();
  /** Item indices in the order they were decided, for Undo. */
  private order: number[] = [];

  constructor(readonly items: FileEntry[]) {}

  get current(): FileEntry | null {
    return this.items[this.index] ?? null;
  }

  recordFor(i = this.index): FbfRecord | undefined {
    return this.decided.get(i);
  }

  get decidedCount(): number {
    return this.decided.size;
  }

  get done(): boolean {
    return this.items.length > 0 && this.decided.size === this.items.length;
  }

  /** Decide the current file and move on to the next undecided one. */
  record(rec: FbfRecord) {
    if (!this.current) return;
    if (this.decided.has(this.index)) this.order = this.order.filter((i) => i !== this.index);
    this.decided.set(this.index, rec);
    this.order.push(this.index);
    this.index = this.nextUndecided(this.index);
  }

  /** Leave the current file undecided and go to the next undecided one. */
  skip() {
    this.index = this.nextUndecided(this.index);
  }

  back() {
    if (this.index > 0) this.index--;
  }

  forward() {
    if (this.index < this.items.length - 1) this.index++;
  }

  /** The most recent decision, without changing anything. */
  /** Swap a decision's record (a dry run done for real); it becomes the newest for Undo. */
  replace(entry: FileEntry, rec: FbfRecord) {
    const i = this.items.indexOf(entry);
    if (i < 0 || !this.decided.has(i)) return;
    this.decided.set(i, rec);
    this.order = this.order.filter((x) => x !== i);
    this.order.push(i);
  }

  last(): { index: number; record: FbfRecord } | null {
    const i = this.order[this.order.length - 1];
    return i === undefined ? null : { index: i, record: this.decided.get(i)! };
  }

  /** Forget the most recent decision and show that file again. */
  undoLast(): { index: number; record: FbfRecord } | null {
    const l = this.last();
    if (!l) return null;
    this.order.pop();
    this.decided.delete(l.index);
    this.index = l.index;
    return l;
  }

  /** Drop the most recent decision from Undo but keep it as decided (a permanent delete). */
  sealLast() {
    this.order.pop();
  }

  counts(): Record<FbfAction, number> {
    const c: Record<FbfAction, number> = { keep: 0, move: 0, rename: 0, trash: 0, delete: 0 };
    for (const r of this.decided.values()) c[r.action]++;
    return c;
  }

  /** Every decision made, in item order (for the summary, and Arcade mode later). */
  results(): { entry: FileEntry; record: FbfRecord }[] {
    return [...this.decided.entries()].sort((a, b) => a[0] - b[0]).map(([i, record]) => ({ entry: this.items[i], record }));
  }

  /** Next undecided index after `from`, wrapping around; `from` itself if it's the only one. */
  private nextUndecided(from: number): number {
    const n = this.items.length;
    for (let step = 1; step <= n; step++) {
      const i = (from + step) % n;
      if (!this.decided.has(i)) return i;
    }
    return from;
  }
}

// ---------- keys ----------

export type FbfKey =
  | { do: "keep" | "move" | "rename" | "trash" | "delete" | "skip" | "back" | "undo" | "close" | "sound" }
  | { do: "quick"; slot: number };

/** File-by-File's own keys. Plain letters, so they're ignored while typing. */
export function fbfKey(e: KeyLike, isMac: boolean): FbfKey | null {
  const mod = isMac ? e.metaKey : e.ctrlKey;
  const other = isMac ? e.ctrlKey : e.metaKey;
  if (other || e.altKey) return null;
  if (mod) {
    const k = e.key.toLowerCase();
    if (!e.shiftKey && k === "z") return { do: "undo" };
    return e.shiftKey && k === "s" ? { do: "sound" } : null;
  }
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (e.shiftKey && (k === "Delete" || k === "Backspace")) return { do: "delete" };
  if (e.shiftKey) return null;
  if (/^[1-9]$/.test(k)) return { do: "quick", slot: Number(k) };
  switch (k) {
    case "k": case "Enter": return { do: "keep" };
    case "m": return { do: "move" };
    case "r": case "F2": return { do: "rename" };
    case "t": case "Delete": case "Backspace": return { do: "trash" };
    case "s": case "ArrowRight": return { do: "skip" };
    case "b": case "ArrowLeft": return { do: "back" };
    case "Escape": return { do: "close" };
  }
  return null;
}

/** Folder quick-pick: recent picks first, then the open folder's subfolders, no repeats. */
export function quickPicks(recent: string[], subfolders: string[], max = 9): string[] {
  const out: string[] = [];
  for (const p of [...recent, ...subfolders]) if (!out.includes(p)) out.push(p);
  return out.slice(0, max);
}

/** Put `picked` at the front of the recent list. */
export function remember(recent: string[], picked: string, max = 9): string[] {
  return [picked, ...recent.filter((p) => p !== picked)].slice(0, max);
}

/** The text a rename box starts with selected: the name without its extension. */
export function stemRange(name: string): [number, number] {
  const dot = name.lastIndexOf(".");
  return [0, dot > 0 ? dot : name.length];
}
