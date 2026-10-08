// Royal Court skin: the file seeks an audience with the king in his throne
// room. keep = the king's favor (gold, a feast, or royal approval); move =
// exiled through the castle gate; rename = the town crier proclaims a decree;
// trash = the guards march it to the dungeon, or the king pulls the lever on
// a trap door; delete = the same, but for good. All art is original, drawn here.
import { art, blank, set } from "./lib.mjs";

const P = {
  k: "#1a1020", w: "#ffffff", W: "#e8e4dc", y: "#f2c442", Y: "#b8862a", R: "#b3263a", r: "#7d1828",
  t: "#f2c8a0", T: "#c8946a", X: "#c8ccd8", x: "#7a7e90", n: "#7a4a28", N: "#4e2e18",
  P: "#6a2a9a", p: "#9a52d0", u: "#3a6ad0", U: "#24408a", g: "#3fa34d", G: "#2a6b35",
  o: "#f08a24", q: "#e05aa0", Q: "#a03070", h: "#5a3a20", e: "#d8d8e0", c: "#2fa8a0", C: "#1d6e6a",
  s: "#9a8a70", d: "#120c18", b: "#7fd0f0", l: "#c8a0e8",
};

// ---------- the room (one 160x90 backdrop; patches are cut from it) ----------

const STONE = ["#433d5a", "#4b4563", "#544d6c"];
const MORTAR = "#2e2942";
const FLOOR = ["#5e4b3c", "#54443a"];
const GROUT = "#3e3129";
const CARPET_TOP = 38;

function hash(a, b) {
  let h = (a * 374761393 + b * 668265263) >>> 0;
  h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
  return h % 1000;
}

function carpetHalf(y) {
  return Math.round(8 + (y - CARPET_TOP) * 0.17);
}

function room() {
  const f = blank(160, 90);
  // Stone wall with a dark frieze along the top (captions sit on it).
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 160; x++) {
      const row = Math.floor(y / 6), off = row % 2 ? 5 : 0;
      const col = Math.floor((x + off) / 10);
      let c = STONE[hash(row, col) % 3];
      if (y % 6 === 5 || (x + off) % 10 === 9) c = MORTAR;
      if (y < 10) c = y === 9 ? P.Y : y === 8 ? P.y : (x + (y > 3 ? 4 : 0)) % 8 === 0 && y % 4 === 2 ? "#3a2450" : "#24182e";
      set(f, x, y, c);
    }
  // Floor tiles.
  for (let y = 48; y < 90; y++)
    for (let x = 0; x < 160; x++) {
      const row = Math.floor((y - 48) / 7), col = Math.floor(x / 14);
      let c = FLOOR[(row + col) % 2];
      if ((y - 48) % 7 === 6 || x % 14 === 13) c = GROUT;
      set(f, x, y, c);
    }
  for (let x = 0; x < 160; x++) {
    set(f, x, 46, "#2a2538");
    set(f, x, 47, "#221e2e");
  }
  gate(f);
  dungeon(f);
  dais(f);
  carpet(f);
  throne(f);
  return f;
}

function gate(f) {
  const x0 = 4, x1 = 29, top = 16, bot = 47, cx = (x0 + x1 + 1) / 2;
  for (let y = top - 2; y <= bot; y++)
    for (let x = x0 - 2; x <= x1 + 2; x++) {
      const r = Math.hypot(x + 0.5 - cx, Math.max(0, top + 13 - y) * 1.0);
      const ry = y < top + 13;
      const inArch = ry ? r <= 13 : x >= x0 && x <= x1;
      const inFrame = ry ? r <= 15 : x >= x0 - 2 && x <= x1 + 2;
      if (!inFrame) continue;
      if (!inArch) {
        set(f, x, y, (x + y) % 5 === 0 ? "#6a6286" : "#7a7298");
        continue;
      }
      // Two wooden doors with iron bands and studs.
      let c = (x - x0) % 4 === 3 ? P.N : P.n;
      if (x === Math.floor(cx) || x === Math.floor(cx) - 1) c = P.N;
      if (y === 26 || y === 40) c = P.x;
      if ((y === 25 || y === 27 || y === 39 || y === 41) && (x - x0) % 4 === 1) c = P.X;
      set(f, x, y, c);
    }
  // Ring handles.
  for (const hx of [Math.floor(cx) - 3, Math.floor(cx) + 2]) {
    set(f, hx, 33, P.y);
    set(f, hx - 1, 34, P.y);
    set(f, hx + 1, 34, P.y);
    set(f, hx, 35, P.y);
  }
}

function dungeon(f) {
  const x0 = 132, x1 = 155, top = 22, bot = 47, cx = (x0 + x1 + 1) / 2;
  for (let y = top - 2; y <= bot; y++)
    for (let x = x0 - 2; x <= x1 + 2; x++) {
      const ry = y < top + 12;
      const r = Math.hypot(x + 0.5 - cx, Math.max(0, top + 12 - y));
      const inArch = ry ? r <= 12 : x >= x0 && x <= x1;
      const inFrame = ry ? r <= 14 : x >= x0 - 2 && x <= x1 + 2;
      if (!inFrame) continue;
      if (!inArch) {
        set(f, x, y, (x * 3 + y) % 7 === 0 ? "#3a3450" : "#5a5470");
        continue;
      }
      set(f, x, y, P.d);
    }
  // Steps going down, getting darker.
  const steps = ["#6a6080", "#544c68", "#403a52", "#2e2a3c", "#221e2c"];
  steps.forEach((c, i) => {
    const y = 44 - i * 3;
    for (let x = x0 + 2 + i * 2; x <= x1 - 1; x++) {
      set(f, x, y, c);
      set(f, x, y + 1, i < 2 ? "#3a3448" : "#1a1622");
    }
  });
  // A skull over the door.
  const skull = [".www.", "wkwkw", "wwwww", ".w.w."];
  skull.forEach((row, j) => [...row].forEach((ch, i) => set(f, 141 + i, 15 + j, P[ch])));
}

