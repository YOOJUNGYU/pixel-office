// Cable Run: a network cable crawls over a 24 × 18 grid eating packets and growing.
// Every few packets a gold burst appears for a while (worth more the sooner it is
// taken) and, later on, firewall blocks rise. A wall, a firewall or its own body ends
// the run. Pure logic (no DOM).
import {
  GAME_CABLE_BURST_EVERY,
  GAME_CABLE_BURST_MS,
  GAME_CABLE_BURST_POINTS,
  GAME_CABLE_BURST_SEC_POINTS,
  GAME_CABLE_COLS,
  GAME_CABLE_FIREWALL_EVERY,
  GAME_CABLE_FIREWALL_FROM,
  GAME_CABLE_FIREWALL_MAX,
  GAME_CABLE_FIREWALL_SAFE,
  GAME_CABLE_POINTS,
  GAME_CABLE_ROWS,
  GAME_CABLE_START_LEN,
  GAME_CABLE_TICK_MIN_MS,
  GAME_CABLE_TICK_MS,
  GAME_CABLE_TICK_STEP_MS,
  GAME_CABLE_TURN_QUEUE,
} from '../constants.js';
import { type Fx, pushFx, type Rng } from './fx.js';

export interface Pos {
  x: number;
  y: number;
}
export const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
} as const;
export type Dir = keyof typeof DIRS;

export interface CableState {
  /** Head first. */
  body: Pos[];
  dir: Dir;
  /** Turns waiting for the next ticks (a reversal of the one before is dropped). */
  turns: Dir[];
  packet: Pos;
  /** Gold burst, ms left; null = none. */
  burst: (Pos & { ms: number }) | null;
  walls: Pos[];
  /** Packets eaten. */
  eaten: number;
  score: number;
  over: boolean;
  acc: number;
  rng: Rng;
  fx: Fx[];
}

const same = (a: Pos, b: Pos): boolean => a.x === b.x && a.y === b.y;

function freeTile(s: Omit<CableState, 'packet'> & { packet?: Pos }, avoidHead = 0): Pos | null {
  const head = s.body[0];
  const free: Pos[] = [];
  for (let y = 0; y < GAME_CABLE_ROWS; y++)
    for (let x = 0; x < GAME_CABLE_COLS; x++) {
      const p = { x, y };
      if (s.body.some((b) => same(b, p)) || s.walls.some((w) => same(w, p))) continue;
      if (s.packet && same(s.packet, p)) continue;
      if (s.burst && same(s.burst, p)) continue;
      if (avoidHead && Math.abs(x - head.x) + Math.abs(y - head.y) < avoidHead) continue;
      free.push(p);
    }
  return free.length ? free[Math.floor(s.rng() * free.length) % free.length] : null;
}

export function newCable(rng: Rng = Math.random): CableState {
  const y = Math.floor(GAME_CABLE_ROWS / 2);
  const x0 = Math.floor(GAME_CABLE_COLS / 3);
  const body = Array.from({ length: GAME_CABLE_START_LEN }, (_, i) => ({ x: x0 - i, y }));
  const base = {
    body,
    dir: 'right' as Dir,
    turns: [],
    burst: null,
    walls: [],
    eaten: 0,
    score: 0,
    over: false,
    acc: 0,
    rng,
    fx: [],
  };
  return { ...base, packet: freeTile(base) ?? { x: -1, y: -1 } };
}

/** Queue a turn; one reversing (or repeating) the last queued direction is ignored. */
export function cableTurn(s: CableState, d: Dir): void {
  const last = s.turns.at(-1) ?? s.dir;
  if (d === last || (DIRS[d].x + DIRS[last].x === 0 && DIRS[d].y + DIRS[last].y === 0)) return;
  if (s.turns.length < GAME_CABLE_TURN_QUEUE) s.turns.push(d);
}

function crash(s: CableState, at: Pos): void {
  s.over = true;
  pushFx(s.fx, { k: 'over', x: at.x, y: at.y, n: s.score });
}

export function cableTick(s: CableState): void {
  if (s.over) return;
  s.dir = s.turns.shift() ?? s.dir;
  const head = { x: s.body[0].x + DIRS[s.dir].x, y: s.body[0].y + DIRS[s.dir].y };
  const eats = same(head, s.packet);
  const gold = s.burst !== null && same(head, s.burst);
  // The tail moves away this tick unless the cable grows.
  const grows = eats || gold;
  const solid = grows ? s.body : s.body.slice(0, -1);
  if (
    head.x < 0 ||
    head.y < 0 ||
    head.x >= GAME_CABLE_COLS ||
    head.y >= GAME_CABLE_ROWS ||
    solid.some((b) => same(b, head)) ||
    s.walls.some((w) => same(w, head))
  )
    return crash(s, head);
  s.body = [head, ...solid];
  if (gold && s.burst) {
    const pts =
      GAME_CABLE_BURST_POINTS + Math.ceil(s.burst.ms / 1000) * GAME_CABLE_BURST_SEC_POINTS;
    s.score += pts;
    s.burst = null;
    pushFx(s.fx, { k: 'gold', x: head.x, y: head.y, n: pts });
  }
  if (!eats) return;
  s.score += GAME_CABLE_POINTS;
  s.eaten++;
  pushFx(s.fx, { k: 'eat', x: head.x, y: head.y, n: GAME_CABLE_POINTS });
  if (
    s.eaten >= GAME_CABLE_FIREWALL_FROM &&
    s.eaten % GAME_CABLE_FIREWALL_EVERY === 0 &&
    s.walls.length < GAME_CABLE_FIREWALL_MAX
  ) {
    const w = freeTile(s, GAME_CABLE_FIREWALL_SAFE);
    if (w) {
      s.walls.push(w);
      pushFx(s.fx, { k: 'wall', x: w.x, y: w.y, n: 0 });
    }
  }
  if (s.eaten % GAME_CABLE_BURST_EVERY === 0 && !s.burst) {
    const b = freeTile(s);
    if (b) {
      s.burst = { ...b, ms: GAME_CABLE_BURST_MS };
      pushFx(s.fx, { k: 'burst', x: b.x, y: b.y, n: 0 });
    }
  }
  const p = freeTile({ ...s, packet: undefined });
  if (!p) return crash(s, head); // the board is full
  s.packet = p;
}

export const cableTickMs = (eaten: number): number =>
  Math.max(GAME_CABLE_TICK_MIN_MS, GAME_CABLE_TICK_MS - eaten * GAME_CABLE_TICK_STEP_MS);

export function cableStep(s: CableState, dtMs: number): void {
  if (s.over) return;
  if (s.burst && (s.burst.ms -= dtMs) <= 0) {
    pushFx(s.fx, { k: 'fade', x: s.burst.x, y: s.burst.y, n: 0 });
    s.burst = null;
  }
  s.acc += dtMs;
  const ms = cableTickMs(s.eaten);
  while (!s.over && s.acc >= ms) {
    s.acc -= ms;
    cableTick(s);
  }
}
