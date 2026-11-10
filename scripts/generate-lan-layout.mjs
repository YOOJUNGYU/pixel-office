#!/usr/bin/env node
// Generates the bundled four-room LAN office layout (deterministic — no randomness).
//   node scripts/generate-lan-layout.mjs > webview-ui/public/assets/default-layout-1.json
//   node scripts/generate-lan-layout.mjs --personal > webview-ui/public/assets/default-layout-personal.json
//
//   ┌──────────┬────────────────┐
//   │  코딩실   │     서버실      │   left column: 코딩실 = 자료실 (same size)
//   ├───  ─────┴───  ────────  ──┤   right column: 서버실 = 대기실 (same size)
//   │           corridor          │
//   ├───  ─────┬───  ────────  ──┤   doors to the corridor + between the two rooms of a row
//   │  자료실   │     대기실      │
//   └──────────┴────────────────┘

const WALL = 0;
const VOID = 255;
const FLOOR_1 = 1;
const FLOOR_3 = 3;
const FLOOR_4 = 4;
const FLOOR_7 = 7;

// Two variants from one generator:
//   (default)    83×54 shared office   → default-layout-1.json
//   --personal   36×31 personal office → default-layout-personal.json
const PERSONAL = process.argv.includes('--personal');

// Each room is a grid of furniture groups with the same free border (`pad`) along all four
// walls; the gaps between groups take up the rest (spread evenly, symmetric).
const V = PERSONAL
  ? {
      // [top, bottom]: 14 gives 서버실 two free rows under its tables (and, to keep the zone
      // divider centred in the gap, two above); the bottom rooms give them back (still 31 rows).
      roomH: [14, 10],
      corridorH: 2,
      // 50×31 ≈ 16:10: the right column (서버실, 대기실) is the wide one.
      roomW: [15, 32],
      pad: { coding: 1, library: 1, server: 1, lounge: 1 },
      // Compact blocks centred in each room (`gap` between groups, [x, y] or both), lifted
      // `lift` tiles: the back wall's face makes a floor-centred block look low. Wide gaps
      // keep seated agents (and their bubbles) apart.
      lift: 1,
      // Not lifted (`lift: 0`): the desks sit in the middle of the taller room.
      coding: { cols: 2, rows: 2, chairs: [0, 2], gap: [3, 2], lift: 0 },
      library: { cols: 2, rows: 1, gap: 3 },
      // Two tables per 서버실 work zone (quadrant), four PCs each: 8 seats per zone. Not
      // lifted: the zones stay symmetric about the divider.
      server: { cols: 2, rows: 1, gap: [1, 1], zoneGap: [6, 2], seatRows: [0, 2], lift: 0 },
      lounge: { cols: 1, rows: 1, gap: 0 },
      extraDoors: false,
      wallDeco: {
        coding: [
          ['WHITEBOARD', 2],
          ['CLOCK', 7],
          ['WHITEBOARD', 11],
        ],
        // 32 wide: the whiteboard is the centre (15–16), the paintings mirror each other.
        server: [
          ['LARGE_PAINTING', 3],
          ['WHITEBOARD', 15],
          ['LARGE_PAINTING', 27],
        ],
      },
    }
  : {
      // [top, bottom]: the top row (코딩실, 서버실) is taller — 서버실 needs room for the gaps
      // between its work zones, 코딩실 one more desk row for its narrower width.
      // 28 even: the 서버실 zone divider falls on a floor seam, centred. 16: the whole office
      // is 83×52 ≈ 16:10, which fits 16:10 and (wider) 16:9 browser windows alike.
      roomH: [28, 16],
      corridorH: 3,
      roomW: [24, 56],
      pad: { coding: 2, library: 2, server: 2, lounge: 2 },
      coding: { cols: 4, rows: 6, chairs: [0, 1, 2] },
      library: { cols: 4, rows: 3 },
      // Per work zone 4×2 tables (8), 1 tile apart; zones `zoneGap` apart (empty floor between).
      server: { cols: 4, rows: 2, gap: [1, 1], zoneGap: [6, 6], seatRows: [0, 2] },
      // A centred block with one gap both ways (spread to the walls it looked scattered).
      lounge: { cols: 4, rows: 2, gap: [5, 3] },
      extraDoors: true,
      lift: 0,
      wallDeco: {
        // Mirror-symmetric about each wall's centre (24 wide: 11–12; 56 wide: 27–28).
        coding: [
          ['WHITEBOARD', 2],
          ['SMALL_PAINTING', 7],
          ['LARGE_PAINTING', 11],
          ['CLOCK', 16],
          ['WHITEBOARD', 20],
        ],
        server: [
          ['LARGE_PAINTING', 6],
          ['SMALL_PAINTING', 17],
          ['WHITEBOARD', 27],
          ['SMALL_PAINTING_2', 38],
          ['LARGE_PAINTING', 48],
        ],
      },
    };

