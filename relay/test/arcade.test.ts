import { describe, expect, it } from 'vitest';

import {
  ARCADE_TICKET_TTL_MS,
  type ArcadeRow,
  type ArcadeSubmit,
  parseArcadeBoard,
  parseArcadeResult,
  parseArcadeSubmit,
  parseArcadeTicket,
} from '../../core/src/arcade.js';
import { GAME_TICK_MS } from '../../core/src/constants.js';
import { newRun, Recorder, tick } from '../../core/src/games/replay.js';
import type { GameId } from '../../core/src/lan.js';
import {
  checkTicket,
  hmacHex,
  judge,
  placeScore,
  sameText,
  ticketMessage,
  usedExpiredEnd,
  usedKey,
} from '../src/arcade.js';

const NOW = Date.parse('2026-11-13T12:00:00Z');
const SECRET = 'k'.repeat(64);
const row = (id: string, score: number, at = NOW): ArcadeRow => ({ id, name: id, score, at });

/** A bugs run (30 s round) whacking monitor 4 every 50 ticks; returns its inputs and ticks. */
function playBugs(seed: number): { inputs: number[]; ticks: number } {
  const rec = new Recorder(newRun('bugs', seed));
  while (!rec.run.s.over) {
    if (rec.run.ticks % 50 === 0) rec.act(4);
    tick(rec.run);
  }
  return { inputs: rec.inputs, ticks: rec.run.ticks };
}

async function ticket(id: string, game: GameId, seed: number, issued: number) {
  return {
    id,
    game,
    seed,
    issued,
    sig: await hmacHex(SECRET, ticketMessage(id, game, seed, issued)),
  };
}

describe('placeScore', () => {
  it('inserts sorted and ranks', () => {
    const r = placeScore([row('a', 300), row('b', 100)], row('c', 200), 50);
    expect(r.board.map((x) => x.id)).toEqual(['a', 'c', 'b']);
    expect(r).toMatchObject({ changed: true, best: 200, rank: 2 });
  });
  it('replaces an id only with a better score, updating the name', () => {
    const board = [row('a', 300), row('b', 100)];
    expect(placeScore(board, row('b', 50), 50)).toMatchObject({
      changed: false,
      best: 100,
      rank: 2,
    });
    const r = placeScore(board, { ...row('b', 400), name: 'new' }, 50);
    expect(r.board).toHaveLength(2);
    expect(r.board[0]).toMatchObject({ id: 'b', name: 'new', score: 400 });
    expect(r.rank).toBe(1);
  });
  it('keeps the board size; a too-low score is not on it', () => {
    const board = [row('a', 300), row('b', 200)];
    expect(placeScore(board, row('c', 100), 2)).toMatchObject({
      changed: false,
      rank: null,
      best: 100,
    });
    const r = placeScore(board, row('c', 250), 2);
    expect(r.board.map((x) => x.id)).toEqual(['a', 'c']);
  });
  it('a zero score changes nothing; ties keep the earlier holder ahead', () => {
    expect(placeScore([], row('a', 0), 50)).toMatchObject({ changed: false, rank: null, best: 0 });
    const r = placeScore([row('a', 100, NOW)], row('b', 100, NOW + 1), 50);
    expect(r.rank).toBe(2);
  });
});

