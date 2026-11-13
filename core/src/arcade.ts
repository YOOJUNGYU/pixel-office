// Arcade hall of fame on the internet relay: HTTP API types + parsers of untrusted input.
// The PC's server asks for a signed ticket (seed), the page plays it, and the relay replays
// the recorded inputs itself to compute the score. No Node-only APIs: also bundled for Workers.
import { REPLAY_MAX_INPUTS } from './games/replay.js';
import {
  cleanNickname,
  GAME_IDS,
  GAME_SCORE_MAX,
  type GameId,
  isGameId,
  takeCodePoints,
} from './lan.js';
import { isPeerId } from './relay.js';

/** A ticket can be submitted this long after it was issued. */
export const ARCADE_TICKET_TTL_MS = 3 * 3_600_000;
/** Rows kept and returned per game. */
export const ARCADE_BOARD_SIZE = 50;
/** Longest name on the board (code points). */
export const ARCADE_NAME_MAX = 40;
/** A replayed run may be this much longer than the wall time since the ticket was issued. */
export const ARCADE_TIME_SLACK_MS = 5000;
export const ARCADE_START_PATH = '/arcade/start';
export const ARCADE_SUBMIT_PATH = '/arcade/submit';
export const ARCADE_BOARD_PATH = '/arcade/board';

/** HTTP error bodies `{error}`: 400 for all but `budget` (503, the relay's day budget is used up). */
export type ArcadeError = 'bad' | 'sig' | 'expired' | 'used' | 'replay' | 'time' | 'budget';

/** POST ARCADE_START_PATH body. */
export interface ArcadeStart {
  id: string;
  game: GameId;
}
/** ARCADE_START_PATH answer: seed = uint32, issued = relay clock (ms), sig = 64 hex. */
export interface ArcadeTicket {
  seed: number;
  issued: number;
  sig: string;
}
/** POST ARCADE_SUBMIT_PATH body; inputs = `Recorder.inputs` of `core/src/games/replay.ts`. */
export interface ArcadeSubmit extends ArcadeStart, ArcadeTicket {
  name: string;
  inputs: number[];
}
/** ARCADE_SUBMIT_PATH answer: the replayed score, the id's best on the board (else the score)
 *  and its 1-based rank there (null = not on the board). */
export interface ArcadeResult {
  score: number;
  best: number;
  rank: number | null;
}
export interface ArcadeRow {
  id: string;
  name: string;
  score: number;
  /** relay clock (ms) when this best was set */
  at: number;
}
export type ArcadeBoards = Record<GameId, ArcadeRow[]>;

type Obj = Record<string, unknown>;
const obj = (x: unknown): Obj | null =>
  x && typeof x === 'object' && !Array.isArray(x) ? (x as Obj) : null;

const UINT32_MAX = 0xffffffff;
const SIG = /^[0-9a-f]{64}$/;
const isTime = (x: unknown): x is number => Number.isSafeInteger(x) && (x as number) > 0;
const isScore = (x: unknown): x is number =>
  Number.isSafeInteger(x) && (x as number) >= 0 && (x as number) <= GAME_SCORE_MAX;

/** A board name: control/bidi/format chars removed, trimmed, ≤ ARCADE_NAME_MAX; empty → null. */
export function cleanArcadeName(x: unknown): string | null {
  if (typeof x !== 'string') return null;
  const s = takeCodePoints(cleanNickname(x), ARCADE_NAME_MAX).trim();
  return s || null;
}

export function parseArcadeStart(x: unknown): ArcadeStart | null {
  const o = obj(x);
  return o && isPeerId(o.id) && isGameId(o.game) ? { id: o.id, game: o.game } : null;
}

export function parseArcadeTicket(x: unknown): ArcadeTicket | null {
  const o = obj(x);
  if (!o || !Number.isInteger(o.seed) || (o.seed as number) < 0 || (o.seed as number) > UINT32_MAX)
    return null;
  if (!isTime(o.issued) || typeof o.sig !== 'string' || !SIG.test(o.sig)) return null;
  return { seed: o.seed as number, issued: o.issued, sig: o.sig };
}

export function parseArcadeSubmit(x: unknown): ArcadeSubmit | null {
  const start = parseArcadeStart(x);
  const ticket = parseArcadeTicket(x);
  const o = x as Obj;
  const name = cleanArcadeName(o?.name);
  if (!start || !ticket || !name || !Array.isArray(o.inputs)) return null;
  const inputs = o.inputs as unknown[];
  if (inputs.length % 2 !== 0 || inputs.length > 2 * REPLAY_MAX_INPUTS) return null;
  if (!inputs.every((n) => Number.isSafeInteger(n) && (n as number) >= 0)) return null;
  return { ...start, ...ticket, name, inputs: inputs as number[] };
}

export function parseArcadeResult(x: unknown): ArcadeResult | null {
  const o = obj(x);
  if (!o || !isScore(o.score) || !isScore(o.best)) return null;
  const rank = o.rank;
  if (rank !== null && !(Number.isInteger(rank) && (rank as number) >= 1)) return null;
  return { score: o.score, best: o.best, rank: rank as number | null };
}

/** GET ARCADE_BOARD_PATH answer `{boards}` → every game's rows (bad rows dropped, missing game = []). */
export function parseArcadeBoard(x: unknown): ArcadeBoards | null {
  const boards = obj(obj(x)?.boards);
  if (!boards) return null;
  const out = {} as ArcadeBoards;
  for (const g of GAME_IDS) {
    const rows = Array.isArray(boards[g]) ? (boards[g] as unknown[]) : [];
    out[g] = [];
    for (const raw of rows.slice(0, ARCADE_BOARD_SIZE)) {
      const r = obj(raw);
      const name = cleanArcadeName(r?.name);
      if (r && isPeerId(r.id) && name && isScore(r.score) && isTime(r.at))
        out[g].push({ id: r.id, name, score: r.score, at: r.at });
    }
  }
  return out;
}
