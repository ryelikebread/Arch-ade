// The Rules screen: watched folders, the ordered rule list, templates, the
// JSON rule editor, and the activity log. Every run still goes through a
// normal plan review, so nothing here changes files directly.

import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { api } from "../api";
import { baseName, formatDate } from "../lib/format";
import { folderLabel, instantiate, NEW_RULE, summarize, templateGroups, uniqueId } from "../lib/rules";
import type { PlanOut, Rule, RulesPlanOut } from "../types";
import { h, modal } from "./dom";

export interface RulesContext {
  root: string | null;
  review: (out: PlanOut) => void;
  say: (text: string, error?: boolean) => void;
}

export async function rulesDialog(ctx: RulesContext) {
  const st = await api.rulesGet();
  let rules: Rule[] = structuredClone(st.rules);
  let watched = (await api.watchedFolders()).folders;
  let dirty = false;
  const defaults = await api.defaultFolders();

  const watchedEl = h("div", {});
  const tbody = h("tbody");
  const err = h("div", { class: "warn" });
  const status = h("span", {});

  const markDirty = () => {
    dirty = true;
    status.textContent = "Unsaved changes";
  };

  const renderWatched = () => {
    const rows = watched.map((f) =>
      h("div", { class: "form-row" }, h("span", { class: "mono" }, f),
        h("button", { onclick: async () => {
          watched = (await api.setWatchedFolders(watched.filter((x) => x !== f))).folders;
          renderWatched();
        } }, "Stop watching")),
    );
    const add = async (path: string) => {
      try {
        watched = (await api.setWatchedFolders([...watched, path])).folders;
      } catch (e) {
        err.textContent = String(e);
      }
      renderWatched();
    };
    const quick = defaults
      .filter((d) => (d.label === "Downloads" || d.label === "Desktop") && !watched.includes(d.path))
      .map((d) => h("button", { onclick: () => add(d.path) }, `Watch ${d.label}`));
    watchedEl.replaceChildren(
      ...(rows.length ? rows : [h("p", { class: "note" }, "No folders watched. Rules only run when you press Run.")]),
      h("div", { class: "form-row" },
        h("button", { onclick: async () => {
          const p = await openDialog({ directory: true, multiple: false, title: "Watch folder" });
          if (typeof p === "string") add(p);
        } }, "Watch a folder…"),
        ...quick),
    );
  };

  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= rules.length) return;
    [rules[i], rules[j]] = [rules[j], rules[i]];
    markDirty();
    renderRules();
  };

  const renderRules = () => {
    if (!rules.length) {
      tbody.replaceChildren(h("tr", {}, h("td", { colspan: 6 }, h("p", { class: "note" }, "No rules yet. Add a template below to start."))));
      return;
    }
    tbody.replaceChildren(
      ...rules.map((r, i) => {
        const on = h("input", { type: "checkbox", checked: !!r.enabled, title: "Rule is on",
          onchange: () => { r.enabled = on.checked; markDirty(); } });
        const auto = h("input", { type: "checkbox", checked: !!r.auto, title: "Also run on new files in watched folders",
          onchange: () => { r.auto = auto.checked; markDirty(); } });
        return h(
          "tr",
          {},
          h("td", {}, on),
          h("td", {}, auto),
          h("td", {},
            h("div", {}, r.name, r.group ? h("span", { class: "note" }, `  ${r.group}`) : null),
            h("div", { class: "note" }, summarize(r))),
          h("td", { class: "note" }, folderLabel(r)),
          h("td", { style: "white-space:nowrap" },
            h("button", { title: "Run earlier", disabled: i === 0, onclick: () => move(i, -1) }, "↑"),
            h("button", { title: "Run later", disabled: i === rules.length - 1, onclick: () => move(i, 1) }, "↓")),
          h("td", { style: "white-space:nowrap" },
            h("button", { onclick: () => editRule(r, ctx, rules, (next) => { rules[i] = next; markDirty(); renderRules(); }) }, "Edit"),
            h("button", { class: "danger", title: "Delete rule", onclick: () => { rules.splice(i, 1); markDirty(); renderRules(); } }, "×")),
        );
      }),
    );
  };

  const templateSelect = h(
    "select",
    { title: "Add rules from a template" },
    h("option", { value: "" }, "Add template…"),
    ...templateGroups(st.templates).map(([g, list]) => h("option", { value: g }, `${g} (${list.length})`)),
  );
  templateSelect.addEventListener("change", () => {
    const group = templateGroups(st.templates).find(([g]) => g === templateSelect.value);
    templateSelect.value = "";
    if (!group) return;
    rules.push(...instantiate(group[1], rules));
    markDirty();
    renderRules();
  });

  const saveRules = async (): Promise<boolean> => {
    err.textContent = "";
    try {
      await api.rulesSave(rules);
      dirty = false;
      status.textContent = "Saved";
    } catch (e) {
      err.textContent = String(e);
      return false;
    }
    await confirmDestinations(rules, ctx);
    return true;
  };

  const content = h(
    "div",
    {},
    h("div", { class: "section" }, "Watched folders"),
    h("p", { class: "note" },
      "Rules marked Auto run on files that land directly in these folders, once they finish downloading. ",
      "Dry run applies here too: with it on, watched runs are only logged in Activity."),
    watchedEl,
    h("div", { class: "section" }, "Rules"),
    h("p", { class: "note" }, "Rules run top to bottom; the first rule that matches a file wins. Folders inside a project (Git, Node, Unity, ...) are never touched."),
    h("table", { class: "list rules" },
      h("thead", {}, h("tr", {}, h("th", {}, "On"), h("th", {}, "Auto"), h("th", {}, "Rule"), h("th", {}, "Folders"), h("th", {}, "Order"), h("th", {}, ""))),
      tbody),
    h("div", { class: "form-row", style: "margin-top:8px" },
      templateSelect,
      h("button", { onclick: () => {
        const r = { ...structuredClone(NEW_RULE), id: uniqueId(NEW_RULE.id, rules.map((x) => x.id)) };
        editRule(r, ctx, rules, (next) => { rules.push(next); markDirty(); renderRules(); });
      } }, "New rule…"),
      st.tagsSupported ? null : h("span", { class: "note" }, "File tags aren't available on this system; tag actions will be skipped.")),
    err,
  );

  const run = h("button", { disabled: !ctx.root, title: ctx.root ? `Plan the rules for ${ctx.root}` : "Open a folder first" }, "Run on open folder");
  const save = h("button", { class: "primary" }, "Save");
  const activity = h("button", { onclick: () => activityDialog() }, "Activity");
  const m = modal({ title: "Rules", content, actions: [activity, run, save], left: status });

  save.addEventListener("click", () => saveRules());
  run.addEventListener("click", async () => {
    if (dirty && !(await saveRules())) return;
    try {
      const out = await api.planRules();
      m.close();
      reviewRulesPlan(out, ctx);
    } catch (e) {
      err.textContent = String(e);
    }
  });
  m.dialog.addEventListener("cancel", (ev) => {
    if (dirty && !window.confirm("Discard unsaved rule changes?")) ev.preventDefault();
  });

  renderWatched();
  renderRules();
}

