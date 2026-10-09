// Bank Heist skin: we look out from inside a bank. Through the glass front
// wall you see the entrance and the crew's van parked outside; the vault
// stands open at the back, tellers work the counter, a guard keeps watch and
// customers wait in line. The file waiting for a decision is the money, on a
// cash cart in front of the vault. Below the bank, four comic-book panels
// show the crew on their headsets: the vent crawler, the master of
// disguise, the demolition expert and the hacker in the van.
//
// move = the money is bagged and carried out to the van (the van fills up),
//        and every fifth move the crew makes a getaway (encore);
// rename = an explorer swaps it for a decoy, or a crew member double-crosses;
// trash = a dye pack, a crossfire, a superhero brawl or a car crash ruins it;
// keep = SWAT, a hero cop, or the vault door locks the thief in;
// delete = the money goes through the vault's shredder, for good.
// All art is original and drawn here in code; every character is made up.
import { art, blank, burst, set } from "./lib.mjs";

const W = 160;
const H = 130;

const P = {
  k: "#1a1020", j: "#34344c", w: "#ffffff", W: "#e8e4dc", t: "#f2c8a0", T: "#c8946a", d: "#b07848", D: "#6e4428",
  y: "#f2c442", Y: "#b8862a", g: "#3fa34d", G: "#2a6b35", m: "#8fd06a", M: "#3f7a34", s: "#d8b878", S: "#a8864a",
  x: "#7a7e90", X: "#c8ccd8", n: "#7a4a28", N: "#4e2e18", u: "#3a6ad0", U: "#24408a", b: "#7fd0f0", B: "#c8ecff",
  R: "#d0303a", r: "#7d1828", o: "#f08a24", O: "#b05a14", p: "#8a52d0", q: "#e05aa0", Q: "#a03070", c: "#2fa8a0",
  C: "#1d6e6a", a: "#c8a060", A: "#8a6a38", h: "#3a2418", e: "#e8c860", z: "#585c70", v: "#b8bcc8", l: "#4a2a7a",
  i: "#f4f0ff", f: "#ff6a3a",
};

/** ASCII art with rows padded to the widest one. */
function A(rows, pal = P) {
  const w = Math.max(...rows.map((r) => r.length));
  return art(rows.map((r) => r.padEnd(w, ".")), pal);
}
const pad = (rows) => {
  const w = Math.max(...rows.map((r) => r.length));
  return rows.map((r) => r.padEnd(w, "."));
};
const mirror = (rows) => pad(rows).map((r) => [...r].reverse().join(""));
/** Turned a quarter clockwise (the head ends up on the right). */
const rotate = (rows) => {
  const g = pad(rows);
  return [...g[0]].map((_, x) => g.map((r) => r[x]).reverse().join(""));
};
const swap = (rows, s) => rows.map((r) => [...r].map((ch) => s[ch] ?? ch).join(""));

function fill(f, x, y, w, h, c) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(f, x + i, y + j, c);
}
function stamp(f, src, dx, dy) {
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const s = (y * src.w + x) * 4;
      if (!src.px[s + 3]) continue;
      const tx = dx + x, ty = dy + y;
      if (tx >= 0 && ty >= 0 && tx < f.w && ty < f.h) f.px.set(src.px.subarray(s, s + 4), (ty * f.w + tx) * 4);
    }
  return f;
}
function hash(a, b) {
  let h = (a * 374761393 + b * 668265263) >>> 0;
  h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
  return h % 1000;
}

// ---------- a tiny 3x5 font for posters and speech bubbles ----------

const GLYPHS = {
  A: [".#.", "#.#", "###", "#.#", "#.#"], B: ["##.", "#.#", "##.", "#.#", "##."], C: [".##", "#..", "#..", "#..", ".##"],
  D: ["##.", "#.#", "#.#", "#.#", "##."], E: ["###", "#..", "##.", "#..", "###"], F: ["###", "#..", "##.", "#..", "#.."],
  G: [".##", "#..", "#.#", "#.#", ".##"], H: ["#.#", "#.#", "###", "#.#", "#.#"], I: ["###", ".#.", ".#.", ".#.", "###"],
  J: ["..#", "..#", "..#", "#.#", ".#."], K: ["#.#", "#.#", "##.", "#.#", "#.#"], L: ["#..", "#..", "#..", "#..", "###"],
  M: ["#.#", "###", "###", "#.#", "#.#"], N: ["##.", "#.#", "#.#", "#.#", "#.#"], O: [".#.", "#.#", "#.#", "#.#", ".#."],
  P: ["##.", "#.#", "##.", "#..", "#.."], Q: [".#.", "#.#", "#.#", "##.", ".##"], R: ["##.", "#.#", "##.", "#.#", "#.#"],
  S: [".##", "#..", ".#.", "..#", "##."], T: ["###", ".#.", ".#.", ".#.", ".#."], U: ["#.#", "#.#", "#.#", "#.#", "###"],
  V: ["#.#", "#.#", "#.#", "#.#", ".#."], W: ["#.#", "#.#", "###", "###", "#.#"], X: ["#.#", "#.#", ".#.", "#.#", "#.#"],
  Y: ["#.#", "#.#", ".#.", ".#.", ".#."], Z: ["###", "..#", ".#.", "#..", "###"],
  0: ["###", "#.#", "#.#", "#.#", "###"], 1: [".#.", "##.", ".#.", ".#.", "###"], 2: ["##.", "..#", ".#.", "#..", "###"],
  3: ["##.", "..#", ".#.", "..#", "##."], 4: ["#.#", "#.#", "###", "..#", "..#"], 5: ["###", "#..", "##.", "..#", "##."],
  6: [".##", "#..", "###", "#.#", "###"], 7: ["###", "..#", ".#.", ".#.", ".#."], 8: ["###", "#.#", "###", "#.#", "###"],
  9: ["###", "#.#", "###", "..#", "##."], "%": ["#.#", "..#", ".#.", "#..", "#.#"], "!": [".#.", ".#.", ".#.", "...", ".#."],
  "?": ["##.", "..#", ".#.", "...", ".#."], "-": ["...", "...", "###", "...", "..."], ".": ["...", "...", "...", "...", ".#."],
  "'": [".#.", ".#.", "...", "...", "..."], ",": ["...", "...", "...", ".#.", "#.."], "$": [".##", "##.", ".#.", ".##", "##."],
  " ": ["...", "...", "...", "...", "..."],
};
const textW = (s) => s.length * 4 - 1;
function text(f, s, x, y, c) {
  [...s].forEach((ch, i) => GLYPHS[ch].forEach((row, j) => [...row].forEach((p, k) => p === "#" && set(f, x + i * 4 + k, y + j, c))));
}

// ---------- layout ----------

const FILE = [131, 53];
const CART = [124, 67];
const VENT = [113, 2];
const ROPE_X = 120;
const VAULT = [134, 34, 18]; // center x, y, radius
const DOOR = [2, 12, 18, 48]; // the bank's glass front door: x, y, w, h
const VAN = [23, 36];
const QUEUE_X = [52, 63, 74, 85];
const QUEUE_Y = 56;
const GUARD = [27, 68];
const TELLERS = [[57, 30], [97, 30]];
const DESK = [90, 74];
const PANEL_X = [3, 42, 81, 120];
const BAG_ROWS = 11;
const PANEL_Y = 95;
const PANEL_W = 37;
const PANEL_H = 33;
const HOLE = [80, 78];

// ---------- the bank (one backdrop; patches are cut from it) ----------

const OUT = { sky: "#9ad0f0", brick: ["#9a5a48", "#8a4e40"], win: "#f0d890", road: "#55555f", curb: "#9a9aa4", walk: "#c0c0c8" };
const FRAME = "#3a3a4a";
const isGlass = (x, y) => {
  if (y < 12 || y > 59 || x > 45) return false;
  if (x <= 1 || x === 20 || x === 21 || x >= 44) return false; // posts
  if (y <= 13) return false; // header
  if (x < 20 && (y === 24 || y === 25)) return false; // transom over the door
  if (x < 20 && (x === 10 || x === 11)) return y > 25; // the two door leaves meet
  if (x >= 22 && y >= 56) return false; // sill
  return true;
};

function outside(f) {
  for (let y = 10; y < 60; y++)
    for (let x = 0; x < 46; x++) {
      let c = OUT.sky;
      if (y >= 15 && y < 42) {
        // The building across the street: bricks and lit windows.
        const row = Math.floor((y - 15) / 3);
        c = OUT.brick[(row + Math.floor((x + (row % 2) * 2) / 4)) % 2];
        if ((y - 15) % 3 === 2) c = "#7a4236";
        const wx = (x + 1) % 9, wy = (y - 17) % 9;
        if (wx >= 2 && wx <= 6 && wy >= 0 && wy <= 5 && y < 40) c = wy === 0 ? "#5a3028" : (x + y) % 7 === 0 ? "#fff0b0" : OUT.win;
        if (y === 15) c = "#5a3028";
      }
      if (y >= 42) c = OUT.road;
      if (y === 46 && x % 6 < 3) c = "#e8e0a0";
      if (y === 52) c = OUT.curb;
      if (y > 52) c = (x + y) % 9 === 0 ? "#b0b0b8" : OUT.walk;
      set(f, x, y, c);
    }
  // A street lamp across the road.
  for (let y = 18; y < 42; y++) set(f, 36, y, "#2a2a34");
  set(f, 35, 18, "#2a2a34");
  set(f, 34, 18, "#fff0a0");
  set(f, 34, 19, "#fff0a0");
}

function glassFrame(f) {
  for (let y = 10; y < 60; y++)
    for (let x = 0; x < 46; x++) {
      if (y < 12) {
        set(f, x, y, y === 10 ? "#2a2a38" : FRAME);
        continue;
      }
      if (!isGlass(x, y)) set(f, x, y, (x === 0 || x === 44) ? "#2a2a38" : FRAME);
    }
  // Glints on the glass.
  for (let i = 0; i < 40; i++) {
    for (const [x0, y0] of [[4, 30], [13, 32], [26, 16], [36, 20]]) {
      const x = x0 + Math.floor(i / 6), y = y0 + i;
      if (i % 6 < 3 && isGlass(x, y) && y < 58) set(f, x, y, "#ffffff40");
    }
  }
  // Push bars and a little sign on the door.
  for (let x = 4; x < 9; x++) set(f, x, 42, P.X);
  for (let x = 13; x < 18; x++) set(f, x, 42, P.X);
  fill(f, 2, 28, 18, 7, "#2a6b35");
  text(f, "BANK", 4, 29, P.y);
}

function wall(f) {
  for (let y = 10; y < 60; y++)
    for (let x = 46; x < W; x++) {
      let c = (x * 3 + y * 5) % 23 === 0 || (x + y * 2) % 31 === 0 ? "#d6c6a2" : "#e6d8b8";
      if (y >= 50) c = (x % 12 === 0) ? "#5a3a20" : "#7a5030";
      if (y === 50) c = "#c8a040";
      set(f, x, y, c);
    }
  // Pilasters.
  for (const px of [46, 112])
    for (let y = 10; y < 60; y++)
      for (let x = px; x < px + 4; x++) set(f, x, y, y < 13 ? "#c8b890" : x === px ? "#f2e8d0" : x === px + 3 ? "#b8a880" : "#dccca8");
}

function ceiling(f) {
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < W; x++) {
      let c = (x + (y > 3 ? 4 : 0)) % 8 === 0 && y % 4 === 2 ? "#3a2c4a" : "#2a2238";
      if (y === 8) c = P.y;
      if (y === 9) c = P.Y;
      set(f, x, y, c);
    }
  // The vent the crawler comes through.
  const [vx, vy] = VENT;
  for (let y = vy; y < vy + 6; y++)
    for (let x = vx; x < vx + 15; x++) {
      let c = "#8a8ea0";
      if (y > vy && y < vy + 5 && x > vx && x < vx + 14) c = (x - vx) % 2 ? "#101018" : "#6a6e80";
      set(f, x, y, c);
    }
}

function poster(f, x0, y0, w, h, bg, rim, lines) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(f, x, y, x === x0 || y === y0 || x === x0 + w - 1 || y === y0 + h - 1 ? rim : bg);
  set(f, x0 + Math.floor(w / 2), y0 - 1, P.k);
  lines.forEach(([s, c], i) => text(f, s, x0 + Math.round((w - textW(s)) / 2), y0 + 2 + i * 7, c));
}

function counter(f) {
  // Counter top and front.
  for (let y = 42; y < 60; y++)
    for (let x = 52; x < 112; x++) {
      let c;
      if (y < 45) c = y === 42 ? "#5aa08a" : y === 44 ? "#1d4e40" : (x * 7 + y) % 11 === 0 ? "#5aa08a" : "#2e6e5a";
      else if (y === 45) c = P.y;
      else c = (x - 52) % 15 === 0 || y === 58 ? P.N : (x - 52) % 15 === 1 || y === 47 ? "#8a5a34" : P.n;
      set(f, x, y, c);
    }
  // The glass partition rail (the bars are a scene sprite over the tellers).
  for (let x = 52; x < 112; x++) set(f, x, 29, "#8a8ea0");
}

