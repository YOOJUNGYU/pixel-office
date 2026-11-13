// One arcade run as a fixed-tick simulation: the page plays it and records its inputs;
// the relay replays the same seed + inputs to compute the score itself (a submitted
// number is never trusted). Pure, no DOM / Node APIs (also bundled into the Worker).
import { GAME_TICK_MS } from '../constants.js';
import type { GameId } from '../lan.js';
import { breakerAct, type BreakerState, breakerStep, newBreaker } from './breaker.js';
import { type BugsState, bugsStep, bugsWhack, newBugs } from './bugs.js';
import { type CableState, cableStep, cableTurn, type Dir, newCable } from './cable.js';
import { droneFlap, type DroneState, droneStep, newDrone } from './drone.js';
import type { Rng } from './fx.js';
import { mergeMove, type MergeState, newMerge } from './merge.js';

/** Inputs per game: cable up down left right; bugs monitor 0–8; breaker BREAKER_ACT; drone flap; merge MERGE_ACT. */
export const CABLE_ACT: readonly Dir[] = ['up', 'down', 'left', 'right'];
export const GAME_ACTIONS: Record<GameId, number> = {
  cable: 4,
  bugs: 9,
  breaker: 5,
  drone: 1,
  merge: 5,
};
/** Longest run a replay may claim (ticks) and most inputs it may carry. */
export const REPLAY_MAX_TICKS = (4 * 3600 * 1000) / GAME_TICK_MS;
export const REPLAY_MAX_INPUTS = 150_000;

export type Run =
  | { game: 'cable'; s: CableState; ticks: number }
  | { game: 'bugs'; s: BugsState; ticks: number }
  | { game: 'breaker'; s: BreakerState; ticks: number }
  | { game: 'drone'; s: DroneState; ticks: number }
  | { game: 'merge'; s: MergeState; ticks: number };

/** mulberry32: a 32-bit seeded generator, identical in every JS engine. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function newRun(game: GameId, seed: number): Run {
  const rng = seededRng(seed);
  switch (game) {
    case 'cable':
      return { game, s: newCable(rng), ticks: 0 };
    case 'bugs':
      return { game, s: newBugs(rng), ticks: 0 };
    case 'breaker':
      return { game, s: newBreaker(rng), ticks: 0 };
    case 'drone':
      return { game, s: newDrone(rng), ticks: 0 };
    case 'merge':
      return { game, s: newMerge(rng), ticks: 0 };
  }
}

/** One input now (between ticks). Unknown or late ones do nothing. */
export function act(run: Run, a: number): void {
  if (run.s.over || !Number.isInteger(a) || a < 0 || a >= GAME_ACTIONS[run.game]) return;
  if (run.game === 'cable') cableTurn(run.s, CABLE_ACT[a]);
  else if (run.game === 'bugs') bugsWhack(run.s, a);
  else if (run.game === 'breaker') breakerAct(run.s, a);
  else if (run.game === 'drone') droneFlap(run.s);
  else mergeMove(run.s, a);
}

/** Advance one GAME_TICK_MS (merge has no clock: only its tick count moves). */
export function tick(run: Run): void {
  if (run.s.over) return;
  run.ticks++;
  if (run.game === 'cable') cableStep(run.s, GAME_TICK_MS);
  else if (run.game === 'bugs') bugsStep(run.s, GAME_TICK_MS);
  else if (run.game === 'breaker') breakerStep(run.s, GAME_TICK_MS);
  else if (run.game === 'drone') droneStep(run.s, GAME_TICK_MS);
}

/** Records a run's inputs as flat [ticks since the previous input, action, ...]. */
export class Recorder {
  readonly inputs: number[] = [];
  private last = 0;
  readonly run: Run;
  constructor(run: Run) {
    this.run = run;
  }
  act(a: number): void {
    if (this.run.s.over) return;
    this.inputs.push(this.run.ticks - this.last, a);
    this.last = this.run.ticks;
    act(this.run, a);
  }
}

/**
 * Replays `inputs` (Recorder format) on `seed` and runs on until the game ends.
 * null = malformed, too long, or never ended within REPLAY_MAX_TICKS.
 */
export function replay(
  game: GameId,
  seed: number,
  inputs: readonly number[],
): { score: number; ticks: number } | null {
  if (inputs.length % 2 !== 0 || inputs.length > 2 * REPLAY_MAX_INPUTS) return null;
  const run = newRun(game, seed);
  for (let i = 0; i < inputs.length; i += 2) {
    const dt = inputs[i];
    if (!Number.isInteger(dt) || dt < 0 || run.ticks + dt > REPLAY_MAX_TICKS) return null;
    for (let k = 0; k < dt && !run.s.over; k++) tick(run);
    if (run.s.over) break; // inputs after the end change nothing
    act(run, inputs[i + 1]);
  }
  while (!run.s.over && run.ticks < REPLAY_MAX_TICKS) tick(run);
  return run.s.over ? { score: run.s.score, ticks: run.ticks } : null;
}
