// The lounge arcade's hall of fame lives on the internet relay (relay/src/arcade.ts): this
// PC's server asks it for run tickets, hands it finished runs (seed + inputs, which it
// replays itself) and reads the boards. The browser never talks to the relay.
import type { ArcadeBoards, ArcadeError, ArcadeTicket } from '../../../core/src/arcade.js';
import {
  ARCADE_BOARD_PATH,
  ARCADE_START_PATH,
  ARCADE_SUBMIT_PATH,
  parseArcadeBoard,
  parseArcadeResult,
  parseArcadeSubmit,
  parseArcadeTicket,
} from '../../../core/src/arcade.js';
import type { GameId } from '../../../core/src/lan.js';
import { ARCADE_BOARD_CACHE_MS, ARCADE_HTTP_TIMEOUT_MS } from '../constants.js';
import { relayHttpOrigin } from './relay.js';

export type ArcadeSubmitResult =
  | { ok: true; score: number; best: number; rank?: number }
  | { ok: false; reason: 'network' | Exclude<ArcadeError, 'budget'> };

export interface ArcadeClient {
  start(id: string, game: GameId): Promise<ArcadeTicket | null>;
  submit(run: {
    id: string;
    name: string;
    game: GameId;
    ticket: unknown;
    inputs: unknown;
  }): Promise<ArcadeSubmitResult>;
  board(): Promise<ArcadeBoards | null>;
}

const REFUSALS = new Set(['bad', 'sig', 'expired', 'used', 'replay', 'time']);

/** `relayUrl` = the relay's WebSocket URL (wss://…/ws); null = no relay (arcade unranked). */
export function arcadeClient(relayUrl: string): ArcadeClient | null {
  const origin = relayHttpOrigin(relayUrl);
  if (!origin) return null;
  let cache: { at: number; boards: ArcadeBoards } | null = null;
  const call = async (path: string, body?: unknown): Promise<{ status: number; json: unknown }> => {
    const res = await fetch(origin + path, {
      method: body === undefined ? 'GET' : 'POST',
      ...(body !== undefined && {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      signal: AbortSignal.timeout(ARCADE_HTTP_TIMEOUT_MS),
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  return {
    async start(id, game) {
      try {
        const { status, json } = await call(ARCADE_START_PATH, { id, game });
        return status === 200 ? parseArcadeTicket(json) : null;
      } catch {
        return null;
      }
    },
    async submit({ id, name, game, ticket, inputs }) {
      const t = parseArcadeTicket(ticket);
      const body = t && parseArcadeSubmit({ id, name, game, ...t, inputs });
      if (!body) return { ok: false, reason: 'bad' };
      try {
        const { status, json } = await call(ARCADE_SUBMIT_PATH, body);
        cache = null; // a new best changes the board
        const r = status === 200 ? parseArcadeResult(json) : null;
        if (r) return { ok: true, score: r.score, best: r.best, ...(r.rank && { rank: r.rank }) };
        const e = (json as { error?: unknown } | null)?.error;
        return {
          ok: false,
          reason: typeof e === 'string' && REFUSALS.has(e) ? (e as 'bad') : 'network',
        };
      } catch {
        return { ok: false, reason: 'network' };
      }
    },
    async board() {
      if (cache && Date.now() - cache.at < ARCADE_BOARD_CACHE_MS) return cache.boards;
      try {
        const { status, json } = await call(ARCADE_BOARD_PATH);
        const boards = status === 200 ? parseArcadeBoard(json) : null;
        if (boards) cache = { at: Date.now(), boards };
        return boards;
      } catch {
        return null;
      }
    },
  };
}
