// Categorize: suggestions per file (from the local AI, embedded tags, past
// decisions or the file type), reviewed and edited here, then turned into a
// normal plan. Also the AI settings and the category whitelist editor.

import { listen } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { api } from "../api";
import { addSubcategory, duplicateWhitelist, emptyCategory, mergeSubcategories, nameProblem, parseList, SOURCE_LABELS, toApproved } from "../lib/ai";
import { formatSize } from "../lib/format";
import type { AiProgress, AiSettings, FileEntry, PlanOut, Suggestion, Whitelist } from "../types";
import { h, modal } from "./dom";
import { entryFor, reviewPreview } from "./review-preview";

export interface AiContext {
  root: string | null;
  entries: FileEntry[];
  review: (out: PlanOut) => void;
  say: (text: string, error?: boolean) => void;
}

interface Row {
  s: Suggestion;
  approved: boolean;
  category: string;
  subcategory: string;
  newName: string;
}

/** Suggestion rows drawn at a time; more are drawn as the list scrolls. */
const ROW_PAGE = 200;

/** What the main window shows while Categorize is minimized; null when it isn't. */
export interface CategorizeBackground {
  running: boolean;
  label: string;
}

// The one Categorize window, kept alive while it is minimized so a long run
// carries on while the rest of the app is used.
let session: { reopen: () => void } | null = null;
let onBackground: (bg: CategorizeBackground | null) => void = () => {};

/** Called whenever the minimized Categorize changes (progress, finished, reopened or closed). */
export function watchCategorize(fn: (bg: CategorizeBackground | null) => void) {
  onBackground = fn;
}

/** Brings a minimized Categorize back. False when there is none. */
export function reopenCategorize(): boolean {
  if (!session) return false;
  session.reopen();
  return true;
}

const MODE_LABELS: Record<string, string> = { consistent: "More consistent", refined: "More refined" };

function aiStatus(settings: AiSettings): string {
  if (!settings.enabled) return "AI is off: suggestions come from tags, your earlier decisions and the file type.";
  return `AI on: ${settings.textModel} for text, ${settings.visionModel} for images (local Ollama).`;
}