function dais(f) {
  for (let y = 40; y < 50; y++) {
    const w = y < 44 ? 26 : 30;
    for (let x = 80 - w; x < 80 + w; x++) {
      let c = y === 40 || y === 44 ? "#8a82a8" : y < 44 ? "#6a6286" : "#5a5274";
      if (y === 43 || y === 49) c = "#3a3450";
      if (y === 41 && (x % 6 === 0)) c = P.Y;
      set(f, x, y, c);
    }
  }
}

function carpet(f) {
  for (let y = CARPET_TOP; y < 90; y++) {
    const hw = carpetHalf(y);
    for (let x = 80 - hw; x < 80 + hw; x++) {
      const e = Math.min(x - (80 - hw), 80 + hw - 1 - x);
      let c = e === 0 ? P.Y : e === 1 ? P.y : P.R;
      if (e > 1 && (y - CARPET_TOP) % 9 === 4 && Math.abs(x - 79.5) < 1) c = P.y;
      if (e > 1 && (y - CARPET_TOP) % 9 === 4 && Math.abs(x - 79.5) < 3 && Math.abs(x - 79.5) >= 1) c = P.r;
      if (e > 1 && ((y - CARPET_TOP) % 9 === 3 || (y - CARPET_TOP) % 9 === 5) && Math.abs(x - 79.5) < 1) c = P.r;
      set(f, x, y, c);
    }
  }
  // The trap door's seam, hidden in the carpet.
  for (let x = TRAP[0]; x < TRAP[0] + 22; x++) {
    set(f, x, TRAP[1], P.r);
    set(f, x, TRAP[1] + 7, P.r);
  }
  for (let y = TRAP[1]; y < TRAP[1] + 8; y++) {
    set(f, TRAP[0], y, P.r);
    set(f, TRAP[0] + 21, y, P.r);
  }
}

function throne(f) {
  const x0 = 67, x1 = 92, top = 12;
  // Back: a gold frame around red velvet, round at the top.
  for (let y = top; y <= 40; y++)
    for (let x = x0; x <= x1; x++) {
      const cx = (x0 + x1 + 1) / 2;
      const r = Math.hypot((x + 0.5 - cx) * 0.9, Math.max(0, top + 10 - y));
      if (y < top + 10 && r > 11.5) continue;
      const edge = y < top + 10 ? r > 9.8 : x <= x0 + 1 || x >= x1 - 1;
      let c = edge ? ((x + y) % 3 ? P.y : P.Y) : (x + y) % 4 === 0 ? "#a02234" : P.R;
      if (!edge && y >= 34) c = P.r;
      set(f, x, y, c);
    }
  // Crown emblem on the back.
  const emb = ["y.y.y", "yyyyy", "yRyRy"];
  emb.forEach((row, j) => [...row].forEach((ch, i) => set(f, 78 + i, top + 3 + j, P[ch])));
  // Finials.
  for (const [fx, fy] of [[79, top - 3], [80, top - 3], [68, top + 6], [91, top + 6]]) {
    set(f, fx, fy, P.y);
    set(f, fx, fy + 1, P.Y);
  }
  // Armrests and legs.
  for (let x = x0 - 3; x <= x1 + 3; x++) {
    if (x > x0 + 2 && x < x1 - 2) continue;
    for (let y = 29; y <= 32; y++) set(f, x, y, y === 29 ? P.y : y === 32 ? P.Y : P.R);
  }
  for (const lx of [x0 - 2, x0 - 1, x1 + 1, x1 + 2])
    for (let y = 33; y <= 40; y++) set(f, lx, y, lx === x0 - 2 || lx === x1 + 2 ? P.Y : P.y);
}

// ---------- people ----------

const king = [
  "....y..y..y.....",
  "....yyyyyyy.....",
  "....yRyuyRy.....",
  "....ttttttt.....",
  "....tktttkt.....",
  "....ttttttt.....",
  "....WtTTTtW.....",
  "....WWWWWWW.....",
  "..PWWWWWWWWWP...",
  ".PPWkWWWWWkWPP..",
  ".PpPPWWWWWPPpP..",
  ".PpPPPWWWPPPpP..",
  ".tpPPPPPPPPPpt..",
  "..pPPPPPPPPPp...",
  "..PPPPPPPPPPP...",
  "..WkWWWkWWWkW...",
  "...PPP...PPP....",
  "...NNN...NNN....",
];
const kingBlink = king.map((r, i) => (i === 4 ? "....ttttttt....." : r));

const guardL = [
  ".X.....rr...",
  "XXX...rr....",
  ".X..XXXXX...",
  ".n.XXXXXXX..",
  ".n.XxxxxxX..",
  ".n.XtttttX..",
  ".n..tktkt...",
  ".n..ttttt...",
  ".nXXXXXXXXX.",
  ".tXxRRRRRxX.",
  ".nXxRyyyRxX.",
  ".n.xRRyRRx..",
  ".n.xRRRRRxt.",
  ".n.xRRRRRx..",
  ".n.xYYYYYx..",
  ".n.xRRRRRx..",
  ".n.xRRxRRx..",
  ".n..XX.XX...",
  ".n..xX.xX...",
  ".n..XX.XX...",
  ".n..xX.xX...",
  ".n..XX.XX...",
  ".n.kkk.kkk..",
];
const guardLook = guardL.map((r, i) => (i === 6 ? ".n..ktkt...." .slice(0, 12) : r));
const mirror = (rows) => rows.map((r) => [...r].reverse().join(""));
const guardStep = guardL.map((r, i) => {
  if (i === 17 || i === 19) return ".n.XX...XX..";
  if (i === 18 || i === 20) return ".n.xX...xX..";
  if (i === 21) return ".n.XX...XX..";
  if (i === 22) return ".nkkk...kkk.";
  return r;
});

