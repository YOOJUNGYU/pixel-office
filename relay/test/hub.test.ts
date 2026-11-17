import { describe, expect, it } from 'vitest';

import { RELAY_PERSON_MAX_BYTES } from '../../core/src/relay.js';
import {
  admit,
  authorized,
  charge,
  type Conn,
  currentClient,
  DEFAULT_LIMITS as L,
  exhausted,
  isSilent,
  kick,
  lastActive,
  msToReset,
  netTag,
  newState,
  onFrame,
  pruneBans,
  SILENT_DROP_MS,
  toHex,
  unban,
} from '../src/hub.js';

const NOW = Date.parse('2026-11-06T12:00:00Z');
const PK = 'A'.repeat(42) + 'A=';
const PK2 = 'A'.repeat(42) + 'E=';
const conn = (id: string, pk = PK): Conn => ({ id, pk, win: 0, n: 0 });
const wire = (from: string, to: string) =>
  JSON.stringify({ t: 'send', w: [{ v: 2, t: 'pub', from, to, n: 'n', c: 'c' }] });

describe('currentClient', () => {
  it('serves 1.0.64 and later only (older PCs flood the budget)', () => {
    for (const v of ['1.0.64', '1.0.65', '1.1.0', '2.0.0', '1.0.64-beta.1'])
      expect(currentClient(v)).toBe(true);
    for (const v of ['1.0.63', '0.9.99', 'smoke', '', null, '1.0', '1.0.64 '])
      expect(currentClient(v)).toBe(false);
  });
});

describe('admit', () => {
  it('rejects the peer past maxPeers as full', () => {
    const conns = Array.from({ length: L.maxPeers }, (_, i) => conn(`p${i}`));
    expect(admit(newState(NOW), conns, 'new', PK, NOW, L)).toEqual({ ok: false, kind: 'full' });
    expect(admit(newState(NOW), conns.slice(1), 'new', PK, NOW, L)).toEqual({ ok: true });
  });
  it('rejects a banned id with the remaining time', () => {
    const s = newState(NOW);
    kick(s, 'a', 1, NOW);
    expect(admit(s, [], 'a', PK, NOW + 1000, L)).toEqual({
      ok: false,
      kind: 'kicked',
      ms: 3_600_000 - 1000,
    });
  });
  it('rejects when the budget is used up', () => {
    const s = newState(NOW);
    charge(s, L.dailyBudget, NOW);
    expect(exhausted(s, L)).toBe(true);
    expect(admit(s, [], 'a', PK, NOW, L)).toEqual({
      ok: false,
      kind: 'budget',
      ms: msToReset(NOW),
    });
  });
  it('replaces the same id + pk, rejects same id + other pk', () => {
    const old = conn('a');
    expect(admit(newState(NOW), [old], 'a', PK, NOW, L)).toEqual({ ok: true, replace: old });
    expect(admit(newState(NOW), [old], 'a', PK2, NOW, L)).toEqual({ ok: false, kind: 'bad' });
  });
  it('rejects malformed id / key', () => {
    expect(admit(newState(NOW), [], 'a b', PK, NOW, L)).toEqual({ ok: false, kind: 'bad' });
    expect(admit(newState(NOW), [], 'a', 'nope', NOW, L)).toEqual({ ok: false, kind: 'bad' });
  });
});

describe('budget', () => {
  it('resets on a new UTC day', () => {
    const s = newState(Date.parse('2026-11-06T23:59:59Z'));
    charge(s, 100, Date.parse('2026-11-06T23:59:59Z'));
    charge(s, 1, Date.parse('2026-11-07T00:00:01Z'));
    expect(s.used).toBe(1);
    expect(s.day).toBe('2026-11-07');
  });
  it('msToReset', () => {
    expect(msToReset(Date.parse('2026-11-06T15:00:00Z'))).toBe(9 * 3_600_000);
  });
});

