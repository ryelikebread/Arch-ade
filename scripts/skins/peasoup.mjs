// Peasoup skin: a cozy kitchen. The file is an ingredient on the cutting
// board. keep = into the pot of pea soup (which changes as it goes in);
// move = onto a pantry shelf; rename = the recipe book opens and a quill writes in
// the new ingredient; trash = fed
// to the dog; delete = the dog buries it out in the yard.
// All art is original, drawn here.
import { art, blank, burst, disc, set } from "./lib.mjs";

const P = {
  k: "#2a1a14", w: "#ffffff", W: "#f6efe0", c: "#f2ddb0", C: "#d7a26a", t: "#8a4b2a", T: "#5a2e1a",
  n: "#b07a45", N: "#6b4423", l: "#e2c08d", r: "#d03a2a", R: "#8e2219", y: "#ffd23f", o: "#f08a24",
  x: "#9aa4b0", X: "#d0d8e0", z: "#5d6670", Z: "#3a4048",
  g: "#7cb342", G: "#558b2f", h: "#aed581", H: "#33691e",
  u: "#8fd0f0", U: "#4a90c8", b: "#3a6fd8", B: "#a8e0ff",
  e: "#4caf50", E: "#2e7d32", s: "#ffe9b0", p: "#f4a8b8",
};

const fill = (f, x, y, w, h, c) => {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(f, i, j, c);
  return f;
};
const box = (f, x, y, w, h, c, edge) => {
  fill(f, x, y, w, h, c);
  if (edge) {
    fill(f, x, y, w, 1, edge);
    fill(f, x, y + h - 1, w, 1, edge);
    fill(f, x, y, 1, h, edge);
    fill(f, x + w - 1, y, 1, h, edge);
  }
  return f;
};

// ---------- the room ----------

const WAINSCOT = "#9fbccb";

function floor() {
  const f = blank(160, 10);
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 160; x++) set(f, x, y, y === 0 ? P.T : (Math.floor(x / 5) + Math.floor((y - 1) / 5)) % 2 ? "#c84c3c" : P.W);
  return f;
}

function beam() {
  const f = fill(blank(160, 9), 0, 0, 160, 9, P.t);
  fill(f, 0, 8, 160, 1, P.T);
  for (let x = 6; x < 160; x += 23) fill(f, x, 2, 9, 1, "#7a4024");
  for (let x = 17; x < 160; x += 31) fill(f, x, 5, 6, 1, "#7a4024");
  return f;
}

// Window onto the yard (where the dog buries things).
function windowArt(curtainSway) {
  const W = 36, H = 28, f = blank(W, H);
  box(f, 2, 0, 32, 26, P.u, P.W);
  fill(f, 3, 1, 30, 1, P.W);
  // Sky, a cloud, the fence and grass.
  fill(f, 3, 2, 30, 12, P.B);
  fill(f, 3, 14, 30, 4, P.u);
  disc(f, 10, 6, 2.2, P.w);
  disc(f, 13, 5.5, 2.6, P.w);
  disc(f, 16, 6.5, 1.8, P.w);
  // Tree at the right.
  disc(f, 28, 10, 4.5, P.e, P.E);
  fill(f, 27, 13, 2, 6, P.N);
  for (let x = 4; x < 33; x += 4) fill(f, x, 13, 2, 6, P.W);
  fill(f, 3, 15, 30, 1, P.W);
  fill(f, 3, 18, 30, 7, P.e);
  for (let x = 4; x < 33; x += 3) set(f, x, 18, P.E);
  for (let x = 5; x < 33; x += 5) set(f, x, 21, P.E);
  // Cross bars.
  fill(f, 17, 1, 2, 24, P.W);
  fill(f, 3, 11, 30, 1, P.W);
  // Sill.
  fill(f, 0, 25, 36, 3, P.t);
  fill(f, 0, 27, 36, 1, P.T);
  // Curtains, swaying a pixel.
  const s = curtainSway ? 1 : 0;
  for (let y = 0; y < 22; y++) {
    const wL = 4 + (y > 12 ? 1 : 0) + (y > 16 ? s : 0);
    fill(f, 0, y, wL, 1, y % 4 === 1 ? "#f7b0b0" : P.r);
    fill(f, W - wL, y, wL, 1, y % 4 === 1 ? "#f7b0b0" : P.r);
  }
  fill(f, 0, 0, W, 1, P.T);
  return f;
}

// Utensil rail with a ladle, spatula and whisk, swinging a little.
function utensils(swing) {
  const f = blank(26, 24);
  fill(f, 0, 0, 26, 2, P.z);
  fill(f, 0, 0, 26, 1, P.X);
  const d = swing ? 1 : 0;
  // Ladle.
  for (let y = 2; y < 15; y++) set(f, 4 + (y > 9 ? d : 0), y, P.x);
  disc(f, 4.5 + d, 17.5, 3, P.x, P.z);
  // Spatula.
  for (let y = 2; y < 12; y++) set(f, 12, y, P.N);
  box(f, 10, 12, 5, 8, P.X, P.z);
  fill(f, 11, 14, 3, 1, P.z);
  fill(f, 11, 16, 3, 1, P.z);
  // Whisk.
  for (let y = 2; y < 10; y++) set(f, 20 - (y > 6 ? d : 0), y, P.N);
  for (let y = 10; y < 21; y++) {
    const half = Math.round(Math.sin(((y - 10) / 11) * Math.PI) * 3);
    set(f, 20 - half - d, y, P.X);
    set(f, 20 + half - d, y, P.X);
    set(f, 20 - d, y, P.x);
  }
  return f;
}

