// Lounge arcade: the relay's hall of fame and the ticket round trip to this PC's server.
import type { GameId } from '../../../core/src/lan.js';
import type {
  ArcadeBoard,
  ArcadeRow,
  ArcadeTicket,
  ArcadeTicketMessage,
  ClientMessage,
} from '../../../core/src/messages.js';
import { ARCADE_TICKET_WAIT_MS } from '../constants.js';

/** arcadeTicket / arcadeResult / arcadeBoard from the server, as MessageEvents (`data` = message). */
export const arcadeEvents = new EventTarget();

let nextReq = 1;
/** Ask for a run's ticket; null = the relay could not be reached (or no answer in time): unranked. */
export function requestTicket(
  game: GameId,
  send: (msg: ClientMessage) => void,
): Promise<ArcadeTicket | null> {
  const req = nextReq++;
  return new Promise((resolve) => {
    const done = (tk: ArcadeTicket | null) => {
      clearTimeout(timer);
      arcadeEvents.removeEventListener('arcadeTicket', on);
      resolve(tk);
    };
    const on = (e: Event) => {
      const m = (e as MessageEvent).data as ArcadeTicketMessage;
      if (m.req === req) done(m.ticket ?? null);
    };
    const timer = setTimeout(() => done(null), ARCADE_TICKET_WAIT_MS);
    arcadeEvents.addEventListener('arcadeTicket', on);
    send({ type: 'arcadeStart', game, req });
  });
}

export type Boards = NonNullable<ArcadeBoard['boards']>;

export interface RankRow extends ArcadeRow {
  /** 1-based; equal scores share a rank (1, 2, 2, 4). */
  rank: number;
  self: boolean;
  /** Live in the office on screen now. */
  online: boolean;
}

/** One game's hall of fame (already best first) with ranks and who is me / online. */
export function rankings(
  rows: readonly ArcadeRow[],
  selfId: string | null,
  online: ReadonlySet<string>,
): RankRow[] {
  const out: RankRow[] = [];
  for (const [i, r] of rows.entries()) {
    const prev = out[i - 1];
    out.push({
      ...r,
      rank: prev && prev.score === r.score ? prev.rank : i + 1,
      self: r.id === selfId,
      online: online.has(r.id),
    });
  }
  return out;
}
