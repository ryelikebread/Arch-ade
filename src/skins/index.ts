// Skins for File-by-File mode. Minimal draws nothing (no canvas, no timers);
// the others are a sprite sheet + manifest each, built in or dropped into
// <app data>/skins/.

import { api } from "../api";
import spaceManifest from "./builtin/space/manifest.json";
import spaceSheet from "./builtin/space/sheet.png";
import volcanoManifest from "./builtin/volcano/manifest.json";
import volcanoSheet from "./builtin/volcano/sheet.png";
import { validateSkin, type SkinManifest } from "./format";
import { loadImage, type LoadedSkin } from "./stage";

export const MINIMAL_ID = "minimal";

export interface SkinChoice {
  id: string;
  name: string;
  /** Absent for Minimal. */
  manifest?: SkinManifest;
  sheetUrl?: string;
  user?: boolean;
}

/** Built-ins go through the same checks as user skins. */
function builtIn(raw: unknown, sheetUrl: string): SkinChoice {
  const m = validateSkin(raw);
  if (Array.isArray(m)) throw new Error(`built-in skin is invalid: ${m.join("; ")}`);
  return { id: m.id, name: m.name, manifest: m, sheetUrl };
}

const BUILT_IN: SkinChoice[] = [
  { id: MINIMAL_ID, name: "Minimal" },
  builtIn(volcanoManifest, volcanoSheet),
  builtIn(spaceManifest, spaceSheet),
];

/** Every usable skin, plus a note for each user skin that was rejected. */
export async function listSkins(): Promise<{ skins: SkinChoice[]; problems: string[] }> {
  const skins = [...BUILT_IN];
  const problems: string[] = [];
  let user: Awaited<ReturnType<typeof api.userSkins>> = [];
  try {
    user = await api.userSkins();
  } catch {
    /* no user skins */
  }
  for (const u of user) {
    const m = validateSkin(u.manifest);
    if (Array.isArray(m)) problems.push(`skins/${u.folder}: ${m.slice(0, 3).join("; ")}`);
    else if (skins.some((s) => s.id === m.id)) problems.push(`skins/${u.folder}: id "${m.id}" is already used`);
    else skins.push({ id: m.id, name: m.name, manifest: m, sheetUrl: u.sheet, user: true });
  }
  return { skins, problems };
}

export async function loadSkin(choice: SkinChoice): Promise<LoadedSkin | null> {
  if (!choice.manifest || !choice.sheetUrl) return null;
  return { manifest: choice.manifest, sheet: await loadImage(choice.sheetUrl) };
}