function reviewRulesPlan(out: RulesPlanOut, ctx: RulesContext) {
  if (out.ruleErrors.length) ctx.say(`Some rules were skipped: ${out.ruleErrors.join("; ")}`, true);
  else if (!out.matches.length) ctx.say("No rule matched any file in this folder.");
  ctx.review(out);
}

/** Ask once for destinations outside the opened/watched folders. */
async function confirmDestinations(rules: Rule[], ctx: RulesContext) {
  const missing = (await api.ruleDestinations(rules)).filter((d) => !d.allowed);
  if (!missing.length) return;
  const allow = h("button", { class: "primary" }, "Allow");
  const content = h(
    "div",
    {},
    h("p", {}, "These rules put files in folders outside the ones you opened. Arch-ade only writes where you allow it:"),
    ...missing.map((d) => h("div", { class: "mono" }, d.path, d.exists ? "" : h("span", { class: "note" }, "  (will be created)"))),
    h("p", { class: "note" }, "Until you allow them, those rules skip the files and say why in Activity."),
  );
  const m = modal({ title: "Allow destinations?", content, actions: [allow], small: true });
  allow.addEventListener("click", async () => {
    try {
      for (const d of missing) await api.allowDestination(d.path, true);
      ctx.say(`Allowed ${missing.length} destination folder(s).`);
    } catch (e) {
      ctx.say(String(e), true);
    }
    m.close();
  });
}

