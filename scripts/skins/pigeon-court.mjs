// Pigeon Court skin: a wood-paneled courtroom. Judge Reginald Coo presides,
// a jury of pigeons bobs in the box and the file stands trial at the defense
// table. keep = NOT GUILTY (the defense celebrates); move = GUILTY (the
// prosecution celebrates and the file is sentenced to {dest}); rename =
// MISTRIAL (pigeons everywhere, new name tag); trash = CONTEMPT OF COURT (the
// chicken bailiff takes the file away); delete = LIFE SENTENCE (caged, gone).
// All art is original, drawn here.
import { art, blank, disc, recolor, set } from "./lib.mjs";

const P = {
  k: "#1e1418", w: "#ffffff",
  // pigeon
  X: "#a8aebc", x: "#7c8294", d: "#4f5466", g: "#3fae7a", p: "#8a5ab4", o: "#f08a24", b: "#3a3030", e: "#e07a8a",
  // judge
  W: "#f2f0ea", v: "#c4c2cc", R: "#1c1a26", r: "#34324a",
  // suits
  S: "#2a3a6a", s: "#3e5290", t: "#4dd0ff", T: "#c8323c",
  // chicken bailiff
  A: "#3a3a46", Q: "#55556a", M: "#4a3040", Z: "#6a4a5a",
  H: "#f4f0e8", h: "#c9c2b4", C: "#1e2a50", N: "#2a3a70", y: "#ffd23f", l: "#f0a020", c: "#d83030", B: "#f0b030",
};
const WOOD = { trim: "#b07840", light: "#8e5a34", mid: "#7a4a2a", alt: "#74462a", dark: "#5a341e", deep: "#3e2214", ink: "#2a1810" };
const GOLD = "#e0b040", GOLD_D = "#a87a20";

// ---------- helpers ----------

function mirror(f) {
  const out = blank(f.w, f.h);
  for (let y = 0; y < f.h; y++)
    for (let x = 0; x < f.w; x++) {
      const s = (y * f.w + x) * 4;
      out.px.set(f.px.subarray(s, s + 4), (y * f.w + (f.w - 1 - x)) * 4);
    }
  return out;
}

/** Copy `src` onto `dst` at (ox, oy), skipping transparent pixels. */
function paste(dst, src, ox, oy) {
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const s = (y * src.w + x) * 4;
      if (!src.px[s + 3]) continue;
      const dx = x + ox, dy = y + oy;
      if (dx < 0 || dy < 0 || dx >= dst.w || dy >= dst.h) continue;
      dst.px.set(src.px.subarray(s, s + 4), (dy * dst.w + dx) * 4);
    }
  return dst;
}

function rect(f, x0, y0, w, h, c) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(f, x, y, c);
}

/** A raised wooden panel: light top/left edge, dark bottom/right. */
function panel(f, x0, y0, w, h, face = WOOD.mid) {
  rect(f, x0, y0, w, h, face);
  for (let x = x0; x < x0 + w; x++) {
    set(f, x, y0, WOOD.light);
    set(f, x, y0 + h - 1, WOOD.deep);
  }
  for (let y = y0; y < y0 + h; y++) {
    set(f, x0, y, WOOD.light);
    set(f, x0 + w - 1, y, WOOD.deep);
  }
}

// 3x5 glyphs for the bench's name plate.
const GLYPH = {
  C: ["###", "#..", "#..", "#..", "###"],
  O: ["###", "#.#", "#.#", "#.#", "###"],
  R: ["##.", "#.#", "##.", "#.#", "#.#"],
  ".": ["...", "...", "...", "...", ".#."],
};
function word(f, text, x0, y0, c) {
  [...text].forEach((ch, i) =>
    GLYPH[ch].forEach((row, y) => [...row].forEach((on, x) => on === "#" && set(f, x0 + i * 4 + x, y0 + y, c))));
}

// ---------- the room ----------

