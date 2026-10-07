// The level: rooms joined by corridors, carved out of solid wall with the
// round's rng, so the same round builds the same maze. Pure, no drawing.

export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Maze {
  w: number;
  h: number;
  /** 0 = floor, 1..WALL_KINDS = wall texture. Row-major, w * h. */
  cells: Uint8Array;
  rooms: Room[];
  /** Where the player starts (cell center). */
  start: { x: number; y: number };
}

/** Wall textures: 1 brick, 2 tech panel, 3 filing cabinet, 4 circuit, 5 hazard. */
export const WALL_KINDS = 5;

/** More zombies and pickups, more rooms and a bigger grid. */
export function mazeSize(zombies: number, pickups: number) {
  const rooms = Math.max(4, Math.min(14, 3 + Math.ceil(zombies / 3) + Math.ceil(pickups / 8)));
  const size = Math.max(22, Math.min(44, Math.ceil(Math.sqrt(rooms * 110))));
  return { rooms, size };
}

export const isWall = (m: Maze, x: number, y: number) => {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  return cx < 0 || cy < 0 || cx >= m.w || cy >= m.h || m.cells[cy * m.w + cx] !== 0;
};

export function buildMaze(rng: () => number, zombies: number, pickups: number): Maze {
  const { rooms: want, size } = mazeSize(zombies, pickups);
  const w = size;
  const h = size;
  const cells = new Uint8Array(w * h).fill(1);
  const corridor = new Uint8Array(w * h);
  const rooms: Room[] = [];
  const int = (n: number) => Math.floor(rng() * n);

  // Rooms: random spots, never touching (two cells of wall between them).
  for (let tries = 0; tries < 400 && rooms.length < want; tries++) {
    const rw = rooms.length === 0 ? 5 : 4 + int(4);
    const rh = rooms.length === 0 ? 5 : 4 + int(4);
    const r = { x: 1 + int(w - rw - 2), y: 1 + int(h - rh - 2), w: rw, h: rh };
    if (rooms.some((o) => r.x < o.x + o.w + 2 && o.x < r.x + r.w + 2 && r.y < o.y + o.h + 2 && o.y < r.y + r.h + 2)) continue;
    rooms.push(r);
  }
  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) cells[y * w + x] = 0;

  // Corridors: each room joins its nearest earlier room (a tree, so all
  // connected), plus a few extra links so there are loops to run around.
  const mid = (r: Room) => ({ x: r.x + (r.w >> 1), y: r.y + (r.h >> 1) });
  const carve = (x: number, y: number) => {
    if (x < 1 || y < 1 || x > w - 2 || y > h - 2) return;
    cells[y * w + x] = 0;
    corridor[y * w + x] = 1;
  };
  const link = (a: Room, b: Room) => {
    const p = mid(a);
    const q = mid(b);
    const wide = rng() < 0.35;
    const flip = rng() < 0.5;
    const hx = (y: number) => {
      for (let x = Math.min(p.x, q.x); x <= Math.max(p.x, q.x); x++) (carve(x, y), wide && carve(x, y + 1));
    };
    const vy = (x: number) => {
      for (let y = Math.min(p.y, q.y); y <= Math.max(p.y, q.y); y++) (carve(x, y), wide && carve(x + 1, y));
    };
    if (flip) (hx(p.y), vy(q.x));
    else (vy(p.x), hx(q.y));
  };
  const dist = (a: Room, b: Room) => Math.abs(mid(a).x - mid(b).x) + Math.abs(mid(a).y - mid(b).y);
  for (let i = 1; i < rooms.length; i++) {
    let best = 0;
    for (let j = 1; j < i; j++) if (dist(rooms[i], rooms[j]) < dist(rooms[i], rooms[best])) best = j;
    link(rooms[i], rooms[best]);
  }
  for (let k = 0; k < Math.floor(rooms.length / 3); k++) {
    const a = rooms[int(rooms.length)];
    const b = rooms[int(rooms.length)];
    if (a !== b) link(a, b);
  }

  // 2x2 pillars in big rooms, for cover: in a corner, one cell in from the
  // walls (so there's always a way around) and off any corridor (they run
  // through the middle). One in a 6-wide room, two from 7 wide, where
  // corners are far enough apart to leave a gap. Never in the start room.
  const pillars: number[] = [];
  for (const r of rooms.slice(1)) {
    if (r.w < 6 || r.h < 6) continue;
    const corners = [
      [r.x + 1, r.y + 1],
      [r.x + r.w - 3, r.y + r.h - 3],
      [r.x + r.w - 3, r.y + 1],
      [r.x + 1, r.y + r.h - 3],
    ];
    const order = int(2) ? [2, 3, 0, 1] : [0, 1, 2, 3]; // a diagonal pair first
    let want = r.w >= 7 && r.h >= 7 ? 2 : 1;
    for (const k of order) {
      if (want === 0) break;
      const [px, py] = corners[k];
      const spots = [py * w + px, py * w + px + 1, (py + 1) * w + px, (py + 1) * w + px + 1];
      if (spots.some((i) => corridor[i])) continue;
      pillars.push(...spots);
      want--;
    }
  }

  // Each room's walls get a texture of their own; the rest stay brick.
  rooms.forEach((r, i) => {
    const tex = i === 0 ? 2 : 1 + (i % WALL_KINDS);
    for (let y = r.y - 1; y <= r.y + r.h; y++)
      for (let x = r.x - 1; x <= r.x + r.w; x++) if (x >= 0 && y >= 0 && x < w && y < h && cells[y * w + x] !== 0) cells[y * w + x] = tex;
  });
  // Pillars are filing cabinets.
  for (const i of pillars) cells[i] = 3;

  const start = rooms.length ? mid(rooms[0]) : { x: w >> 1, y: h >> 1 };
  if (!rooms.length) cells[start.y * w + start.x] = 0;

  // Anything the start can't reach becomes wall, so nothing spawns out of reach.
  const seen = reach({ w, h, cells, rooms, start: { x: start.x + 0.5, y: start.y + 0.5 } }, start.x, start.y);
  for (let i = 0; i < cells.length; i++) if (cells[i] === 0 && seen[i] < 0) cells[i] = 1;

  return { w, h, cells, rooms, start: { x: start.x + 0.5, y: start.y + 0.5 } };
}

