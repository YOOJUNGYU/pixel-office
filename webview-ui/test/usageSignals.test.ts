import assert from 'node:assert/strict';

import { test } from 'vitest';

import type { AgentUsage } from '../../core/src/lan.js';
import {
  bigTrigger,
  burnTier,
  modelFamily,
  modelLabel,
  sizeTier,
  tokensText,
} from '../src/lan/usageSignals.js';

const u = (tokens: number, rate = 0, big?: AgentUsage['big']): AgentUsage => ({
  tokens,
  rate,
  ...(big ? { big } : {}),
});

test('sizeTier boundaries', () => {
  assert.equal(sizeTier(undefined), 1);
  assert.equal(sizeTier(u(299_999)), 1);
  assert.equal(sizeTier(u(300_000)), 1.5);
  assert.equal(sizeTier(u(999_999)), 1.5);
  assert.equal(sizeTier(u(1_000_000)), 2);
});

test('burnTier boundaries', () => {
  assert.equal(burnTier(undefined), 0);
  assert.equal(burnTier(u(0, 14_999)), 0);
  assert.equal(burnTier(u(0, 15_000)), 1);
  assert.equal(burnTier(u(0, 40_000)), 2);
  assert.equal(burnTier(u(0, 75_000)), 3);
});

test('tokensText rounds to one decimal; 1_000 is "1.0k" (no trailing-zero trimming)', () => {
  assert.equal(tokensText(999), '999');
  assert.equal(tokensText(1_000), '1.0k');
  assert.equal(tokensText(1_234), '1.2k');
  assert.equal(tokensText(1_250_000), '1.3M');
});

test('model family and label', () => {
  assert.equal(modelFamily('claude-opus-4-7'), 'opus');
  assert.equal(modelFamily('Claude-Sonnet-5'), 'sonnet');
  assert.equal(modelFamily('claude-haiku-4'), 'haiku');
  assert.equal(modelFamily('gpt-5-codex'), null);
  assert.equal(modelFamily(undefined), null);
  assert.equal(modelLabel('claude-opus-4-7'), 'Opus');
  assert.equal(modelLabel('gpt-5-codex'), '');
});

test('bigTrigger fires on a new big result only', () => {
  const prev = u(1, 0, { n: 1, last: 60_000 });
  assert.equal(bigTrigger(prev, u(1, 0, { n: 2, last: 82_000 })), 82_000);
  assert.equal(bigTrigger(prev, u(1, 0, { n: 1, last: 60_000 })), null);
  assert.equal(bigTrigger(undefined, u(1, 0, { n: 2, last: 82_000 })), null);
  assert.equal(bigTrigger(prev, undefined), null);
  assert.equal(bigTrigger(u(1), u(1, 0, { n: 1, last: 50_000 })), 50_000);
});