function room() {
  const W = 160, H = 90, f = blank(W, H);
  // Crown molding.
  rect(f, 0, 0, W, 1, WOOD.ink);
  rect(f, 0, 1, W, 2, WOOD.trim);
  rect(f, 0, 3, W, 1, WOOD.deep);
  // Upper wall: vertical boards with raised panels.
  for (let x = 0; x < W; x++)
    for (let y = 4; y < 40; y++) set(f, x, y, x % 16 === 0 ? WOOD.deep : (x >> 4) % 2 ? WOOD.mid : WOOD.alt);
  for (let bx = 0; bx < W; bx += 16) {
    panel(f, bx + 3, 8, 11, 28, (bx >> 4) % 2 ? WOOD.mid : WOOD.alt);
    rect(f, bx + 5, 10, 7, 24, WOOD.dark);
    rect(f, bx + 6, 11, 5, 22, (bx >> 4) % 2 ? WOOD.mid : WOOD.alt);
  }
  // Chair rail and the darker wainscot.
  rect(f, 0, 40, W, 2, WOOD.trim);
  rect(f, 0, 42, W, 1, WOOD.ink);
  for (let x = 0; x < W; x++) for (let y = 43; y < 58; y++) set(f, x, y, x % 16 === 8 ? WOOD.ink : WOOD.dark);
  for (let bx = 0; bx < W; bx += 16) {
    rect(f, bx + 11, 46, 10, 9, WOOD.deep);
    rect(f, bx + 12, 47, 8, 7, WOOD.dark);
  }
  rect(f, 0, 58, W, 2, WOOD.ink);
  // Carpet with a small diamond pattern and a red runner up the middle.
  for (let y = 60; y < H; y++)
    for (let x = 0; x < W; x++) {
      const runner = x >= 70 && x < 90;
      const dot = (x + (y % 6 === 0 ? 0 : 3)) % 6 === 0 && y % 3 === 0;
      let c = runner ? (dot ? "#7a3440" : "#68283a") : dot ? "#3a5c48" : "#2e4a3a";
      if (runner && (x === 70 || x === 89)) c = GOLD_D;
      set(f, x, y, c);
    }
  // Tall window above the jury, sky and a cloud.
  const wx = 8, wy = 6, ww = 32, wh = 18;
  rect(f, wx - 1, wy - 1, ww + 2, wh + 2, WOOD.ink);
  rect(f, wx, wy, ww, wh, "#8ec8f0");
  rect(f, wx, wy + wh - 6, ww, 6, "#b0dcf6");
  disc(f, wx + 9, wy + 7, 3, "#ffffff");
  disc(f, wx + 13, wy + 6, 3.5, "#ffffff");
  disc(f, wx + 17, wy + 8, 2.5, "#ffffff");
  for (let y = wy; y < wy + wh; y++) set(f, wx + 16, y, WOOD.trim);
  for (let x = wx; x < wx + ww; x++) set(f, x, wy + 8, WOOD.trim);
  rect(f, wx - 2, wy + wh + 1, ww + 4, 2, WOOD.trim);
  // The court's seal behind the judge: a gold ring with a feather.
  disc(f, 80, 12, 9.5, GOLD, GOLD_D);
  disc(f, 80, 12, 7, "#2a3a6a", GOLD_D);
  for (let i = 0; i < 9; i++) {
    const x = 76 + i, y = 16 - i;
    set(f, x, y, "#f2f0ea");
    if (i > 1 && i < 8) {
      set(f, x - 1, y - 1, "#c4c2cc");
      set(f, x + 1, y + 1, "#c4c2cc");
    }
  }
  return f;
}

function clock(i) {
  const f = disc(blank(11, 11), 5.5, 5.5, 5.4, "#f2f0ea", WOOD.ink);
  set(f, 5, 5, "#1e1418");
  // Hour hand stays; the minute hand goes round.
  set(f, 4, 5, "#1e1418");
  set(f, 3, 5, "#1e1418");
  const [dx, dy] = [[0, -1], [1, 0], [0, 1], [-1, 0]][i];
  for (let s = 1; s <= 3; s++) set(f, 5 + dx * s, 5 + dy * s, "#c8323c");
  return f;
}

function door(open) {
  const W = 22, H = 34, f = blank(W, H);
  rect(f, 0, 0, W, H, WOOD.trim);
  rect(f, 1, 1, W - 2, H - 1, WOOD.ink);
  if (open) {
    rect(f, 2, 2, W - 4, H - 2, "#120c10");
    rect(f, 2, H - 4, W - 4, 4, "#24181c");
    // The door swung inward: its edge shows on the left.
    rect(f, 2, 2, 3, H - 2, WOOD.dark);
    for (let y = 2; y < H; y++) set(f, 4, y, WOOD.deep);
    return f;
  }
  rect(f, 2, 2, W - 4, H - 2, WOOD.dark);
  panel(f, 4, 4, W - 8, 11, WOOD.mid);
  panel(f, 4, 18, W - 8, 13, WOOD.mid);
  // A small window and a brass knob.
  rect(f, 7, 6, 8, 5, "#4a6a7a");
  rect(f, 8, 7, 3, 2, "#7aa0b0");
  set(f, 16, 19, GOLD);
  set(f, 16, 20, GOLD_D);
  return f;
}

function bench() {
  const W = 52, H = 26, f = blank(W, H);
  rect(f, 0, 0, W, H, "#6b3f22");
  rect(f, 0, 0, W, 2, WOOD.trim);
  rect(f, 0, 2, W, 1, WOOD.ink);
  rect(f, 0, 3, 4, H - 3, WOOD.mid);
  rect(f, W - 4, 3, 4, H - 3, WOOD.mid);
  for (let y = 3; y < H; y++) {
    set(f, 4, y, WOOD.ink);
    set(f, W - 5, y, WOOD.ink);
  }
  panel(f, 8, 6, 36, 17, WOOD.mid);
  rect(f, 10, 8, 32, 13, WOOD.dark);
  // Name plate.
  rect(f, 16, 10, 20, 9, GOLD_D);
  rect(f, 17, 11, 18, 7, GOLD);
  word(f, "R.COO", 16, 12, "#3e2214");
  rect(f, 0, H - 1, W, 1, WOOD.ink);
  return f;
}

function table() {
  const W = 46, H = 14, f = blank(W, H);
  rect(f, 0, 0, W, 2, WOOD.trim);
  rect(f, 0, 2, W, 1, WOOD.ink);
  rect(f, 1, 3, W - 2, 6, "#6b3f22");
  rect(f, 1, 8, W - 2, 1, WOOD.deep);
  for (const lx of [2, W - 5]) {
    rect(f, lx, 9, 3, 5, WOOD.dark);
    for (let y = 9; y < 14; y++) set(f, lx + 2, y, WOOD.ink);
  }
  return f;
}