const BAG = ["..SSS..", "...S...", "..sss..", ".ssMss.", "ssMMMss", "ssMssss", "ssMMMss", "ssssMss", "ssMMMss", ".ssMss.", "..sss.."];
function vault(f) {
  const [cx, cy, R] = VAULT;
  for (let y = cy - R - 1; y <= cy + R + 1; y++)
    for (let x = cx - R - 1; x <= cx + R + 1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d > R + 0.5) continue;
      if (d > R - 3) {
        const ang = Math.atan2(y + 0.5 - cy, x + 0.5 - cx);
        const bolt = d > R - 2 && d < R - 0.5 && Math.abs(((ang / (Math.PI * 2)) * 16) % 1) < 0.12;
        set(f, x, y, bolt ? P.y : d > R - 1 ? "#6a7080" : "#a8aebc");
        continue;
      }
      // Inside: steel walls with shelves of money bags.
      let c = (x + y) % 2 ? "#2a2e3a" : "#30343f";
      if (y > cy + 8) c = "#45495a";
      if (y === cy - 6 || y === cy + 3) c = "#7a7e90";
      set(f, x, y, c);
    }
  const bag = BAG;
  for (const [bx, by] of [[122, 19], [130, 18], [138, 19], [118, 29], [126, 29], [134, 29], [142, 29]])
    bag.forEach((row, j) => [...row].forEach((ch, i) => {
      const hx = bx + i, hy = by + j;
      if (P[ch] && Math.hypot(hx + 0.5 - cx, hy + 0.5 - cy) < R - 3) set(f, hx, hy, P[ch]);
    }));
  // Gold bars on the floor of the vault.
  for (const [gx, gy] of [[124, 45], [130, 45], [136, 45], [127, 43], [133, 43], [142, 45]])
    for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) set(f, gx + i, gy + j, j ? P.Y : P.y);
  // The open door, seen edge-on, swung to the right.
  for (let y = cy - R + 1; y <= cy + R - 1; y++) {
    const half = Math.sqrt(Math.max(0, R * R - (y + 0.5 - cy) ** 2));
    if (half < 4) continue;
    for (let x = 152; x < 159; x++) set(f, x, y, x === 152 ? "#6a7080" : x === 158 ? "#5a6070" : x < 155 ? "#c8ccd8" : "#9aa0b0");
  }
  for (let y = cy - 4; y <= cy + 4; y++) set(f, 158, y, P.y);
  set(f, 159, cy, P.y);
}

function floor(f) {
  for (let y = 60; y < 92; y++)
    for (let x = 0; x < W; x++) {
      const row = Math.floor((y - 60) / 8), col = Math.floor((x + (row % 2) * 6) / 12);
      let c = (row + col) % 2 ? "#a49a88" : "#958b7a";
      if ((y - 60) % 8 === 7 || (x + (row % 2) * 6) % 12 === 11) c = "#b6ad9c";
      if (y === 60) c = "#4e3a2e";
      if (y === 61) c = "#6a5444";
      set(f, x, y, c);
    }
  // The waiting-line ropes.
  for (const sx of [48, 97]) {
    for (let y = 64; y < 79; y++) set(f, sx, y, P.Y);
    set(f, sx - 1, 78, P.Y);
    set(f, sx + 1, 78, P.Y);
    set(f, sx, 63, P.y);
  }
  for (let x = 49; x < 97; x++) set(f, x, 65 + Math.round(Math.sin(((x - 48) / 49) * Math.PI) * 3), "#b3263a");
}

function strip(f) {
  for (let y = 92; y < H; y++)
    for (let x = 0; x < W; x++) set(f, x, y, y === 92 ? "#1a1020" : (x + y) % 4 === 0 && (y % 4 === 1) ? "#241c36" : "#1a1428");
}

function cart(f) {
  const [x0, y0] = CART;
  for (let x = x0; x < x0 + 28; x++) {
    set(f, x, y0 + 1, P.X);
    set(f, x, y0 + 2, P.x);
  }
  // Stacks of bills on the lower shelf.
  for (let x = x0 + 2; x < x0 + 26; x++)
    for (let y = y0 + 8; y < y0 + 14; y++) set(f, x, y, (x - x0) % 6 === 1 ? P.M : (y - y0) % 2 ? P.m : "#b8e898");
  for (let x = x0 + 2; x < x0 + 26; x += 6) for (let y = y0 + 8; y < y0 + 14; y++) set(f, x + 2, y, P.w);
  for (let x = x0; x < x0 + 28; x++) set(f, x, y0 + 14, P.x);
  for (const lx of [x0, x0 + 27]) for (let y = y0 + 1; y < y0 + 16; y++) set(f, lx, y, P.x);
  for (const wx of [x0 + 2, x0 + 24]) {
    fill(f, wx, y0 + 16, 3, 3, P.k);
    set(f, wx + 1, y0 + 17, P.x);
  }
}

function bank() {
  const f = blank(W, H);
  ceiling(f);
  outside(f);
  wall(f);
  poster(f, 54, 13, 23, 16, "#c8303a", P.y, [["SAVE", P.w], ["999%", P.y]]);
  poster(f, 88, 13, 23, 16, "#24408a", P.b, [["LOANS", P.w], ["1000%", P.y]]);
  // A clock between the posters.
  for (let y = 14; y < 21; y++)
    for (let x = 79; x < 86; x++) {
      const d = Math.hypot(x + 0.5 - 82.5, y + 0.5 - 17.5);
      if (d < 3.6) set(f, x, y, d > 2.6 ? P.k : P.W);
    }
  set(f, 82, 16, P.k);
  set(f, 82, 17, P.k);
  set(f, 83, 17, P.k);
  vault(f);
  counter(f);
  floor(f);
  cart(f);
  strip(f);
  glassFrame(f);
  return f;
}

const BANK = bank();
function crop(x, y, w, h, src = BANK) {
  const f = blank(w, h);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const sx = x + i, sy = y + j;
      if (sx < 0 || sy < 0 || sx >= src.w || sy >= src.h) continue;
      const s = (sy * src.w + sx) * 4;
      f.px.set(src.px.subarray(s, s + 4), (j * w + i) * 4);
    }
  return f;
}
/** The bank at [x, y, w, h] with layers ({ f, x, y } in stage pixels) on top. */
function patch([x, y, w, h], layers = []) {
  const f = crop(x, y, w, h);
  for (const l of layers) stamp(f, l.f, l.x - x, l.y - y);
  return f;
}
/** The glass wall's frame alone (the glass see-through), to draw over things outside. */
function frameOverlay() {
  const f = crop(0, 10, 46, 50);
  for (let y = 0; y < 50; y++) for (let x = 0; x < 46; x++) if (isGlass(x, y + 10)) f.px.fill(0, (y * 46 + x) * 4, (y * 46 + x) * 4 + 4);
  return f;
}

// ---------- people (10 wide, 22 tall, facing us) ----------

const BODY = [
  "....tt....",
  "..115511..",
  ".11115111.",
  "1111511111",
  "1211111121",
  "1211111121",
  "t21111112t",
  ".11111111.",
  "..333333..",
  "..33..33..",
  "..33..33..",
  "..33..33..",
  "..33..33..",
  ".444..444.",
];
const COAT = [...BODY.slice(0, 8), "..111111..", "..111111..", "...3..3...", "...3..3...", "...3..3...", "..44..44.."];
const DRESS = [...BODY.slice(0, 8), ".11111111.", "1111111111", "..t....t..", "..t....t..", "..t....t..", ".44....44."];
function person(head, body, s) {
  return swap([...pad(head), ...body], s);
}
/** A walking frame: the legs swing apart. */
function stride(rows) {
  return rows.map((r, i) => {
    if (i < 18) return r;
    const a = [...r];
    const out = Array(a.length).fill(".");
    a.forEach((ch, x) => {
      if (ch === ".") return;
      const nx = x < a.length / 2 ? x - 1 : x + 1;
      if (nx >= 0 && nx < a.length) out[nx] = ch;
    });
    return out.join("");
  });
}
/** Ducking with hands over the head. */
function duck(rows) {
  const head = rows.slice(0, 8);
  const out = [...Array(8).fill(".........."), ...head, ...rows.slice(9, 13), rows[21]];
  const g = out.map((r) => [...r]);
  for (const [y, x] of [[8 + 1, 1], [8 + 1, 8], [8 + 2, 1], [8 + 2, 8], [8 + 3, 2], [8 + 3, 7]]) g[y][x] = "t";
  return g.map((r) => r.join("")).concat([]).slice(0, 22).concat(Array(Math.max(0, 22 - out.length)).fill(".........."));
}
/** Hands up! */
function handsUp(rows) {
  const g = rows.map((r) => [...r]);
  for (const y of [13, 14]) for (const x of [0, 9]) if (g[y][x] !== ".") g[y][x] = ".";
  const arm = rows[11][2] === "." ? rows[11][3] : rows[11][2];
  for (let y = 3; y < 11; y++) {
    g[y][0] = y < 5 ? "t" : arm;
    g[y][9] = y < 5 ? "t" : arm;
  }
  return g.map((r) => r.join(""));
}

const HEAD = {
  crawler: ["...jjjj...", "..jjjjjj..", ".zjjjjjjz.", ".zkwkkwkz.", ".ztttttt..", "..zztttt..", "...tttt...", "....tt...."],
  disguise: ["...UUUU...", "..UUUUUU..", ".UUUUUUUU.", "..tttttt..", "..kwkkwk..", "..ttTTtt..", "..NNNNNN..", "...tttt..."],
  demo: ["...yyyy...", "..yyyyyy..", ".yyyyyyyy.", ".zttttttz.", "..tkttkt..", ".zztttttt.", "..zDDDDt..", "...DDDD..."],
  hacker: ["...zzzz...", "..gzggzg..", ".gggggggg.", ".gztttzgg.", ".gtbbtbbg.", ".gtttttzg.", "..gttzzg..", "...gggg..."],
  cool: ["...jjjj...", "..jjjjjj..", ".zjjjjjjz.", ".zkkkkkkz.", ".ztttttt..", "..zztttt..", "...tttt...", "....tt...."],
  guard: ["...xxxx...", "..xxyxxx..", ".kkkkkkkk.", "..tttttt..", "..tkttkt..", "..tttttt..", "..ttNNtt..", "...tttt..."],
  cop: ["...UUUU...", "..UUyUUU..", ".kkkkkkkk.", "..dddddd..", "..dkddkd..", "..dddddd..", "..ddddDd..", "...dddd..."],
  swat: ["...kkkk...", "..kjjjjk..", ".kjjjjjjk.", ".kbbbbbbk.", ".kbbbbbbk.", "..tttttt..", "..jjjjjj..", "...jjjj..."],
  explorer: ["...aaaa...", "..aWaaaa..", ".AAAAAAAA.", "..tttttt..", "..tkttkt..", "..tttttt..", "..ttTTtt..", "...tttt..."],
  man: ["..........", "...hhhh...", "..hhhhhh..", "..htttth..", "..tkttkt..", "..tttttt..", "...tTTt...", "...tttt..."],
  lady: ["....qq....", "...eeee...", "..eeeeee..", "..etttte..", "..tkttkt..", "..tttttt..", "..e.tt.e..", "...tttt..."],
  gran: ["..........", "...vvvv...", "..vvvvvv..", "..vttttv..", "..kkttkk..", "..tttttt..", "...tTTt...", "...tttt..."],
  kid: ["..........", "..........", "...hhhh...", "..hhhhhh..", "..tttttt..", "..tkttkt..", "..tttttt..", "...tttt..."],
  teller: ["..........", "...NNNN...", "..NNNNNN..", "..NttttN..", "..tkttkt..", "..tttttt..", "...tTTt...", "...tttt..."],
  teller2: ["...eeee...", "..eeeeee..", ".eeeeeeee.", ".etttttte.", "..kkttkk..", "..tttttt..", "...tqqt...", "...tttt..."],
};

