// Space skin: keep = the rocket launches; trash = it explodes; move = a UFO
// beams the file up; rename = a news report of a new discovery.
// All art is original, drawn here.
import { art, blank, burst, disc, set } from "./lib.mjs";

const P = {
  k: "#0b0b1a", w: "#ffffff", X: "#b8c0d0", x: "#6a7088", r: "#e0403a", o: "#f08a24", y: "#ffd23f",
  u: "#4dd0ff", U: "#2a6fb0", g: "#6fdc5a", p: "#b56be0", q: "#6a3a9a", t: "#d9a066", n: "#3a2a2a",
  b: "#1c2340", s: "#2e3a5c",
};

const rocketBody = [
  "....rr....",
  "...rwwr...",
  "...wwww...",
  "..wwwwww..",
  "..wwuuww..",
  "..wuuuuw..",
  "..wwuuww..",
  "..wwwwww..",
  "..wwwwww..",
  "..wwwwww..",
  ".rwwwwwwr.",
  "rrwwwwwwrr",
  "rr.xxxx.rr",
  "r..xxxx..r",
];
const flame1 = ["....oo....", "...oyyo...", "....oo....", ".........."];
const flame2 = ["...oyyo...", "..oyyyyo..", "...oyyo...", "....oo...."];

const ufo1 = [
  ".........uuuuuu.........",
  "........uwwuuuuu........",
  ".......uuuuuuuuuu.......",
  "...XXXXXXXXXXXXXXXXXX...",
  ".XXxxxxxxxxxxxxxxxxxxXX.",
  "XXyxxxyxxxyxxxyxxxyxxxXX",
  ".XXxxxxxxxxxxxxxxxxxxXX.",
  "...XXXXXXXXXXXXXXXXXX...",
];
const ufo2 = ufo1.map((r, i) => (i === 5 ? "XXxxyxxxyxxxyxxxyxxxyxXX" : r));

const anchor1 = [
  "....nnnn....",
  "...nnnnnn...",
  "...nttttn...",
  "...tktktt...",
  "...tttttt...",
  "....tkkt....",
  ".....tt.....",
  "..qqqwwqqq..",
  ".qqqqwwqqqq.",
  ".qqqqrrqqqq.",
  ".qqqqrrqqqq.",
  ".qqqqqqqqqq.",
];
const anchor2 = anchor1.map((r, i) => (i === 5 ? "....tttt...." : r));

function beam(i) {
  const W = 24, H = 52, f = blank(W, H);
  for (let y = 0; y < H; y++) {
    const half = 4 + (y / H) * 8;
    for (let x = 0; x < W; x++) {
      if (Math.abs(x + 0.5 - W / 2) > half) continue;
      set(f, x, y, (y + i * 2) % 6 < 2 ? "#a8ff9a70" : "#6fdc5a48");
    }
  }
  return f;
}

function tv() {
  const W = 64, H = 44, f = blank(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const border = x < 2 || y < 2 || x >= W - 2 || y >= H - 2;
      set(f, x, y, border ? P.X : y >= H - 11 && y < H - 2 ? P.r : P.s);
    }
  for (let x = 2; x < W - 2; x++) set(f, x, H - 12, P.y);
  return f;
}

function planet() {
  const f = disc(blank(26, 22), 13, 11, 8, P.p, P.q);
  // A tilted ring: hidden behind the planet on the left, in front on the right.
  for (let x = 0; x < 26; x++) {
    const y = Math.round(11 + (x - 13) * 0.3);
    if (x < 13 && Math.abs(x - 13) <= 7) continue;
    set(f, x, y, P.y);
    set(f, x, y + 1, P.o);
  }
  return f;
}

const star1 = [".w.", "wXw", ".w."];
const star2 = ["...", ".X.", "..."];
const pad = ["XXXXXXXXXXXXXXXXXXXXXXXX", "xkxkxkxkxkxkxkxkxkxkxkxk", "x......................x", "x......................x"];
const debris1 = ["xX", "Xx"];
const debris2 = ["Xx", "xX"];

export const sprites = {
  rocket: [art([...rocketBody, ...flame1], P), art([...rocketBody, ...flame2], P)],
  boom: burst(20, 6, [P.w, P.y, P.o, P.r, P.x]),
  ufo: [art(ufo1, P), art(ufo2, P)],
  beam: [beam(0), beam(1), beam(2)],
  tv: tv(),
  anchor: [art(anchor1, P), art(anchor2, P)],
  planet: planet(),
  star: [art(star1, P), art(star2, P)],
  pad: art(pad, P),
  debris: [art(debris1, P), art(debris2, P)],
};

const FILE = [72, 62];
const hold = (t0, t1, x, y, extra = {}) => [{ t: t0, x, y, ...extra }, { t: t1, x, y, ...extra }];
const fadeIn = (t0, t1, x, y) => [{ t: t0, x, y, alpha: 0 }, { t: t1, x, y }, { t: 1, x, y }];