// The pantry: a tall cupboard. Closed in the scene; `open` shows the shelves.
const PW = 36, PH = 70;
function pantry(open) {
  const f = blank(PW, PH);
  // Cornice and frame.
  fill(f, 0, 0, PW, 4, P.T);
  fill(f, 1, 1, PW - 2, 2, P.t);
  box(f, 2, 4, PW - 4, PH - 4, P.t, P.T);
  if (!open) {
    for (const x0 of [3, 18]) {
      box(f, x0, 5, 15, PH - 7, "#a8623a", P.T);
      box(f, x0 + 2, 8, 11, 24, "#b8724a", P.T);
      box(f, x0 + 2, 36, 11, 26, "#b8724a", P.T);
    }
    fill(f, 15, 33, 2, 3, P.y);
    fill(f, 19, 33, 2, 3, P.y);
    return f;
  }
  // Inside: dark back wall, three shelves with jars and cans.
  fill(f, 3, 5, PW - 6, PH - 7, "#4a2a18");
  const shelves = [22, 41, 60];
  for (const y of shelves) {
    fill(f, 3, y, PW - 6, 2, P.C);
    fill(f, 3, y + 2, PW - 6, 1, P.T);
  }
  const jar = (x, yb, w, h, c, lid) => {
    box(f, x, yb - h, w, h, c, P.k);
    fill(f, x, yb - h - 2, w, 2, lid);
    set(f, x + 1, yb - h + 1, P.w);
  };
  // Top shelf: jam, pickles, a bag of flour.
  jar(5, 22, 6, 7, P.r, P.y);
  jar(12, 22, 6, 9, P.g, P.x);
  box(f, 20, 10, 9, 12, P.W, P.k);
  fill(f, 22, 14, 5, 3, P.U);
  // Middle shelf: a can on the left, a gap for the file, a can at the right.
  jar(5, 41, 5, 7, P.x, P.z);
  fill(f, 5, 36, 5, 2, P.r);
  jar(27, 41, 5, 9, P.o, P.T);
  // Bottom shelf: potatoes and a jar of peas.
  disc(f, 8, 57, 3, "#c49a5a", P.N);
  disc(f, 13, 58, 2.5, "#c49a5a", P.N);
  jar(19, 60, 7, 8, P.h, P.G);
  for (const [x, y] of [[20, 55], [22, 57], [24, 54], [21, 58]]) set(f, x, y, P.G);
  return f;
}

// Pantry doors swung open, seen edge-on.
function pantryDoors() {
  const f = blank(46, 66);
  for (const x0 of [0, 40])
    for (let y = 0; y < 66; y++) {
      const c = y === 0 || y === 65 ? P.T : "#a8623a";
      fill(f, x0, y, 6, 1, c);
      set(f, x0 + (x0 ? 5 : 0), y, P.T);
    }
  fill(f, 41, 30, 2, 3, P.y);
  fill(f, 3, 30, 2, 3, P.y);
  return f;
}

// Counter with drawers; the cutting board sits on it.
function counter() {
  const W = 52, H = 20, f = blank(W, H);
  fill(f, 0, 0, W, 3, "#d9a066");
  fill(f, 0, 2, W, 1, P.t);
  box(f, 1, 3, W - 2, H - 3, "#e9e1cc", P.T);
  for (const x0 of [3, 27]) {
    box(f, x0, 5, 22, 6, P.W, P.t);
    fill(f, x0 + 9, 7, 4, 1, P.z);
    box(f, x0, 12, 22, 7, P.W, P.t);
  }
  return f;
}

const board = [
  "...........................tt.",
  "..ttttttttttttttttttttttttt..t",
  ".tCCCCCCCCCCCCCCCCCCCCCCCCCtt.",
  "..TTTTTTTTTTTTTTTTTTTTTTTTT...",
];

// The stove under the pot.
function stove() {
  const W = 38, H = 22, f = blank(W, H);
  box(f, 0, 0, W, H, P.W, P.k);
  fill(f, 1, 1, W - 2, 3, P.X);
  fill(f, 1, 4, W - 2, 1, P.z);
  for (const x of [6, 13, 24, 31]) {
    disc(f, x, 2.5, 1.5, P.k);
    set(f, x, 1, P.w);
  }
  box(f, 4, 7, W - 8, 12, P.x, P.k);
  box(f, 7, 9, W - 14, 7, P.Z, P.k);
  fill(f, 9, 10, 6, 1, P.z);
  fill(f, 8, 6, W - 16, 1, P.z);
  return f;
}

function flame(i) {
  const f = blank(30, 3);
  for (let x = 2; x < 28; x += 3) {
    const tall = (x + i * 3) % 6 < 3;
    set(f, x, 2, P.b);
    if (tall) set(f, x, 1, P.U);
    if (tall && x % 2) set(f, x, 0, P.B);
  }
  return f;
}

// The big pot of pea soup. `soup` = [main, dark, bubble] colors; `bubbles`
// picks the bubbling frame; `heap` raises the soup and adds foam.
const POT_W = 38, POT_H = 26, TOP = 3, RIM = 9;
// `o`: soup colors [main, dark, bubble], `fill` raises the surface (0..2),
// `bubbles` 0..2 (more and bigger), `veg` shows carrots and potato,
// `foam` piles a dome over the rim, `drip` is how far it runs down the side.
function pot(i, o = {}) {
  const { soup = [P.g, P.G, P.h], fill: lvl = 0, bubbles = 0, veg = false, foam = false, drip = 0 } = o;
  const f = blank(POT_W, POT_H);
  const [s, S, h] = soup;
  const cx = POT_W / 2;
  // Body: a little rounder in the middle, shaded steel.
  for (let y = TOP + 4; y < POT_H; y++) {
    const u = (y - TOP - 4) / (POT_H - TOP - 5);
    const half = 16 + Math.round(Math.sin(u * Math.PI * 0.9) * 1.4) - (y === POT_H - 1 ? 2 : 0);
    for (let x = 0; x < POT_W; x++) {
      const dx = x + 0.5 - cx;
      if (Math.abs(dx) > half) continue;
      const edge = Math.abs(dx) > half - 1 || y === POT_H - 1;
      const k = dx / half;
      set(f, x, y, edge ? P.k : k < -0.65 ? P.X : k > 0.55 ? P.z : k > 0.3 ? "#7d8792" : P.x);
    }
  }
  // A band round the pot and the handles.
  for (let x = 3; x < POT_W - 3; x++) set(f, x, TOP + 13, P.z);
  box(f, 0, TOP + 9, 3, 5, P.z, P.k);
  box(f, POT_W - 3, TOP + 9, 3, 5, P.z, P.k);
  // Rim: an ellipse seen from above, full of soup. A fuller pot shows less
  // of the far inside wall (the dark band at the top).
  const ry = RIM / 2;
  const wall = [3, 2, 1][lvl];
  for (let y = 0; y < RIM; y++)
    for (let x = 0; x < POT_W; x++) {
      const dx = (x + 0.5 - cx) / (cx - 1);
      const dy = (y + 0.5 - ry) / ry;
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      const rim = d > 0.68;
      let c = rim ? (y < ry ? P.z : P.X) : y < wall ? S : s;
      if (rim && d > 0.9) c = P.k;
      set(f, x, TOP + y, c);
    }
  if (veg)
    for (const [x, y, c] of [[9, 5, P.o], [14, 6, P.s], [20, 5, P.o], [25, 6, P.s], [28, 4, P.o], [12, 4, P.o], [23, 3, "#c8323c"]])
      set(f, x + ((i + x) % 2), TOP + y, c);
  // Bubbles on the surface.
  const spots = [
    [[[11, 4, 1.1], [24, 5, 1]], [[17, 4, 1.3], [27, 4, 0.9]], [[13, 5, 0.9], [21, 3, 1.1]]],
    [[[10, 4, 1.4], [19, 5, 1.2], [27, 4, 1]], [[15, 4, 1.6], [24, 5, 1.2], [8, 5, 0.9]], [[12, 5, 1.2], [21, 4, 1.5], [28, 5, 1]]],
    [[[10, 4, 2.2], [21, 3, 1.8], [28, 5, 1.4]], [[15, 4, 2.4], [26, 4, 1.7], [8, 5, 1.2]], [[12, 3, 1.6], [19, 5, 2.4], [28, 4, 1.8]]],
  ][bubbles];
  for (const [bx, by, r] of spots[i % 3]) {
    disc(f, bx, TOP + by + 0.5, r, h);
    set(f, Math.round(bx - r / 2), TOP + by, P.w);
  }
  if (foam) {
    // The soup has risen: a foamy dome over the rim.
    for (let y = 0; y < TOP + 2; y++)
      for (let x = 0; x < POT_W; x++) {
        const dx = (x + 0.5 - cx) / 13;
        const dy = (y + 0.5 - (TOP + 2)) / (TOP + 1.5);
        if (dx * dx + dy * dy > 1) continue;
        set(f, x, y, (x * 3 + y + i) % 5 === 0 ? P.w : (x + y + i) % 3 ? s : h);
      }
  }
  // Drips running down the side.
  if (drip)
    for (const [x, len] of [[6, drip + (i % 2)], [13, drip - 2], [26, drip - 1 + ((i + 1) % 2)], [31, drip - 3]])
      if (len > 0) {
        fill(f, x, TOP + 6, 1, len, s);
        set(f, x, TOP + 6 + len, S);
      }
  return f;
}