const crawler = person(HEAD.crawler, BODY, { 1: "j", 2: "k", 3: "j", 4: "k", 5: "x" });
const disguise = person(HEAD.disguise, COAT, { 1: "a", 2: "A", 3: "x", 4: "k", 5: "W" });
const demo = person(HEAD.demo, BODY, { 1: "o", 2: "O", 3: "u", 4: "N", 5: "y" });
const hacker = person(HEAD.hacker, BODY, { 1: "g", 2: "G", 3: "j", 4: "w", 5: "G" });
const coolCrawler = person(HEAD.cool, BODY, { 1: "j", 2: "k", 3: "j", 4: "k", 5: "x" });
const coolDisguise = swap(disguise.map((r, i) => (i === 4 ? "..kkkkkk.." : r)), {});
const coolDemo = demo.map((r, i) => (i === 4 ? "..kkkkkk.." : r));
const coolHacker = hacker.map((r, i) => (i === 4 ? ".gkkkkkkg." : r));
const dyed = swap(crawler, { t: "b", T: "u", j: "U", x: "u" });
const guard = person(HEAD.guard, BODY, { 1: "X", 2: "x", 3: "U", 4: "k", 5: "y" });
const cop = person(HEAD.cop, BODY, { 1: "u", 2: "U", 3: "U", 4: "k", 5: "y" });
const swat = person(HEAD.swat, BODY, { 1: "j", 2: "k", 3: "j", 4: "k", 5: "w" });
const explorer = person(HEAD.explorer, BODY, { 1: "a", 2: "A", 3: "A", 4: "N", 5: "R" });
const customers = [
  person(HEAD.man, BODY, { 1: "u", 2: "U", 3: "x", 4: "k", 5: "R" }),
  person(HEAD.lady, DRESS, { 1: "q", 2: "Q", 3: "q", 4: "r", 5: "W" }),
  person(HEAD.gran, COAT, { 1: "p", 2: "l", 3: "x", 4: "N", 5: "W" }),
  person(HEAD.kid, BODY, { 1: "y", 2: "Y", 3: "u", 4: "R", 5: "o" }),
];
const blinkRow = (rows, i, r) => rows.map((x, j) => (j === i ? r : x));

// The teller busts behind the counter (head and shoulders).
const tellerBust = (head, c) => swap([...pad(head), "....tt....", "..115511..", ".11115111.", "1111511111"], { 1: c, 5: "W" });

// The banker at a tiny desk, typing.
function desk(i) {
  const f = blank(26, 18);
  const bust = A(swap([...HEAD.man.slice(1), "....tt....", "..115511..", ".11115111."], { 1: "G", 5: "y", h: "N" }));
  stamp(f, bust, 2, 0);
  // Desk top and front.
  fill(f, 0, 10, 26, 2, P.n);
  fill(f, 1, 12, 24, 6, P.N);
  fill(f, 3, 13, 7, 4, "#5a3a20");
  set(f, 6, 15, P.y);
  // Little computer and a lamp.
  fill(f, 14, 3, 8, 6, P.x);
  fill(f, 15, 4, 6, 4, i % 2 ? "#3ac0a0" : "#2a8a7a");
  set(f, 16, 5, P.w);
  set(f, 17 + (i % 2), 6, P.w);
  fill(f, 17, 9, 2, 1, P.x);
  set(f, 24, 4, P.y);
  set(f, 23, 3, P.y);
  set(f, 22, 3, P.g);
  for (let y = 5; y < 10; y++) set(f, 24, y, P.G);
  // Hands typing on the keyboard.
  fill(f, 4, 9, 8, 1, P.X);
  set(f, i % 2 ? 4 : 5, 8, P.t);
  set(f, i % 2 ? 10 : 9, 8, P.t);
  return f;
}

// ---------- props ----------

function plant(i) {
  const f = blank(12, 22);
  // Pot.
  for (let y = 14; y < 22; y++) for (let x = 2 + (y > 17 ? 1 : 0); x < 10 - (y > 17 ? 1 : 0); x++) set(f, x, y, y === 14 ? "#d88a50" : x < 5 ? "#b05a30" : "#c86a3a");
  // Leaves, swaying.
  const leaves = [[5, 13, 0, -1], [5, 13, -1, -1], [5, 13, 1, -1], [5, 13, -1, 0], [6, 13, 1, 0]];
  const sway = i ? 1 : 0;
  for (const [x0, y0, dx, dy] of leaves)
    for (let k = 0; k < 9; k++) {
      const x = Math.round(x0 + dx * k * 0.6 + (k > 5 ? sway * Math.sign(dx || 1) : 0)), y = Math.round(y0 + (dy || 0.3) * k * 1.2 - (dy ? 0 : k * 0.5));
      set(f, x, y, k % 3 === 2 ? P.G : P.g);
      if (k > 2) set(f, x + 1, y, P.g);
    }
  return f;
}

function partition() {
  const f = blank(60, 13);
  for (const bx of [0, 20, 40, 59]) for (let y = 0; y < 13; y++) set(f, bx, y, "#8a8ea0");
  for (let x = 0; x < 60; x++) set(f, x, 0, "#8a8ea0");
  // Glints on the glass.
  for (const gx of [4, 24, 44]) for (let k = 0; k < 5; k++) set(f, gx + k, 3 + k, "#ffffff50");
  // The window numbers.
  fill(f, 1, 1, 5, 7, P.k);
  text(f, "1", 2, 2, P.y);
  fill(f, 41, 1, 5, 7, P.k);
  text(f, "2", 42, 2, P.y);
  return f;
}

function jar(i) {
  const f = blank(9, 11);
  // Lollipops: sticks and candy.
  const pops = [[2, 0, P.R], [4, 1, P.y], [6, 0, P.q], [3, 2, P.g], [5, 2, P.p]];
  for (const [x, y, c] of pops) {
    set(f, x, y, c);
    set(f, x + 1, y, c);
    set(f, x, y + 1, c);
    set(f, x + 1, y + 1, c);
    for (let k = y + 2; k < 6; k++) set(f, x, k, P.W);
  }
  for (let y = 4; y < 11; y++)
    for (let x = 1; x < 8; x++) {
      const edge = x === 1 || x === 7 || y === 10;
      set(f, x, y, edge ? "#d0f0ffd0" : "#c8ecff50");
    }
  for (let x = 1; x < 8; x++) set(f, x, 4, "#ffffff");
  set(f, 2 + i * 3, 6, P.w);
  set(f, 2 + i * 3, 7, P.w);
  return f;
}

const sack = A(BAG);
const decoy = A(["..kk..", ".kWWk.", "WWWqWW", "WWqqWW", "WWWqWW", "WWqqWW", ".WWWW."]);
const briefcase = A(["..kk...", ".k..k..", "NNNNNNN", "NnnynnN", "NnnnnnN", "NNNNNNN"]);
const laptop = A(["XXXXXXX", "XbbbbbX", "XbbbbbX", "XXXXXXX", "xxxxxxxx"]);
const rope = (() => {
  const f = blank(1, 70);
  for (let y = 0; y < 70; y++) set(f, 0, y, y % 3 === 0 ? "#a8864a" : "#d8b878");
  return f;
})();

function bill(i) {
  const f = blank(5, 4);
  const shapes = [["mmmmm", "mMwMm", "mmmmm", "....."], [".mm..", "mMwm.", ".mMwm", "..mm."], [".....", "mmmmm", "mMwMm", "mmmmm"], ["..mm.", ".mwMm", "mwMm.", ".mm.."]];
  shapes[i].forEach((r, y) => [...r].forEach((ch, x) => set(f, x, y, P[ch])));
  return f;
}
function confetti(i) {
  // Shredded strips falling.
  const f = blank(14, 14);
  for (let k = 0; k < 9; k++) {
    const x = (k * 5 + i * 3) % 13, y = (k * 7 + i * 4) % 12;
    set(f, x, y, k % 2 ? P.m : P.M);
    set(f, x, y + 1, k % 2 ? P.m : P.w);
  }
  return f;
}
function smoke(i, size = 18) {
  const f = blank(size, size);
  const r = size / 2 - 1;
  const puffs = [[0.5, 0.55, 0.45], [0.3, 0.45, 0.35], [0.7, 0.4, 0.35], [0.5, 0.3, 0.3]];
  const grow = [0.5, 0.75, 1, 1][i];
  for (const [px, py, pr] of puffs)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x + 0.5 - px * size, y + 0.5 - py * size);
        if (d < pr * r * 2 * grow) set(f, x, y, i === 3 && (x + y) % 2 ? "" : d > pr * r * 2 * grow - 1.2 ? "#a8acb8" : "#d8dce4");
      }
  return f;
}
function dyeCloud(i) {
  const f = blank(24, 24);
  const r = [5, 9, 11, 11][i];
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 24; x++) {
      const d = Math.hypot(x - 12, y - 12) + ((x * 7 + y * 3) % 3);
      if (d > r) continue;
      if (i === 3 && (x + y) % 2) continue;
      set(f, x, y, d < r * 0.5 ? "#c8ecff" : d < r * 0.8 ? "#3a8af0" : "#24408a");
    }
  return f;
}
function stars(i) {
  const f = blank(16, 8);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3 + i / 4) * Math.PI * 2;
    const x = Math.round(7 + Math.cos(a) * 6), y = Math.round(4 + Math.sin(a) * 2.5);
    set(f, x, y, P.y);
    set(f, x + 1, y, P.y);
    set(f, x, y - 1, P.w);
  }
  return f;
}
const dust = [A([".X.X.", "X.X.X", ".X.X."]), A(["X...X", ".....", "X...X"])];
const sparkle = [A(["..w..", ".wyw.", "wyyyw", ".wyw.", "..w.."]), A([".....", "..y..", ".yWy.", "..y..", "....."])];
const pellet = [A(["..yy...", "yywwwy.", "..yy..."]), A(["...y...", ".yywwwy", "...y..."])];
const pelletL = pellet.map((f) => f).map((_, i) => A(mirror([["..yy...", "yywwwy.", "..yy..."], ["...y...", ".yywwwy", "...y..."]][i])));

/** A comic "POW"-style burst with a word in it. */
function bang(word, fillC, rimC, size = 26) {
  const f = blank(size, size);
  const c = size / 2;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const a = Math.atan2(y + 0.5 - c, x + 0.5 - c);
      const spike = c - 1 - (Math.abs(Math.sin(a * 5)) * c * 0.35);
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      if (d < spike) set(f, x, y, d > spike - 1.3 ? rimC : fillC);
    }
  const tw = textW(word);
  text(f, word, Math.round(c - tw / 2) + 1, Math.round(c - 2) + 1, P.k);
  text(f, word, Math.round(c - tw / 2), Math.round(c - 2), P.w);
  return f;
}

// ---------- the van and the car ----------

function van(sacks, opts = {}) {
  const f = blank(23, 17);
  // Body.
  for (let y = 1; y < 13; y++)
    for (let x = 0; x < 23; x++) {
      if (y < 3 && x < 3) continue;
      if (y === 1 && x < 4) continue;
      const edge = x === 0 || x === 22 || y === 1 || y === 12;
      set(f, x, y, edge ? P.k : opts.wreck ? (x + y) % 3 ? "#b8bcc8" : "#8a8ea0" : y > 9 ? "#c8ccd8" : "#eceef4");
    }
  // Windshield with the hacker inside, and the cargo window.
  for (let y = 3; y < 7; y++) for (let x = 1; x < 6; x++) set(f, x, y, x + (6 - y) < 3 ? "" : P.b);
  set(f, 4, 4, P.g);
  set(f, 4, 5, P.g);
  set(f, 3, 5, P.g);
  set(f, 2, 6, "#ffffff");
  for (let y = 2; y < 8; y++) for (let x = 8; x < 21; x++) set(f, x, y, "#2a2e3a");
  const spots = [[8, 5], [12, 5], [16, 5], [10, 2], [14, 2]];
  for (let k = 0; k < Math.min(sacks, spots.length); k++) {
    const [sx, sy] = spots[k];
    [".SS.", "sMMs", "ssss"].forEach((r, j) => [...r].forEach((ch, i) => set(f, sx + i, sy + j, P[ch])));
  }
  // A stripe along the side.
  if (!opts.wreck) for (let x = 1; x < 22; x++) {
    set(f, x, 9, P.R);
    set(f, x, 10, x % 4 === 0 ? P.y : P.R);
  }
  // Wheels and bumper.
  for (let x = 0; x < 3; x++) set(f, x, 11, P.X);
  for (const wx of [5, 17])
    for (let y = 11; y < 17; y++)
      for (let x = wx - 3; x <= wx + 3; x++) {
        const d = Math.hypot(x - wx, y - 13.5);
        if (d < 3) set(f, x, y, d < 1.2 ? P.X : P.k);
      }
  if (opts.wreck) {
    // Crumpled front, popped door.
    for (let y = 2; y < 12; y++) for (let x = 0; x < 4; x++) set(f, x, y, (x + y) % 2 ? P.k : "#8a8ea0");
    for (let x = 8; x < 21; x++) set(f, x, 3, "#5a5e6e");
  }
  return f;
}
function car(i) {
  const f = blank(22, 11);
  for (let y = 4; y < 9; y++) for (let x = 0; x < 22; x++) set(f, x, y, x === 0 || x === 21 || y === 8 ? P.k : y === 4 ? "#ff6a70" : P.R);
  for (let y = 0; y < 4; y++) for (let x = 5 + (3 - y); x < 16 - (3 - y) * 0.5; x++) set(f, x, y, y === 0 ? P.k : x === 11 ? P.r : P.b);
  set(f, 21, 5, P.y);
  set(f, 20, 5, P.y);
  for (const wx of [5, 16])
    for (let y = 7; y < 11; y++)
      for (let x = wx - 2; x <= wx + 2; x++) {
        const d = Math.hypot(x - wx, y - 8.5);
        if (d < 2.3) set(f, x, y, d < 1 ? (i ? P.x : P.X) : P.k);
      }
  // Speed lines.
  for (const y of [3, 5, 7]) for (let x = 0; x < 3; x++) if (i % 2 === (y % 2 ? 1 : 0)) set(f, x - 0, y - 0, "");
  return f;
}

