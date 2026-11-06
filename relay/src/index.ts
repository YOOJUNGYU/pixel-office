// Cloudflare Worker + the one Durable Object "hub": a thin shell around the pure decisions
// in hub.ts. The Worker checks the admin token and forwards /ws and /admin/* to the hub.
import { DurableObject } from 'cloudflare:workers';

import {
  closeReason,
  isPeerId,
  RELAY_CLOSE,
  RELAY_PATH,
  type RelayCloseKind,
  type RelayDown,
} from '../../core/src/relay.js';
import {
  admit,
  authorized,
  charge,
  type Conn,
  DEFAULT_LIMITS,
  exhausted,
  type HubState,
  kick,
  type Limits,
  msToReset,
  newState,
  onFrame,
  pruneBans,
  REQUEST_WEIGHT,
  unban,
} from './hub.js';

interface Env {
  HUB: DurableObjectNamespace<Hub>;
  ADMIN_TOKEN?: string;
  MAX_PEERS?: string | number;
  DAILY_BUDGET?: string | number;
  MAX_FRAMES_PER_MIN?: string | number;
  ABUSE_BAN_MIN?: string | number;
  KICK_HOURS?: string | number;
}

/** Messages (budget units) between two writes of HubState to storage. */
const RELAY_BUDGET_FLUSH = 50;
const STATE_KEY = 'state';
const ADMIN = '/admin/';
const BANS = `${ADMIN}bans/`;

/** Socket attachment; `gone` = the hub closed it itself (its leave was already sent). */
type Att = Conn & { gone?: boolean };
type Live = { ws: WebSocket; c: Att };

function limits(env: Env): Limits {
  const pick = (v: string | number | undefined, d: number): number => {
    const n = Number(v);
    return v !== undefined && Number.isFinite(n) && n > 0 ? n : d;
  };
  const d = DEFAULT_LIMITS;
  return {
    maxPeers: pick(env.MAX_PEERS, d.maxPeers),
    dailyBudget: pick(env.DAILY_BUDGET, d.dailyBudget),
    maxFramesPerMin: pick(env.MAX_FRAMES_PER_MIN, d.maxFramesPerMin),
    abuseBanMin: pick(env.ABUSE_BAN_MIN, d.abuseBanMin),
    kickHours: pick(env.KICK_HOURS, d.kickHours),
  };
}

const json = (body: unknown, status = 200): Response => Response.json(body, { status });
const send = (ws: WebSocket, m: RelayDown): void => {
  try {
    ws.send(JSON.stringify(m));
  } catch {
    // closing socket: its webSocketClose cleans up
  }
};

