import { cleanChatText, takeCodePoints } from '../../../core/src/lan.js';
import {
  MAX_OFFICE_NAME,
  MAX_ROOM_PASSWORD,
  OFFICE_MAX_PEOPLE,
  ROOM_MAX_KICKED,
  ROOM_MIN_PEOPLE,
} from '../constants.js';
import { isWireId } from './crypto.js';

/** A room's shared, versioned settings + membership (see the room-host-powers spec). */
export interface RoomState {
  rev: number;
  by: string;
  host: string;
  title: string;
  max: number;
  pw: string;
  order: string[];
  kicked: string[];
}

const idList = (x: unknown): string[] | null => {
  if (!Array.isArray(x) || x.length > OFFICE_MAX_PEOPLE) return null;
  if (!x.every((i) => typeof i === 'string' && isWireId(i))) return null;
  return [...new Set(x as string[])];
};

export function parseRoomState(x: unknown): RoomState | null {
  if (typeof x !== 'object' || x === null) return null;
  const o = x as Record<string, unknown>;
  const title = cleanChatText(o.title);
  const order = idList(o.order);
  const kicked = idList(o.kicked);
  if (
    !Number.isSafeInteger(o.rev) ||
    (o.rev as number) < 0 ||
    typeof o.by !== 'string' ||
    !isWireId(o.by) ||
    typeof o.host !== 'string' ||
    !isWireId(o.host) ||
    !title ||
    !Number.isInteger(o.max) ||
    (o.max as number) < ROOM_MIN_PEOPLE ||
    (o.max as number) > OFFICE_MAX_PEOPLE ||
    typeof o.pw !== 'string' ||
    [...o.pw].length > MAX_ROOM_PASSWORD ||
    !order ||
    !kicked
  ) {
    return null;
  }
  return {
    rev: o.rev as number,
    by: o.by,
    host: o.host,
    title: takeCodePoints(title, MAX_OFFICE_NAME),
    max: o.max as number,
    pw: o.pw,
    order,
    kicked,
  };
}

/** a is newer than b: higher rev, then larger `by`. */
export function newer(a: RoomState, b: RoomState | undefined): boolean {
  if (!b) return true;
  return a.rev !== b.rev ? a.rev > b.rev : a.by > b.by;
}

/** Newer, and written by my room's host or a takeover (its writer is its own host). */
export function acceptRoom(mine: RoomState | undefined, got: RoomState): boolean {
  return newer(got, mine) && (!mine || got.by === mine.host || got.by === got.host);
}

export function successor(s: RoomState, live: (id: string) => boolean): string | null {
  return s.order.find((id) => id !== s.host && live(id)) ?? null;
}

/** Host housekeeping: append live members missing from the order (first-heard order, not kicked,
 *  ≤ OFFICE_MAX_PEOPLE), drop gone ones (never me). null = unchanged. `live` lists ids, not a predicate. */
export function upkeep(
  s: RoomState,
  me: string,
  live: readonly string[],
  gone: (id: string) => boolean,
): RoomState | null {
  const order = s.order.filter((id) => id === me || !gone(id));
  for (const id of live) {
    if (order.length < OFFICE_MAX_PEOPLE && !order.includes(id) && !s.kicked.includes(id))
      order.push(id);
  }
  const same = order.length === s.order.length && order.every((id, i) => id === s.order[i]);
  return same ? null : { ...s, rev: s.rev + 1, by: me, order };
}

export function admitVerdict(
  s: RoomState,
  id: string,
  pwOk: boolean,
  count: number,
  inside: boolean,
): 'ok' | 'password' | 'full' | 'banned' {
  if (s.pw === '' && s.kicked.includes(id)) return 'banned';
  if (!pwOk) return 'password';
  if (!inside && count >= s.max) return 'full';
  return 'ok';
}

export function withKick(s: RoomState, me: string, id: string): RoomState {
  const kicked = [...s.kicked.filter((k) => k !== id), id].slice(-ROOM_MAX_KICKED);
  return { ...s, rev: s.rev + 1, by: me, order: s.order.filter((o) => o !== id), kicked };
}

export function atLeastVersion(ver: string | undefined, min: string): boolean {
  if (!ver) return false;
  const a = ver.split('.').map(Number);
  const b = min.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d) return d > 0;
  }
  return true;
}

export function legacyRoom(me: string, title: string, pw: string): RoomState {
  return { rev: 0, by: me, host: me, title, max: OFFICE_MAX_PEOPLE, pw, order: [me], kicked: [] };
}