// ---------- heroes and villains (all original) ----------

// A caped hero: teal suit, orange cape, a yellow star.
function hero(i) {
  const f = blank(16, 22);
  // Cape flowing out behind (to the left).
  for (let y = 7; y < 20; y++) for (let x = 0; x < 5; x++) if (x >= 4 - Math.floor((y - 7) / 3) - (i && y > 12 ? 1 : 0)) set(f, x, y, y % 4 === 0 ? P.O : P.o);
  const rows = pad([
    "....cccc..",
    "...cccccc.",
    "...tttttt.",
    "...kkkkkk.",
    "...kwkkwk.",
    "...tttttt.",
    "....tttt..",
    "..oo.tt...",
    ".ooccccccc",
    ".occcyycct",
    ".occyyyyc.",
    ".occcyycc.",
    ".occcccccc",
    "..cccccc..",
    "..yyyyyy..",
    "..cccccc..",
    "..cc..cc..",
    "..cc..cc..",
    "..cc..cc..",
    "..yy..yy..",
    "..yy..yy..",
    ".yyy..yyy.",
  ]);
  stamp(f, A(rows), 4, 0);
  // Fist forward.
  set(f, 15, 9, P.t);
  set(f, 14, 9, P.c);
  return f;
}

// A mad inventor with two clanking robot arms: purple coat, brass goggles.
function villain(i) {
  const f = blank(26, 24);
  const body = pad([
    "...vvvv...",
    "..vttttv..",
    "..yyyyyy..",
    "..ykyyky..",
    "..tttttt..",
    "..tkkkkt..",
    "...tttt...",
    "..pppppp..",
    ".pppWWppp.",
    "ppppWWpppp",
    "pppppppppp",
    "tpppppppppt",
    ".pppppppp.",
    ".pppppppp.",
    ".pppppppp.",
    "..pp..pp..",
    "..kk..kk..",
    "..kk..kk..",
    "..kk..kk..",
    ".kkk..kkk.",
  ]);
  stamp(f, A(body), 8, 4);
  // Two robot arms from the back, segment by segment, claws open/closed.
  const up = i % 2;
  const arms = [
    [[10, 13], [7, 10], [4, 7 - up], [2, 4 - up]],
    [[17, 13], [20, 10], [22, 7 + up], [24, 4 + up]],
  ];
  for (const arm of arms) {
    for (let s = 0; s < arm.length - 1; s++) {
      const [x0, y0] = arm[s], [x1, y1] = arm[s + 1];
      for (let k = 0; k <= 6; k++) {
        const x = Math.round(x0 + ((x1 - x0) * k) / 6), y = Math.round(y0 + ((y1 - y0) * k) / 6);
        set(f, x, y, P.x);
        set(f, x, y + 1, "#4a4e60");
      }
      set(f, x1, y1, P.R);
    }
    const [cx, cy] = arm[arm.length - 1];
    for (const [dx, dy] of up ? [[-1, -1], [1, -1], [-1, -2], [1, -2]] : [[-1, -1], [1, -1], [0, -2]]) set(f, cx + dx, cy + dy, P.X);
  }
  return f;
}

// ---------- the crew's comic panels ----------

function halftone(f, x0, y0, w, h, base, dot) {
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) {
      const on = (y % 3 === 0 && x % 3 === 0) || (y % 3 === 1 && x % 3 === 2 && (y - y0) > h / 2);
      set(f, x, y, on ? dot : base);
    }
}
function panelFrame(f, label) {
  for (let x = 0; x < PANEL_W; x++) {
    set(f, x, 0, P.k);
    set(f, x, PANEL_H - 1, P.k);
  }
  for (let y = 0; y < PANEL_H; y++) {
    set(f, 0, y, P.k);
    set(f, PANEL_W - 1, y, P.k);
  }
  // Caption box in the corner.
  const lw = textW(label) + 4;
  fill(f, 1, 1, lw, 7, "#f8e070");
  for (let x = 1; x < lw + 1; x++) set(f, x, 8, P.k);
  for (let y = 1; y < 9; y++) set(f, lw + 1, y, P.k);
  text(f, label, 3, 2, P.k);
}
/** A bust with a headset; `rows` are drawn at (x, y) inside the panel. */
function bustPanel(base, dot, label, rows, x, y, extra) {
  return (i) => {
    const f = blank(PANEL_W, PANEL_H);
    halftone(f, 1, 1, PANEL_W - 2, PANEL_H - 2, base, dot);
    extra?.before?.(f, i);
    stamp(f, A(typeof rows === "function" ? rows(i) : rows), x, y);
    extra?.after?.(f, i);
    panelFrame(f, label);
    return f;
  };
}

const ventBust = (i) => pad([
  "....jjjjjjjj....",
  "...jjjjjjjjjj...",
  "..jjjjjjjjjjjj..",
  ".zzjjjjjjjjjjzz.",
  ".zzkkkkkkkkkkzz.",
  i === 2 ? ".zzkkkkkkkkkkzz." : ".zzkwwkkkkwwkzz.",
  i === 2 ? ".zzkkkkkkkkkkzz." : ".zzkwkkkkkwkkzz.",
  "..ztttttttttt...",
  "..zttttTtttttt..",
  "...zzttttttttt..",
  "....zzttkkttt...",
  ".....ttttttt....",
  "......ttttt.....",
  "...jjjjjjjjjj...",
  "..jjjjjxxjjjjj..",
  ".jjjjjjjjjjjjjj.",
  ".jjjjjjjjjjjjjj.",
  "jjjjjjjjjjjjjjjj",
]);
const disguiseBust = (i) => pad([
  ".....UUUUUU.....",
  "....UUUUUUUU....",
  "...UUUUUUUUUU...",
  "...UkkkkkkkkU...",
  ".UUUUUUUUUUUUUU.",
  "...tttttttttt...",
  i === 1 ? "..kkkkkTkkkkk..." : "..kkkkkTkkkkk...",
  i === 1 ? "..kWWkkTkWWkk..." : "..kWkkkTkkWkk...",
  "..kkkkkTkkkkk...",
  "...tttTTTttttz..",
  i === 3 ? "..NNNNNNNNNNNz.." : "..NNNNNNNNNNz...",
  i === 3 ? ".NNNtttttNNNz..." : "..NNNtttNNNz....",
  "....tttkkttz....",
  ".....tttttt.....",
  "...aaaWWWWaaa...",
  "..aaaaaWWaaaaa..",
  ".aaaaaaWWaaaaaa.",
  "aaaaaaaWWaaaaaaa",
]);
const demoBust = (i) => pad([
  "....yyyyyyyy....",
  "...yyyyyyyyyy...",
  "..yyywyyyyyyyy..",
  ".yyyyyyyyyyyyyy.",
  ".zztttttttttzz..",
  ".zzttkkkttkkkz..",
  i === 1 ? ".zztttkttttktz.." : ".zzttwkttwkttz..",
  "..zttttTTttttt..",
  "...zztttttttt...",
  "....zzDDDDDDt...",
  ".....DDDkkDD....",
  "......DDDDD.....",
  "...oooyooyooo...",
  "..ooooyooyoooo..",
  ".oooooyooyooooo.",
  ".oooooyooyooooo.",
  "ooooooyooyoooooo",
  "ooooooyooyoooooo",
]);
const hackerBust = (i) => pad([
  "....zzzzzzzz....",
  "...zgggggggggz..",
  "..zggggggggggz..",
  ".zzggggggggggzz.",
  ".zzgtttttttttzz.",
  ".zzgbbbbtbbbbzz.",
  i === 2 ? ".zzgbbbbtbbbbzz." : ".zzgbwbbtbwbbzz.",
  "..zgtttttttttg..",
  "..gzzttttttttg..",
  "..ggtzztkktttg..",
  "...ggtttttttg...",
  "....ggggggggg...",
  "..gggggGGgggggg.",
  ".ggggggGGggggggg",
  "gggggggGGggggggg",
  "gggggggGGggggggg",
  "gggggggggggggggg",
  "gggggggggggggggg",
]);

const panels = {
  panelVent: [0, 1, 2, 3].map(bustPanel("#5a5e72", "#6e7288", "VENTS", ventBust, 8, 13, {
    before(f) {
      // The duct: ribbed walls going back to a dark square.
      for (let y = 9; y < PANEL_H - 1; y++) for (let x = 1; x < PANEL_W - 1; x++) if ((x - 2) % 6 === 0) set(f, x, y, "#4a4e60");
      fill(f, 14, 3, 10, 7, "#20222c");
    },
    after(f, i) {
      // Flashlight in a gloved hand, beam flickering.
      fill(f, 25, 26, 5, 3, P.x);
      set(f, 30, 27, P.y);
      if (i !== 3) for (let k = 0; k < 6; k++) for (let j = -Math.floor(k / 2); j <= Math.floor(k / 2); j++) set(f, 31 + k, 27 + j, "#fff4b060");
    },
  })),
  panelDisguise: [0, 1, 2, 3].map(bustPanel("#d85a90", "#f08ab8", "COVER", disguiseBust, 11, 14, {
    after(f, i) {
      // A spare fake nose and mustache on a stick, wiggling.
      const y = 18 + (i % 2);
      fill(f, 3, y, 5, 2, P.N);
      for (let k = 0; k < 9; k++) set(f, 5, y + 2 + k, P.W);
    },
  })),
  panelDemo: [0, 1, 2, 3].map(bustPanel("#e08a30", "#f8b060", "BOOM", demoBust, 4, 14, {
    after(f, i) {
      // Holding up a bundle of red sticks, the fuse sparking.
      for (const sx of [24, 27, 30]) fill(f, sx, 17, 3, 12, P.R);
      for (const sx of [25, 28, 31]) fill(f, sx, 17, 1, 12, "#ff6a70");
      fill(f, 23, 22, 11, 2, P.k);
      for (let k = 0; k < 5; k++) set(f, 28 + (k % 2), 16 - k, P.W);
      const sp = [[29, 10], [27, 10], [30, 11], [28, 9]][i];
      set(f, sp[0], sp[1], P.y);
      set(f, sp[0] + 1, sp[1] - 1, P.w);
      set(f, sp[0] - 1, sp[1] + 1, P.o);
      fill(f, 22, 24, 3, 4, P.t);
    },
  })),
  panelHacker: [0, 1, 2, 3].map(bustPanel("#1d4e5a", "#2a6a78", "HACKS", hackerBust, 3, 10, {
    before(f, i) {
      // Monitors on the van wall behind, scrolling code.
      for (const [mx, my] of [[22, 3], [22, 11]]) {
        fill(f, mx, my, 12, 7, P.k);
        for (let r = 0; r < 3; r++) for (let c = 0; c < 4 + ((r + i + mx) % 5); c++) set(f, mx + 2 + c, my + 2 + r * 2 - (r === 2 ? 1 : 0), (r + i) % 3 ? "#3ae070" : "#a0ffc0");
      }
    },
    after(f, i) {
      // The laptop in front, its glow, and typing hands.
      fill(f, 12, 26, 18, 6, P.X);
      fill(f, 13, 27, 16, 4, "#9aa0b0");
      fill(f, 12, 31, 20, 1, P.x);
      for (let k = 0; k < 3; k++) set(f, 15 + k * 5 + (i % 2), 26, P.t);
      for (let k = 0; k < 3; k++) set(f, 16 + k * 5 - (i % 2), 25, P.t);
    },
  })),
};

/** A speech bubble with the tail at the bottom left. */
function bubble(s) {
  const w = textW(s) + 6, h = 12;
  const f = blank(w, h);
  for (let y = 0; y < 9; y++)
    for (let x = 0; x < w; x++) {
      const corner = (x === 0 || x === w - 1) && (y === 0 || y === 8);
      if (corner) continue;
      const edge = x === 0 || x === w - 1 || y === 0 || y === 8;
      set(f, x, y, edge ? P.k : P.w);
    }
  for (const [x, y, c] of [[3, 8, P.w], [4, 8, P.w], [3, 9, P.k], [4, 9, P.w], [5, 9, P.k], [2, 10, P.k], [3, 10, P.k], [5, 8, P.k], [2, 9, P.k]]) set(f, x, y, c);
  set(f, 2, 8, P.k);
  text(f, s, 3, 2, P.k);
  return f;
}
const BUBBLES = ["GOT IT!", "GO GO!", "SMOOTH.", "NICE!", "VROOM!", "DIVE!", "BOOM.", "HUH?", "A FAKE!", "SEE YA!", "HEY!", "ACK!", "DUCK!", "WHAT?!", "MY VAN!", "ABORT!", "OOF!", "HELP!", "OH NO!", "COPS!", "RUN!", "SHREDS!", "COOL.", "NOOO!"];
const bubbleName = (s) => "say" + s.replace(/[^A-Z]/g, "");