export class Hub extends DurableObject<Env> {
  private s: HubState = newState(Date.now());
  private readonly l: Limits;
  private unsaved = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.l = limits(env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    void ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<HubState>(STATE_KEY);
      if (saved) this.s = saved;
      pruneBans(this.s, Date.now());
    });
  }

  private save(): void {
    this.unsaved = 0;
    void this.ctx.storage.put(STATE_KEY, this.s);
  }

  /** Counts `n` messages; true when this charge used up the budget (everyone was closed). */
  private spend(n: number, now: number): boolean {
    const was = exhausted(this.s, this.l);
    charge(this.s, n, now);
    // ponytail: 잠들기 직전 최대 49 건 미기록, 예산 90% 여유로 흡수
    this.unsaved += n;
    if (this.unsaved >= RELAY_BUDGET_FLUSH) this.save();
    if (was || !exhausted(this.s, this.l)) return false;
    this.save();
    const ms = msToReset(now);
    for (const x of this.live()) this.drop(x, 'budget', ms, false);
    return true;
  }

  private live(): Live[] {
    const out: Live[] = [];
    for (const ws of this.ctx.getWebSockets()) {
      const c = ws.deserializeAttachment() as Att | null;
      if (c && !c.gone) out.push({ ws, c });
    }
    return out;
  }

  /** Closes a socket with a relay code; others get `leave` unless `announce` is false. */
  private drop(x: Live, kind: RelayCloseKind, ms?: number, announce = true): void {
    x.c.gone = true;
    x.ws.serializeAttachment(x.c);
    try {
      x.ws.close(RELAY_CLOSE[kind], closeReason(kind, ms));
    } catch {
      // already closed
    }
    if (announce) for (const o of this.live()) send(o.ws, { t: 'leave', id: x.c.id });
  }

  override async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const now = Date.now();
    this.spend(REQUEST_WEIGHT, now);
    return url.pathname === RELAY_PATH ? this.upgrade(url, now) : this.admin(req, url, now);
  }

  /** Rejected upgrades are still accepted, then closed, so the client can read the code. */
  private refuse(kind: RelayCloseKind, ms?: number): Response {
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    server.accept();
    server.close(RELAY_CLOSE[kind], closeReason(kind, ms));
    return new Response(null, { status: 101, webSocket: client });
  }

  private upgrade(url: URL, now: number): Response {
    pruneBans(this.s, now);
    const id = url.searchParams.get('id') ?? '';
    const pk = url.searchParams.get('pk') ?? '';
    let live = this.live();
    const verdict = admit(
      this.s,
      live.map((x) => x.c),
      id,
      pk,
      now,
      this.l,
    );
    if (!verdict.ok) return this.refuse(verdict.kind, verdict.ms);
    if (verdict.replace) {
      const old = live.find((x) => x.c === verdict.replace);
      if (old) this.drop(old, 'replaced');
      live = live.filter((x) => x !== old);
    }
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    const me: Att = { id, pk, frames: [] };
    server.serializeAttachment(me);
    send(server, { t: 'roster', peers: live.map((x) => ({ id: x.c.id, pk: x.c.pk })) });
    for (const o of live) send(o.ws, { t: 'join', id, pk });
    return new Response(null, { status: 101, webSocket: client });
  }

  private async admin(req: Request, url: URL, now: number): Promise<Response> {
    const path = url.pathname;
    if (req.method === 'POST' && path === `${ADMIN}kick`) {
      let body: { id?: unknown; hours?: unknown };
      try {
        body = await req.json();
      } catch {
        return json({ error: 'bad json' }, 400);
      }
      const hours = body?.hours ?? this.l.kickHours;
      if (!isPeerId(body?.id) || typeof hours !== 'number' || !Number.isFinite(hours) || hours <= 0)
        return json({ error: 'bad id or hours' }, 400);
      const id = body.id;
      const until = kick(this.s, id, hours, now);
      this.save();
      for (const x of this.live()) if (x.c.id === id) this.drop(x, 'kicked', until - now);
      return json({ until });
    }
    if (req.method === 'GET' && path === `${ADMIN}bans`) {
      pruneBans(this.s, now);
      return json({ bans: this.s.bans });
    }
    if (req.method === 'DELETE' && path.startsWith(BANS)) {
      let id: string;
      try {
        id = decodeURIComponent(path.slice(BANS.length));
      } catch {
        return json({ error: 'bad id' }, 400);
      }
      const ok = unban(this.s, id);
      if (ok) this.save();
      return json({ ok });
    }
    if (req.method === 'GET' && path === `${ADMIN}stats`)
      return json({
        peers: this.live().length,
        used: this.s.used,
        budget: this.l.dailyBudget,
        day: this.s.day,
      });
    return json({ error: 'not found' }, 404);
  }

  override async webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer): Promise<void> {
    const me = ws.deserializeAttachment() as Att | null;
    if (!me || me.gone) return;
    const now = Date.now();
    if (this.spend(1, now)) return;
    const live = this.live();
    const r = onFrame(
      this.s,
      me,
      typeof msg === 'string' ? msg : '',
      live.map((x) => x.c),
      now,
      this.l,
    );
    if ('close' in r) {
      this.save();
      this.drop({ ws, c: me }, r.close, r.ms);
      return;
    }
    ws.serializeAttachment(me);
    for (const [to, w] of r.deliver) {
      const target = live.find((x) => x.c.id === to);
      if (target) send(target.ws, { t: 'w', w });
    }
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    this.gone(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    this.gone(ws);
  }

  /** The client went away: tell the rest, unless the hub closed it (leave already sent). */
  private gone(ws: WebSocket): void {
    const c = ws.deserializeAttachment() as Att | null;
    if (c && !c.gone) {
      const rest = this.live().filter((x) => x.ws !== ws);
      if (!rest.some((x) => x.c.id === c.id))
        for (const o of rest) send(o.ws, { t: 'leave', id: c.id });
    }
    try {
      ws.close();
    } catch {
      // already closed
    }
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (pathname === RELAY_PATH) {
      if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
        return new Response('expected websocket', { status: 426 });
    } else if (pathname.startsWith(ADMIN)) {
      if (!authorized(req.headers.get('Authorization'), env.ADMIN_TOKEN ?? ''))
        return new Response('unauthorized', { status: 401 });
    } else return new Response('not found', { status: 404 });
    return env.HUB.get(env.HUB.idFromName('hub')).fetch(req);
  },
} satisfies ExportedHandler<Env>;
