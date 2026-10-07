// File-by-File mode: one file at a time with its preview, decided with a
// key. Every decision is its own journaled plan, applied at once (or only
// shown, in dry run), so Undo steps back one file at a time. Skins only
// change how a decision looks; they share this one input layer.

import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { api } from "../api";
import { nameProblem } from "../lib/ai";
import { FbfSession, fbfKey, quickPicks, remember, stemRange, type FbfAction, type FbfKey, type FbfRecord } from "../lib/fbf";
import { baseName } from "../lib/format";
import { listSkins, loadSkin, MINIMAL_ID, type SkinChoice } from "../skins";
import { Stage } from "../skins/stage";
import { soundMenu } from "./sound";
import { arcadeSettings, arcadeWanted, launchArcade } from "../arcade/launch";
import { roundFromFbf } from "../arcade/round";
import type { ArcadeRound } from "../arcade/types";
import type { Decision, FileEntry, PlanOut } from "../types";
import { h, modal } from "./dom";
import { PreviewPane } from "./preview";

const VERB: Record<FbfAction, string> = { keep: "Kept", move: "Moved", rename: "Renamed", trash: "Trashed", delete: "Deleted" };
const WOULD: Record<FbfAction, string> = { keep: "Keep", move: "Would move", rename: "Would rename", trash: "Would trash", delete: "Would delete" };

export interface FbfOptions {
  entries: FileEntry[];
  root: string;
  isMac: boolean;
  dryRun: boolean;
  /** Something on disk changed (refresh the main list when the session ends). */
  onChanged: () => void;
  onClose: () => void;
  /** The session ended early with some decisions made (Arcade mode may offer a game). */
  onRound?: (round: ArcadeRound) => void;
}

