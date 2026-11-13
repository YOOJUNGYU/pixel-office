// Merge (sliding tiles): every arrow slides all tiles that way; two equal tiles meeting
// merge into their sum (once per move) and score it. A new tile appears after every move
// that changed something. Stuck = over; the player may also end a run on purpose.
import { GAME_MERGE_NEW_FOUR_PCT, GAME_MERGE_SIZE } from '../constants.js';
import { type Fx, pushFx, type Rng } from './fx.js';

const N = GAME_MERGE_SIZE;
export const MERGE_DIRS = ['up', 'down', 'left', 'right'] as const;
/** Inputs: slide up / down / left / right, end the run (record the score now). */
export const MERGE_ACT = { up: 0, down: 1, left: 2, right: 3, end: 4 } as const;

export interface Slide {
  from: number;
  to: number;
  /** Exponent before the move. */
  e: number;
}
export interface MergeState {
  /** Row-major N × N exponents: 0 = empty, e = tile 2^e. */
  cells: number[];
  /** The last move, for the page's slide animation (`seq` counts moves). */
  last: { seq: number; slides: Slide[]; merged: number[]; spawn: number };
  moves: number;
  score: number;
  over: boolean;
  rng: Rng;
  fx: Fx[];
}

function spawn(s: MergeState): number {
  const free = s.cells.flatMap((c, i) => (c ? [] : [i]));
  if (!free.length) return -1;
  const i = free[Math.floor(s.rng() * free.length) % free.length];
  s.cells[i] = Math.floor(s.rng() * 100) < GAME_MERGE_NEW_FOUR_PCT ? 2 : 1;
  return i;
}

export function newMerge(rng: Rng = Math.random): MergeState {
  const s: MergeState = {
    cells: new Array<number>(N * N).fill(0),
    last: { seq: 0, slides: [], merged: [], spawn: -1 },
    moves: 0,
    score: 0,
    over: false,
    rng,
    fx: [],
  };
  const a = spawn(s);
  const b = spawn(s);
  s.last = { seq: 0, slides: [], merged: [a, b], spawn: b };
  return s;
}

/** Cell indices of each line, in the order tiles slide towards (first = the wall). */
function lines(dir: (typeof MERGE_DIRS)[number]): number[][] {
  const out: number[][] = [];
  for (let k = 0; k < N; k++) {
    const line: number[] = [];
    for (let j = 0; j < N; j++) {
      if (dir === 'left') line.push(k * N + j);
      else if (dir === 'right') line.push(k * N + (N - 1 - j));
      else if (dir === 'up') line.push(j * N + k);
      else line.push((N - 1 - j) * N + k);
    }
    out.push(line);
  }
  return out;
}

const canMove = (c: readonly number[]): boolean =>
  c.some(
    (v, i) => v === 0 || (i % N < N - 1 && c[i + 1] === v) || (i + N < N * N && c[i + N] === v),
  );

export function mergeMove(s: MergeState, a: number): void {
  if (s.over) return;
  if (a === MERGE_ACT.end) {
    s.over = true;
    pushFx(s.fx, { k: 'over', x: 0, y: 0, n: s.score });
    return;
  }
  const dir = MERGE_DIRS[a];
  if (!dir) return;
  const slides: Slide[] = [];
  const merged: number[] = [];
  const next = new Array<number>(N * N).fill(0);
  let gained = 0;
  for (const line of lines(dir)) {
    let put = 0;
    let open = -1; // index in `line` of a tile that may still take a merge
    for (const from of line) {
      const e = s.cells[from];
      if (!e) continue;
      if (open >= 0 && next[line[open]] === e) {
        next[line[open]] = e + 1;
        gained += 2 ** (e + 1);
        merged.push(line[open]);
        slides.push({ from, to: line[open], e });
        open = -1;
      } else {
        next[line[put]] = e;
        slides.push({ from, to: line[put], e });
        open = put;
        put++;
      }
    }
  }
  if (next.every((v, i) => v === s.cells[i])) return; // nothing moved
  s.cells = next;
  s.score += gained;
  s.moves++;
  const at = spawn(s);
  s.last = { seq: s.last.seq + 1, slides, merged, spawn: at };
  pushFx(s.fx, { k: merged.length ? 'merge' : 'slide', x: merged[0] ?? 0, y: 0, n: gained });
  const top = Math.max(...merged.map((i) => s.cells[i]), 0);
  if (top >= 7) pushFx(s.fx, { k: 'big', x: merged[0], y: 0, n: 2 ** top });
  if (!canMove(s.cells)) {
    s.over = true;
    pushFx(s.fx, { k: 'over', x: 0, y: 0, n: s.score });
  }
}