// Grid geometry (cols × rows). Row 0 is void headroom for the 2-tile-tall top wall sprites.
// Two rows of two rooms around a corridor; every room of a column has the same size.
const TOP_WALL = 1;
const TOP_Y = 2; // first interior row of the top rooms
const [TOP_H, BOTTOM_H] = V.roomH;
const MID_WALL = TOP_Y + TOP_H;
const CORRIDOR_Y = MID_WALL + 1;
const CORRIDOR_H = V.corridorH;
const BOTTOM_WALL = CORRIDOR_Y + CORRIDOR_H;
const BOTTOM_Y = BOTTOM_WALL + 1;
const ROWS = BOTTOM_Y + BOTTOM_H + 1;
const [LEFT_W, RIGHT_W] = V.roomW;
const RIGHT_X = LEFT_W + 2;
const COLS = RIGHT_X + RIGHT_W + 1;

const box = (label, color, x, w, y, h) => ({ label, color, x, w, y, h });
const CODING = box('코딩실', '#48dbfb', 1, LEFT_W, TOP_Y, TOP_H);
const SERVER = box('서버실', '#ff6b6b', RIGHT_X, RIGHT_W, TOP_Y, TOP_H);
const LIBRARY = box('자료실', '#1dd1a1', 1, LEFT_W, BOTTOM_Y, BOTTOM_H);
const LOUNGE = box('대기실', '#feca57', RIGHT_X, RIGHT_W, BOTTOM_Y, BOTTOM_H);

// Floor pattern + colour per zone (ColorValue {h,s,b,c}, same as the editor writes).
const FLOOR = {
  coding: { tile: FLOOR_7, color: { h: 214, s: 30, b: -60, c: -40 } },
  library: { tile: FLOOR_1, color: { h: 30, s: 45, b: -35, c: -60 } },
  // 서버실: large panels (a raised floor), one colour; the work zones are told apart by the
  // divider lines the renderer draws (and can each be repainted with the floor tool).
  server: { tile: FLOOR_3, color: { h: 210, s: 18, b: -30, c: -30 } },
  lounge: { tile: FLOOR_4, color: { h: 25, s: 48, b: -20, c: -70 } },
  corridor: { tile: FLOOR_1, color: { h: 209, s: 0, b: -20, c: -60 } },
};
const WALL_COLOR = { h: 214, s: 30, b: -100, c: -55 };

const tiles = new Array(COLS * ROWS).fill(VOID);
const tileColors = new Array(COLS * ROWS).fill(null);
const areaTiles = new Array(COLS * ROWS).fill(null);
const furniture = [];
const idx = (c, r) => r * COLS + c;

function rect(x, y, w, h, fn) {
  for (let r = y; r < y + h; r++) for (let c = x; c < x + w; c++) fn(c, r);
}
function wall(c, r) {
  tiles[idx(c, r)] = WALL;
  tileColors[idx(c, r)] = WALL_COLOR;
}
function floor(c, r, f, label = null) {
  tiles[idx(c, r)] = f.tile;
  tileColors[idx(c, r)] = f.color;
  areaTiles[idx(c, r)] = label;
}
let seq = 0;
function put(type, col, row) {
  furniture.push({ uid: `lan-${String(seq++).padStart(3, '0')}`, type, col, row });
}

