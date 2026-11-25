import { describe, expect, it } from 'vitest';

import { ROOM_MAX_KICKED } from '../../src/constants.js';
import {
  acceptRoom,
  admitVerdict,
  atLeastVersion,
  legacyRoom,
  newer,
  parseRoomState,
  type RoomState,
  successor,
  upkeep,
  withKick,
} from '../../src/lan/room.js';

const id = (n: number) => n.toString(16).padStart(16, '0');
const [A, B, C] = [id(1), id(2), id(3)];
const st = (o: Partial<RoomState> = {}): RoomState => ({
  rev: 1,
  by: A,
  host: A,
  title: 'Room',
  max: 20,
  pw: '',
  order: [A],
  kicked: [],
  ...o,
});

describe('parseRoomState', () => {
  it('round-trips a valid state', () => {
    const s = st({ order: [A, B], kicked: [C], pw: 'x' });
    expect(parseRoomState(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
  it('rejects bad input', () => {
    expect(parseRoomState(st({ max: 1 }))).toBeNull();
    expect(parseRoomState(st({ max: 21 }))).toBeNull();
    expect(parseRoomState(st({ pw: 'x'.repeat(33) }))).toBeNull();
    expect(parseRoomState({ ...st(), order: 'no' })).toBeNull();
    expect(parseRoomState({ ...st(), host: 'a b' })).toBeNull();
  });
  it('dedupes ids', () => {
    expect(parseRoomState(st({ order: [A, A, B] }))?.order).toEqual([A, B]);
  });
});

describe('newer / acceptRoom', () => {
  it('orders by rev then by', () => {
    expect(newer(st({ rev: 2, by: 'a' }), st({ rev: 1, by: 'z' }))).toBe(true);
    expect(newer(st({ by: 'b' }), st({ by: 'a' }))).toBe(true);
    expect(newer(st(), st())).toBe(false);
    expect(newer(st(), undefined)).toBe(true);
  });
  it('accepts host change, handover, takeover; refuses member edit and stale rev', () => {
    const mine = st({ rev: 5 });
    expect(acceptRoom(mine, st({ rev: 6 }))).toBe(true);
    expect(acceptRoom(mine, st({ rev: 6, by: A, host: B }))).toBe(true);
    expect(acceptRoom(mine, st({ rev: 6, by: B, host: B }))).toBe(true);
    expect(acceptRoom(mine, st({ rev: 6, by: C, host: B }))).toBe(false);
    expect(acceptRoom(st({ rev: 9, host: B, by: B }), st({ rev: 3 }))).toBe(false);
    expect(acceptRoom(undefined, st({ by: C, host: B }))).toBe(true);
  });
});

describe('successor', () => {
  it('skips host and non-live', () => {
    const s = st({ order: [A, B, C] });
    expect(successor(s, (i) => i === C)).toBe(C);
    expect(successor(s, (i) => i === A)).toBeNull();
  });
});

describe('upkeep', () => {
  it('appends live missing, drops gone, keeps me, null when unchanged', () => {
    const s = st({ order: [A, B] });
    expect(upkeep(s, A, [B, C], () => false)?.order).toEqual([A, B, C]);
    const d = upkeep(s, A, [], (i) => i === B || i === A);
    expect(d?.order).toEqual([A]);
    expect(d?.rev).toBe(2);
    expect(d?.by).toBe(A);
    expect(upkeep(s, A, [B], () => false)).toBeNull();
  });
});

describe('admitVerdict', () => {
  it('applies the rules in order', () => {
    expect(admitVerdict(st({ kicked: [B] }), B, true, 1, false)).toBe('banned');
    expect(admitVerdict(st({ pw: 'p', kicked: [B] }), B, true, 1, false)).toBe('ok');
    expect(admitVerdict(st({ pw: 'p' }), B, false, 1, false)).toBe('password');
    expect(admitVerdict(st({ max: 5 }), B, true, 5, false)).toBe('full');
    expect(admitVerdict(st({ max: 5 }), B, true, 5, true)).toBe('ok');
  });
});

describe('withKick / atLeastVersion / legacyRoom', () => {
  it('kicks, caps the list', () => {
    const k = withKick(st({ order: [A, B] }), A, B);
    expect(k.order).toEqual([A]);
    expect(k.kicked).toEqual([B]);
    expect(k.rev).toBe(2);
    const many = Array.from({ length: ROOM_MAX_KICKED }, (_, i) => id(100 + i));
    const c = withKick(st({ kicked: many }), A, B);
    expect(c.kicked).toHaveLength(ROOM_MAX_KICKED);
    expect(c.kicked[0]).toBe(many[1]);
    expect(c.kicked.at(-1)).toBe(B);
  });
  it('compares versions', () => {
    expect(atLeastVersion('1.0.80', '1.0.80')).toBe(true);
    expect(atLeastVersion('1.0.9', '1.0.80')).toBe(false);
    expect(atLeastVersion(undefined, '1.0.80')).toBe(false);
    expect(atLeastVersion('1.0.80-beta.1', '1.0.80')).toBe(true);
    expect(atLeastVersion('1.0.79-rc', '1.0.80')).toBe(false);
  });
  it('builds a legacy room', () => {
    expect(legacyRoom(A, 'T', 'p')).toEqual(st({ rev: 0, title: 'T', pw: 'p' }));
  });
});