// The pot over a session: each kept file makes the soup fuller and richer.
const POT_STAGES = [
  { fill: 1, bubbles: 1 },
  { fill: 2, bubbles: 1, soup: ["#6aa535", "#4d8229", P.h] },
  { fill: 2, bubbles: 1, veg: true, soup: ["#68a334", "#4a7f28", P.h] },
  { fill: 2, bubbles: 2, veg: true, soup: ["#5c9a2c", "#3f7322", "#b8dd8a"] },
  { fill: 2, bubbles: 2, veg: true, foam: true, drip: 3, soup: ["#54922a", "#3a6b1f", "#c0e494"] },
  { fill: 2, bubbles: 2, veg: true, foam: true, drip: 9, soup: ["#4e8a26", "#33631b", "#c8e6a0"] },
];

// keep: a rolling boil laid over whatever stage the pot is at, with bits of
// the new ingredient (`bits`) jumping out. Transparent everywhere else.
function boil(i, bits) {
  const f = blank(POT_W, POT_H);
  const foamC = ["#ffffffd0", "#e8f6d8e0"];
  for (const [bx, by, r] of [[[9, 6, 2.2], [18, 6, 2.6], [27, 6, 2]], [[13, 5, 2.6], [23, 6, 2.4], [30, 6, 1.4]], [[8, 6, 1.8], [17, 5, 2.4], [26, 5, 2.6]]][i])
    disc(f, bx, TOP + by - 1, r, foamC[(bx + i) % 2], "#ffffff");
  for (const [x, y] of [[[12, 1], [24, 0]], [[8, 0], [20, 1], [29, 1]], [[15, 0], [26, 1]]][i]) {
    set(f, x, y, bits[0]);
    set(f, x + 1, y, bits[1]);
    set(f, x, y + 1, bits[1]);
  }
  return f;
}

function steam(i) {
  const f = blank(30, 20);
  const c = "#ffffffb0", d = "#ffffff70";
  const puffs = [
    [[8, 16, 2], [9, 10, 2.5], [7, 4, 2], [20, 14, 2], [22, 8, 2.5]],
    [[9, 14, 2.5], [7, 8, 2], [9, 3, 1.5], [21, 16, 2], [20, 10, 2.5], [22, 4, 2]],
    [[7, 15, 2], [9, 9, 2.5], [21, 13, 2.5], [23, 6, 2], [14, 3, 1.5]],
  ][i];
  puffs.forEach(([x, y, r], j) => disc(f, x, y, r, j % 2 ? d : c));
  return f;
}

function bigSteam(i) {
  const f = blank(40, 26);
  const c = "#ffffffc0", d = "#ffffff80";
  const r = 3 + i * 0.6;
  disc(f, 12, 20 - i * 2, r, c);
  disc(f, 27, 19 - i * 2, r, c);
  disc(f, 19, 12 - i * 2, r + 1, d);
  disc(f, 10, 8 - i, r - 0.5, d);
  disc(f, 30, 7 - i, r - 1, c);
  return f;
}

// A ladle stirring the soup: the handle sweeps across.
function ladle(i) {
  const f = blank(20, 18);
  const tops = [[3, 0], [9, 0], [16, 0], [10, 0]][i];
  const bottom = [10, 9];
  const [x0, y0] = tops;
  const n = 20;
  for (let k = 0; k <= n; k++) {
    const x = Math.round(x0 + ((bottom[0] - x0) * k) / n);
    const y = Math.round(y0 + ((bottom[1] - y0) * k) / n);
    set(f, x, y, P.x);
    set(f, x + 1, y, P.z);
  }
  fill(f, x0 - 1, 0, 3, 2, P.N);
  // The bowl is under the soup; just a swirl where the handle goes in.
  for (const [dx, dy] of [[-3, 1], [-2, 2], [2, 1], [3, 0], [-1, 3], [1, 3]]) set(f, bottom[0] + dx, bottom[1] + dy + (i % 2), P.h);
  return f;
}

// ---------- the dog ----------

const dogLie = [
  ".....NN..................",
  "...nnnNN.................",
  "..nnnnnNN................",
  ".nnknnnNN................",
  "knnnnnnnN................",
  ".llnnnnrr.nnnnnnnnnn.....",
  "..llnnnrrnnnnnnnnnnnn....",
  "...lnnnnnnnnnnnnnnnnnN...",
  ".llllnnnnnnnnnnnnnnnnNnnn",
  "lllll..llll......llll....",
];
// Tail up for the second frame of the wag.
const dogLie2 = dogLie.map((r, y) =>
  y === 5 ? r.slice(0, 22) + "..n" : y === 6 ? r.slice(0, 22) + ".n." : y === 7 ? r.slice(0, 22) + "n.." : y === 8 ? r.slice(0, 22) + "..." : r,
);