// ── Shell: everything inside the outer wall is wall, then rooms are carved out ──
rect(0, TOP_WALL, COLS, ROWS - TOP_WALL, wall);
const room = (r, f) => rect(r.x, r.y, r.w, r.h, (c, row) => floor(c, row, f, r.label));
room(CODING, FLOOR.coding);
room(LIBRARY, FLOOR.library);
room(SERVER, FLOOR.server);
room(LOUNGE, FLOOR.lounge);
rect(1, CORRIDOR_Y, COLS - 2, CORRIDOR_H, (c, r) => floor(c, r, FLOOR.corridor));

// ── Doors (2-tile gaps, unzoned corridor floor) ──
const door = (x, y, w, h) => rect(x, y, w, h, (c, r) => floor(c, r, FLOOR.corridor));
const mid = (r) => r.x + Math.floor(r.w / 2) - 1;
/** First tile of the two 2-tile doors at 1/3 and 2/3 of a wall `len` tiles long from `start`
 *  (moved apart, symmetrically, until a wall tile is left between them). */
function thirds(start, len) {
  let [a, b] = [1, 2].map((k) => Math.round((k * len) / 3) - 1);
  while (b - a < 3) [a, b] = [a - 1, b + 1];
  return [start + a, start + b];
}
for (const x of thirds(CODING.x, CODING.w)) door(x, MID_WALL, 2, 1); // 코딩실 ↔ 복도
for (const x of thirds(LIBRARY.x, LIBRARY.w)) door(x, BOTTOM_WALL, 2, 1); // 복도 ↔ 자료실
door(mid(SERVER), MID_WALL, 2, 1);
door(mid(LOUNGE), BOTTOM_WALL, 2, 1);
for (const y of thirds(TOP_Y, TOP_H)) door(RIGHT_X - 1, y, 1, 2); // 코딩실 ↔ 서버실
for (const y of thirds(BOTTOM_Y, BOTTOM_H)) door(RIGHT_X - 1, y, 1, 2); // 자료실 ↔ 대기실
if (V.extraDoors) {
  // The wide right-hand rooms get two more doors each.
  for (const x of [
    RIGHT_X + Math.floor(RIGHT_W / 4),
    RIGHT_X + Math.floor((3 * RIGHT_W) / 4) - 1,
  ]) {
    door(x, MID_WALL, 2, 1);
    door(x, BOTTOM_WALL, 2, 1);
  }
}

/** n groups of `size` tiles over `inner` tiles: `gap` given → that gap, the block centred;
 *  else first at 0, last at the far end, gaps as even as possible and mirror-symmetric
 *  (one group: centred). */
function spread(n, size, inner, gap, lift = 0) {
  if (gap !== undefined) {
    const start = Math.max(0, Math.floor((inner - n * size - (n - 1) * gap) / 2) - lift);
    if (start < 0)
      throw new Error(`${String(n)} groups of ${String(size)} do not fit ${String(inner)}`);
    return Array.from({ length: n }, (_, i) => start + i * (size + gap));
  }
  const span = inner - size;
  if (span < (n - 1) * size)
    throw new Error(`${String(n)} groups of ${String(size)} do not fit ${String(inner)}`);
  if (n === 1) return [Math.floor(span / 2)];
  return Array.from({ length: n }, (_, i) =>
    i * 2 <= n - 1
      ? Math.floor((i * span) / (n - 1))
      : span - Math.floor(((n - 1 - i) * span) / (n - 1)),
  );
}

/**
 * A cols × rows grid of furniture groups in `room`, at least `pad` tiles from every wall
 * (exactly, unless a fixed `gap` centres a smaller block).
 * `unit` = the group's footprint (w × h) and where its anchor sits inside it (ox, oy);
 * `place(col, row, k)` puts one group at its anchor (k = index in reading order).
 */
function roomGrid(room, pad, unit, cols, rows, place, gap, lift = V.lift) {
  const [gx, gy] = Array.isArray(gap) ? gap : [gap, gap];
  const xs = spread(cols, unit.w, room.w - 2 * pad, gx);
  const ys = spread(rows, unit.h, room.h - 2 * pad, gy, lift);
  let k = 0;
  for (const y of ys) {
    for (const x of xs) place(room.x + pad + x + unit.ox, room.y + pad + y + unit.oy, k++);
  }
}

