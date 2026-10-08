// Volcano skin: keep = beach chair, coconut drink and umbrella; trash = into
// the volcano; rename = islanders chant around the file; move = off on a boat.
// All art is original, drawn here.
import { art, blank, bob, burst, disc, recolor, set } from "./lib.mjs";

const P = {
  k: "#1a1020", w: "#ffffff", r: "#c8323c", o: "#f08a24", y: "#ffd23f", n: "#6b4a3a", b: "#3e2a2a",
  g: "#3fa34d", G: "#2a6b35", s: "#e8c87a", u: "#7fd0f0", U: "#2a6fb0", p: "#e05aa0", c: "#8a5a2b",
  t: "#d9a066", T: "#8d5524", x: "#7a7a86", X: "#c4c4cc", h: "#2a1a10",
};

function volcano(glow) {
  const W = 48, H = 30, cx = 24;
  const f = blank(W, H);
  for (let y = 0; y < H; y++) {
    const half = 5 + y * 0.65;
    for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - cx;
      if (Math.abs(dx) > half) continue;
      const edge = Math.abs(dx) > half - 1;
      let c = edge ? P.k : dx > half * 0.35 ? P.b : P.n;
      if (y < 2 && Math.abs(dx) < 4) c = glow ? P.y : P.o; // lava in the crater
      set(f, x, y, c);
    }
  }
  // Lava running down the near side.
  for (let y = 2; y < 13; y++) set(f, cx - 2 + (y > 7 ? -1 : 0), y, y > 10 ? P.r : glow && y > 8 ? P.y : P.o);
  for (let y = 2; y < 8; y++) set(f, cx + 2, y, glow && y > 5 ? P.y : P.r);
  return f;
}

function smoke(i) {
  const f = blank(10, 10);
  if (i === 0) disc(f, 5, 7.5, 2.2, P.X);
  if (i === 1) disc(disc(f, 4.5, 5.5, 3, P.X), 6.5, 7.5, 2, P.x);
  if (i === 2) disc(disc(f, 5, 4, 3.6, P.x), 3.5, 6.5, 1.6, P.X);
  return f;
}

const palm = [
  "....GG....GG....",
  "..GGggG..GggGG..",
  ".GggggGGGGgggggG",
  "Gg..GGgggggGG..g",
  "G..Gg.GgnGg.gG.G",
  "..Gg..G.n.G..gG.",
  ".Gg.....n.....gG",
  ".G......n......G",
  "........n.......",
  ".......nn.......",
  ".......n........",
  ".......n........",
  ".......nn.......",
  "........n.......",
  "........n.......",
  "........nn......",
  ".........n......",
  ".........n......",
  ".........n......",
  "........nn......",
  "........n.......",
  "........n.......",
  ".......nnn......",
  "......nnnnn.....",
];

const chair = [
  "...........kk...",
  "..........kpk...",
  ".........kpwk...",
  "........kpwk....",
  "kkkkkkkkpwpk....",
  "kpwpwpwpwpwk....",
  "kkkkkkkkkkkk....",
  ".k........k.....",
  ".k........k.....",
  ".k........k.....",
];

const umbrella = [
  "........kkkk........",
  ".....kkppwwppkk.....",
  "...kkpppwwwwpppkk...",
  "..kppppwwwwwwppppk..",
  ".kppppwwwwwwwwppppk.",
  "kkkkkkkkkkkkkkkkkkkk",
  ".........kk.........",
  ".........kk.........",
  ".........kk.........",
  ".........kk.........",
  ".........kk.........",
  ".........kk.........",
  ".........kk.........",
  ".........kk.........",
  ".........kk.........",
  ".........kk.........",
  ".........kk.........",
  "........kkkk........",
];

const drink = [
  "....p.",
  "...ppk",
  "....k.",
  "...k..",
  ".cccc.",
  "cnccnc",
  "cccccc",
  "ncccnc",
  ".cccc.",
];