// ---------- vault door, shredder, floor hole ----------

function vaultClose(stage) {
  // The round door swinging shut from its hinge on the right.
  const [cx, cy, R] = VAULT;
  const f = crop(cx - R - 1, cy - R - 1, 2 * R + 9, 2 * R + 3);
  const frac = [0.3, 0.6, 1][stage];
  const rx = (R - 2) * frac;
  const dcx = 152 - rx;
  for (let y = 0; y < f.h; y++)
    for (let x = 0; x < f.w; x++) {
      const sx = x + cx - R - 1, sy = y + cy - R - 1;
      const dx = (sx + 0.5 - dcx) / rx, dy = (sy + 0.5 - cy) / (R - 2);
      const d = Math.hypot(dx, dy);
      if (d > 1) continue;
      let c = d > 0.9 ? "#6a7080" : "#b8bcc8";
      if (stage === 2) {
        const ring = Math.abs(d - 0.55) < 0.06, hub = d < 0.16;
        const a = Math.atan2(dy, dx);
        const spoke = d < 0.5 && Math.abs(Math.sin(a * 3)) < 0.18;
        if (ring || spoke) c = "#7a7e90";
        if (hub) c = P.y;
        if (d > 0.72 && d < 0.84 && Math.abs(Math.sin(a * 6)) < 0.25) c = P.y;
      } else if (Math.abs(dx) < 0.2 && Math.abs(dy) < 0.5) c = "#7a7e90";
      set(f, x, y, c);
    }
  // The open door edge on the wall goes away as it closes.
  if (stage >= 1) for (let y = 0; y < f.h; y++) for (let x = 2 * R + 1; x < f.w; x++) {
    const sx = x + cx - R - 1, sy = y + cy - R - 1;
    if (sx >= 153) {
      const s = (sy * W + sx) * 4;
      // Plain wall where the door used to stand.
      set(f, x, y, sy >= 50 ? (sy === 50 ? "#c8a040" : "#7a5030") : "#e6d8b8");
      void s;
    }
  }
  return f;
}

function shredder(i) {
  const f = blank(26, 30);
  for (let y = 0; y < 22; y++)
    for (let x = 1; x < 25; x++) {
      const edge = x === 1 || x === 24 || y === 0 || y === 21;
      set(f, x, y, edge ? P.k : y < 4 ? "#5a5e72" : y === 10 ? P.y : "#8a8ea0");
    }
  fill(f, 5, 1, 16, 2, P.k); // the slot
  // Warning stripes and a red light.
  for (let x = 2; x < 24; x++) for (let y = 14; y < 18; y++) set(f, x, y, (x + y) % 4 < 2 ? P.y : P.k);
  fill(f, 20, 6, 2, 2, i % 2 ? "#ff6a70" : P.r);
  fill(f, 4, 6, 8, 2, P.k);
  text(f, "SHRED", 3, 6 - 0, P.w);
  // Strips coming out of the bottom.
  for (let k = 0; k < 7; k++) {
    const x = 5 + k * 3, len = 2 + ((k * 5 + i * 3) % 6);
    for (let y = 22; y < 22 + len; y++) set(f, x, y, (y + k) % 2 ? P.m : P.M);
  }
  // Wheels.
  for (const wx of [4, 20]) fill(f, wx, 22, 3, 2, P.k);
  return f;
}

function hole(stage) {
  const f = blank(26, 10);
  const r = [4, 8, 11][stage];
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 26; x++) {
      const d = Math.hypot((x + 0.5 - 13) / r, (y + 0.5 - 5) / (r * 0.38));
      if (d > 1) continue;
      set(f, x, y, d > 0.85 ? "#5a4a3a" : y < 4 ? "#0a0810" : (x + y) % 3 ? "#101820" : "#2a4a5a");
    }
  return f;
}

// ---------- sprites ----------

const twoFrames = (rows, blink) => [A(rows), A(blink)];
const walkFrames = (rows) => [A(rows), A(stride(rows))];
const queue = customers.map((c, i) => twoFrames(c, blinkRow(c, i === 3 ? 5 : 4, "..tttttt..")));

export const sprites = {
  bank: BANK,
  frame: frameOverlay(),
  ceilingPatch: crop(100, 0, 40, 10),
  vanGap: crop(VAN[0], VAN[1], 23, 17),
  cartGap: crop(FILE[0], FILE[1], 16, 15),
  van0: van(0),
  van1: van(1),
  van2: van(2),
  van3: van(3),
  van4: van(4),
  van5: van(5),
  vanFull: van(5),
  vanWreck: van(3, { wreck: true }),
  car: [car(0), car(1)],
  partition: partition(),
  jar: [jar(0), jar(1)],
  plant: [plant(0), plant(1)],
  plantB: [plant(1), plant(0)],
  desk: [0, 1, 2, 3].map(desk),
  teller: twoFrames(tellerBust(HEAD.teller, "u"), tellerBust(blinkRow(HEAD.teller, 4, "..tttttt.."), "u")),
  teller2: twoFrames(tellerBust(HEAD.teller2, "c"), tellerBust(blinkRow(HEAD.teller2, 4, "..tttttt.."), "c")),
  guard: twoFrames(guard, blinkRow(guard, 4, "..tttttt..")),
  guardShock: A(handsUp(guard)),
  crawler: A(crawler),
  crawlerWalk: walkFrames(crawler),
  crawlerUp: A(handsUp(crawler)),
  crawlerDyed: A(dyed),
  disguiseWalk: walkFrames(disguise),
  demoWalk: walkFrames(demo),
  demo: A(demo),
  hackerWalk: walkFrames(hacker),
  coolCrawler: walkFrames(coolCrawler),
  coolDisguise: walkFrames(coolDisguise),
  coolDemo: walkFrames(coolDemo),
  coolHacker: walkFrames(coolHacker),
  copWalk: walkFrames(cop),
  copDive: A(rotate(handsUp(cop))),
  disguiseDown: A(mirror(rotate(disguise))),
  swatWalk: walkFrames(swat),
  swat: A(swat),
  explorerWalk: walkFrames(explorer),
  explorer: A(explorer),
  hero: [hero(0), hero(1)],
  villain: [villain(0), villain(1)],
  sack,
  decoy,
  briefcase,
  laptop,
  rope,
  bill: [0, 1, 2, 3].map(bill),
  confetti: [0, 1, 2].map(confetti),
  smoke: [0, 1, 2, 3].map((i) => smoke(i)),
  dye: [0, 1, 2, 3].map(dyeCloud),
  boom: burst(36, 6, ["#ffffff", "#fff0a0", "#f2c442", "#f08a24", "#d0303a", "#5a3a3a"]),
  smallBoom: burst(18, 5, ["#ffffff", "#f2c442", "#f08a24", "#7a4a28"]),
  stars: [0, 1, 2, 3].map(stars),
  dust,
  sparkle,
  pellet,
  pelletL,
  pow: bang("POW!", P.y, P.R),
  crash: bang("CRASH", "#ff8a3a", P.k, 30),
  bonk: bang("BONK", P.w, P.k, 24),
  vaultClose: [0, 1, 2].map(vaultClose),
  shredder: [0, 1].map(shredder),
  hole: [0, 1, 2].map(hole),
  holeMask: crop(HOLE[0], HOLE[1] + 6, 26, 92 - HOLE[1] - 6),
  ...panels,
};
QUEUE_X.forEach((x, i) => {
  sprites[`cust${i}`] = queue[i];
  sprites[`duck${i}`] = patch([x, QUEUE_Y, 10, 22], [{ f: A(duck(customers[i])), x, y: QUEUE_Y }]);
});
for (const s of BUBBLES) sprites[bubbleName(s)] = bubble(s);

// ---------- animations ----------

const hold = (t0, t1, x, y, extra = {}) => [{ t: t0, x, y, ...extra }, { t: t1, x, y, ...extra }];
const fadeIn = (t0, t1, x, y, end = 1) => [{ t: t0, x, y, alpha: 0 }, { t: t1, x, y }, { t: end, x, y }];
const fadeInOut = (t0, t1, t2, t3, x, y) => [{ t: t0, x, y, alpha: 0 }, { t: t1, x, y }, { t: t2, x, y }, { t: t3, x, y, alpha: 0 }];
const say = (text, color, t0, t1, end = 1, y = 1) => ({ text, color, align: "center", keys: end < 1 ? fadeInOut(t0, t1, end - 0.04, end, 80, y) : fadeIn(t0, t1, 80, y) });
const fileAt = (t) => ({ t, x: FILE[0], y: FILE[1] });
const shift = (keys, dx, dy) => keys.map((k) => ({ ...k, x: k.x + dx, y: k.y + dy }));
const clamp = (keys, t0, t1) => keys.filter((k) => k.t >= t0 && k.t <= t1);
function hops(t0, t1, a, b, n, arc = 1, extra = () => ({})) {
  const keys = [];
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    keys.push({ t: t0 + (t1 - t0) * k, x: Math.round(a[0] + (b[0] - a[0]) * k), y: Math.round(a[1] + (b[1] - a[1]) * k), arc, ...extra(k) });
  }
  return keys;
}
/** A speech bubble in crew panel `n` (0..3). */
function speak(n, s, t0, t1) {
  const name = bubbleName(s);
  const w = sprites[name].w;
  const x = PANEL_X[n] + PANEL_W - w - 1, y = PANEL_Y - 10;
  return { sprite: name, keys: [{ t: t0, x, y: y + 3, alpha: 0 }, { t: t0 + 0.03, x, y }, { t: t1 - 0.03, x, y }, { t: t1, x, y, alpha: 0 }] };
}
/** The crawler comes down on a rope from the vent, to `y`. */
function ropeDown(t0, t1, y, x = ROPE_X - 4) {
  return [
    { sprite: "rope", keys: [{ t: t0, x: ROPE_X, y: -70 + 8 }, { t: t1, x: ROPE_X, y: y - 70, ease: "out" }] },
    { sprite: "crawler", keys: [{ t: t0, x, y: -14 }, { t: t1, x, y, ease: "out" }] },
  ];
}
const ceilingOver = (t0, t1) => ({ sprite: "ceilingPatch", keys: hold(t0, t1, 100, 0) });
const STAND = [ROPE_X - 4, 47]; // where the crawler hangs beside the cart
const FLOOR_Y = 62; // a walker's y on the open floor
const DOOR_IN = [6, 38]; // a walker's y going out of the front door

/** Walk out the front door: across the floor, then into the doorway, shrinking. */
function walkOut(t0, t1, from, extra = {}) {
  const mid = [26, FLOOR_Y];
  const span = t1 - t0;
  return [
    { t: t0, x: from[0], y: from[1], ...extra },
    ...hops(t0, t0 + span * 0.7, from, mid, 7, 1, () => extra),
    { t: t0 + span * 0.85, x: DOOR_IN[0] + 2, y: DOOR_IN[1] + 10, ...extra },
    { t: t1, x: DOOR_IN[0], y: DOOR_IN[1], scale: 0.7, alpha: 0, ...extra },
  ];
}
const SACK_DX = 7, SACK_DY = 9;

// --- move ---

const bagAndRun = {
  duration: 2500,
  sounds: [{ sfx: "heistZip", at: 0.04 }, { sfx: "heistRadio", at: 0.3 }, { sfx: "heistSack", at: 0.32 }, { sfx: "heistZip", at: 0.42 }, { sfx: "heistSneak", at: 0.55 }, { sfx: "heistSack", at: 0.9 }],
  tracks: [
    { sprite: "rope", keys: [{ t: 0.03, x: ROPE_X, y: -62 }, { t: 0.2, x: ROPE_X, y: STAND[1] - 70, ease: "out" }, { t: 0.4, x: ROPE_X, y: STAND[1] - 70 }, { t: 0.46, x: ROPE_X, y: -62, ease: "in" }] },
    { sprite: "crawler", keys: [{ t: 0.03, x: STAND[0], y: -14 }, { t: 0.2, x: STAND[0], y: STAND[1], ease: "out" }, { t: 0.4, x: STAND[0], y: STAND[1] }, { t: 0.44, x: STAND[0] - 6, y: FLOOR_Y, arc: 4 }] },
    { sprite: "cartGap", keys: hold(0.3, 1, FILE[0], FILE[1]) },
    { sprite: "file", keys: [fileAt(0), fileAt(0.24), { t: 0.32, x: STAND[0] + 4, y: STAND[1] + 6, scale: 0.5, arc: 6 }, { t: 0.36, x: STAND[0] + 6, y: STAND[1] + 9, scale: 0.2, alpha: 0 }] },
    { sprite: "sack", keys: [{ t: 0.33, x: STAND[0] + SACK_DX, y: STAND[1] + SACK_DY, alpha: 0 }, { t: 0.36, x: STAND[0] + SACK_DX, y: STAND[1] + SACK_DY }, { t: 0.4, x: STAND[0] + SACK_DX, y: STAND[1] + SACK_DY }, { t: 0.44, x: STAND[0] - 6 + SACK_DX, y: FLOOR_Y + SACK_DY, arc: 4 }, ...shift(clamp(walkOut(0.44, 0.84, [STAND[0] - 6, FLOOR_Y]), 0.45, 0.8), SACK_DX - 9, SACK_DY - 2), { t: 0.86, x: 8, y: 42 }, { t: 0.96, x: VAN[0] + 9, y: VAN[1] + 2, arc: 10, scale: 0.6 }, { t: 0.98, x: VAN[0] + 10, y: VAN[1] + 4, alpha: 0, scale: 0.4 }] },
    { sprite: "crawlerWalk", fps: 8, keys: walkOut(0.44, 0.84, [STAND[0] - 6, FLOOR_Y]) },
    { sprite: "sparkle", fps: 6, keys: hold(0.9, 1, VAN[0] + 9, VAN[1] + 1) },
    ceilingOver(0.03, 0.47),
    speak(0, "GOT IT!", 0.3, 0.55),
    speak(3, "GO GO!", 0.6, 0.95),
    say("BAGGED! OFF TO {dest}", "#ffffff", 0.05, 0.12),
  ],
};

