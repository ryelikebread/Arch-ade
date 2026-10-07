// A tiny chiptune synthesizer. Music and sound effects are computed here as
// raw samples (no audio files, no network), then handed to Web Audio as
// buffers. Pure functions, so they can be tested without a sound card.

export type Wave = "square" | "triangle" | "saw" | "sine" | "noise";

/** One sound: a note, a drum hit, a sweep. Times are in seconds. */
export interface Voice {
  wave: Wave;
  start: number;
  dur: number;
  /** Pitch in Hz; for noise, how often a new random value is picked. */
  f0: number;
  /** Pitch at the end; it slides there exponentially. */
  f1?: number;
  vol?: number;
  /** Pulse width for square waves (0.5 is a plain square). */
  duty?: number;
  attack?: number;
  release?: number;
  /** Exponential fade per second after the attack (0 holds the level). */
  decay?: number;
  /** Vibrato: [rate in Hz, depth in semitones]. */
  vib?: [number, number];
  /** One-pole low-pass cutoff in Hz, from start to end (softens noise). */
  lp?: [number, number];
}

const TAU = Math.PI * 2;

/** Deterministic noise, so a sound renders the same every time. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 0xffffffff) * 2 - 1;
  };
}

/**
 * Mix voices into `seconds` of mono samples. With `loop`, sound that runs
 * past the end wraps to the start, so the buffer loops without a seam.
 */
export function render(voices: Voice[], sampleRate: number, seconds: number, loop = false): Float32Array {
  const n = Math.max(1, Math.round(seconds * sampleRate));
  const out = new Float32Array(n);
  voices.forEach((v, idx) => {
    const len = Math.round(v.dur * sampleRate);
    const first = Math.round(v.start * sampleRate);
    const vol = v.vol ?? 0.5;
    const attack = Math.max(1, Math.round((v.attack ?? 0.003) * sampleRate));
    const release = Math.max(1, Math.round((v.release ?? 0.01) * sampleRate));
    const f1 = v.f1 ?? v.f0;
    const duty = v.duty ?? 0.5;
    const noise = rng(idx * 7919 + Math.round(v.f0));
    let phase = 0;
    let held = noise();
    let lpY = 0;
    for (let i = 0; i < len; i++) {
      const at = first + i;
      if (at >= n && !loop) break;
      const t = i / sampleRate;
      const u = len > 1 ? i / (len - 1) : 0;
      let f = v.f0 * Math.pow(f1 / v.f0, u);
      if (v.vib) f *= Math.pow(2, (v.vib[1] * Math.sin(TAU * v.vib[0] * t)) / 12);
      phase += f / sampleRate;
      let s: number;
      switch (v.wave) {
        case "square": s = phase % 1 < duty ? 1 : -1; break;
        case "triangle": s = 4 * Math.abs((phase % 1) - 0.5) - 1; break;
        case "saw": s = 2 * (phase % 1) - 1; break;
        case "sine": s = Math.sin(TAU * phase); break;
        case "noise":
          if (phase >= 1) {
            phase %= 1;
            held = noise();
          }
          s = held;
          break;
      }
      if (v.lp) {
        const cut = v.lp[0] * Math.pow(v.lp[1] / v.lp[0], u);
        const a = 1 - Math.exp((-TAU * cut) / sampleRate);
        lpY += a * (s - lpY);
        s = lpY;
      }
      let amp = i < attack ? i / attack : Math.exp(-(v.decay ?? 0) * (t - attack / sampleRate));
      if (i > len - release) amp *= (len - i) / release;
      const j = loop ? ((at % n) + n) % n : at;
      if (j >= 0 && j < n) out[j] += s * amp * vol;
    }
  });
  return out;
}

/** Keep peaks under 1 with a soft knee instead of hard clipping. */
export function soften(buf: Float32Array): Float32Array {
  for (let i = 0; i < buf.length; i++) buf[i] = Math.tanh(buf[i]);
  return buf;
}

// ---------- notes ----------

const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "A4" → 440, "C#5" → 554.37; null for a rest ("-"). */
export function noteHz(name: string): number | null {
  if (name === "-") return null;
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  const semis = NOTE[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + (Number(m[3]) - 4) * 12 - 9;
  return 440 * Math.pow(2, semis / 12);
}

/** "A4:2 C5:4 -:2" → notes with lengths in steps (16th notes). */
export function parseLine(line: string): { hz: number | null; steps: number }[] {
  return line
    .trim()
    .split(/\s+/)
    .map((tok) => {
      const [name, len] = tok.split(":");
      return { hz: noteHz(name), steps: Number(len ?? 1) };
    });
}