const islanderDown = [
  "..hhhh..",
  "..httk..",
  "..tttt..",
  "...tt...",
  ".tttttt.",
  "t.tttt.t",
  "t.tttt.t",
  "..tttt..",
  ".gGgGgg.",
  ".GgGgGg.",
  "..t..t..",
  "..t..t..",
  "..t..t..",
  ".tt..tt.",
];
const islanderUp = [
  "t.hhhh.t",
  "t.httk.t",
  "t.tttt.t",
  ".t.tt.t.",
  "..tttt..",
  "..tttt..",
  "..tttt..",
  "..tttt..",
  ".gGgGgg.",
  ".GgGgGg.",
  "..t..t..",
  "..t..t..",
  "..t..t..",
  ".tt..tt.",
];

const boat = [
  "...........k............",
  "...........kw...........",
  "...........kww..........",
  "...........kwww.........",
  "...........kwwww........",
  "...........kwwwww.......",
  "...........kwwwwww......",
  "...........kwwwwwww.....",
  "...........k............",
  "nnnnnnnnnnnnnnnnnnnnnnnn",
  ".nccccccccccccccccccccn.",
  "..nccccccccccccccccccn..",
  "...nnnnnnnnnnnnnnnnnn...",
  "........................",
];

const wave1 = ["..ww....", ".wuuw...", "uuuuuuuu"];
const wave2 = ["......ww", "w....wuu", "uuuuuuuu"];
const blob1 = [".oo.", "oyyo", "oyyo", ".oo."];
const blob2 = [".rr.", "roor", "roor", ".rr."];

export const sprites = {
  volcano: [volcano(false), volcano(true)],
  smoke: [0, 1, 2].map(smoke),
  sun: disc(blank(14, 14), 7, 7, 6.5, P.y, P.o),
  palm: art(palm, P),
  chair: art(chair, P),
  umbrella: art(umbrella, P),
  drink: art(drink, P),
  islander: [art(islanderDown, P), art(islanderUp, P)],
  islander2: [art(recolor(islanderUp, { t: "T", g: "y" }), P), art(recolor(islanderDown, { t: "T", g: "y" }), P)],
  boat: [art(boat, P), art(bob(boat), P)],
  wave: [art(wave1, P), art(wave2, P)],
  lava: [art(blob1, P), art(blob2, P)],
  burst: burst(16, 5, [P.w, P.y, P.o, P.r]),
};

const FILE = [72, 50];
const CRATER = [118, 30];
const hold = (t0, t1, x, y, extra = {}) => [{ t: t0, x, y, ...extra }, { t: t1, x, y, ...extra }];
const fadeIn = (t0, t1, x, y) => [{ t: t0, x, y, alpha: 0 }, { t: t1, x, y }, { t: 1, x, y }];

const throwIn = (bigger) => ({
  duration: bigger ? 1900 : 1600,
  tracks: [
    { sprite: "file", keys: [{ t: 0, x: FILE[0], y: FILE[1] }, { t: 0.15, x: FILE[0], y: FILE[1] + 2 }, { t: 0.55, x: CRATER[0], y: CRATER[1], arc: 34, ease: "out" }] },
    { sprite: "burst", fps: 10, once: true, keys: hold(0.55, 0.85, CRATER[0], CRATER[1] - 10) },
    ...(bigger ? [{ sprite: "burst", fps: 8, once: true, keys: hold(0.7, 1, CRATER[0] + 6, CRATER[1] - 18) }] : []),
    { sprite: "lava", fps: 6, keys: [{ t: 0.58, x: 124, y: 36 }, { t: 0.95, x: 104, y: 28, arc: 14 }] },
    { sprite: "lava", fps: 6, keys: [{ t: 0.6, x: 126, y: 36 }, { t: 0.95, x: 146, y: 26, arc: 16 }] },
    { sprite: "lava", fps: 6, keys: [{ t: 0.62, x: 125, y: 36 }, { t: 0.9, x: 125, y: 8, ease: "out" }] },
    ...(bigger ? [{ text: "GONE FOR GOOD", color: "#ffd23f", align: "center", keys: fadeIn(0.6, 0.7, 80, 6) }] : []),
  ],
});