function launch(explode, bigger) {
  const top = explode ? 18 : -46;
  const end = explode ? 0.5 : 0.9;
  const tracks = [
    { sprite: "rocket", fps: 10, keys: [{ t: 0, x: 75, y: 60, alpha: 0 }, { t: 0.15, x: 75, y: 60 }, { t: 0.3, x: 75, y: 60 }, { t: end, x: 75, y: top + 16, ease: "in" }] },
    { sprite: "file", keys: [{ t: 0, x: FILE[0], y: FILE[1] }, { t: 0.18, x: 72, y: 45, arc: 6 }, { t: 0.3, x: 72, y: 45 }, { t: end, x: 72, y: top + 1, ease: "in" }] },
  ];
  if (!explode) {
    tracks.push({ text: "LAUNCH OK", color: "#6fdc5a", align: "center", keys: fadeIn(0.6, 0.7, 80, 6) });
    return { duration: 1800, tracks };
  }
  tracks.push(
    { sprite: "boom", fps: 11, once: true, keys: hold(0.5, 0.85, 70, top + 4) },
    ...[[-30, -10], [32, -6], [-18, 26], [24, 30]].map(([dx, dy], i) => ({
      sprite: "debris", fps: 8, keys: [{ t: 0.52, x: 79, y: top + 14 }, { t: 0.95, x: 79 + dx, y: top + 14 + dy, arc: i < 2 ? 8 : -4, ease: "out" }],
    })),
  );
  if (bigger) tracks.push({ text: "GONE FOR GOOD", color: "#ffd23f", align: "center", keys: fadeIn(0.6, 0.7, 80, 6) });
  return { duration: bigger ? 1900 : 1600, tracks };
}

export const manifest = {
  format: 1,
  id: "space",
  name: "Space",
  sheet: "sheet.png",
  size: [160, 90],
  bands: [[0, "#05050f"], [30, "#0b0b22"], [60, "#141436"], [80, "#2a2a40"]],
  scene: [
    { sprite: "planet", x: 122, y: 8 },
    ...[[8, 6, 2], [30, 20, 3], [52, 4, 2], [96, 14, 3], [150, 36, 2], [14, 44, 3], [110, 50, 2], [40, 60, 2], [140, 66, 3]].map(([x, y, fps]) => ({ sprite: "star", x, y, fps })),
    { sprite: "pad", x: 68, y: 78 },
  ],
  file: FILE,
  // Effects from src/audio/sfx.ts, at a point (0..1) in each animation.
  sounds: {
    keep: [{ sfx: "blip", at: 0.15 }, { sfx: "launch", at: 0.28 }, { sfx: "chime", at: 0.62 }],
    trash: [{ sfx: "blip", at: 0.15 }, { sfx: "launch", at: 0.28 }, { sfx: "explosion", at: 0.5 }],
    delete: [{ sfx: "blip", at: 0.15 }, { sfx: "launch", at: 0.28 }, { sfx: "explosion", at: 0.5 }, { sfx: "rumble", at: 0.6 }],
    move: [{ sfx: "beam", at: 0.3 }, { sfx: "blip", at: 0.72 }],
    rename: [{ sfx: "jingle", at: 0.15 }, { sfx: "blip", at: 0.5 }],
  },
  animations: {
    keep: launch(false, false),
    trash: launch(true, false),
    delete: launch(true, true),
    move: {
      duration: 2200,
      tracks: [
        { sprite: "beam", fps: 8, keys: hold(0.3, 0.75, 68, 16) },
        { sprite: "file", keys: [{ t: 0, x: FILE[0], y: FILE[1] }, { t: 0.32, x: FILE[0], y: FILE[1] }, { t: 0.72, x: 72, y: 14, scale: 0.4 }, { t: 0.75, x: 72, y: 12, scale: 0.3, alpha: 0 }] },
        { sprite: "ufo", fps: 4, keys: [{ t: 0, x: -30, y: 2 }, { t: 0.3, x: 68, y: 8, ease: "out" }, { t: 0.75, x: 68, y: 8 }, { t: 1, x: 172, y: -6, ease: "in" }] },
        { text: "TO {dest}", color: "#6fdc5a", align: "center", keys: fadeIn(0.35, 0.45, 80, 84) },
      ],
    },
    rename: {
      duration: 2600,
      tracks: [
        { sprite: "tv", keys: [{ t: 0, x: 48, y: 92 }, { t: 0.15, x: 48, y: 16, ease: "out" }, { t: 0.88, x: 48, y: 16 }, { t: 1, x: 48, y: 92, ease: "in" }] },
        { sprite: "anchor", fps: 6, keys: [{ t: 0, x: 54, y: 100 }, { t: 0.15, x: 54, y: 33, ease: "out" }, { t: 0.88, x: 54, y: 33 }, { t: 1, x: 54, y: 100, ease: "in" }] },
        { sprite: "file", keys: [{ t: 0, x: FILE[0], y: FILE[1] }, { t: 0.18, x: 88, y: 28, arc: 10 }, { t: 0.86, x: 88, y: 28 }, { t: 1, x: FILE[0], y: FILE[1] }] },
        { text: "BREAKING NEWS", color: "#ffd23f", align: "center", keys: hold(0.16, 0.86, 80, 20) },
        { text: "NEW DISCOVERY: {newName}", color: "#ffffff", clip: [50, 49, 60, 9], keys: [{ t: 0.16, x: 110, y: 51 }, { t: 0.86, x: -60, y: 51 }] },
      ],
    },
  },
};