// ── 코딩실: desks with two PCs, chairs facing up under each desk (group 3×3) ──
const { coding: cd, library: lb, server: sv, lounge: lg, pad } = V;
roomGrid(
  CODING,
  pad.coding,
  { w: 3, h: 3, ox: 0, oy: 0 },
  cd.cols,
  cd.rows,
  (c, y) => {
    put('DESK_FRONT', c, y);
    put('PC_FRONT_OFF', c, y);
    put('PC_FRONT_OFF', c + 2, y);
    for (const k of cd.chairs) put('CUSHIONED_CHAIR_BACK', c + k, y + 2);
  },
  cd.gap,
  cd.lift,
);
for (const [type, x] of V.wallDeco.coding) put(type, CODING.x + x, TOP_WALL - 1);

// ── 자료실: bookshelves on the top wall, reading tables with 4 chairs (group 4×3) ──
// The shelves sit as in the top rooms (the lower tile on the wall, the upper one over the
// corridor's last row), leaving the doors to the corridor open.
const shelfRow = LIBRARY.y - 2;
/** The wall segments between a room's top-wall doors: [first, last] tile, inclusive. */
function wallSegments(room, doors) {
  const out = [];
  let x = room.x;
  for (const d of [...doors].sort((a, b) => a - b)) {
    out.push([x, d - 1]);
    x = d + 2;
  }
  out.push([x, room.x + room.w - 1]);
  return out;
}
// The two corner segments are lined with shelves from the corner (the odd tile left by the
// door); the middle segment gets the centred wall decor.
const [libLeft, libMid, libRight] = wallSegments(LIBRARY, thirds(LIBRARY.x, LIBRARY.w));
const shelves = (n) => Math.floor(n / 2);
for (let k = 0; k < shelves(libLeft[1] - libLeft[0] + 1); k++) {
  put('DOUBLE_BOOKSHELF', libLeft[0] + 2 * k, shelfRow);
}
for (let k = 1; k <= shelves(libRight[1] - libRight[0] + 1); k++) {
  put('DOUBLE_BOOKSHELF', libRight[1] + 1 - 2 * k, shelfRow);
}
const midW = libMid[1] - libMid[0] + 1;
if (midW % 2 === 1) put('CLOCK', libMid[0] + (midW - 1) / 2, shelfRow);
else {
  put('LARGE_PAINTING', libMid[0] + midW / 2 - 1, shelfRow);
  if (midW >= 6) {
    put('HANGING_PLANT', libMid[0], shelfRow);
    put('HANGING_PLANT', libMid[1], shelfRow);
  }
}
const readingTable = (c, y) => {
  put('SMALL_TABLE_FRONT', c, y);
  put('CUSHIONED_CHAIR_SIDE', c - 1, y + 1);
  put('CUSHIONED_CHAIR_SIDE:left', c + 2, y + 1);
  put('CUSHIONED_CHAIR_BACK', c, y + 2);
  put('CUSHIONED_CHAIR_BACK', c + 1, y + 2);
};
roomGrid(
  LIBRARY,
  pad.library,
  { w: 4, h: 3, ox: 1, oy: 0 },
  lb.cols,
  lb.rows,
  readingTable,
  lb.gap,
);

// ── 서버실: four work zones (quadrants), each a block of workstation tables (group 5×4: a PC
// on every seat, wooden chairs both sides); empty floor between
// the zones so they read as separate areas. ──
{
  const unit = { w: 5, h: 4, ox: 1, oy: 0 };
  const [gx, gy] = sv.gap;
  const zoneW = sv.cols * unit.w + (sv.cols - 1) * gx;
  const zoneH = sv.rows * unit.h + (sv.rows - 1) * gy;
  const [zgx, zgy] = sv.zoneGap;
  const zxs = spread(2, zoneW, SERVER.w - 2 * pad.server, zgx);
  const zys = spread(2, zoneH, SERVER.h - 2 * pad.server, zgy, sv.lift ?? V.lift);
  zys.forEach((zy) =>
    zxs.forEach((zx) => {
      for (let r = 0; r < sv.rows; r++) {
        for (let k = 0; k < sv.cols; k++) {
          const c = SERVER.x + pad.server + zx + k * (unit.w + gx) + unit.ox;
          const y = SERVER.y + pad.server + zy + r * (unit.h + gy) + unit.oy;
          put('TABLE_FRONT', c, y);
          for (const dy of sv.seatRows) {
            put('PC_SIDE', c, y + dy);
            put('PC_SIDE:left', c + 2, y + dy);
            put('WOODEN_CHAIR_SIDE', c - 1, y + dy);
            put('WOODEN_CHAIR_SIDE:left', c + 3, y + dy);
          }
        }
      }
    }),
  );
}
for (const [type, x] of V.wallDeco.server) put(type, SERVER.x + x, TOP_WALL - 1);

