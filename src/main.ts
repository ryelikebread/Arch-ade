import { listen } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { api } from "./api";
import { defaultFilters, matches, sortEntries, sourceOptions, type Filters, type SortKey } from "./lib/filter";
import { formatSize } from "./lib/format";
import { label as keyLabel, match as matchKey } from "./lib/hotkeys";
import { applyTheme, validateTheme, type Theme } from "./lib/theme";
import { drawLogo } from "./pixel/logo";
import { resetSprites } from "./pixel/sprites";
import "./styles.css";
import builtInThemes from "./themes";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ActivityEvent, AppInfo, FileEntry, Kind, PlanOut, RunReport, ScanOptions, UpdateInfo } from "./types";
import { dupesDialog, helpDialog, historyDialog, planReview, renameDialog, settingsDialog } from "./ui/dialogs";
import { h, modal } from "./ui/dom";
import { aiSettingsDialog, categorizeDialog } from "./ui/ai";
import { fileByFile } from "./ui/fbf";
import { soundMenu } from "./ui/sound";
import { sound } from "./audio/player";
import { arcadeSettingsSection, arcadeWanted, launchArcade, loadArcadeSettings, arcadeSettings, onArcadeModeChange } from "./arcade/launch";
import { roundFromPlan } from "./arcade/round";
import type { ArcadeRound } from "./arcade/types";
import { rulesDialog } from "./ui/rules";
import { PreviewPane } from "./ui/preview";
import { FileTable } from "./ui/table";

const APP_TITLE = "Arch-ade";

const state = {
  info: null as AppInfo | null,
  isMac: navigator.userAgent.includes("Mac"),
  root: null as string | null,
  entries: [] as FileEntry[],
  view: [] as FileEntry[],
  sortKey: "name" as SortKey,
  asc: true,
  filters: defaultFilters(),
  scan: { recursive: false, includeHidden: false, maxDepth: 0 } as ScanOptions,
  dryRun: true,
  themes: [...builtInThemes] as Theme[],
  themeId: "arcade-night",
  busy: false,
};

// ---------- layout ----------
const logo = h("canvas", { title: APP_TITLE });
const pathEl = h("div", { class: "path" }, "No folder open");
const folderSelect = h("select", { title: "Common folders" }, h("option", { value: "" }, "Quick folders…"));
const recursiveCb = h("input", { type: "checkbox" });
const hiddenCb = h("input", { type: "checkbox" });
const undoBtn = h("button", { disabled: true }, "Undo");
const redoBtn = h("button", { disabled: true }, "Redo");
const dryBtn = h("button", {});
const header = h(
  "header",
  {},
  logo,
  h("button", { class: "primary", onclick: () => pickFolder() }, "Open folder"),
  folderSelect,
  pathEl,
  h("label", { title: "Include subfolders" }, recursiveCb, "Subfolders"),
  h("label", {}, hiddenCb, "Hidden"),
  undoBtn,
  redoBtn,
  h("button", { onclick: () => openHistory() }, "History"),
  h("button", { onclick: () => openRules() }, "Rules"),
  dryBtn,
  h("button", { onclick: () => soundMenu(), title: "Music and sound effects" }, "Sound"),
  h("button", { onclick: () => openSettings() }, "Settings"),
  h("button", { onclick: () => helpDialog(state.isMac) }, "Help"),
);

const search = h("input", { type: "text", placeholder: "Filter by name", spellcheck: false });
const kindSelect = h("select", { title: "Kind" }, h("option", { value: "" }, "All kinds"));
const sourceSelect = h("select", { title: "Download source" });
const sizeSelect = h(
  "select",
  { title: "Size" },
  ...[["", "Any size"], ["0-1048576", "Under 1 MB"], ["1048576-104857600", "1 to 100 MB"], ["104857600-", "Over 100 MB"], ["1073741824-", "Over 1 GB"]].map(
    ([v, t]) => h("option", { value: v }, t),
  ),
);
const ageField = h("select", { title: "Which date" }, h("option", { value: "modified" }, "Modified"), h("option", { value: "created" }, "Created"), h("option", { value: "added" }, "Added"));
const agePreset = h(
  "select",
  { title: "Age" },
  ...[["", "Any age"], ["n1", "Last 24 hours"], ["n7", "Last 7 days"], ["n30", "Last 30 days"], ["o7", "Older than 7 days"], ["o30", "Older than 30 days"], ["o365", "Older than 1 year"]].map(
    ([v, t]) => h("option", { value: v }, t),
  ),
);
const renameBtn = h("button", { disabled: true, onclick: () => doRename() }, "Rename");
const moveBtn = h("button", { disabled: true, onclick: () => doMove() }, "Move");
const trashBtn = h("button", { class: "danger", disabled: true, onclick: () => doTrash() }, "Trash");
const dupesBtn = h("button", { disabled: true, onclick: () => doDupes() }, "Duplicates");
const sortBtn = h("button", { disabled: true, title: "Suggest categories and names (local AI optional)", onclick: () => doCategorize() }, "Categorize");
const fbfBtn = h("button", { disabled: true, title: "Go through files one at a time", onclick: () => doFileByFile() }, "File by File");
const selInfo = h("span", { class: "note" });
const toolbar = h(
  "div",
  { class: "toolbar" },
  search, kindSelect, sourceSelect, sizeSelect, ageField, agePreset,
  h("div", { class: "actions" }, selInfo, renameBtn, moveBtn, trashBtn, fbfBtn, sortBtn, dupesBtn),
);