/**
 * Steps from a cell to every floor cell (-1 where unreachable or wall), by
 * breadth-first search. `out` and `queue` can be passed in to reuse them.
 */
export function reach(m: Maze, sx: number, sy: number, out?: Int16Array, queue?: Int32Array): Int16Array {
  const n = m.w * m.h;
  const dist = out ?? new Int16Array(n);
  const q = queue ?? new Int32Array(n);
  dist.fill(-1);
  const s = sy * m.w + sx;
  if (sx < 0 || sy < 0 || sx >= m.w || sy >= m.h || m.cells[s] !== 0) return dist;
  let head = 0;
  let tail = 0;
  dist[s] = 0;
  q[tail++] = s;
  while (head < tail) {
    const c = q[head++];
    const d = dist[c] + 1;
    const x = c % m.w;
    if (x > 0 && m.cells[c - 1] === 0 && dist[c - 1] < 0) ((dist[c - 1] = d), (q[tail++] = c - 1));
    if (x < m.w - 1 && m.cells[c + 1] === 0 && dist[c + 1] < 0) ((dist[c + 1] = d), (q[tail++] = c + 1));
    if (c >= m.w && m.cells[c - m.w] === 0 && dist[c - m.w] < 0) ((dist[c - m.w] = d), (q[tail++] = c - m.w));
    if (c < n - m.w && m.cells[c + m.w] === 0 && dist[c + m.w] < 0) ((dist[c + m.w] = d), (q[tail++] = c + m.w));
  }
  return dist;
}