// As it gets fed over a session the dog gets content, then rounder, then
// properly smitten. `put` writes a string into a row at x.
const put = (rows, y, x, str) => rows.map((r, j) => (j === y ? r.slice(0, x) + str + r.slice(x + str.length) : r));
const content = (rows) => put(rows, 3, 3, "N");
const belly = (rows) => put(put(rows, 9, 7, "llllllllllllll"), 8, 9, "lllllllll");
const round = (rows) => put(put(rows, 4, 10, "nnnnnnnnnn"), 5, 9, "nnnnnnnnnnnn");
const smitten = (rows) => put(put(rows, 1, 15, "r.r"), 2, 15, ".r.");
const DOG_STAGES = [
  (r) => belly(content(r)),
  (r) => round(belly(content(r))),
  (r) => smitten(round(belly(content(r)))),
];

const dogSit = [
  "....NN..........",
  "..nnnNN.........",
  ".nnnnnNN........",
  "nnknnnNN........",
  "knnnnnnN........",
  ".nnnnnnn........",
  "..llnnrr........",
  "...lnnrrn.......",
  "...lnnnnnn......",
  "...lnnnnnnn.....",
  "...lnnnnnnnn....",
  "...lnnnnnnnnn..n",
  "...lnnnnnnnnnnn.",
  "...lnnnnnnnnnnn.",
  "...ln.lnnnnnnnn.",
  "...ln.lnnnnnnnn.",
  "...ln.lnnNNnnnn.",
  "..llllllll.llll.",
];
// Mouth open, and the tail swung down.
const dogBeg = dogSit.map((r, y) =>
  y === 4 ? "knnnnnnN........" : y === 5 ? "...pnnnn........" : y === 6 ? ".lllnnrr........" : y === 11 ? "...lnnnnnnnnn..." : y === 12 ? "...lnnnnnnnnnnnn" : r,
);
// Happy: eyes shut, tail high (two frames for the wag).
const dogHappy = dogSit.map((r, y) => (y === 3 ? "nnTnnnNN........" : r));
const dogHappy2 = dogBeg.map((r, y) => (y === 3 ? "nnTnnnNN........" : y === 5 ? ".nnnnnnn........" : y === 6 ? "..llnnrr........" : r));

// Leaping up and to the left, mouth wide open.
const dogLeap = [
  "...NN...................",
  ".nnnNN..................",
  "nnknnNN.................",
  "knnnnnN.................",
  "..p.nnnn................",
  "ll..nnrrnn..............",
  "....lnrrnnnn............",
  ".....lnnnnnnnnn.........",
  "......lnnnnnnnnnnn....nn",
  ".......lnnnnnnnnnnnnnn..",
  "......ll..nnnnnnnnnn....",
  ".....ll.........nnnn....",
  "................nn.nn...",
  "...............nn...nn..",
];

// Running right (toward the yard), two frames.
const dogRun1 = [
  "...............NN...",
  "..............NNnnn.",
  "nn...........NNnnknn",
  "..n..........Nnnnnnk",
  "...nnnnnnnnnnrrnnnn.",
  "...nnnnnnnnnnrrnll..",
  "...nnnnnnnnnnnnnl...",
  "....nnnnnnnnnnnn....",
  "...nn.nn....nn.nn...",
  "..nn...nn..nn...nn..",
];
const dogRun2 = [
  "...............NN...",
  "nnn...........NNnnn.",
  "..nn.........NNnnknn",
  "...n.........Nnnnnnk",
  "...nnnnnnnnnnrrnnnn.",
  "...nnnnnnnnnnrrnll..",
  "...nnnnnnnnnnnnnl...",
  "....nnnnnnnnnnnn....",
  ".....nnn....nnn.....",
  ".....n.n....n.n.....",
];

// The little dog seen through the window, digging in the yard.
const miniDog1 = ["......nn.", "nnnnnnnNn", "nnnnnnn..", "n.n..n.n."];
const miniDog2 = ["..........", ".....nn.", "nnnnnnNn", "nnnnnnn.", "n.n.n.n."];
const dirt1 = ["T......", ".N..T..", "...N...", "......."];
const dirt2 = ["...T...", "N.....T", "..N....", "...T..."];
const mound = ["..TTT..", ".TNNNT.", "TNNNNNT"];
const flower = [".r.", "ryr", ".r.", ".E."];

const bowl = ["kRRRRRRRk", ".kRRRRRk.", "..kkkkk.."];
const bowlFood = ["..TNTNT..", "kRRRRRRRk", ".kRRRRRk.", "..kkkkk.."];

// Paints over the lying dog with the wall color, so another dog can take its place.
const dogPatch = fill(blank(25, 11), 0, 0, 25, 11, WAINSCOT);

// ---------- the recipe book and effects ----------

// The recipe book, for renames: it opens, and a quill writes the new name in.
const BOOK_W = 152, BOOK_H = 58, PAGE_BOTTOM = 50;
const RULE = "#c9dbe3", OLDINK = "#b9a684";

const stamp = (f, rows, ox, oy) => rows.forEach((r, y) => [...r].forEach((c, x) => set(f, ox + x, oy + y, P[c])));

function bookCover(f, x0, w) {
  box(f, x0, 0, w, 55, P.R, "#5a1510");
  for (const [cx, cy] of [[x0 + 1, 1], [x0 + w - 4, 1], [x0 + 1, 51], [x0 + w - 4, 51]]) fill(f, cx, cy, 3, 3, P.y);
}

function pageBlock(f, x0, w, spineSide) {
  fill(f, x0, 2, w, PAGE_BOTTOM - 1, P.W);
  // Shade toward the spine, and the stack of pages along the bottom.
  const sx = spineSide === "right" ? x0 + w - 3 : x0;
  fill(f, sx, 2, 3, PAGE_BOTTOM - 1, P.c);
  fill(f, x0, PAGE_BOTTOM + 1, w, 1, P.l);
  fill(f, x0, PAGE_BOTTOM + 2, w, 1, P.C);
}

// Ruled lines and a pink margin on the right page, ready for writing.
function ruled(f) {
  for (const y of [15, 27, 36, 45]) fill(f, 80, y, 67, 1, RULE);
  fill(f, 81, 3, 1, PAGE_BOTTOM - 2, P.p);
}

