import * as crypto from 'crypto';

import { cleanChatText, MAX_PACKET_BYTES, takeCodePoints } from '../../../core/src/lan.js';
import { isPeerId } from '../../../core/src/relay.js';
import {
  GCM_NONCE_BYTES,
  GCM_TAG_BYTES,
  INVITE_SECRET_BYTES,
  KEY_BYTES,
  MAX_OFFICE_NAME,
  MAX_ROOM_HOST,
  OFFICE_MAX_PEOPLE,
  PUB_KEY_SALT,
  TEAM_KEY_INFO,
  TEAM_KEY_SALT,
  TEAM_TAG_BYTES,
  TEAM_TAG_INFO,
  X25519_PUBLIC_KEY_BYTES,
  X25519_SPKI_PREFIX,
} from '../constants.js';

export interface Identity {
  id: string;
  /** base64 of the raw 32-byte X25519 public key. */
  publicKey: string;
  privateKeyPem: string;
}

export type Wire =
  | { v: 2; t: 'hello'; id: string; pk: string }
  | { v: 2; t: 'watch'; id: string; pk: string }
  | { v: 2; t: 'pub'; from: string; to: string; n: string; c: string }
  | { v: 2; t: 'card'; from: string; to: string; n: string; c: string }
  | { v: 2; t: 'team'; tag: string; n: string; c: string }
  | RoomWire
  | { v: 2; t: 'ask'; from: string; to: string; pk: string; n: string; c: string }
  | { v: 2; t: 'admit'; from: string; to: string; n: string; c: string };

/** A room's plaintext advert, broadcast by its host (`id`, `pk`). */
export interface RoomWire {
  v: 2;
  t: 'room';
  id: string;
  pk: string;
  tag: string;
  title: string;
  by: string;
  locked: boolean;
  n: number;
}

const TAG = new RegExp(`^[A-Za-z0-9_-]{${Math.ceil((TEAM_TAG_BYTES * 4) / 3)}}$`);

const hkdf = (ikm: Buffer, salt: string, info: string): Buffer =>
  Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, KEY_BYTES));

/** Decoded bytes of a canonical standard-base64 string (re-encodes to itself), else null. */
function b64(s: unknown): Buffer | null {
  if (typeof s !== 'string') return null;
  const buf = Buffer.from(s, 'base64');
  return buf.toString('base64') === s ? buf : null;
}

/** Peer ids on the wire: 1-64 of [A-Za-z0-9_.-] (randomUUID qualifies). */
export const isWireId = isPeerId;

/** base64 raw public key of a PKCS#8 X25519 private key; null if it is not one. */
export function publicKeyOf(privateKeyPem: string): string | null {
  try {
    crypto.createPrivateKey(privateKeyPem); // throws unless it is a private key
    const pub = crypto.createPublicKey(privateKeyPem);
    if (pub.asymmetricKeyType !== 'x25519') return null;
    const der = pub.export({ format: 'der', type: 'spki' });
    return der.subarray(der.length - X25519_PUBLIC_KEY_BYTES).toString('base64');
  } catch {
    return null;
  }
}

export function createIdentity(id: string): Identity {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519');
  const der = publicKey.export({ format: 'der', type: 'spki' });
  return {
    id,
    publicKey: der.subarray(der.length - X25519_PUBLIC_KEY_BYTES).toString('base64'),
    privateKeyPem: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
  };
}

/** Shared public-office key for the pair {idA, idB}; null for a bad/low-order key. */
export function pairKey(
  myPrivatePem: string,
  theirPublicB64: string,
  idA: string,
  idB: string,
): Buffer | null {
  try {
    const raw = b64(theirPublicB64);
    if (!raw || raw.length !== X25519_PUBLIC_KEY_BYTES) return null;
    const secret = crypto.diffieHellman({
      privateKey: crypto.createPrivateKey(myPrivatePem),
      publicKey: crypto.createPublicKey({
        key: Buffer.concat([Buffer.from(X25519_SPKI_PREFIX, 'hex'), raw]),
        format: 'der',
        type: 'spki',
      }),
    });
    if (secret.every((b) => b === 0)) return null;
    return hkdf(secret, PUB_KEY_SALT, [idA, idB].sort().join('|'));
  } catch {
    return null;
  }
}

/** A fresh room (team office) secret. */
export const newRoomSecret = (): Buffer => crypto.randomBytes(INVITE_SECRET_BYTES);