const noble = [
  "......qq..",
  ".....q....",
  "..HHHHHH..",
  ".HHHHHHHH.",
  "...tttt...",
  "...ktkt...",
  "...tttt...",
  "....tt....",
  "..CWWWWC..",
  ".CCCWWCCC.",
  "CCCCyCCCCC",
  "CcCCyCCCcC",
  "tcCCCCCCct",
  ".cCCyCCCc.",
  "..YYYYYY..",
  "..CCCCCC..",
  "..CC..CC..",
  "...L..L...",
  "...L..L...",
  "...L..L...",
  "...L..L...",
  "..kk..kk..",
];
const lady = [
  "....H.....",
  "....HH....",
  "...HHH.v..",
  "...HHHv...",
  "..HHHHv...",
  "..HHHHHv..",
  "...tttt...",
  "...ktkt...",
  "...tttt...",
  "....tt....",
  "..CCWWCC..",
  ".CCCCCCCC.",
  "tCCCyyCCCt",
  ".cCCCCCCc.",
  "..cCCCCc..",
  "..CCCCCC..",
  ".CCCCCCCC.",
  ".CcCCCCcC.",
  "CCCCCCCCCC",
  "CcCCCCCCcC",
  "CCCCCCCCCC",
  ".kk....kk.",
];
// The arms swing in to clap (rows hold the hands).
function clap(rows, together) {
  const body = rows === lady ? 10 : 8;
  const g = rows.map((r) => [...r]);
  const put = (y, x, c) => (g[y][x] = c);
  // Drop the hanging hands, raise the arms.
  for (const y of [12, 13]) for (const x of [0, 9]) if (g[y][x] === "t") put(y, x, ".");
  if (together) {
    put(body - 1, 4, "t");
    put(body - 1, 5, "t");
    put(body, 3, "C");
    put(body, 6, "C");
  } else {
    put(body - 2, 1, "t");
    put(body - 2, 8, "t");
    put(body - 1, 1, "C");
    put(body - 1, 8, "C");
    put(body, 1, "C");
    put(body, 8, "C");
  }
  return g.map((r) => r.join(""));
}
const NOBLES = [
  { rows: noble, sw: { H: "U", C: "u", c: "U", L: "N", q: "w" } },
  { rows: lady, sw: { H: "q", C: "q", c: "Q", v: "w" } },
  { rows: noble, sw: { H: "G", C: "g", c: "G", L: "k", q: "y" } },
  { rows: lady, sw: { H: "l", C: "p", c: "P", v: "W" } },
  { rows: noble, sw: { H: "k", C: "o", c: "n", L: "N", q: "R" } },
  { rows: lady, sw: { H: "C", C: "c", c: "C", v: "w" } },
  { rows: noble, sw: { H: "r", C: "R", c: "r", L: "k", q: "y" } },
];
const sw = (rows, s) => rows.map((r) => [...r].map((ch) => s[ch] ?? ch).join(""));
const nobleFrames = (n) => {
  const a = sw(n.rows, n.sw);
  const b = a.map((r, i) => (i === (n.rows === lady ? 7 : 5) ? (n.rows === lady ? "...tktk..." : "...tktk...") : r));
  return [art(a, P), art(b, P)];
};
const clapFrames = (n) => [art(sw(clap(n.rows, true), n.sw), P), art(sw(clap(n.rows, false), n.sw), P)];

// The jester juggles three balls (drawn per frame on an ellipse).
const jesterBody = [
  "..y.........y...",
  "..RR..gyg..gg...",
  "...RR.gg..gg....",
  "....RRggggg.....",
  ".....ttttt......",
  ".....kttkt......",
  ".....tqqqt......",
  "......ttt.......",
  "....yRyRgy......",
  "...RRRggggR.....",
  "...RRRggRRR.....",
  "....gRRgRR......",
  "....ggRRgg......",
  "....yyyyyy......",
  "....RRR.gg......",
  "....RRR.gg......",
  "....RR..gg......",
  "...RRR..ggg.....",
];
function jester(i) {
  const f = blank(16, 26);
  const body = art(jesterBody, P);
  for (let y = 0; y < body.h; y++)
    for (let x = 0; x < body.w; x++) {
      const s = (y * body.w + x) * 4;
      if (body.px[s + 3]) f.px.set(body.px.subarray(s, s + 4), ((y + 8) * 16 + x) * 4);
    }
  // Arms up, hands alternating.
  const hl = i % 2 ? 9 : 11, hr = i % 2 ? 11 : 9;
  for (let y = hl; y < 17; y++) set(f, 3, y, y === hl ? P.t : P.R);
  for (let y = hr; y < 17; y++) set(f, 11, y, y === hr ? P.t : P.g);
  const balls = [P.u, P.y, P.q];
  balls.forEach((c, b) => {
    const a = ((b / 3 + i / 4) % 1) * Math.PI * 2;
    const bx = Math.round(7 + Math.cos(a) * 4.5), by = Math.round(4 - Math.sin(a) * 3.5);
    set(f, bx, by, c);
    set(f, bx + 1, by, c);
    set(f, bx, by + 1, c);
    set(f, bx + 1, by + 1, c);
  });
  return f;
}

const crier = [
  "...........y",
  "..kkkkkk..yY",
  ".kNNNNNNk..t",
  "kkkkkkkkkk.t",
  "...tttt....U",
  "...ktkt...U.",
  "...tttt..U..",
  "....tt..U...",
  "..UWWWWUU...",
  ".UUUWWUU....",
  "UUUUyUUUU...",
  "UuUUyUUUU...",
  "tuUUUUUUU...",
  ".uUUyUUU....",
  "..YYYYYY....",
  "..UUUUUU....",
  "..UU..UU....",
  "...w..w.....",
  "...w..w.....",
  "...w..w.....",
  "..kk..kk....",
];
const crierRing = crier.map((r, i) => {
  if (i === 0) return "..........y.";
  if (i === 1) return "..kkkkkk.yY.";
  if (i === 2) return ".kNNNNNNk.t.";
  if (i === 3) return "kkkkkkkkkkt.";
  if (i === 4) return "...tttt...U.";
  return r;
});
const crierWalk = crier.map((r, i) => {
  if (i >= 16 && i <= 19) return ["..UU...UU...", "..w....w....", "..w....w....", "..w....w...."][i - 16];
  if (i === 20) return ".kk....kk...";
  return r;
});