function bookOpen() {
  const f = blank(BOOK_W, BOOK_H);
  bookCover(f, 0, BOOK_W);
  pageBlock(f, 3, 72, "right");
  pageBlock(f, 77, 72, "left");
  fill(f, 75, 1, 2, 53, "#5a1510");
  // Right page: ruled lines and a pink margin, ready for writing.
  ruled(f);
  // Left page: a dashed frame for the ingredient's picture...
  for (let i = 0; i < 22; i++) {
    if (i % 3 === 2) continue;
    set(f, 26 + i, 11, P.C); set(f, 26 + i, 32, P.C);
    set(f, 26, 11 + i, P.C); set(f, 47, 11 + i, P.C);
  }
  // ...little doodles of a pea pod and a carrot, and an older recipe's scribbles.
  stamp(f, [".GGGGGG.", "GhGhGhGG", ".GGGGGG."], 8, 5);
  stamp(f, ["..E.E", "...E.", "oooo.", ".ooo.", "..o.."], 58, 4);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (const y of [38, 43]) {
    let x = 9;
    while (x < 66) {
      const word = 3 + Math.floor(rnd() * 8);
      for (let i = 0; i < word && x + i < 66; i++) set(f, x + i, y + (i % 3 === 1 ? -1 : 0), OLDINK);
      x += word + 3;
    }
  }
  // A ribbon bookmark hanging out the bottom.
  fill(f, 110, 50, 3, 6, P.r);
  set(f, 110, 56, P.r); set(f, 112, 56, P.r); set(f, 111, 55, P.R);
  return f;
}

function bookClosed() {
  const W = 76, f = blank(W, BOOK_H);
  bookCover(f, 0, W);
  fill(f, 0, 0, 4, 55, "#5a1510");
  for (let y = 4; y < 51; y += 3) set(f, W - 1, y, P.W);
  // A golden pea pod on the cover.
  const pod = [".yyyyyyyyyy.", "yyRyyRyyRyyy", "yRRyRRyRRyyy", "yyRyyRyyRyyy", ".yyyyyyyyyy."];
  pod.forEach((r, y) => [...r].forEach((c, x) => c !== "." && set(f, 32 + x, 22 + y, c === "y" ? P.y : P.R)));
  fill(f, 26, 18, 24, 1, P.y);
  fill(f, 26, 31, 24, 1, P.y);
  return f;
}

// Halfway open: the right page lies flat and the cover stands up over the left.
function bookHalf() {
  const f = blank(BOOK_W, BOOK_H);
  bookCover(f, 76, 76);
  pageBlock(f, 77, 72, "left");
  ruled(f);
  fill(f, 75, 1, 2, 53, "#5a1510");
  box(f, 44, 0, 32, 55, "#a3271c", "#5a1510");
  fill(f, 44, 0, 3, 55, P.y);
  return f;
}

// A goose-feather quill; its nib is the bottom-left pixel (0, 17).
function quill() {
  const W = 15, H = 18, f = blank(W, H);
  const ax = 0.5, ay = 17.5, bx = 14.5, by = 0.5, len = Math.hypot(bx - ax, by - ay);
  const ux = (bx - ax) / len, uy = (by - ay) / len;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - ax, dy = y + 0.5 - ay, u = (dx * ux + dy * uy) / len, d = dx * -uy + dy * ux;
      if (u < 0 || u > 1) continue;
      if (u > 0.3) {
        const w = 3.3 * Math.sin((Math.PI * (u - 0.3)) / 0.72) ** 0.7;
        if (Math.abs(d) < 0.6) set(f, x, y, P.x);
        else if (Math.abs(d) < w) set(f, x, y, Math.abs(d) > w - 1 ? P.X : P.w);
      } else if (Math.abs(d) < 0.7) set(f, x, y, u < 0.12 ? P.k : P.T);
    }
  set(f, 0, 17, P.k);
  return f;
}

const flourish = ["..RR....", ".R..R..R", "R....RR."];
const twinkle = ["..y..", "..y..", "yy.yy", "..y..", "..y.."];
const twinkle2 = [".....", "..y..", ".y.y.", "..y..", "....."];

const heart = [".r.r.", "rrrrr", "rrrrr", ".rrr.", "..r.."];
const crumb1 = ["T..", "..N", ".T."];
const crumb2 = ["..T", "N..", "..."];
const note1 = ["..kk", "..k.", "kkk.", "kk.."];

export const sprites = {
  beam: beam(),
  floor: floor(),
  window: [windowArt(false), windowArt(true)],
  utensils: [utensils(false), utensils(true)],
  pantry: pantry(false),
  pantryOpen: pantry(true),
  pantryDoors: pantryDoors(),
  counter: counter(),
  board: art(board, P),
  stove: stove(),
  flame: [0, 1].map(flame),
  pot: [0, 1, 2].map((i) => pot(i)),
  ...Object.fromEntries(POT_STAGES.map((o, n) => [`pot${n + 1}`, [0, 1, 2].map((i) => pot(i, o))])),
  // The soup after something goes in: richer, bubblier, foaming over.
  // The keep overlays: a rolling boil with peas, carrots or herbs jumping out.
  boilPeas: [0, 1, 2].map((i) => boil(i, [P.h, P.G])),
  boilCarrot: [0, 1, 2].map((i) => boil(i, [P.o, "#c8622a"])),
  boilHerb: [0, 1, 2].map((i) => boil(i, [P.e, P.E])),
  steam: [0, 1, 2].map(steam),
  bigSteam: [0, 1, 2].map(bigSteam),
  ladle: [0, 1, 2, 3].map(ladle),
  splash: burst(20, 5, [P.w, P.h, P.g, P.G]),
  dog: [art(dogLie, P), art(dogLie2, P)],
  ...Object.fromEntries(DOG_STAGES.map((st, n) => [`dog${n + 1}`, [art(st(dogLie), P), art(st(dogLie2), P)]])),
  dogPatch,
  dogSit: art(dogSit, P),
  dogBeg: [art(dogSit, P), art(dogBeg, P)],
  dogHappy: [art(dogHappy, P), art(dogHappy2, P)],
  dogLeap: art(dogLeap, P),
  dogRun: [art(dogRun1, P), art(dogRun2, P)],
  miniDog: [art([".........", ...miniDog1], P), art(miniDog2.map((r) => r.slice(0, 9).padEnd(9, ".")), P)],
  dirt: [art(dirt1, P), art(dirt2, P)],
  mound: art(mound, P),
  flower: art(flower, P),
  bowl: art(bowl, P),
  bowlFood: art(bowlFood, P),
  bookOpen: bookOpen(),
  bookHalf: bookHalf(),
  bookClosed: bookClosed(),
  quill: quill(),
  flourish: art(flourish, P),
  twinkle: [art(twinkle, P), art(twinkle2, P)],
  heart: art(heart, P),
  crumb: [art(crumb1, P), art(crumb2, P)],
  note: art(note1, P),
};

