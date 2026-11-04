/* eslint-disable pixel-agents/no-inline-colors -- test fixtures */
import assert from 'node:assert/strict';

import { test } from 'vitest';

import { ACTS } from '../../core/src/lan.js';
import { PC_SCREEN_COLORS, PC_SCREEN_ORIGIN } from '../src/constants.js';
import { screenKind, SCREENS, screenSprite } from '../src/office/engine/pcScreens.js';

test('every screen frame is 10×5 and uses known colours', () => {
  for (const [kind, frames] of Object.entries(SCREENS))
    for (const f of frames) {
      assert.equal(f.length, 5, kind);
      for (const row of f) {
        assert.equal(row.length, 10, kind);
        for (const ch of row) assert.ok(ch in PC_SCREEN_COLORS, `${kind} ${ch}`);
      }
    }
});

test('acts map to screens; hidden work shows none', () => {
  assert.equal(screenKind({ act: 'edit' }), 'code');
  assert.equal(screenKind({ act: 'run' }), 'term');
  assert.equal(screenKind({ act: 'search' }), 'doc');
  assert.equal(screenKind({ act: 'edit', hidden: true }), null);
  for (const act of ACTS) screenKind({ act }); // total over every act
});

test('screenSprite paints only the screen area and caches per frame', () => {
  const base = Array.from({ length: 32 }, () => Array.from({ length: 16 }, () => '#777777'));
  const s = screenSprite(base, 'term', 0);
  assert.equal(s[PC_SCREEN_ORIGIN.y][PC_SCREEN_ORIGIN.x], PC_SCREEN_COLORS.b);
  assert.equal(s[0][0], '#777777');
  assert.equal(base[PC_SCREEN_ORIGIN.y][PC_SCREEN_ORIGIN.x], '#777777');
  assert.equal(screenSprite(base, 'term', 3), s); // frames loop
  assert.notEqual(screenSprite(base, 'term', 1), s);
});
