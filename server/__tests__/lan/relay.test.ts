import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createServer as createNetServer } from 'node:net';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocketServer } from 'ws';

import { closeReason, type PubWire } from '../../../core/src/relay.js';
import {
  RELAY_RETRY_FULL_JITTER_MS,
  RELAY_RETRY_FULL_MS,
  RELAY_RETRY_MAX_MS,
  RELAY_RETRY_MIN_MS,
  RELAY_URL,
} from '../../src/constants.js';
import {
  Relay,
  relayKick,
  type RelayOptions,
  type RelayStatus,
  relayUrl,
  retryAfter,
} from '../../src/lan/relay.js';

const PK = 'A'.repeat(42) + 'A=';
const until = async (f: () => boolean): Promise<void> => {
  for (let i = 0; i < 200 && !f(); i++) await new Promise((r) => setTimeout(r, 10));
  expect(f()).toBe(true);
};

const ROSTER = JSON.stringify({ t: 'roster', peers: [] });
const cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup.splice(0).forEach((f) => f());
  vi.restoreAllMocks();
});

async function fake(onConn?: (ws: import('ws').WebSocket) => void) {
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  const msgs: string[] = [];
  const urls: string[] = [];
  wss.on('connection', (ws, req) => {
    urls.push(req.url ?? '');
    ws.on('message', (m) => msgs.push(String(m)));
    if (onConn) onConn(ws);
    else ws.send(ROSTER);
  });
  cleanup.push(() => wss.close());
  await new Promise((r) => wss.once('listening', r));
  return { wss, msgs, urls, url: `ws://127.0.0.1:${(wss.address() as AddressInfo).port}/ws` };
}

function mk(url: string, now = () => Date.now(), extra: Partial<RelayOptions> = {}) {
  const ev = { down: [] as unknown[], open: 0, closed: 0, status: [] as RelayStatus[] };
  const r = new Relay({
    url,
    id: 'me',
    pk: PK,
    version: '1.0',
    onDown: (f) => ev.down.push(f),
    onOpen: () => ev.open++,
    onClosed: () => ev.closed++,
    onStatus: (s) => ev.status.push(s),
    now,
    rand: () => 0,
    ...extra,
  });
  cleanup.push(() => r.stop());
  return { r, ev };
}

describe('relayUrl', () => {
  it('allows wss and loopback ws only', () => {
    const e = (v?: string) => relayUrl(v ? { PIXEL_OFFICE_RELAY_URL: v } : {});
    expect(e('ws://evil.com/ws')).toBe('');
    expect(e('ws://127.0.0.1:9/ws')).toBe('ws://127.0.0.1:9/ws');
    expect(e('wss://x.workers.dev/ws')).toBe('wss://x.workers.dev/ws');
    expect(e('nonsense')).toBe('');
    expect(e()).toBe(RELAY_URL);
  });
});

describe('retryAfter', () => {
  it('uses relative ms', () => {
    const z = () => 0;
    expect(retryAfter('budget', 1000, 0, z)).toBe(1000);
    expect(retryAfter('kicked', 5000, 3, z)).toBe(5000);
    expect(retryAfter('full', undefined, 0, z)).toBe(RELAY_RETRY_FULL_MS);
    expect(retryAfter('full', undefined, 0, () => 0.5)).toBe(
      RELAY_RETRY_FULL_MS + 0.5 * RELAY_RETRY_FULL_JITTER_MS,
    );
    expect(retryAfter('other', undefined, 10, z)).toBe(RELAY_RETRY_MAX_MS);
    expect(retryAfter('bad', undefined, 1, z)).toBe(RELAY_RETRY_MIN_MS * 2);
    expect(retryAfter('replaced', undefined, 0, z)).toBe(Infinity);
  });
});

