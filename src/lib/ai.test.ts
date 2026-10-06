import { describe, expect, it } from "vitest";
import type { Suggestion, Whitelist } from "../types";
import { addSubcategory, duplicateWhitelist, emptyCategory, mergeSubcategories, nameProblem, parseList, toApproved } from "./ai";

const wl: Whitelist = {
  id: "general",
  name: "General",
  fallback: "Other",
  categories: [
    { ...emptyCategory("Documents"), subcategories: [{ name: "Finance", keywords: ["invoice"] }] },
    emptyCategory("Other"),
  ],
};

const sug: Suggestion = {
  path: "/d/a.pdf", name: "a.pdf", kind: "pdf", category: "Documents", subcategory: "Finance", newName: "Invoice.pdf",
  source: "ai", reason: "", newSubcategory: false, screenshot: false, warning: null, domain: "acme.com",
};

describe("ai helpers", () => {
  it("parses comma lists and keeps keywords", () => {
    expect(parseList(" Finance, work ,, Work, School ")).toEqual(["Finance", "work", "School"]);
    const subs = mergeSubcategories(wl.categories[0].subcategories, ["finance", "Taxes"]);
    expect(subs).toEqual([{ name: "Finance", keywords: ["invoice"] }, { name: "Taxes", keywords: [] }]);
  });

  it("adds subcategories and duplicates whitelists without touching the original", () => {
    const w2 = addSubcategory(wl, "documents", "Taxes");
    expect(w2.categories[0].subcategories.map((s) => s.name)).toEqual(["Finance", "Taxes"]);
    expect(wl.categories[0].subcategories).toHaveLength(1);
    expect(addSubcategory(w2, "Documents", "taxes").categories[0].subcategories).toHaveLength(2);
    const copy = duplicateWhitelist(wl, [wl]);
    expect(copy.id).toBe("general-copy");
    expect(copy.name).toBe("General copy");
  });

  it("flags names no OS accepts", () => {
    expect(nameProblem("ok name.pdf")).toBeNull();
    expect(nameProblem("a:b.pdf")).not.toBeNull();
    expect(nameProblem("trailing.")).not.toBeNull();
    expect(nameProblem("  ")).not.toBeNull();
  });

  it("marks edited rows", () => {
    expect(toApproved(sug, { category: "Documents", subcategory: "Finance", newName: "Invoice.pdf" }).source).toBe("ai");
    const e = toApproved(sug, { category: "Documents", subcategory: "", newName: "Invoice.pdf" });
    expect(e).toEqual({ path: "/d/a.pdf", category: "Documents", subcategory: "", newName: "Invoice.pdf", source: "edited", domain: "acme.com" });
  });
});