const preview = new PreviewPane({ fullScreen: true });
const table = new FileTable({
  onSort: (k) => {
    if (state.sortKey === k) state.asc = !state.asc;
    else {
      state.sortKey = k;
      state.asc = k === "name" || k === "kind" || k === "source";
    }
    save("sort", { key: state.sortKey, asc: state.asc });
    refreshView();
  },
  onSelection: (sel, cursor) => {
    selInfo.textContent = sel.length ? `${sel.length} selected` : "";
    const has = sel.length > 0;
    renameBtn.disabled = moveBtn.disabled = trashBtn.disabled = !has;
    if (cursor) preview.show(cursor);
    else preview.clear();
  },
  onOpen: (e) => {
    if (e.isDir) openRoot(e.path);
  },
  emptyMessage: () => (state.root ? "No files match the filters." : "Open a folder to begin."),
});
const msg = h("span", { class: "msg" });
const counts = h("span");
const toolsEl = h("span");
const updateEl = h("span", {});
const arcadeEl = h("span", {});
const footer = h("footer", {}, msg, arcadeEl, updateEl, counts, toolsEl);

document.getElementById("app")!.append(header, toolbar, h("main", {}, table.el, preview.el), footer);

// ---------- helpers ----------
function say(text: string, error = false) {
  msg.textContent = text;
  msg.classList.toggle("error", error);
}

function save(key: string, value: unknown) {
  api.setSetting(key, value).catch(() => {});
}

function renderDryRun() {
  dryBtn.textContent = state.dryRun ? "Dry run: on" : "Dry run: off";
  dryBtn.className = state.dryRun ? "dry-run-on" : "dry-run-off";
  dryBtn.title = state.dryRun ? "Plans are shown but never applied" : "Plans can be applied after review";
}

async function refreshJournal() {
  try {
    const j = await api.journalState();
    undoBtn.disabled = !j.canUndo;
    redoBtn.disabled = !j.canRedo;
  } catch {
    /* ignore */
  }
}

function refreshFilterOptions() {
  const kinds = new Map<Kind, string>();
  state.entries.forEach((e) => kinds.set(e.kind, e.kindLabel));
  const cur = kindSelect.value;
  kindSelect.replaceChildren(h("option", { value: "" }, "All kinds"), ...[...kinds].sort((a, b) => a[1].localeCompare(b[1])).map(([k, l]) => h("option", { value: k }, l)));
  kindSelect.value = kinds.has(cur as Kind) ? cur : "";
  const srcCur = sourceSelect.value;
  const opts = sourceOptions(state.entries);
  sourceSelect.replaceChildren(
    h("option", { value: "" }, "Any source"),
    h("option", { value: "none" }, "No source info"),
    ...opts.map((o) => h("option", { value: o }, o)),
  );
  sourceSelect.value = opts.includes(srcCur) || srcCur === "none" ? srcCur : "";
}

function readFilters(): Filters {
  const f = { ...state.filters };
  f.text = search.value.trim();
  f.kinds = kindSelect.value ? [kindSelect.value as Kind] : [];
  f.source = sourceSelect.value;
  const [min, max] = sizeSelect.value.split("-");
  f.minSize = min ? Number(min) : null;
  f.maxSize = max ? Number(max) : null;
  f.ageField = ageField.value as Filters["ageField"];
  const a = agePreset.value;
  f.newerThanDays = a.startsWith("n") ? Number(a.slice(1)) : null;
  f.olderThanDays = a.startsWith("o") ? Number(a.slice(1)) : null;
  return f;
}

