// Draws a skin on a canvas. Nothing runs unless something moves: an action
// animation ticks at up to 30fps, scenery that only flickers ticks at its
// own (lower) rate, a still scene is drawn once, and everything stops while
// the window is hidden or minimized.

import { getCurrentWindow } from "@tauri-apps/api/window";
import { drawText, textWidth } from "../pixel/font";
import { kindIcon } from "../pixel/sprites";
import type { Kind } from "../types";
import { caption, frameAt, poseAt, type Animation, type Captions, type SkinEvent, type SkinManifest, type Track } from "./format";

export const MAX_FPS = 30;
const FILE_PX = 16;

export interface LoadedSkin {
  manifest: SkinManifest;
  sheet: HTMLImageElement;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("sprite sheet could not be loaded"));
    img.src = src;
  });
}

interface Playing {
  anim: Animation;
  started: number;
  kind: Kind;
  captions: Captions;
}

export class Stage {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private playing: Playing | null = null;
  private restKind: Kind | null = null;
  private icons = new Map<Kind, HTMLImageElement>();
  private timer = 0;
  private raf = 0;
  private hidden = document.hidden;
  private idleFps: number;
  private cleanup: (() => void)[] = [];

  constructor(private skin: LoadedSkin) {
    const [w, h] = skin.manifest.size;
    this.canvas = document.createElement("canvas");
    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.className = "skin-stage";
    this.ctx = this.canvas.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;
    this.idleFps = Math.min(MAX_FPS, Math.max(0, ...(skin.manifest.scene ?? []).map((p) => (this.frames(p.sprite) > 1 ? p.fps ?? 0 : 0))));

    const onVis = () => this.setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    this.cleanup.push(() => document.removeEventListener("visibilitychange", onVis));
    // Minimizing doesn't always fire visibilitychange in a webview.
    getCurrentWindow()
      .onResized(async () => this.setHidden(document.hidden || (await getCurrentWindow().isMinimized())))
      .then((un) => this.cleanup.push(un))
      .catch(() => {});
    this.wake();
  }

  /** The file now waiting for a decision. */
  setFile(kind: Kind | null) {
    this.restKind = kind;
    if (kind) this.icon(kind);
    this.wake();
  }

  /** Play the animation for an action on a file; falls back to "trash" for "delete". */
  play(event: SkinEvent, kind: Kind, captions: Captions) {
    const anims = this.skin.manifest.animations;
    const anim = anims[event] ?? (event === "delete" ? anims.trash : undefined);
    if (!anim) return;
    this.icon(kind);
    this.playing = { anim, started: performance.now(), kind, captions };
    this.wake();
  }

  get busy(): boolean {
    return this.playing !== null;
  }

  destroy() {
    this.stop();
    this.cleanup.forEach((f) => f());
    this.canvas.remove();
  }

  private setHidden(hidden: boolean) {
    if (hidden === this.hidden) return;
    this.hidden = hidden;
    if (hidden) this.stop();
    else this.wake();
  }

  private stop() {
    clearTimeout(this.timer);
    cancelAnimationFrame(this.raf);
    this.timer = this.raf = 0;
  }

  /** Draw now and schedule the next frame only if something will change. */
  private wake = () => {
    this.stop();
    if (this.hidden) return;
    const now = performance.now();
    if (this.playing && now - this.playing.started >= this.playing.anim.duration) this.playing = null;
    this.draw(now);
    const fps = this.playing ? MAX_FPS : this.idleFps;
    if (!fps) return;
    // setTimeout paces to the cap; rAF lines the draw up with the display.
    this.timer = window.setTimeout(() => {
      this.raf = requestAnimationFrame(this.wake);
    }, 1000 / fps);
  };

  private frames(sprite: string): number {
    return this.skin.manifest.sprites[sprite]?.frames ?? 1;
  }

  private icon(kind: Kind): HTMLImageElement {
    let img = this.icons.get(kind);
    if (!img) {
      img = new Image();
      img.onload = () => this.wake();
      img.src = kindIcon(kind);
      this.icons.set(kind, img);
    }
    return img;
  }

  private draw(now: number) {
    const m = this.skin.manifest;
    const [w, h] = m.size;
    const ctx = this.ctx;
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, w, h);
    const bands = m.bands ?? [];
    bands.forEach(([y, color], i) => {
      ctx.fillStyle = color;
      ctx.fillRect(0, y, w, (bands[i + 1]?.[0] ?? h) - y);
    });
    for (const p of m.scene ?? []) this.sprite(p.sprite, frameAt(this.frames(p.sprite), p.fps, now), p.x, p.y, 1, 1);

    if (!this.playing) {
      if (this.restKind) this.fileIcon(this.restKind, m.file[0], m.file[1], 1, 1);
      return;
    }
    const { anim, started, kind, captions } = this.playing;
    const ms = now - started;
    const p = Math.min(1, ms / anim.duration);
    for (const t of anim.tracks) this.track(t, p, ms - (t.keys[0]?.t ?? 0) * anim.duration, kind, captions);
  }

  /** `ms` is time since this track appeared. */
  private track(t: Track, p: number, ms: number, kind: Kind, captions: Captions) {
    const pose = poseAt(t.keys, p);
    if (!pose || pose.alpha <= 0) return;
    if (t.text !== undefined) {
      const text = caption(t.text, captions);
      const x = t.align === "center" ? pose.x - textWidth(text) / 2 : pose.x;
      const ctx = this.ctx;
      ctx.save();
      if (t.clip) {
        ctx.beginPath();
        ctx.rect(...t.clip);
        ctx.clip();
      }
      ctx.globalAlpha = pose.alpha;
      drawText(ctx, text, Math.round(x + 1), Math.round(pose.y + 1), "#000000");
      drawText(ctx, text, Math.round(x), Math.round(pose.y), t.color ?? "#ffffff");
      ctx.restore();
      return;
    }
    if (t.sprite === "file") this.fileIcon(kind, pose.x, pose.y, pose.scale, pose.alpha);
    else if (t.sprite) this.sprite(t.sprite, frameAt(this.frames(t.sprite), t.fps, ms, t.once), pose.x, pose.y, pose.scale, pose.alpha);
  }

  private sprite(name: string, frame: number, x: number, y: number, scale: number, alpha: number) {
    const r = this.skin.manifest.sprites[name];
    if (!r) return;
    this.ctx.globalAlpha = alpha;
    this.ctx.drawImage(this.skin.sheet, r.x + frame * r.w, r.y, r.w, r.h, Math.round(x), Math.round(y), Math.round(r.w * scale), Math.round(r.h * scale));
    this.ctx.globalAlpha = 1;
  }

  private fileIcon(kind: Kind, x: number, y: number, scale: number, alpha: number) {
    const img = this.icon(kind);
    if (!img.complete || !img.naturalWidth) return;
    const s = Math.round(FILE_PX * scale);
    // Scale around the icon's center so shrinking reads as moving away.
    const off = (FILE_PX - s) / 2;
    this.ctx.globalAlpha = alpha;
    this.ctx.drawImage(img, Math.round(x + off), Math.round(y + off), s, s);
    this.ctx.globalAlpha = 1;
  }
}
