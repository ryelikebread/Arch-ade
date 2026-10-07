// The skin format: a sprite sheet (PNG) plus this JSON manifest. Built-in
// skins live in src/skins/builtin/<id>/; users can drop more into
// <app data>/skins/<folder>/. See docs/SKINS.md.

import { isSfx, type SfxName } from "../audio/sfx";

export type SkinEvent = "keep" | "move" | "rename" | "trash" | "delete";
export const SKIN_EVENTS: SkinEvent[] = ["keep", "move", "rename", "trash", "delete"];
/** Events every skin must animate; "delete" falls back to "trash". */
const REQUIRED: SkinEvent[] = ["keep", "move", "rename", "trash"];

export type Ease = "linear" | "in" | "out" | "inOut";

/** A rectangle on the sheet; `frames` copies of it sit side by side. */
export interface SpriteRect {
  x: number;
  y: number;
  w: number;
  h: number;
  frames?: number;
}

/** Where a track is at time `t` (0..1 of the animation). */
export interface Key {
  t: number;
  x: number;
  y: number;
  alpha?: number;
  scale?: number;
  /** Height of a hop on the way to this key, in pixels. */
  arc?: number;
  /** Easing on the way to this key. */
  ease?: Ease;
}

/**
 * One moving thing. `sprite` names a sheet sprite, or "file" for the current
 * file's icon (16x16). Or `text` (with {name}, {newName}, {dest}, {kind}).
 * A track is only drawn between its first and last key.
 */
export interface Track {
  sprite?: string;
  text?: string;
  color?: string;
  align?: "left" | "center";
  /** Text is cut to this box: [x, y, w, h]. */
  clip?: [number, number, number, number];
  /** Frames per second for multi-frame sprites (default: first frame only). */
  fps?: number;
  /** Play the frames once and hold the last (bursts) instead of looping. */
  once?: boolean;
  keys: Key[];
}

/** A scenery sprite drawn under everything, animated at `fps` if it has frames. */
export interface Prop {
  sprite: string;
  x: number;
  y: number;
  fps?: number;
}

export interface Animation {
  /** Milliseconds. */
  duration: number;
  tracks: Track[];
}

/** A sound effect at a point in an animation (0..1 of its duration). */
export interface Cue {
  sfx: SfxName;
  at: number;
}

export interface SkinManifest {
  format: 1;
  id: string;
  name: string;
  /** File name of the sheet, next to the manifest. */
  sheet: string;
  /** Stage size in pixels; it's scaled up by whole numbers to fit. */
  size: [number, number];
  /** Horizontal color bands from the top: [y, "#rrggbb"]. */
  bands?: [number, string][];
  scene?: Prop[];
  /** Where the current file's icon rests between animations. */
  file: [number, number];
  sprites: Record<string, SpriteRect>;
  animations: Partial<Record<SkinEvent, Animation>>;
  /** Sound effects per action; "delete" falls back to "trash". Optional. */
  sounds?: Partial<Record<SkinEvent, Cue[]>>;
}

const COLOR = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i;
const num = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const int = (v: unknown, lo: number, hi: number) => num(v, lo, hi) && Number.isInteger(v);

