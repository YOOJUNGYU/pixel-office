import {
  parseCloseReason,
  parseDown,
  type PubWire,
  RELAY_MAX_FRAME_BYTES,
  RELAY_PATH,
  type RelayCloseKind,
  type RelayDown,
} from '../../../core/src/relay.js';
import {
  RELAY_PING_MS,
  RELAY_RETRY_FULL_MS,
  RELAY_RETRY_JITTER_MS,
  RELAY_RETRY_MAX_MS,
  RELAY_RETRY_MIN_MS,
  RELAY_URL,
  RELAY_URL_ENV,
} from '../constants.js';

export type RelayStateKind =
  'off' | 'connecting' | 'connected' | 'full' | 'budget' | 'kicked' | 'error';
export interface RelayStatus {
  state: RelayStateKind;
  retryInMs?: number;
}

const isLoopbackWs = (u: URL): boolean =>
  u.protocol === 'ws:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost');

/** Env override (tests) first; only wss://, plus ws:// to this machine. Anything else = ''. */
export function relayUrl(env: NodeJS.ProcessEnv): string {
  const raw = env[RELAY_URL_ENV] || RELAY_URL;
  if (!raw) return '';
  try {
    const u = new URL(raw);
    return u.protocol === 'wss:' || isLoopbackWs(u) ? raw : '';
  } catch {
    return '';
  }
}

export function retryAfter(
  kind: RelayCloseKind | 'other',
  ms: number | undefined,
  attempt: number,
  rand: () => number,
): number {
  switch (kind) {
    case 'full':
      return RELAY_RETRY_FULL_MS;
    case 'budget':
      return (ms ?? 0) + rand() * RELAY_RETRY_JITTER_MS;
    case 'kicked':
      return ms ?? RELAY_RETRY_MAX_MS;
    case 'replaced':
      return Infinity;
    default:
      return Math.min(RELAY_RETRY_MIN_MS * 2 ** attempt, RELAY_RETRY_MAX_MS);
  }
}

export interface RelayOptions {
  url: string;
  id: string;
  pk: string;
  version: string;
  onDown(f: RelayDown): void;
  onOpen(): void;
  onClosed(): void;
  onStatus(s: RelayStatus): void;
  now?: () => number;
  rand?: () => number;
}

export class Relay {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private nextAt = 0;
  private ping: ReturnType<typeof setInterval> | null = null;
  private st: RelayStatus = { state: 'off' };
  private readonly now: () => number;
  private readonly rand: () => number;

  constructor(private readonly o: RelayOptions) {
    this.now = o.now ?? Date.now;
    this.rand = o.rand ?? Math.random;
  }

  get status(): RelayStatus {
    return this.st;
  }
  connected(): boolean {
    return this.st.state === 'connected';
  }

  private set(s: RelayStatus): void {
    const changed = s.state !== this.st.state;
    this.st = s;
    if (changed) console.log(`[Pixel Office] 인터넷 공개 오피스: ${s.state}`);
    this.o.onStatus(s);
  }

  want(on: boolean): void {
    if (!on) {
      this.close();
      this.attempt = 0;
      this.nextAt = 0;
      if (this.st.state !== 'off') this.set({ state: 'off' });
      return;
    }
    if (this.ws || !this.o.url || this.now() < this.nextAt) return;
    this.connect();
  }

  send(w: PubWire[]): boolean {
    if (!this.ws || !this.connected()) return false;
    const text = JSON.stringify({ t: 'send', w });
    if (Buffer.byteLength(text) > RELAY_MAX_FRAME_BYTES) return false;
    this.ws.send(text);
    return true;
  }

  stop(): void {
    this.want(false);
  }

  private connect(): void {
    const q = `id=${encodeURIComponent(this.o.id)}&pk=${encodeURIComponent(this.o.pk)}&v=${encodeURIComponent(this.o.version)}`;
    const u = new URL(this.o.url);
    u.pathname = u.pathname === '/' ? RELAY_PATH : u.pathname;
    u.search = q;
    let opened = false;
    let ws: WebSocket;
    try {
      ws = new WebSocket(u.toString());
    } catch {
      this.fail('other', undefined, false);
      return;
    }
    this.ws = ws;
    // stay 'error' while retrying: one log line per outage
    if (this.st.state !== 'error') this.set({ state: 'connecting' });
    ws.addEventListener('open', () => {
      if (this.ws !== ws) return;
      opened = true;
      this.attempt = 0;
      this.set({ state: 'connected' });
      this.ping = setInterval(() => {
        if (ws.readyState === 1) ws.send('ping');
      }, RELAY_PING_MS);
      this.ping.unref();
      this.o.onOpen();
    });
    ws.addEventListener('message', (e) => {
      if (this.ws !== ws || typeof e.data !== 'string') return;
      const f = parseDown(e.data);
      if (f) this.o.onDown(f);
    });
    ws.addEventListener('close', (e) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.clearPing();
      const { kind, ms } = parseCloseReason(e.code, e.reason);
      this.fail(kind, ms, opened);
    });
    ws.addEventListener('error', () => {
      // 'close' follows
    });
  }

  private fail(kind: RelayCloseKind | 'other', ms: number | undefined, opened: boolean): void {
    const wait = retryAfter(kind, ms, this.attempt, this.rand);
    this.attempt++;
    this.nextAt = this.now() + wait;
    const state: RelayStateKind =
      kind === 'full' || kind === 'budget' || kind === 'kicked' ? kind : 'error';
    this.set(Number.isFinite(wait) ? { state, retryInMs: wait } : { state });
    if (opened) this.o.onClosed();
  }

  private clearPing(): void {
    if (this.ping) clearInterval(this.ping);
    this.ping = null;
  }

  private close(): void {
    const ws = this.ws;
    this.ws = null;
    this.clearPing();
    if (!ws) return;
    const wasOpen = this.st.state === 'connected';
    try {
      ws.close();
    } catch {
      // already closed
    }
    if (wasOpen) this.o.onClosed();
  }
}

export async function relayKick(
  url: string,
  token: string,
  id: string,
): Promise<{ ok: boolean; reason?: 'auth' | 'network' | 'bad' }> {
  try {
    const u = new URL(url);
    if (u.protocol === 'wss:') u.protocol = 'https:';
    else if (isLoopbackWs(u)) u.protocol = 'http:';
    else return { ok: false, reason: 'bad' };
    const res = await fetch(`${u.origin}/admin/kick`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true };
    return { ok: false, reason: res.status === 401 ? 'auth' : 'bad' };
  } catch {
    return { ok: false, reason: 'network' };
  }
}
