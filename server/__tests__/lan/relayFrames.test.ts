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
    expect(parseUp('nope', 'a')).toBeNull();
  });
});

describe('frame size limit', () => {
  const frame = (c: string) => JSON.stringify({ t: 'send', w: [wire({ c })] });
  const overhead = Buffer.byteLength(frame(''));
  it('counts bytes, not UTF-16 units', () => {
    const room = RELAY_MAX_FRAME_BYTES - overhead;
    expect(parseUp(frame('x'.repeat(room)), 'a')).not.toBeNull();
    expect(parseUp(frame('x'.repeat(room + 1)), 'a')).toBeNull();
    // 200k chars < 512k units but 600k bytes
    const han = frame('한'.repeat(200_000));
    expect(han.length).toBeLessThan(RELAY_MAX_FRAME_BYTES);
    expect(parseUp(han, 'a')).toBeNull();
    expect(parseUp(frame('한'.repeat(100_000)), 'a')).not.toBeNull();
  });
  it('applies to parseDown too', () => {
    const big = JSON.stringify({ t: 'w', w: [wire({ c: '한'.repeat(200_000) })] });
    expect(parseDown(big)).toBeNull();
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
  it('round-trips net tags and you', () => {
    const f = { t: 'roster', you: 'deadbeef', peers: [{ id: 'a', pk, net: '0123abcd' }] };
    expect(parseDown(JSON.stringify(f))).toEqual(f);
    const j = { t: 'join', id: 'a', pk, net: '0123abcd' };
    expect(parseDown(JSON.stringify(j))).toEqual(j);
  });
  it('drops a bad net/you but keeps the frame', () => {
    const f = { t: 'roster', you: 'XYZ', peers: [{ id: 'a', pk, net: 'XYZ' }] };
    expect(parseDown(JSON.stringify(f))).toEqual({ t: 'roster', peers: [{ id: 'a', pk }] });
    expect(parseDown(JSON.stringify({ t: 'join', id: 'a', pk, net: 5 }))).toEqual({
      t: 'join',
      id: 'a',
      pk,
    });
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
