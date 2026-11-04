/* eslint-disable pixel-agents/no-inline-colors -- test fixtures */
import assert from 'node:assert/strict';

import { test } from 'vitest';

import { SERVER_LED_PATTERNS, SERVER_LED_PIXELS } from '../src/constants.js';
import { ledMask, ledSprite } from '../src/office/engine/serverLeds.js';

const base = Array.from({ length: 32 }, () => Array.from({ length: 16 }, () => '#111111'));

test('ledSprite lights the LED pixels, caches per mask, leaves the base alone', () => {
  const all = (1 << SERVER_LED_PIXELS.length) - 1;
  const lit = ledSprite(base, all);
  for (const led of SERVER_LED_PIXELS) assert.equal(lit[led.y][led.x], led.color);
  assert.equal(base[SERVER_LED_PIXELS[0].y][SERVER_LED_PIXELS[0].x], '#111111');
  assert.equal(ledSprite(base, all), lit); // same object: sprite caches stay warm
  assert.equal(ledSprite(base, 0), base);
});

test('ledMask follows the patterns and differs between neighbouring PCs', () => {
  const len = SERVER_LED_PATTERNS[0].length;
  const seq = (col: number, row: number) =>
    Array.from({ length: len }, (_, f) => ledMask(col, row, f)).join(',');
  assert.notEqual(seq(10, 5), seq(12, 5));
  assert.ok(
    seq(10, 5)
      .split(',')
      .some((m) => m !== '0'),
  );
  assert.equal(ledMask(10, 5, 3), ledMask(10, 5, 3 + len * SERVER_LED_PATTERNS[1].length));
});
