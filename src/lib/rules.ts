// Plain-language summaries of rules and small helpers for the Rules screen.
// The engine itself is in Rust; nothing here decides what happens to files.

import type { Condition, Kind, Rule, RuleAction } from "../types";

export const KIND_LABELS: Record<Kind, string> = {
  folder: "Folder", image: "Image", rawImage: "RAW photo", heic: "HEIC photo", vector: "Vector image", pdf: "PDF",
  text: "Text", markdown: "Markdown", json: "JSON", csv: "Table", html: "HTML", docx: "Word document",
  xlsx: "Spreadsheet", gdoc: "Google Docs link", audio: "Audio", video: "Video", archive: "Archive",
  diskImage: "Disk image", installer: "Installer", unknown: "Other",
};

const list = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;

const size = (v: number | string) => (typeof v === "number" ? `${v} bytes` : v);

export function describeCondition(c: Condition): string {
  let s: string;
  switch (c.type) {
    case "kind":
      s = `kind is ${list(c.kinds.map((k) => KIND_LABELS[k] ?? k))}`;
      break;
    case "extension":
      s = `extension is ${list(c.extensions.map((e) => `.${e.replace(/^\./, "")}`))}`;
      break;
    case "sourceDomain":
      s = `downloaded from ${list(c.domains)}`;
      break;
    case "sourceUrl":
      s = `download link matches /${c.pattern}/`;
      break;
    case "app":
      s = `downloaded by ${list(c.apps)}`;
      break;
    case "size":
      s = c.atLeast != null && c.atMost != null
        ? `size is ${size(c.atLeast)} to ${size(c.atMost)}`
        : c.atLeast != null ? `size is at least ${size(c.atLeast)}` : `size is at most ${size(c.atMost ?? 0)}`;
      break;
    case "age": {
      const which = c.date ?? "added";
      const parts = [];
      if (c.olderThanDays != null) parts.push(`more than ${c.olderThanDays} day(s) ago`);
      if (c.newerThanDays != null) parts.push(`less than ${c.newerThanDays} day(s) ago`);
      s = `${which} ${parts.join(" and ")}`;
      break;
    }
    case "nameRegex":
      s = `name matches /${c.pattern}/${c.caseSensitive ? "" : "i"}`;
      break;
    default:
      s = "unknown condition";
  }
  return c.not ? `NOT (${s})` : s;
}

export function describeAction(a: RuleAction): string {
  switch (a.type) {
    case "move":
      return `move to ${a.to}`;
    case "copy":
      return `copy to ${a.to}`;
    case "rename":
      return `rename to "${a.pattern}"`;
    case "tag":
      return `tag ${list(a.tags.map((t) => `"${t}"`))}`;
    case "trash":
      return "move to the trash";
    case "archive":
      return `zip into ${a.to}${a.removeOriginal ? ", then trash the original" : ""}`;
    default:
      return "unknown action";
  }
}

export function summarize(r: Rule): string {
  const joiner = r.match === "any" ? " or " : " and ";
  const when = r.conditions.length ? r.conditions.map(describeCondition).join(joiner) : "(no conditions)";
  const then = r.actions.length ? r.actions.map(describeAction).join(", then ") : "(no actions)";
  return `When ${when}: ${then}.`;
}

export function folderLabel(r: Rule): string {
  if (!r.folders?.length) return "Any folder";
  const nice: Record<string, string> = {
    "{downloads}": "Downloads", "{desktop}": "Desktop", "{documents}": "Documents", "{pictures}": "Pictures", "{home}": "Home",
  };
  return r.folders.map((f) => nice[f] ?? f).join(", ");
}

/** An id not used by any rule in `taken`, based on `base`. */
export function uniqueId(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "rule";
  if (!used.has(slug)) return slug;
  for (let i = 2; ; i++) if (!used.has(`${slug}-${i}`)) return `${slug}-${i}`;
}

/** Template groups in their built-in order. */
export function templateGroups(templates: Rule[]): [string, Rule[]][] {
  const groups = new Map<string, Rule[]>();
  for (const t of templates) {
    const g = t.group ?? t.name;
    groups.set(g, [...(groups.get(g) ?? []), t]);
  }
  return [...groups];
}

/** Copies of a template group's rules, off, with ids that don't clash. */
export function instantiate(group: Rule[], existing: Rule[]): Rule[] {
  const ids = existing.map((r) => r.id);
  return group.map((t) => {
    const id = uniqueId(t.id, ids);
    ids.push(id);
    return { ...structuredClone(t), id, enabled: false, auto: false };
  });
}

export const NEW_RULE: Rule = {
  id: "my-rule",
  name: "My rule",
  enabled: false,
  auto: false,
  folders: ["{downloads}"],
  match: "all",
  conditions: [{ type: "extension", extensions: ["pdf"] }],
  actions: [{ type: "move", to: "PDFs" }],
};
