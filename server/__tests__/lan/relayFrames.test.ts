import { describe, expect, it } from 'vitest';

import {
  closeReason,
  isPublicKey,
  parseCloseReason,
  parseDown,
  parseUp,
  RELAY_CLOSE,
  RELAY_MAX_FRAME_BYTES,
} from '../../../core/src/relay.js';

const pk = Buffer.alloc(32, 7).toString('base64');
const wire = (o: object = {}) => ({ v: 2, t: 'pub', from: 'a', to: 'b', n: 'nn', c: 'cc', ...o });

describe('parseUp', () => {
  it('accepts a valid send', () => {
    const f = { t: 'send', w: [wire()] };
    expect(parseUp(JSON.stringify(f), 'a')).toEqual(f);
  });
  it('rejects bad frames', () => {
    expect(
      parseUp(JSON.stringify({ t: 'send', w: [wire(), wire({ from: 'x' })] }), 'a'),
    ).toBeNull();
    expect(parseUp(JSON.stringify({ t: 'hello' }), 'a')).toBeNull();
    expect(
      parseUp(JSON.stringify({ t: 'send', w: [wire({ to: 'x'.repeat(65) })] }), 'a'),
    ).toBeNull();
    expect(parseUp(JSON.stringify({ t: 'send', w: [wire({ n: 1 })] }), 'a')).toBeNull();
    expect(parseUp('x'.repeat(RELAY_MAX_FRAME_BYTES + 1), 'a')).toBeNull();
    expect(parseUp('nope', 'a')).toBeNull();
  });
});

describe('parseDown', () => {
  it('round-trips each frame', () => {
    for (const f of [
      { t: 'roster', peers: [{ id: 'a', pk }] },
      { t: 'join', id: 'a', pk },
      { t: 'leave', id: 'a' },
      { t: 'w', w: [wire()] },
    ]) {
      expect(parseDown(JSON.stringify(f))).toEqual(f);
    }
  });
  it('rejects bad frames', () => {
    expect(parseDown(JSON.stringify({ t: 'zzz' }))).toBeNull();
    const short = Buffer.alloc(31, 1).toString('base64');
    expect(parseDown(JSON.stringify({ t: 'roster', peers: [{ id: 'a', pk: short }] }))).toBeNull();
  });
});

describe('isPublicKey', () => {
  it('needs canonical 32 B base64', () => {
    expect(isPublicKey(pk)).toBe(true);
    expect(isPublicKey(pk.slice(0, -1))).toBe(false);
    expect(isPublicKey(5)).toBe(false);
  });
});

describe('close reason', () => {
  it('round-trips ms', () => {
    expect(parseCloseReason(RELAY_CLOSE.budget, closeReason('budget', 3_600_000))).toEqual({
      kind: 'budget',
      ms: 3_600_000,
    });
  });
  it('falls back', () => {
    expect(parseCloseReason(1006, '')).toEqual({ kind: 'other' });
    expect(parseCloseReason(4021, '{bad')).toEqual({ kind: 'budget' });
  });
});
