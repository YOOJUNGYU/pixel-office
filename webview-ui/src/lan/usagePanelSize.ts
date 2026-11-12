// Size of the usage panel (📊): its top-left stays under the top-left buttons, so only the
// right edge, the bottom edge and the bottom-right corner resize it.
import {
  USAGE_PANEL_DEFAULT_H_PX,
  USAGE_PANEL_DEFAULT_W_PX,
  USAGE_PANEL_MIN_H_PX,
  USAGE_PANEL_MIN_W_PX,
  USAGE_PANEL_SIZE_KEY,
} from '../constants.js';

export type Grip = 'right' | 'bottom' | 'corner';
export interface Size {
  w: number;
  h: number;
}

const clamp = (v: number, min: number, max: number): number =>
  Math.round(Math.max(Math.min(min, max), Math.min(v, max)));

/** Within the minimum and `max` (the room left to the viewport edge); `max` wins when the
 *  viewport is smaller than the minimum. */
export function clampSize(s: Size, max: Size): Size {
  return {
    w: clamp(s.w, USAGE_PANEL_MIN_W_PX, max.w),
    h: clamp(s.h, USAGE_PANEL_MIN_H_PX, max.h),
  };
}

/** The size after dragging `grip` by (dx, dy) from `start`. */
export function dragSize(start: Size, grip: Grip, dx: number, dy: number, max: Size): Size {
  return clampSize(
    {
      w: grip === 'bottom' ? start.w : start.w + dx,
      h: grip === 'right' ? start.h : start.h + dy,
    },
    max,
  );
}

const DEFAULT: Size = { w: USAGE_PANEL_DEFAULT_W_PX, h: USAGE_PANEL_DEFAULT_H_PX };

/** The last size this viewer left the panel at, else the default. */
export function storedSize(): Size {
  try {
    const v = JSON.parse(localStorage.getItem(USAGE_PANEL_SIZE_KEY) ?? 'null') as Size | null;
    return v && Number.isFinite(v.w) && Number.isFinite(v.h) ? { w: v.w, h: v.h } : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function storeSize(s: Size): void {
  try {
    localStorage.setItem(USAGE_PANEL_SIZE_KEY, JSON.stringify(s));
  } catch {
    // private window: the size is just not remembered
  }
}