// A paper stack and a glass of water for the tables (they sit on the edge).
const papers = ["wwwwk..", "wXwwwk.", "kkkkkkk"];
const glass = [".tt.", ".tt.", "kttk"];

// ---------- the jury ----------

const jurorUp = [
  "...kkk....",
  "..kXXXk...",
  "..kXoXXk..",
  "..kXXXwbb.",
  "..kXXXk...",
  "...kgpk...",
  "..kgpgpk..",
  ".kxxxxxxk.",
  ".kxXXXXxk.",
  ".kxxxxxxk.",
];
const jurorDown = [
  "..........",
  "....kkk...",
  "...kXXXk..",
  "...kXoXXk.",
  "...kXXXwbb",
  "..kgpgk...",
  "..kgpgpk..",
  ".kxxxxxxk.",
  ".kxXXXXxk.",
  ".kxxxxxxk.",
];
const jurorBlink = recolor(jurorUp, { o: "d" });
const JURY_COLORS = [
  {},
  { X: "W", x: "v" },
  { X: "#", x: "%" },
  { X: "x", x: "d" },
];
const PJ = { ...P, "#": "#b08060", "%": "#8a5a3a" };
const juror = (swap, order) => order.map((r) => art(recolor(r, swap), PJ));

// A pigeon in flight (for the mistrial), wings up and down.
const flyUp = [
  "k.......k.....",
  "xk.....kx.....",
  "kxk...kxk.kkk.",
  ".kxk.kxk.kXXXk",
  "..kxkxk.kXoXXk",
  "..kxxxkkgpXXwb",
  ".kxXXXXXxpkkk.",
  "kxXXXXXXXxk...",
  "kxxXXXXXxk....",
  ".kkxxxxkk.....",
  "...e..e.......",
  "..............",
];
const flyDown = [
  "..............",
  "..........kkk.",
  ".........kXXXk",
  "........kXoXXk",
  "...kkkkkgpXXwb",
  "..kxXXXXXpkkk.",
  ".kxXXXXXXxk...",
  "kxxkxxxkxk....",
  "kxk.kxk.k.....",
  "kk..kk........",
  "...e..e.......",
  "..............",
];

// ---------- the judge: Reginald Coo ----------

const judgeRows = [
  "......kkkkkkkk......",
  ".....kWWWWWWWWk.....",
  "....kWvWkkkkWvWk....",
  "...kWWkXXXXXXkWWk...",
  "...kWvkXXXXXXkvWk...",
  "...kWWkXoXXoXkWWk...",
  "...kWvkXXwwXXkvWk...",
  "...kWWkXXbbXXkWWk...",
  "...kWvkkXbbXkkvWk...",
  "...kWWkkgppgkkWWk...",
  "....kkRRgppgRRkk....",
  "..kkRRRRwwwwRRRRkk..",
  ".kRRRRRRRwwRRRRRRRk.",
  ".kRrRRRRRwwRRRRRrRk.",
  ".kRrRRRRRRRRRRRRrRk.",
  ".kRrRRRRRRRRRRRRrRk.",
];
const judgeBlink = recolor(judgeRows, { o: "d" });
const judgeStern = judgeRows.map((r, i) => (i === 4 ? "...kWvkkXXXXkkvWk..." : r));

/** The judge with his gavel raised (up) or striking the bench (down). */
function judgeGavel(down) {
  const f = blank(34, 20);
  paste(f, art(judgeStern, P), 6, 4);
  const arm = (x, y) => { set(f, x, y, P.R); set(f, x, y + 1, P.r); };
  const head = (x, y) => {
    rect(f, x, y, 7, 3, "#6b3a1e");
    rect(f, x + 3, y, 1, 3, GOLD);
    set(f, x, y, "#8a5030");
  };
  if (!down) {
    [[24, 15], [25, 14], [26, 13], [27, 12], [27, 11]].forEach(([x, y]) => arm(x, y));
    for (let y = 3; y < 11; y++) set(f, 28, y, "#8a5030");
    head(25, 0);
  } else {
    [[24, 15], [25, 16], [26, 16], [27, 17]].forEach(([x, y]) => arm(x, y));
    for (let x = 27; x < 31; x++) set(f, x, 17, "#8a5030");
    rect(f, 30, 15, 3, 5, "#6b3a1e");
    rect(f, 30, 17, 3, 1, GOLD);
  }
  return f;
}

// ---------- the lawyers ----------

