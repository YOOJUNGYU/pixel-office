import { describe, expect, it } from 'vitest';

import {
  CHAT_BORDER_PX,
  LAN_ACTIVITY_MAX_LINES,
  LAN_ACTIVITY_MAX_WIDTH_PX,
  LAN_ACTIVITY_PAD_X_PX,
} from '../src/constants.js';
import { agentBubbleLayout } from '../src/lan/agentBubble.js';

const w = (s: string) => Array.from(s).length * 7;
const m = { text: w, badge: w, chip: w, title: w };
const parts = {
  provider: 'Claude',
  icon: true,
  title: '',
  todo: '',
  elapsed: '3분',
  text: 'a.ts 편집',
  wrap: true,
};
const inner = LAN_ACTIVITY_MAX_WIDTH_PX - 2 * (LAN_ACTIVITY_PAD_X_PX + CHAT_BORDER_PX);

describe('agentBubbleLayout', () => {
  it('a model label (Sonnet) widens the header badge', () => {
    const t = { ...parts, title: 'x', text: 'a' };
    const base = agentBubbleLayout({ ...t, provider: 'Claude' }, m);
    const long = agentBubbleLayout({ ...t, provider: 'Sonnet 4.5 long' }, m);
    expect(long.w).toBeGreaterThan(base.w);
  });

  it('a short activity: one body line under the header', () => {
    const l = agentBubbleLayout(parts, m);
    expect(l.rows).toEqual(['a.ts 편집']);
    expect(l.w).toBeLessThan(LAN_ACTIVITY_MAX_WIDTH_PX);
  });

  it('the body uses the full width (no badge gutter) and wraps at separators', () => {
    const text =
      'cd /home/yoojungyu/GIT/PRIVATE/pixel-office; sleep 10; p=$(gh run list --workflow=ci.yml)';
    const l = agentBubbleLayout({ ...parts, text }, m);
    expect(l.w).toBeLessThanOrEqual(LAN_ACTIVITY_MAX_WIDTH_PX);
    for (const r of l.rows ?? []) expect(w(r)).toBeLessThanOrEqual(inner);
    expect((l.rows ?? []).join('').replace(/ /g, '')).toBe(text.replace(/ /g, ''));
    expect(l.rows?.[0]).toBe('cd /home/yoojungyu/GIT/PRIVATE/');
  });

  it('a long title never widens the bubble past the max; a longer body grows the height', () => {
    const one = agentBubbleLayout({ ...parts, title: 'x'.repeat(200) }, m);
    expect(one.w).toBe(LAN_ACTIVITY_MAX_WIDTH_PX);
    const many = agentBubbleLayout({ ...parts, text: 'word '.repeat(200) }, m);
    expect(many.rows).toHaveLength(LAN_ACTIVITY_MAX_LINES);
    expect(many.rows?.at(-1)?.endsWith('…')).toBe(true);
    expect(many.h).toBeGreaterThan(one.h);
  });

  it('team office: one clipped line (no rows)', () => {
    const l = agentBubbleLayout({ ...parts, wrap: false, text: 'word '.repeat(200) }, m);
    expect(l.rows).toBeUndefined();
    expect(l.w).toBe(LAN_ACTIVITY_MAX_WIDTH_PX);
  });
});