function refreshView() {
  state.filters = readFilters();
  const now = Date.now();
  state.view = sortEntries(state.entries.filter((e) => matches(e, state.filters, now)), state.sortKey, state.asc);
  table.setRows(state.view, state.sortKey, state.asc);
  const bytes = state.view.reduce((s, e) => s + e.size, 0);
  counts.textContent = state.root ? `${state.view.length} of ${state.entries.length} items · ${formatSize(bytes)}` : "";
  dupesBtn.disabled = sortBtn.disabled = fbfBtn.disabled = !state.view.some((e) => !e.isDir);
}

for (const el of [kindSelect, sourceSelect, sizeSelect, ageField, agePreset]) el.addEventListener("change", refreshView);
let searchTimer = 0;
search.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = window.setTimeout(refreshView, 100);
});

// ---------- folder loading ----------
async function openRoot(path: string) {
  if (path !== state.root) clearArcadeOffer();
  state.busy = true;
  say("Scanning…");
  try {
    const r = await api.openFolder(path, state.scan);
    state.root = r.root;
    state.entries = r.entries;
    pathEl.textContent = r.root;
    pathEl.title = r.root;
    document.title = `${APP_TITLE}: ${r.root}`;
    table.clearSelection();
    refreshFilterOptions();
    refreshView();
    say(r.errors.length ? `${r.errors.length} item(s) could not be read (permissions?)` : `Opened ${r.root}`, r.errors.length > 0);
  } catch (e) {
    say(String(e), true);
  } finally {
    state.busy = false;
  }
}

async function rescan() {
  if (!state.root) return;
  try {
    const r = await api.rescan(state.scan);
    state.entries = r.entries;
    refreshFilterOptions();
    refreshView();
  } catch (e) {
    say(String(e), true);
  }
}

async function pickFolder() {
  const picked = await openDialog({ directory: true, multiple: false, title: "Open folder" });
  if (typeof picked === "string") openRoot(picked);
}

folderSelect.addEventListener("change", () => {
  if (folderSelect.value) openRoot(folderSelect.value);
  folderSelect.value = "";
});
recursiveCb.addEventListener("change", () => {
  state.scan.recursive = recursiveCb.checked;
  save("scan", state.scan);
  if (state.root) openRoot(state.root); // re-arms the watcher with the new depth
});
hiddenCb.addEventListener("change", () => {
  state.scan.includeHidden = hiddenCb.checked;
  save("scan", state.scan);
  rescan();
});

let fsTimer = 0;
listen("fs-changed", () => {
  clearTimeout(fsTimer);
  fsTimer = window.setTimeout(rescan, 300);
});

// What the rules did on their own in a watched folder.
listen<ActivityEvent>("rules-activity", (ev) => {
  const a = ev.payload;
  const where = a.folder.split(/[\\/]/).pop();
  const undo = keyLabel("undo", state.isMac);
  if (a.outcome === "applied") say(`Rules sorted ${a.files} new file(s) in ${where}. ${undo} undoes it.`);
  else if (a.outcome === "dryRun") say(`Rules matched ${a.files} new file(s) in ${where} (dry run, nothing moved). See Rules > Activity.`);
  else if (a.outcome === "failed") say(`Rules in ${where} stopped: ${a.error ?? "see Rules > Activity"}`, true);
  else say(`Rules skipped ${a.files} new file(s) in ${where}. See Rules > Activity.`);
  refreshJournal();
});

// ---------- operations ----------
function afterRun(r: RunReport | null) {
  if (!r) return;
  if (r.direction !== "apply") clearArcadeOffer();
  const verb = r.direction === "undo" ? "Undid" : r.direction === "redo" ? "Redid" : "Applied";
  if (r.error) say(`${verb} ${r.done} of ${r.total} step(s) of "${r.label}", then stopped: ${r.error}`, true);
  else say(`${verb}: ${r.label} (${r.done} step(s)${r.skipped ? `, ${r.skipped} skipped` : ""})`);
  refreshJournal();
  rescan();
}

/** A round of edits just finished: offer or start a game if Arcade mode is on. */
function arcadeRound(round: ArcadeRound) {
  clearArcadeOffer();
  if (!arcadeWanted(round)) return;
  const launch = (autostart: boolean) =>
    launchArcade(round, autostart).then((ok) => {
      if (!ok) say("Couldn't open the arcade.", true);
      else if (!autostart) clearArcadeOffer();
    });
  if (arcadeSettings().mode === "auto") return void launch(true);
  const n = round.files.length;
  arcadeEl.replaceChildren(
    h("button", { class: "primary", title: "Your processed files come back as a mini-game", onclick: () => launch(false) }, `Play arcade (${n} file${n === 1 ? "" : "s"})`),
    h("button", { title: "Dismiss", onclick: clearArcadeOffer }, "×"),
  );
}

