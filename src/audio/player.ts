// Plays the background music and the skins' sound effects through one
// AudioContext. The context is suspended whenever nothing is audible (music
// paused or muted and no effect playing) and while the window is hidden, so
// sound costs nothing when it's off.

import { api } from "../api";
import { onWindowHidden } from "../lib/hidden";
import { normalizeSound, MY_MUSIC, stations, type SoundSettings, type Station } from "../lib/sound";
import { renderSong, SONGS, songsOn, type Song } from "./music";
import { renderSfx, type SfxName } from "./sfx";

/** Built-in sounds are rendered at this rate; plenty for chiptune. */
const RATE = 22050;
/** Times each song plays through before a multi-song station moves on. */
const SONG_PLAYS = 2;

export interface NowPlaying {
  station: Station;
  title: string;
  /** Tracks found in the music folder, and files that couldn't be used. */
  myMusic: { dir: string; tracks: string[]; problems: string[] };
}

type Listener = () => void;

class Player {
  settings: SoundSettings = normalizeSound(undefined);
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private songs = new Map<string, AudioBuffer>();
  private sfx = new Map<SfxName, AudioBuffer>();
  private loopSrc: AudioBufferSourceNode | null = null;
  private loopStarted = 0;
  private loopOffset = 0;
  private loopSong: Song | null = null;
  private el: HTMLAudioElement | null = null;
  private elUrl = "";
  private trackIndex = 0;
  /** Position in a built-in station's playlist. */
  private songIndex = 0;
  /** A skin's theme playing instead of the station (File by File). */
  private theme: Song | null = null;
  private errorsInARow = 0;
  private live = new Set<AudioBufferSourceNode>();
  private hidden = document.hidden;
  private listeners = new Set<Listener>();
  private waitingForGesture = false;
  my: NowPlaying["myMusic"] = { dir: "", tracks: [], problems: [] };
  private allFailed = false;

  constructor() {
    onWindowHidden((h) => {
      if (h === this.hidden) return;
      this.hidden = h;
      if (h) this.stopSfx();
      this.sync();
    });
  }

  /** Load saved settings and the music folder; start the music if it was playing. */
  async init(raw: unknown) {
    this.settings = normalizeSound(raw);
    await this.rescan();
    this.sync();
  }

  async rescan() {
    try {
      const l = await api.userMusic();
      this.my = { dir: l.dir, tracks: l.tracks.map((t) => t.name), problems: l.problems };
    } catch (e) {
      this.my = { dir: "", tracks: [], problems: [String(e)] };
    }
    this.allFailed = false;
    this.errorsInARow = 0;
    this.trackIndex = Math.min(this.trackIndex, Math.max(0, this.my.tracks.length - 1));
    this.emit();
  }

  /** The song or track on the current station, playing or not. */
  get title(): string {
    if (this.station.id !== MY_MUSIC || this.theme) return this.currentSong().title;
    if (this.allFailed) return "No playable tracks";
    const name = this.my.tracks[this.trackIndex];
    return name ? name.replace(/\.[^.]+$/, "") : "No tracks yet";
  }

  /** 1-based position on the station. */
  get trackNumber(): number {
    return this.station.id === MY_MUSIC ? this.trackIndex + 1 : this.songIndex + 1;
  }

  /** How many songs or tracks the station has. */
  get trackCount(): number {
    return this.station.id === MY_MUSIC ? this.my.tracks.length : songsOn(this.station.name).length;
  }

  /** Play a skin's theme song (by id) instead of a built-in station while it's set; null goes back. */
  setTheme(songId: string | null) {
    const song = (songId && SONGS.find((s) => s.id === songId)) || null;
    if (song === this.theme) return;
    this.theme = song;
    this.stopMusic();
    this.loopOffset = 0;
    this.emit();
    this.sync();
  }

  private currentSong(): Song {
    if (this.theme && this.station.id !== MY_MUSIC) return this.theme;
    const list = songsOn(this.station.name);
    return list[this.songIndex % Math.max(1, list.length)] ?? SONGS[0];
  }