describe('tickets', () => {
  it('accepts a fresh signed ticket, refuses tampering and age', async () => {
    const t = await ticket('pc1', 'bugs', 7, NOW);
    const sub: ArcadeSubmit = { ...t, name: 'x', inputs: [] };
    expect(await checkTicket(sub, SECRET, NOW + 1000)).toBeNull();
    expect(await checkTicket({ ...sub, seed: 8 }, SECRET, NOW)).toBe('sig');
    expect(await checkTicket({ ...sub, id: 'pc2' }, SECRET, NOW)).toBe('sig');
    expect(await checkTicket(sub, 'other', NOW)).toBe('sig');
    expect(await checkTicket(sub, SECRET, NOW + ARCADE_TICKET_TTL_MS + 1)).toBe('expired');
    // reuse: the hub refuses a ticket whose usedKey is stored; the key is fixed per ticket
    expect(usedKey(sub.issued, sub.sig)).toBe(usedKey(t.issued, t.sig));
    expect(usedKey(sub.issued, sub.sig)).not.toBe(usedKey(sub.issued, 'b'.repeat(64)));
  });
  it('used keys sort by issued time and expire by TTL', () => {
    expect(usedKey(9, 'f') < usedKey(10, 'a')).toBe(true);
    const later = NOW + ARCADE_TICKET_TTL_MS + 1;
    expect(usedKey(NOW, 'a') < usedExpiredEnd(later)).toBe(true);
    expect(usedKey(NOW + 2, 'a') < usedExpiredEnd(later)).toBe(false);
  });
  it('sameText', () => {
    expect(sameText('abc', 'abc')).toBe(true);
    expect(sameText('abc', 'abd')).toBe(false);
    expect(sameText('abc', 'abcd')).toBe(false);
  });
});

describe('judge (replay)', () => {
  it('replays a recorded run to the same score', async () => {
    const { inputs, ticks } = playBugs(123);
    const wall = ticks * GAME_TICK_MS;
    const t = await ticket('pc1', 'bugs', 123, NOW);
    const sub = parseArcadeSubmit({ ...t, name: ' Kim‮ ', inputs });
    expect(sub?.name).toBe('Kim');
    expect(await checkTicket(sub!, SECRET, NOW + wall)).toBeNull();
    const v = judge(sub!, NOW + wall);
    expect(v).toHaveProperty('score');
    // same seed + inputs = same score, every time
    expect(judge(sub!, NOW + wall)).toEqual(v);
  });
  it('refuses a run faster than wall time', async () => {
    const { inputs, ticks } = playBugs(5);
    const t = await ticket('pc1', 'bugs', 5, NOW);
    const sub = parseArcadeSubmit({ ...t, name: 'a', inputs })!;
    expect(judge(sub, NOW + ticks * GAME_TICK_MS - 6000)).toEqual({ error: 'time' });
  });
  it('refuses a malformed replay', async () => {
    const t = await ticket('pc1', 'bugs', 5, NOW);
    expect(judge({ ...t, name: 'a', inputs: [1e12, 0] }, NOW)).toEqual({ error: 'replay' });
  });
});

describe('parsers', () => {
  it('parseArcadeSubmit rejects bad input', async () => {
    const t = await ticket('pc1', 'bugs', 5, NOW);
    expect(parseArcadeSubmit({ ...t, name: 'a', inputs: [1] })).toBeNull();
    expect(parseArcadeSubmit({ ...t, name: 'a', inputs: [-1, 0] })).toBeNull();
    expect(parseArcadeSubmit({ ...t, name: '​', inputs: [] })).toBeNull();
    expect(parseArcadeSubmit({ ...t, game: 'chess', name: 'a', inputs: [] })).toBeNull();
    expect(parseArcadeSubmit({ ...t, sig: 'xx', name: 'a', inputs: [] })).toBeNull();
    expect(parseArcadeSubmit(null)).toBeNull();
  });
  it('ticket / result / board', () => {
    expect(parseArcadeTicket({ seed: 2 ** 32, issued: NOW, sig: 'a'.repeat(64) })).toBeNull();
    expect(parseArcadeTicket({ seed: 1, issued: NOW, sig: 'a'.repeat(64) })).toEqual({
      seed: 1,
      issued: NOW,
      sig: 'a'.repeat(64),
    });
    expect(parseArcadeResult({ score: 5, best: 9, rank: null })).toEqual({
      score: 5,
      best: 9,
      rank: null,
    });
    expect(parseArcadeResult({ score: 5, best: 9, rank: 0 })).toBeNull();
    expect(
      parseArcadeBoard({
        boards: { breaker: [row('a', 10), { id: 'b', name: 'b', score: -1, at: 1 }] },
      }),
    ).toEqual({ cable: [], bugs: [], breaker: [row('a', 10)], drone: [], merge: [] });
    expect(parseArcadeBoard({})).toBeNull();
  });
});
