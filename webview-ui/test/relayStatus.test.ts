import assert from 'node:assert/strict';

import { test } from 'vitest';

import { relayStatusView } from '../src/lan/relayStatus.js';

const tenAm = new Date(2026, 10, 6, 10, 0).getTime();
const HOUR = 3_600_000;

test('off → no chip', () => {
  assert.equal(relayStatusView({ state: 'off' }, tenAm), null);
});

test('connected → ok; connecting → muted', () => {
  assert.deepEqual(relayStatusView({ state: 'connected' }, tenAm), {
    key: 'relay.connected',
    tone: 'ok',
  });
  assert.equal(relayStatusView({ state: 'connecting' }, tenAm)?.tone, 'muted');
});

test('budget / kicked → warn until the retry time, local HH:MM', () => {
  assert.deepEqual(relayStatusView({ state: 'budget', retryInMs: HOUR }, tenAm), {
    key: 'relay.budget',
    tone: 'warn',
    until: '11:00',
  });
  assert.deepEqual(relayStatusView({ state: 'kicked', retryInMs: HOUR + 5 * 60_000 }, tenAm), {
    key: 'relay.kicked',
    tone: 'warn',
    until: '11:05',
  });
  assert.equal(relayStatusView({ state: 'budget' }, tenAm)?.until, undefined);
});

test('full / error → warn, no time', () => {
  assert.deepEqual(relayStatusView({ state: 'full', retryInMs: HOUR }, tenAm), {
    key: 'relay.full',
    tone: 'warn',
  });
  assert.deepEqual(relayStatusView({ state: 'error' }, tenAm), {
    key: 'relay.error',
    tone: 'warn',
  });
});
