import { listen } from "@tauri-apps/api/event";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { api } from "../api";
import { baseName, formatDate, formatSize } from "../lib/format";
import { BINDINGS, label as keyLabel } from "../lib/hotkeys";
import type { Theme } from "../lib/theme";
import faq from "../help/faq.md?raw";
import quickStart from "../help/quick-start.md?raw";
import type { DupeGroup, FileEntry, Op, PlanOut, RenameOptions, RenameRow, RunReport } from "../types";
import { h, modal } from "./dom";

function describeOp(op: Op): [string, string] {
  switch (op.type) {
    case "mkdir":
      return ["Create folder", op.path];
    case "move":
      return baseName(op.from).startsWith(".arch-ade-tmp-") || baseName(op.to).startsWith(".arch-ade-tmp-")
        ? ["Move (via temp name)", `${baseName(op.from)} → ${baseName(op.to)}`]
        : ["Move", `${op.from}\n→ ${op.to}`];
    case "trash":
      return ["Move to trash", op.path];
    case "copy":
      return ["Copy", `${op.from}\n→ ${op.to}`];
    case "archive":
      return ["Zip", `${op.from}\n→ ${op.to}`];
    case "tag":
      return ["Add tags", `${op.path}\n${op.tags.join(", ")}`];
    case "delete":
      return ["Delete permanently", op.path];
  }
}

/**
 * Shows a plan. With dry run on, this is all that happens. With it off, the
 * user can apply it; `onDone` receives the result.
 */
export function planReview(out: PlanOut, onDone: (r: RunReport) => void, onToggleDryRun: () => void) {
  const { plan } = out;
  const blocking = plan.issues.filter((i) => i.blocking);
  const notes = plan.issues.filter((i) => !i.blocking);
  const content = h(
    "div",
    {},
    blocking.length
      ? h("div", { class: "group" }, h("div", { class: "head status-bad" }, "Can't apply: fix these first"),
          ...blocking.map((i) => h("div", { class: "warn" }, `${i.path}: ${i.message}`)))
      : null,
    notes.length ? h("div", { class: "group" }, ...notes.map((i) => h("div", { class: "note" }, `${baseName(i.path)}: ${i.message}`))) : null,
    plan.ops.length
      ? h(
          "table",
          { class: "list" },
          h("tr", {}, h("th", {}, "#"), h("th", {}, "Step"), h("th", {}, "Details")),
          ...plan.ops.map((op, i) => {
            const [what, detail] = describeOp(op);
            return h("tr", {}, h("td", {}, String(i + 1)), h("td", {}, what), h("td", { style: "white-space:pre-wrap" }, detail));
          }),
        )
      : h("p", { class: "note" }, "Nothing to do."),
  );
  const apply = h("button", { class: "primary", disabled: out.id == null || out.dryRun }, "Apply");
  const left = out.dryRun
    ? h("span", {}, "Dry run is on: nothing will change. ", h("button", { onclick: () => { m.close(); onToggleDryRun(); } }, "Turn off"))
    : plan.ops.some((o) => o.type === "delete")
      ? `${plan.ops.length} step(s). A permanent delete can't be undone.`
      : `${plan.ops.length} step(s). Everything is undoable.`;
  const m = modal({ title: plan.label, content, actions: [apply], left });
  apply.addEventListener("click", async () => {
    if (out.id == null) return;
    apply.disabled = true;
    try {
      onDone(await api.applyPlan(out.id));
    } catch (e) {
      onDone({ planId: out.id, label: plan.label, direction: "apply", done: 0, skipped: 0, total: plan.ops.length, error: String(e), status: "error" });
    }
    m.close();
  });
}

const TOKENS = ["{n}", "{n:03}", "{date}", "{date:%Y%m%d}", "{original}", "{ext}"];

