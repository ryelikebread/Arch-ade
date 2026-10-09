// A preview beside a review table (Categorize, plan review): click a row to
// see its file, ↑/↓ move between rows, Space or the button goes full screen
// and Esc comes back before it closes the dialog.

import type { FileEntry } from "../types";
import { h } from "./dom";
import { PreviewPane } from "./preview";

const KEY = "arch-ade.reviewPreview";

/** Whether the preview starts open (remembered per computer). */
function remembered(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

function remember(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* private window: just don't remember */
  }
}

/** A stand-in entry for a path the main list doesn't have (size -1: unknown, not shown). */
export function entryFor(path: string): FileEntry {
  const name = path.split(/[\\/]/).pop() ?? path;
  const dot = name.lastIndexOf(".");
  return {
    path, rel: name, name, ext: dot > 0 ? name.slice(dot + 1).toLowerCase() : "", kind: "unknown", kindLabel: "File",
    isDir: false, isSymlink: false, size: -1, created: null, modified: null, added: null, source: null, project: null,
  };
}

export interface ReviewPreview {
  /** The table and the preview side by side; put this in the dialog. */
  el: HTMLElement;
  /** "Show preview" toggle and "Full screen", for the dialog's footer. */
  controls: HTMLElement;
  /** Hook up keys once the dialog exists. */
  attach(dialog: HTMLDialogElement): void;
}

/**
 * `fileOf` says which file a table row is about (null: nothing to preview).
 * Rows can be added later (Categorize fills in as suggestions arrive).
 */
export function reviewPreview(table: HTMLElement, fileOf: (row: HTMLTableRowElement) => FileEntry | null): ReviewPreview {
  const pane = new PreviewPane({ fullScreen: true });
  let current: HTMLTableRowElement | null = null;
  const side = h("div", { class: "review-side" }, pane.el);
  const el = h("div", { class: "review-split" }, h("div", { class: "review-table" }, table), side);

  const rows = () => [...table.querySelectorAll<HTMLTableRowElement>("tr")].filter((r) => fileOf(r));
  const select = (row: HTMLTableRowElement | null) => {
    current?.classList.remove("selected");
    current = row;
    if (!row) return pane.clear("Click a row to preview its file.");
    row.classList.add("selected");
    row.scrollIntoView?.({ block: "nearest" });
    if (!el.classList.contains("no-preview")) void pane.show(fileOf(row)!);
  };

  const showToggle = h("input", { type: "checkbox", checked: remembered() });
  const fullBtn = h("button", { title: "Full screen preview (Space; Esc to leave)" }, "Full screen");
  const setShown = (on: boolean) => {
    el.classList.toggle("no-preview", !on);
    fullBtn.disabled = !on;
    if (on && current) void pane.show(fileOf(current)!);
    if (!on) setFull(false);
  };
  const setFull = (on: boolean) => pane.toggleFull(on);
  showToggle.addEventListener("change", () => {
    remember(showToggle.checked);
    setShown(showToggle.checked);
  });
  fullBtn.addEventListener("click", () => {
    if (!current) select(rows()[0] ?? null);
    setFull(!pane.full);
  });
  setShown(showToggle.checked);
  pane.clear("Click a row to preview its file.");

  table.addEventListener("click", (ev) => {
    const t = ev.target as HTMLElement;
    if (t.closest("input, select, button, textarea, a")) {
      const row = t.closest("tr");
      if (row && row !== current && fileOf(row)) select(row);
      return;
    }
    const row = t.closest("tr");
    if (row && fileOf(row)) select(row);
  });

  const controls = h("span", { class: "review-controls" }, h("label", { title: "Show the selected file beside the list" }, showToggle, "Preview"), " ", fullBtn);

  return {
    el,
    controls,
    attach(dialog) {
      dialog.addEventListener("cancel", (ev) => {
        if (pane.full) {
          ev.preventDefault();
          setFull(false);
        }
      });
      dialog.addEventListener("keydown", (ev) => {
        const t = ev.target as HTMLElement;
        if (t.closest("input, select, textarea") || ev.metaKey || ev.ctrlKey || ev.altKey) return;
        if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
          const all = rows();
          if (!all.length) return;
          ev.preventDefault();
          const i = current ? all.indexOf(current) : -1;
          select(all[Math.max(0, Math.min(all.length - 1, ev.key === "ArrowDown" ? i + 1 : i < 0 ? 0 : i - 1))]);
        } else if (ev.key === " " && !t.closest("button") && !el.classList.contains("no-preview")) {
          ev.preventDefault();
          if (!current) select(rows()[0] ?? null);
          setFull(!pane.full);
        }
      });
    },
  };
}
