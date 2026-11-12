import assert from 'node:assert/strict';

import { test } from 'vitest';

import type { UsageDay } from '../../core/src/messages.js';
import { hbars, hitRate, shareBar, stackedBars } from '../src/lan/usageCharts.js';

const day = (d: string, input: number, output: number, cacheCreate: number): UsageDay => ({
  day: d,
  input,
  output,
  cacheCreate,
  cacheRead: 0,
});

const isInt = (n: number) => Number.isInteger(n);

test('stackedBars: one bar per day, zero day has no segs, tallest fills the height', () => {
  const days = [
    day('2026-11-06', 100, 50, 7),
    day('2026-11-07', 0, 0, 0),
    day('2026-11-08', 300, 120, 33),
    day('2026-11-09', 10, 1, 1),
    day('2026-11-10', 999, 333, 111),
    day('2026-11-11', 5, 5, 5),
    day('2026-11-12', 1, 0, 0),
  ];
  const { bars, max } = stackedBars(days, ['input', 'output', 'cacheCreate'], 203, 80);
  assert.equal(bars.length, 7);
  assert.equal(max, 999 + 333 + 111);
  assert.deepEqual(bars[1].segs, []);
  const heights = bars.map((b) => b.segs.reduce((s, g) => s + g.h, 0));
  assert.equal(Math.max(...heights), 80);
  for (const b of bars) {
    assert.ok(isInt(b.x) && isInt(b.w));
    for (const g of b.segs) assert.ok(isInt(g.y) && isInt(g.h) && g.h > 0);
  }
  // segments stack upward without gaps: the bottom one ends at the chart floor
  for (const b of bars)
    if (b.segs.length) assert.equal(b.segs[0].y + b.segs[0].h, 80, 'first seg sits on the floor');
});

test('stackedBars: all zero → max 0, no segs', () => {
  const { bars, max } = stackedBars([day('a', 0, 0, 0)], ['input'], 10, 10);
  assert.equal(max, 0);
  assert.deepEqual(bars[0].segs, []);
});

test('shareBar: widths are integers summing exactly to width', () => {
  const r = shareBar(
    [
      { name: 'a', value: 3 },
      { name: 'b', value: 1 },
    ],
    101,
  );
  assert.deepEqual(
    r.map((s) => s.w),
    [76, 25],
  );
  assert.equal(r[1].x, 76);
  assert.equal(r[0].pct, 75);
  const odd = shareBar(
    [1, 1, 1].map((value, i) => ({ name: String(i), value })),
    100,
  );
  assert.equal(
    odd.reduce((s, x) => s + x.w, 0),
    100,
  );
});

test('shareBar: nothing to share → empty', () => {
  assert.deepEqual(shareBar([{ name: 'a', value: 0 }], 50), []);
});

test('hbars: the largest row fills the width', () => {
  const r = hbars(
    [
      { name: 'x', value: 10 },
      { name: 'y', value: 40 },
      { name: 'z', value: 1 },
    ],
    120,
  );
  assert.equal(r[1].w, 120);
  assert.equal(r[0].w, 30);
  for (const row of r) assert.ok(isInt(row.w));
});

test('hitRate: cacheRead over everything read in, dash when empty', () => {
  assert.equal(hitRate({ input: 5, cacheCreate: 5, cacheRead: 90 }), '90%');
  assert.equal(hitRate({ input: 0, cacheCreate: 0, cacheRead: 0 }), '—');
});
