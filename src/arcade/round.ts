// Turning a round of edits into game pieces. Pure, so it's tested without a
// canvas: trashed and deleted files become foes, kept/moved/renamed files
// become friends; size sets strength, kind sets ability or perk.

import type { FbfAction, FbfRecord } from "../lib/fbf";
import type { FileEntry, Kind, Plan } from "../types";
import type { Ability, ArcadeFile, ArcadeRound, Cast, Family, Fate, Foe, Friend, Perk } from "./types";

export const MAX_FOES = 48;
export const MAX_FRIENDS = 32;

const FAMILY: Record<Kind, Family> = {
  image: "picture", rawImage: "picture", heic: "picture", vector: "picture",
  pdf: "document", docx: "document", gdoc: "document",
  csv: "sheet", xlsx: "sheet",
  text: "code", markdown: "code", json: "code", html: "code",
  audio: "audio", video: "video", archive: "archive",
  diskImage: "package", installer: "package",
  folder: "other", unknown: "other",
};

export const ABILITY: Record<Family, Ability> = {
  picture: "flash", document: "shield", sheet: "shield", code: "teleport", audio: "sonic",
  video: "fast", archive: "split", package: "tank", other: "basic",
};

export const PERK: Record<Family, Perk> = {
  picture: "health", document: "armor", sheet: "armor", code: "ally", audio: "rapid",
  video: "spread", archive: "ammo", package: "power", other: "points",
};

export const familyOf = (kind: Kind): Family => FAMILY[kind] ?? "other";

/** 1..10 on a log scale (round(log2(KB+1)/2)): 1 up to about 7 KB, 5 around 1 MB, 9 at 256 MB, 10 from about 362 MB up. */
export function strength(bytes: number): number {
  const kb = Math.max(0, bytes) / 1024;
  return Math.max(1, Math.min(10, Math.round(Math.log2(kb + 1) / 2)));
}

/** Up to `max` characters of the name for drawing: no extension, uppercase-safe. */
export function label(name: string, max = 10): string {
  const dot = name.lastIndexOf(".");
  const stem = (dot > 0 ? name.slice(0, dot) : name).trim() || name;
  return stem.length > max ? `${stem.slice(0, max - 1)}.` : stem;
}

export const isFoe = (f: Fate) => f === "trashed" || f === "deleted";

/** Pick up to `max` items spread evenly through the list (keeps big and small, not just the first ones). */
function spread<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  return Array.from({ length: max }, (_, i) => items[Math.floor((i * items.length) / max)]);
}

/** The cast for a round, biggest files first, with caps on how many take part. */
export function cast(round: ArcadeRound, caps = { foes: MAX_FOES, friends: MAX_FRIENDS }): Cast {
  const bySize = [...round.files].sort((a, b) => b.bytes - a.bytes);
  const foeFiles = bySize.filter((f) => isFoe(f.fate));
  const friendFiles = bySize.filter((f) => !isFoe(f.fate));
  const foes: Foe[] = spread(foeFiles, caps.foes).map((file) => {
    const family = familyOf(file.kind);
    const elite = file.fate === "deleted";
    return { file, label: label(file.name), family, ability: ABILITY[family], hp: Math.min(10, strength(file.bytes) + (elite ? 2 : 0)), elite };
  });
  const friends: Friend[] = spread(friendFiles, caps.friends).map((file) => {
    const family = familyOf(file.kind);
    return { file, label: label(file.name), family, perk: PERK[family], power: strength(file.bytes) };
  });
  return { foes, friends, benched: foeFiles.length - foes.length + friendFiles.length - friends.length };
}

const FILLER_NAMES = ["DUST", "CLUTTER", "TEMP", "CRUMB", "JUNK", "SCRAP"];

/** Generic foes that aren't files, so a round with few trashed files still has a game. */
export function filler(n: number, rng: () => number): Foe[] {
  const abilities: Ability[] = ["basic", "basic", "fast", "flash"];
  return Array.from({ length: Math.max(0, n) }, (_, i) => ({
    file: null,
    label: FILLER_NAMES[i % FILLER_NAMES.length],
    family: "other" as Family,
    ability: abilities[Math.floor(rng() * abilities.length)],
    hp: 1,
    elite: false,
  }));
}

