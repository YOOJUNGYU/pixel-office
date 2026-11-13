// Effect events a game queues for the page (sounds, particles, floating points). They
// never change a score: the page drains them each frame; a replay ignores them.
import { GAME_FX_MAX } from '../constants.js';

export type Rng = () => number;

export interface Fx {
  /** What happened, per game (e.g. 'clear', 'eat', 'hit'). */
  k: string;
  /** Where, in the game's own cells (or monitor index in x for bugs). */
  x: number;
  y: number;
  /** Points won (negative = lost) or a count. */
  n: number;
  /** rack 'clear': the board rows that went. */
  rows?: number[];
}

export function pushFx(q: Fx[], fx: Fx): void {
  if (q.length < GAME_FX_MAX) q.push(fx);
}