/** The manifest if it's valid, otherwise what's wrong with it. */
export function validateSkin(raw: unknown): SkinManifest | string[] {
  const errs: string[] = [];
  if (!raw || typeof raw !== "object") return ["manifest is not a JSON object"];
  const m = raw as Record<string, unknown>;
  if (m.format !== 1) errs.push("format must be 1");
  if (typeof m.id !== "string" || !/^[a-z0-9-]{1,40}$/.test(m.id)) errs.push("id must be lowercase letters, digits or -");
  if (typeof m.name !== "string" || !m.name.trim() || m.name.length > 40) errs.push("name is required (up to 40 characters)");
  if (typeof m.sheet !== "string" || !/^[\w.-]+\.png$/i.test(m.sheet)) errs.push("sheet must be a .png file name");
  const size = m.size as unknown[];
  const sizeOk = Array.isArray(size) && size.length === 2 && int(size[0], 32, 640) && int(size[1], 32, 360);
  if (!sizeOk) errs.push("size must be [width 32..640, height 32..360]");
  const W = sizeOk ? (size[0] as number) : 640;
  const H = sizeOk ? (size[1] as number) : 360;
  const inStage = (x: unknown, y: unknown) => num(x, -2 * W, 3 * W) && num(y, -2 * H, 3 * H);

  const sprites = m.sprites as Record<string, SpriteRect> | undefined;
  if (!sprites || typeof sprites !== "object") errs.push("sprites is required");
  else
    for (const [name, r] of Object.entries(sprites)) {
      if (name === "file") errs.push('"file" is reserved for the file icon');
      if (!r || !int(r.x, 0, 8192) || !int(r.y, 0, 8192) || !int(r.w, 1, 640) || !int(r.h, 1, 360) || (r.frames !== undefined && !int(r.frames, 1, 64)))
        errs.push(`sprite ${name}: x, y, w, h (and frames 1..64) must be whole numbers`);
    }
  const known = (s: string) => s === "file" || (sprites != null && Object.hasOwn(sprites, s));

  if (m.bands !== undefined) {
    const bands = m.bands as unknown[];
    if (!Array.isArray(bands) || bands.length > 32) errs.push("bands must be a list of up to 32 [y, color]");
    else
      bands.forEach((b, i) => {
        if (!Array.isArray(b) || !int(b[0], 0, H) || typeof b[1] !== "string" || !COLOR.test(b[1])) errs.push(`band ${i + 1} must be [y, "#rrggbb"]`);
      });
  }
  const scene = (m.scene ?? []) as Prop[];
  if (!Array.isArray(scene) || scene.length > 64) errs.push("scene must be a list of up to 64 props");
  else
    scene.forEach((p, i) => {
      if (!p || typeof p.sprite !== "string" || !known(p.sprite) || p.sprite === "file") errs.push(`scene ${i + 1}: unknown sprite ${p?.sprite}`);
      else if (!inStage(p.x, p.y) || (p.fps !== undefined && !num(p.fps, 0, 30))) errs.push(`scene ${i + 1}: bad position or fps`);
    });
  const file = m.file as unknown[];
  if (!Array.isArray(file) || file.length !== 2 || !inStage(file[0], file[1])) errs.push("file must be [x, y]");

  const anims = m.animations as Record<string, Animation> | undefined;
  if (!anims || typeof anims !== "object") errs.push("animations is required");
  else {
    for (const ev of REQUIRED) if (!anims[ev]) errs.push(`animations.${ev} is required`);
    for (const [ev, a] of Object.entries(anims)) {
      if (!SKIN_EVENTS.includes(ev as SkinEvent)) {
        errs.push(`unknown animation ${ev}`);
        continue;
      }
      if (!a || !num(a.duration, 100, 10000)) errs.push(`${ev}: duration must be 100..10000 ms`);
      if (!a || !Array.isArray(a.tracks) || a.tracks.length > 64) {
        errs.push(`${ev}: tracks must be a list of up to 64`);
        continue;
      }
      a.tracks.forEach((t, i) => {
        const where = `${ev} track ${i + 1}`;
        if (!t || (typeof t.sprite === "string") === (typeof t.text === "string")) errs.push(`${where}: needs either sprite or text`);
        else if (t.sprite !== undefined && !known(t.sprite)) errs.push(`${where}: unknown sprite ${t.sprite}`);
        if (t?.text !== undefined && (t.text.length > 80 || (t.color !== undefined && !COLOR.test(t.color)))) errs.push(`${where}: text too long or bad color`);
        if (t?.fps !== undefined && !num(t.fps, 0, 30)) errs.push(`${where}: fps must be 0..30`);
        if (t?.once !== undefined && typeof t.once !== "boolean") errs.push(`${where}: once must be true or false`);
        if (t?.clip !== undefined && !(Array.isArray(t.clip) && t.clip.length === 4 && t.clip.every((v) => num(v, -W, 2 * W)))) errs.push(`${where}: clip must be [x, y, w, h]`);
        const keys = t?.keys;
        if (!Array.isArray(keys) || keys.length < 1 || keys.length > 64) {
          errs.push(`${where}: needs 1..64 keys`);
          return;
        }
        keys.forEach((k, j) => {
          const ok = k && num(k.t, 0, 1) && inStage(k.x, k.y) && (j === 0 || k.t >= keys[j - 1].t)
            && (k.alpha === undefined || num(k.alpha, 0, 1)) && (k.scale === undefined || num(k.scale, 0, 8))
            && (k.arc === undefined || num(k.arc, -H, H)) && (k.ease === undefined || ["linear", "in", "out", "inOut"].includes(k.ease));
          if (!ok) errs.push(`${where} key ${j + 1}: t 0..1 in order, x/y on stage, alpha 0..1, scale 0..8`);
        });
      });
    }
  }
  if (m.sounds !== undefined) {
    const sounds = m.sounds as Record<string, unknown>;
    if (!sounds || typeof sounds !== "object" || Array.isArray(sounds)) errs.push("sounds must be an object of action: [cues]");
    else
      for (const [ev, cues] of Object.entries(sounds)) {
        if (!SKIN_EVENTS.includes(ev as SkinEvent)) errs.push(`sounds: unknown action ${ev}`);
        else if (!Array.isArray(cues) || cues.length > 16) errs.push(`sounds.${ev} must be a list of up to 16 cues`);
        else
          cues.forEach((c: Cue, i) => {
            if (!c || !isSfx(c.sfx)) errs.push(`sounds.${ev} cue ${i + 1}: unknown sound ${c?.sfx}`);
            else if (!num(c.at, 0, 1)) errs.push(`sounds.${ev} cue ${i + 1}: at must be 0..1`);
          });
      }
  }
  return errs.length ? errs : (m as unknown as SkinManifest);
}