export async function categorizeDialog(ctx: AiContext) {
  if (reopenCategorize()) return;
  const files = ctx.entries.filter((e) => !e.isDir);
  if (!files.length) return ctx.say("Select some files first (folders are skipped).", true);
  let st = await api.aiState();
  const settings: AiSettings = structuredClone(st.settings);
  let dest: string | null = null;
  let rows: Row[] = [];
  let running = false;
  let minimized = false;
  let progress = "";

  const wlOf = () => st.whitelists.find((w) => w.id === settings.whitelistId) ?? st.whitelists[0];

  const wlSelect = h("select", { onchange: () => { settings.whitelistId = wlSelect.value; } },
    ...st.whitelists.map((w) => h("option", { value: w.id, selected: w.id === settings.whitelistId }, w.name)));
  const modeSelect = h("select", { onchange: () => { settings.mode = modeSelect.value as AiSettings["mode"]; } },
    ...Object.entries(MODE_LABELS).map(([v, t]) => h("option", { value: v, selected: v === settings.mode }, t)));
  const renameOnly = h("input", { type: "checkbox", checked: settings.renameOnly, onchange: () => { settings.renameOnly = renameOnly.checked; } });
  const destLabelEl = h("span", { class: "mono" }, ctx.root ?? "");
  const destBtn = h("button", { onclick: async () => {
    const p = await openDialog({ directory: true, multiple: false, title: "Put category folders in", defaultPath: ctx.root ?? undefined });
    if (typeof p !== "string") return;
    try {
      dest = await api.addDestination(p);
      destLabelEl.textContent = dest;
    } catch (e) {
      ctx.say(String(e), true);
    }
  } }, "Change…");
  const statusEl = h("p", { class: "note" }, aiStatus(settings));
  const barFill = h("div", { class: "pbar-fill" });
  const barLabel = h("span", { class: "pbar-label" });
  const bar = h("div", { class: "pbar", hidden: true, role: "progressbar", "aria-valuemin": 0 }, barFill, barLabel);
  const setBar = (done: number, total: number, label?: string) => {
    const pct = total ? Math.round((done / total) * 100) : 0;
    bar.hidden = false;
    bar.classList.toggle("done", label !== undefined);
    bar.setAttribute("aria-valuemax", String(total));
    bar.setAttribute("aria-valuenow", String(done));
    barFill.style.width = `${pct}%`;
    barLabel.textContent = label ?? `${done} / ${total} · ${pct}%`;
    progress = label ?? `${done} / ${total} · ${pct}%`;
    if (minimized) report();
  };
  const report = () => onBackground(minimized ? { running, label: progress } : null);
  const byPath = new Map(files.map((f) => [f.path, f]));
  const errEl = h("div", { class: "warn" });
  const tbody = h("tbody");
  const count = h("span", {});
  const suggestBtn = h("button", { class: "primary" }, "Suggest");
  const planBtn = h("button", { class: "primary", disabled: true }, "Review plan");

  const updateCount = () => {
    const n = rows.filter((r) => r.approved).length;
    count.textContent = rows.length ? `${n} of ${rows.length} approved` : "";
    planBtn.disabled = running || n === 0;
    planBtn.textContent = n ? `Review plan (${n})` : "Review plan";
  };

  const subOptions = (row: Row, sel: HTMLSelectElement) => {
    const cat = wlOf()?.categories.find((c) => c.name === row.category);
    const names = (cat?.subcategories ?? []).map((s) => s.name);
    if (row.subcategory && !names.includes(row.subcategory)) names.push(row.subcategory);
    sel.replaceChildren(
      h("option", { value: "", selected: !row.subcategory }, "(none)"),
      ...names.map((n) => h("option", { value: n, selected: n === row.subcategory }, n === row.s.subcategory && row.s.newSubcategory ? `${n} (new)` : n)),
    );
    sel.disabled = !row.category;
  };

  const renderRow = (row: Row): HTMLElement => {
    const wl = wlOf();
    const cb = h("input", { type: "checkbox", checked: row.approved, onchange: () => { row.approved = cb.checked; updateCount(); } });
    const catSel = h("select", {},
      ...(settings.renameOnly ? [] : wl.categories.map((c) => h("option", { value: c.name, selected: c.name === row.category }, c.name))),
      h("option", { value: "", selected: !row.category }, "(keep in folder)"));
    const subSel = h("select", {});
    subOptions(row, subSel);
    catSel.addEventListener("change", () => {
      row.category = catSel.value;
      row.subcategory = "";
      subOptions(row, subSel);
    });
    subSel.addEventListener("change", () => { row.subcategory = subSel.value; });
    const nameIn = h("input", { type: "text", value: row.newName, spellcheck: false });
    const nameErr = h("div", { class: "warn" });
    nameIn.addEventListener("input", () => {
      row.newName = nameIn.value;
      const p = nameProblem(row.newName);
      nameErr.textContent = p ?? "";
      if (p) { row.approved = false; cb.checked = false; updateCount(); }
    });
    const addNew = row.s.newSubcategory
      ? h("button", { class: "link", title: "Add this subcategory to the whitelist", onclick: async () => {
          try {
            const updated = addSubcategory(wl, row.s.category, row.s.subcategory);
            const lists = st.whitelists.map((w) => (w.id === wl.id ? updated : w));
            await api.aiSaveWhitelists(lists);
            st = { ...st, whitelists: lists };
            addNew!.remove();
            ctx.say(`Added "${row.s.subcategory}" under ${row.s.category}.`);
          } catch (e) {
            errEl.textContent = String(e);
          }
        } }, "+ whitelist")
      : null;
    const why = [row.s.reason, row.s.warning].filter(Boolean).join(" · ");
    return h("tr", { "data-path": row.s.path },
      h("td", {}, cb),
      h("td", { title: row.s.path }, row.s.name, row.s.screenshot ? h("span", { class: "tag" }, "screenshot") : null),
      settings.renameOnly ? null : h("td", {}, catSel),
      settings.renameOnly ? null : h("td", {}, subSel, addNew),
      h("td", {}, nameIn, nameErr),
      h("td", { title: why, class: row.s.warning ? "status-bad" : "" }, SOURCE_LABELS[row.s.source], row.s.warning ? " ⚠" : ""),
    );
  };

  const head = () => h("tr", {},
    h("th", {}, ""), h("th", {}, "File"),
    settings.renameOnly ? null : h("th", {}, "Category"),
    settings.renameOnly ? null : h("th", {}, "Subcategory"),
    h("th", {}, "New name"), h("th", { title: "Where the suggestion came from" }, "From"));
  const thead = h("thead", {}, head());

  // Rows are drawn a page at a time as the list is scrolled: thousands of
  // rows of drop-downs at once can use enough memory for the window to crash.
  let shown = 0;
  let limit = ROW_PAGE;
  const drawMore = () => {
    while (shown < Math.min(rows.length, limit)) tbody.append(renderRow(rows[shown++]));
  };
  const resetRows = () => {
    rows = [];
    shown = 0;
    limit = ROW_PAGE;
    tbody.replaceChildren();
  };
  const addRow = (s: Suggestion) => {
    const row: Row = { s, approved: !s.warning || s.source !== "guess", category: s.category, subcategory: s.subcategory, newName: s.newName };
    rows.push(row);
    drawMore();
    updateCount();
  };

  suggestBtn.addEventListener("click", async () => {
    if (running) {
      await api.aiCancel();
      return;
    }
    running = true;
    resetRows();
    thead.replaceChildren(head());
    errEl.textContent = "";
    statusEl.textContent = aiStatus(settings);
    suggestBtn.textContent = "Stop";
    setBar(0, files.length);
    updateCount();
    try {
      await api.aiSaveSettings(settings);
    } catch (e) {
      errEl.textContent = String(e);
    }
    const unlisten = await listen<AiProgress>("ai-progress", (ev) => {
      setBar(ev.payload.done, ev.payload.total);
      if (ev.payload.suggestion) addRow(ev.payload.suggestion);
    });
    try {
      const out = await api.aiSuggest(files.map((f) => f.path), settings);
      // Events can be dropped if the window was busy; the final list is complete.
      if (out.suggestions.length !== rows.length) {
        resetRows();
        out.suggestions.forEach(addRow);
      }
      const notes: string[] = [];
      if (out.aiError) notes.push(out.aiError);
      if (out.failed.length) notes.push(`Skipped ${out.failed.length} file(s) that couldn't be read: ${out.failed.map((p) => p.split(/[\\/]/).pop()).join(", ")}.`);
      errEl.textContent = notes.join(" ");
      setBar(out.cancelled ? rows.length : files.length, files.length, out.cancelled ? `Stopped after ${rows.length} of ${files.length}` : `Done: ${rows.length} file(s)`);
    } catch (e) {
      errEl.textContent = String(e);
    } finally {
      unlisten();
      running = false;
      suggestBtn.textContent = "Suggest again";
      updateCount();
      if (minimized) {
        report();
        ctx.say(`Categorize finished: ${rows.length} suggestion(s) ready. Click "Categorize" or "Show Categorize" to review them.`);
      }
    }
  });

  planBtn.addEventListener("click", async () => {
    const items = rows.filter((r) => r.approved).map((r) => toApproved(r.s, r));
    try {
      const out = await api.aiPlan(items, wlOf().id, dest ?? undefined);
      m.close();
      ctx.review(out);
    } catch (e) {
      errEl.textContent = String(e);
    }
  });

  const review = reviewPreview(h("table", { class: "list ai-review" }, thead, tbody), (tr) => {
    const path = tr.dataset.path;
    return path ? byPath.get(path) ?? entryFor(path) : null;
  });
  const scroller = review.el.querySelector<HTMLElement>(".review-table");
  scroller?.addEventListener("scroll", () => {
    if (shown < rows.length && scroller.scrollTop + scroller.clientHeight > scroller.scrollHeight - 400) {
      limit += ROW_PAGE;
      drawMore();
    }
  });
  const content = h("div", {},
    h("div", { class: "form-row" },
      h("label", {}, "Categories ", wlSelect),
      h("label", {}, "Mode ", modeSelect),
      h("label", { title: "Only suggest new names; files stay where they are" }, renameOnly, "Rename only"),
    ),
    h("div", { class: "form-row" }, h("span", {}, "Category folders go in "), destLabelEl, destBtn),
    statusEl,
    errEl,
    bar,
    review.el,
    h("p", { class: "note" }, `${files.length} file(s), ${formatSize(files.reduce((n, f) => n + f.size, 0))}. Nothing changes until you review and apply the plan. Approved decisions are remembered once applied and used as hints next time.`),
  );
  const minimizeBtn = h("button", { title: "Hide this window and keep going; bring it back from the toolbar", onclick: () => minimize() }, "Minimize");
  const m = modal({
    title: "Categorize",
    content,
    actions: [minimizeBtn, suggestBtn, planBtn],
    left: h("span", {}, count, " ", review.controls, " ",
      h("button", { onclick: () => { rows.forEach((r) => (r.approved = true)); tbody.querySelectorAll<HTMLInputElement>("td:first-child input").forEach((c) => (c.checked = true)); updateCount(); } }, "All"),
      h("button", { onclick: () => { rows.forEach((r) => (r.approved = false)); tbody.querySelectorAll<HTMLInputElement>("td:first-child input").forEach((c) => (c.checked = false)); updateCount(); } }, "None")),
    onClose: () => {
      if (running) void api.aiCancel();
      session = null;
      minimized = false;
      onBackground(null);
    },
  });
  const minimize = () => {
    minimized = true;
    m.hide();
    report();
    ctx.say(running ? "Categorize keeps going in the background." : "Categorize minimized.");
  };
  session = {
    reopen: () => {
      minimized = false;
      m.show();
      report();
    },
  };
  m.dialog.classList.add("wide");
  review.attach(m.dialog);
  // Esc during a run minimizes instead of stopping it (Cancel still stops it).
  // Added after the preview's handler, which uses Esc to leave full screen first.
  m.dialog.addEventListener("cancel", (ev) => {
    if (running && !ev.defaultPrevented) {
      ev.preventDefault();
      minimize();
    }
  });
}

