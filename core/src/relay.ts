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

export const NET_TAG_CHARS = 8; // hex
const NET_TAG = new RegExp(`^[0-9a-f]{${NET_TAG_CHARS}}$`);
export const isNetTag = (s: unknown): s is string => typeof s === 'string' && NET_TAG.test(s);

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
/**
 * Who a PC is, as it tells the relay (`me`) and the relay tells everyone (roster, `person`):
 * `{peer: PeerInfo, personal?: true}`. Plaintext to the relay by design (1.0.64: the relay
 * lists who is online); the relay checks only its shape, size and `peer.id`, every PC parses
 * `peer` itself (parsePeerInfo).
 */
export type RelayPerson = Record<string, unknown> & { peer: Record<string, unknown> };
/** A person as JSON at most this long (it lives in the 2 KB socket attachment). */
export const RELAY_PERSON_MAX_BYTES = 1024;
export type RelayPeer = { id: string; pk: string; net?: string; p?: RelayPerson };
export type RelayUp = { t: 'send'; w: PubWire[] } | { t: 'me'; p: RelayPerson };
export type RelayDown =
  | { t: 'roster'; you?: string; peers: RelayPeer[] }
  | ({ t: 'join' } & RelayPeer)
  | { t: 'leave'; id: string }
  | { t: 'person'; id: string; p: RelayPerson }
  | { t: 'w'; w: PubWire[] };

type Obj = Record<string, unknown>;
const obj = (x: unknown): Obj | null =>
  x && typeof x === 'object' && !Array.isArray(x) ? (x as Obj) : null;

function parseJson(text: string): Obj | null {
  // bytes >= UTF-16 units, and <= 3 * units: encode only in the gray zone
  if (text.length > RELAY_MAX_FRAME_BYTES) return null;
  if (
    text.length * 3 > RELAY_MAX_FRAME_BYTES &&
    new TextEncoder().encode(text).length > RELAY_MAX_FRAME_BYTES
  )
    return null;
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

/** A person whose `peer.id` is `id`, as JSON within RELAY_PERSON_MAX_BYTES; else null. */
export function relayPerson(x: unknown, id: string): RelayPerson | null {
  const o = obj(x);
  const peer = obj(o?.peer);
  if (!o || !peer || peer.id !== id) return null;
  const text = JSON.stringify(o);
  if (
    text.length * 3 > RELAY_PERSON_MAX_BYTES &&
    new TextEncoder().encode(text).length > RELAY_PERSON_MAX_BYTES
  )
    return null;
  return o as RelayPerson;
}

export function parseUp(text: string, from: string): RelayUp | null {
  const o = parseJson(text);
  if (o?.t === 'me') {
    const p = relayPerson(o.p, from);
    return p ? { t: 'me', p } : null;
  }
  if (!o || o.t !== 'send') return null;
  const w = pubWires(o.w, from);
  return w ? { t: 'send', w } : null;
}

const peerEntry = (p: Obj | null): RelayPeer | null => {
  if (!p || !isPeerId(p.id) || !isPublicKey(p.pk)) return null;
  const person = p.p === undefined ? null : relayPerson(p.p, p.id);
  return {
    id: p.id,
    pk: p.pk,
    ...(isNetTag(p.net) && { net: p.net }),
    ...(person && { p: person }),
  };
};

export function parseDown(text: string): RelayDown | null {
  const o = parseJson(text);
  if (!o) return null;
  switch (o.t) {
    case 'roster': {
      if (!Array.isArray(o.peers)) return null;
      const peers: RelayPeer[] = [];
      for (const raw of o.peers) {
        const p = peerEntry(obj(raw));
        if (!p) return null;
        peers.push(p);
      }
      return { t: 'roster', ...(isNetTag(o.you) && { you: o.you }), peers };
    }
    case 'join': {
      const p = peerEntry(o);
      return p ? { t: 'join', ...p } : null;
    }
    case 'person': {
      if (!isPeerId(o.id)) return null;
      const p = relayPerson(o.p, o.id);
      return p ? { t: 'person', id: o.id, p } : null;
    }
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
