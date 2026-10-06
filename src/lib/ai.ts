// Pure helpers for the Categorize screen and the whitelist editor. The
// suggestions themselves come from Rust; nothing here decides file moves.

import type { Approved, Category, Subcategory, Suggestion, SuggestionSource, Whitelist } from "../types";
import { uniqueId } from "./rules";

export const SOURCE_LABELS: Record<SuggestionSource, string> = {
  ai: "AI",
  media: "Tags",
  hint: "Earlier",
  guess: "Type",
};

/** "a, b ,, c" -> ["a", "b", "c"], without duplicates (case-insensitive). */
export function parseList(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(",")) {
    const v = raw.trim();
    if (v && !out.some((x) => x.toLowerCase() === v.toLowerCase())) out.push(v);
  }
  return out;
}

/** New subcategory list from names, keeping the keywords of ones that stay. */
export function mergeSubcategories(existing: Subcategory[], names: string[]): Subcategory[] {
  return names.map((name) => existing.find((s) => s.name.toLowerCase() === name.toLowerCase()) ?? { name, keywords: [] });
}

export function emptyCategory(name: string): Category {
  return { name, description: "", subcategories: [], kinds: [], extensions: [], keywords: [] };
}

/** A copy of `w` with a new id and name. */
export function duplicateWhitelist(w: Whitelist, all: Whitelist[]): Whitelist {
  const name = `${w.name} copy`;
  return { ...structuredClone(w), id: uniqueId(name, all.map((x) => x.id)), name };
}

/** `w` with `sub` added under `category` (no-op if it's already there). */
export function addSubcategory(w: Whitelist, category: string, sub: string): Whitelist {
  const copy = structuredClone(w);
  const cat = copy.categories.find((c) => c.name.toLowerCase() === category.toLowerCase());
  if (cat && !cat.subcategories.some((s) => s.name.toLowerCase() === sub.toLowerCase())) {
    cat.subcategories.push({ name: sub, keywords: [] });
  }
  return copy;
}

/** Characters no OS accepts in a file name; the backend checks the full rules. */
export function nameProblem(name: string): string | null {
  if (!name.trim()) return "Name is empty";
  if (/[\\/:*?"<>|]/.test(name)) return "Remove \\ / : * ? \" < > |";
  if (/[. ]$/.test(name)) return "Can't end with a dot or space";
  return null;
}

/** One review row as approved, marked "edited" when the user changed it. */
export function toApproved(s: Suggestion, row: { category: string; subcategory: string; newName: string }): Approved {
  const edited = row.category !== s.category || row.subcategory !== s.subcategory || row.newName !== s.newName;
  return {
    path: s.path,
    category: row.category,
    subcategory: row.subcategory,
    newName: row.newName,
    source: edited ? "edited" : s.source,
    domain: s.domain,
  };
}
