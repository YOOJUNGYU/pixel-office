// Pure relay hub decisions (no Cloudflare/Node APIs): the Durable Object shell feeds
// it state + events and carries out the verdicts.
import {
  isPeerId,
  isPublicKey,
  parseUp,
  type PubWire,
  type RelayCloseKind,
} from '../../core/src/relay.js';

export interface Limits {
  maxPeers: number;
  dailyBudget: number;
  maxFramesPerMin: number;
  abuseBanMin: number;
  kickHours: number;
}
export const DEFAULT_LIMITS: Limits = {
  maxPeers: 20,
  dailyBudget: 1_800_000,
  maxFramesPerMin: 120,
  abuseBanMin: 60,
  kickHours: 24,
};
/** An upgrade / admin request counts as this many messages against the budget. */
export const REQUEST_WEIGHT = 20;

const MS_MIN = 60_000;
const MS_HOUR = 3_600_000;
const MS_DAY = 24 * MS_HOUR;
const DATE_CHARS = 10; // 'YYYY-MM-DD'
const BEARER = 'Bearer ';

export interface HubState {
  day: string;
  used: number;
  /** id -> until (ms epoch, hub clock) */
  bans: Record<string, number>;
}
export interface Conn {
  id: string;
  pk: string;
  /** receive times within the last minute */
  frames: number[];
}

const dayOf = (now: number): string => new Date(now).toISOString().slice(0, DATE_CHARS);

export const newState = (now: number): HubState => ({ day: dayOf(now), used: 0, bans: {} });

export function charge(s: HubState, n: number, now: number): void {
  const d = dayOf(now);
  if (d !== s.day) {
    s.day = d;
    s.used = 0;
  }
  s.used += n;
}

export const exhausted = (s: HubState, l: Limits): boolean => s.used >= l.dailyBudget;

export const msToReset = (now: number): number => MS_DAY - (now % MS_DAY);

export type Admit = { ok: true; replace?: Conn } | { ok: false; kind: RelayCloseKind; ms?: number };

export function admit(
  s: HubState,
  conns: Conn[],
  id: string,
  pk: string,
  now: number,
  l: Limits,
): Admit {
  if (!isPeerId(id) || !isPublicKey(pk)) return { ok: false, kind: 'bad' };
  const until = s.bans[id];
  if (until !== undefined && until > now) return { ok: false, kind: 'kicked', ms: until - now };
  if (exhausted(s, l)) return { ok: false, kind: 'budget', ms: msToReset(now) };
  const same = conns.find((c) => c.id === id);
  if (same) return same.pk === pk ? { ok: true, replace: same } : { ok: false, kind: 'bad' };
  if (conns.length >= l.maxPeers) return { ok: false, kind: 'full' };
  return { ok: true };
}

export type FrameResult =
  { deliver: Map<string, PubWire[]> } | { close: RelayCloseKind; ms: number; ban: true };

export function onFrame(
  s: HubState,
  c: Conn,
  text: string,
  conns: Conn[],
  now: number,
  l: Limits,
): FrameResult {
  c.frames = c.frames.filter((t) => now - t < MS_MIN);
  c.frames.push(now);
  if (c.frames.length > l.maxFramesPerMin) {
    const ms = l.abuseBanMin * MS_MIN;
    s.bans[c.id] = now + ms;
    return { close: 'kicked', ms, ban: true };
  }
  const deliver = new Map<string, PubWire[]>();
  const up = parseUp(text, c.id);
  if (!up) return { deliver };
  for (const w of up.w) {
    if (w.to === c.id || !conns.some((o) => o.id === w.to)) continue;
    const list = deliver.get(w.to);
    if (list) list.push(w);
    else deliver.set(w.to, [w]);
  }
  return { deliver };
}

export function kick(s: HubState, id: string, hours: number, now: number): number {
  return (s.bans[id] = now + hours * MS_HOUR);
}

export function unban(s: HubState, id: string): boolean {
  if (!(id in s.bans)) return false;
  delete s.bans[id];
  return true;
}

export function pruneBans(s: HubState, now: number): void {
  for (const [id, until] of Object.entries(s.bans)) if (until <= now) delete s.bans[id];
}

/** "Bearer <token>" check; XOR over the longer length so timing does not leak the length match. */
export function authorized(header: string | null, token: string): boolean {
  if (!token || !header) return false;
  const given = header.startsWith(BEARER) ? header.slice(BEARER.length) : '';
  let diff = given.length ^ token.length;
  for (let i = 0; i < Math.max(given.length, token.length); i++)
    diff |= (given.charCodeAt(i) || 0) ^ (token.charCodeAt(i) || 0);
  return diff === 0;
}