function scroll(stage) {
  const W = 26, H = 16;
  const f = blank(W, H);
  const open = [2, 10, 18, 22][stage];
  const x0 = Math.round(W / 2 - open / 2);
  for (let y = 1; y < H - 1; y++)
    for (let x = x0; x < x0 + open; x++) {
      let c = "#f0e0b0";
      if (y > 2 && y < H - 3 && x > x0 + 1 && x < x0 + open - 2 && y % 2 === 1 && (x * 7 + y) % 5) c = "#7a5a3a";
      set(f, x, y, c);
    }
  for (const rx of [x0 - 1, x0 + open]) for (let y = 0; y < H; y++) set(f, rx, y, y === 0 || y === H - 1 ? P.N : "#c8a870");
  if (stage === 3) {
    set(f, x0 + open / 2, H - 3, P.R);
    set(f, x0 + open / 2 - 1, H - 3, P.R);
    set(f, x0 + open / 2, H - 4, P.R);
  }
  return f;
}

// ---------- props ----------

function torch(i) {
  const f = blank(5, 12);
  const flames = [
    ["..y..", ".yoy.", ".ooo.", "..r.."],
    [".y...", ".oy..", ".ooo.", "..r.."],
    ["...y.", "..yo.", ".ooo.", "..r.."],
  ][i];
  flames.forEach((row, j) => [...row].forEach((ch, x) => set(f, x, j, P[ch])));
  for (let y = 4; y < 12; y++) set(f, 2, y, y < 6 ? P.N : P.x);
  set(f, 1, 4, P.x);
  set(f, 3, 4, P.x);
  set(f, 1, 9, P.x);
  return f;
}

function banner(i, main, dark) {
  const f = blank(11, 22);
  for (let x = 0; x < 11; x++) set(f, x, 0, P.Y);
  set(f, 0, 0, P.N);
  set(f, 10, 0, P.N);
  for (let y = 1; y < 22; y++) {
    const sway = i && y > 12 ? 1 : 0;
    for (let x = 1; x < 10; x++) {
      const tail = y >= 18 && Math.abs(x - 5) < y - 17;
      if (tail) continue;
      set(f, x + sway, y, x === 1 || x === 9 ? dark : main);
    }
  }
  const emb = ["y.y.y", "yyyyy", "yyyyy", ".....", ".y.y.", "..y.."];
  emb.forEach((row, j) => [...row].forEach((ch, x) => set(f, 3 + x, 4 + j, P[ch])));
  return f;
}

function lever(down) {
  const f = blank(8, 14);
  for (let y = 10; y < 14; y++) for (let x = 1; x < 7; x++) set(f, x, y, y === 10 ? P.X : x === 1 || x === 6 ? P.k : P.x);
  const path = down ? [[4, 9], [5, 9], [6, 8], [7, 8]] : [[3, 9], [3, 8], [2, 7], [2, 6], [2, 5], [1, 4], [1, 3]];
  for (const [x, y] of path) set(f, x, y, P.N);
  const [kx, ky] = down ? [6, 6] : [0, 1];
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) set(f, kx + dx, ky + dy, dx + dy === 0 ? "#ff6070" : P.R);
  return f;
}

// ---------- patches: the room with something else drawn in a spot ----------

let ROOM;
function crop(x, y, w, h) {
  const f = blank(w, h);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const s = ((y + j) * 160 + x + i) * 4;
      f.px.set(ROOM.px.subarray(s, s + 4), (j * w + i) * 4);
    }
  return f;
}
function stamp(f, src, dx, dy) {
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const s = (y * src.w + x) * 4;
      if (src.px[s + 3]) {
        const tx = dx + x, ty = dy + y;
        if (tx >= 0 && ty >= 0 && tx < f.w && ty < f.h) f.px.set(src.px.subarray(s, s + 4), (ty * f.w + tx) * 4);
      }
    }
  return f;
}
/** The room at [x, y, w, h] with layers ({ f, x, y } in stage pixels) drawn on top. */
function patch([x, y, w, h], layers = []) {
  const f = crop(x, y, w, h);
  for (const l of layers) stamp(f, l.f, l.x - x, l.y - y);
  return f;
}

// ---------- layout ----------

const FILE = [72, 54];
const TRAP = [69, 64];
const KING = [72, 19];
const GUARD_L = [46, 24];
const GUARD_R = [102, 24];
const LEVER = [57, 27];
const NOBLE_X = [2, 13, 24, 106, 117, 128, 139];
const NOBLE_Y = 64;
const JESTER = [42, 60];

ROOM = room();

// The gate opening onto the countryside.
function gateOpen(stage) {
  const f = crop(2, 14, 30, 34);
  const x0 = 2, x1 = 27, cx = 15;
  for (let y = 2; y < 34; y++)
    for (let x = x0; x <= x1; x++) {
      const r = Math.hypot(x + 0.5 - cx, Math.max(0, 15 - y));
      if (y < 15 && r > 13) continue;
      const doorW = [13, 7, 3][stage];
      const left = x - x0 < doorW, right = x1 - x < doorW;
      if (left || right) {
        if (stage === 0) continue;
        set(f, x, y, (x - x0) % 3 === 0 || (x1 - x) % 3 === 0 ? P.N : P.n);
        continue;
      }
      let c = P.b;
      if (y > 22) c = P.g;
      if (y > 27) c = P.G;
      if (y > 22 && Math.abs(x + 0.5 - cx) < (y - 22) * 0.5 + 0.5) c = "#e8c87a";
      if (y === 19 && (x === 12 || x === 13 || x === 18)) c = P.w;
      set(f, x, y, c);
    }
  return f;
}

function bricks(n) {
  const f = crop(130, 20, 28, 28);
  for (let y = 27; y >= 27 - n * 6; y--)
    for (let x = 2; x <= 25; x++) {
      const r = Math.hypot(x + 0.5 - 14, Math.max(0, 14 - y));
      if (y < 14 && r > 12) continue;
      if (y < 0) continue;
      const row = Math.floor((27 - y) / 3), off = row % 2 ? 2 : 0;
      set(f, x, y, (27 - y) % 3 === 2 || (x + off) % 5 === 4 ? "#3a3248" : (x + row) % 3 ? "#8a6a5a" : "#7a5a4a");
    }
  return f;
}

function trapdoor(stage, wide = false) {
  const W = wide ? 28 : 22, H = 8;
  const f = blank(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (stage === 0) continue;
      const flap = stage === 1 ? 4 : 2;
      let c = P.d;
      if (y < flap) c = y === flap - 1 ? P.k : P.r;
      if (stage === 2 && wide && Math.hypot(x - W / 2, (y - 5) * 2.5) < 4 + ((x + y) % 2)) c = "#000000";
      if (x === 0 || x === W - 1) c = P.k;
      set(f, x, y, c);
    }
  return f;
}

