import assert from 'node:assert/strict';

import { test } from 'vitest';

import { ownOutlined } from '../src/office/engine/ownOutline.js';
import type { Character } from '../src/office/types.js';

const ch = (id: number, avatarOf?: string) => ({ id, peerId: 'me', avatarOf }) as Character;

test('ownOutlined lights only my character whose transcript is open', () => {
  const avatar = ch(1, 'me');
  const a = ch(2);
  const b = ch(3);
  const all = [avatar, a, b];
  assert.equal(ownOutlined(a, all, null), false);
  assert.equal(ownOutlined(avatar, all, null), false);
  assert.equal(ownOutlined(a, all, 2), true);
  assert.equal(ownOutlined(b, all, 2), false);
  assert.equal(ownOutlined(avatar, all, 2), false);
  // Folded into the lounge (no character): my avatar stands in for it.
  assert.equal(ownOutlined(avatar, all, 9), true);
  assert.equal(ownOutlined(a, all, 9), false);
});