  get stations(): Station[] {
    return stations();
  }

  get station(): Station {
    return this.stations.find((s) => s.id === this.settings.station) ?? this.stations[0];
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  /** Change settings, save them and apply them. */
  set(patch: Partial<SoundSettings>) {
    const stationChanged = patch.station !== undefined && patch.station !== this.settings.station;
    this.settings = normalizeSound({ ...this.settings, ...patch });
    api.setSetting("sound", this.settings).catch(() => {});
    if (stationChanged) {
      this.stopMusic();
      this.loopOffset = 0;
      this.trackIndex = 0;
      this.songIndex = 0;
      this.errorsInARow = 0;
      this.allFailed = false;
    }
    this.sync();
  }

  /** Skip to the next song on the station (or track on My Music). */
  nextTrack() {
    if (this.station.id === MY_MUSIC) {
      if (!this.my.tracks.length) return;
      this.trackIndex = (this.trackIndex + 1) % this.my.tracks.length;
    } else {
      if (this.theme) return;
      this.songIndex = (this.songIndex + 1) % Math.max(1, songsOn(this.station.name).length);
      this.loopOffset = 0;
    }
    this.stopMusic();
    this.emit();
    this.sync();
  }

  /** Play a skin's cues for one animation: each effect at its point (0..1) in it. */
  cue(cues: { sfx: SfxName; at: number }[], durationMs: number) {
    this.stopSfx();
    if (!this.sfxAudible() || this.hidden || !cues.length) return;
    const ctx = this.context();
    if (!ctx) return;
    ctx.resume().then(() => {
      const now = ctx.currentTime;
      for (const c of cues) this.playSfx(c.sfx, now + (c.at * durationMs) / 1000);
    }, () => {});
  }

  /** One effect right now (the menu's sound test). */
  test(name: SfxName) {
    this.cue([{ sfx: name, at: 0 }], 0);
  }

  stopSfx() {
    for (const s of this.live) {
      try {
        s.stop();
      } catch {
        // already stopped
      }
    }
    this.live.clear();
  }

  // ---------- internals ----------

  private emit() {
    this.listeners.forEach((l) => l());
  }

  private musicAudible() {
    return this.settings.playing && !this.settings.musicMuted && this.settings.musicVolume > 0;
  }

  private sfxAudible() {
    return !this.settings.sfxMuted && this.settings.sfxVolume > 0;
  }

  private context(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      this.ctx = new AudioContext();
    } catch {
      return null;
    }
    this.musicGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.musicGain.connect(this.ctx.destination);
    this.sfxGain.connect(this.ctx.destination);
    this.applyVolumes();
    return this.ctx;
  }

  private applyVolumes() {
    // Volume steps feel even on a squared curve.
    const level = (v: number, muted: boolean) => (muted ? 0 : (v / 10) ** 2);
    if (this.musicGain) this.musicGain.gain.value = level(this.settings.musicVolume, this.settings.musicMuted) * 0.8;
    if (this.sfxGain) this.sfxGain.gain.value = level(this.settings.sfxVolume, this.settings.sfxMuted);
  }

  /** Bring playback in line with the settings and the window. */
  private sync() {
    this.applyVolumes();
    const want = this.musicAudible() && !this.hidden;
    if (want) this.startMusic();
    else this.pauseMusic();
    this.idle();
    this.emit();
  }

  /** Suspend the context when nothing can be heard. */
  private idle() {
    const ctx = this.ctx;
    if (!ctx) return;
    const needed = !this.hidden && ((this.musicAudible() && (this.loopSrc || this.el)) || this.live.size > 0);
    if (needed) {
      if (ctx.state !== "running") ctx.resume().then(() => this.afterResume(), () => {});
    } else if (ctx.state === "running") ctx.suspend().catch(() => {});
  }

  /** Webviews can refuse to start audio before the user clicks or presses a key. */
  private afterResume() {
    if (this.ctx?.state === "running" || this.waitingForGesture) return;
    this.waitingForGesture = true;
    const go = () => {
      this.waitingForGesture = false;
      window.removeEventListener("pointerdown", go, true);
      window.removeEventListener("keydown", go, true);
      this.sync();
      this.el?.play().catch(() => {});
    };
    window.addEventListener("pointerdown", go, true);
    window.addEventListener("keydown", go, true);
  }