export function renameDialog(entries: FileEntry[], onPlan: (out: PlanOut) => void) {
  const opts: RenameOptions = { pattern: "{original}", start: 1, step: 1, dateSource: "modified" };
  const pattern = h("input", { type: "text", value: opts.pattern, spellcheck: false });
  const start = h("input", { type: "number", value: 1, style: "width:70px" });
  const step = h("input", { type: "number", value: 1, style: "width:60px" });
  const dateSrc = h("select", {}, h("option", { value: "modified" }, "Modified date"), h("option", { value: "created" }, "Created date"));
  const err = h("div", { class: "warn" });
  const tbody = h("tbody");
  const summary = h("span");
  const review = h("button", { class: "primary" }, "Review plan");
  const paths = entries.map((e) => e.path);
  let timer = 0;

  const status = (r: RenameRow) =>
    r.status === "ok" ? h("span", { class: "status-ok" }, "OK")
      : r.status === "unchanged" ? h("span", { class: "status-same" }, "same")
      : h("span", { class: "status-bad", title: r.message ?? "" }, r.message ?? r.status);

  const refresh = async () => {
    opts.pattern = pattern.value;
    opts.start = Number(start.value) || 0;
    opts.step = Number(step.value) || 1;
    opts.dateSource = dateSrc.value as RenameOptions["dateSource"];
    try {
      const rows = await api.renamePreview(paths, opts);
      err.textContent = "";
      tbody.replaceChildren(...rows.map((r) => h("tr", {}, h("td", {}, r.fromName), h("td", {}, r.toName), h("td", {}, status(r)))));
      const bad = rows.filter((r) => !["ok", "unchanged"].includes(r.status)).length;
      summary.textContent = bad ? `${bad} problem(s)` : `${rows.filter((r) => r.status === "ok").length} will change`;
      review.disabled = bad > 0;
    } catch (e) {
      err.textContent = String(e);
      review.disabled = true;
    }
  };
  const later = () => {
    clearTimeout(timer);
    timer = window.setTimeout(refresh, 120);
  };
  for (const el of [pattern, start, step, dateSrc]) el.addEventListener("input", later);

  const content = h(
    "div",
    {},
    h("div", { class: "form-row" }, h("label", {}, "Pattern"), pattern),
    h(
      "div",
      { class: "tokens" },
      ...TOKENS.map((t) =>
        h("button", {
          onclick: () => {
            const pos = pattern.selectionStart ?? pattern.value.length;
            pattern.value = pattern.value.slice(0, pos) + t + pattern.value.slice(pattern.selectionEnd ?? pos);
            pattern.focus();
            later();
          },
        }, t),
      ),
    ),
    h("div", { class: "form-row" }, h("label", {}, "Start at", start), h("label", {}, "Step", step), h("label", {}, "{date} uses", dateSrc)),
    h("p", { class: "note" }, "Numbers follow the current table order. Without {ext} the original extension is kept."),
    err,
    h("table", { class: "list" }, h("thead", {}, h("tr", {}, h("th", {}, "Now"), h("th", {}, "New name"), h("th", {}, ""))), tbody),
  );
  const m = modal({ title: `Rename ${entries.length} item(s)`, content, actions: [review], left: summary });
  review.addEventListener("click", async () => {
    try {
      const out = await api.planRename(paths, opts);
      m.close();
      onPlan(out);
    } catch (e) {
      err.textContent = String(e);
    }
  });
  pattern.select();
  refresh();
}

export async function dupesDialog(entries: FileEntry[], onTrash: (paths: string[]) => void) {
  const progress = h("span", {}, "Hashing…");
  const content = h("div", {}, h("p", { class: "note" }, "Comparing size, then a partial hash, then a full BLAKE3 hash."));
  const trash = h("button", { class: "danger", disabled: true }, "Trash checked");
  const m = modal({ title: "Duplicates", content, actions: [trash], left: progress });
  const unlisten = await listen<[number, number]>("dupes-progress", (ev) => {
    progress.textContent = `Hashed ${ev.payload[0]} / ${ev.payload[1]}`;
  });
  let groups: DupeGroup[] = [];
  try {
    groups = await api.findDuplicates(entries.filter((e) => !e.isDir).map((e) => e.path));
  } catch (e) {
    content.append(h("p", { class: "warn" }, String(e)));
  } finally {
    unlisten();
  }
  if (!m.dialog.open) return;
  const wasted = groups.reduce((s, g) => s + g.wasted, 0);
  progress.textContent = groups.length ? `${groups.length} group(s) · ${formatSize(wasted)} reclaimable` : "No duplicates found.";
  const checks: HTMLInputElement[] = [];
  const update = () => (trash.disabled = !checks.some((c) => c.checked));
  const byPath = new Map(entries.map((e) => [e.path, e]));
  for (const g of groups) {
    // Pre-check every copy except the one most likely to be the original:
    // oldest first, then names without "copy", then the shortest path.
    const copyish = (p: string) => (/\bcopy\b|\(\d+\)/i.test(baseName(p)) ? 1 : 0);
    const sorted = [...g.files].sort(
      (a, b) =>
        (byPath.get(a)?.modified ?? 0) - (byPath.get(b)?.modified ?? 0) ||
        copyish(a) - copyish(b) ||
        a.length - b.length,
    );
    content.append(
      h(
        "div",
        { class: "group" },
        h("div", { class: "head" }, `${formatSize(g.size)} × ${g.files.length}`),
        ...sorted.map((f, i) => {
          const c = h("input", { type: "checkbox", checked: i > 0, onchange: update });
          c.dataset.path = f;
          checks.push(c);
          return h("div", {}, h("label", {}, c, f, h("span", { class: "note" }, ` ${formatDate(byPath.get(f)?.modified ?? null)}`)));
        }),
      ),
    );
  }
  update();
  trash.addEventListener("click", () => {
    const paths = checks.filter((c) => c.checked).map((c) => c.dataset.path!);
    m.close();
    onTrash(paths);
  });
}

const STATE: Record<string, string> = {
  applied: "applied",
  undone: "undone",
  final: "done (can't be undone)",
  expired: "never applied",
  discarded: "undone (replaced)",
  interrupted: "interrupted",
};