function cell() {
  // A cut-in of a dungeon cell; its barred door is cellBars.
  const W = 56, H = 34;
  const f = blank(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let c = (Math.floor(y / 4) + Math.floor((x + (Math.floor(y / 4) % 2) * 3) / 6)) % 2 ? "#2e2838" : "#383046";
      if (y % 4 === 3 || (x + (Math.floor(y / 4) % 2) * 3) % 6 === 5) c = "#1e1a26";
      if (y >= 26) c = (x * 3 + y) % 4 ? "#c8a040" : "#8a6a2a";
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) c = P.y;
      if (x === 1 || y === 1 || x === W - 2 || y === H - 2) c = P.k;
      set(f, x, y, c);
    }
  // Little barred window with moonlight, and a chain.
  for (let y = 5; y < 11; y++) for (let x = 24; x < 32; x++) set(f, x, y, x % 3 === 0 ? P.x : "#2a3a6a");
  set(f, 30, 6, P.w);
  for (let y = 4; y < 18; y++) set(f, 8 + (y % 2), y, P.x);
  set(f, 8, 18, P.X);
  set(f, 9, 18, P.X);
  set(f, 10, 18, P.X);
  return f;
}

function cellBars(open) {
  const W = 56, H = 34;
  const f = blank(W, H);
  // Bars sweep in from the right.
  const cover = [0, 18, 36, 52][open];
  for (let y = 2; y < H - 2; y++)
    for (let x = W - 2 - cover; x < W - 2; x++) {
      if ((x - (W - 2 - cover)) % 5 === 0) set(f, x, y, P.X);
      if (y === 4 || y === H - 5) set(f, x, y, P.x);
    }
  return f;
}

const coin = [
  art([".yy.", "yYyy", "yYyy", ".yy."], P),
  art(["..y.", ".yY.", ".yY.", "..y."], P),
  art([".y..", ".Yy.", ".Yy.", ".y.."], P),
];
function goldPile(n) {
  const f = blank(26, 12);
  for (let y = 0; y < 12; y++)
    for (let x = 0; x < 26; x++) {
      const hgt = [4, 8, 11][n];
      const d = Math.abs(x - 12.5) / 13;
      if (12 - y > hgt * (1 - d * d) + 1) continue;
      set(f, x, y, (x * 5 + y * 3) % 7 === 0 ? P.w : (x + y) % 3 ? P.y : P.Y);
    }
  return f;
}
const platter = art([
  "........kk.......y......",
  ".......knnk.....yYy.....",
  "......knnnnk....yYy..u..",
  ".....knnTnnnk..g.y..uUu.",
  "..q..knnnnnnk.ggg.y.uUu.",
  ".qQq.knnnnnnk.gggyYy.u..",
  "qQqQq.knnnnk..ggyYYYy...",
  "XXXXXXXXXXXXXXXXXXXXXXXX",
  ".xXXXXXXXXXXXXXXXXXXXXx.",
  "..xxxxxxxxxxxxxxxxxxxx..",
], P);
const steam = [art([".w..", "w.w.", ".w..", "..w."], { ...P, w: "#ffffffaa" }), art(["..w.", ".w..", "w.w.", ".w.."], { ...P, w: "#ffffffaa" })];
const crown = art(["y.y.y", "yyyyy", "yRyuy"], P);
const heart = [art([".q.q.", "qqqqq", ".qqq.", "..q.."], P), art([".....", ".q.q.", ".qqq.", "..q.."], P)];
const sparkle = [art(["..w..", ".wyw.", "wyyyw", ".wyw.", "..w.."], P), art([".....", "..y..", ".yWy.", "..y..", "....."], P)];
const dust = [art([".x.x.", "x.x.x", ".x.x."], P), art(["x...x", ".....", "x...x"], P)];

const kingF = [art(king, P), art(kingBlink, P)];
// The king's thumbs-up and his lever pull, as patches over his seat.
const kingThumbRows = (() => {
  const g = king.map((r) => [...r]);
  const put = (y, x, c) => (g[y][x] = c);
  put(12, 13, "p");
  put(12, 12, "p");
  for (const y of [8, 9, 10, 11]) put(y, 13, "p");
  put(9, 14, "p");
  put(6, 13, "t");
  put(7, 13, "t");
  put(6, 14, "t");
  put(7, 14, "t");
  put(4, 14, "t");
  put(5, 14, "t");
  put(4, 6, "k"); // a wink
  put(4, 5, "t");
  return g.map((r) => r.join(""));
})();
const kingPullRows = king.map((r, i) => {
  if (i === 9) return ".PPWkWWWWWkWPP..";
  if (i === 12) return "..pPPPPPPPPPpt..";
  return r;
});
const KING_PATCH = [56, 16, 40, 24];
function kingPull(down) {
  const k = art(kingPullRows, P);
  const arm = blank(160, 90);
  const [hx, hy] = down ? [LEVER[0] + 6, LEVER[1] + 6] : [LEVER[0] + 1, LEVER[1] + 1];
  const [sx, sy] = [73, 31];
  for (let i = 0; i <= 20; i++) {
    const x = Math.round(hx + ((sx - hx) * i) / 20), y = Math.round(hy + ((sy - hy) * i) / 20);
    set(arm, x, y, P.p);
    set(arm, x, y + 1, P.P);
  }
  set(arm, hx, hy, P.t);
  set(arm, hx + 1, hy, P.t);
  set(arm, hx, hy + 1, P.t);
  return patch(KING_PATCH, [{ f: lever(down), x: LEVER[0], y: LEVER[1] }, { f: k, x: KING[0], y: KING[1] }, { f: arm, x: 0, y: 0 }]);
}

