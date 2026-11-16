// Tower: what only the page sees of a run (camera glide, falling cut-offs, flashes). It
// reacts to the run's fx events and never touches the run, so replays are unaffected.
// No canvas here (tested in node).
import type { Fx } from '../../../../core/src/games/fx.js';
import type { TowerState } from '../../../../core/src/games/tower.js';
import {
  GAME_COLORS as C,
  GAME_HEADER_H,
  GAME_TOWER_CAMERA_RATE,
  GAME_TOWER_DEBRIS_DRIFT,
  GAME_TOWER_DEBRIS_GRAVITY,
  GAME_TOWER_FLASH_MS,
  GAME_TOWER_H,
  GAME_TOWER_RING_MS,
  GAME_TOWER_UNIT_H,
  GAME_TOWER_VIEW_FLOORS,
} from '../../constants.js';

const U = GAME_TOWER_UNIT_H;

/** px the view should be scrolled up by (the sliding unit stays in the upper part). */
export const towerCamera = (s: TowerState): number =>
  Math.max(0, (s.stack.length + 1 - GAME_TOWER_VIEW_FLOORS) * U);
/** Top of floor `i` without the camera (add the camera to get field px). */
export const worldY = (i: number): number => GAME_TOWER_H - (i + 1) * U;
export const unitColor = (i: number): string => C.brickRows[i % C.brickRows.length];
/** Fixed pseudo-random value per integer (LED patterns, stars). */
export const hash = (i: number): number => ((i * 2654435761) >>> 0) % 1000;

interface Debris {
  x: number;
  /** Top, world px (field px minus the camera). */
  y: number;
  w: number;
  vx: number;
  vy: number;
  color: string;
}

/** The page's own view of one run. */
export class TowerView {
  cam = 0;
  debris: Debris[] = [];
  /** Newest unit's flash / a perfect's ring, ms left. */
  flashMs = 0;
  ringMs = 0;

  /** A run event (the state is already past it). */
  onFx(s: TowerState, f: Fx): void {
    if (f.k === 'stack' || f.k === 'over') {
      const w = f.k === 'stack' ? f.n : s.w;
      const x = f.x - Math.floor(w / 2);
      // a cut-off piece drifts away from the stack's centre line
      const top = s.stack[Math.max(0, f.y - 1)];
      const side = x + w / 2 < top.x + top.w / 2 ? -1 : 1;
      this.debris.push({
        x,
        y: worldY(f.y),
        w,
        vx: side * GAME_TOWER_DEBRIS_DRIFT,
        vy: 0,
        color: unitColor(f.y),
      });
    }
    if (f.k === 'stack' || f.k === 'perfect') this.flashMs = GAME_TOWER_FLASH_MS;
    if (f.k === 'perfect') this.ringMs = GAME_TOWER_RING_MS;
  }

  update(s: TowerState, dt: number): void {
    const target = towerCamera(s);
    this.cam += (target - this.cam) * Math.min(1, dt * GAME_TOWER_CAMERA_RATE);
    if (Math.abs(target - this.cam) < 0.5) this.cam = target;
    for (const d of this.debris) {
      d.vy += GAME_TOWER_DEBRIS_GRAVITY * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
    }
    this.debris = this.debris.filter((d) => d.y + this.cam < GAME_TOWER_H + U);
    this.flashMs = Math.max(0, this.flashMs - dt);
    this.ringMs = Math.max(0, this.ringMs - dt);
  }

  /** Where an fx happens on screen (logical px). */
  at(f: Fx): [number, number] {
    return [f.x, GAME_HEADER_H + worldY(f.y) + Math.round(this.cam) + U / 2];
  }
}