// ---------- settings ----------

export async function aiSettingsDialog(say: (text: string, error?: boolean) => void) {
  const st = await api.aiState();
  const s: AiSettings = structuredClone(st.settings);
  const enabled = h("input", { type: "checkbox", checked: s.enabled });
  const url = h("input", { type: "text", value: s.url, spellcheck: false, size: 28 });
  const models = h("datalist", { id: "ai-models" });
  const textModel = h("input", { type: "text", value: s.textModel, list: "ai-models", spellcheck: false });
  const visionModel = h("input", { type: "text", value: s.visionModel, list: "ai-models", spellcheck: false });
  const images = h("input", { type: "checkbox", checked: s.analyzeImages });
  const mode = h("select", {}, ...Object.entries(MODE_LABELS).map(([v, t]) => h("option", { value: v, selected: v === s.mode }, t)));
  const result = h("div", { class: "note" });
  const err = h("div", { class: "warn" });
  const forgetBtn = h("button", { disabled: st.decisions === 0 }, `Forget ${st.decisions} learned decision(s)`);

  const test = async () => {
    result.textContent = "Checking…";
    try {
      const list = await api.aiModels(url.value.trim());
      models.replaceChildren(...list.map((m) => h("option", { value: m.name })));
      result.textContent = list.length
        ? `Connected. Installed: ${list.map((m) => `${m.name} (${formatSize(m.size)})`).join(", ")}`
        : "Connected, but no models are installed. Run: ollama pull gemma3:4b";
    } catch (e) {
      result.textContent = String(e);
    }
  };
  forgetBtn.addEventListener("click", async () => {
    if (!confirm("Forget every approved decision? Suggestions will no longer use them as hints.")) return;
    await api.aiForget();
    forgetBtn.textContent = "Forgot all decisions";
    forgetBtn.disabled = true;
  });

  const saveBtn = h("button", { class: "primary" }, "Save");
  const content = h("div", {},
    h("p", { class: "note" }, "Arch-ade can ask a local Ollama server (on this computer only) to suggest categories and names. Everything also works with this off."),
    h("div", { class: "form-row" }, h("label", {}, enabled, "Use local AI (Ollama)")),
    h("div", { class: "form-row" }, h("label", {}, "Ollama address ", url), h("button", { onclick: test }, "Test connection")),
    result,
    models,
    h("div", { class: "form-row" }, h("label", {}, "Text model ", textModel)),
    h("div", { class: "form-row" }, h("label", {}, "Vision model ", visionModel),
      h("button", { onclick: () => { visionModel.value = "gemma3:4b"; } }, "Gemma 3 4B"),
      h("button", { onclick: () => { visionModel.value = "llava:7b"; } }, "LLaVA 1.6 (Mistral 7B)")),
    h("div", { class: "form-row" }, h("label", {}, images, "Look at image contents (sends a small copy of each image to the local model)")),
    h("div", { class: "form-row" }, h("label", {}, "Default mode ", mode)),
    h("p", { class: "note" }, "More consistent: only whitelisted categories, the same answer every time, and a close earlier decision wins. More refined: more specific subcategories (new ones are flagged for you) and more descriptive names."),
    st.pdftotext ? null : h("p", { class: "note" }, "Tip: install pdftotext (Poppler) so the AI can read PDFs; without it PDFs are judged by name."),
    st.ffprobe ? null : h("p", { class: "note" }, "Tip: install ffmpeg (ffprobe) to name music and video from their tags."),
    h("div", { class: "form-row" }, h("button", { onclick: () => whitelistDialog() }, "Manage category whitelists…"), forgetBtn),
    err,
  );
  const m = modal({ title: "Local AI and categories", content, actions: [saveBtn] });
  saveBtn.addEventListener("click", async () => {
    const next: AiSettings = {
      ...s,
      enabled: enabled.checked,
      url: url.value.trim(),
      textModel: textModel.value.trim(),
      visionModel: visionModel.value.trim(),
      analyzeImages: images.checked,
      mode: mode.value as AiSettings["mode"],
    };
    try {
      await api.aiSaveSettings(next);
      m.close();
      say(next.enabled ? "Local AI is on." : "Local AI is off.");
    } catch (e) {
      err.textContent = String(e);
    }
  });
}

