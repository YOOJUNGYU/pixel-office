// Pure layout for the usage window's SVG charts: integer pixel boxes only (crisp edges).
import type { UsageDay } from '../../../core/src/messages.js';

type Tally = Omit<UsageDay, 'day'>;

export interface Bar {
  x: number;
  w: number;
  segs: Array<{ y: number; h: number; key: string }>;
}

/** One stacked bar per day, `keys` stacked from the floor up; the tallest day is `height`.
 *  Heights are rounded cumulatively, so a bar's segments always add up to its rounded total. */
export function stackedBars(
  days: UsageDay[],
  keys: Array<keyof Tally>,
  width: number,
  height: number,
): { bars: Bar[]; max: number } {
  const sum = (d: UsageDay) => keys.reduce((s, k) => s + d[k], 0);
  const max = days.reduce((m, d) => Math.max(m, sum(d)), 0);
  const n = days.length;
  const bars = days.map((d, i) => {
    const x = Math.round((i * width) / n);
    const slot = Math.round(((i + 1) * width) / n) - x;
    const gap = Math.min(2, Math.floor(slot / 4));
    const segs: Bar['segs'] = [];
    let acc = 0;
    let prev = 0;
    for (const key of keys) {
      acc += d[key];
      const top = max ? Math.round((acc / max) * height) : 0;
      if (top > prev) segs.push({ y: height - top, h: top - prev, key });
      prev = top;
    }
    return { x, w: Math.max(1, slot - gap), segs };
  });
  return { bars, max };
}

/** Horizontal bars: the largest value spans `width`. */
export function hbars(
  rows: Array<{ name: string; value: number }>,
  width: number,
): Array<{ name: string; w: number; value: number }> {
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0);
  return rows.map((r) => ({
    name: r.name,
    value: r.value,
    w: max ? Math.round((r.value / max) * width) : 0,
  }));
}

/** One 100% bar split by share; segment widths sum exactly to `width` (cumulative rounding). */
export function shareBar(
  rows: Array<{ name: string; value: number }>,
  width: number,
): Array<{ name: string; x: number; w: number; pct: number }> {
  const live = rows.filter((r) => r.value > 0);
  const total = live.reduce((s, r) => s + r.value, 0);
  if (!total) return [];
  let acc = 0;
  return live.map((r) => {
    const x = Math.round((acc / total) * width);
    acc += r.value;
    const end = Math.round((acc / total) * width);
    return { name: r.name, x, w: end - x, pct: Math.round((r.value / total) * 100) };
  });
}

/** Cache hit rate: cacheRead / (cacheRead + input + cacheCreate) in %, '—' when nothing was read in. */
export function hitRate(x: Pick<Tally, 'input' | 'cacheCreate' | 'cacheRead'>): string {
  const d = x.cacheRead + x.input + x.cacheCreate;
  return d ? `${String(Math.round((x.cacheRead / d) * 100))}%` : '—';
}
