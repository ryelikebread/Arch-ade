// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

const shown: string[] = [];
vi.mock("../api", () => ({ api: { preview: (path: string) => (shown.push(path), new Promise(() => {})) } }));
vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: (p: string) => p }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: () => {} }));

const { entryFor, reviewPreview } = await import("./review-preview");
const { opSource } = await import("./dialogs");

function setup() {
  const table = document.createElement("table");
  for (const p of ["/a/one.txt", "/a/two.png", ""]) {
    const tr = document.createElement("tr");
    if (p) tr.dataset.path = p;
    tr.append(document.createElement("td"));
    table.append(tr);
  }
  const r = reviewPreview(table, (tr) => (tr.dataset.path ? entryFor(tr.dataset.path) : null));
  const dialog = document.createElement("dialog");
  dialog.append(r.el, r.controls);
  document.body.append(dialog);
  r.attach(dialog);
  return { r, table, dialog };
}

const key = (el: Element, k: string) => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

describe("review preview", () => {
  it("previews the clicked row and moves with the arrow keys", () => {
    shown.length = 0;
    const { table, dialog } = setup();
    (table.rows[1].cells[0] as HTMLElement).click();
    expect(shown).toEqual(["/a/two.png"]);
    key(dialog, "ArrowUp");
    expect(shown.at(-1)).toBe("/a/one.txt");
    key(dialog, "ArrowDown");
    key(dialog, "ArrowDown"); // the last row has no file: stays put
    expect(shown.at(-1)).toBe("/a/two.png");
    expect(table.querySelectorAll("tr.selected").length).toBe(1);
  });

  it("Space goes full screen and Esc comes back before closing", () => {
    const { r, dialog } = setup();
    key(dialog, " ");
    const pane = r.el.querySelector(".preview")!;
    expect(pane.classList.contains("full")).toBe(true);
    const cancel = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(pane.classList.contains("full")).toBe(false);
    const again = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(again);
    expect(again.defaultPrevented).toBe(false);
  });

  it("can be hidden", () => {
    const { r } = setup();
    const toggle = r.controls.querySelector("input")!;
    toggle.checked = false;
    toggle.dispatchEvent(new Event("change"));
    expect(r.el.classList.contains("no-preview")).toBe(true);
  });

  it("previews the file a plan step starts from", () => {
    expect(opSource({ type: "move", from: "/a/x.txt", to: "/b/x.txt" })).toBe("/a/x.txt");
    expect(opSource({ type: "trash", path: "/a/y.txt" })).toBe("/a/y.txt");
    expect(opSource({ type: "mkdir", path: "/b" })).toBeNull();
    expect(opSource({ type: "move", from: "/a/.arch-ade-tmp-1", to: "/a/z" })).toBeNull();
  });
});
