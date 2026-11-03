// Snap zones for transcript dialogs (after PowerToys FancyZones): a layout of columns, each
// split into rows; Shift while dragging a dialog shows them, dropping fits it to one.
import {
  TRANSCRIPT_PANEL_TOP_PX,
  ZONE_AREA_BOTTOM_PX,
  ZONE_MAX,
  ZONE_MIN_FRAC,
  ZONE_SPACING_DEFAULT,
  ZONE_SPACING_MAX,
  ZONES_KEY,
} from '../constants.js';
import type { Rect } from './transcript.js';

/** Columns left to right (`w` = share of the width), each split top to bottom (`rows` = shares). */
export interface ZoneLayout {
  cols: Array<{ w: number; rows: number[] }>;
  /** Gap around and between zones, CSS px. */
  spacing: number;
}

export type Template = 'columns' | 'rows' | 'grid' | 'priority';
export const TEMPLATES: readonly Template[] = ['columns', 'rows', 'grid', 'priority'];

const even = (n: number): number[] => Array.from({ length: n }, () => 1 / n);

/** A template with `n` zones (1..ZONE_MAX). */
export function template(t: Template, n: number, spacing = ZONE_SPACING_DEFAULT): ZoneLayout {
  const count = Math.max(1, Math.min(ZONE_MAX, Math.round(n)));
  if (t === 'rows') return { cols: [{ w: 1, rows: even(count) }], spacing };
  if (t === 'columns') return { cols: even(count).map((w) => ({ w, rows: [1] })), spacing };
  if (t === 'priority' && count >= 3) {
    // A wide middle zone; the rest split between the two sides (left gets the extra one).
    const left = Math.ceil((count - 1) / 2);
    const right = count - 1 - left;
    return {
      cols: [
        { w: 0.25, rows: even(left) },
        { w: 0.5, rows: [1] },
        { w: 0.25, rows: even(right) },
      ],
      spacing,
    };
  }
  if (t === 'priority') return template('columns', count, spacing);
  // grid: as square as it gets, the first columns take the extra rows.
  const c = Math.ceil(Math.sqrt(count));
  const base = Math.floor(count / c);
  const extra = count % c;
  return {
    cols: even(c).map((w, i) => ({ w, rows: even(base + (i < extra ? 1 : 0)) })),
    spacing,
  };
}

export const DEFAULT_LAYOUT: ZoneLayout = template('columns', 2);

/** The zones' boxes inside `area`, column by column (top to bottom within one). */
export function zoneRects(layout: ZoneLayout, area: Rect): Rect[] {
  const s = layout.spacing;
  const out: Rect[] = [];
  const innerW = area.w - s * (layout.cols.length + 1);
  let x = area.x + s;
  for (const col of layout.cols) {
    const w = innerW * col.w;
    const innerH = area.h - s * (col.rows.length + 1);
    let y = area.y + s;
    for (const r of col.rows) {
      const h = innerH * r;
      out.push({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
      y += h + s;
    }
    x += w + s;
  }
  return out;
}

/** The zone under (x, y) — the nearest one when the point falls in a gap — or -1 outside. */
export function zoneAt(rects: Rect[], x: number, y: number, slack = 0): number {
  let best = -1;
  let bestD = Infinity;
  rects.forEach((r, i) => {
    const dx = Math.max(r.x - x, 0, x - (r.x + r.w));
    const dy = Math.max(r.y - y, 0, y - (r.y + r.h));
    const d = Math.hypot(dx, dy);
    if (d <= slack && d < bestD) [best, bestD] = [i, d];
  });
  return best;
}

/** The box covering every given one (zones spanned with Ctrl). */
export function unionRect(rects: Rect[]): Rect {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.w));
  const bottom = Math.max(...rects.map((r) => r.y + r.h));
  return { x, y, w: right - x, h: bottom - y };
}

/** Moves the border between share `i` and `i + 1` by `delta` (a share of the whole),
 *  keeping both at least ZONE_MIN_FRAC. */
export function moveDivider(shares: number[], i: number, delta: number): number[] {
  const out = [...shares];
  const sum = out[i] + out[i + 1];
  const a = Math.min(sum - ZONE_MIN_FRAC, Math.max(ZONE_MIN_FRAC, out[i] + delta));
  out[i] = a;
  out[i + 1] = sum - a;
  return out;
}