const lawyerRows = [
  "......kkkk......",
  ".....kXXXXk.....",
  "....kXXXXXXk....",
  "....kXoXXoXk....",
  "....kXXwwXXk....",
  "....kXXbbXXk....",
  ".....kXbbXk.....",
  ".....kgpgpk.....",
  "...kkSwttwSkk...",
  "..kSSSwttwSSSk..",
  "..kSSSSttSSSSk..",
  "..kSsSSttSSsSk..",
  "..kSsSSSSSSsSk..",
  "..kSsSSSSSSsSk..",
];
const cheerRows = [
  "kx....kkkk....xk",
  "kxx..kXXXXk..xxk",
  ".kxxkXXXXXXkxxk.",
  "..kxkXoXXoXkxk..",
  "..kSkXXwwXXkSk..",
  "..kSkXXbbXXkSk..",
  "..kSSkXbbXkSSk..",
  "..kSSkgpgpkSSk..",
  "..kSSSwttwSSSk..",
  "..kSSSwttwSSSk..",
  "..kSSSSttSSSSk..",
  "..kSSSSttSSSSk..",
  "..kSSSSSSSSSSk..",
  "..kSSSSSSSSSSk..",
];
const cheer2Rows = cheerRows.map((r, i) =>
  i === 0 ? ".k....kkkk....k." : i === 1 ? "kxx..kXXXXk..xxk" : i === 2 ? "kxxxkXXXXXXkxxxk" : r);
// Defense: blue suit, light tie. Prosecution: charcoal suit, red tie.
const PROS = { S: "A", s: "Q", t: "T" };
const PROS2 = { S: "M", s: "Z", t: "T", X: "x", x: "d" };

// ---------- the bailiff: a chicken in a police-style cap ----------

const bailiffA = [
  "....kkkkk.......",
  "...kCCyCCk......",
  "..kkkkkkkkk.....",
  "...kHHHHk.......",
  "..kHoHHHk.......",
  "kBBHHHHHk.......",
  ".kcHHHHHk..kk...",
  "..kcHHHHkkkHHk..",
  "...kHNNNNHHHHHk.",
  "..kHNNyNNNHHHHk.",
  "..kHNNNNNNNHHk..",
  "..kHNNNNNNNHk...",
  "...kNNNNNNNk....",
  "....kkkkkkk.....",
  ".....l...l......",
  ".....l...l......",
  "....ll..ll......",
];
const bailiffB = bailiffA.map((r, i) =>
  i === 14 ? "......l.l......." : i === 15 ? "......l.l......." : i === 16 ? ".....ll.ll......" : r);
const whistleFx = [
  "k...k..",
  ".k.k...",
  ".......",
  "kk...kk",
  ".......",
  ".k.k...",
  "k...k..",
];

const whistleFx2 = [
  ".......",
  "k...k..",
  ".k.k...",
  "kk..kkk",
  ".k.k...",
  "k...k..",
  ".......",
];

function cage() {
  const W = 24, H = 26, f = blank(W, H);
  rect(f, 0, 0, W, 3, "#4a4a58");
  rect(f, 0, 0, W, 1, "#8a8a9a");
  rect(f, 0, H - 3, W, 3, "#4a4a58");
  rect(f, 0, H - 3, W, 1, "#8a8a9a");
  for (let x = 1; x < W; x += 4) for (let y = 3; y < H - 3; y++) {
    set(f, x, y, "#b8c0d0");
    set(f, x + 1, y, "#6a7088");
  }
  // A padlock.
  rect(f, 10, 12, 5, 4, GOLD);
  set(f, 11, 11, GOLD_D);
  set(f, 13, 11, GOLD_D);
  set(f, 12, 10, GOLD_D);
  set(f, 12, 14, "#1e1418");
  return f;
}

// ---------- little effects ----------

function whack(i) {
  const f = blank(11, 9);
  const c = i ? "#ffd23f" : "#ffffff";
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 0], [1, 0], [0, -1]]) {
    const r = i ? 5 : 3;
    for (let s = i ? 2 : 1; s <= r; s++) set(f, 5 + dx * s, Math.round(7 + dy * s * 0.8), c);
  }
  return f;
}

const CONFETTI = ["#ffd23f", "#e05aa0", "#4dd0ff", "#6fdc5a", "#ffffff", "#f08a24"];
function confetti(i) {
  const W = 28, H = 24, f = blank(W, H);
  for (let n = 0; n < 22; n++) {
    const x = (n * 11 + 3) % W;
    const y = ((n * 7) % H + i * 3) % H;
    const c = CONFETTI[n % CONFETTI.length];
    set(f, x, y, c);
    if ((n + i) % 3 === 0) set(f, x + 1, y, c);
    else if ((n + i) % 3 === 1) set(f, x, y + 1, c);
  }
  return f;
}

const feather1 = ["...wX", "..wX.", ".wX..", "wX..."];
const feather2 = [".....", "wwXX.", ".wwXX", "....."];
const paper1 = ["wwwk.", "wXwk.", "wwwk.", "wXwk.", "kkkk."];
const paper2 = [".....", "wwwwk", "wXXwk", "kkkkk", "....."];
const tag = [
  "..kk......",
  ".k..k.....",
  "kkkkkkkkkk",
  "kTTTTTTTTk",
  "kwwwwwwwwk",
  "kwXXwXXXwk",
  "kwwwwwwwwk",
  "kkkkkkkkkk",
];