const smoothWalk = {
  duration: 2500,
  sounds: [{ sfx: "heistSneak", at: 0.05 }, { sfx: "heistSneak", at: 0.25 }, { sfx: "heistSack", at: 0.42 }, { sfx: "heistWhistle", at: 0.55 }, { sfx: "heistSneak", at: 0.7 }, { sfx: "heistCash", at: 0.9 }],
  tracks: [
    { sprite: "disguiseWalk", fps: 6, keys: [{ t: 0, x: DOOR_IN[0], y: DOOR_IN[1], scale: 0.7, alpha: 0 }, { t: 0.1, x: 26, y: FLOOR_Y }, ...hops(0.1, 0.36, [26, FLOOR_Y], [112, FLOOR_Y], 7, 1), { t: 0.46, x: 112, y: FLOOR_Y }, ...walkOut(0.46, 0.9, [112, FLOOR_Y]).slice(1)] },
    { sprite: "briefcase", keys: [{ t: 0, x: DOOR_IN[0] + 8, y: DOOR_IN[1] + 12, alpha: 0 }, { t: 0.1, x: 34, y: FLOOR_Y + 12 }, ...shift(hops(0.1, 0.36, [26, FLOOR_Y], [112, FLOOR_Y], 7, 1), 8, 12), { t: 0.46, x: 120, y: FLOOR_Y + 12 }, ...shift(walkOut(0.46, 0.9, [112, FLOOR_Y]).slice(1), 8, 12)] },
    { sprite: "cartGap", keys: hold(0.42, 1, FILE[0], FILE[1]) },
    { sprite: "file", keys: [fileAt(0), fileAt(0.36), { t: 0.42, x: 121, y: FLOOR_Y + 8, scale: 0.4, arc: 5 }, { t: 0.44, x: 121, y: FLOOR_Y + 12, scale: 0.2, alpha: 0 }] },
    { sprite: "guardShock", keys: [] },
    { sprite: "sparkle", fps: 6, keys: hold(0.44, 0.56, 118, FLOOR_Y + 6) },
    { sprite: "sack", keys: [{ t: 0.9, x: 8, y: 42 }, { t: 0.97, x: VAN[0] + 9, y: VAN[1] + 2, arc: 10, scale: 0.6 }, { t: 0.99, x: VAN[0] + 10, y: VAN[1] + 4, alpha: 0, scale: 0.4 }] },
    speak(1, "SMOOTH.", 0.42, 0.7),
    speak(3, "NICE!", 0.75, 1),
    say("JUST A CUSTOMER... TO {dest}", "#ffffff", 0.05, 0.12),
  ].filter((t) => !t.keys || t.keys.length),
};

// --- encore: the getaways ---

const vanTracks = (keys, sprite = "vanFull") => [
  { sprite: "vanGap", keys: hold(keys[0].t, 1, VAN[0], VAN[1]) },
  { sprite, keys },
  { sprite: "frame", keys: hold(keys[0].t, 1, 0, 10) },
];

const driveOff = {
  duration: 2600,
  sounds: [{ sfx: "heistRadio", at: 0.02 }, { sfx: "heistTyping", at: 0.12 }, { sfx: "heistSneak", at: 0.2 }, { sfx: "heistSneak", at: 0.34 }, { sfx: "heistVan", at: 0.5 }, { sfx: "heistSiren", at: 0.75 }],
  tracks: [
    ...vanTracks([{ t: 0, x: VAN[0], y: VAN[1] }, { t: 0.5, x: VAN[0], y: VAN[1] }, { t: 0.54, x: VAN[0] + 1, y: VAN[1] - 1 }, { t: 0.58, x: VAN[0], y: VAN[1] }, { t: 0.9, x: -30, y: VAN[1], ease: "in" }, { t: 1, x: -30, y: VAN[1] }]),
    { sprite: "dust", fps: 8, keys: [{ t: 0.55, x: VAN[0] + 20, y: VAN[1] + 12 }, { t: 0.9, x: -10, y: VAN[1] + 12, ease: "in" }] },
    { sprite: "demoWalk", fps: 10, keys: walkOut(0.05, 0.36, [140, FLOOR_Y]) },
    { sprite: "disguiseWalk", fps: 10, keys: walkOut(0.1, 0.42, [150, FLOOR_Y]) },
    { sprite: "crawlerWalk", fps: 10, keys: walkOut(0.15, 0.48, [160, FLOOR_Y]) },
    { sprite: "sack", keys: shift(walkOut(0.15, 0.48, [160, FLOOR_Y]), SACK_DX, SACK_DY) },
    speak(3, "VROOM!", 0.5, 0.9),
    say("CLEAN GETAWAY!", "#f2c442", 0.5, 0.56),
  ],
};

const sewer = {
  duration: 2600,
  sounds: [{ sfx: "heistRadio", at: 0.02 }, { sfx: "heistBlast", at: 0.1 }, { sfx: "heistSplash", at: 0.4 }, { sfx: "heistSplash", at: 0.55 }, { sfx: "heistSplash", at: 0.7 }, { sfx: "heistSplash", at: 0.84 }],
  tracks: [
    { sprite: "hole", fps: 12, once: true, keys: hold(0.12, 1, HOLE[0], HOLE[1]) },
    { sprite: "smallBoom", fps: 12, once: true, keys: hold(0.08, 0.2, HOLE[0] + 4, HOLE[1] - 6) },
    ...[["demoWalk", 0.3], ["crawlerWalk", 0.45], ["disguiseWalk", 0.6], ["hackerWalk", 0.75]].flatMap(([s, t], k) => {
      const from = [[60, FLOOR_Y], [130, FLOOR_Y], [26, FLOOR_Y], [6, 38]][k];
      const edge = [HOLE[0] + 8, HOLE[1] - 18];
      const keys = [{ t: t - 0.22, x: from[0], y: from[1], alpha: k === 3 ? 0 : 1 }, ...hops(t - 0.22, t - 0.04, from, edge, 4, 1), { t, x: edge[0], y: edge[1] - 4, arc: 0 }, { t: t + 0.08, x: edge[0], y: edge[1] + 14, ease: "in", alpha: 0 }];
      return [{ sprite: s, fps: 10, keys }, { sprite: "sack", keys: shift(keys, SACK_DX, SACK_DY) }];
    }),
    { sprite: "holeMask", keys: hold(0.12, 1, HOLE[0], HOLE[1] + 6) },
    speak(2, "DIVE!", 0.2, 0.5),
    speak(0, "GO GO!", 0.55, 0.85),
    say("DOWN THE SEWER!", "#f2c442", 0.15, 0.22),
  ],
};

const coolWalk = {
  duration: 2600,
  sounds: [{ sfx: "heistRadio", at: 0.02 }, { sfx: "heistFuse", at: 0.06 }, { sfx: "heistBlast", at: 0.32 }, { sfx: "heistSting", at: 0.5 }],
  tracks: [
    { sprite: "boom", fps: 9, once: true, keys: fadeInOut(0.3, 0.31, 0.7, 0.8, 118, 24) },
    { sprite: "boom", fps: 9, once: true, keys: fadeInOut(0.38, 0.39, 0.78, 0.88, 98, 34) },
    { sprite: "boom", fps: 9, once: true, keys: fadeInOut(0.45, 0.46, 0.85, 0.95, 134, 44) },
    { sprite: "smoke", fps: 4, keys: [{ t: 0.6, x: 112, y: 30, alpha: 0 }, { t: 0.7, x: 112, y: 28 }, { t: 1, x: 112, y: 18, alpha: 0 }] },
    ...["coolHacker", "coolDemo", "coolDisguise", "coolCrawler"].map((s, k) => ({
      sprite: s,
      fps: 4,
      keys: [{ t: 0, x: 150 - k * 14, y: FLOOR_Y + 2, alpha: 0 }, { t: 0.08, x: 148 - k * 14, y: FLOOR_Y + 2 }, ...hops(0.08, 1, [148 - k * 14, FLOOR_Y + 2], [58 - k * 14, FLOOR_Y + 2], 10, 1)],
    })),
    speak(2, "BOOM.", 0.35, 0.65),
    speak(1, "COOL.", 0.65, 0.95),
    say("NEVER LOOK BACK", "#f2c442", 0.32, 0.4),
  ],
};

// --- rename ---

const explorerSwap = {
  duration: 2600,
  sounds: [{ sfx: "heistSneak", at: 0.05 }, { sfx: "heistSneak", at: 0.2 }, { sfx: "heistSwap", at: 0.42 }, { sfx: "heistSwap", at: 0.6 }, { sfx: "heistSneak", at: 0.75 }],
  tracks: [
    { sprite: "explorerWalk", fps: 5, keys: [{ t: 0, x: 26, y: FLOOR_Y, alpha: 0 }, { t: 0.06, x: 30, y: FLOOR_Y }, ...hops(0.06, 0.3, [30, FLOOR_Y], [112, FLOOR_Y - 8], 6, 1)] },
    { sprite: "explorer", keys: hold(0.3, 0.66, 112, FLOOR_Y - 8) },
    { sprite: "explorerWalk", fps: 8, keys: walkOut(0.66, 0.98, [112, FLOOR_Y - 8]) },
    // He weighs the decoy in one hand, then trades it for the money.
    { sprite: "decoy", keys: [{ t: 0, x: 38, y: FLOOR_Y + 10, alpha: 0 }, { t: 0.06, x: 38, y: FLOOR_Y + 10 }, ...shift(hops(0.06, 0.3, [30, FLOOR_Y], [112, FLOOR_Y - 8], 6, 1), 8, 10), { t: 0.36, x: 120, y: FLOOR_Y + 1, arc: 3 }, { t: 0.4, x: 120, y: FLOOR_Y + 2, arc: 3 }, { t: 0.46, x: FILE[0] + 5, y: FILE[1] + 8, arc: 6 }, { t: 0.56, x: FILE[0] + 5, y: FILE[1] + 8 }, { t: 0.6, x: FILE[0] + 5, y: FILE[1] + 8, alpha: 0 }] },
    { sprite: "file", keys: [fileAt(0), fileAt(0.44), { t: 0.5, x: FILE[0], y: FILE[1] - 12, arc: 4 }, { t: 0.56, x: FILE[0], y: FILE[1] - 12, alpha: 0 }] },
    { sprite: "sack", keys: [{ t: 0.48, x: 120, y: FLOOR_Y + 11, alpha: 0 }, { t: 0.52, x: 120, y: FLOOR_Y + 11 }, { t: 0.66, x: 120, y: FLOOR_Y + 11 }, ...shift(walkOut(0.66, 0.98, [112, FLOOR_Y - 8]).slice(1), SACK_DX, SACK_DY)] },
    { sprite: "cartGap", keys: hold(0.44, 0.6, FILE[0], FILE[1]) },
    { sprite: "sparkle", fps: 6, keys: hold(0.56, 0.7, FILE[0] + 5, FILE[1] - 2) },
    { sprite: "file", keys: [{ t: 0.58, x: FILE[0], y: FILE[1], alpha: 0 }, { t: 0.62, x: FILE[0], y: FILE[1] }, { t: 1, x: FILE[0], y: FILE[1] }] },
    speak(0, "HUH?", 0.3, 0.5),
    speak(1, "A FAKE!", 0.62, 0.9),
    say("SWAPPED FOR A DECOY", "#ffffff", 0.1, 0.16, 0.56),
    say("{newName}", "#f2c442", 0.58, 0.64),
  ],
};