const CHEATSHEET = `Conditions (add "not": true to invert any of them):
  {"type": "kind", "kinds": ["image", "heic", "rawImage", "pdf", "video", "audio", "archive", "docx", ...]}
  {"type": "extension", "extensions": ["pdf", "epub"]}
  {"type": "sourceDomain", "domains": ["github.com"]}      also matches subdomains
  {"type": "sourceUrl", "pattern": "invoice|receipt"}      regex on the download link
  {"type": "app", "apps": ["Slack"]}                       reported on macOS, inferred elsewhere
  {"type": "size", "atLeast": "100 MB", "atMost": "2 GB"}
  {"type": "age", "date": "added|created|modified|downloaded", "olderThanDays": 7, "newerThanDays": 30}
  {"type": "nameRegex", "pattern": "^Screenshot", "caseSensitive": false}
"match": "all" (default) or "any"

Actions (at most one of move / trash / archive with removeOriginal):
  {"type": "move", "to": "Images", "ifExists": "rename|skip"}
  {"type": "copy", "to": "{home}/Backup/{year}"}
  {"type": "rename", "pattern": "{date} {original}"}
  {"type": "tag", "tags": ["Work"]}
  {"type": "trash"}
  {"type": "archive", "to": "Archive", "removeOriginal": true}

Paths: relative = inside the folder being organized. Start with {home}, {downloads},
{desktop}, {documents} or {pictures} for other places. Per-file tokens: {kind}, {ext},
{domain}, {app}, {year}, {month}, {day}.
"folders": ["{downloads}"] limits where the rule applies (empty = any folder).`;

function editRule(rule: Rule, ctx: RulesContext, all: Rule[], onDone: (r: Rule) => void) {
  const area = h("textarea", { class: "code", rows: 18, spellcheck: false });
  area.value = JSON.stringify(rule, null, 2);
  const summary = h("p", { class: "note" });
  const err = h("div", { class: "warn" });
  const result = h("div", {});

  const parse = (): Rule | null => {
    try {
      const r = JSON.parse(area.value) as Rule;
      if (typeof r.id !== "string" || typeof r.name !== "string") throw new Error("needs \"id\" and \"name\"");
      if (!Array.isArray(r.conditions) || !Array.isArray(r.actions)) throw new Error("needs \"conditions\" and \"actions\" lists");
      if (all.some((x) => x !== rule && x.id === r.id)) throw new Error(`another rule already uses the id "${r.id}"`);
      err.textContent = "";
      summary.textContent = summarize(r);
      return r;
    } catch (e) {
      err.textContent = e instanceof Error ? e.message : String(e);
      summary.textContent = "";
      return null;
    }
  };
  area.addEventListener("input", () => parse());

  const test = h("button", { disabled: !ctx.root, title: ctx.root ? "Show what this rule would do in the open folder" : "Open a folder first" }, "Test on open folder");
  test.addEventListener("click", async () => {
    const r = parse();
    if (!r) return;
    try {
      const out = await api.planRules(undefined, [r]);
      if (out.ruleErrors.length) {
        err.textContent = out.ruleErrors.join("; ");
        return;
      }
      result.replaceChildren(
        h("div", { class: "head" }, out.matches.length ? `Matches ${out.matches.length} file(s) in the open folder` : "Matches nothing in the open folder"),
        ...out.matches.slice(0, 50).map((x) =>
          h("div", { class: "note" }, baseName(x.path), x.skipped ? ` (skipped: ${x.skipped})` : x.destination ? ` → ${x.destination}` : "")),
      );
    } catch (e) {
      err.textContent = String(e);
    }
  });

  const done = h("button", { class: "primary" }, "Done");
  const content = h(
    "div",
    {},
    summary,
    area,
    err,
    result,
    h("details", {}, h("summary", {}, "Reference"), h("pre", { class: "code" }, CHEATSHEET)),
  );
  const m = modal({ title: `Edit rule: ${rule.name}`, content, actions: [test, done] });
  done.addEventListener("click", () => {
    const r = parse();
    if (!r) return;
    m.close();
    onDone(r);
  });
  parse();
}

export async function activityDialog() {
  const rows = await api.ruleActivity();
  const label: Record<string, string> = { applied: "Done", dryRun: "Dry run", skipped: "Skipped", failed: "Failed" };
  const cls: Record<string, string> = { applied: "status-ok", dryRun: "status-same", skipped: "status-same", failed: "status-bad" };
  const content = rows.length
    ? h(
        "table",
        { class: "list" },
        h("tr", {}, h("th", {}, "When"), h("th", {}, "Rule"), h("th", {}, "File"), h("th", {}, "Result")),
        ...rows.map((a) =>
          h("tr", {},
            h("td", {}, formatDate(a.at)),
            h("td", {}, a.ruleName),
            h("td", { title: a.path }, baseName(a.path)),
            h("td", { class: cls[a.outcome] ?? "" },
              label[a.outcome] ?? a.outcome,
              a.destination && a.outcome !== "skipped" ? h("span", { class: "note" }, ` → ${a.destination}`) : null,
              a.message ? h("div", { class: "note" }, a.message) : null)),
        ),
      )
    : h("p", { class: "note" }, "Nothing yet. Watched folders log here whenever an Auto rule matches a new file.");
  modal({ title: "Rule activity", content });
}