export const sprites = {
  room: ROOM,
  king: kingF,
  kingThumb: patch([KING[0], KING[1], 16, 18], [{ f: art(kingThumbRows, P), x: KING[0], y: KING[1] }]),
  kingPullUp: kingPull(false),
  kingPullDown: kingPull(true),
  guardL: [art(guardL, P), art(guardLook, P)],
  guardR: [art(mirror(guardL), P), art(mirror(guardLook), P)],
  guardWalkL: [art(guardL, P), art(guardStep, P)],
  guardWalkR: [art(mirror(guardL), P), art(mirror(guardStep), P)],
  guardGapL: patch([GUARD_L[0], GUARD_L[1], 12, 23]),
  guardGapR: patch([GUARD_R[0], GUARD_R[1], 12, 23]),
  lever: lever(false),
  jester: [0, 1, 2, 3].map(jester),
  torch: [0, 1, 2].map(torch),
  bannerR: [banner(0, P.R, P.r), banner(1, P.R, P.r)],
  bannerP: [banner(1, P.P, "#4a1a70"), banner(0, P.P, "#4a1a70")],
  gateOpen: [0, 1, 2].map(gateOpen),
  gateShut: [2, 1, 0].map(gateOpen),
  bricks: [0, 1, 2, 3, 4, 5].map(bricks),
  trap: [0, 1, 2].map((s) => trapdoor(s)),
  trapShut: [2, 1, 0].map((s) => trapdoor(s)),
  pit: [0, 1, 2].map((s) => trapdoor(s, true)),
  trapMask: patch([TRAP[0] - 4, TRAP[1] + 8, 30, 90 - TRAP[1] - 8]),
  cell: cell(),
  cellBars: [0, 1, 2, 3].map(cellBars),
  crier: [art(crier, P), art(crierRing, P)],
  crierWalk: [art(crier, P), art(crierWalk, P)],
  scroll: [0, 1, 2, 3].map(scroll),
  coin,
  pile: [0, 1, 2].map(goldPile),
  platter,
  steam,
  crown,
  heart,
  sparkle,
  dust,
};
NOBLES.forEach((n, i) => {
  sprites[`noble${i}`] = nobleFrames(n);
  sprites[`clap${i}`] = clapFrames(n).map((c) => patch([NOBLE_X[i], NOBLE_Y, 10, 22], [{ f: c, x: NOBLE_X[i], y: NOBLE_Y }]));
});

// ---------- animations ----------

const hold = (t0, t1, x, y, extra = {}) => [{ t: t0, x, y, ...extra }, { t: t1, x, y, ...extra }];
const fadeIn = (t0, t1, x, y, end = 1) => [{ t: t0, x, y, alpha: 0 }, { t: t1, x, y }, { t: end, x, y }];
const fadeInOut = (t0, t1, t2, t3, x, y) => [{ t: t0, x, y, alpha: 0 }, { t: t1, x, y }, { t: t2, x, y }, { t: t3, x, y, alpha: 0 }];
const say = (text, color, t0, t1, end = 1, y = 2) => ({ text, color, align: "center", keys: end < 1 ? fadeInOut(t0, t1, end - 0.05, end, 80, y) : fadeIn(t0, t1, 80, y) });
const fileAt = (t) => ({ t, x: FILE[0], y: FILE[1] });
/** Hops from a to b in `n` little steps. */
function hops(t0, t1, a, b, n, arc = 3, extra = () => ({})) {
  const keys = [];
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    keys.push({ t: t0 + (t1 - t0) * k, x: Math.round(a[0] + (b[0] - a[0]) * k), y: Math.round(a[1] + (b[1] - a[1]) * k), arc, ...extra(k) });
  }
  return keys;
}
const clappers = (t0, t1) => NOBLE_X.map((x, i) => ({ sprite: `clap${i}`, fps: 8, keys: hold(t0 + (i % 3) * 0.02, t1, x, NOBLE_Y) }));

const goldFavor = {
  duration: 2200,
  tracks: [
    { sprite: "file", keys: [fileAt(0), { t: 0.6, x: FILE[0], y: FILE[1] - 4, arc: 4 }, fileAt(0.7), fileAt(1)] },
    { sprite: "pile", fps: 4, once: true, keys: hold(0.35, 1, 67, 62) },
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
      sprite: "coin",
      fps: 10,
      keys: [{ t: 0.15 + i * 0.05, x: 70 + ((i * 7) % 20), y: -4 }, { t: 0.32 + i * 0.05, x: 70 + ((i * 7) % 20), y: 66 + (i % 3), ease: "in" }],
    })),
    { sprite: "sparkle", fps: 6, keys: hold(0.6, 0.9, 64, 58) },
    { sprite: "sparkle", fps: 6, keys: hold(0.7, 1, 92, 60) },
    say("THE KING'S FAVOR", "#f2c442", 0.1, 0.2),
  ],
};

const feastFavor = {
  duration: 2200,
  sounds: [{ sfx: "royalFanfare", at: 0.02 }, { sfx: "royalPlatter", at: 0.42 }, { sfx: "royalApplause", at: 0.5 }, { sfx: "royalJingleBells", at: 0.62 }],
  tracks: [
    { sprite: "file", keys: [fileAt(0), fileAt(0.45), { t: 0.55, x: FILE[0], y: FILE[1] - 4, arc: 5 }, fileAt(0.62), fileAt(1)] },
    { sprite: "platter", keys: [{ t: 0.15, x: 70, y: 30, alpha: 0 }, { t: 0.2, x: 70, y: 30 }, { t: 0.42, x: 68, y: 64, arc: 16, ease: "in" }, { t: 1, x: 68, y: 64 }] },
    { sprite: "steam", fps: 4, keys: fadeIn(0.45, 0.55, 75, 58) },
    { sprite: "heart", fps: 3, keys: [{ t: 0.55, x: 62, y: 56 }, { t: 1, x: 58, y: 40, alpha: 0 }] },
    { sprite: "heart", fps: 3, keys: [{ t: 0.62, x: 92, y: 58 }, { t: 1, x: 96, y: 42, alpha: 0 }] },
    say("A ROYAL FEAST", "#f2c442", 0.1, 0.2),
  ],
};

