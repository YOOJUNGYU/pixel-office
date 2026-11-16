// Tower (one button): a server unit slides back and forth above the stack; a drop keeps
// only the part that overlaps the unit below, the rest is cut off. A perfect drop cuts
// nothing, and a streak of them widens the unit again. Missing the stack ends the run.
// Integer fixed point (× GAME_FP): replays are exact.
import {
  GAME_FP,
  GAME_TOWER_GROW_FROM,
  GAME_TOWER_GROW_PX,
  GAME_TOWER_PERFECT_POINTS,
  GAME_TOWER_PERFECT_PX,
  GAME_TOWER_POINTS,
  GAME_TOWER_SPEED,
  GAME_TOWER_SPEED_MAX,
  GAME_TOWER_SPEED_STEP,
  GAME_TOWER_START_W,
  GAME_TOWER_STREAK_MAX,
  GAME_TOWER_W,
} from '../constants.js';
import { type Fx, pushFx, type Rng } from './fx.js';

const FP = GAME_FP;

/** A placed unit: left edge and width (px). */
export interface Unit {
  x: number;
  w: number;
}
export interface TowerState {
  /** Placed units, bottom first (index = floor; 0 = the base). */
  stack: Unit[];
  /** The sliding unit: left edge × GAME_FP, width px, direction ±1. */
  x: number;
  w: number;
  dir: number;
  speed: number;
  /** Perfect drops in a row. */
  streak: number;
  ms: number;
  score: number;
  over: boolean;
  rng: Rng;
  fx: Fx[];
}

/** The next unit enters from a random side, moving inwards. */
function spawn(s: TowerState, w: number): void {
  s.w = w;
  s.dir = s.rng() < 0.5 ? 1 : -1;
  s.x = s.dir > 0 ? 0 : (GAME_TOWER_W - w) * FP;
}

export function newTower(rng: Rng = Math.random): TowerState {
  const base = { x: (GAME_TOWER_W - GAME_TOWER_START_W) / 2, w: GAME_TOWER_START_W };
  const s: TowerState = {
    stack: [base],
    x: 0,
    w: base.w,
    dir: 1,
    speed: GAME_TOWER_SPEED,
    streak: 0,
    ms: 0,
    score: 0,
    over: false,
    rng,
    fx: [],
  };
  spawn(s, base.w);
  return s;
}

export function towerStep(s: TowerState, dtMs: number): void {
  if (s.over) return;
  s.ms += dtMs;
  const max = (GAME_TOWER_W - s.w) * FP;
  s.x += s.dir * s.speed;
  if (s.x <= 0 || s.x >= max) {
    s.x = Math.max(0, Math.min(max, s.x));
    s.dir = -s.dir;
  }
}

export function towerDrop(s: TowerState): void {
  if (s.over) return;
  const top = s.stack[s.stack.length - 1];
  const floor = s.stack.length;
  const px = Math.trunc(s.x / FP);
  const off = px - top.x;
  if (Math.abs(off) <= GAME_TOWER_PERFECT_PX) {
    s.streak++;
    let { x, w } = top;
    if (s.streak >= GAME_TOWER_GROW_FROM && w < GAME_TOWER_START_W) {
      w = Math.min(GAME_TOWER_START_W, w + GAME_TOWER_GROW_PX);
      x = Math.max(0, Math.min(GAME_TOWER_W - w, x - Math.floor((w - top.w) / 2)));
    }
    const n =
      GAME_TOWER_POINTS + GAME_TOWER_PERFECT_POINTS * Math.min(s.streak, GAME_TOWER_STREAK_MAX);
    s.stack.push({ x, w });
    s.score += n;
    pushFx(s.fx, { k: 'perfect', x: x + Math.floor(w / 2), y: floor, n });
  } else {
    const w = s.w - Math.abs(off);
    if (w <= 0) {
      s.over = true;
      pushFx(s.fx, { k: 'over', x: px + Math.floor(s.w / 2), y: floor, n: s.score });
      return;
    }
    s.streak = 0;
    const x = Math.max(px, top.x);
    s.stack.push({ x, w });
    s.score += GAME_TOWER_POINTS;
    // the cut-off piece: x = its centre, n = its width
    const cutX = off > 0 ? x + w : px;
    pushFx(s.fx, {
      k: 'stack',
      x: cutX + Math.floor(Math.abs(off) / 2),
      y: floor,
      n: Math.abs(off),
    });
  }
  s.speed = Math.min(GAME_TOWER_SPEED_MAX, s.speed + GAME_TOWER_SPEED_STEP);
  const placed = s.stack[s.stack.length - 1];
  spawn(s, placed.w);
}
