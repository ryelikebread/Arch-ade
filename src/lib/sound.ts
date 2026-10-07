// Sound settings and the station list, kept free of Web Audio so they can be tested.

import { SONGS } from "../audio/music";

export const MY_MUSIC = "my-music";

export interface Station {
  id: string;
  name: string;
}

export interface SoundSettings {
  station: string;
  /** Music playing (true) or paused. */
  playing: boolean;
  musicMuted: boolean;
  /** 0..10 */
  musicVolume: number;
  sfxMuted: boolean;
  /** 0..10 */
  sfxVolume: number;
}

/** One station per built-in song, then the user's own music folder. */
export function stations(): Station[] {
  const out: Station[] = [];
  for (const s of SONGS) if (!out.some((x) => x.name === s.station)) out.push({ id: s.id, name: s.station });
  out.push({ id: MY_MUSIC, name: "My Music" });
  return out;
}

const level = (v: unknown, dflt: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(10, Math.round(v))) : dflt);

/** Saved settings with anything missing or invalid replaced by the defaults. Music starts paused. */
export function normalizeSound(raw: unknown): SoundSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const ids = stations().map((s) => s.id);
  return {
    station: typeof r.station === "string" && ids.includes(r.station) ? r.station : ids[0],
    playing: r.playing === true,
    musicMuted: r.musicMuted === true,
    musicVolume: level(r.musicVolume, 6),
    sfxMuted: r.sfxMuted === true,
    sfxVolume: level(r.sfxVolume, 7),
  };
}

/** The station before or after `id`, wrapping around. */
export function stepStation(id: string, dir: 1 | -1): string {
  const list = stations();
  const i = Math.max(0, list.findIndex((s) => s.id === id));
  return list[(i + dir + list.length) % list.length].id;
}

