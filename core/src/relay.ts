// Frame protocol between a PC and the internet relay (Cloudflare Durable Object).
// No Node-only APIs: this file is also bundled for Workers.

export const RELAY_CLOSE = {
  full: 4020,
  budget: 4021,
  kicked: 4022,
  replaced: 4023,
  bad: 4024,
} as const;
export type RelayCloseKind = keyof typeof RELAY_CLOSE;
export const RELAY_MAX_FRAME_BYTES = 512 * 1024;
export const RELAY_PATH = '/ws';
export const WIRE_MAX_ID = 64;

const ID = new RegExp(`^[A-Za-z0-9_.-]{1,${WIRE_MAX_ID}}$`);
// 32 bytes = 43 base64 chars + '=' (last char carries 2 bits: only A, E, I, M, Q, U, Y, c, g, k, o, s, w, 0, 4, 8 are canonical)
const PUBLIC_KEY = /^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/;

export const isPeerId = (s: unknown): s is string => typeof s === 'string' && ID.test(s);
export const isPublicKey = (s: unknown): s is string => typeof s === 'string' && PUBLIC_KEY.test(s);

export interface PubWire {
  v: 2;
  t: 'pub';
  from: string;
  to: string;
  n: string;
  c: string;
}
export type RelayUp = { t: 'send'; w: PubWire[] };
export type RelayDown =
  | { t: 'roster'; peers: { id: string; pk: string }[] }
  | { t: 'join'; id: string; pk: string }
  | { t: 'leave'; id: string }
  | { t: 'w'; w: PubWire[] };

type Obj = Record<string, unknown>;
const obj = (x: unknown): Obj | null =>
  x && typeof x === 'object' && !Array.isArray(x) ? (x as Obj) : null;

function parseJson(text: string): Obj | null {
  if (text.length > RELAY_MAX_FRAME_BYTES) return null;
  try {
    return obj(JSON.parse(text));
  } catch {
    return null;
  }
}

function pubWires(x: unknown, from?: string): PubWire[] | null {
  if (!Array.isArray(x)) return null;
  const out: PubWire[] = [];
  for (const raw of x) {
    const o = obj(raw);
    if (!o || o.v !== 2 || o.t !== 'pub' || !isPeerId(o.from) || !isPeerId(o.to)) return null;
    if (from !== undefined && o.from !== from) return null;
    if (typeof o.n !== 'string' || typeof o.c !== 'string') return null;
    out.push({ v: 2, t: 'pub', from: o.from, to: o.to, n: o.n, c: o.c });
  }
  return out;
}

export function parseUp(text: string, from: string): RelayUp | null {
  const o = parseJson(text);
  if (!o || o.t !== 'send') return null;
  const w = pubWires(o.w, from);
  return w ? { t: 'send', w } : null;
}

export function parseDown(text: string): RelayDown | null {
  const o = parseJson(text);
  if (!o) return null;
  switch (o.t) {
    case 'roster': {
      if (!Array.isArray(o.peers)) return null;
      const peers: { id: string; pk: string }[] = [];
      for (const raw of o.peers) {
        const p = obj(raw);
        if (!p || !isPeerId(p.id) || !isPublicKey(p.pk)) return null;
        peers.push({ id: p.id, pk: p.pk });
      }
      return { t: 'roster', peers };
    }
    case 'join':
      return isPeerId(o.id) && isPublicKey(o.pk) ? { t: 'join', id: o.id, pk: o.pk } : null;
    case 'leave':
      return isPeerId(o.id) ? { t: 'leave', id: o.id } : null;
    case 'w': {
      const w = pubWires(o.w);
      return w ? { t: 'w', w } : null;
    }
    default:
      return null;
  }
}

/** `ms` = retry allowed this many ms from now (relative: clock skew irrelevant). */
export const closeReason = (kind: RelayCloseKind, ms?: number): string =>
  JSON.stringify(ms === undefined ? { k: kind } : { k: kind, ms });

export function parseCloseReason(
  code: number,
  reason: string,
): { kind: RelayCloseKind | 'other'; ms?: number } {
  const kind = (Object.keys(RELAY_CLOSE) as RelayCloseKind[]).find((k) => RELAY_CLOSE[k] === code);
  if (!kind) return { kind: 'other' };
  try {
    const ms = obj(JSON.parse(reason))?.ms;
    if (typeof ms === 'number' && Number.isFinite(ms) && ms >= 0) return { kind, ms };
  } catch {
    // broken reason: kind only
  }
  return { kind };
}
