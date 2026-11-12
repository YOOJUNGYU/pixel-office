/**
 * Burn border / flame aura around my agents (token burn rate): pure sprite builder.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { test } from 'vitest';

import { USAGE_FLAME_FIRE } from '../src/constants.js';
import { BURN_FRAMES, burnAuraSprite } from '../src/office/engine/burnAura.js';
import type { SpriteData } from '../src/office/types.js';

/** 8×10 opaque block. */
const block: SpriteData = Array.from({ length: 10 }, () =>
  Array<string>(8).fill(USAGE_FLAME_FIRE[0]),
);

const count = (d: SpriteData) => d.flat().filter(Boolean).length;
/** Highest non-empty row, in sprite coordinates (negative = above the sprite). */
const topRow = ({ data, pad }: { data: SpriteData; pad: number }) =>
  data.findIndex((row) => row.some(Boolean)) - pad;

test('tier 1: a 1-px 4-neighbour ring, never on the body', () => {
  const { data, pad } = burnAuraSprite(block, 1, 0);
  assert.equal(count(data), 2 * (8 + 10));
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 8; x++) assert.equal(data[y + pad][x + pad], '', `body pixel ${x},${y}`);
  assert.equal(data[pad - 1][pad - 1], '', 'no corner');
});

test('flames: tier 3 rises above tier 2, which rises above tier 1', () => {
  const t1 = topRow(burnAuraSprite(block, 1, 0));
  for (let f = 0; f < BURN_FRAMES; f++) {
    const t2 = topRow(burnAuraSprite(block, 2, f));
    const t3 = topRow(burnAuraSprite(block, 3, f));
    assert.ok(t2 < t1, `frame ${f}: tier 2 ${t2} vs tier 1 ${t1}`);
    assert.ok(t3 < t2, `frame ${f}: tier 3 ${t3} vs tier 2 ${t2}`);
  }
});

test('deterministic and cached; frames differ', () => {
  const a = burnAuraSprite(block, 3, 0);
  assert.equal(burnAuraSprite(block, 3, 0), a, 'cached');
  const copy = block.map((r) => [...r]);
  assert.deepEqual(burnAuraSprite(copy, 3, 0).data, a.data, 'same input → same pixels');
  assert.notDeepEqual(burnAuraSprite(block, 3, 1).data, a.data);
  assert.equal(burnAuraSprite(block, 1, 0), burnAuraSprite(block, 1, 5), 'tier 1 is static');
});