/** A room secret as sent sealed by its host; null unless it is one. */
export function parseRoomSecret(x: unknown): Buffer | null {
  const buf = b64(x);
  return buf?.length === INVITE_SECRET_BYTES ? buf : null;
}

export function teamKey(secret: Buffer): Buffer {
  return hkdf(secret, TEAM_KEY_SALT, TEAM_KEY_INFO);
}

export function teamTag(key: Buffer): string {
  return crypto
    .createHmac('sha256', key)
    .update(TEAM_TAG_INFO)
    .digest()
    .subarray(0, TEAM_TAG_BYTES)
    .toString('base64url');
}

/** AES-256-GCM, random 12-byte nonce; c = ciphertext||tag, both base64. */
export function seal(key: Buffer, aad: string, plaintext: string): { n: string; c: string } {
  const nonce = crypto.randomBytes(GCM_NONCE_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(aad));
  const c = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return { n: nonce.toString('base64'), c: c.toString('base64') };
}

export const pubAad = (from: string, to: string): string => `pub|${from}|${to}`;
export const cardAad = (from: string, to: string): string => `card|${from}|${to}`;
export const teamAad = (tag: string): string => `team|${tag}`;
export const askAad = (from: string, to: string): string => `ask|${from}|${to}`;
export const admitAad = (from: string, to: string): string => `admit|${from}|${to}`;

export function open(key: Buffer, aad: string, n: string, c: string): string | null {
  try {
    const nonce = b64(n);
    const data = b64(c);
    if (!nonce || nonce.length !== GCM_NONCE_BYTES || !data || data.length < GCM_TAG_BYTES)
      return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce, {
      authTagLength: GCM_TAG_BYTES,
    });
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(data.subarray(data.length - GCM_TAG_BYTES));
    return Buffer.concat([
      decipher.update(data.subarray(0, data.length - GCM_TAG_BYTES)),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}

const isPk = (s: unknown): boolean => b64(s)?.length === X25519_PUBLIC_KEY_BYTES;
const isTag = (s: unknown): s is string => typeof s === 'string' && TAG.test(s);
const isNonce = (s: unknown): s is string => b64(s)?.length === GCM_NONCE_BYTES;
const isCipher = (s: unknown): s is string => (b64(s)?.length ?? 0) > GCM_TAG_BYTES;

/** Strict shape check of a v2 datagram; fresh object with known fields only, never throws. */
export function parseWire(text: string): Wire | null {
  if (typeof text !== 'string' || text.length > MAX_PACKET_BYTES) return null;
  let o: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    o = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  if (o.v !== 2) return null;
  switch (o.t) {
    case 'hello':
    case 'watch':
      return isWireId(o.id) && isPk(o.pk) ? { v: 2, t: o.t, id: o.id, pk: o.pk as string } : null;
    case 'pub':
    case 'card':
      return isWireId(o.from) && isWireId(o.to) && isNonce(o.n) && isCipher(o.c)
        ? { v: 2, t: o.t, from: o.from, to: o.to, n: o.n, c: o.c }
        : null;
    case 'team':
      return isTag(o.tag) && isNonce(o.n) && isCipher(o.c)
        ? { v: 2, t: 'team', tag: o.tag, n: o.n, c: o.c }
        : null;
    case 'room': {
      const title = cleanChatText(o.title);
      const by = cleanChatText(o.by);
      if (!isWireId(o.id) || !isPk(o.pk) || !isTag(o.tag) || !title || !by) return null;
      if (typeof o.locked !== 'boolean') return null;
      if (!Number.isInteger(o.n) || (o.n as number) < 1 || (o.n as number) > OFFICE_MAX_PEOPLE)
        return null;
      return {
        v: 2,
        t: 'room',
        id: o.id,
        pk: o.pk as string,
        tag: o.tag,
        title: takeCodePoints(title, MAX_OFFICE_NAME),
        by: takeCodePoints(by, MAX_ROOM_HOST),
        locked: o.locked,
        n: o.n as number,
      };
    }
    case 'ask':
      return isWireId(o.from) && isWireId(o.to) && isPk(o.pk) && isNonce(o.n) && isCipher(o.c)
        ? { v: 2, t: 'ask', from: o.from, to: o.to, pk: o.pk as string, n: o.n, c: o.c }
        : null;
    case 'admit':
      return isWireId(o.from) && isWireId(o.to) && isNonce(o.n) && isCipher(o.c)
        ? { v: 2, t: 'admit', from: o.from, to: o.to, n: o.n, c: o.c }
        : null;
    default:
      return null;
  }
}
