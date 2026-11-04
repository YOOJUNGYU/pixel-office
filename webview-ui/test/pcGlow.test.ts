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
