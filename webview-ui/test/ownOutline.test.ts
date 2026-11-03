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
  assert.equal(ownOutlined(a, all, new Set()), false);
  assert.equal(ownOutlined(avatar, all, new Set()), false);
  assert.equal(ownOutlined(a, all, new Set([2])), true);
  assert.equal(ownOutlined(b, all, new Set([2])), false);
  assert.equal(ownOutlined(avatar, all, new Set([2])), false);
  // Folded into the lounge (no character): my avatar stands in for it.
  assert.equal(ownOutlined(avatar, all, new Set([9])), true);
  assert.equal(ownOutlined(a, all, new Set([9])), false);
  // Several open at once: each of them, and my avatar for a folded one.
  assert.equal(ownOutlined(a, all, new Set([2, 3])), true);
  assert.equal(ownOutlined(b, all, new Set([2, 3])), true);
  assert.equal(ownOutlined(avatar, all, new Set([2, 3])), false);
  assert.equal(ownOutlined(avatar, all, new Set([2, 9])), true);
});