// ---------- whitelists ----------

export async function whitelistDialog() {
  const st = await api.aiState();
  const lists: Whitelist[] = structuredClone(st.whitelists);
  let current = 0;
  const err = h("div", { class: "warn" });
  const status = h("span", {});
  const picker = h("select", {});
  const editor = h("div", {});

  const renderPicker = () => {
    picker.replaceChildren(...lists.map((w, i) => h("option", { value: String(i), selected: i === current }, w.name)));
  };
  picker.addEventListener("change", () => { current = Number(picker.value); renderEditor(); });

  const renderEditor = () => {
    const w = lists[current];
    const name = h("input", { type: "text", value: w.name, oninput: () => { w.name = name.value; renderPickerLabel(); } });
    const fallback = h("select", { onchange: () => { w.fallback = fallback.value; } },
      ...w.categories.map((c) => h("option", { value: c.name, selected: c.name === w.fallback }, c.name)));
    const rows = w.categories.map((c, i) => {
      const cname = h("input", { type: "text", value: c.name, size: 14 });
      cname.addEventListener("change", () => {
        if (w.fallback === c.name) w.fallback = cname.value.trim();
        c.name = cname.value.trim();
        renderEditor();
      });
      const subs = h("input", { type: "text", value: c.subcategories.map((s) => s.name).join(", "), size: 40, placeholder: "none" });
      subs.addEventListener("change", () => { c.subcategories = mergeSubcategories(c.subcategories, parseList(subs.value)); });
      const desc = h("input", { type: "text", value: c.description, size: 24, placeholder: "what goes here" });
      desc.addEventListener("change", () => { c.description = desc.value.trim(); });
      return h("tr", {},
        h("td", {}, cname), h("td", {}, subs), h("td", {}, desc),
        h("td", {},
          h("button", { disabled: i === 0, onclick: () => { w.categories.splice(i - 1, 0, ...w.categories.splice(i, 1)); renderEditor(); } }, "↑"),
          h("button", { class: "danger", title: "Remove", onclick: () => { w.categories.splice(i, 1); renderEditor(); } }, "×")),
      );
    });
    const json = h("textarea", { class: "code", rows: 10, spellcheck: false });
    json.value = JSON.stringify(w, null, 2);
    const applyJson = h("button", { onclick: () => {
      try {
        lists[current] = JSON.parse(json.value) as Whitelist;
        err.textContent = "";
        renderPicker();
        renderEditor();
      } catch (e) {
        err.textContent = `JSON: ${String(e)}`;
      }
    } }, "Use this JSON");
    editor.replaceChildren(
      h("div", { class: "form-row" }, h("label", {}, "Name ", name), h("label", {}, "Unsorted files go to ", fallback)),
      h("table", { class: "list" },
        h("thead", {}, h("tr", {}, h("th", {}, "Category"), h("th", {}, "Subcategories (comma-separated)"), h("th", {}, "Description for the AI"), h("th", {}, ""))),
        h("tbody", {}, ...rows)),
      h("div", { class: "form-row" }, h("button", { onclick: () => {
        let n = 1;
        while (w.categories.some((c) => c.name === `New category ${n}`)) n++;
        w.categories.push(emptyCategory(`New category ${n}`));
        renderEditor();
      } }, "Add category")),
      h("details", {}, h("summary", {}, "Advanced: kinds, extensions and keywords (JSON)"),
        h("p", { class: "note" }, "Each category can list file kinds, extensions and name keywords that belong to it; subcategories can list keywords too. These decide the category when the AI is off."),
        json, applyJson),
    );
  };
  const renderPickerLabel = () => {
    const opt = picker.options[current];
    if (opt) opt.textContent = lists[current].name;
  };

  const saveBtn = h("button", { class: "primary" }, "Save");
  const content = h("div", {},
    h("div", { class: "form-row" }, h("label", {}, "Whitelist ", picker),
      h("button", { onclick: () => { lists.push(duplicateWhitelist(lists[current], lists)); current = lists.length - 1; renderPicker(); renderEditor(); } }, "Duplicate"),
      h("button", { class: "danger", onclick: () => {
        if (lists.length < 2) { err.textContent = "Keep at least one whitelist."; return; }
        lists.splice(current, 1);
        current = 0;
        renderPicker();
        renderEditor();
      } }, "Delete")),
    h("p", { class: "note" }, "Category and subcategory names become folder names, so they must be valid on macOS, Windows and Linux."),
    editor,
    err,
  );
  const m = modal({ title: "Category whitelists", content, actions: [saveBtn], left: status });
  saveBtn.addEventListener("click", async () => {
    try {
      await api.aiSaveWhitelists(lists);
      m.close();
    } catch (e) {
      err.textContent = String(e);
    }
  });
  renderPicker();
  renderEditor();
}