export async function fileByFile(o: FbfOptions) {
  const files = o.entries.filter((e) => !e.isDir);
  if (!files.length) return;
  const session = new FbfSession(files);
  const mod = o.isMac ? "Cmd" : "Ctrl";
  const settings = await api.getSettings().catch(() => ({}) as Record<string, unknown>);
  const sep = o.root.includes("\\") ? "\\" : "/";
  const allowed = [o.root, ...((settings.destinationRoots as string[] | undefined) ?? [])];
  const inScope = (p: string) => allowed.some((r) => p === r || p.startsWith(r.endsWith(sep) ? r : r + sep));
  let recent = ((settings.fbfRecent as string[] | undefined) ?? []).filter(inScope);
  let subfolders: string[] = await api.fbfFolders().catch(() => []);
  let picks = quickPicks(recent, subfolders);
  let changed = false;
  let busy = false;

  // ---------- layout ----------
  const progressText = h("span", { class: "fbf-progress-text" });
  const bar = h("div", { class: "fbf-bar-fill" });
  const skinSelect = h("select", { title: "Display skin" });
  const closeBtn = h("button", { onclick: () => close() }, "Done (Esc)");
  const preview = new PreviewPane();
  const stageWrap = h("div", { class: "fbf-stage" });
  const nameEl = h("div", { class: "fbf-name" });
  const stateEl = h("div", { class: "fbf-state" });
  const noteEl = h("div", { class: "fbf-note" });
  const dryEl = o.dryRun ? h("div", { class: "fbf-dry" }, "Dry run is on: decisions are shown, files don't change.") : null;
  const slotsEl = h("div", { class: "fbf-slots" });
  const btn = (label: string, key: string, onclick: () => void, cls = "") =>
    h("button", { class: cls, onclick, title: key }, label, h("kbd", {}, key));
  const buttons = {
    back: btn("Back", "←", () => run({ do: "back" })),
    keep: btn("Keep", "K", () => run({ do: "keep" }), "primary"),
    move: btn("Move", "M", () => run({ do: "move" })),
    rename: btn("Rename", "R", () => run({ do: "rename" })),
    trash: btn("Trash", "T", () => run({ do: "trash" })),
    delete: btn("Delete permanently", "Shift+Del", () => run({ do: "delete" }), "danger"),
    skip: btn("Skip", "→", () => run({ do: "skip" })),
    undo: btn("Undo", `${mod}+Z`, () => run({ do: "undo" })),
  };
  const side = h("div", { class: "fbf-side" }, stageWrap, nameEl, stateEl, noteEl, dryEl);
  const body = h("div", { class: "fbf-body" }, preview.el, side);
  const dialog = h(
    "dialog",
    { class: "fbf", tabindex: -1 },
    h(
      "div",
      { class: "fbf-grid" },
      h("div", { class: "fbf-head" }, h("h3", {}, "File by File"), h("div", { class: "fbf-bar" }, bar), progressText, h("label", {}, "Skin", skinSelect), h("button", { onclick: () => soundMenu(), title: `Music and sound effects (${mod}+Shift+S)` }, "Sound"), closeBtn),
      body,
      h("div", { class: "fbf-actions" }, ...Object.values(buttons)),
      slotsEl,
    ),
  );
  document.body.append(dialog);
  dialog.showModal();
  dialog.addEventListener("cancel", (ev) => ev.preventDefault()); // Esc goes through our keys
  dialog.addEventListener("close", () => {
    document.removeEventListener("keydown", onKey);
    if (!session.done && session.decidedCount > 0) o.onRound?.(roundFromFbf(session.results()));
    stage?.destroy();
    dialog.remove();
    if (changed) o.onChanged();
    o.onClose();
  });

  // ---------- skins ----------
  let stage: Stage | null = null;
  let skins: SkinChoice[] = [];
  async function useSkin(id: string) {
    stage?.destroy();
    stage = null;
    stageWrap.replaceChildren();
    const choice = skins.find((s) => s.id === id) ?? skins[0];
    stageWrap.hidden = choice.id === MINIMAL_ID;
    try {
      const loaded = await loadSkin(choice);
      if (loaded) {
        stage = new Stage(loaded);
        const [w] = loaded.manifest.size;
        const scale = Math.max(1, Math.min(4, Math.floor((side.clientWidth || 480) / w)));
        stage.canvas.style.width = `${w * scale}px`;
        stageWrap.append(stage.canvas);
        stage.setFile(session.current?.kind ?? null);
      }
    } catch (e) {
      note(`Skin ${choice.name} couldn't load: ${e}`, true);
      stageWrap.hidden = true;
    }
    api.setSetting("fbfSkin", choice.id).catch(() => {});
  }
  listSkins().then(({ skins: list, problems }) => {
    skins = list;
    skinSelect.replaceChildren(...list.map((s) => h("option", { value: s.id }, s.user ? `${s.name} (yours)` : s.name)));
    const saved = typeof settings.fbfSkin === "string" && list.some((s) => s.id === settings.fbfSkin) ? settings.fbfSkin : MINIMAL_ID;
    skinSelect.value = saved;
    useSkin(saved);
    if (problems.length) note(`Some skins in your skins folder were skipped: ${problems.join(" · ")}`, true);
  });
  skinSelect.addEventListener("change", () => {
    useSkin(skinSelect.value);
    dialog.focus(); // back to the decision keys
  });

  // ---------- rendering ----------
  function note(text: string, error = false) {
    noteEl.textContent = text;
    noteEl.classList.toggle("error", error);
  }

  /** Decided with a real change: the file isn't where the session found it any more. */
  const gone = (r?: FbfRecord) => !!r && !r.dryRun && r.action !== "keep";

  function renderSlots() {
    picks = quickPicks(recent, subfolders);
    slotsEl.replaceChildren(
      h("span", { class: "note" }, picks.length ? "Quick move:" : "Quick move: press M to pick a folder; it's remembered here."),
      ...picks.map((p, i) => h("button", { class: "slot", title: p, onclick: () => run({ do: "quick", slot: i + 1 }) }, h("kbd", {}, String(i + 1)), baseName(p))),
    );
  }

  function render() {
    const c = session.counts();
    const n = session.items.length;
    bar.style.width = `${(session.decidedCount / n) * 100}%`;
    progressText.textContent = `${Math.min(session.index + 1, n)} of ${n} · ${session.decidedCount} decided` +
      (c.keep ? ` · ${c.keep} kept` : "") + (c.move ? ` · ${c.move} moved` : "") + (c.rename ? ` · ${c.rename} renamed` : "") +
      (c.trash ? ` · ${c.trash} trashed` : "") + (c.delete ? ` · ${c.delete} deleted` : "");
    buttons.undo.disabled = !session.last();
    buttons.back.disabled = session.index === 0;
    if (session.done) return renderSummary();
    buttons.skip.disabled = false;
    slotsEl.querySelectorAll("button").forEach((b) => (b.disabled = false));
    const e = session.current!;
    const rec = session.recordFor();
    nameEl.textContent = e.name;
    nameEl.title = e.path;
    stateEl.textContent = rec ? `${rec.dryRun && rec.action !== "keep" ? WOULD[rec.action] : VERB[rec.action]}${rec.detail ? `: ${rec.detail}` : ""}` : "";
    for (const k of ["keep", "move", "rename", "trash", "delete"] as const) buttons[k].disabled = gone(rec);
    if (gone(rec)) preview.clear(`${VERB[rec!.action]}${rec!.detail ? ` (${rec!.detail})` : ""}. ${mod}+Z undoes the latest decision.`);
    else preview.show(e);
    stage?.setFile(gone(rec) ? null : e.kind);
  }

  // Auto mode starts a game once per finished session (not again after an undo and redo).
  let autoPlayed = false;

  function renderSummary() {
    const c = session.counts();
    const round = roundFromFbf(session.results());
    const arcade = arcadeWanted(round)
      ? h("p", {}, h("button", { class: "primary", onclick: () => launchArcade(round, false) }, "Play arcade"), " Your processed files come back as a mini-game.")
      : null;
    if (arcade && arcadeSettings().mode === "auto" && !autoPlayed) {
      autoPlayed = true;
      launchArcade(round, true);
    }
    for (const k of ["keep", "move", "rename", "trash", "delete", "skip", "back"] as const) buttons[k].disabled = true;
    slotsEl.querySelectorAll("button").forEach((b) => (b.disabled = true));
    nameEl.textContent = "All done";
    stateEl.textContent = "";
    stage?.setFile(null);
    const rows = session.results().map(({ entry, record }) =>
      h("tr", {}, h("td", {}, entry.name), h("td", {}, record.dryRun && record.action !== "keep" ? WOULD[record.action] : VERB[record.action]), h("td", {}, record.detail ?? "")),
    );
    preview.clear();
    preview.el.querySelector(".body")?.replaceChildren(
      h("p", {}, `${session.items.length} file(s): ${c.keep} kept, ${c.move} moved, ${c.rename} renamed, ${c.trash} trashed, ${c.delete} deleted permanently.`),
      ...(arcade ? [arcade] : []),
      h("table", { class: "list" }, h("tr", {}, h("th", {}, "File"), h("th", {}, "Decision"), h("th", {}, "")), ...rows),
    );
  }

  // ---------- decisions ----------
  async function decide(action: FbfAction, decision: Decision | null, detail?: string) {
    const e = session.current;
    if (!e || busy || gone(session.recordFor())) return;
    if (action === "keep") {
      stage?.play("keep", e.kind, { name: e.name, kind: e.kindLabel });
      session.record({ action, planId: null, dryRun: false });
      note(`Kept ${e.name}`);
      return render();
    }
    busy = true;
    try {
      const out: PlanOut = await api.planOne(e.path, decision!);
      const blocking = out.plan.issues.filter((i) => i.blocking);
      if (blocking.length) return note(`Can't ${action} ${e.name}: ${blocking.map((i) => i.message).join("; ")}`, true);
      if (out.id == null) return note(out.plan.issues.map((i) => i.message).join("; ") || "Nothing to do.");
      const extra = out.plan.issues.filter((i) => !i.blocking).map((i) => i.message);
      const to = [...out.plan.ops].reverse().find((op) => op.type === "move");
      const captions = { name: e.name, kind: e.kindLabel, newName: detail, dest: detail };
      if (o.dryRun) {
        session.record({ action, planId: null, dryRun: true, detail });
        note(`Dry run: ${WOULD[action].toLowerCase()} ${e.name}${detail ? ` (${detail})` : ""}.${extra.length ? ` ${extra.join("; ")}.` : ""}`);
      } else {
        const r = await api.applyPlan(out.id);
        if (r.error) {
          // Whatever ran is journaled; record it so Undo here can reverse it.
          if (r.done > 0) session.record({ action, planId: out.id, dryRun: false, detail });
          changed ||= r.done > 0;
          return note(`${e.name}: ${r.error}`, true);
        }
        changed = true;
        session.record({ action, planId: out.id, dryRun: false, detail, to: to && to.type === "move" ? to.to : undefined });
        note(`${VERB[action]} ${e.name}${detail ? ` (${detail})` : ""}.${extra.length ? ` ${extra.join("; ")}.` : ""}${action === "delete" ? " This can't be undone." : ""}`);
      }
      stage?.play(action, e.kind, captions);
    } catch (err) {
      note(String(err), true);
    } finally {
      busy = false;
      render();
    }
  }

  async function moveTo(dest: string) {
    recent = remember(recent, dest);
    api.setSetting("fbfRecent", recent).catch(() => {});
    renderSlots();
    await decide("move", { type: "move", dest }, baseName(dest));
    // A folder made by this move shows up in the quick-pick.
    subfolders = await api.fbfFolders().catch(() => subfolders);
    renderSlots();
  }

  async function undo() {
    if (busy) return;
    const last = session.last();
    if (!last) return note("Nothing to undo in this session.");
    const { record } = last;
    const name = session.items[last.index].name;
    if (record.planId == null) {
      session.undoLast();
      note(`Undid: ${record.dryRun && record.action !== "keep" ? WOULD[record.action].toLowerCase() : VERB[record.action].toLowerCase()} ${name}.`);
      return render();
    }
    if (record.action === "delete") {
      session.sealLast();
      note(`${name} was deleted permanently; that can't be undone. Undo again for the decision before it.`, true);
      return render();
    }
    busy = true;
    try {
      const j = await api.journalState();
      if (j.undoPlanId !== record.planId) return note("Something else changed files since then. Use History in the main window.", true);
      const r = await api.undo();
      if (r?.error) return note(`Undo stopped: ${r.error}`, true);
      session.undoLast();
      changed = true;
      note(`Undid: ${VERB[record.action].toLowerCase()} ${name}.`);
    } catch (e) {
      note(String(e), true);
    } finally {
      busy = false;
      render();
    }
  }

  function confirmDelete() {
    const e = session.current;
    if (!e || gone(session.recordFor())) return;
    const del = h("button", { class: "danger" }, "Delete permanently");
    const m = modal({
      title: "Delete permanently?",
      content: h("div", {}, h("p", {}, e.name), h("p", { class: "warn" }, "This skips the trash and can't be undone.")),
      actions: [del],
      small: true,
    });
    // Cancel is the safe default for Enter.
    (m.dialog.querySelector(".actions > button:last-child") as HTMLButtonElement | null)?.focus();
    del.addEventListener("click", () => {
      m.close();
      decide("delete", { type: "delete" });
    });
  }

  // ---------- move picker and rename box ----------
  let overlay: HTMLElement | null = null;
  function closeOverlay() {
    overlay?.remove();
    overlay = null;
    dialog.focus();
  }

  function movePicker() {
    const e = session.current;
    if (!e || gone(session.recordFor())) return;
    const input = h("input", { type: "text", placeholder: "Type to filter, or a new folder name", spellcheck: false });
    const list = h("div", { class: "fbf-picklist" });
    const err = h("div", { class: "warn" });
    let options: { label: string; run: () => void }[] = [];
    let sel = 0;
    const draw = () => {
      const q = input.value.trim();
      const all = quickPicks(recent, subfolders, 200);
      const hits = all.filter((p) => baseName(p).toLowerCase().includes(q.toLowerCase()));
      options = hits.map((p) => ({ label: baseName(p), run: () => { closeOverlay(); moveTo(p); } }));
      if (q && !all.some((p) => baseName(p).toLowerCase() === q.toLowerCase()))
        options.push({
          label: `New folder "${q}"`,
          run: () => {
            const bad = nameProblem(q);
            if (bad) return void (err.textContent = bad);
            closeOverlay();
            moveTo(`${o.root}${sep}${q}`);
          },
        });
      options.push({
        label: "Other folder…",
        run: async () => {
          const picked = await openDialog({ directory: true, multiple: false, title: "Move to folder", defaultPath: o.root });
          if (typeof picked !== "string") return;
          try {
            const canon = inScope(picked) ? picked : await api.allowDestination(picked, false);
            if (!allowed.includes(canon) && !inScope(canon)) allowed.push(canon);
            closeOverlay();
            moveTo(canon);
          } catch (x) {
            err.textContent = String(x);
          }
        },
      });
      sel = Math.min(sel, options.length - 1);
      list.replaceChildren(
        ...options.map((op, i) =>
          h("button", { class: i === sel ? "picked" : "", onclick: () => op.run() }, op.label),
        ),
      );
    };
    input.addEventListener("input", () => {
      sel = 0;
      err.textContent = "";
      draw();
    });
    input.addEventListener("keydown", (ev) => {
      ev.stopPropagation();
      if (ev.key === "Escape") return closeOverlay();
      if (ev.key === "ArrowDown") sel = Math.min(options.length - 1, sel + 1);
      else if (ev.key === "ArrowUp") sel = Math.max(0, sel - 1);
      else if (ev.key === "Enter") return options[sel]?.run();
      else return;
      ev.preventDefault();
      draw();
    });
    overlay = h("div", { class: "fbf-overlay" }, h("div", { class: "head" }, `Move ${e.name} to…`), input, list, err, h("div", { class: "note" }, "Enter picks · Esc cancels"));
    side.append(overlay);
    draw();
    input.focus();
  }

  function renameBox() {
    const e = session.current;
    if (!e || gone(session.recordFor())) return;
    const input = h("input", { type: "text", value: e.name, spellcheck: false });
    const err = h("div", { class: "warn" });
    input.addEventListener("keydown", (ev) => {
      ev.stopPropagation();
      if (ev.key === "Escape") return closeOverlay();
      if (ev.key !== "Enter") return;
      const name = input.value.trim();
      const bad = nameProblem(name);
      if (bad) return void (err.textContent = bad);
      if (name === e.name) return closeOverlay();
      closeOverlay();
      decide("rename", { type: "rename", name }, name);
    });
    overlay = h("div", { class: "fbf-overlay" }, h("div", { class: "head" }, "Rename to…"), input, err, h("div", { class: "note" }, "Enter renames · Esc cancels"));
    side.append(overlay);
    input.focus();
    input.setSelectionRange(...stemRange(e.name));
  }

  // ---------- input ----------
  function run(k: FbfKey) {
    if (overlay && k.do !== "close") return;
    // At the summary only Undo (which reopens the last file) and Esc do anything.
    if (session.done && k.do !== "undo" && k.do !== "close" && k.do !== "sound") return;
    switch (k.do) {
      case "keep": return void decide("keep", null);
      case "move": return movePicker();
      case "rename": return renameBox();
      case "trash": return void decide("trash", { type: "trash" });
      case "delete": return confirmDelete();
      case "quick": {
        const dest = picks[k.slot - 1];
        if (dest && !gone(session.recordFor())) moveTo(dest);
        return;
      }
      case "skip":
        session.skip();
        return render();
      case "back":
        session.back();
        return render();
      case "undo": return void undo();
      case "sound": return soundMenu();
      case "close":
        if (overlay) return closeOverlay();
        return close();
    }
  }

  function close() {
    dialog.close();
  }

  // On the document, so the keys work wherever focus landed (after a click,
  // the skin menu, a closed confirm box).
  function onKey(ev: KeyboardEvent) {
    // A confirm box on top handles its own keys.
    if (document.querySelectorAll("dialog[open]").length > 1) return;
    if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;
    if (ev.target instanceof HTMLSelectElement && ["ArrowUp", "ArrowDown", "Enter", " "].includes(ev.key)) return;
    const k = fbfKey(ev, o.isMac);
    if (!k) return;
    ev.preventDefault();
    run(k);
  }

  document.addEventListener("keydown", onKey);
  renderSlots();
  render();
  dialog.focus();
}