const doubleCross = {
  duration: 2500,
  sounds: [{ sfx: "heistSneak", at: 0.05 }, { sfx: "heistSack", at: 0.3 }, { sfx: "heistBetray", at: 0.4 }, { sfx: "heistRadio", at: 0.55 }, { sfx: "heistSneak", at: 0.7 }],
  tracks: [
    { sprite: "demoWalk", fps: 8, keys: [{ t: 0, x: 26, y: FLOOR_Y, alpha: 0 }, { t: 0.05, x: 30, y: FLOOR_Y }, ...hops(0.05, 0.26, [30, FLOOR_Y], [112, FLOOR_Y - 8], 6, 1), { t: 0.4, x: 112, y: FLOOR_Y - 8 }, ...walkOut(0.4, 0.88, [112, FLOOR_Y - 8]).slice(1)] },
    { sprite: "cartGap", keys: hold(0.3, 1, FILE[0], FILE[1]) },
    { sprite: "file", keys: [fileAt(0), fileAt(0.26), { t: 0.32, x: 118, y: FLOOR_Y + 2, arc: 6 }, { t: 0.4, x: 118, y: FLOOR_Y + 2 }, ...shift(walkOut(0.4, 0.88, [112, FLOOR_Y - 8]).slice(1), 6, 10).map((k) => ({ ...k, scale: (k.scale ?? 1) * 0.6 }))] },
    { sprite: "sparkle", fps: 6, keys: hold(0.34, 0.42, 124, FLOOR_Y) },
    speak(2, "SEE YA!", 0.3, 0.6),
    speak(0, "HEY!", 0.5, 0.8),
    speak(3, "HEY!", 0.55, 0.85),
    say("DOUBLE-CROSSED!", "#ff7a6a", 0.3, 0.36, 0.62),
    say("NOW IT'S {newName}", "#f2c442", 0.62, 0.68),
  ],
};

// --- trash ---

const dyePack = {
  duration: 2400,
  sounds: [{ sfx: "heistZip", at: 0.04 }, { sfx: "heistSack", at: 0.3 }, { sfx: "heistDye", at: 0.44 }, { sfx: "heistAlarm", at: 0.6 }],
  tracks: [
    ...ropeDown(0.04, 0.24, STAND[1]),
    { sprite: "rope", keys: hold(0.24, 0.44, ROPE_X, STAND[1] - 70) },
    { sprite: "crawler", keys: hold(0.24, 0.44, STAND[0], STAND[1]) },
    { sprite: "crawlerDyed", keys: [{ t: 0.44, x: STAND[0], y: STAND[1] }, { t: 0.6, x: STAND[0], y: STAND[1] }, { t: 0.66, x: STAND[0] - 2, y: FLOOR_Y + 2, arc: 2 }, { t: 1, x: STAND[0] - 2, y: FLOOR_Y + 2 }] },
    { sprite: "rope", keys: [{ t: 0.44, x: ROPE_X, y: STAND[1] - 70 }, { t: 0.6, x: ROPE_X, y: STAND[1] - 70 }, { t: 0.62, x: ROPE_X, y: STAND[1] - 70, alpha: 0 }] },
    { sprite: "cartGap", keys: hold(0.3, 1, FILE[0], FILE[1]) },
    { sprite: "file", keys: [fileAt(0), fileAt(0.26), { t: 0.32, x: STAND[0] + 8, y: STAND[1] + 4, arc: 5 }, { t: 0.44, x: STAND[0] + 8, y: STAND[1] + 4 }] },
    { sprite: "dye", fps: 8, once: true, keys: fadeInOut(0.44, 0.45, 0.8, 0.95, STAND[0] - 2, STAND[1] - 4) },
    { sprite: "bill", fps: 8, keys: [{ t: 0.46, x: STAND[0] + 6, y: STAND[1] }, { t: 0.9, x: STAND[0] - 14, y: FLOOR_Y + 18, alpha: 0 }] },
    { sprite: "bill", fps: 6, keys: [{ t: 0.48, x: STAND[0] + 10, y: STAND[1] }, { t: 0.92, x: STAND[0] + 22, y: FLOOR_Y + 18, alpha: 0 }] },
    ceilingOver(0.04, 0.62),
    speak(0, "ACK!", 0.46, 0.75),
    say("DYE PACK! {name} IS RUINED", "#7fd0f0", 0.44, 0.5),
  ],
};

const crossfire = {
  duration: 2400,
  sounds: [{ sfx: "heistPew", at: 0.2 }, { sfx: "heistPew", at: 0.28 }, { sfx: "heistPew", at: 0.36 }, { sfx: "heistPew", at: 0.42 }, { sfx: "heistCash", at: 0.5 }, { sfx: "heistWhistle", at: 0.82 }],
  tracks: [
    { sprite: "guardShock", keys: [] },
    { sprite: "demoWalk", fps: 8, keys: [{ t: 0, x: 150, y: FLOOR_Y + 6, alpha: 0 }, { t: 0.12, x: 150, y: FLOOR_Y + 6 }, { t: 0.7, x: 150, y: FLOOR_Y + 6 }, { t: 0.8, x: 162, y: FLOOR_Y + 6, alpha: 0 }] },
    ...[0.18, 0.26, 0.34, 0.42].flatMap((t, k) => [
      { sprite: "pellet", fps: 10, keys: [{ t, x: GUARD[0] + 10, y: GUARD[1] + 9 - (k % 2) * 3 }, { t: t + 0.12, x: 134 + (k % 2) * 4, y: 62 - k * 2 }] },
      { sprite: "pelletL", fps: 10, keys: [{ t: t + 0.04, x: 148, y: FLOOR_Y + 14 - k }, { t: t + 0.14, x: 132, y: 60 + (k % 3) * 2 }] },
    ]),
    ...[0.18, 0.34].map((t) => ({ sprite: "sparkle", fps: 10, keys: hold(t, t + 0.06, GUARD[0] + 9, GUARD[1] + 6) })),
    ...[0.22, 0.38].map((t) => ({ sprite: "sparkle", fps: 10, keys: hold(t, t + 0.06, 146, FLOOR_Y + 12) })),
    { sprite: "cartGap", keys: hold(0.5, 1, FILE[0], FILE[1]) },
    { sprite: "file", keys: [fileAt(0), fileAt(0.32), { t: 0.34, x: FILE[0] + 1, y: FILE[1] }, { t: 0.38, x: FILE[0] - 1, y: FILE[1] }, { t: 0.44, x: FILE[0], y: FILE[1] - 3 }, { t: 0.5, x: FILE[0], y: FILE[1] - 3, alpha: 0.4 }] },
    { sprite: "smallBoom", fps: 12, once: true, keys: hold(0.46, 0.6, FILE[0] - 1, FILE[1] - 2) },
    ...[0, 1, 2, 3, 4, 5].map((k) => ({ sprite: "bill", fps: 6 + k, keys: [{ t: 0.5, x: FILE[0] + 5, y: FILE[1] + 4 }, { t: 0.95, x: FILE[0] - 30 + k * 12, y: FILE[1] + 26 - (k % 3) * 8, alpha: 0, arc: 14 }] })),
    { sprite: "confetti", fps: 8, keys: fadeInOut(0.5, 0.52, 0.85, 0.95, FILE[0], FILE[1] + 2) },
    speak(1, "DUCK!", 0.18, 0.45),
    speak(3, "NOOO!", 0.52, 0.85),
    say("CAUGHT IN THE CROSSFIRE", "#ff7a6a", 0.46, 0.52),
  ].filter((t) => !t.keys || t.keys.length),
};

const showdown = {
  duration: 2600,
  sounds: [{ sfx: "heistWhoosh", at: 0.05 }, { sfx: "heistClank", at: 0.12 }, { sfx: "heistClank", at: 0.24 }, { sfx: "heistPow", at: 0.4 }, { sfx: "heistPow", at: 0.55 }, { sfx: "heistCash", at: 0.6 }],
  tracks: [
    { sprite: "villain", fps: 4, keys: [{ t: 0, x: 162, y: 44 }, ...hops(0.05, 0.3, [162, 44], [136, 40], 4, 2), { t: 0.42, x: 136, y: 40 }, { t: 0.5, x: 140, y: 38 }, { t: 0.58, x: 134, y: 40 }, { t: 0.9, x: 134, y: 40 }, { t: 1, x: 150, y: 40, alpha: 0 }] },
    { sprite: "hero", fps: 6, keys: [{ t: 0.1, x: -16, y: 14 }, { t: 0.36, x: 112, y: 40, ease: "out" }, { t: 0.42, x: 116, y: 40 }, { t: 0.5, x: 108, y: 38 }, { t: 0.56, x: 116, y: 40 }, { t: 0.9, x: 112, y: 40 }, { t: 1, x: 100, y: 10, alpha: 0 }] },
    { sprite: "cartGap", keys: hold(0.56, 1, FILE[0], FILE[1]) },
    { sprite: "file", keys: [fileAt(0), fileAt(0.4), { t: 0.44, x: FILE[0] + 1, y: FILE[1] - 1 }, { t: 0.5, x: FILE[0] - 1, y: FILE[1] }, { t: 0.56, x: FILE[0], y: FILE[1] - 6, arc: 3 }, { t: 0.62, x: FILE[0], y: FILE[1] - 6, alpha: 0 }] },
    { sprite: "pow", keys: [{ t: 0.4, x: 118, y: 30, alpha: 0, scale: 0.5 }, { t: 0.43, x: 118, y: 30 }, { t: 0.52, x: 118, y: 30 }, { t: 0.54, x: 118, y: 30, alpha: 0 }] },
    { sprite: "crash", keys: [{ t: 0.55, x: FILE[0] - 8, y: FILE[1] - 10, alpha: 0, scale: 0.5 }, { t: 0.58, x: FILE[0] - 8, y: FILE[1] - 10 }, { t: 0.7, x: FILE[0] - 8, y: FILE[1] - 10 }, { t: 0.74, x: FILE[0] - 8, y: FILE[1] - 10, alpha: 0 }] },
    ...[0, 1, 2, 3, 4, 5, 6].map((k) => ({ sprite: "bill", fps: 5 + k, keys: [{ t: 0.58, x: FILE[0] + 5, y: FILE[1] + 2 }, { t: 0.98, x: FILE[0] - 40 + k * 10, y: FILE[1] + 30 - (k % 3) * 10, alpha: 0, arc: 18 }] })),
    speak(3, "WHAT?!", 0.3, 0.6),
    speak(1, "NOOO!", 0.62, 0.92),
    say("SUPER SHOWDOWN!", "#f2c442", 0.08, 0.14, 0.56),
    say("{name} GOT WRECKED", "#ff7a6a", 0.6, 0.66),
  ],
};

const vanCrash = {
  duration: 2600,
  sounds: [{ sfx: "heistSneak", at: 0.05 }, { sfx: "heistSack", at: 0.38 }, { sfx: "heistSkid", at: 0.44 }, { sfx: "heistCrash", at: 0.56 }, { sfx: "heistCash", at: 0.62 }, { sfx: "heistSiren", at: 0.8 }],
  tracks: [
    { sprite: "cartGap", keys: hold(0.1, 1, FILE[0], FILE[1]) },
    { sprite: "crawlerWalk", fps: 10, keys: [{ t: 0, x: 112, y: FLOOR_Y, alpha: 0 }, { t: 0.06, x: 112, y: FLOOR_Y }, ...walkOut(0.1, 0.34, [112, FLOOR_Y]).slice(1)] },
    { sprite: "file", keys: [fileAt(0), fileAt(0.06), { t: 0.1, x: 118, y: FLOOR_Y + 6, arc: 4, scale: 0.6 }, ...shift(walkOut(0.1, 0.34, [112, FLOOR_Y]).slice(1), 7, 7).map((k) => ({ ...k, scale: 0.6 * (k.scale ?? 1) })), { t: 0.36, x: 8, y: 42, scale: 0.6 }, { t: 0.42, x: VAN[0] + 8, y: VAN[1] + 1, arc: 10, scale: 0.5 }, { t: 0.44, x: VAN[0] + 9, y: VAN[1] + 3, alpha: 0, scale: 0.3 }] },
    ...vanTracks([{ t: 0, x: VAN[0], y: VAN[1] }, { t: 0.56, x: VAN[0], y: VAN[1] }], "van3"),
    { sprite: "car", fps: 10, keys: [{ t: 0.42, x: -24, y: VAN[1] + 6 }, { t: 0.56, x: VAN[0] - 18, y: VAN[1] + 6, ease: "in" }, { t: 0.62, x: VAN[0] - 20, y: VAN[1] + 6 }, { t: 1, x: VAN[0] - 20, y: VAN[1] + 6 }] },
    { sprite: "vanWreck", keys: [{ t: 0.56, x: VAN[0] + 1, y: VAN[1] }, { t: 0.6, x: VAN[0] + 3, y: VAN[1] - 1 }, { t: 1, x: VAN[0] + 2, y: VAN[1] }] },
    { sprite: "frame", keys: hold(0, 1, 0, 10) },
    { sprite: "crash", keys: [{ t: 0.56, x: VAN[0] - 12, y: VAN[1] - 8, scale: 0.5 }, { t: 0.6, x: VAN[0] - 12, y: VAN[1] - 8 }, { t: 0.78, x: VAN[0] - 12, y: VAN[1] - 8 }, { t: 0.82, x: VAN[0] - 12, y: VAN[1] - 8, alpha: 0 }] },
    { sprite: "smoke", fps: 6, keys: [{ t: 0.62, x: VAN[0] - 2, y: VAN[1] - 6 }, { t: 1, x: VAN[0] - 2, y: VAN[1] - 14, alpha: 0.3 }] },
    ...[0, 1, 2, 3, 4].map((k) => ({ sprite: "bill", fps: 5 + k, keys: [{ t: 0.6, x: VAN[0] + 12, y: VAN[1] + 4 }, { t: 0.98, x: VAN[0] - 8 + k * 9, y: VAN[1] - 10 + (k % 2) * 20, alpha: 0, arc: 10 }] })),
    speak(3, "MY VAN!", 0.6, 0.95),
    say("CRASH! THE HEIST FAILED", "#ff7a6a", 0.58, 0.64),
  ],
};

