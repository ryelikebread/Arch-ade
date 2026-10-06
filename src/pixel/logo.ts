// The title logo, drawn with a tiny original 5x7 pixel font on a canvas.

const GLYPHS: Record<string, string[]> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  "-": [".....", ".....", ".....", ".###.", ".....", ".....", "....."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
};

export function drawLogo(canvas: HTMLCanvasElement, text: string, scale = 3) {
  const chars = [...text.toUpperCase()].map((c) => GLYPHS[c] ?? GLYPHS[" "]);
  const w = chars.length * 6 - 1 + 2;
  const h = 7 + 2;
  canvas.width = w * scale;
  canvas.height = h * scale;
  canvas.style.width = `${w * scale}px`;
  canvas.style.height = `${h * scale}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const css = getComputedStyle(document.documentElement);
  const shadow = css.getPropertyValue("--accent2").trim() || "#4de1ff";
  const fill = css.getPropertyValue("--accent").trim() || "#ffcc4d";
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const [dx, dy, color] of [[1, 1, shadow], [0, 0, fill]] as const) {
    ctx.fillStyle = color;
    chars.forEach((g, i) =>
      g.forEach((row, y) =>
        [...row].forEach((p, x) => {
          if (p === "#") ctx.fillRect((i * 6 + x + dx) * scale, (y + dy) * scale, scale, scale);
        }),
      ),
    );
  }
}