  private startMusic() {
    const ctx = this.context();
    if (!ctx) return;
    const st = this.station;
    if (st.id === MY_MUSIC) return void this.startTrack(ctx);
    const song = this.currentSong();
    if (this.loopSrc && this.loopSong === song) return;
    this.stopMusic();
    let buf = this.songs.get(song.id);
    if (!buf) {
      const data = renderSong(song, RATE);
      buf = ctx.createBuffer(1, data.length, RATE);
      buf.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
      this.songs.set(song.id, buf);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(this.musicGain!);
    const offset = this.loopSong === song ? this.loopOffset % buf.duration : 0;
    src.start(0, offset);
    // A station with several songs plays each twice through, then the next.
    if (!this.theme && songsOn(st.name).length > 1) {
      src.stop(ctx.currentTime + SONG_PLAYS * buf.duration - offset);
      src.onended = () => {
        if (this.loopSrc !== src) return; // paused or switched, not finished
        this.loopSrc = null;
        this.songIndex = (this.songIndex + 1) % songsOn(st.name).length;
        this.loopOffset = 0;
        this.emit();
        this.sync();
      };
    }
    this.loopSrc = src;
    this.loopSong = song;
    this.loopStarted = ctx.currentTime - offset;
  }

  private async startTrack(ctx: AudioContext) {
    const name = this.my.tracks[this.trackIndex];
    if (!name || this.allFailed) return;
    if (this.el && this.el.dataset.name === name) {
      if (this.el.paused) this.el.play().catch(() => {});
      return;
    }
    this.stopMusic();
    const el = new Audio();
    el.dataset.name = name;
    this.el = el;
    ctx.createMediaElementSource(el).connect(this.musicGain!);
    el.addEventListener("ended", () => this.nextTrack());
    el.addEventListener("playing", () => (this.errorsInARow = 0));
    el.addEventListener("error", () => this.trackFailed(name));
    try {
      const bytes = await api.userMusicFile(name);
      if (this.el !== el) return; // switched away while loading
      this.elUrl = URL.createObjectURL(new Blob([bytes]));
      el.src = this.elUrl;
      if (this.musicAudible() && !this.hidden) await el.play();
    } catch {
      if (this.el === el && el.error == null) this.trackFailed(name);
    }
  }

  private trackFailed(name: string) {
    const msg = `${name} couldn't be played (unsupported or damaged file)`;
    if (!this.my.problems.includes(msg)) this.my.problems.push(msg);
    this.errorsInARow++;
    this.stopMusic();
    if (this.errorsInARow >= this.my.tracks.length) {
      this.allFailed = true;
      this.emit();
      return;
    }
    this.trackIndex = (this.trackIndex + 1) % this.my.tracks.length;
    this.sync();
  }

  private pauseMusic() {
    if (this.loopSrc && this.ctx) {
      this.loopOffset = this.ctx.currentTime - this.loopStarted;
      this.loopSrc.stop();
      this.loopSrc.disconnect();
      this.loopSrc = null;
    }
    this.el?.pause();
  }

  private stopMusic() {
    this.pauseMusic();
    if (this.el) {
      this.el.removeAttribute("src");
      this.el.load();
      this.el = null;
    }
    if (this.elUrl) URL.revokeObjectURL(this.elUrl);
    this.elUrl = "";
  }

  private playSfx(name: SfxName, when: number) {
    const ctx = this.ctx!;
    let buf = this.sfx.get(name);
    if (!buf) {
      const data = renderSfx(name, RATE);
      buf = ctx.createBuffer(1, data.length, RATE);
      buf.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
      this.sfx.set(name, buf);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.sfxGain!);
    src.onended = () => {
      this.live.delete(src);
      src.disconnect();
      this.idle();
    };
    this.live.add(src);
    src.start(when);
  }
}

export const sound = new Player();
