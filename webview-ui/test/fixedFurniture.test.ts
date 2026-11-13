// Fixed furniture (seats, desks, PCs, arcade cabinets) follows the bundled default.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';

import { isFixedFurniture, pinFixedFurniture } from '../../core/src/lan.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const def = JSON.parse(
  fs.readFileSync(path.join(here, '../public/assets/default-layout-1.json'), 'utf8'),
) as {
  cols: number;
  rows: number;
  furniture: { uid: string; type: string; col: number; row: number }[];
};

test('fixed types: seats, desks, tables, PCs, cabinets; decor is free', () => {
  for (const t of [
    'DESK_FRONT',
    'PC_SIDE:left',
    'PC_FRONT_OFF',
    'CUSHIONED_CHAIR_BACK',
    'SOFA_SIDE',
    'COFFEE_TABLE',
    'ARCADE_DRONE',
    'WOODEN_BENCH',
  ])
    assert.ok(isFixedFurniture(t), t);
  for (const t of ['COFFEE', 'LARGE_PLANT', 'CLOCK', 'DOUBLE_BOOKSHELF', 'WHITEBOARD'])
    assert.ok(!isFixedFurniture(t), t);
});

test('a saved layout gets the default seats/cabinets back; extras go; decor and colours stay', () => {
  const chair = def.furniture.find((f) => f.type === 'CUSHIONED_CHAIR_BACK')!;
  const desk = def.furniture.find((f) => f.type === 'DESK_FRONT')!;
  const color = { h: 10, s: 0, b: 0, c: 0 };
  const saved = {
    ...def,
    furniture: [
      ...def.furniture.filter((f) => f.uid !== chair.uid && f.uid !== desk.uid), // chair removed
      { ...desk, col: desk.col + 1, color }, // desk moved + recoloured
      { uid: 'extra', type: 'WOODEN_CHAIR_SIDE', col: 2, row: 2 }, // a chair not in the default
      { uid: 'mine', type: 'LARGE_PLANT', col: 3, row: 3 }, // decor
    ],
  };
  const out = pinFixedFurniture(saved, def).furniture as typeof saved.furniture;
  const byUid = new Map(out.map((f) => [f.uid, f]));
  assert.deepEqual(byUid.get(chair.uid), chair);
  assert.deepEqual(byUid.get(desk.uid), { ...desk, color });
  assert.ok(!byUid.has('extra'));
  assert.ok(byUid.has('mine'));
  const fixed = (l: { type: string }[]) => l.filter((f) => isFixedFurniture(f.type)).length;
  assert.equal(fixed(out), fixed(def.furniture));
});

test('another grid size is left alone', () => {
  const small = { cols: 10, rows: 10, furniture: [] };
  assert.equal(pinFixedFurniture(small, def), small);
});
