// Helpers for building skin sprite sheets from code: ASCII pixel art and
// simple shapes become RGBA frames, get packed into one sheet, and the sheet
// is written as a PNG with Node's zlib (no other dependencies).
import { deflateSync } from "node:zlib";

/** A frame: { w, h, px: Uint8Array RGBA }. */
export function blank(w, h) {
  return { w, h, px: new Uint8Array(w * h * 4) };
}

function rgba(hex) {
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex);
  if (!m) throw new Error(`bad color ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, m[2] ? parseInt(m[2], 16) : 255];
}

export function set(f, x, y, hex) {
  if (x < 0 || y < 0 || x >= f.w || y >= f.h || !hex) return;
  const [r, g, b, a] = rgba(hex);
  const i = (y * f.w + x) * 4;
  f.px.set([r, g, b, a], i);
}

/** ASCII rows -> frame. "." (or any char missing from the palette) is transparent. */
export function art(rows, palette) {
  const w = rows[0].length;
  rows.forEach((r, i) => {
    if (r.length !== w) throw new Error(`row ${i} is ${r.length} wide, expected ${w}: "${r}"`);
  });
  const f = blank(w, rows.length);
  rows.forEach((r, y) => [...r].forEach((c, x) => set(f, x, y, palette[c])));
  return f;
}

/** Same art with some palette letters swapped. */
export function recolor(rows, swap) {
  return rows.map((r) => [...r].map((c) => swap[c] ?? c).join(""));
}

/** Shift rows down by `n` (for a bobbing second frame). */
export function bob(rows, n = 1) {
  const empty = ".".repeat(rows[0].length);
  return [...Array(n).fill(empty), ...rows.slice(0, rows.length - n)];
}

/** Filled circle with an optional rim color. */
export function disc(f, cx, cy, r, fill, rim) {
  for (let y = 0; y < f.h; y++)
    for (let x = 0; x < f.w; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d <= r) set(f, x, y, rim && d > r - 1.2 ? rim : fill);
    }
  return f;
}

/** A burst: `n` frames growing from the center, hot in the middle, thinning out at the end. */
export function burst(size, n, colors) {
  const frames = [];
  const c = size / 2;
  for (let i = 0; i < n; i++) {
    const f = blank(size, size);
    const outer = (c - 0.5) * (0.35 + (0.65 * i) / (n - 1));
    const inner = i >= n - 2 ? outer * 0.5 : 0;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
        if (d > outer || d < inner) continue;
        // Ragged rim, and the last frames break up as the burst fades.
        if (d > outer - 1.5 && (x + y + i) % 2) continue;
        if (i >= n - 2 && (x * 7 + y * 3 + i) % 3 === 0) continue;
        const k = Math.min(colors.length - 1, Math.floor((d / outer) * (colors.length - 1) + i * 0.4));
        set(f, x, y, colors[k]);
      }
    frames.push(f);
  }
  return frames;
}

// ---------- sheet packing ----------

/**
 * sprites: { name: frame | frame[] } -> { sheet: frame, rects }. Frames of
 * one sprite sit side by side; sprites are shelf-packed in rows.
 */
export function pack(sprites, width = 256) {
  const items = Object.entries(sprites).map(([name, v]) => {
    const frames = Array.isArray(v) ? v : [v];
    const { w, h } = frames[0];
    frames.forEach((f, i) => {
      if (f.w !== w || f.h !== h) throw new Error(`${name} frame ${i} is ${f.w}x${f.h}, expected ${w}x${h}`);
    });
    return { name, frames, w, h };
  });
  items.sort((a, b) => b.h - a.h || a.name.localeCompare(b.name));
  const rects = {};
  let x = 0, y = 0, shelf = 0;
  for (const it of items) {
    const total = it.w * it.frames.length;
    if (total > width) throw new Error(`${it.name} is wider than the sheet`);
    if (x + total > width) {
      x = 0;
      y += shelf + 1;
      shelf = 0;
    }
    rects[it.name] = { x, y, w: it.w, h: it.h, ...(it.frames.length > 1 ? { frames: it.frames.length } : {}) };
    it.at = { x, y };
    x += total + 1;
    shelf = Math.max(shelf, it.h);
  }
  const sheet = blank(width, y + shelf);
  for (const it of items)
    it.frames.forEach((f, i) => {
      for (let fy = 0; fy < f.h; fy++)
        for (let fx = 0; fx < f.w; fx++) {
          const s = (fy * f.w + fx) * 4;
          const d = ((it.at.y + fy) * sheet.w + it.at.x + i * f.w + fx) * 4;
          sheet.px.set(f.px.subarray(s, s + 4), d);
        }
    });
  // Keep the manifest readable: sorted by name.
  const sorted = Object.fromEntries(Object.keys(rects).sort().map((k) => [k, rects[k]]));
  return { sheet, rects: sorted };
}

// ---------- PNG ----------

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

export function png(f) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(f.w, 0);
  ihdr.writeUInt32BE(f.h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA, no interlace
  const raw = Buffer.alloc((f.w * 4 + 1) * f.h);
  for (let y = 0; y < f.h; y++) Buffer.from(f.px.buffer, y * f.w * 4, f.w * 4).copy(raw, y * (f.w * 4 + 1) + 1);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