// ---------- layout ----------

const FILE = [62, 45];
const POT = [95, 30];
const MOUTH = [POT[0] + 11, POT[1] - 2];
const DOG = [133, 69];
const BOWL = [150, 76];
const SHELF = [17, 30]; // where the file sits in the pantry (scale 0.75)
const WIN = [44, 11];
const CAP = [80, 2];
const CAP_COLOR = "#ffe9b0";

const hold = (t0, t1, x, y, extra = {}) => [{ t: t0, x, y, ...extra }, { t: t1, x, y, ...extra }];
const fadeIn = (t0, t1, x, y) => [{ t: t0, x, y, alpha: 0 }, { t: t1, x, y }, { t: 1, x, y }];
const cap = (text, t0 = 0.4, color = CAP_COLOR) => ({ text, color, align: "center", keys: fadeIn(t0, t0 + 0.1, CAP[0], CAP[1]) });

// keep: the file hops into the pot, splash, the soup changes and the ladle stirs.
function intoTheSoup(soupSprite, caption, extra = []) {
  return {
    duration: 2200,
    tracks: [
      { sprite: "file", keys: [
        { t: 0, x: FILE[0], y: FILE[1] }, { t: 0.08, x: FILE[0], y: FILE[1] + 2 }, { t: 0.12, x: FILE[0], y: FILE[1] },
        { t: 0.38, x: MOUTH[0] + 2, y: MOUTH[1] - 12, arc: 22, ease: "out" },
        { t: 0.46, x: MOUTH[0] + 2, y: MOUTH[1] + 2, scale: 0.7, ease: "in" },
        { t: 0.5, x: MOUTH[0] + 2, y: MOUTH[1] + 6, scale: 0.4, alpha: 0 },
      ] },
      { sprite: soupSprite, fps: 6, keys: [{ t: 0.47, x: POT[0], y: POT[1], alpha: 0 }, { t: 0.55, x: POT[0], y: POT[1] }, { t: 1, x: POT[0], y: POT[1] }] },
      { sprite: "splash", fps: 12, once: true, keys: hold(0.46, 0.72, POT[0] + 9, POT[1] - 10) },
      { sprite: "bigSteam", fps: 4, keys: [{ t: 0.55, x: POT[0] - 2, y: POT[1] - 18, alpha: 0 }, { t: 0.65, x: POT[0] - 1, y: POT[1] - 20 }, { t: 1, x: POT[0] - 1, y: POT[1] - 24, alpha: 0.4 }] },
      { sprite: "ladle", fps: 6, keys: [{ t: 0.58, x: POT[0] + 12, y: POT[1] - 4, alpha: 0 }, { t: 0.64, x: POT[0] + 12, y: POT[1] - 4 }, { t: 1, x: POT[0] + 12, y: POT[1] - 4 }] },
      ...extra,
      cap(caption, 0.5),
    ],
  };
}

// trash: the dog leaps up and catches the file, then wags happily.
function fedToTheDog() {
  return {
    duration: 2200,
    tracks: [
      { sprite: "dogPatch", keys: hold(0, 1, DOG[0], DOG[1]) },
      { sprite: "bowl", keys: hold(0, 1, BOWL[0], BOWL[1] + 1) },
      { sprite: "dogBeg", fps: 6, keys: hold(0, 0.3, DOG[0] + 2, DOG[1] - 7) },
      { sprite: "dogLeap", keys: [{ t: 0.3, x: DOG[0], y: DOG[1] - 4 }, { t: 0.43, x: DOG[0] + 2, y: DOG[1] - 26, ease: "out" }, { t: 0.56, x: DOG[0] + 2, y: DOG[1] - 4, ease: "in" }] },
      { sprite: "dogSit", keys: hold(0.56, 0.66, DOG[0] + 2, DOG[1] - 7) },
      { sprite: "dogHappy", fps: 8, keys: hold(0.66, 1, DOG[0] + 2, DOG[1] - 7) },
      { sprite: "file", keys: [
        { t: 0, x: FILE[0], y: FILE[1] }, { t: 0.1, x: FILE[0], y: FILE[1] },
        { t: 0.43, x: DOG[0] - 8, y: DOG[1] - 34, arc: 30, ease: "out" },
        { t: 0.47, x: DOG[0] - 4, y: DOG[1] - 28, scale: 0.4, alpha: 0 },
      ] },
      { sprite: "crumb", fps: 8, keys: [{ t: 0.45, x: DOG[0] + 1, y: DOG[1] - 24 }, { t: 0.7, x: DOG[0] - 3, y: DOG[1] + 6, ease: "in" }] },
      { sprite: "heart", keys: [{ t: 0.68, x: DOG[0] + 6, y: DOG[1] - 12, alpha: 0 }, { t: 0.74, x: DOG[0] + 6, y: DOG[1] - 14 }, { t: 1, x: DOG[0] + 4, y: DOG[1] - 26, alpha: 0 }] },
      { sprite: "heart", keys: [{ t: 0.8, x: DOG[0] + 14, y: DOG[1] - 12, alpha: 0 }, { t: 0.86, x: DOG[0] + 14, y: DOG[1] - 14 }, { t: 1, x: DOG[0] + 16, y: DOG[1] - 22, alpha: 0 }] },
      cap("FED TO THE DOG", 0.5),
    ],
  };
}