export const sprites = {
  room: room(),
  clock: [0, 1, 2, 3].map(clock),
  door: door(false),
  doorOpen: door(true),
  bench: bench(),
  table: table(),
  papers: art(papers, P),
  glass: art(glass, P),
  juryRail: (() => {
    const f = blank(46, 3);
    rect(f, 0, 0, 46, 1, WOOD.trim);
    rect(f, 0, 1, 46, 2, WOOD.dark);
    return f;
  })(),
  juryFront: (() => {
    const f = blank(46, 16);
    rect(f, 0, 0, 46, 2, WOOD.trim);
    rect(f, 0, 2, 46, 1, WOOD.ink);
    rect(f, 0, 3, 46, 13, "#6b3f22");
    panel(f, 3, 5, 18, 9, WOOD.mid);
    panel(f, 25, 5, 18, 9, WOOD.mid);
    return f;
  })(),
  // Each juror bobs to its own rhythm (frames in different orders).
  juror1: juror(JURY_COLORS[0], [jurorUp, jurorDown, jurorUp, jurorBlink]),
  juror2: juror(JURY_COLORS[1], [jurorDown, jurorUp, jurorUp, jurorUp, jurorBlink, jurorUp]),
  juror3: juror(JURY_COLORS[2], [jurorUp, jurorUp, jurorDown, jurorDown, jurorUp, jurorBlink]),
  juror4: juror(JURY_COLORS[3], [jurorUp, jurorBlink, jurorUp, jurorDown]),
  juror5: juror(JURY_COLORS[2], [jurorDown, jurorDown, jurorUp, jurorUp, jurorBlink]),
  juror6: juror(JURY_COLORS[1], [jurorUp, jurorUp, jurorUp, jurorDown, jurorUp, jurorBlink, jurorUp]),
  fly: [art(flyUp, P), art(flyDown, P)],
  flyWhite: [art(recolor(flyUp, { X: "W", x: "v" }), P), art(recolor(flyDown, { X: "W", x: "v" }), P)],
  flyLeft: [mirror(art(recolor(flyUp, { X: "x", x: "d" }), P)), mirror(art(recolor(flyDown, { X: "x", x: "d" }), P))],
  judge: [art(judgeRows, P), art(judgeRows, P), art(judgeRows, P), art(judgeRows, P), art(judgeRows, P), art(judgeBlink, P)],
  gavelUp: judgeGavel(false),
  gavelDown: judgeGavel(true),
  defender: [art(lawyerRows, P), art(lawyerRows, P), art(lawyerRows, P), art(recolor(lawyerRows, { o: "d" }), P)],
  defenderCheer: [art(cheerRows, P), art(cheer2Rows, P)],
  prosecutor: [art(recolor(lawyerRows, PROS), P), art(recolor(lawyerRows, { ...PROS, o: "d" }), P), art(recolor(lawyerRows, PROS), P)],
  prosecutor2: [art(recolor(lawyerRows, PROS2), P), art(recolor(lawyerRows, PROS2), P), art(recolor(lawyerRows, PROS2), P), art(recolor(lawyerRows, { ...PROS2, o: "d" }), P), art(recolor(lawyerRows, PROS2), P)],
  prosecutorCheer: [art(recolor(cheerRows, PROS), P), art(recolor(cheer2Rows, PROS), P)],
  prosecutor2Cheer: [art(recolor(cheer2Rows, PROS2), P), art(recolor(cheerRows, PROS2), P)],
  bailiff: [art(bailiffA, P), art(bailiffB, P)],
  bailiffR: [mirror(art(bailiffA, P)), mirror(art(bailiffB, P))],
  whistleFx: [art(whistleFx, { k: "#ffd23f" }), art(whistleFx2, { k: "#f08a24" })],
  cage: cage(),
  whack: [whack(0), whack(1)],
  confetti: [0, 1, 2, 3, 4, 5, 6, 7].map(confetti),
  feather: [art(feather1, P), art(feather2, P)],
  paper: [art(paper1, P), art(paper2, P)],
  tag: art(tag, P),
  plaque: (() => {
    const f = blank(112, 9);
    rect(f, 0, 0, 112, 9, "#1e1418e8");
    rect(f, 1, 0, 110, 1, GOLD_D);
    rect(f, 1, 8, 110, 1, GOLD_D);
    return f;
  })(),
};

// ---------- placement ----------

const FILE = [20, 53];
const JUDGE = [70, 18];
const GAVEL = [JUDGE[0] - 6, JUDGE[1] - 4];
const DEF = [38, 56];
const PROS_A = [104, 56];
const PROS_B = [124, 56];
const DEF_TABLE = [10, 68];
const PROS_TABLE = [100, 68];
const DOOR = [134, 24];

const hold = (t0, t1, x, y, extra = {}) => [{ t: t0, x, y, ...extra }, { t: t1, x, y, ...extra }];
const fadeIn = (t0, t1, x, y) => [{ t: t0, x, y, alpha: 0 }, { t: t1, x, y }, { t: 1, x, y }];
const at = (x, y, t) => ({ t, x, y });

/** The judge bangs the gavel at each of `hits` (0..1); each hit is `len` long. */
function gavel(hits, len = 0.07) {
  const tracks = [];
  hits.forEach((h) => {
    tracks.push({ sprite: "gavelUp", keys: hold(Math.max(0, h - len), h, ...GAVEL) });
    tracks.push({ sprite: "gavelDown", keys: hold(h, Math.min(1, h + len), ...GAVEL) });
    tracks.push({ sprite: "whack", fps: 12, once: true, keys: hold(h, Math.min(1, h + len), GAVEL[0] + 26, GAVEL[1] + 12) });
  });
  return tracks;
}

