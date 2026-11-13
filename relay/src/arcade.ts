// Pure arcade hall-of-fame decisions (no Cloudflare APIs): ticket signing/checks, the replay
// verdict and the board update. index.ts keeps the secret, the used tickets and the boards.
//
// ponytail: ceilings, by design —
//  - ids are unproven: anyone can start/submit under another peer id (and name), but the run
//    must still really be played on the relay's seed; a fake id only steals the credit.
//  - a bot that plays well is not detected: the replay proves the inputs fit the game, not a human.
//  - slow-motion play is possible: a run only has to fit the wall time within the ticket TTL.
//  - a replay runs synchronously in the one hub (≤ REPLAY_MAX_TICKS); upgrade = a separate DO.
import {
  ARCADE_TICKET_TTL_MS,
  ARCADE_TIME_SLACK_MS,
  type ArcadeError,
  type ArcadeResult,
  type ArcadeRow,
  type ArcadeSubmit,
} from '../../core/src/arcade.js';
import { GAME_TICK_MS } from '../../core/src/constants.js';
import { replay } from '../../core/src/games/replay.js';
import type { GameId } from '../../core/src/lan.js';
import { toHex } from './hub.js';

/** Storage key prefix of used tickets; the issued time is zero-padded so keys sort by time. */
export const USED_PREFIX = 'used:';
const TIME_DIGITS = 15;
export const usedKey = (issued: number, sig: string): string =>
  `${USED_PREFIX}${String(issued).padStart(TIME_DIGITS, '0')}:${sig}`;
/** First key NOT expired at `now` (list `end`, exclusive): used tickets before it can go. */
export const usedExpiredEnd = (now: number): string =>
  `${USED_PREFIX}${String(Math.max(0, now - ARCADE_TICKET_TTL_MS)).padStart(TIME_DIGITS, '0')}`;

export const ticketMessage = (id: string, game: GameId, seed: number, issued: number): string =>
  `${id}|${game}|${seed}|${issued}`;

export async function hmacHex(secret: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}

/** Constant-time string compare (over the longer length). */
export function sameText(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** Signature / age of a parsed submit; null = valid (reuse is checked by the caller's storage). */
export async function checkTicket(
  sub: ArcadeSubmit,
  secret: string,
  now: number,
): Promise<ArcadeError | null> {
  const want = await hmacHex(secret, ticketMessage(sub.id, sub.game, sub.seed, sub.issued));
  if (!sameText(sub.sig, want)) return 'sig';
  if (now - sub.issued > ARCADE_TICKET_TTL_MS || sub.issued > now + ARCADE_TIME_SLACK_MS)
    return 'expired';
  return null;
}

/** Replays the run: its score, or why it is refused (a run cannot be faster than wall time). */
export function judge(sub: ArcadeSubmit, now: number): { score: number } | { error: ArcadeError } {
  const r = replay(sub.game, sub.seed, sub.inputs);
  if (!r) return { error: 'replay' };
  if (r.ticks * GAME_TICK_MS > now - sub.issued + ARCADE_TIME_SLACK_MS) return { error: 'time' };
  return { score: r.score };
}

const byRank = (a: ArcadeRow, b: ArcadeRow): number => b.score - a.score || a.at - b.at;

/**
 * Puts `row` on `board` (sorted, one row per id = its best, ≤ size). A score of 0 or one not
 * above the id's best changes nothing. Ties keep the earlier holder ahead.
 */
export function placeScore(
  board: readonly ArcadeRow[],
  row: ArcadeRow,
  size: number,
): ArcadeResult & { board: ArcadeRow[]; changed: boolean } {
  const i = board.findIndex((r) => r.id === row.id);
  const old = board[i];
  if (row.score <= 0 || (old && old.score >= row.score))
    return {
      board: [...board],
      changed: false,
      score: row.score,
      best: old?.score ?? row.score,
      rank: old ? i + 1 : null,
    };
  const next = [...board.filter((r) => r.id !== row.id), row].sort(byRank).slice(0, size);
  const at = next.indexOf(row);
  return {
    board: next,
    changed: at >= 0,
    score: row.score,
    best: row.score,
    rank: at >= 0 ? at + 1 : null,
  };
}