// ---------- timing (pure, shared by the renderer and tests) ----------

export function ease(kind: Ease | undefined, u: number): number {
  switch (kind) {
    case "in": return u * u;
    case "out": return 1 - (1 - u) * (1 - u);
    case "inOut": return u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
    default: return u;
  }
}

export interface Pose {
  x: number;
  y: number;
  alpha: number;
  scale: number;
}

/** Where a track is at progress `p`, or null when it isn't on stage. */
export function poseAt(keys: Key[], p: number): Pose | null {
  if (!keys.length || p < keys[0].t || p > keys[keys.length - 1].t) return null;
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].t < p) i++;
  const a = keys[i];
  const b = keys[Math.min(i + 1, keys.length - 1)];
  const span = b.t - a.t;
  const u = span > 0 ? ease(b.ease, (p - a.t) / span) : 1;
  const lerp = (x: number, y: number) => x + (y - x) * u;
  const hop = (b.arc ?? 0) * 4 * u * (1 - u);
  return {
    x: lerp(a.x, b.x),
    y: lerp(a.y, b.y) - hop,
    alpha: lerp(a.alpha ?? 1, b.alpha ?? 1),
    scale: lerp(a.scale ?? 1, b.scale ?? 1),
  };
}

/** Which frame of an n-frame sprite shows `ms` after it appeared. */
export function frameAt(frames: number, fps: number | undefined, ms: number, once = false): number {
  if (!fps || frames <= 1) return 0;
  const n = Math.floor((Math.max(0, ms) * fps) / 1000);
  return once ? Math.min(frames - 1, n) : n % frames;
}

export interface Captions {
  name: string;
  newName?: string;
  dest?: string;
  kind?: string;
}

export function caption(template: string, c: Captions): string {
  return template.replace(/\{(name|newName|dest|kind)\}/g, (_, k: keyof Captions) => c[k] ?? "");
}