describe('Relay', () => {
  it('connects, passes frames, sends', async () => {
    const f = await fake();
    const { r, ev } = mk(f.url);
    r.want(true);
    await until(() => r.connected());
    expect(ev.open).toBe(1);
    await until(() => ev.down.length === 1);
    expect(ev.down[0]).toMatchObject({ t: 'roster' });
    expect(f.urls[0]).toBe('/ws?id=me&pk=' + encodeURIComponent(PK) + '&v=1.0');
    const w: PubWire = { v: 2, t: 'pub', from: 'me', to: 'x', n: 'n', c: 'c' };
    expect(r.send([w])).toBe(true);
    await until(() => f.msgs.some((m) => m.includes('"send"')));
    expect(r.send([{ ...w, c: 'x'.repeat(600_000) }])).toBe(false);
  });

  it('full close (accepted, then closed before any roster): status, never opened, no instant reconnect', async () => {
    const f = await fake((ws) => ws.close(4020, closeReason('full')));
    const { r, ev } = mk(f.url);
    r.want(true);
    await until(() => r.status.state === 'full');
    expect(r.status).toEqual({ state: 'full', retryInMs: RELAY_RETRY_FULL_MS });
    expect(ev.open).toBe(0);
    expect(ev.closed).toBe(0);
    r.want(true);
    await new Promise((x) => setTimeout(x, 100));
    expect(f.urls.length).toBe(1);
    expect(r.send([])).toBe(false);
  });

  it('an accept-then-close refusal (bad) backs off and never opens', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const f = await fake((ws) => ws.close(4024, closeReason('bad')));
    let t = 1000;
    const { r, ev } = mk(f.url, () => t);
    const seen: number[] = [];
    for (let i = 0; i < 3; i++) {
      r.want(true);
      await until(() => f.urls.length === i + 1 && r.status.retryInMs !== undefined);
      await until(() => r.status.state === 'error');
      seen.push(r.status.retryInMs ?? 0);
      expect(r.connected()).toBe(false);
      t += r.status.retryInMs ?? 0;
    }
    expect(seen).toEqual([5000, 10_000, 20_000]);
    expect(ev.open).toBe(0);
    expect(ev.closed).toBe(0);
    expect(r.status.state).toBe('error');
  });

  it('connected only on the roster; a kick after it closes once', async () => {
    let sock: import('ws').WebSocket | undefined;
    const f = await fake((ws) => (sock = ws));
    const { r, ev } = mk(f.url);
    r.want(true);
    await until(() => sock !== undefined);
    await new Promise((x) => setTimeout(x, 50));
    expect(r.status.state).toBe('connecting');
    expect(ev.open).toBe(0);
    sock!.send(ROSTER);
    await until(() => r.connected());
    expect(ev.open).toBe(1);
    expect(ev.down).toEqual([{ t: 'roster', peers: [] }]);
    sock!.close(4022, closeReason('kicked', 60_000));
    await until(() => r.status.state === 'kicked');
    expect(r.status).toEqual({ state: 'kicked', retryInMs: 60_000 });
    expect(ev.closed).toBe(1);
  });

  it('no roster within the connect timeout: error, never opened', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const f = await fake(() => {}); // accepts, never sends a roster
    const { r, ev } = mk(f.url, undefined, { connectTimeoutMs: 50 });
    r.want(true);
    await until(() => r.status.state === 'error');
    expect(r.status.retryInMs).toBe(RELAY_RETRY_MIN_MS);
    expect(ev.open).toBe(0);
    expect(ev.closed).toBe(0);
  });

  it('backs off and logs once', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    let t = 1000;
    const { r } = mk('ws://127.0.0.1:1/ws', () => t);
    const seen: number[] = [];
    for (let i = 0; i < 3; i++) {
      r.want(true);
      await until(() => r.status.state === 'error' && r.status.retryInMs !== undefined);
      seen.push(r.status.retryInMs ?? 0);
      t += r.status.retryInMs ?? 0;
    }
    expect(seen).toEqual([5000, 10_000, 20_000]);
    const errs = log.mock.calls.filter((c) => String(c[0]).includes(': error'));
    expect(errs.length).toBe(1);
  });

  it('want(false) closes and goes off', async () => {
    const f = await fake();
    const { r } = mk(f.url);
    r.want(true);
    await until(() => r.connected());
    r.want(false);
    expect(r.status.state).toBe('off');
    await until(() => f.wss.clients.size === 0);
  });
});