// trash, take two: the file lands in the dog's bowl and the dog gobbles it up.
function intoTheBowl() {
  return {
    duration: 2000,
    sounds: [{ sfx: "whoosh", at: 0.08 }, { sfx: "soupPlop", at: 0.38 }, { sfx: "soupGulp", at: 0.55 }, { sfx: "soupGulp", at: 0.68 }, { sfx: "soupYip", at: 0.84 }],
    tracks: [
      { sprite: "dogPatch", keys: hold(0.38, 1, DOG[0], DOG[1]) },
      { sprite: "bowl", keys: hold(0.75, 1, BOWL[0], BOWL[1] + 1) },
      { sprite: "bowlFood", keys: hold(0.38, 0.75, BOWL[0], BOWL[1]) },
      { sprite: "file", keys: [
        { t: 0, x: FILE[0], y: FILE[1] }, { t: 0.08, x: FILE[0], y: FILE[1] },
        { t: 0.36, x: BOWL[0] - 4, y: BOWL[1] - 12, arc: 30, ease: "out" },
        { t: 0.44, x: BOWL[0] - 4, y: BOWL[1] - 6, scale: 0.5, alpha: 0, ease: "in" },
      ] },
      { sprite: "dogRun", fps: 6, keys: hold(0.4, 0.78, BOWL[0] - 15, DOG[1] + 2) },
      { sprite: "dogHappy", fps: 8, keys: hold(0.78, 1, DOG[0] + 2, DOG[1] - 7) },
      { sprite: "crumb", fps: 8, keys: hold(0.5, 0.78, BOWL[0] - 2, BOWL[1] - 8) },
      { sprite: "heart", keys: [{ t: 0.78, x: DOG[0] + 2, y: DOG[1] - 4, alpha: 0 }, { t: 0.84, x: DOG[0] + 2, y: DOG[1] - 6 }, { t: 1, x: DOG[0], y: DOG[1] - 20, alpha: 0 }] },
      cap("FED TO THE DOG", 0.45),
    ],
  };
}

// delete: the dog catches it, runs out to the yard and buries it for good.
function buried() {
  const W = WIN;
  return {
    duration: 2600,
    tracks: [
      { sprite: "dogPatch", keys: hold(0, 1, DOG[0], DOG[1]) },
      { sprite: "bowl", keys: hold(0, 1, BOWL[0], BOWL[1] + 1) },
      { sprite: "dogBeg", fps: 6, keys: hold(0, 0.26, DOG[0] + 2, DOG[1] - 7) },
      { sprite: "file", keys: [
        { t: 0, x: FILE[0], y: FILE[1] }, { t: 0.06, x: FILE[0], y: FILE[1] },
        { t: 0.26, x: DOG[0] - 2, y: DOG[1] - 10, arc: 20, ease: "out" },
        { t: 0.3, x: DOG[0] + 6, y: DOG[1] - 6, scale: 0.5 },
        { t: 0.48, x: 170, y: DOG[1] - 2, scale: 0.5, ease: "in" },
      ] },
      { sprite: "dogRun", fps: 10, keys: [{ t: 0.26, x: DOG[0] - 4, y: DOG[1] }, { t: 0.48, x: 168, y: DOG[1], ease: "in" }] },
      // Out in the yard, through the window.
      { sprite: "miniDog", fps: 8, keys: [{ t: 0.5, x: W[0] + 30, y: W[1] + 17 }, { t: 0.58, x: W[0] + 18, y: W[1] + 17 }, { t: 0.82, x: W[0] + 18, y: W[1] + 17 }, { t: 0.92, x: W[0] + 30, y: W[1] + 17 }] },
      { sprite: "dirt", fps: 8, keys: hold(0.58, 0.82, W[0] + 24, W[1] + 13) },
      { sprite: "file", keys: [{ t: 0.6, x: W[0] + 13, y: W[1] + 14, scale: 0.25 }, { t: 0.76, x: W[0] + 13, y: W[1] + 18, scale: 0.25, alpha: 0 }] },
      { sprite: "mound", keys: fadeIn(0.76, 0.82, W[0] + 9, W[1] + 19) },
      { sprite: "flower", keys: fadeIn(0.84, 0.9, W[0] + 11, W[1] + 15) },
      cap("GONE FOR GOOD", 0.62, "#ffd23f"),
    ],
  };
}

// rename: the recipe book opens, the file hops onto the picture frame and a
// quill writes "NEW INGREDIENT:" and then the new name, letter by letter (each
// letter is a copy of the text clipped one glyph wider than the last).
const BOOK = [4, 6];
const BOOK_SHUT = [BOOK[0] + 76, BOOK[1]];
const PIC = [BOOK[0] + 29, BOOK[1] + 14];
const TEXT_X = BOOK[0] + 82;
const LINE = { head: BOOK[1] + 8, name1: BOOK[1] + 20, name2: BOOK[1] + 29, under: BOOK[1] + 38 };
const PER_LINE = 16; // glyphs per line: 16 x 4px fills the ruled page
const WRITE_END = 0.86; // the book starts to close

// One track per letter; returns them plus the pen's keys along the way.
function writeLine(text, y, color, t0, t1, count, skip = 0) {
  const dt = (t1 - t0) / count, tracks = [], pen = [];
  for (let i = 0; i < count; i++) {
    const a = t0 + i * dt, b = i === count - 1 ? WRITE_END : t0 + (i + 1) * dt;
    tracks.push({ text, color, shadow: false, clip: [TEXT_X, y - 1, 4 * (i + 1), 8], keys: hold(a, b, TEXT_X - skip * 4, y) });
    pen.push({ t: a + dt * 0.5, x: TEXT_X + 4 * i + 2, y: y + (i % 2 ? 1 : 4) - 17 });
  }
  pen.push({ t: t1, x: TEXT_X + 4 * count, y: y + 4 - 17 });
  return { tracks, pen };
}