/** The tables drawn again, over lawyers who jumped up. */
const tablesOnTop = (t0) => [
  { sprite: "table", keys: hold(t0, 1, ...DEF_TABLE) },
  { sprite: "papers", keys: hold(t0, 1, DEF_TABLE[0] + 30, DEF_TABLE[1] - 3) },
  { sprite: "table", keys: hold(t0, 1, ...PROS_TABLE) },
  { sprite: "papers", keys: hold(t0, 1, PROS_TABLE[0] + 6, PROS_TABLE[1] - 3) },
  { sprite: "glass", keys: hold(t0, 1, PROS_TABLE[0] + 36, PROS_TABLE[1] - 3) },
];

/** A caption across the top, on a dark plaque so it reads over the wall. */
const headline = (text, color, t0, t1) => [
  { sprite: "plaque", keys: [{ t: t0, x: 24, y: 1, alpha: 0 }, { t: t1, x: 24, y: 1 }, { t: 1, x: 24, y: 1 }] },
  { text, color, align: "center", keys: fadeIn(t0, t1, 80, 3) },
];

const hops = (x, y, t0, t1, n, h) =>
  Array.from({ length: n + 1 }, (_, i) => ({ t: t0 + ((t1 - t0) * i) / n, x, y, ...(i ? { arc: h } : {}) }));

/** A side celebrates: lawyers flap and hop, confetti and feathers fly. */
function celebrate(t0, lawyers, cx) {
  return [
    ...lawyers.map(([sprite, x, y], i) => ({ sprite, fps: 7 + i, keys: hops(x, y, t0, 1, 4 + i, 4) })),
    ...tablesOnTop(t0),
    { sprite: "confetti", fps: 8, keys: [{ t: t0, x: cx - 14, y: 24, alpha: 0 }, { t: t0 + 0.06, x: cx - 14, y: 28 }, { t: 1, x: cx - 14, y: 48, alpha: 0.4 }] },
    { sprite: "confetti", fps: 7, keys: [{ t: t0 + 0.08, x: cx + 4, y: 20, alpha: 0 }, { t: t0 + 0.14, x: cx + 4, y: 24 }, { t: 1, x: cx + 4, y: 42, alpha: 0.4 }] },
    ...[[-14, -14], [12, -18], [-2, -22], [18, -6]].map(([dx, dy], i) => ({
      sprite: "feather", fps: 4, keys: [{ t: t0 + 0.04 * i, x: cx, y: 56 }, { t: Math.min(1, t0 + 0.35 + 0.04 * i), x: cx + dx, y: 56 + dy, ease: "out" }, { t: 1, x: cx + dx + 2, y: 62 + dy, alpha: 0 }],
    })),
  ];
}

function verdict(guilty, title) {
  const D = 0.36;
  const tracks = [...gavel([0.12, 0.28])];
  if (!guilty) {
    tracks.push(...celebrate(D, [["defenderCheer", ...DEF]], 46));
    tracks.push({ sprite: "file", keys: hops(...FILE, D, 1, 5, 6) });
  } else {
    tracks.push(...celebrate(D, [["prosecutorCheer", ...PROS_A], ["prosecutor2Cheer", ...PROS_B]], 122));
    tracks.push({
      sprite: "file",
      keys: [at(...FILE, 0), at(...FILE, 0.4), { t: 0.5, x: 14, y: 64, arc: 6 }, { t: 0.62, x: 6, y: 66, arc: 4 }, { t: 0.74, x: -4, y: 66, arc: 4 }, { t: 0.86, x: -22, y: 66, arc: 4 }],
    });
    tracks.push({ text: "SENTENCED TO {dest}", color: "#ffffff", align: "center", keys: fadeIn(0.45, 0.55, 80, 84) });
  }
  tracks.push(...headline(title, guilty ? "#ff7a6a" : "#ffe070", 0.3, 0.38));
  return {
    duration: guilty ? 2400 : 2200,
    tracks,
    sounds: guilty
      ? [{ sfx: "courtGavel", at: 0.12 }, { sfx: "courtGavel", at: 0.28 }, { sfx: "courtDun", at: 0.32 }, { sfx: "courtCheer", at: 0.42 }, { sfx: "courtBoo", at: 0.5 }]
      : [{ sfx: "courtGavel", at: 0.12 }, { sfx: "courtGavel", at: 0.28 }, { sfx: "courtFanfare", at: 0.33 }, { sfx: "courtCheer", at: 0.42 }, { sfx: "courtCoo", at: 0.72 }],
  };
}

