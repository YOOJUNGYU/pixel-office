import { describe, expect, it } from 'vitest';

import { cacheChipText, limitPace, spanText, windowName } from '../src/lan/usageLimits.js';

const H5 = 300;
const lim = (usedPct: number, goneSec: number, windowMin = H5) => ({
  provider: 'codex' as const,
  windowMin,
  usedPct,
  resetsInSec: windowMin * 60 - goneSec,
  ageSec: 0,
});

describe('limitPace', () => {
  it('even spend: delta 0, no forecast', () => {
    expect(limitPace(lim(50, 9000))).toEqual({ delta: 0, hitInSec: null });
  });
  it('fast spend: ahead, and the 100 % time before the reset', () => {
    // 80 % used after 1 h of 5 h: 20 % more takes 15 min at that pace
    expect(limitPace(lim(80, 3600))).toEqual({ delta: 60, hitInSec: 900 });
  });
  it('slow spend: behind, no forecast', () => {
    expect(limitPace(lim(10, 9000))).toEqual({ delta: -40, hitInSec: null });
  });
  it('too early to tell, and already at 100 %', () => {
    expect(limitPace(lim(30, 60))).toEqual({ delta: null, hitInSec: null });
    expect(limitPace(lim(100, 60))).toEqual({ delta: null, hitInSec: 0 });
  });
});

describe('texts', () => {
  it('window names and spans', () => {
    expect(windowName(300)).toMatch(/5/);
    expect(windowName(10080)).toMatch(/7/);
    expect(spanText(30)).toMatch(/1/);
    expect(spanText(3 * 86400 + 7200)).toMatch(/3.*2/);
  });
  it('cache chip: my waiting main only, m:ss', () => {
    const a = {
      kind: 'main' as const,
      act: 'idle' as const,
      permission: false,
      usage: { tokens: 1, rate: 0, cache: 263 },
    };
    expect(cacheChipText(a)).toBe('❄ 4:23');
    expect(cacheChipText({ ...a, act: 'edit' })).toBe('');
    expect(cacheChipText({ ...a, act: 'edit', permission: true })).toBe('❄ 4:23');
    expect(cacheChipText({ ...a, kind: 'subagent' })).toBe('');
    expect(cacheChipText({ ...a, usage: { tokens: 1, rate: 0 } })).toBe('');
  });
});
