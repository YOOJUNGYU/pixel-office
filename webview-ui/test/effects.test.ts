import assert from 'node:assert/strict';

import { test } from 'vitest';

import type { OfficeAgent } from '../../core/src/lan.js';
import { effectTriggers } from '../src/lan/effects.js';

const ag = (over: Partial<OfficeAgent> = {}): OfficeAgent =>
  ({
    key: 'p:s1',
    id: 's1',
    provider: 'claude',
    kind: 'main',
    num: 1,
    room: 'coding',
    permission: false,
    act: 'edit',
    target: 'a.ts',
    reason: '',
    peer: { id: 'p', account: 'a', nickname: '', palette: 0, hueShift: 0 },
    ...over,
  }) as OfficeAgent;
const run = (p: OfficeAgent, n: OfficeAgent) => effectTriggers(new Map([[p.key, p]]), [n]);

test('a newcomer is only the baseline', () => {
  assert.deepEqual(effectTriggers(new Map(), [ag({ diff: { add: 9, del: 0 }, fail: true })]), []);
});

test('+N from the diff growth; nothing when it did not grow', () => {
  assert.deepEqual(run(ag({ diff: { add: 3, del: 1 } }), ag({ diff: { add: 15, del: 4 } })), [
    { key: 'p:s1', kind: 'plus', text: '+12 −3' },
  ]);
  assert.deepEqual(run(ag({ diff: { add: 3, del: 1 } }), ag({ diff: { add: 3, del: 1 } })), []);
});

test('smoke on a fresh failure only', () => {
  assert.deepEqual(run(ag(), ag({ fail: true })), [{ key: 'p:s1', kind: 'smoke' }]);
  assert.deepEqual(run(ag({ fail: true }), ag({ fail: true })), []);
});

test('celebration: a list finishing, or a main turn ending; not a child, not hidden', () => {
  const todo = (done: number) => ({ todo: { done, total: 3 } });
  assert.deepEqual(run(ag(todo(2)), ag(todo(3))), [{ key: 'p:s1', kind: 'confetti' }]);
  assert.deepEqual(run(ag(todo(3)), ag(todo(3))), []);
  assert.deepEqual(run(ag(), ag({ act: 'idle', target: '' })), [{ key: 'p:s1', kind: 'confetti' }]);
  assert.deepEqual(run(ag({ kind: 'subagent' }), ag({ kind: 'subagent', act: 'idle' })), []);
  assert.deepEqual(run(ag(), ag({ act: 'idle', hidden: true })), []);
});

test('a quiet agent triggers no effects (no +N, smoke or confetti)', () => {
  const q = { quiet: true as const };
  assert.deepEqual(run(ag({ ...q }), ag({ ...q, act: 'idle' })), []);
  assert.deepEqual(run(ag({ ...q }), ag({ ...q, fail: true, diff: { add: 2, del: 0 } })), []);
});

test('box on a new big result; newcomer and unchanged emit none', () => {
  const big = (n: number) => ({ tokens: 9, rate: 0, big: { n, last: 82_000 } });
  assert.deepEqual(run(ag({ usage: big(1) }), ag({ usage: big(2) })), [
    { key: 'p:s1', kind: 'box', text: '📦 +82k' },
  ]);
  assert.deepEqual(run(ag({ usage: big(2) }), ag({ usage: big(2) })), []);
  assert.deepEqual(effectTriggers(new Map(), [ag({ usage: big(2) })]), []);
});
