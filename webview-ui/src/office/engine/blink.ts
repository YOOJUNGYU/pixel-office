/**
 * Office blinks (ported from pixel-agents, MIT): each wardrobe character keeps its own clock,
 * so the room never blinks in step. Gaps are random and skewed (mostly a few seconds, now and
 * then much longer), some blinks come in pairs, and characters working at their desk blink
 * less often. Palette characters have no eyes to shut and never run a clock.
 */

import {
  BLINK_DOUBLE_CHANCE,
  BLINK_DOUBLE_GAP_SEC,
  BLINK_FOCUS_STRETCH,
  BLINK_GAP_MAX_SEC,
  BLINK_GAP_MEAN_SEC,
  BLINK_GAP_MIN_SEC,
  BLINK_SHUT_SEC,
} from '../../constants.js';

type Rand = () => number;

/** The clock fields of a Character, on absolute seconds (performance.now() / 1000): a frame's
 *  clamped dt (on-demand rendering) must never stretch the gaps. */
export interface Blinker {
  /** When the eyes next shut (unset = no clock yet). */
  blinkAt?: number;
  /** While shut: when they open again (0/unset = open). */
  openAt?: number;
}

const between = ([min, max]: readonly [number, number], rand: Rand) => min + rand() * (max - min);

/** The wait before the next blink: a floor, then an exponential wait, capped. */
export function blinkGap(focused: boolean, rand: Rand = Math.random): number {
  const wait = -Math.log(1 - rand()) * BLINK_GAP_MEAN_SEC;
  const gap = Math.min(BLINK_GAP_MIN_SEC + wait, BLINK_GAP_MAX_SEC);
  return focused ? gap * BLINK_FOCUS_STRETCH : gap;
}

/** Advance a clock to `now` (a new one starts anywhere in a normal gap, out of step). */
export function tickBlink(b: Blinker, now: number, focused: boolean, rand: Rand = Math.random) {
  if (b.blinkAt === undefined) {
    b.blinkAt = now + rand() * blinkGap(false, rand);
    b.openAt = 0;
    return;
  }
  if (b.openAt) {
    if (now < b.openAt) return;
    // Open again: the next wait starts now (a double blink comes soon after).
    b.openAt = 0;
    b.blinkAt =
      now +
      (rand() < BLINK_DOUBLE_CHANCE
        ? between(BLINK_DOUBLE_GAP_SEC, rand)
        : blinkGap(focused, rand));
    return;
  }
  if (now >= b.blinkAt) b.openAt = now + between(BLINK_SHUT_SEC, rand);
}

/** Whether the eyes are shut now. */
export const isShut = (b: Blinker): boolean => !!b.openAt;

/** Seconds from `now` until this clock next changes what is drawn (Infinity = no clock). */
export function blinkWake(b: Blinker, now: number): number {
  if (b.blinkAt === undefined) return Infinity;
  return Math.max(0, (b.openAt || b.blinkAt) - now);
}
