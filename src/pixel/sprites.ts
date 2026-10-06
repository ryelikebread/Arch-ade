// Original 8x8 pixel icons, drawn in code. Letters map to theme colors so
// icons follow the active color scheme.
import type { Kind } from "../types";

type Sprite = string[];

const PAGE = (mark: string[], band = "d"): Sprite => [
  ".dddd...",
  ".d" + "ii" + "d" + "d..",
  ".d" + mark[0] + "d.",
  ".d" + mark[1] + "d.",
  ".d" + mark[2] + "d.",
  ".d" + "iiii" + "d.",
  "." + band.repeat(6) + ".",
  "........",
];

const SPRITES: Record<string, Sprite> = {
  folder: ["........", "aaa.....", "aaaaaaaa", "abbbbbba", "abbbbbba", "abbbbbba", "aaaaaaaa", "........"],
  image: PAGE(["iiia", "igii", "gggg"]),
  pdf: PAGE(["rrri", "riri", "riii"], "r"),
  text: PAGE(["dddi", "iiii", "ddii"]),
  table: PAGE(["dddd", "dbdb", "dddd"], "g"),
  doc: PAGE(["bbbi", "iiii", "bbii"], "b"),
  audio: PAGE(["iibb", "iibi", "bbii"]),
  video: PAGE(["iaii", "iaai", "iaii"]),
  archive: PAGE(["iaii", "iiai", "iaii"], "a"),
  disk: ["..dddd..", ".diiiid.", "diiaaiid", "diaddaid", "diiaaiid", ".diiiid.", "..dddd..", "........"],
  installer: ["........", ".aaaaaa.", ".adadda.", ".aaaaaa.", ".abbbba.", ".abbbba.", ".aaaaaa.", "........"],
  link: PAGE(["ibbi", "biib", "ibbi"], "b"),
  unknown: PAGE(["iddi", "iidi", "iiii"]),
};

const KIND_SPRITE: Record<Kind, keyof typeof SPRITES> = {
  folder: "folder", image: "image", rawImage: "image", heic: "image", vector: "image", pdf: "pdf",
  text: "text", markdown: "text", json: "text", html: "text", csv: "table", xlsx: "table", docx: "doc",
  gdoc: "link", audio: "audio", video: "video", archive: "archive", diskImage: "disk",
  installer: "installer", unknown: "unknown",
};

const COLOR_VAR: Record<string, string> = {
  a: "--accent", b: "--accent2", d: "--dim", i: "--ink", r: "--danger", g: "--ok",
};

let cache = new Map<string, string>();

/** Call after a theme change so icons are re-tinted. */
export function resetSprites() {
  cache = new Map();
}

function draw(sprite: Sprite): string {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 8;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  const css = getComputedStyle(document.documentElement);
  sprite.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const v = COLOR_VAR[ch];
      if (!v) return;
      ctx.fillStyle = css.getPropertyValue(v).trim() || "#fff";
      ctx.fillRect(x, y, 1, 1);
    });
  });
  return c.toDataURL();
}

export function kindIcon(kind: Kind): string {
  const name = KIND_SPRITE[kind] ?? "unknown";
  let url = cache.get(name);
  if (url === undefined) {
    url = draw(SPRITES[name]);
    cache.set(name, url);
  }
  return url;
}

export const _spritesForTest = SPRITES;
