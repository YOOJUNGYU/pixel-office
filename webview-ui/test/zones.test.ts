import assert from 'node:assert/strict';

import { test } from 'vitest';

import {
  moveDivider,
  parseLayout,
  removeZone,
  splitCol,
  splitRow,
  template,
  unionRect,
  zoneAt,
  zoneRects,
} from '../src/lan/zones.js';

const area = { x: 0, y: 0, w: 1000, h: 600 };
const n = (l: ReturnType<typeof template>) => l.cols.reduce((k, c) => k + c.rows.length, 0);

test('templates: columns, rows, grid, priority give the asked zone count', () => {
  assert.deepEqual(
    template('columns', 3, 0).cols.map((c) => c.rows.length),
    [1, 1, 1],
  );
  assert.deepEqual(
    template('rows', 2, 0).cols.map((c) => c.rows.length),
    [2],
  );
  assert.deepEqual(
    template('grid', 5, 0).cols.map((c) => c.rows.length),
    [2, 2, 1],
  );
  assert.deepEqual(
    template('priority', 5, 0).cols.map((c) => c.w),
    [0.25, 0.5, 0.25],
  );
  for (const t of ['columns', 'rows', 'grid', 'priority'] as const)
    for (let k = 1; k <= 12; k++) assert.equal(n(template(t, k)), k, `${t} ${k}`);
  assert.equal(n(template('grid', 99)), 12);
});

test('zoneRects: spacing around and between, filling the area', () => {
  const r = zoneRects(template('columns', 2, 10), area);
  assert.deepEqual(r, [
    { x: 10, y: 10, w: 485, h: 580 },
    { x: 505, y: 10, w: 485, h: 580 },
  ]);
});

test('zoneAt: inside, in the gap within slack, outside', () => {
  const r = zoneRects(template('columns', 2, 10), area);
  assert.equal(zoneAt(r, 100, 100), 0);
  assert.equal(zoneAt(r, 600, 100), 1);
  assert.equal(zoneAt(r, 499, 100, 24), 0);
  assert.equal(zoneAt(r, 499, 100), -1);
  assert.equal(zoneAt(r, 5000, 5000, 24), -1);
});

test('unionRect spans zones', () => {
  const r = zoneRects(template('columns', 2, 10), area);
  assert.deepEqual(unionRect(r), { x: 10, y: 10, w: 980, h: 580 });
});

test('moveDivider keeps both sides ≥ the minimum and the sum', () => {
  assert.deepEqual(moveDivider([0.5, 0.5], 0, 0.2), [0.7, 0.30000000000000004]);
  const [a, b] = moveDivider([0.5, 0.5], 0, 0.9);
  assert.ok(Math.abs(b - 0.1) < 1e-9 && Math.abs(a + b - 1) < 1e-9);
});

test('split / remove zones', () => {
  const l = template('columns', 2, 0);
  assert.deepEqual(splitRow(l, 0, 0).cols[0].rows, [0.5, 0.5]);
  assert.equal(splitCol(l, 1).cols.length, 3);
  assert.equal(removeZone(l, 1, 0).cols.length, 1);
  assert.equal(removeZone(template('columns', 1, 0), 0, 0).cols.length, 1); // the last stays
  const rows = removeZone(template('rows', 3, 0), 0, 1).cols[0].rows;
  assert.equal(rows.length, 2);
  assert.ok(Math.abs(rows[0] + rows[1] - 1) < 1e-9);
  assert.equal(n(splitRow(template('grid', 12, 0), 0, 0)), 12); // capped
});

test('parseLayout validates a saved layout', () => {
  assert.deepEqual(
    parseLayout({
      cols: [
        { w: 2, rows: [1] },
        { w: 2, rows: [1, 3] },
      ],
      spacing: 99,
    }),
    {
      cols: [
        { w: 0.5, rows: [1] },
        { w: 0.5, rows: [0.25, 0.75] },
      ],
      spacing: 32,
    },
  );
  assert.equal(parseLayout(null), undefined);
  assert.equal(parseLayout({ cols: [] }), undefined);
  assert.equal(parseLayout({ cols: [{ w: 1, rows: [-1] }] }), undefined);
});