// ── 대기실: sofa lounges around a coffee table, 8 seats each (group 4×4); open floor between ──
roomGrid(
  LOUNGE,
  pad.lounge,
  { w: 4, h: 4, ox: 1, oy: 1 },
  lg.cols,
  lg.rows,
  (c, y, k) => {
    put('COFFEE_TABLE', c, y);
    put('COFFEE', c + (k % 2), y + 1);
    put('SOFA_FRONT', c, y - 1);
    put('SOFA_BACK', c, y + 2);
    put('SOFA_SIDE', c - 1, y);
    put('SOFA_SIDE:left', c + 2, y);
  },
  lg.gap,
);

// ── Plants: the free floor corners (inside the `pad` border, away from the doors) ──
/** A large (2×3) plant in both bottom corners of `room`. */
const cornerPlants = (room) => {
  put('LARGE_PLANT', room.x, room.y + room.h - 3);
  put('LARGE_PLANT', room.x + room.w - 2, room.y + room.h - 3);
};
cornerPlants(CODING);
cornerPlants(LIBRARY);
// 대기실: a large plant in every corner, a cactus and a pot mid-way along the side walls,
// pictures and a clock on its top wall (mirror-symmetric about the middle door).
cornerPlants(LOUNGE);
for (const x of [LOUNGE.x, LOUNGE.x + LOUNGE.w - 2]) put('LARGE_PLANT', x, LOUNGE.y);
if (LOUNGE.h >= 12) {
  const midY = LOUNGE.y + Math.floor(LOUNGE.h / 2) - 1;
  put('CACTUS', LOUNGE.x, midY);
  put('CACTUS', LOUNGE.x + LOUNGE.w - 1, midY);
}
{
  const segs = wallSegments(LOUNGE, [
    mid(LOUNGE),
    ...(V.extraDoors
      ? [RIGHT_X + Math.floor(RIGHT_W / 4), RIGHT_X + Math.floor((3 * RIGHT_W) / 4) - 1]
      : []),
  ]);
  const c = (seg, w) => Math.floor((seg[0] + seg[1] + 1 - w) / 2);
  const [first, last] = [segs[0], segs[segs.length - 1]];
  put('LARGE_PAINTING', c(first, 2), LOUNGE.y - 2);
  put('LARGE_PAINTING', c(last, 2), LOUNGE.y - 2);
  if (segs.length === 4) {
    put('CLOCK', segs[1][1] - 2, LOUNGE.y - 2);
    put('SMALL_PAINTING_2', segs[2][0] + 2, LOUNGE.y - 2);
  }
}

const layout = {
  version: 1,
  cols: COLS,
  rows: ROWS,
  layoutRevision: 1,
  tiles,
  tileColors,
  furniture,
  areas: [CODING, LIBRARY, SERVER, LOUNGE].map(({ label, color }) => ({ label, color })),
  areaTiles,
};

// Pretty-print with one grid row per line so diffs stay readable.
const grid = (arr) =>
  '[\n' +
  Array.from({ length: ROWS }, (_, r) =>
    arr
      .slice(r * COLS, (r + 1) * COLS)
      .map((v) => JSON.stringify(v))
      .join(','),
  )
    .map((line) => `    ${line}`)
    .join(',\n') +
  '\n  ]';
const out = JSON.stringify(
  layout,
  (k, v) => (['tiles', 'tileColors', 'areaTiles'].includes(k) ? `@@${k}@@` : v),
  2,
).replace(/"@@(\w+)@@"/g, (_, k) => grid(layout[k]));
process.stdout.write(`${out}\n`);