/** mulberry32: small, fast, seeded. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seed from the round itself, so the same round builds the same level. */
export function seedOf(round: ArcadeRound): number {
  let h = 2166136261;
  for (const f of round.files) for (const c of `${f.name}|${f.bytes}|${f.fate};`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

// ---------- where rounds come from ----------

const FATE_OF: Record<FbfAction, Fate> = { keep: "kept", move: "moved", rename: "renamed", trash: "trashed", delete: "deleted" };

/** A File-by-File session's decisions (dry-run ones count too: it's only a game). */
export function roundFromFbf(results: { entry: FileEntry; record: FbfRecord }[]): ArcadeRound {
  const files = results
    .filter(({ entry }) => !entry.isDir)
    .map(({ entry, record }) => ({ name: entry.name, kind: entry.kind, kindLabel: entry.kindLabel, bytes: entry.size, fate: FATE_OF[record.action], folder: folderOf(entry.path) }));
  return { source: "File by File", files, folders: foldersOf(files) };
}

const dirOf = (p: string) => p.replace(/[\\/][^\\/]*$/, "");
const nameOf = (p: string) => p.split(/[\\/]/).pop() ?? p;
/** The name of the folder a file is in. */
const folderOf = (path: string) => nameOf(dirOf(path)) || undefined;

/** Folder names for level titles: the round's folders, or a stand-in when it has none. */
export function levelFolders(round: ArcadeRound | null): string[] {
  const f = round?.folders?.length ? round.folders : round ? foldersOf(round.files) : [];
  return f.length ? f : ["Files"];
}

/** Distinct folders of a round's files, most files first. */
export function foldersOf(files: ArcadeFile[]): string[] {
  const n = new Map<string, number>();
  for (const f of files) if (f.folder) n.set(f.folder, (n.get(f.folder) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);
}

/** An applied plan's files. Only files the main list knows (it has their kind and size). */
export function roundFromPlan(plan: Plan, entries: FileEntry[]): ArcadeRound {
  // A file can have several ops (tag then move, archive then trash): the one
  // that says most about where it ended up wins.
  const rank: Record<Fate, number> = { kept: 0, moved: 1, renamed: 1, trashed: 2, deleted: 3 };
  const fates = new Map<string, Fate>();
  // Renames that swap names go through a temporary name: follow the hop back.
  const viaTemp = new Map<string, string>();
  const isTemp = (p: string) => nameOf(p).startsWith(".arch-ade-tmp-");
  for (const op of plan.ops) {
    let path: string | null;
    let fate: Fate;
    if (op.type === "move") {
      if (isTemp(op.to)) {
        viaTemp.set(op.to, op.from);
        continue;
      }
      path = viaTemp.get(op.from) ?? op.from;
      fate = dirOf(path) === dirOf(op.to) && nameOf(path) !== nameOf(op.to) ? "renamed" : "moved";
    } else if (op.type === "trash") [path, fate] = [op.path, "trashed"];
    else if (op.type === "delete") [path, fate] = [op.path, "deleted"];
    else if (op.type === "copy" || op.type === "archive") [path, fate] = [op.from, "kept"];
    else if (op.type === "mkdir") continue;
    else [path, fate] = [op.path, "kept"];
    const had = fates.get(path);
    if (had === undefined || rank[fate] > rank[had]) fates.set(path, fate);
  }
  const files: ArcadeFile[] = [];
  for (const e of entries) {
    const fate = fates.get(e.path);
    if (fate && !e.isDir) files.push({ name: e.name, kind: e.kind, kindLabel: e.kindLabel, bytes: e.size, fate, folder: folderOf(e.path) });
  }
  return { source: "Plan", files, folders: foldersOf(files) };
}

// ---------- settings ----------

export type ArcadeMode = "off" | "offer" | "auto";

export interface ArcadeSettings {
  /** off: nothing (the default); offer: a Play button after a round; auto: start a game right away. */
  mode: ArcadeMode;
  /** A game id, or "random". */
  game: string;
}

export function normalizeArcade(raw: unknown, gameIds: string[]): ArcadeSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    mode: r.mode === "offer" || r.mode === "auto" ? r.mode : "off",
    game: typeof r.game === "string" && gameIds.includes(r.game) ? r.game : "random",
  };
}