const count = (l: ZoneLayout) => l.cols.reduce((n, c) => n + c.rows.length, 0);

/** Zone `row` of column `col` split in two rows (no-op at ZONE_MAX or when too small). */
export function splitRow(l: ZoneLayout, col: number, row: number): ZoneLayout {
  const c = l.cols[col];
  if (count(l) >= ZONE_MAX || c.rows[row] / 2 < ZONE_MIN_FRAC) return l;
  const rows = c.rows.flatMap((r, i) => (i === row ? [r / 2, r / 2] : [r]));
  return { ...l, cols: l.cols.map((x, i) => (i === col ? { ...x, rows } : x)) };
}

/** Column `col` split in two side by side (each keeps its rows). */
export function splitCol(l: ZoneLayout, col: number): ZoneLayout {
  const c = l.cols[col];
  if (count(l) + c.rows.length > ZONE_MAX || c.w / 2 < ZONE_MIN_FRAC) return l;
  const half = { w: c.w / 2, rows: [...c.rows] };
  return { ...l, cols: l.cols.flatMap((x, i) => (i === col ? [half, { ...half }] : [x])) };
}

/** Zone `row` of column `col` removed: its share goes to a neighbour (the last zone stays). */
export function removeZone(l: ZoneLayout, col: number, row: number): ZoneLayout {
  if (count(l) <= 1) return l;
  const c = l.cols[col];
  if (c.rows.length > 1) {
    const rows = [...c.rows];
    const [gone] = rows.splice(row, 1);
    rows[Math.min(row, rows.length - 1)] += gone;
    return { ...l, cols: l.cols.map((x, i) => (i === col ? { ...x, rows } : x)) };
  }
  const cols = [...l.cols];
  const [gone] = cols.splice(col, 1);
  const n = Math.min(col, cols.length - 1);
  cols[n] = { ...cols[n], w: cols[n].w + gone.w };
  return { ...l, cols };
}

const isShares = (v: unknown): v is number[] =>
  Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'number' && x > 0);
const norm = (xs: number[]) => {
  const sum = xs.reduce((a, b) => a + b, 0);
  return xs.map((x) => x / sum);
};

/** A saved layout, validated (shares re-normalised); anything malformed → undefined. */
export function parseLayout(v: unknown): ZoneLayout | undefined {
  const o = v as { cols?: unknown; spacing?: unknown } | null;
  if (!o || !Array.isArray(o.cols) || o.cols.length === 0) return undefined;
  const cols = o.cols as Array<{ w?: unknown; rows?: unknown }>;
  const ws = cols.map((c) => c?.w);
  if (!isShares(ws) || !cols.every((c) => isShares(c.rows))) return undefined;
  const layout: ZoneLayout = {
    cols: norm(ws).map((w, i) => ({ w, rows: norm(cols[i].rows as number[]) })),
    spacing:
      typeof o.spacing === 'number'
        ? Math.max(0, Math.min(ZONE_SPACING_MAX, Math.round(o.spacing)))
        : ZONE_SPACING_DEFAULT,
  };
  return count(layout) <= ZONE_MAX ? layout : undefined;
}

export function loadLayout(): ZoneLayout {
  try {
    return parseLayout(JSON.parse(localStorage.getItem(ZONES_KEY) ?? 'null')) ?? DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function saveLayout(l: ZoneLayout): void {
  try {
    localStorage.setItem(ZONES_KEY, JSON.stringify(l));
  } catch {
    // blocked: the layout just is not kept
  }
}

/** What the zones split: the window below the top-left buttons, above the bottom toolbar. */
export function zoneArea(): Rect {
  // DOM-free typing: this module also loads under Node (tests).
  const win = globalThis as unknown as { innerWidth: number; innerHeight: number };
  const y = TRANSCRIPT_PANEL_TOP_PX;
  return {
    x: 0,
    y,
    w: win.innerWidth,
    h: Math.max(0, win.innerHeight - y - ZONE_AREA_BOTTOM_PX),
  };
}