/** The offer is about the latest round: undo, redo, another folder or a mode change ends it. */
function clearArcadeOffer() {
  arcadeEl.replaceChildren();
}
onArcadeModeChange((mode) => mode !== "offer" && clearArcadeOffer());

function review(out: PlanOut) {
  // Files as the list knew them before the plan ran (for the arcade).
  const before = state.entries;
  // "Turn off" inside the dialog reopens the same plan, now applicable.
  planReview(out, (r) => {
    afterRun(r);
    if (r.direction !== "apply") return;
    if (r.done === 0 || arcadeSettings().mode === "off") return;
    // Steps run in order and stop at the first failure: only those that ran count.
    const ran = r.error ? { ...out.plan, ops: out.plan.ops.slice(0, r.done + r.skipped) } : out.plan;
    arcadeRound(roundFromPlan(ran, before));
  }, () => {
    toggleDryRun();
    review({ ...out, dryRun: state.dryRun });
  }, (path) => before.find((e) => e.path === path));
}

async function doTrash(paths?: string[]) {
  const list = paths ?? table.selectedEntries().map((e) => e.path);
  if (!list.length) return;
  try {
    review(await api.planTrash(list));
  } catch (e) {
    say(String(e), true);
  }
}

function doRename() {
  const sel = table.selectedEntries();
  if (sel.length) renameDialog(sel, review);
}

async function doMove() {
  const sel = table.selectedEntries();
  if (!sel.length) return;
  const dest = await openDialog({ directory: true, multiple: false, title: "Move to folder", defaultPath: state.root ?? undefined });
  if (typeof dest !== "string") return;
  try {
    const canon = await api.addDestination(dest);
    review(await api.planMove(sel.map((e) => e.path), canon));
  } catch (e) {
    say(String(e), true);
  }
}

/** Selected files, or every visible file when nothing is selected. */
function doCategorize() {
  if (!state.root) return;
  const sel = table.selectedEntries();
  categorizeDialog({ root: state.root, entries: sel.length ? sel : state.view, review, say });
}

/** Selected files (or every visible file), one at a time, in table order. */
function doFileByFile() {
  if (!state.root) return;
  const sel = table.selectedEntries();
  const picked = new Set(sel.map((e) => e.path));
  const entries = sel.length ? state.view.filter((e) => picked.has(e.path)) : state.view;
  fileByFile({
    entries,
    root: state.root,
    isMac: state.isMac,
    dryRun: state.dryRun,
    onDryRun: (on) => on !== state.dryRun && toggleDryRun(),
    onChanged: () => {
      refreshJournal();
      rescan();
    },
    onClose: () => table.focus(),
    onRound: arcadeRound,
  }).catch((e) => say(String(e), true));
}

function openRules() {
  rulesDialog({ root: state.root, review, say });
}

function doDupes() {
  dupesDialog(state.view, (paths) => doTrash(paths));
}

function openHistory() {
  historyDialog({ onReview: review, onRun: afterRun }).catch((e) => say(String(e), true));
}

async function undo() {
  try {
    const r = await api.undo();
    if (r) afterRun(r);
    else say("Nothing to undo.");
  } catch (e) {
    say(String(e), true);
  }
}

async function redo() {
  try {
    const r = await api.redo();
    if (r) afterRun(r);
    else say("Nothing to redo.");
  } catch (e) {
    say(String(e), true);
  }
}

function toggleDryRun() {
  state.dryRun = !state.dryRun;
  save("dryRun", state.dryRun);
  renderDryRun();
  say(state.dryRun ? "Dry run on: plans are shown but never applied." : "Dry run off: you can apply plans after reviewing them.");
}

undoBtn.addEventListener("click", undo);
redoBtn.addEventListener("click", redo);
dryBtn.addEventListener("click", toggleDryRun);

// ---------- themes ----------
function setTheme(t: Theme) {
  state.themeId = t.id;
  applyTheme(t);
  resetSprites();
  drawLogo(logo, APP_TITLE, 2);
  table.render();
  save("theme", t.id);
}

function openSettings() {
  settingsDialog(state.themes, state.themeId, setTheme, state.info?.dataDir ?? "", () => aiSettingsDialog(say), arcadeSettingsSection());
}