// --- keep ---

const swatRaid = {
  duration: 2600,
  sounds: [{ sfx: "heistZip", at: 0.04 }, { sfx: "heistSiren", at: 0.3 }, { sfx: "heistSlam", at: 0.36 }, { sfx: "heistSmoke", at: 0.42 }, { sfx: "heistSmoke", at: 0.5 }, { sfx: "heistRadio", at: 0.7 }],
  tracks: [
    ...ropeDown(0.04, 0.24, STAND[1]),
    { sprite: "rope", keys: hold(0.24, 1, ROPE_X, STAND[1] - 70) },
    { sprite: "crawler", keys: hold(0.24, 0.5, STAND[0], STAND[1]) },
    { sprite: "crawlerUp", keys: [{ t: 0.5, x: STAND[0], y: STAND[1] }, { t: 0.53, x: STAND[0], y: STAND[1] - 2 }, { t: 1, x: STAND[0], y: STAND[1] - 2 }] },
    { sprite: "cartGap", keys: hold(0.28, 0.56, FILE[0], FILE[1]) },
    { sprite: "file", keys: [fileAt(0), fileAt(0.26), { t: 0.32, x: STAND[0] + 8, y: STAND[1] + 4, arc: 5 }, { t: 0.5, x: STAND[0] + 8, y: STAND[1] + 4 }, { t: 0.56, x: FILE[0], y: FILE[1], arc: 6, ease: "in" }, fileAt(1)] },
    ...QUEUE_X.map((x, i) => ({ sprite: `duck${i}`, keys: hold(0.4 + i * 0.02, 1, x, QUEUE_Y) })),
    { sprite: "smoke", fps: 5, keys: [{ t: 0.4, x: 24, y: 58 }, { t: 0.5, x: 52, y: 60 }, { t: 0.9, x: 58, y: 54 }, { t: 1, x: 58, y: 54, alpha: 0 }] },
    { sprite: "smoke", fps: 4, keys: [{ t: 0.44, x: 24, y: 58 }, { t: 0.56, x: 84, y: 62 }, { t: 0.92, x: 86, y: 56 }, { t: 1, x: 86, y: 56, alpha: 0 }] },
    ...[0, 1, 2].map((k) => ({ sprite: "swatWalk", fps: 10, keys: [{ t: 0.32 + k * 0.04, x: DOOR_IN[0], y: DOOR_IN[1], scale: 0.7, alpha: 0 }, { t: 0.4 + k * 0.04, x: 22, y: FLOOR_Y }, ...hops(0.4 + k * 0.04, 0.62, [22, FLOOR_Y], [72 + k * 14, FLOOR_Y], 4, 1), { t: 1, x: 72 + k * 14, y: FLOOR_Y }] })),
    { sprite: "smoke", fps: 5, keys: [{ t: 0.5, x: 100, y: 64, alpha: 0 }, { t: 0.56, x: 100, y: 64 }, { t: 1, x: 104, y: 56, alpha: 0 }] },
    ceilingOver(0.04, 1),
    speak(3, "ABORT!", 0.4, 0.7),
    say("SWAT! FREEZE!", "#ff7a6a", 0.36, 0.42, 0.66),
    say("{name} STAYS PUT", "#f2c442", 0.66, 0.72),
  ],
};

const heroCop = {
  duration: 2500,
  sounds: [{ sfx: "heistSneak", at: 0.05 }, { sfx: "heistWhistle", at: 0.3 }, { sfx: "heistWhoosh", at: 0.4 }, { sfx: "heistPow", at: 0.5 }, { sfx: "heistSack", at: 0.6 }],
  tracks: [
    { sprite: "cartGap", keys: hold(0.1, 0.72, FILE[0], FILE[1]) },
    { sprite: "disguiseWalk", fps: 6, keys: [{ t: 0, x: 112, y: FLOOR_Y, alpha: 0 }, { t: 0.06, x: 112, y: FLOOR_Y }, ...hops(0.1, 0.48, [112, FLOOR_Y], [62, FLOOR_Y], 5, 1)] },
    { sprite: "file", keys: [fileAt(0), fileAt(0.06), { t: 0.1, x: 120, y: FLOOR_Y + 6, arc: 4, scale: 0.6 }, ...shift(hops(0.1, 0.48, [112, FLOOR_Y], [62, FLOOR_Y], 5, 1), 8, 6).map((k) => ({ ...k, scale: 0.6 })), { t: 0.52, x: 70, y: FLOOR_Y - 10, scale: 0.8 }, { t: 0.72, x: FILE[0], y: FILE[1], arc: 20, scale: 1 }, fileAt(1)] },
    { sprite: "copWalk", fps: 10, keys: [{ t: 0.28, x: DOOR_IN[0], y: DOOR_IN[1], scale: 0.7, alpha: 0 }, { t: 0.36, x: 22, y: FLOOR_Y }, { t: 0.42, x: 40, y: FLOOR_Y }] },
    { sprite: "copDive", keys: [{ t: 0.42, x: 40, y: FLOOR_Y - 2 }, { t: 0.5, x: 58, y: FLOOR_Y, arc: 4 }] },
    { sprite: "dust", fps: 8, keys: hold(0.5, 0.65, 60, FLOOR_Y + 12) },
    { sprite: "bonk", keys: [{ t: 0.48, x: 50, y: FLOOR_Y - 2, scale: 0.5, alpha: 0 }, { t: 0.5, x: 50, y: FLOOR_Y - 2 }, { t: 0.62, x: 50, y: FLOOR_Y - 2 }, { t: 0.66, x: 50, y: FLOOR_Y - 2, alpha: 0 }] },
    { sprite: "disguiseDown", keys: [{ t: 0.5, x: 54, y: FLOOR_Y + 12 }, { t: 1, x: 54, y: FLOOR_Y + 12 }] },
    { sprite: "copDive", keys: [{ t: 0.5, x: 56, y: FLOOR_Y + 3 }, { t: 1, x: 56, y: FLOOR_Y + 3 }] },
    { sprite: "stars", fps: 6, keys: hold(0.6, 1, 59, FLOOR_Y) },
    speak(1, "OOF!", 0.5, 0.8),
    speak(3, "COPS!", 0.3, 0.55),
    say("BUSTED!", "#ff7a6a", 0.48, 0.54, 0.72),
    say("{name} STAYS", "#f2c442", 0.72, 0.78),
  ],
};

const lockedIn = {
  duration: 2500,
  sounds: [{ sfx: "heistSneak", at: 0.05 }, { sfx: "heistSack", at: 0.26 }, { sfx: "heistVault", at: 0.5 }, { sfx: "heistSlam", at: 0.66 }, { sfx: "heistKnock", at: 0.78 }],
  tracks: [
    { sprite: "cartGap", keys: hold(0.26, 1, FILE[0], FILE[1]) },
    { sprite: "demoWalk", fps: 8, keys: [{ t: 0, x: 92, y: FLOOR_Y, alpha: 0 }, { t: 0.06, x: 96, y: FLOOR_Y }, ...hops(0.06, 0.24, [96, FLOOR_Y], [118, FLOOR_Y - 4], 3, 1), { t: 0.3, x: 118, y: FLOOR_Y - 4 }, ...hops(0.3, 0.48, [118, FLOOR_Y - 4], [130, 26], 4, 2, (k) => ({ scale: 1 - k * 0.3 }))] },
    { sprite: "file", keys: [fileAt(0), fileAt(0.24), { t: 0.3, x: 124, y: FLOOR_Y + 2, arc: 4, scale: 0.6 }, ...shift(hops(0.3, 0.48, [118, FLOOR_Y - 4], [130, 26], 4, 2), 6, 8).map((k) => ({ ...k, scale: 0.45 }))] },
    { sprite: "vaultClose", fps: 12, once: true, keys: hold(0.5, 1, VAULT[0] - VAULT[2] - 1, VAULT[1] - VAULT[2] - 1) },
    { sprite: "dust", fps: 8, keys: hold(0.66, 0.8, 130, 50) },
    speak(2, "HELP!", 0.72, 1),
    say("LOCKED IN THE VAULT", "#f2c442", 0.62, 0.68),
  ],
};

// --- delete ---

const shredded = {
  duration: 2600,
  sounds: [{ sfx: "heistVault", at: 0.05 }, { sfx: "heistShred", at: 0.42 }, { sfx: "heistShred", at: 0.6 }, { sfx: "heistBetray", at: 0.8 }],
  tracks: [
    { sprite: "shredder", fps: 8, keys: [{ t: 0.04, x: 128, y: 26, alpha: 0, scale: 0.6 }, { t: 0.2, x: 100, y: 42, ease: "out" }, { t: 1, x: 100, y: 42 }] },
    { sprite: "cartGap", keys: hold(0.26, 1, FILE[0], FILE[1]) },
    { sprite: "file", keys: [fileAt(0), fileAt(0.24), { t: 0.34, x: 105, y: 24, arc: 12 }, { t: 0.4, x: 105, y: 28 }, { t: 0.56, x: 105, y: 42, scale: 1 }] },
    { sprite: "shredder", fps: 8, keys: hold(0.4, 1, 100, 42) },
    { sprite: "confetti", fps: 10, keys: [{ t: 0.44, x: 106, y: 66 }, { t: 1, x: 108, y: 80, alpha: 0 }] },
    { sprite: "confetti", fps: 9, keys: [{ t: 0.5, x: 98, y: 66 }, { t: 1, x: 92, y: 82, alpha: 0 }] },
    speak(2, "OH NO!", 0.42, 0.7),
    speak(0, "SHREDS!", 0.6, 0.9),
    say("SHREDDED FOR GOOD", "#ff7a6a", 0.42, 0.48),
  ],
};

export const manifest = {
  format: 1,
  id: "bank-heist",
  name: "Bank Heist",
  sheet: "sheet.png",
  size: [W, H],
  music: "bank-heist",
  scene: [
    { sprite: "bank", x: 0, y: 0 },
    { sprite: "van0", x: VAN[0], y: VAN[1], tally: { on: ["move"], sprites: ["van1", "van2", "van3", "van4", "van5"] } },
    { sprite: "frame", x: 0, y: 10 },
    { sprite: "teller", x: TELLERS[0][0], y: TELLERS[0][1] + 1, fps: 0.7 },
    { sprite: "teller2", x: TELLERS[1][0], y: TELLERS[1][1], fps: 0.5 },
    { sprite: "partition", x: 52, y: 29 },
    { sprite: "jar", x: 77, y: 33, fps: 1.2 },
    ...QUEUE_X.map((x, i) => ({ sprite: `cust${i}`, x, y: QUEUE_Y, fps: [0.6, 0.9, 0.5, 1.1][i] })),
    { sprite: "guard", x: GUARD[0], y: GUARD[1], fps: 0.6 },
    { sprite: "plant", x: 2, y: 69, fps: 1 },
    { sprite: "desk", x: DESK[0], y: DESK[1], fps: 3 },
    { sprite: "plantB", x: 116, y: 69, fps: 0.8 },
    { sprite: "panelVent", x: PANEL_X[0], y: PANEL_Y, fps: 2 },
    { sprite: "panelDisguise", x: PANEL_X[1], y: PANEL_Y, fps: 1.5 },
    { sprite: "panelDemo", x: PANEL_X[2], y: PANEL_Y, fps: 4 },
    { sprite: "panelHacker", x: PANEL_X[3], y: PANEL_Y, fps: 4 },
  ],
  file: FILE,
  sounds: {
    keep: swatRaid.sounds,
    move: bagAndRun.sounds,
    rename: explorerSwap.sounds,
    trash: dyePack.sounds,
    delete: shredded.sounds,
  },
  animations: {
    keep: swatRaid,
    move: bagAndRun,
    rename: explorerSwap,
    trash: dyePack,
    delete: shredded,
  },
  variants: {
    keep: [heroCop, lockedIn],
    move: [smoothWalk],
    rename: [doubleCross],
    trash: [crossfire, showdown, vanCrash],
  },
  encore: { on: ["move"], every: 5, animations: [driveOff, sewer, coolWalk] },
};
