import { describe, expect, it } from 'vitest';

import { mapMark } from '../src/lan/activityStrip.js';
import { jumpTarget } from '../src/lan/transcript.js';

describe('jumpTarget', () => {
  const tops = [100, 400, 900];
  it('next prompt below the one at the top, previous above it', () => {
    expect(jumpTarget(tops, 0, 1, 8)).toBe(92);
    expect(jumpTarget(tops, 92, 1, 8)).toBe(392); // the one at the top is skipped
    expect(jumpTarget(tops, 392, -1, 8)).toBe(92);
    expect(jumpTarget(tops, 600, -1, 8)).toBe(392); // between two: the one above
  });
  it('none that way', () => {
    expect(jumpTarget(tops, 892, 1, 8)).toBeNull();
    expect(jumpTarget(tops, 92, -1, 8)).toBeNull();
    expect(jumpTarget([], 0, 1, 8)).toBeNull();
  });
});

describe('mapMark', () => {
  it('a reply is its own mark; tools by family; failed results', () => {
    expect(mapMark({ kind: 'assistant', text: 'hi' })).toBe('reply');
    expect(mapMark({ kind: 'user', text: 'do it' })).toBe('user');
    expect(mapMark({ kind: 'tool', text: '{}', tool: 'Edit' })).toBe('edit');
    expect(mapMark({ kind: 'result', text: 'boom', error: true })).toBe('fail');
    expect(mapMark({ kind: 'meta', text: 'x' })).toBeNull();
    expect(mapMark({ kind: 'user', text: '<task-notification>…' })).toBeNull();
  });
});
