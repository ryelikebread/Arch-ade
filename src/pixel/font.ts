// An original 3x5 pixel font for skin captions. Uppercase only; accents are
// dropped and anything else becomes "?".

const GLYPHS: Record<string, string[]> = {
  "A": [".#.","#.#","###","#.#","#.#"], "B": ["##.","#.#","##.","#.#","##."], "C": [".##","#..","#..","#..",".##"],
  "D": ["##.","#.#","#.#","#.#","##."], "E": ["###","#..","##.","#..","###"], "F": ["###","#..","##.","#..","#.."],
  "G": [".##","#..","#.#","#.#",".##"], "H": ["#.#","#.#","###","#.#","#.#"], "I": ["###",".#.",".#.",".#.","###"],
  "J": ["..#","..#","..#","#.#",".#."], "K": ["#.#","#.#","##.","#.#","#.#"], "L": ["#..","#..","#..","#..","###"],
  "M": ["#.#","###","###","#.#","#.#"], "N": ["##.","#.#","#.#","#.#","#.#"], "O": [".#.","#.#","#.#","#.#",".#."],
  "P": ["##.","#.#","##.","#..","#.."], "Q": [".#.","#.#","#.#","##.",".##"], "R": ["##.","#.#","##.","#.#","#.#"],
  "S": [".##","#..",".#.","..#","##."], "T": ["###",".#.",".#.",".#.",".#."], "U": ["#.#","#.#","#.#","#.#","###"],
  "V": ["#.#","#.#","#.#","#.#",".#."], "W": ["#.#","#.#","###","###","#.#"], "X": ["#.#","#.#",".#.","#.#","#.#"],
  "Y": ["#.#","#.#",".#.",".#.",".#."], "Z": ["###","..#",".#.","#..","###"], "0": ["###","#.#","#.#","#.#","###"],
  "1": [".#.","##.",".#.",".#.","###"], "2": ["##.","..#",".#.","#..","###"], "3": ["##.","..#",".#.","..#","##."],
  "4": ["#.#","#.#","###","..#","..#"], "5": ["###","#..","##.","..#","##."], "6": [".##","#..","###","#.#","###"],
  "7": ["###","..#",".#.",".#.",".#."], "8": ["###","#.#","###","#.#","###"], "9": ["###","#.#","###","..#","##."],
  " ": ["...","...","...","...","..."], ".": ["...","...","...","...",".#."], ",": ["...","...","...",".#.","#.."],
  "-": ["...","...","###","...","..."], "_": ["...","...","...","...","###"], ":": ["...",".#.","...",".#.","..."],
  "!": [".#.",".#.",".#.","...",".#."], "?": ["##.","..#",".#.","...",".#."], "'": [".#.",".#.","...","...","..."],
  "(": ["..#",".#.",".#.",".#.","..#"], ")": ["#..",".#.",".#.",".#.","#.."], "/": ["..#","..#",".#.","#..","#.."],
  "&": [".#.","#.#",".#.","#.#",".##"], "+": ["...",".#.","###",".#.","..."], "#": ["#.#","###","#.#","###","#.#"],
  "@": [".#.","#.#","###","#..",".##"], "[": ["##.","#..","#..","#..","##."], "]": [".##","..#","..#","..#",".##"],
};

export const GLYPH_W = 3;
export const GLYPH_H = 5;
export const ADVANCE = 4;

/** Each glyph as a flat list of lit pixels [x0, y0, x1, y1, ...], built once. */
const PIXELS = new Map<string, number[]>(
  Object.entries(GLYPHS).map(([c, rows]) => [c, rows.flatMap((row, y) => [...row].flatMap((p, x) => (p === "#" ? [x, y] : [])))]),
);

// Games draw the same few strings every frame; remember them (bounded).
const normalized = new Map<string, string>();

/** What the font can draw: uppercase, accents stripped, unknowns as "?". */
export function normalize(text: string): string {
  let out = normalized.get(text);
  if (out === undefined) {
    out = [...text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()].map((c) => (GLYPHS[c] ? c : "?")).join("");
    if (normalized.size > 2000) normalized.clear();
    normalized.set(text, out);
  }
  return out;
}

export function textWidth(text: string): number {
  const n = normalize(text).length;
  return n ? n * ADVANCE - 1 : 0;
}

export function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, scale = 1) {
  ctx.fillStyle = color;
  const s = normalize(text);
  for (let i = 0; i < s.length; i++) {
    const px = PIXELS.get(s[i])!;
    const ox = x + i * ADVANCE * scale;
    for (let j = 0; j < px.length; j += 2) ctx.fillRect(Math.round(ox + px[j] * scale), Math.round(y + px[j + 1] * scale), scale, scale);
  }
}

export const _glyphsForTest = GLYPHS;
