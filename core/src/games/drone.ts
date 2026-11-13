// Drone (one button): flap to rise, gravity pulls down; fly through the gaps between
// server racks. Each rack passed scores, packets in some gaps score more; it speeds up
// and the gaps narrow. The ceiling stops you, the floor or a rack ends the run.
// Integer fixed point (× GAME_FP): replays are exact.
import {
  GAME_DRONE_BOX_H,
  GAME_DRONE_BOX_W,
  GAME_DRONE_FALL_MAX,
  GAME_DRONE_FLAP,
  GAME_DRONE_GAP,
  GAME_DRONE_GAP_MIN,
  GAME_DRONE_GAP_SHIFT,
  GAME_DRONE_GAP_STEP,
  GAME_DRONE_GRAVITY,
  GAME_DRONE_H,
  GAME_DRONE_MARGIN,
  GAME_DRONE_PACKET_PCT,
  GAME_DRONE_PACKET_POINTS,
  GAME_DRONE_PASS_POINTS,
  GAME_DRONE_RACK_W,
  GAME_DRONE_SPACING,
  GAME_DRONE_SPEED,
  GAME_DRONE_SPEED_MAX,
  GAME_DRONE_SPEED_STEP,
  GAME_DRONE_W,
  GAME_DRONE_X,
  GAME_FP,
} from '../constants.js';
import { type Fx, pushFx, type Rng } from './fx.js';

const FP = GAME_FP;

export interface Rack {
  /** Left edge × GAME_FP. */
  x: number;
  /** Gap centre and height (px). */
  gapY: number;
  gap: number;
  passed: boolean;
  /** A packet floats in the gap (until taken). */
  packet: boolean;
}
export interface DroneState {
  /** Top of the drone box × GAME_FP; vy per tick. */
  y: number;
  vy: number;
  /** False until the first flap: it hovers. */
  flying: boolean;
  racks: Rack[];
  /** Scroll speed × GAME_FP per tick. */
  speed: number;
  passed: number;
  /** ms flown (wing animation, bobbing). */
  ms: number;
  score: number;
  over: boolean;
  rng: Rng;
  fx: Fx[];
}

function nextRack(s: DroneState, x: number): Rack {
  const gap = Math.max(GAME_DRONE_GAP_MIN, GAME_DRONE_GAP - s.passed * GAME_DRONE_GAP_STEP);
  const lo = GAME_DRONE_MARGIN + Math.ceil(gap / 2);
  const hi = GAME_DRONE_H - GAME_DRONE_MARGIN - Math.ceil(gap / 2);
  const prev = s.racks.at(-1)?.gapY ?? Math.floor(GAME_DRONE_H / 2);
  const from = Math.max(lo, prev - GAME_DRONE_GAP_SHIFT);
  const to = Math.min(hi, prev + GAME_DRONE_GAP_SHIFT);
  const gapY = from + (Math.floor(s.rng() * (to - from + 1)) % (to - from + 1));
  const packet = Math.floor(s.rng() * 100) < GAME_DRONE_PACKET_PCT;
  return { x, gapY, gap, passed: false, packet };
}

export function newDrone(rng: Rng = Math.random): DroneState {
  const s: DroneState = {
    y: Math.trunc(((GAME_DRONE_H - GAME_DRONE_BOX_H) * FP) / 2),
    vy: 0,
    flying: false,
    racks: [],
    speed: GAME_DRONE_SPEED,
    passed: 0,
    ms: 0,
    score: 0,
    over: false,
    rng,
    fx: [],
  };
  s.racks.push(nextRack(s, (GAME_DRONE_W - 40) * FP));
  return s;
}

export function droneFlap(s: DroneState): void {
  if (s.over) return;
  s.flying = true;
  s.vy = GAME_DRONE_FLAP;
  pushFx(s.fx, { k: 'flap', x: GAME_DRONE_X, y: Math.trunc(s.y / FP), n: 0 });
}

const overlaps = (
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
) => ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

function crash(s: DroneState): void {
  s.over = true;
  pushFx(s.fx, {
    k: 'over',
    x: GAME_DRONE_X + GAME_DRONE_BOX_W / 2,
    y: Math.trunc(s.y / FP),
    n: s.score,
  });
}

export function droneStep(s: DroneState, dtMs: number): void {
  if (s.over) return;
  s.ms += dtMs;
  if (!s.flying) return;
  s.vy = Math.min(GAME_DRONE_FALL_MAX, s.vy + GAME_DRONE_GRAVITY);
  s.y += s.vy;
  if (s.y < 0) {
    s.y = 0;
    s.vy = 0;
  }
  if (s.y + GAME_DRONE_BOX_H * FP >= GAME_DRONE_H * FP) return crash(s);
  for (const r of s.racks) r.x -= s.speed;
  if (s.racks[0] && s.racks[0].x + GAME_DRONE_RACK_W * FP < 0) s.racks.shift();
  const last = s.racks.at(-1);
  if (!last || last.x <= (GAME_DRONE_W - GAME_DRONE_SPACING) * FP)
    s.racks.push(nextRack(s, (last?.x ?? GAME_DRONE_W * FP) + GAME_DRONE_SPACING * FP));
  const dx = GAME_DRONE_X * FP;
  const dw = GAME_DRONE_BOX_W * FP;
  const dh = GAME_DRONE_BOX_H * FP;
  for (const r of s.racks) {
    const rw = GAME_DRONE_RACK_W * FP;
    const top = (r.gapY - Math.floor(r.gap / 2)) * FP;
    const bottom = (r.gapY + Math.ceil(r.gap / 2)) * FP;
    if (
      overlaps(dx, s.y, dw, dh, r.x, 0, rw, top) ||
      overlaps(dx, s.y, dw, dh, r.x, bottom, rw, GAME_DRONE_H * FP - bottom)
    )
      return crash(s);
    const pk = 8 * FP;
    if (r.packet && overlaps(dx, s.y, dw, dh, r.x + (rw - pk) / 2, r.gapY * FP - pk / 2, pk, pk)) {
      r.packet = false;
      s.score += GAME_DRONE_PACKET_POINTS;
      pushFx(s.fx, {
        k: 'packet',
        x: Math.trunc((r.x + rw / 2) / FP),
        y: r.gapY,
        n: GAME_DRONE_PACKET_POINTS,
      });
    }
    if (!r.passed && r.x + rw < dx) {
      r.passed = true;
      s.passed++;
      s.score += GAME_DRONE_PASS_POINTS;
      s.speed = Math.min(GAME_DRONE_SPEED_MAX, s.speed + GAME_DRONE_SPEED_STEP);
      pushFx(s.fx, {
        k: 'pass',
        x: GAME_DRONE_X,
        y: Math.trunc(s.y / FP),
        n: GAME_DRONE_PASS_POINTS,
      });
    }
  }
}
