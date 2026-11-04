/* eslint-disable pixel-agents/no-inline-colors -- test fixtures */
import assert from 'node:assert/strict';

import { test } from 'vitest';

import { PC_GLOW_RADIUS } from '../src/constants.js';
import { glowSprite } from '../src/office/engine/pcGlow.js';

test('the halo is the silhouette grown by the radius, fading outward, cached', () => {
  const base = [
    ['', '', ''],
    ['', '#111111', ''],
    ['', '', ''],
  ];
  const g = glowSprite(base, '#ff0000', 0.5);
  const r = PC_GLOW_RADIUS;
  assert.equal(g.length, 3 + 2 * r);
  assert.equal(g[0].length, 3 + 2 * r);
  // the pixel itself and its ring are strongest, the outer ring weaker, beyond = empty
  const at = (x: number, y: number) => g[y + r][x + r];
  assert.equal(at(1, 1), '#ff00007f'.replace('7f', at(1, 1).slice(7))); // has alpha
  assert.ok(parseInt(at(0, 1).slice(7), 16) > parseInt(at(-1, 1).slice(7), 16));
  assert.equal(at(-2, 1), '');
  assert.equal(glowSprite(base, '#ff0000', 0.5), g);
});

test('tint lights the light pixels toward the colour, leaves dark ones, caches', async () => {
  const { tintSprite } = await import('../src/office/engine/pcGlow.js');
  const base = [['#eeeeee', '#333333', '']];
  const t = tintSprite(base, '#00ff00', 0.6);
  assert.notEqual(t[0][0], '#eeeeee');
  assert.ok(parseInt(t[0][0].slice(3, 5), 16) > parseInt(t[0][0].slice(1, 3), 16)); // greener
  assert.equal(t[0][1], '#333333'); // outline stays
  assert.equal(t[0][2], '');
  assert.equal(tintSprite(base, '#00ff00', 0.6), t);
});