const approval = {
  duration: 2200,
  sounds: [{ sfx: "royalFanfare", at: 0.05 }, { sfx: "royalApplause", at: 0.3 }, { sfx: "royalApplause", at: 0.6 }, { sfx: "royalJingleBells", at: 0.75 }],
  tracks: [
    { sprite: "kingThumb", keys: hold(0.1, 0.95, KING[0], KING[1]) },
    ...clappers(0.25, 0.95),
    { sprite: "file", keys: [fileAt(0), fileAt(0.3), { t: 0.42, x: FILE[0], y: FILE[1] - 5, arc: 6 }, { t: 0.5, x: FILE[0], y: FILE[1] }, { t: 0.62, x: FILE[0], y: FILE[1] - 5, arc: 6 }, { t: 0.7, x: FILE[0], y: FILE[1] }, fileAt(1)] },
    { sprite: "crown", keys: [{ t: 0.3, x: 77, y: 34, alpha: 0 }, { t: 0.45, x: 77, y: FILE[1] - 3, ease: "out" }, { t: 0.5, x: 77, y: FILE[1] - 3 }, { t: 0.62, x: 77, y: FILE[1] - 8, arc: 6 }, { t: 0.7, x: 77, y: FILE[1] - 3 }, { t: 1, x: 77, y: FILE[1] - 3 }] },
    { sprite: "sparkle", fps: 6, keys: hold(0.45, 0.8, 62, 50) },
    { sprite: "sparkle", fps: 6, keys: hold(0.55, 0.95, 94, 52) },
    say("ROYAL APPROVAL", "#f2c442", 0.1, 0.2),
  ],
};

const exile = {
  duration: 2400,
  tracks: [
    { sprite: "gateOpen", fps: 8, once: true, keys: hold(0.15, 0.62, 2, 14) },
    { sprite: "gateShut", fps: 8, once: true, keys: hold(0.62, 1, 2, 14) },
    {
      sprite: "file",
      keys: [fileAt(0), fileAt(0.1), ...hops(0.1, 0.5, FILE, [12, 31], 5, 3), { t: 0.6, x: 13, y: 31, scale: 0.6, alpha: 0.2 }],
    },
    { sprite: "dust", fps: 6, keys: hold(0.6, 0.75, 13, 44) },
    say("EXILED TO {dest}", "#ffffff", 0.08, 0.16),
  ],
};

const decree = {
  duration: 2600,
  tracks: [
    { sprite: "crierWalk", fps: 6, keys: [{ t: 0, x: 162, y: 41 }, { t: 0.22, x: 96, y: 41 }] },
    { sprite: "crier", fps: 5, keys: [{ t: 0.22, x: 96, y: 41 }, { t: 0.42, x: 96, y: 41 }] },
    { sprite: "crier", keys: [{ t: 0.42, x: 96, y: 41 }, { t: 0.86, x: 96, y: 41 }] },
    { sprite: "crierWalk", fps: 6, keys: [{ t: 0.86, x: 96, y: 41 }, { t: 1, x: 140, y: 41 }] },
    { sprite: "scroll", fps: 8, once: true, keys: [{ t: 0.42, x: 105, y: 50 }, { t: 0.86, x: 105, y: 50 }] },
    { sprite: "file", keys: [fileAt(0), fileAt(0.5), { t: 0.56, x: FILE[0], y: FILE[1] - 4, arc: 3 }, { t: 0.62, x: FILE[0], y: FILE[1] }, fileAt(1)] },
    { sprite: "sparkle", fps: 6, keys: hold(0.56, 0.75, 66, 50) },
    say("HEAR YE! HEAR YE!", "#ffffff", 0.2, 0.26, 0.5),
    say("{newName}", "#f2c442", 0.5, 0.56),
  ],
};

/** The guards take the file down the dungeon steps. `forever` bricks the door up after it. */
function dungeonMarch(forever) {
  const L = GUARD_L, R = GUARD_R;
  const fileWalk = [fileAt(0), fileAt(0.12), ...hops(0.12, 0.42, FILE, [136, 30], 6, 2)];
  const lw = [{ t: 0, x: L[0], y: L[1] }, { t: 0.12, x: 59, y: 49 }, ...hops(0.12, 0.42, [59, 49], [123, 25], 6, 1)];
  const rw = [{ t: 0, x: R[0], y: R[1] }, { t: 0.12, x: 87, y: 49 }, ...hops(0.12, 0.42, [87, 49], [149, 25], 6, 1)];
  const back = (from, to, t0) => [{ t: t0, x: from[0], y: from[1] }, ...hops(t0, 1, from, to, 6, 1)];
  // The left guard goes round the front of the dais, not through the throne.
  const backL = (from, t0) => {
    const span = 1 - t0;
    return [
      { t: t0, x: from[0], y: from[1] },
      ...hops(t0, t0 + span * 0.25, from, [104, 49], 2, 1),
      ...hops(t0 + span * 0.25, t0 + span * 0.8, [104, 49], [58, 49], 5, 1),
      ...hops(t0 + span * 0.8, 1, [58, 49], L, 2, 1),
    ];
  };
  const tracks = [
    { sprite: "guardGapL", keys: hold(0, 1, L[0], L[1]) },
    { sprite: "guardGapR", keys: hold(0, 1, R[0], R[1]) },
  ];
  if (forever) {
    tracks.push(
      { sprite: "file", keys: [...fileWalk, { t: 0.52, x: 140, y: 34, scale: 0.6, alpha: 0 }] },
      { sprite: "bricks", fps: 9, once: true, keys: hold(0.52, 0.98, 130, 20) },
      { sprite: "guardWalkL", fps: 6, keys: [...lw, { t: 0.5, x: 123, y: 25 }, ...backL([123, 25], 0.72)] },
      { sprite: "guardWalkR", fps: 6, keys: [...rw, { t: 0.5, x: 149, y: 25 }, ...back([149, 25], R, 0.72)] },
      { sprite: "dust", fps: 6, keys: hold(0.55, 0.7, 136, 40) },
      { sprite: "dust", fps: 6, keys: hold(0.7, 0.85, 140, 28) },
      say("BANISHED FOREVER", "#ff5a5a", 0.5, 0.58),
    );
    return { duration: 2600, tracks };
  }
  tracks.push(
    { sprite: "file", keys: [...fileWalk, { t: 0.5, x: 140, y: 36, scale: 0.6, alpha: 0 }] },
    { sprite: "guardWalkL", fps: 6, keys: [...lw, { t: 0.55, x: 123, y: 25 }, ...backL([123, 25], 0.6)] },
    { sprite: "guardWalkR", fps: 6, keys: [...rw, { t: 0.55, x: 149, y: 25 }, ...back([149, 25], R, 0.6)] },
    { sprite: "cell", keys: fadeInOut(0.48, 0.52, 0.9, 0.96, 52, 12) },
    { sprite: "file", keys: [{ t: 0.52, x: 100, y: 14, alpha: 0 }, { t: 0.54, x: 100, y: 14 }, { t: 0.64, x: 66, y: 22, arc: 10, ease: "out" }, { t: 0.9, x: 66, y: 22 }, { t: 0.96, x: 66, y: 22, alpha: 0 }] },
    { sprite: "cellBars", fps: 14, once: true, keys: [{ t: 0.66, x: 52, y: 12 }, { t: 0.9, x: 52, y: 12 }, { t: 0.96, x: 52, y: 12, alpha: 0 }] },
    say("TO THE DUNGEON!", "#ffffff", 0.45, 0.5),
  );
  return { duration: 2600, tracks };
}

