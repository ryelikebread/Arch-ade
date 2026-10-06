import type { SortKey } from "../lib/filter";
import { formatDate, formatSize } from "../lib/format";
import { sourceLabel } from "../lib/filter";
import { kindIcon } from "../pixel/sprites";
import type { FileEntry } from "../types";
import { h } from "./dom";

const COLUMNS: { key: SortKey | null; label: string }[] = [
  { key: null, label: "" },
  { key: "name", label: "Name" },
  { key: "size", label: "Size" },
  { key: "kind", label: "Kind" },
  { key: "created", label: "Created" },
  { key: "modified", label: "Modified" },
  { key: "added", label: "Added" },
  { key: "source", label: "Source" },
];

const OVERSCAN = 8;

/** Virtualized, sortable, multi-select file table. */
export class FileTable {
  readonly el: HTMLElement;
  private head: HTMLElement;
  private body: HTMLElement;
  private spacer: HTMLElement;
  private rows: FileEntry[] = [];
  private rowH = 24;
  private anchor = -1;
  cursor = -1;
  selected = new Set<string>();

  constructor(
    private cb: {
      onSort: (key: SortKey) => void;
      onSelection: (sel: FileEntry[], cursor: FileEntry | null) => void;
      onOpen: (e: FileEntry) => void;
      emptyMessage: () => string;
    },
  ) {
    this.head = h("div", { class: "thead" });
    this.spacer = h("div", { class: "spacer" });
    this.body = h("div", { class: "tbody", tabindex: 0 }, this.spacer);
    this.el = h("section", { class: "table" }, this.head, this.body);
    this.body.addEventListener("scroll", () => this.render());
    new ResizeObserver(() => this.render()).observe(this.body);
  }

  setRows(rows: FileEntry[], sortKey: SortKey, asc: boolean) {
    const cursorPath = this.rows[this.cursor]?.path;
    this.rows = rows;
    const paths = new Set(rows.map((r) => r.path));
    const before = this.selected.size;
    for (const p of [...this.selected]) if (!paths.has(p)) this.selected.delete(p);
    this.cursor = cursorPath ? rows.findIndex((r) => r.path === cursorPath) : -1;
    // Files that vanished (renamed, trashed, filtered out) leave the selection.
    const changed = this.selected.size !== before || (cursorPath != null && this.cursor < 0);
    this.head.replaceChildren(
      ...COLUMNS.map((c) =>
        h(
          "div",
          {
            class: c.key === sortKey ? "sorted" : "",
            onclick: () => c.key && this.cb.onSort(c.key),
            title: c.key ? "Sort" : "",
          },
          c.label + (c.key === sortKey ? (asc ? " ▲" : " ▼") : ""),
        ),
      ),
    );
    this.render();
    if (changed) this.cb.onSelection(this.selectedEntries(), this.rows[this.cursor] ?? null);
  }

  focus() {
    this.body.focus();
  }

  selectedEntries(): FileEntry[] {
    return this.rows.filter((r) => this.selected.has(r.path));
  }

  selectAll() {
    this.rows.forEach((r) => this.selected.add(r.path));
    this.emit();
  }

  clearSelection() {
    this.selected.clear();
    this.emit();
  }

  /** Arrow-key navigation. */
  move(delta: number, extend: boolean) {
    if (!this.rows.length) return;
    const next = Math.max(0, Math.min(this.rows.length - 1, (this.cursor < 0 ? -1 : this.cursor) + delta));
    this.click(next, { shift: extend, toggle: false });
    this.scrollIntoView(next);
  }

  private scrollIntoView(i: number) {
    const top = i * this.rowH;
    if (top < this.body.scrollTop) this.body.scrollTop = top;
    else if (top + this.rowH > this.body.scrollTop + this.body.clientHeight)
      this.body.scrollTop = top + this.rowH - this.body.clientHeight;
  }

  private click(i: number, mod: { shift: boolean; toggle: boolean }) {
    const path = this.rows[i].path;
    if (mod.shift && this.anchor >= 0) {
      const [a, b] = [Math.min(this.anchor, i), Math.max(this.anchor, i)];
      if (!mod.toggle) this.selected.clear();
      for (let k = a; k <= b; k++) this.selected.add(this.rows[k].path);
    } else if (mod.toggle) {
      if (this.selected.has(path)) this.selected.delete(path);
      else this.selected.add(path);
      this.anchor = i;
    } else {
      this.selected.clear();
      this.selected.add(path);
      this.anchor = i;
    }
    this.cursor = i;
    this.emit();
  }

  private emit() {
    this.render();
    this.cb.onSelection(this.selectedEntries(), this.rows[this.cursor] ?? null);
  }

  render() {
    this.spacer.style.height = `${this.rows.length * this.rowH}px`;
    if (!this.rows.length) {
      this.spacer.replaceChildren(h("div", { class: "empty" }, this.cb.emptyMessage()));
      return;
    }
    const top = this.body.scrollTop;
    const first = Math.max(0, Math.floor(top / this.rowH) - OVERSCAN);
    const last = Math.min(this.rows.length, Math.ceil((top + this.body.clientHeight) / this.rowH) + OVERSCAN);
    const isMac = navigator.userAgent.includes("Mac");
    const frag: HTMLElement[] = [];
    for (let i = first; i < last; i++) {
      const e = this.rows[i];
      const src = e.source;
      const srcText = sourceLabel(e);
      const row = h(
        "div",
        {
          class: `row${this.selected.has(e.path) ? " selected" : ""}${i === this.cursor ? " cursor" : ""}`,
          title: e.rel,
        },
        h("div", {}, h("img", { src: kindIcon(e.kind), alt: "" })),
        h(
          "div",
          {},
          e.rel.includes("/") ? e.rel : e.name,
          e.project ? h("span", { class: "tag", title: `${e.project}: contents are protected from rules and moves` }, " project") : null,
        ),
        h("div", { class: "num" }, e.isDir ? "" : formatSize(e.size)),
        h("div", { class: "muted" }, e.kindLabel),
        h("div", { class: "muted" }, formatDate(e.created)),
        h("div", { class: "muted" }, formatDate(e.modified)),
        h("div", { class: "muted" }, formatDate(e.added)),
        h(
          "div",
          {
            class: src?.appConfidence === "inferred" ? "inferred" : "",
            title: src
              ? `${src.url ?? ""}${src.appConfidence === "inferred" ? "\n(app inferred from the URL)" : ""}`
              : "",
          },
          srcText,
        ),
      );
      row.style.top = `${i * this.rowH}px`;
      row.addEventListener("mousedown", (ev) => {
        this.body.focus();
        this.click(i, { shift: ev.shiftKey, toggle: isMac ? ev.metaKey : ev.ctrlKey });
      });
      row.addEventListener("dblclick", () => this.cb.onOpen(e));
      frag.push(row);
    }
    this.spacer.replaceChildren(...frag);
  }
}
