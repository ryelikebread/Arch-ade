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
  /** Text shadow color, or false for none (default black). */
  shadow?: string | false;
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
  /**
   * Scenery that remembers the session: shows `sprites[n]`, where n counts
   * the decisions in `on` so far (Undo takes one back), staying on the last.
   * `sprite` is shown while n is 0. Example: a soup pot that fills up as
   * files are kept.
   */
  tally?: { on: SkinEvent[]; sprites: string[] };
}

export interface Animation {
  /** Milliseconds. */
  duration: number;
  tracks: Track[];
  /** Sounds for this animation alone, instead of the skin's `sounds` for the action. */
  sounds?: Cue[];
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
  /** More animations per action; each time, one of the main one and these is picked at random. */
  variants?: Partial<Record<SkinEvent, Animation[]>>;
  /** Sound effects per action; "delete" falls back to "trash". Optional. */
  sounds?: Partial<Record<SkinEvent, Cue[]>>;
  /** A built-in song id to play while this skin is on (when music is playing). */
  music?: string;
  /**
   * A bonus animation after every `every`-th decision in `on` (one of
   * `animations`, picked at random), played right after that decision's own.
   * Example: after every 5th move the crew escapes in the van.
   */
  encore?: Encore;
}

export interface Encore {
  on: SkinEvent[];
  every: number;
  animations: Animation[];
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
      else if (p.tally !== undefined) {
        const t = p.tally;
        if (!t || !Array.isArray(t.on) || !t.on.length || !t.on.every((e) => SKIN_EVENTS.includes(e))) errs.push(`scene ${i + 1}: tally.on must list actions`);
        if (!t || !Array.isArray(t.sprites) || !t.sprites.length || t.sprites.length > 16 || !t.sprites.every((s) => typeof s === "string" && known(s) && s !== "file"))
          errs.push(`scene ${i + 1}: tally.sprites must be 1..16 known sprites`);
      }
    });
  const file = m.file as unknown[];
  if (!Array.isArray(file) || file.length !== 2 || !inStage(file[0], file[1])) errs.push("file must be [x, y]");

  const checkCues = (where: string, cues: unknown) => {
    if (!Array.isArray(cues) || cues.length > 16) return void errs.push(`${where} must be a list of up to 16 cues`);
    cues.forEach((c: Cue, i) => {
      if (!c || !isSfx(c.sfx)) errs.push(`${where} cue ${i + 1}: unknown sound ${c?.sfx}`);
      else if (!num(c.at, 0, 1)) errs.push(`${where} cue ${i + 1}: at must be 0..1`);
    });
  };
  const checkAnim = (ev: string, a: Animation) => {
    if (!a || !num(a.duration, 100, 10000)) errs.push(`${ev}: duration must be 100..10000 ms`);
    if (a?.sounds !== undefined) checkCues(`${ev} sounds`, a.sounds);
    if (!a || !Array.isArray(a.tracks) || a.tracks.length > 64) return void errs.push(`${ev}: tracks must be a list of up to 64`);
    a.tracks.forEach((t, i) => {
      const where = `${ev} track ${i + 1}`;
      if (!t || (typeof t.sprite === "string") === (typeof t.text === "string")) errs.push(`${where}: needs either sprite or text`);
      else if (t.sprite !== undefined && !known(t.sprite)) errs.push(`${where}: unknown sprite ${t.sprite}`);
      if (t?.text !== undefined && (t.text.length > 80 || (t.color !== undefined && !COLOR.test(t.color)))) errs.push(`${where}: text too long or bad color`);
      if (t?.fps !== undefined && !num(t.fps, 0, 30)) errs.push(`${where}: fps must be 0..30`);
      if (t?.shadow !== undefined && t.shadow !== false && !(typeof t.shadow === "string" && COLOR.test(t.shadow))) errs.push(`${where}: shadow must be a color or false`);
      if (t?.once !== undefined && typeof t.once !== "boolean") errs.push(`${where}: once must be true or false`);
      if (t?.clip !== undefined && !(Array.isArray(t.clip) && t.clip.length === 4 && t.clip.every((v) => num(v, -W, 2 * W)))) errs.push(`${where}: clip must be [x, y, w, h]`);
      const keys = t?.keys;
      if (!Array.isArray(keys) || keys.length < 1 || keys.length > 64) return void errs.push(`${where}: needs 1..64 keys`);
      keys.forEach((k, j) => {
        const ok = k && num(k.t, 0, 1) && inStage(k.x, k.y) && (j === 0 || k.t >= keys[j - 1].t)
          && (k.alpha === undefined || num(k.alpha, 0, 1)) && (k.scale === undefined || num(k.scale, 0, 8))
          && (k.arc === undefined || num(k.arc, -H, H)) && (k.ease === undefined || ["linear", "in", "out", "inOut"].includes(k.ease));
        if (!ok) errs.push(`${where} key ${j + 1}: t 0..1 in order, x/y on stage, alpha 0..1, scale 0..8`);
      });
    });
  };

  const anims = m.animations as Record<string, Animation> | undefined;
  if (!anims || typeof anims !== "object") errs.push("animations is required");
  else {
    for (const ev of REQUIRED) if (!anims[ev]) errs.push(`animations.${ev} is required`);
    for (const [ev, a] of Object.entries(anims)) {
      if (!SKIN_EVENTS.includes(ev as SkinEvent)) errs.push(`unknown animation ${ev}`);
      else checkAnim(ev, a);
    }
  }
  if (m.variants !== undefined) {
    const variants = m.variants as Record<string, unknown>;
    if (!variants || typeof variants !== "object" || Array.isArray(variants)) errs.push("variants must be an object of action: [animations]");
    else
      for (const [ev, list] of Object.entries(variants)) {
        if (!SKIN_EVENTS.includes(ev as SkinEvent)) errs.push(`variants: unknown action ${ev}`);
        else if (!Array.isArray(list) || list.length < 1 || list.length > 8) errs.push(`variants.${ev} must be a list of 1..8 animations`);
        else list.forEach((a, i) => checkAnim(`${ev} variant ${i + 1}`, a as Animation));
      }
  }
  if (m.encore !== undefined) {
    const e = m.encore as Encore;
    if (!e || !Array.isArray(e.on) || !e.on.length || !e.on.every((v) => SKIN_EVENTS.includes(v))) errs.push("encore.on must list actions");
    if (!e || !int(e.every, 1, 100)) errs.push("encore.every must be a whole number 1..100");
    if (!e || !Array.isArray(e.animations) || e.animations.length < 1 || e.animations.length > 8) errs.push("encore.animations must be a list of 1..8 animations");
    else e.animations.forEach((a, i) => checkAnim(`encore ${i + 1}`, a));
  }
  if (m.music !== undefined && (typeof m.music !== "string" || !/^[a-z0-9-]{1,40}$/.test(m.music))) errs.push("music must be a song id");
  if (m.sounds !== undefined) {
    const sounds = m.sounds as Record<string, unknown>;
    if (!sounds || typeof sounds !== "object" || Array.isArray(sounds)) errs.push("sounds must be an object of action: [cues]");
    else
      for (const [ev, cues] of Object.entries(sounds)) {
        if (!SKIN_EVENTS.includes(ev as SkinEvent)) errs.push(`sounds: unknown action ${ev}`);
        else checkCues(`sounds.${ev}`, cues);
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

/** The sprite a scene prop shows after `counts` decisions of each kind. */
export function propSprite(p: Prop, counts: Partial<Record<SkinEvent, number>>): string {
  if (!p.tally) return p.sprite;
  const n = p.tally.on.reduce((a, e) => a + (counts[e] ?? 0), 0);
  return n <= 0 ? p.sprite : p.tally.sprites[Math.min(n, p.tally.sprites.length) - 1];
}

/** The animation and sounds for an action: "delete" falls back to "trash"; variants are picked by `pick` (0..1). */
export function animationFor(m: SkinManifest, event: SkinEvent, pick: number): { anim: Animation; cues: Cue[] } | null {
  const ev: SkinEvent = m.animations[event] ? event : event === "delete" ? "trash" : event;
  const main = m.animations[ev];
  if (!main) return null;
  const all = [main, ...(m.variants?.[ev] ?? [])];
  const anim = all[Math.min(all.length - 1, Math.floor(pick * all.length))];
  const cues = anim.sounds ?? m.sounds?.[event] ?? (event === "delete" ? m.sounds?.trash : undefined) ?? [];
  return { anim, cues };
}

/** The encore due after a decision, given the counts including it: picked by `pick` (0..1), or null. */
export function encoreFor(m: SkinManifest, event: SkinEvent, counts: Partial<Record<SkinEvent, number>>, pick: number): Animation | null {
  const e = m.encore;
  if (!e || !e.on.includes(event)) return null;
  const n = e.on.reduce((a, v) => a + (counts[v] ?? 0), 0);
  if (n <= 0 || n % e.every !== 0) return null;
  return e.animations[Math.min(e.animations.length - 1, Math.floor(pick * e.animations.length))];
}

export function caption(template: string, c: Captions): string {
  return template.replace(/\{(name|newName|dest|kind)\}/g, (_, k: keyof Captions) => c[k] ?? "");
}