// ---------- keyboard ----------
document.addEventListener("keydown", (ev) => {
  if (document.querySelector("dialog[open]")) return; // dialogs handle their own keys
  const typing = ev.target instanceof HTMLInputElement || ev.target instanceof HTMLSelectElement;
  const action = matchKey(ev, state.isMac);
  if (!action) return;
  if (typing && !["search", "escape", "open", "help"].includes(action)) return;
  ev.preventDefault();
  switch (action) {
    case "open": return void pickFolder();
    case "undo": return void undo();
    case "redo": return void redo();
    case "selectAll": return table.selectAll();
    case "rename": return doRename();
    case "trash": return void doTrash();
    case "move": return void doMove();
    case "duplicates": return doDupes();
    case "search": return search.focus();
    case "history": return void openHistory();
    case "rules": return openRules();
    case "categorize": return doCategorize();
    case "fileByFile": return doFileByFile();
    case "sound": return soundMenu();
    case "toggleDryRun": return toggleDryRun();
    case "help": return helpDialog(state.isMac);
    case "up": return table.move(-1, ev.shiftKey);
    case "down": return table.move(1, ev.shiftKey);
    case "fullPreview": return preview.toggleFull();
    case "escape":
      if (preview.full) return preview.toggleFull(false);
      if (typing) (ev.target as HTMLElement).blur();
      table.focus();
      return;
  }
});

// ---------- updates (local stub; see crates/arch-ade-core/src/update.rs) ----------
function showUpdate(u: UpdateInfo) {
  const get = () => {
    if (u.url) openUrl(u.url).catch((e) => say(String(e), true));
  };
  if (!u.required) {
    updateEl.replaceChildren(
      h("button", { title: u.notes || "A newer version is available", onclick: get, disabled: !u.url }, `Update ${u.version} available`),
      h("button", { title: "Dismiss", onclick: () => updateEl.replaceChildren() }, "×"),
    );
    return;
  }
  // Required: the app stays blocked until the user updates or quits.
  const download = h("button", { class: "primary", onclick: get, disabled: !u.url }, "Get the update");
  const quit = h("button", { onclick: () => getCurrentWindow().close() }, "Quit");
  const m = modal({
    title: `Update ${u.version} required`,
    content: h("div", {}, h("p", {}, "This version of Arch-ade can't be used any more. Please install the update."), u.notes ? h("p", { class: "note" }, u.notes) : null),
    actions: [download, quit],
    small: true,
  });
  m.dialog.querySelector(".actions > button:last-child")?.remove(); // no Close
  m.dialog.addEventListener("cancel", (ev) => ev.preventDefault()); // Escape does nothing
}

// ---------- startup ----------
async function boot() {
  applyTheme(builtInThemes[0]);
  drawLogo(logo, APP_TITLE, 2);
  renderDryRun();
  try {
    state.info = await api.appInfo();
    state.isMac = state.info.os === "macos";
    const t = state.info.tools;
    const have = Object.entries(t).filter(([, v]) => v).map(([k]) => k);
    toolsEl.textContent = have.length ? `Helpers: ${have.join(", ")}` : "No helper tools found (see Help > FAQ)";
    undoBtn.title = keyLabel("undo", state.isMac);
    redoBtn.title = keyLabel("redo", state.isMac);
    if (state.info.interruptedPlans.length)
      say(`${state.info.interruptedPlans.length} change(s) were interrupted last time. See History; Undo reverses the completed steps.`, true);

    for (const f of await api.defaultFolders()) folderSelect.append(h("option", { value: f.path }, f.label));

    for (const raw of await api.userThemes()) {
      const t = validateTheme(raw);
      if (!Array.isArray(t)) state.themes.push(t);
    }
    const s = await api.getSettings();
    if (typeof s.dryRun === "boolean") state.dryRun = s.dryRun;
    sound.init(s.sound);
    loadArcadeSettings(s.arcade);
    renderDryRun();
    const theme = state.themes.find((t) => t.id === s.theme);
    if (theme) setTheme(theme);
    const sort = s.sort as { key: SortKey; asc: boolean } | undefined;
    if (sort?.key) Object.assign(state, { sortKey: sort.key, asc: sort.asc });
    const scan = s.scan as ScanOptions | undefined;
    if (scan) {
      state.scan = { ...state.scan, ...scan };
      recursiveCb.checked = state.scan.recursive;
      hiddenCb.checked = state.scan.includeHidden;
    }
    refreshJournal();
    refreshFilterOptions();
    refreshView();
    const update = await api.updateInfo();
    if (update) showUpdate(update);
    if (typeof s.lastFolder === "string") openRoot(s.lastFolder);
  } catch (e) {
    say(`Startup problem: ${e}`, true);
    refreshView();
  }
}

boot();
