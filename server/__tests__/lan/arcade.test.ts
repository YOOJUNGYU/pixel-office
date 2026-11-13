import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { handleClientMessage } from '../../src/clientMessageHandler.js';
import { FileStateAdapter } from '../../src/fileStateAdapter.js';
import { arcadeClient } from '../../src/lan/arcade.js';
import { LanService } from '../../src/lan/office.js';
import { loadProfile } from '../../src/lan/profile.js';
import { relayHttpOrigin } from '../../src/lan/relay.js';

const TICKET = { seed: 7, issued: 1000, sig: 'a'.repeat(64) };
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('arcade (this PC ↔ relay)', () => {
  let dir = '';
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  it('relayHttpOrigin: wss → https, loopback ws → http, anything else refused', () => {
    expect(relayHttpOrigin('wss://r.example.dev/ws')).toBe('https://r.example.dev');
    expect(relayHttpOrigin('ws://127.0.0.1:8787/ws')).toBe('http://127.0.0.1:8787');
    expect(relayHttpOrigin('ws://evil.example/ws')).toBeNull();
    expect(relayHttpOrigin('')).toBeNull();
  });

  it('messages: ticket and run go to the relay with my id + label; answers to the asking socket', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-arcade-'));
    const lan = new LanService(loadProfile(dir), { views: () => [] }, dir);
    const calls: Array<{ url: string; body?: unknown }> = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, body });
      const json = url.endsWith('/arcade/start')
        ? TICKET
        : url.endsWith('/arcade/submit')
          ? { score: 120, best: 300, rank: 2 }
          : { boards: { breaker: [{ id: lan.self().id, name: 'x', score: 300, at: 5 }] } };
      return new Response(JSON.stringify(json), { status: 200 });
    });
    const arcade = arcadeClient('wss://r.example.dev/ws');
    const sent: Array<Record<string, unknown>> = [];
    const ctx = { adapter: new FileStateAdapter(), cache: null, lan, privileged: true, arcade };
    const send = (m: Record<string, unknown>) => sent.push(m);

    handleClientMessage({ type: 'arcadeStart', game: 'breaker', req: 3 }, send, ctx);
    await flush();
    expect(sent.at(-1)).toEqual({ type: 'arcadeTicket', game: 'breaker', req: 3, ticket: TICKET });
    expect(calls[0]).toEqual({
      url: 'https://r.example.dev/arcade/start',
      body: { id: lan.self().id, game: 'breaker' },
    });

    handleClientMessage(
      { type: 'submitScore', game: 'breaker', ticket: TICKET, inputs: [0, 1, 5, 4] },
      send,
      ctx,
    );
    await flush();
    await flush();
    expect(calls[1].body).toMatchObject({
      id: lan.self().id,
      game: 'breaker',
      inputs: [0, 1, 5, 4],
      ...TICKET,
    });
    expect(typeof (calls[1].body as { name: string }).name).toBe('string');
    expect(sent.slice(-2)).toEqual([
      { type: 'arcadeResult', game: 'breaker', ok: true, score: 120, best: 300, rank: 2 },
      {
        type: 'arcadeBoard',
        boards: {
          breaker: [{ id: lan.self().id, name: 'x', score: 300, at: 5 }],
          cable: [],
          drone: [],
          merge: [],
          bugs: [],
        },
      },
    ]);

    // A malformed run never reaches the relay.
    handleClientMessage(
      { type: 'submitScore', game: 'breaker', ticket: { seed: -1 }, inputs: [] },
      send,
      ctx,
    );
    await flush();
    await flush();
    expect(calls).toHaveLength(3);
    expect(sent.at(-2)).toEqual({
      type: 'arcadeResult',
      game: 'breaker',
      ok: false,
      reason: 'bad',
    });
  });

  it('no relay / unreachable: no ticket, unranked', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('offline');
    });
    const arcade = arcadeClient('wss://r.example.dev/ws')!;
    expect(await arcade.start('p', 'bugs')).toBeNull();
    expect(await arcade.board()).toBeNull();
    expect(arcadeClient('')).toBeNull();
  });
});