const mistrial = {
  duration: 2400,
  tracks: [
    ...gavel([0.1, 0.2, 0.3, 0.75], 0.05),
    // Pigeons pour in through the window and from both sides.
    { sprite: "fly", fps: 9, keys: [{ t: 0.12, x: 22, y: 10 }, { t: 0.4, x: 60, y: 30, arc: 10 }, { t: 0.65, x: 30, y: 22, arc: -8 }, { t: 0.95, x: 170, y: 8, arc: 10 }] },
    { sprite: "flyWhite", fps: 10, keys: [{ t: 0.18, x: -16, y: 40 }, { t: 0.45, x: 40, y: 20, arc: 8 }, { t: 0.7, x: 100, y: 36, arc: 8 }, { t: 1, x: 172, y: 26 }] },
    { sprite: "flyLeft", fps: 8, keys: [{ t: 0.15, x: 170, y: 18 }, { t: 0.45, x: 110, y: 44, arc: 10 }, { t: 0.7, x: 120, y: 10, arc: -6 }, { t: 1, x: -20, y: 30, arc: 8 }] },
    { sprite: "fly", fps: 11, keys: [{ t: 0.25, x: 30, y: 12 }, { t: 0.5, x: 6, y: 34, arc: 6 }, { t: 0.8, x: 70, y: 46, arc: 12 }, { t: 1, x: 150, y: 40 }] },
    { sprite: "flyLeft", fps: 10, keys: [{ t: 0.3, x: 170, y: 50 }, { t: 0.6, x: 90, y: 28, arc: 10 }, { t: 1, x: -20, y: 12, arc: 8 }] },
    // Papers off both tables.
    ...[[30, -26, 14], [44, -10, 18], [108, 14, 20], [128, -20, 12], [116, 8, 24]].map(([x, dx, h], i) => ({
      sprite: "paper", fps: 6 + i, keys: [{ t: 0.15 + i * 0.05, x, y: 64 }, { t: 0.55 + i * 0.05, x: x + dx, y: 64 - h, ease: "out" }, { t: 0.95, x: x + dx * 1.4, y: 74, alpha: 0.2 }],
    })),
    ...[[-12, -16], [10, -20], [-4, -24], [16, -8], [-18, -4]].map(([dx, dy], i) => ({
      sprite: "feather", fps: 5, keys: [{ t: 0.2 + i * 0.03, x: 24, y: 40 }, { t: 0.5 + i * 0.03, x: 24 + dx, y: 40 + dy, ease: "out" }, { t: 0.9, x: 26 + dx, y: 48 + dy, alpha: 0 }],
    })),
    // The file shakes, then gets a new name tag.
    { sprite: "file", keys: [0, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 1].map((t, i) => ({ t, x: FILE[0] + (i > 0 && i < 11 ? (i % 2 ? -1 : 1) : 0), y: FILE[1] })) },
    { sprite: "tag", keys: [{ t: 0.55, x: FILE[0] + 3, y: FILE[1] - 14, alpha: 0 }, { t: 0.62, x: FILE[0] + 3, y: FILE[1] + 6 }, { t: 1, x: FILE[0] + 3, y: FILE[1] + 6 }] },
    { text: "NEW NAME: {newName}", color: "#ffe070", align: "center", keys: fadeIn(0.62, 0.7, 80, 84) },
    ...headline("MISTRIAL!", "#ffffff", 0.06, 0.12),
  ],
  sounds: [
    { sfx: "courtGavel", at: 0.1 }, { sfx: "courtGavel", at: 0.2 }, { sfx: "courtGavel", at: 0.3 },
    { sfx: "courtFlutter", at: 0.16 }, { sfx: "courtChaos", at: 0.34 }, { sfx: "courtCoo", at: 0.5 }, { sfx: "courtFlutter", at: 0.58 },
    { sfx: "chime", at: 0.63 }, { sfx: "courtGavel", at: 0.75 },
  ],
};

const DOOR_IN = [DOOR[0] + 3, DOOR[1] + 14];

const contempt = {
  duration: 2600,
  tracks: [
    ...gavel([0.07]),
    { sprite: "doorOpen", keys: hold(0.12, 0.93, ...DOOR) },
    // In from the door, to the file...
    { sprite: "bailiff", fps: 7, keys: [{ t: 0.14, ...xy(DOOR_IN), alpha: 0 }, { t: 0.2, ...xy(DOOR_IN) }, { t: 0.32, x: 118, y: 52 }, { t: 0.46, x: 36, y: 51 }] },
    { sprite: "bailiff", keys: hold(0.46, 0.58, 36, 51) },
    // ...and out again, carrying it over his head.
    { sprite: "bailiffR", fps: 7, keys: [{ t: 0.58, x: 36, y: 51 }, { t: 0.78, x: 118, y: 52 }, { t: 0.88, ...xy(DOOR_IN) }, { t: 0.93, ...xy(DOOR_IN), alpha: 0 }] },
    { sprite: "file", keys: [at(...FILE, 0), at(...FILE, 0.52), { t: 0.58, x: 36, y: 36, arc: 6 }, { t: 0.78, x: 118, y: 37 }, { t: 0.88, x: DOOR_IN[0], y: DOOR_IN[1] - 15 }, { t: 0.93, x: DOOR_IN[0], y: DOOR_IN[1] - 15, alpha: 0 }] },
    { sprite: "whistleFx", fps: 8, keys: hold(0.46, 0.54, 30, 44) },
    ...headline("CONTEMPT OF COURT!", "#ff7a6a", 0.06, 0.12),
  ],
  sounds: [
    { sfx: "courtGavel", at: 0.07 }, { sfx: "courtDoor", at: 0.12 }, { sfx: "courtWhistle", at: 0.2 }, { sfx: "courtCluck", at: 0.36 },
    { sfx: "courtWhistle", at: 0.46 }, { sfx: "courtCluck", at: 0.66 }, { sfx: "courtDoor", at: 0.93 },
  ],
};

