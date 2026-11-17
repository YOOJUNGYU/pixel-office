// Size of the panels under the top-left buttons (📊 usage, ? manual): their top-left stays
// put, so only the right edge, the bottom edge and the bottom-right corner resize them.
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import {
  USAGE_PANEL_DEFAULT_H_PX,
  USAGE_PANEL_DEFAULT_W_PX,
  USAGE_PANEL_MARGIN_PX,
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
export function storedSize(key = USAGE_PANEL_SIZE_KEY, def: Size = DEFAULT): Size {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null') as Size | null;
    return v && Number.isFinite(v.w) && Number.isFinite(v.h) ? { w: v.w, h: v.h } : def;
  } catch {
    return def;
  }
}

export function storeSize(s: Size, key = USAGE_PANEL_SIZE_KEY): void {
  try {
    localStorage.setItem(key, JSON.stringify(s));
  } catch {
    // private window: the size is just not remembered
  }
}

export interface Box {
  ref: React.RefObject<HTMLDivElement | null>;
  size: Size;
  start: (which: Grip, e: React.PointerEvent) => void;
}

/** The panel's size: remembered per viewer (`key`), kept inside the viewport (also when it
 *  shrinks). */
export function useResizable(key: string, def?: Size): Box {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<Size>(() => storedSize(key, def));
  const room = (): Size => {
    const r = ref.current?.getBoundingClientRect();
    return {
      w: window.innerWidth - (r?.left ?? 0) - USAGE_PANEL_MARGIN_PX,
      h: window.innerHeight - (r?.top ?? 0) - USAGE_PANEL_MARGIN_PX,
    };
  };
  useEffect(() => {
    const fit = () => setSize((s) => clampSize(s, room()));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  const start = (which: Grip, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const from = { x: e.clientX, y: e.clientY };
    const base = size;
    const max = room();
    let last = base;
    const move = (ev: PointerEvent) => {
      last = dragSize(base, which, ev.clientX - from.x, ev.clientY - from.y, max);
      setSize(last);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      storeSize(last, key);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  return { ref, size, start };
}