/** The king pulls a lever and the file drops through a trap door. */
function trapDrop(forever) {
  const sprite = forever ? "pit" : "trap";
  const tx = forever ? TRAP[0] - 3 : TRAP[0];
  return {
    duration: forever ? 2600 : 2200,
    sounds: forever
      ? [{ sfx: "royalLever", at: 0.22 }, { sfx: "royalCreak", at: 0.3 }, { sfx: "royalFall", at: 0.42 }, { sfx: "royalEcho", at: 0.8 }]
      : [{ sfx: "royalLever", at: 0.22 }, { sfx: "royalCreak", at: 0.3 }, { sfx: "royalFall", at: 0.42 }, { sfx: "royalThud", at: 0.62 }, { sfx: "royalCreak", at: 0.82 }],
    tracks: [
      { sprite: "kingPullUp", keys: hold(0.1, 0.22, KING_PATCH[0], KING_PATCH[1]) },
      { sprite: "kingPullDown", keys: [{ t: 0.22, x: KING_PATCH[0], y: KING_PATCH[1] }, { t: forever ? 0.95 : 0.8, x: KING_PATCH[0], y: KING_PATCH[1] }] },
      { sprite, fps: 12, once: true, keys: hold(0.28, forever ? 1 : 0.8, tx, TRAP[1]) },
      ...(forever ? [] : [{ sprite: "trapShut", fps: 12, once: true, keys: hold(0.8, 1, TRAP[0], TRAP[1]) }]),
      {
        sprite: "file",
        keys: [fileAt(0), fileAt(0.28), { t: 0.32, x: FILE[0] - 1, y: FILE[1] }, { t: 0.36, x: FILE[0] + 1, y: FILE[1] }, { t: 0.4, x: FILE[0], y: FILE[1] - 2 },
          forever ? { t: 0.62, x: FILE[0] + 4, y: FILE[1] + 22, scale: 0.5, alpha: 0, ease: "in" } : { t: 0.55, x: FILE[0], y: FILE[1] + 22, ease: "in" }],
      },
      { sprite: "trapMask", keys: hold(0.28, 1, TRAP[0] - 4, TRAP[1] + 8) },
      ...(forever ? [] : [{ sprite: "dust", fps: 6, keys: hold(0.6, 0.8, 78, 60) }]),
      say(forever ? "BANISHED FOREVER" : "DOWN YOU GO!", forever ? "#ff5a5a" : "#ffffff", 0.3, 0.38),
    ],
  };
}

export const manifest = {
  format: 1,
  id: "royal-court",
  name: "Royal Court",
  sheet: "sheet.png",
  size: [160, 90],
  music: "audience-with-the-king",
  scene: [
    { sprite: "room", x: 0, y: 0 },
    { sprite: "bannerR", x: 34, y: 11, fps: 2 },
    { sprite: "bannerP", x: 115, y: 11, fps: 2 },
    { sprite: "torch", x: 38, y: 34, fps: 4 },
    { sprite: "torch", x: 118, y: 34, fps: 4 },
    { sprite: "lever", x: LEVER[0], y: LEVER[1] },
    { sprite: "king", x: KING[0], y: KING[1], fps: 0.7 },
    { sprite: "guardL", x: GUARD_L[0], y: GUARD_L[1], fps: 0.5 },
    { sprite: "guardR", x: GUARD_R[0], y: GUARD_R[1], fps: 0.6 },
    ...NOBLE_X.map((x, i) => ({ sprite: `noble${i}`, x, y: NOBLE_Y, fps: [0.8, 1.1, 0.6, 0.9, 1.3, 0.7, 1][i] })),
    { sprite: "jester", x: JESTER[0], y: JESTER[1], fps: 4 },
  ],
  file: FILE,
  sounds: {
    keep: [{ sfx: "royalFanfare", at: 0.02 }, { sfx: "royalCoins", at: 0.3 }, { sfx: "royalCoins", at: 0.5 }, { sfx: "royalApplause", at: 0.65 }],
    move: [{ sfx: "royalDoor", at: 0.12 }, { sfx: "royalExile", at: 0.3 }, { sfx: "royalDoor", at: 0.62 }, { sfx: "royalThud", at: 0.72 }],
    rename: [{ sfx: "royalCrierBell", at: 0.24 }, { sfx: "royalCrierBell", at: 0.34 }, { sfx: "royalScroll", at: 0.42 }, { sfx: "royalFanfare", at: 0.52 }],
    trash: [{ sfx: "royalMarch", at: 0.05 }, { sfx: "royalMarch", at: 0.25 }, { sfx: "royalMurmur", at: 0.35 }, { sfx: "royalThud", at: 0.62 }, { sfx: "royalClang", at: 0.68 }],
    delete: [{ sfx: "royalMarch", at: 0.05 }, { sfx: "royalMarch", at: 0.25 }, { sfx: "royalBricks", at: 0.55 }, { sfx: "royalBricks", at: 0.72 }, { sfx: "royalDoom", at: 0.86 }],
  },
  animations: {
    keep: goldFavor,
    move: exile,
    rename: decree,
    trash: dungeonMarch(false),
    delete: dungeonMarch(true),
  },
  variants: {
    keep: [feastFavor, approval],
    trash: [trapDrop(false)],
    delete: [trapDrop(true)],
  },
};
