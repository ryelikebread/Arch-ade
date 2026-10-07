// The Sound menu, styled like an arcade cabinet's options screen: a list of
// rows driven by the arrow keys (or the mouse), a blinking cursor, and
// value pickers in ◀ ▶ brackets.

import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { sound } from "../audio/player";
import { SFX_NAMES, type SfxName } from "../audio/sfx";
import { MY_MUSIC, stepStation } from "../lib/sound";
import { h } from "./dom";

interface Row {
  label: string;
  value: () => Node | string;
  /** ← and → (or the brackets); defaults to `enter` for both. */
  step?: (dir: 1 | -1) => void;
  enter?: () => void;
  /** Value shown with ◀ ▶ around it. */
  picker?: boolean;
}

function meter(level: number): HTMLElement {
  return h(
    "span",
    { class: "meter", "aria-label": `${level} of 10` },
    ...Array.from({ length: 10 }, (_, i) => h("i", { class: i < level ? "on" : "" })),
  );
}

export function soundMenu() {
  let at = 0;
  let testSfx: SfxName = "chime";
  sound.rescan();
  const s = () => sound.settings;
  const onOff = (on: boolean, yes: string, no: string) => h("span", { class: on ? "on" : "off" }, on ? yes : no);

  const rows: Row[] = [
    {
      label: "Station",
      picker: true,
      value: () => sound.station.name,
      step: (d) => sound.set({ station: stepStation(s().station, d) }),
    },
    {
      label: "Now playing",
      value: () => {
        const n = sound.my.tracks.length;
        return sound.station.id === MY_MUSIC && n ? `${sound.title} (${sound.trackNumber}/${n})` : sound.title;
      },
      enter: () => sound.nextTrack(),
    },
    { label: "Music", picker: true, value: () => onOff(s().playing, "Playing", "Paused"), enter: () => sound.set({ playing: !s().playing }) },
    {
      label: "Music volume",
      value: () => meter(s().musicVolume),
      step: (d) => sound.set({ musicVolume: s().musicVolume + d }),
    },
    { label: "Music mute", picker: true, value: () => onOff(!s().musicMuted, "Off", "On"), enter: () => sound.set({ musicMuted: !s().musicMuted }) },
    { label: "Sound FX", picker: true, value: () => onOff(!s().sfxMuted, "On", "Muted"), enter: () => sound.set({ sfxMuted: !s().sfxMuted }) },
    {
      label: "FX volume",
      value: () => meter(s().sfxVolume),
      step: (d) => sound.set({ sfxVolume: s().sfxVolume + d }),
    },
    {
      label: "Sound test",
      picker: true,
      value: () => testSfx,
      step: (d) => {
        testSfx = SFX_NAMES[(SFX_NAMES.indexOf(testSfx) + d + SFX_NAMES.length) % SFX_NAMES.length];
        sound.test(testSfx);
      },
      enter: () => sound.test(testSfx),
    },
    {
      label: "My music folder",
      value: () => "Show",
      enter: () => {
        if (sound.my.dir) revealItemInDir(sound.my.dir).catch(() => {});
      },
    },
    { label: "Exit", value: () => "", enter: () => close() },
  ];

  const list = h("div", { class: "arcade-rows", role: "menu" });
  const info = h("div", { class: "arcade-info" });
  const dialog = h(
    "dialog",
    { class: "arcade", "aria-label": "Sound options" },
    h(
      "div",
      { class: "arcade-frame" },
      h("h2", {}, "Sound options"),
      list,
      info,
      h("div", { class: "arcade-keys" }, "↑↓ select   ←→ change   Enter OK   Esc exit"),
    ),
  );

  function draw() {
    list.replaceChildren(
      ...rows.map((r, i) => {
        const arrow = (d: 1 | -1, t: string) =>
          h("b", { class: "arrow", onclick: (ev: Event) => (ev.stopPropagation(), (at = i), act(d)) }, t);
        const val = r.value();
        return h(
          "div",
          {
            class: `arcade-row${i === at ? " sel" : ""}${r.label === "Exit" ? " exit" : ""}`,
            role: "menuitem",
            onclick: () => {
              at = i;
              act(0);
            },
          },
          h("span", { class: "cursor" }, i === at ? "▶" : ""),
          h("span", { class: "label" }, r.label),
          h("span", { class: "value" }, r.picker || r.step ? arrow(-1, "◀") : "", val, r.picker || r.step ? arrow(1, "▶") : ""),
        );
      }),
    );
    const notes: string[] = [];
    if (sound.station.id === MY_MUSIC) {
      notes.push(`Add your own .mp3, .m4a, .ogg, .wav or .flac files to the music folder (Show opens it), then reopen this menu.`);
      notes.push(...sound.my.problems.map((p) => `Skipped: ${p}`));
    } else notes.push("Built-in stations are original chiptune made for Arch-ade.");
    notes.push("Sound effects play in the Volcano and Space skins of File by File.");
    info.replaceChildren(...notes.map((n) => h("p", { class: n.startsWith("Skipped") ? "bad" : "" }, n)));
  }

  /** 0 = Enter/click, ±1 = ←/→. */
  function act(dir: 0 | 1 | -1) {
    const r = rows[at];
    if (dir && r.step) r.step(dir);
    else (r.enter ?? (() => r.step?.(1)))();
    draw();
  }

  function onKey(ev: KeyboardEvent) {
    const k = ev.key;
    if (k === "ArrowUp" || k === "ArrowDown") at = (at + (k === "ArrowUp" ? -1 : 1) + rows.length) % rows.length;
    else if (k === "ArrowLeft" || k === "ArrowRight") act(k === "ArrowLeft" ? -1 : 1);
    else if (k === "Enter" || k === " ") act(0);
    else if (k === "Escape") close();
    else return;
    ev.preventDefault();
    ev.stopPropagation();
    draw();
  }

  function close() {
    dialog.close();
  }

  const unsub = sound.subscribe(() => dialog.open && draw());
  dialog.addEventListener("keydown", onKey);
  dialog.addEventListener("cancel", (ev) => ev.preventDefault()); // Esc goes through onKey
  dialog.addEventListener("close", () => {
    unsub();
    dialog.remove();
  });
  document.body.append(dialog);
  draw();
  dialog.showModal();
  dialog.focus();
}
