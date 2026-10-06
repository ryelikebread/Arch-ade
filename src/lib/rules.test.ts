import { describe, expect, it } from "vitest";
import { folderLabel, instantiate, summarize, templateGroups, uniqueId } from "./rules";
import type { Rule } from "../types";

const base: Rule = {
  id: "x", name: "x", conditions: [{ type: "kind", kinds: ["image", "heic"] }], actions: [{ type: "move", to: "Images" }],
};

describe("rule summaries", () => {
  it("reads like a sentence", () => {
    expect(summarize(base)).toBe("When kind is Image or HEIC photo: move to Images.");
    const r: Rule = {
      ...base,
      match: "any",
      conditions: [
        { type: "sourceDomain", domains: ["github.com"] },
        { type: "age", olderThanDays: 7, not: true },
        { type: "size", atLeast: "10 MB" },
      ],
      actions: [{ type: "tag", tags: ["Dev"] }, { type: "archive", to: "Zips", removeOriginal: true }],
    };
    expect(summarize(r)).toBe(
      'When downloaded from github.com or NOT (added more than 7 day(s) ago) or size is at least 10 MB: tag "Dev", then zip into Zips, then trash the original.',
    );
  });
  it("names folders", () => {
    expect(folderLabel(base)).toBe("Any folder");
    expect(folderLabel({ ...base, folders: ["{downloads}", "/data/in"] })).toBe("Downloads, /data/in");
  });
});

describe("templates", () => {
  const templates: Rule[] = [
    { ...base, id: "a", group: "G1" },
    { ...base, id: "b", group: "G1" },
    { ...base, id: "c", group: "G2" },
  ];
  it("groups in order", () => {
    expect(templateGroups(templates).map(([g, l]) => [g, l.length])).toEqual([["G1", 2], ["G2", 1]]);
  });
  it("adds copies that are off and don't clash", () => {
    const added = instantiate(templates.slice(0, 2), [{ ...base, id: "a", enabled: true }]);
    expect(added.map((r) => r.id)).toEqual(["a-2", "b"]);
    expect(added.every((r) => !r.enabled && !r.auto)).toBe(true);
    expect(added[0].conditions).not.toBe(templates[0].conditions);
  });
  it("makes ids from names", () => {
    expect(uniqueId("My Rule!", [])).toBe("my-rule");
    expect(uniqueId("my-rule", ["my-rule", "my-rule-2"])).toBe("my-rule-3");
  });
});