describe('onFrame', () => {
  it('bans on the 121st frame within a minute', () => {
    const s = newState(NOW);
    const c = conn('a');
    for (let i = 0; i < 120; i++)
      expect('deliver' in onFrame(s, c, '{}', [c], NOW + i, L)).toBe(true);
    expect(onFrame(s, c, '{}', [c], NOW + 500, L)).toEqual({
      close: 'kicked',
      ban: true,
      ms: 3_600_000,
    });
    expect(s.bans['a']).toBe(NOW + 500 + 3_600_000);
  });
  it('old frames fall out of the window', () => {
    const s = newState(NOW);
    const c = conn('a');
    for (let i = 0; i < 120; i++) onFrame(s, c, '{}', [c], NOW, L);
    expect('deliver' in onFrame(s, c, '{}', [c], NOW + 61_000, L)).toBe(true);
  });
  it('groups by recipient, drops offline and self', () => {
    const a = conn('a');
    const b = conn('b');
    const text = JSON.stringify({
      t: 'send',
      w: ['b', 'b', 'ghost', 'a'].map((to) => ({ v: 2, t: 'pub', from: 'a', to, n: 'n', c: 'c' })),
    });
    const r = onFrame(newState(NOW), a, text, [a, b], NOW, L);
    expect('deliver' in r && [...r.deliver.keys()]).toEqual(['b']);
    expect('deliver' in r && r.deliver.get('b')).toHaveLength(2);
  });
  it('me: kept on the connection as its person; only with its own peer id, within the size cap', () => {
    const a = conn('a');
    const me = (p: unknown) => JSON.stringify({ t: 'me', p });
    const person = { peer: { id: 'a', account: 'x' }, personal: true };
    expect(onFrame(newState(NOW), a, me(person), [a], NOW, L)).toEqual({ person });
    expect(a.p).toEqual(person);
    for (const bad of [
      { peer: { id: 'b' } },
      { peer: 'a' },
      { peer: { id: 'a', pad: 'x'.repeat(RELAY_PERSON_MAX_BYTES) } },
    ]) {
      const r = onFrame(newState(NOW), a, me(bad), [a], NOW, L);
      expect('deliver' in r && r.deliver.size).toBe(0);
    }
    expect(a.p).toEqual(person);
  });
  it('forged from or junk delivers nothing', () => {
    const a = conn('a');
    const b = conn('b');
    for (const t of [wire('x', 'b'), 'junk']) {
      const r = onFrame(newState(NOW), a, t, [a, b], NOW, L);
      expect('deliver' in r && r.deliver.size).toBe(0);
    }
  });
});

describe('bans', () => {
  it('kick, unban, prune', () => {
    const s = newState(NOW);
    expect(kick(s, 'a', 24, NOW)).toBe(NOW + 24 * 3_600_000);
    kick(s, 'b', 1, NOW);
    pruneBans(s, NOW + 2 * 3_600_000);
    expect(Object.keys(s.bans)).toEqual(['a']);
    expect(unban(s, 'a')).toBe(true);
    expect(unban(s, 'a')).toBe(false);
  });
});

describe('bans with prototype-like ids', () => {
  it('kick + admit __proto__', () => {
    const s = newState(NOW);
    kick(s, '__proto__', 1, NOW);
    expect(admit(s, [], '__proto__', PK, NOW, L)).toMatchObject({ ok: false, kind: 'kicked' });
  });
  it('abuse ban sticks', () => {
    const s = newState(NOW);
    const c = conn('__proto__');
    for (let i = 0; i <= 120; i++) onFrame(s, c, '{}', [c], NOW, L);
    expect(admit(s, [], '__proto__', PK, NOW, L)).toMatchObject({ ok: false, kind: 'kicked' });
  });
  it('unban of inherited names is false', () => {
    const s = newState(NOW);
    for (const id of ['constructor', 'toString', '__proto__']) expect(unban(s, id)).toBe(false);
  });
  it('survives a JSON round trip', () => {
    const s = newState(NOW);
    kick(s, '__proto__', 1, NOW);
    const r = JSON.parse(JSON.stringify(s)) as typeof s;
    expect(admit(r, [], '__proto__', PK, NOW, L)).toMatchObject({ ok: false, kind: 'kicked' });
    pruneBans(r, NOW + 2 * 3_600_000);
    expect(admit(r, [], '__proto__', PK, NOW + 2 * 3_600_000, L)).toEqual({ ok: true });
  });
});

describe('authorized', () => {
  it('checks the bearer token', () => {
    expect(authorized('Bearer x', 'x')).toBe(true);
    expect(authorized('Bearer y', 'x')).toBe(false);
    expect(authorized('Bearer xx', 'x')).toBe(false);
    expect(authorized(null, 'x')).toBe(false);
    expect(authorized('Bearer ', '')).toBe(false);
  });
});

describe('netTag', () => {
  it('is 8 hex, stable, salt-dependent', async () => {
    const a = await netTag('1.2.3.4', 'aa');
    expect(a).toMatch(/^[0-9a-f]{8}$/);
    expect(await netTag('1.2.3.4', 'aa')).toBe(a);
    expect(await netTag('1.2.3.4', 'bb')).not.toBe(a);
    expect(await netTag('1.2.3.5', 'aa')).not.toBe(a);
  });
});

describe('silent sockets', () => {
  it('last activity = newest of ping, last frame, accept', () => {
    expect(lastActive({ ...conn('a'), at: 5 }, undefined)).toBe(5);
    expect(lastActive({ ...conn('a'), at: 5, last: 9 }, 8)).toBe(9);
    expect(lastActive({ ...conn('a'), at: 5, last: 7 }, 20)).toBe(20);
    expect(lastActive(conn('a'), undefined)).toBe(0);
  });
  it('silent only after SILENT_DROP_MS', () => {
    expect(SILENT_DROP_MS).toBe(90_000);
    expect(isSilent(NOW, NOW + SILENT_DROP_MS)).toBe(false);
    expect(isSilent(NOW, NOW + SILENT_DROP_MS + 1)).toBe(true);
  });
});

describe('toHex', () => {
  it('two chars per byte, from a buffer or a view', () => {
    expect(toHex(new Uint8Array([0, 15, 255]))).toBe('000fff');
    expect(toHex(new Uint8Array([1, 2]).buffer)).toBe('0102');
  });
});
