import { randomBytes } from 'crypto';
import * as dgram from 'dgram';
import { afterEach, describe, expect, it } from 'vitest';
import * as zlib from 'zlib';

import type { AgentView, LayoutRev, PeerPacket } from '../../../core/src/lan.js';
import { DEFAULT_LAYOUT_REV, PUBLIC_VIEW } from '../../../core/src/lan.js';
import type { PubWire, RelayDown } from '../../../core/src/relay.js';
import { RELAY_MAX_FRAME_BYTES } from '../../../core/src/relay.js';
import type { Identity } from '../../src/lan/crypto.js';
import { createIdentity, teamKey, teamTag } from '../../src/lan/crypto.js';
import type { TeamChannel } from '../../src/lan/peerNet.js';
import { fitPacket, PEER_TTL_MS, PeerNet } from '../../src/lan/peerNet.js';
import { quietView } from '../../src/lan/redact.js';
import { layoutHash } from '../../src/lan/sharedLayout.js';

const freePort = (): Promise<number> =>
  new Promise((res) => {
    const s = dgram.createSocket('udp4');
    s.bind(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (f: () => boolean, ms = 5_000) => {
  for (const end = Date.now() + ms; !f() && Date.now() < end;) await sleep(20);
};
const ids = (ps: PeerPacket[]) => ps.map((p) => p.peer.id).sort();

const view = (o: Partial<AgentView> = {}): AgentView => ({
  id: 's1',
  provider: 'claude',
  kind: 'main',
  num: 1,
  room: 'coding',
  permission: false,
  act: 'edit',
  target: 'a.ts',
  reason: '',
  ...o,
});

const clock = { t: 1000 };
const nets: PeerNet[] = [];
const socks: dgram.Socket[] = [];
afterEach(() => {
  nets.splice(0).forEach((n) => n.stop());
  socks.splice(0).forEach((s) => s.close());
  clock.t = 1000;
});

interface Node {
  id: Identity;
  net: PeerNet;
  /** Every relay.send call. */
  sent: PubWire[][];
  wants: boolean[];
  views: AgentView[];
  avatar?: { col: number; row: number; dir: 'up' };
  offices: TeamChannel[];
  /** Apply quietView like LanService.packet does for the public office. */
  quiet: boolean;
  layout: LayoutRev;
  blob: Buffer | null;
  received: LayoutRev[];
  port: number;
}

/** In-memory hub: a node's relay.send routes each wire to its `to` node, synchronously. */
function hub() {
  const nodes = new Map<string, Node>();
  const mk = async (name: string, targets: string[] = []): Promise<Node> => {
    const port = await freePort();
    const node = {
      id: createIdentity(name),
      sent: [],
      wants: [],
      views: [],
      offices: [],
      quiet: true,
      layout: { ...DEFAULT_LAYOUT_REV },
      blob: null,
      received: [],
      port,
    } as Partial<Node> as Node;
    node.net = new PeerNet({
      port,
      identity: node.id,
      getPacket: () => ({
        v: 1,
        peer: { id: node.id.id, account: name, nickname: name, palette: 0, hueShift: 0 },
        views: node.quiet ? node.views.map(quietView) : node.views,
        ...(node.avatar && { avatar: { ...node.avatar } }),
        layout: node.layout,
      }),
      manualPeers: () => [],
      offices: () => node.offices,
      pins: new Map<string, string>(),
      targets: () => targets,
      now: () => clock.t,
      layouts: {
        rev: () => node.layout,
        blob: () => node.blob,
        receive: (_ch, rev) => node.received.push(rev),
      },
      relay: {
        want: (on) => node.wants.push(on),
        connected: () => true,
        send: (w) => {
          if (Buffer.byteLength(JSON.stringify({ t: 'send', w })) > RELAY_MAX_FRAME_BYTES)
            return false;
          node.sent.push(w);
          for (const [to, n] of nodes) {
            const mine = w.filter((x) => x.to === to);
            if (mine.length) n.net.relayDown({ t: 'w', w: mine });
          }
          return true;
        },
      },
    });
    nets.push(node.net);
    await node.net.start();
    nodes.set(node.id.id, node);
    return node;
  };
  const entry = (n: Node, net?: string) => ({
    id: n.id.id,
    pk: n.id.publicKey,
    ...(net && { net }),
  });
  /** Roster to every node (all connected at once). */
  const connect = (you?: string) => {
    for (const n of nodes.values()) {
      n.net.relayOpened();
      const f: RelayDown = {
        t: 'roster',
        ...(you && { you }),
        peers: [...nodes.values()].filter((o) => o !== n).map((o) => entry(o)),
      };
      n.net.relayDown(f);
    }
  };
  return { nodes, mk, connect, entry };
}

const tickAll = (ns: Node[]) => ns.forEach((n) => n.net.sendNow());

describe('PeerNet over the relay', () => {
  it('sees each other over relay only', async () => {
    const h = hub();
    const a = await h.mk('A');
    const b = await h.mk('B');
    h.connect();
    tickAll([a, b]);
    expect(ids(a.net.peers(PUBLIC_VIEW))).toEqual([b.id.id]);
    expect(ids(b.net.peers(PUBLIC_VIEW))).toEqual([a.id.id]);
    expect(a.wants.at(-1)).toBe(true);
  });

  it('no frame when nothing changed, and relay peers never expire', async () => {
    const h = hub();
    const a = await h.mk('A');
    const b = await h.mk('B');
    h.connect();
    tickAll([a, b]);
    const before = a.sent.length;
    for (let i = 0; i < 10; i++) {
      clock.t += 5_000;
      tickAll([a, b]);
    }
    expect(a.sent.length).toBe(before);
    expect(ids(a.net.peers(PUBLIC_VIEW))).toEqual([b.id.id]);
    expect(a.net.directory().public.map((p) => p.id)).toEqual([b.id.id]);
  });

  it('leave removes at once; relayClosed drops every relay peer', async () => {
    const h = hub();
    const a = await h.mk('A');
    const b = await h.mk('B');
    const c = await h.mk('C');
    h.connect();
    tickAll([a, b, c]);
    a.net.relayDown({ t: 'leave', id: b.id.id });
    expect(ids(a.net.peers(PUBLIC_VIEW))).toEqual([c.id.id]);
    a.net.relayClosed();
    expect(a.net.peers(PUBLIC_VIEW)).toEqual([]);
    expect(a.net.directory().public).toEqual([]);
  });

  it('coalesces to one frame per second, the last value wins', async () => {
    const h = hub();
    const a = await h.mk('A');
    const b = await h.mk('B');
    h.connect();
    tickAll([a, b]);
    clock.t += 1_000;
    const before = a.sent.length;
    for (let col = 1; col <= 5; col++) {
      a.avatar = { col, row: 1, dir: 'up' };
      a.net.sendNow();
      clock.t += 200;
    }
    expect(a.sent.length).toBe(before + 1);
    clock.t += 1_000;
    a.net.sendNow();
    expect(a.sent.length).toBe(before + 2);
    expect(b.net.peers(PUBLIC_VIEW)[0].avatar?.col).toBe(5);
  });

  it('an ageSec-only change sends nothing (even unquiet)', async () => {
    const h = hub();
    const a = await h.mk('A');
    const b = await h.mk('B');
    a.quiet = false;
    a.views = [view({ ageSec: 1 })];
    h.connect();
    tickAll([a, b]);
    const before = a.sent.length;
    clock.t += 1_000;
    a.views = [view({ ageSec: 2 })];
    a.net.sendNow();
    expect(a.sent.length).toBe(before);
  });

  it('a target-only change sends nothing; an act change does', async () => {
    const h = hub();
    const a = await h.mk('A');
    const b = await h.mk('B');
    a.views = [view({ target: 'a.ts' })];
    h.connect();
    tickAll([a, b]);
    const before = a.sent.length;
    clock.t += 1_000;
    a.views = [view({ target: 'b.ts' })];
    a.net.sendNow();
    expect(a.sent.length).toBe(before);
    clock.t += 1_000;
    a.views = [view({ act: 'run', target: 'ls' })];
    a.net.sendNow();
    expect(a.sent.length).toBe(before + 1);
  });

  it('relay presence is quiet: act kept, details gone', async () => {
    const h = hub();
    const a = await h.mk('A');
    const b = await h.mk('B');
    a.views = [
      view({ act: 'run', target: 'npm test', ageSec: 3, todo: { done: 1, total: 2 }, fail: true }),
    ];
    h.connect();
    tickAll([a, b]);
    const [v] = b.net.peers(PUBLIC_VIEW)[0].views;
    expect(v).toMatchObject({ act: 'run', target: '', quiet: true });
    for (const k of ['todo', 'diff', 'fail', 'ageSec']) expect(v).not.toHaveProperty(k);
  });

  it('udp presence is quiet too', async () => {
    const [pa, pb] = await Promise.all([freePort(), freePort()]);
    const targets = [`127.0.0.1:${pa.toString()}`, `127.0.0.1:${pb.toString()}`];
    const mk = async (name: string, port: number) => {
      const id = createIdentity(name);
      const net = new PeerNet({
        port,
        identity: id,
        getPacket: () => ({
          v: 1,
          peer: { id: id.id, account: name, nickname: name, palette: 0, hueShift: 0 },
          views: [view({ target: 'secret.ts', ageSec: 4 })].map(quietView),
        }),
        manualPeers: () => [],
        offices: () => [],
        pins: new Map<string, string>(),
        targets: () => targets,
        now: () => clock.t,
      });
      nets.push(net);
      await net.start();
      return net;
    };
    const a = await mk('A', pa);
    const b = await mk('B', pb);
    await until(() => {
      a.sendNow();
      b.sendNow();
      return b.peers(PUBLIC_VIEW).length > 0;
    });
    const [v] = b.peers(PUBLIC_VIEW)[0].views;
    expect(v).toMatchObject({ act: 'edit', target: '', quiet: true });
    expect(v).not.toHaveProperty('ageSec');
  });

  it('a new joiner gets the full state, alone', async () => {
    const h = hub();
    const a = await h.mk('A');
    const b = await h.mk('B');
    h.connect();
    tickAll([a, b]);
    clock.t += 1_000;
    tickAll([a, b]);
    const c = await h.mk('C');
    c.net.relayOpened();
    c.net.relayDown({ t: 'roster', peers: [h.entry(a), h.entry(b)] });
    a.net.relayDown({ t: 'join', ...h.entry(c) });
    const before = a.sent.length;
    a.net.sendNow();
    expect(a.sent.length).toBe(before + 1);
    expect(new Set(a.sent.at(-1)?.map((w) => w.to))).toEqual(new Set([c.id.id]));
    expect(ids(c.net.peers(PUBLIC_VIEW))).toEqual([a.id.id]);
  });

  it('udp lapse resends the full state over the relay; netOf follows the path', async () => {
    const h = hub();
    const a = await h.mk('A');
    const b = await h.mk('B');
    // B's UDP side: a raw socket that says hello to A.
    const raw = dgram.createSocket('udp4');
    socks.push(raw);
    await new Promise<void>((r) => raw.bind(0, '127.0.0.1', r));
    const got: string[] = [];
    raw.on('message', (m) => got.push(m.toString()));
    a.net.relayOpened();
    a.net.relayDown({ t: 'roster', you: 'aaaa0001', peers: [h.entry(b, 'bbbb0002')] });
    expect(a.net.netOf(b.id.id)).toBe('bbbb0002');
    const hello = JSON.stringify({ v: 2, t: 'hello', id: b.id.id, pk: b.id.publicKey });
    raw.send(hello, a.port, '127.0.0.1');
    await until(() => a.net.netOf(b.id.id) === 'aaaa0001');
    expect(a.net.netOf(b.id.id)).toBe('aaaa0001'); // heard over UDP: my net
    a.net.sendNow();
    expect(a.sent.length).toBe(0);
    await until(() => got.some((g) => g.includes('"t":"pub"')));
    expect(got.some((g) => g.includes('"t":"pub"'))).toBe(true);
    clock.t += PEER_TTL_MS + 1;
    a.net.sendNow();
    expect(a.sent.at(-1)?.some((w) => w.to === b.id.id)).toBe(true);
    expect(a.net.netOf(b.id.id)).toBe('bbbb0002');
  });

  it('splits frames over the byte cap without dropping anyone', async () => {
    const h = hub();
    const a = await h.mk('A');
    const others = Array.from({ length: 30 }, (_, i) => createIdentity(`R${i.toString()}`));
    // Incompressible views: a presence as big as fitPacket allows.
    const big = fitPacket({
      v: 1,
      peer: { id: a.id.id, account: 'A', nickname: 'A', palette: 0, hueShift: 0 },
      views: Array.from({ length: 400 }, (_, i) =>
        view({ id: `s${i.toString()}`, reason: randomBytes(150).toString('base64') }),
      ),
    }).views;
    a.quiet = false;
    a.views = big;
    a.net.relayOpened();
    a.net.relayDown({
      t: 'roster',
      peers: others.map((o) => ({ id: o.id, pk: o.publicKey })),
    });
    a.net.sendNow();
    expect(a.sent.length).toBeGreaterThan(1);
    for (const w of a.sent)
      expect(Buffer.byteLength(JSON.stringify({ t: 'send', w }))).toBeLessThanOrEqual(
        RELAY_MAX_FRAME_BYTES,
      );
    const to = new Set(a.sent.flat().map((w) => w.to));
    expect(to).toEqual(new Set(others.map((o) => o.id)));
  });

  it('team mode closes the relay', async () => {
    const h = hub();
    const a = await h.mk('A');
    const key = teamKey(Buffer.alloc(32, 7));
    a.offices = [{ tag: teamTag(key), key, name: 't' }];
    a.net.sendNow();
    expect(a.wants.at(-1)).toBe(false);
  });

  it('a newer shared layout reaches a relay peer', async () => {
    const h = hub();
    const a = await h.mk('A');
    const b = await h.mk('B');
    const json = JSON.stringify({ version: 1, cols: 1, rows: 1, tiles: [0], furniture: [] });
    a.layout = { rev: 2, by: a.id.id, h: layoutHash(json) };
    a.blob = zlib.deflateSync(json);
    h.connect();
    tickAll([a, b]);
    clock.t += 1_000;
    tickAll([a, b]);
    expect(b.received).toEqual([a.layout]);
  });
});