describe('Relay liveness', () => {
  it('drops a half-open socket (no pong)', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const f = await fake((ws) => ws.send(ROSTER)); // then swallows pings, never answers
    const { r, ev } = mk(f.url, undefined, { pingMs: 20, pongTimeoutMs: 60 });
    r.want(true);
    await until(() => r.connected());
    await until(() => r.status.state === 'error');
    expect(ev.closed).toBe(1);
    expect(r.connected()).toBe(false);
    expect(r.status.retryInMs).toBe(RELAY_RETRY_MIN_MS);
  });

  it('pong keeps it alive and is not forwarded', async () => {
    const f = await fake((ws) => {
      ws.send(ROSTER);
      ws.on('message', () => ws.send('pong'));
    });
    const { r, ev } = mk(f.url, undefined, { pingMs: 20, pongTimeoutMs: 80 });
    r.want(true);
    await until(() => r.connected());
    await new Promise((x) => setTimeout(x, 250));
    expect(r.connected()).toBe(true);
    expect(ev.down.length).toBe(1); // the roster only
  });

  it('abandons a blackholed connect and retries after backoff', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const socks: import('node:net').Socket[] = [];
    const srv = createNetServer((s) => socks.push(s)); // accepts, never answers
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    cleanup.push(() => {
      socks.forEach((s) => s.destroy());
      srv.close();
    });
    let t = 1000;
    const url = `ws://127.0.0.1:${(srv.address() as AddressInfo).port}/ws`;
    const { r, ev } = mk(url, () => t, { connectTimeoutMs: 50 });
    r.want(true);
    expect(r.status.state).toBe('connecting');
    await until(() => r.status.state === 'error');
    expect(ev.closed).toBe(0);
    expect(r.status.retryInMs).toBe(RELAY_RETRY_MIN_MS);
    r.want(true);
    expect(socks.length).toBe(1);
    t += RELAY_RETRY_MIN_MS;
    r.want(true);
    // second attempt also blackholed: backoff doubled
    await until(() => r.status.retryInMs === RELAY_RETRY_MIN_MS * 2);
  });

  it('connected() is false inside onClosed on want(false)', async () => {
    const f = await fake();
    let inside: boolean | null = null;
    const { r } = mk(f.url, undefined, { onClosed: () => (inside = r.connected()) });
    r.want(true);
    await until(() => r.connected());
    r.want(false);
    expect(inside).toBe(false);
  });
});

describe('relayKick', () => {
  it('posts with bearer and maps results', async () => {
    let seen: { auth?: string; body: string; url?: string } = { body: '' };
    let code = 200;
    const srv = createServer((req, res) => {
      let b = '';
      req.on('data', (d) => (b += d));
      req.on('end', () => {
        seen = { auth: req.headers.authorization, body: b, url: req.url };
        res.statusCode = code;
        res.end();
      });
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    cleanup.push(() => srv.close());
    const url = `ws://127.0.0.1:${(srv.address() as AddressInfo).port}/ws`;
    expect(await relayKick(url, 'tok', 'bad-peer')).toEqual({ ok: true });
    expect(seen).toEqual({ auth: 'Bearer tok', body: '{"id":"bad-peer"}', url: '/admin/kick' });
    code = 401;
    expect(await relayKick(url, 'tok', 'x')).toEqual({ ok: false, reason: 'auth' });
    code = 500;
    expect(await relayKick(url, 'tok', 'x')).toEqual({ ok: false, reason: 'bad' });
    expect(await relayKick('ws://127.0.0.1:1/ws', 'tok', 'x')).toEqual({
      ok: false,
      reason: 'network',
    });
  });
});