function xy([x, y]) {
  return { x, y };
}

const CAGE = [FILE[0] - 4, FILE[1] - 7];
const lifeSentence = {
  duration: 2600,
  tracks: [
    ...gavel([0.07]),
    { sprite: "doorOpen", keys: hold(0.26, 0.94, ...DOOR) },
    { sprite: "file", keys: [at(...FILE, 0), at(...FILE, 0.6), { t: 0.82, x: 118, y: 53 }, { t: 0.88, x: DOOR_IN[0] + 1, y: DOOR_IN[1] + 2 }, { t: 0.93, x: DOOR_IN[0] + 1, y: DOOR_IN[1] + 2, alpha: 0 }] },
    // The cell drops over the file...
    { sprite: "cage", keys: [{ t: 0.1, x: CAGE[0], y: -30 }, { t: 0.2, x: CAGE[0], y: CAGE[1], ease: "in" }, { t: 0.6, x: CAGE[0], y: CAGE[1] }, { t: 0.82, x: 114, y: 46 }, { t: 0.88, x: DOOR_IN[0] - 3, y: DOOR_IN[1] - 5 }, { t: 0.93, x: DOOR_IN[0] - 3, y: DOOR_IN[1] - 5, alpha: 0 }] },
    { sprite: "whack", fps: 12, once: true, keys: hold(0.2, 0.28, CAGE[0] + 18, CAGE[1] + 18) },
    // ...and the bailiff hauls it away.
    { sprite: "bailiff", fps: 7, keys: [{ t: 0.28, ...xy(DOOR_IN), alpha: 0 }, { t: 0.32, ...xy(DOOR_IN) }, { t: 0.42, x: 118, y: 52 }, { t: 0.54, x: 44, y: 51 }] },
    { sprite: "bailiff", keys: hold(0.54, 0.6, 44, 51) },
    { sprite: "bailiffR", fps: 7, keys: [{ t: 0.6, x: 44, y: 51 }, { t: 0.82, x: 136, y: 52 }, { t: 0.88, x: DOOR_IN[0] + 6, y: DOOR_IN[1] }, { t: 0.92, x: DOOR_IN[0] + 6, y: DOOR_IN[1], alpha: 0 }] },
    { sprite: "whistleFx", fps: 8, keys: hold(0.54, 0.6, 38, 44) },
    ...headline("LIFE SENTENCE", "#ff7a6a", 0.2, 0.26),
    { text: "NO PAROLE", color: "#ffffff", align: "center", keys: fadeIn(0.6, 0.66, 80, 84) },
  ],
  sounds: [
    { sfx: "courtGavel", at: 0.07 }, { sfx: "courtSlam", at: 0.2 }, { sfx: "courtDoor", at: 0.26 }, { sfx: "courtWhistle", at: 0.34 },
    { sfx: "courtWhistle", at: 0.54 }, { sfx: "courtCluck", at: 0.7 }, { sfx: "courtSlam", at: 0.94 },
  ],
};

export const manifest = {
  format: 1,
  id: "pigeon-court",
  name: "Pigeon Court",
  sheet: "sheet.png",
  size: [160, 90],
  bands: [[0, "#5a341e"], [58, "#2e4a3a"]],
  music: "order-in-the-coop",
  scene: [
    { sprite: "room", x: 0, y: 0 },
    { sprite: "clock", x: 113, y: 7, fps: 1 },
    { sprite: "door", ...xy(DOOR) },
    // The jury: back row, rail, front row, box.
    { sprite: "juror1", x: 5, y: 26, fps: 3 },
    { sprite: "juror2", x: 19, y: 26, fps: 2 },
    { sprite: "juror3", x: 33, y: 26, fps: 3 },
    { sprite: "juryRail", x: 2, y: 34 },
    { sprite: "juror4", x: 11, y: 36, fps: 2 },
    { sprite: "juror5", x: 25, y: 36, fps: 3 },
    { sprite: "juror6", x: 38, y: 36, fps: 4 },
    { sprite: "juryFront", x: 2, y: 44 },
    { sprite: "judge", ...xy(JUDGE), fps: 3 },
    { sprite: "bench", x: 54, y: 34 },
    { sprite: "defender", ...xy(DEF), fps: 2 },
    { sprite: "prosecutor", ...xy(PROS_A), fps: 2 },
    { sprite: "prosecutor2", ...xy(PROS_B), fps: 3 },
    { sprite: "table", ...xy(DEF_TABLE) },
    { sprite: "papers", x: DEF_TABLE[0] + 30, y: DEF_TABLE[1] - 3 },
    { sprite: "table", ...xy(PROS_TABLE) },
    { sprite: "papers", x: PROS_TABLE[0] + 6, y: PROS_TABLE[1] - 3 },
    { sprite: "glass", x: PROS_TABLE[0] + 36, y: PROS_TABLE[1] - 3 },
  ],
  file: FILE,
  animations: {
    keep: verdict(false, "NOT GUILTY!"),
    move: verdict(true, "GUILTY!"),
    rename: mistrial,
    trash: contempt,
    delete: lifeSentence,
  },
  variants: {
    keep: [verdict(false, "INNOCENT!")],
    move: [verdict(true, "GUILTY AS CHARGED")],
  },
};