function intoTheRecipeBook() {
  const head = writeLine("NEW INGREDIENT:", LINE.head, "#2a1a14", 0.13, 0.35, 15);
  const name1 = writeLine("{newName}", LINE.name1, "#8e2219", 0.39, 0.6, PER_LINE);
  const name2 = writeLine("{newName}", LINE.name2, "#8e2219", 0.62, 0.68, PER_LINE, PER_LINE);
  const under = (i) => ({ sprite: "flourish", keys: hold(0.7 + i * 0.008, WRITE_END, TEXT_X + i * 8, LINE.under) });
  const tip = (t, x, y, extra = {}) => ({ t, x, y: y - 17, ...extra });
  return {
    duration: 2600,
    tracks: [
      { sprite: "bookClosed", keys: [
        { t: 0, x: BOOK_SHUT[0], y: 70, alpha: 0 }, { t: 0.05, x: BOOK_SHUT[0], y: BOOK_SHUT[1], ease: "out" }, { t: 0.065, x: BOOK_SHUT[0], y: BOOK_SHUT[1] },
      ] },
      { sprite: "bookClosed", keys: [
        { t: 0.9, x: BOOK_SHUT[0], y: BOOK_SHUT[1] }, { t: 0.92, x: BOOK_SHUT[0], y: BOOK_SHUT[1] }, { t: 1, x: BOOK_SHUT[0], y: 70, alpha: 0, ease: "in" },
      ] },
      { sprite: "bookHalf", keys: hold(0.065, 0.09, BOOK[0], BOOK[1]) },
      { sprite: "bookOpen", keys: hold(0.09, WRITE_END, BOOK[0], BOOK[1]) },
      { sprite: "bookHalf", keys: hold(WRITE_END, 0.9, BOOK[0], BOOK[1]) },
      ...head.tracks, ...name1.tracks, ...name2.tracks,
      ...[0, 1, 2, 3, 4, 5, 6, 7].map(under),
      { sprite: "file", keys: [
        { t: 0, x: FILE[0], y: FILE[1] }, { t: 0.085, x: FILE[0], y: FILE[1] },
        { t: 0.14, x: PIC[0], y: PIC[1], arc: 16, ease: "out" }, { t: 0.77, x: PIC[0], y: PIC[1] },
        { t: 0.79, x: PIC[0], y: PIC[1] + 1 },
        { t: 0.86, x: FILE[0], y: FILE[1], arc: 14, ease: "in" }, { t: 1, x: FILE[0], y: FILE[1] },
      ] },
      { sprite: "twinkle", fps: 6, keys: hold(0.74, 0.82, PIC[0] - 6, PIC[1] - 4) },
      { sprite: "twinkle", fps: 6, keys: hold(0.76, 0.83, PIC[0] + 15, PIC[1] + 12) },
      { sprite: "quill", keys: [
        tip(0.08, 170, 2, { alpha: 0 }), tip(0.12, TEXT_X, LINE.head + 4, { ease: "out" }),
        ...head.pen, tip(0.38, TEXT_X, LINE.name1 + 4, { arc: 4 }),
        ...name1.pen, tip(0.615, TEXT_X, LINE.name2 + 4, { arc: 3 }),
        ...name2.pen, tip(0.7, TEXT_X, LINE.under + 3),
        tip(0.764, TEXT_X + 64, LINE.under + 2), tip(0.84, 170, 0, { alpha: 0, ease: "in" }),
      ] },
    ],
  };
}

export const manifest = {
  format: 1,
  id: "peasoup",
  name: "Peasoup",
  sheet: "sheet.png",
  size: [160, 90],
  music: "simmer-down",
  bands: [[0, "#f2ddb0"], [56, "#8a4b2a"], [57, "#d8e6ec"], [58, WAINSCOT]],
  scene: [
    { sprite: "beam", x: 0, y: 0 },
    { sprite: "window", x: WIN[0] - 2, y: WIN[1], fps: 1 },
    { sprite: "utensils", x: 128, y: 9, fps: 2 },
    { sprite: "pantry", x: 2, y: 10 },
    { sprite: "counter", x: 40, y: 60 },
    { sprite: "board", x: 55, y: 58 },
    { sprite: "stove", x: 95, y: 58 },
    { sprite: "flame", x: 99, y: 55, fps: 4 },
    { sprite: "pot", x: POT[0], y: POT[1], fps: 3, tally: { on: ["keep"], sprites: POT_STAGES.map((_, n) => `pot${n + 1}`) } },
    { sprite: "steam", x: POT[0] + 4, y: POT[1] - 17, fps: 3 },
    { sprite: "dog", x: DOG[0], y: DOG[1], fps: 2, tally: { on: ["trash", "delete"], sprites: DOG_STAGES.map((_, n) => `dog${n + 1}`) } },
    { sprite: "bowl", x: BOWL[0], y: BOWL[1] + 1 },
    { sprite: "floor", x: 0, y: 80 },
  ],
  file: FILE,
  sounds: {
    keep: [{ sfx: "soupHop", at: 0.1 }, { sfx: "soupPlop", at: 0.46 }, { sfx: "soupBubble", at: 0.56 }, { sfx: "soupStir", at: 0.66 }],
    move: [{ sfx: "soupCreak", at: 0.05 }, { sfx: "soupHop", at: 0.2 }, { sfx: "soupClink", at: 0.5 }, { sfx: "soupLatch", at: 0.86 }],
    rename: [
      { sfx: "soupPage", at: 0.05 }, { sfx: "soupHop", at: 0.09 },
      { sfx: "soupQuill", at: 0.14 }, { sfx: "soupQuill", at: 0.26 }, { sfx: "soupQuill", at: 0.4 }, { sfx: "soupQuill", at: 0.52 },
      { sfx: "soupQuill", at: 0.64 }, { sfx: "soupDing", at: 0.76 }, { sfx: "soupHop", at: 0.78 }, { sfx: "soupPage", at: 0.86 },
    ],
    trash: [{ sfx: "soupBark", at: 0.06 }, { sfx: "whoosh", at: 0.12 }, { sfx: "soupGulp", at: 0.44 }, { sfx: "soupYip", at: 0.68 }],
    delete: [{ sfx: "soupBark", at: 0.04 }, { sfx: "soupGulp", at: 0.26 }, { sfx: "soupPatter", at: 0.3 }, { sfx: "soupDig", at: 0.58 }, { sfx: "soupThud", at: 0.8 }],
  },
  animations: {
    keep: intoTheSoup("boilPeas", "INTO THE SOUP"),
    move: {
      duration: 2200,
      tracks: [
        { sprite: "pantryOpen", keys: hold(0.06, 0.86, 2, 10) },
        { sprite: "pantryDoors", keys: hold(0.06, 0.86, -3, 14) },
        { sprite: "file", keys: [
          { t: 0, x: FILE[0], y: FILE[1] }, { t: 0.18, x: FILE[0], y: FILE[1] },
          { t: 0.48, x: SHELF[0], y: SHELF[1], scale: 0.75, arc: 18, ease: "out" },
          { t: 0.86, x: SHELF[0], y: SHELF[1], scale: 0.75 },
        ] },
        cap("TO THE PANTRY: {dest}", 0.35),
      ],
    },
    rename: intoTheRecipeBook(),
    trash: fedToTheDog(),
    delete: buried(),
  },
  variants: {
    keep: [
      intoTheSoup("boilCarrot", "INTO THE SOUP", []),
      intoTheSoup("boilHerb", "INTO THE SOUP", [
        { sprite: "note", keys: [{ t: 0.7, x: POT[0] + 30, y: POT[1] - 10, alpha: 0 }, { t: 0.76, x: POT[0] + 30, y: POT[1] - 12 }, { t: 1, x: POT[0] + 33, y: POT[1] - 22, alpha: 0 }] },
      ]),
    ],
    trash: [intoTheBowl()],
  },
};