/**
 * Everything applied, undone or reviewed. Plans that were reviewed but never
 * applied (often in dry run) changed nothing, so there's nothing to undo:
 * they're hidden unless asked for, and can be reviewed again against the
 * files as they are now.
 */
export async function historyDialog(o: { onReview: (out: PlanOut) => void; onRun: (r: RunReport) => void }) {
  let list = await api.history();
  let showNever = false;
  let busy = false;
  const body = h("div", {});
  const left = h("span", {});
  const m = modal({ title: "History", content: body, left });

  async function undoTo(id: number) {
    busy = true;
    render();
    try {
      // Undo goes newest first; keep going until this plan is undone.
      for (let i = 0; i < 500; i++) {
        const st = await api.journalState();
        if (st.undoPlanId == null) break;
        const r = await api.undo();
        if (!r) break;
        o.onRun(r);
        if (r.error || st.undoPlanId === id) break;
      }
    } catch (e) {
      left.textContent = String(e);
    }
    busy = false;
    list = await api.history();
    render();
  }

  async function review(id: number) {
    try {
      const out = await api.revivePlan(id);
      m.close();
      o.onReview(out);
    } catch (e) {
      left.textContent = String(e);
    }
  }

  function render() {
    const never = list.filter((p) => p.status === "expired").length;
    const rows = list.filter((p) => showNever || p.status !== "expired");
    const action = (p: (typeof list)[number]) =>
      p.status === "expired"
        ? h("button", { disabled: busy, title: "Check it against your files as they are now, then review it", onclick: () => review(p.id) }, "Review again")
        : p.status === "applied"
          ? h("button", { disabled: busy, title: "Undo everything from the newest change back to this one", onclick: () => undoTo(p.id) }, "Undo back to here")
          : "";
    const toggle = h("input", { type: "checkbox", checked: showNever, onchange: () => ((showNever = toggle.checked), render()) });
    body.replaceChildren(
      ...(never ? [h("label", { class: "note" }, toggle, ` Show plans that were reviewed but never applied (${never}). They changed nothing, so there's nothing to undo; Review again can still apply one.`)] : []),
      rows.length
        ? h(
            "table",
            { class: "list" },
            h("tr", {}, h("th", {}, "When"), h("th", {}, "What"), h("th", {}, "Steps"), h("th", {}, "State"), h("th", {}, "")),
            ...rows.map((p) =>
              h("tr", {}, h("td", {}, formatDate(p.appliedAt ?? p.created)), h("td", {}, p.label), h("td", {}, String(p.opCount)),
                h("td", { class: p.status === "applied" || p.status === "final" ? "status-ok" : p.status === "undone" || p.status === "expired" || p.status === "discarded" ? "status-same" : "status-bad" },
                  STATE[p.status] ?? p.status),
                h("td", {}, action(p))),
            ),
          )
        : h("p", { class: "note" }, "No changes yet."),
    );
  }
  render();
}

export function helpDialog(isMac: boolean) {
  const render = (md: string) => {
    const div = h("div", { class: "help" });
    div.innerHTML = DOMPurify.sanitize(marked.parse(md, { async: false }) as string);
    return div;
  };
  const keys = h(
    "table",
    { class: "list" },
    ...[...new Set(BINDINGS.map((b) => b.action))].map((a) => h("tr", {}, h("td", {}, a), h("td", {}, h("kbd", {}, keyLabel(a, isMac))))),
  );
  const body = h("div", {});
  const tabs: [string, () => Node][] = [
    ["Quick start", () => render(quickStart)],
    ["FAQ", () => render(faq)],
    ["Shortcuts", () => keys],
  ];
  const bar = h("div", { class: "form-row" }, ...tabs.map(([name, make]) => h("button", { onclick: () => body.replaceChildren(make()) }, name)));
  body.replaceChildren(tabs[0][1]());
  modal({ title: "Help", content: h("div", {}, bar, body) });
}

export function settingsDialog(themes: Theme[], current: string, onTheme: (t: Theme) => void, dataDir: string, onAi: () => void) {
  const content = h(
    "div",
    {},
    h("div", { class: "head" }, "Local AI and categories"),
    h("div", { class: "form-row" }, h("button", { onclick: onAi }, "AI settings and category whitelists…")),
    h("div", { class: "head" }, "Color scheme"),
    ...themes.map((t) =>
      h(
        "div",
        {},
        h(
          "label",
          {},
          h("input", { type: "radio", name: "theme", checked: t.id === current, onchange: () => onTheme(t) }),
          h("span", { class: "theme-swatch" }, ...Object.values(t.colors).map((c) => { const s = h("span"); s.style.background = c; return s; })),
          t.name,
        ),
      ),
    ),
    h("p", { class: "note" }, `Add your own themes as JSON files in ${dataDir}/themes (copy a built-in one from the repo's src/themes folder as a starting point).`),
  );
  modal({ title: "Settings", content, small: true });
}
