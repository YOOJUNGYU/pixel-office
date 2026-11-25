/**
 * Rooms panel model: the handover prompt and the member list.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { test } from 'vitest';

import type { OfficePersonMessage, OfficeSummary } from '../../core/src/messages.js';
import { handoverPrompt, members } from '../src/lan/roomsModel.js';

const room: OfficeSummary = { tag: 't', name: '개발팀', hostId: 'me', max: 12 };

test('handoverPrompt: null for a member, or when the room is not on screen', () => {
  assert.equal(handoverPrompt(room, 't'), null);
  assert.equal(handoverPrompt(undefined, 't'), null);
  assert.equal(handoverPrompt({ ...room, host: true, next: '홍길동' }, 'personal'), null);
});

test('handoverPrompt: the successor named, or the room closing when there is none', () => {
  assert.deepEqual(handoverPrompt({ ...room, host: true, next: '홍길동' }, 't'), {
    key: 'rooms.handover',
    next: '홍길동',
  });
  assert.deepEqual(handoverPrompt({ ...room, host: true, next: '' }, 't'), {
    key: 'rooms.handoverClose',
    next: '',
  });
  // An invite-code room (no room state, no successor) just stops being listed.
  assert.deepEqual(handoverPrompt({ tag: 't', name: '', host: true }, 't'), {
    key: 'rooms.handoverClose',
    next: '',
  });
});

const person = (peerId: string, account: string, self = false, nickname = '') =>
  ({ peerId, account, nickname, palette: 0, hueShift: 0, self }) as OfficePersonMessage;

test('members: label, host and me marked, in snapshot order', () => {
  assert.deepEqual(members([person('me', 'kim', true), person('x', 'lee', false, '영희')], room), [
    { peerId: 'me', label: 'kim', host: true, me: true },
    { peerId: 'x', label: 'lee (영희)', host: false, me: false },
  ]);
});