export const manifest = {
  format: 1,
  id: "volcano",
  name: "Volcano",
  sheet: "sheet.png",
  size: [160, 90],
  bands: [[0, "#2b1a4a"], [12, "#4a2361"], [24, "#7a2f6b"], [36, "#b8456a"], [48, "#e8705a"], [58, "#f5a25a"], [66, "#e8c87a"], [74, "#2a6fb0"], [83, "#1f4f8a"]],
  scene: [
    { sprite: "sun", x: 18, y: 10 },
    { sprite: "volcano", x: 96, y: 38, fps: 2 },
    { sprite: "smoke", x: 115, y: 26, fps: 3 },
    { sprite: "palm", x: 4, y: 44 },
    { sprite: "wave", x: 12, y: 77, fps: 2 },
    { sprite: "wave", x: 58, y: 80, fps: 2 },
    { sprite: "wave", x: 104, y: 77, fps: 2 },
    { sprite: "wave", x: 140, y: 82, fps: 2 },
  ],
  file: FILE,
  // Effects from src/audio/sfx.ts, at a point (0..1) in each animation.
  sounds: {
    keep: [{ sfx: "tomHi", at: 0.05 }, { sfx: "chime", at: 0.4 }, { sfx: "pop", at: 0.55 }],
    trash: [{ sfx: "whoosh", at: 0.15 }, { sfx: "rumble", at: 0.5 }, { sfx: "sizzle", at: 0.56 }],
    delete: [{ sfx: "whoosh", at: 0.15 }, { sfx: "explosion", at: 0.52 }, { sfx: "rumble", at: 0.6 }, { sfx: "sizzle", at: 0.7 }],
    rename: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75].map((at, i) => ({ sfx: i % 2 ? "tomHi" : "tom", at })).concat([{ sfx: "chime", at: 0.86 }]),
    move: [{ sfx: "horn", at: 0.28 }, { sfx: "splash", at: 0.48 }, { sfx: "horn", at: 0.7 }],
  },
  animations: {
    keep: {
      duration: 1800,
      tracks: [
        { sprite: "umbrella", keys: fadeIn(0.3, 0.45, 28, 40) },
        { sprite: "chair", keys: fadeIn(0.05, 0.2, 30, 56) },
        { sprite: "file", keys: [{ t: 0, x: FILE[0], y: FILE[1] }, { t: 0.35, x: 36, y: 46, arc: 14, ease: "out" }, { t: 1, x: 36, y: 46 }] },
        { sprite: "drink", keys: fadeIn(0.55, 0.65, 50, 57) },
        { text: "KEPT", color: "#ffffff", align: "center", keys: fadeIn(0.4, 0.5, 80, 6) },
      ],
    },
    trash: throwIn(false),
    delete: throwIn(true),
    rename: {
      duration: 2000,
      tracks: [
        { sprite: "islander", fps: 5, keys: hold(0, 1, 75, 34) },
        { sprite: "file", keys: [0, 0.25, 0.5, 0.75, 1].map((t, i) => ({ t, x: FILE[0], y: FILE[1] - (i % 2) * 4 })) },
        { sprite: "islander", fps: 5, keys: hold(0, 1, 58, 52) },
        { sprite: "islander2", fps: 5, keys: hold(0, 1, 92, 52) },
        { text: "{newName}", color: "#ffd23f", align: "center", keys: fadeIn(0.15, 0.3, 80, 6) },
      ],
    },
    move: {
      duration: 2200,
      tracks: [
        { sprite: "boat", fps: 3, keys: [{ t: 0, x: -26, y: 62 }, { t: 0.35, x: 60, y: 62, ease: "out" }, { t: 0.5, x: 60, y: 62 }, { t: 1, x: 172, y: 62, ease: "in" }] },
        { sprite: "file", keys: [{ t: 0, x: FILE[0], y: FILE[1] }, { t: 0.38, x: FILE[0], y: FILE[1] }, { t: 0.5, x: 64, y: 56, arc: 10 }, { t: 1, x: 176, y: 56, ease: "in" }] },
        { text: "TO {dest}", color: "#ffffff", align: "center", keys: fadeIn(0.4, 0.5, 80, 6) },
      ],
    },
  },
};
