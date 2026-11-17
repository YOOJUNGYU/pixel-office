import * as dgram from 'dgram';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AgentView, LayoutRev, Outfit } from '../../../core/src/lan.js';
import { DEFAULT_LAYOUT_REV, PUBLIC_VIEW } from '../../../core/src/lan.js';
import type { PubWire, RelayDown, RelayPerson } from '../../../core/src/relay.js';
import { RELAY_PERSON_MAX_BYTES } from '../../../core/src/relay.js';
import type { Identity } from '../../src/lan/crypto.js';
import { createIdentity, teamKey, teamTag } from '../../src/lan/crypto.js';
import type { TeamChannel } from '../../src/lan/peerNet.js';
import { PEER_TTL_MS, PeerNet } from '../../src/lan/peerNet.js';
import { quietView } from '../../src/lan/redact.js';

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
  /** Every relay.me call (this PC's person as told to the relay). */
  sent: RelayPerson[];
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
  pins: Map<string, string>;
  /** Personal mode (PeerNet `offline`). */
  personal: boolean;
  nickname: string;
  outfit?: Outfit;
}

/** In-memory hub: a node's relay.send routes each wire to its `to` node, synchronously. */
function hub() {
  const nodes = new Map<string, Node>();
  const persons = new Map<string, RelayPerson>();
  /** udp 'fail': the port is already taken without SO_REUSEADDR, so start() must reject. */
  const mk = async (
    name: string,
    targets: string[] = [],
    udp: boolean | 'fail' = true,
  ): Promise<Node> => {
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
      pins: new Map<string, string>(),
      personal: false,
      nickname: name,
    } as Partial<Node> as Node;
    node.net = new PeerNet({
      port,
      identity: node.id,
      getPacket: () => ({
        v: 1,
        peer: {
          id: node.id.id,
          account: name,
          nickname: node.nickname,
          palette: 0,
          hueShift: 0,
          ...(node.outfit && { outfit: node.outfit }),
        },
        views: node.quiet ? node.views.map(quietView) : node.views,
        ...(node.avatar && { avatar: { ...node.avatar } }),
        layout: node.layout,
      }),
      manualPeers: () => [],
      offices: () => node.offices,
      offline: () => node.personal,
      pins: node.pins,
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
        // The hub: keeps it as this node's person and hands it to everyone else.
        me: (p) => {
          node.sent.push(p);
          persons.set(node.id.id, p);
          for (const [id, n] of nodes)
            if (id !== node.id.id) n.net.relayDown({ t: 'person', id: node.id.id, p });
          return true;
        },
      },
    });
    nets.push(node.net);
    if (udp === 'fail') {
      const taken = dgram.createSocket('udp4');
      socks.push(taken);
      await new Promise<void>((r) => taken.bind(port, '0.0.0.0', r));
      await expect(node.net.start()).rejects.toThrow(/EADDRINUSE/);
      node.net.runWithoutUdp();
    } else if (udp) await node.net.start();
    else node.net.runWithoutUdp();
    nodes.set(node.id.id, node);
    return node;
  };
  const entry = (n: Node, net?: string) => {
    const p = persons.get(n.id.id);
    return { id: n.id.id, pk: n.id.publicKey, ...(net && { net }), ...(p && { p }) };
  };
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

describe('PeerNet UDP socket', () => {
  it('after start, only the runtime error logger is left; a runtime error keeps it open', async () => {
    const h = hub();
    const a = await h.mk('A', ['127.0.0.1:9']);
    const sock = (a.net as unknown as { sock: dgram.Socket }).sock;
    expect(sock.listenerCount('error')).toBe(1);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    sock.emit('error', new Error('boom'));
    log.mockRestore();
    expect(() => sock.address()).not.toThrow(); // still bound
    expect(() => a.net.sendNow()).not.toThrow();
  });

  it('a failed bind closes its socket; the relay still works without UDP', async () => {
    const h = hub();
    const close = vi.spyOn(dgram.Socket.prototype, 'close');
    let a: Node;
    try {
      a = await h.mk('A', [], 'fail');
      // freePort's probe + the failed socket; the socket holding the port stays open
      expect(close).toHaveBeenCalledTimes(2);
      expect(() => socks.at(-1)!.address()).not.toThrow();
    } finally {
      close.mockRestore();
    }
    const b = await h.mk('B', [], false);
    h.connect();
    tickAll([a, b]);
    expect(a.sent.length).toBeGreaterThan(0);
    expect(b.net.directory().public.map((p) => p.id)).toEqual([a.id.id]);
  });
});

const dirIds = (n: Node, area: 'public' | 'personal') =>
  n.net
    .directory()
    [area].map((p) => p.id)
    .sort();

describe('PeerNet over the relay (who is online only)', () => {
  it('lists each other over the relay, never in the office', async () => {
    const h = hub();
    const a = await h.mk('A');
    const b = await h.mk('B');
    a.views = [view()];
    a.avatar = { col: 1, row: 1, dir: 'up' };
    h.connect();
    tickAll([a, b]);
    expect(dirIds(a, 'public')).toEqual([b.id.id]);
    expect(dirIds(b, 'public')).toEqual([a.id.id]);
    expect(a.net.peers(PUBLIC_VIEW)).toEqual([]);
    expect(b.net.peers(PUBLIC_VIEW)).toEqual([]);
    expect(a.wants.at(-1)).toBe(true);
    expect(a.net.viaOf(b.id.id)).toBe('relay');
  });

  it('tells the relay the person only: no agents, chat, avatar or layout', async () => {
    const h = hub();
    const a = await h.mk('A');
    const b = await h.mk('B');
    a.views = [view({ target: 'secret.ts' })];
    a.avatar = { col: 3, row: 4, dir: 'up' };
    h.connect();
    tickAll([a, b]);
    expect(a.sent).toHaveLength(1);
    expect(JSON.stringify(a.sent)).not.toMatch(/secret|views|avatar|layout/);
    expect(a.sent[0].peer).toMatchObject({ id: a.id.id, account: 'A' });
    expect(dirIds(b, 'public')).toEqual([a.id.id]);
  });

  it('agents, avatar and layout changes send nothing; a profile change does', async () => {
    const h = hub();
    const a = await h.mk('A');
    const b = await h.mk('B');
    h.connect();
    tickAll([a, b]);
    const before = a.sent.length;
    for (let i = 1; i <= 5; i++) {
      clock.t += 1_000;
      a.views = [view({ act: i % 2 ? 'run' : 'edit', target: `f${i.toString()}` })];
      a.avatar = { col: i, row: 1, dir: 'up' };
      a.net.sendNow();
    }
    expect(a.sent.length).toBe(before);
    clock.t += 1_000;
    a.nickname = 'Ace';
    a.net.sendNow();
    expect(a.sent.length).toBe(before + 1);
    expect(b.net.directory().public[0].nickname).toBe('Ace');
  });

  it('relay people stay listed without frames until leave; relayClosed drops all', async () => {
    const h = hub();
    const a = await h.mk('A');
    const b = await h.mk('B');
    const c = await h.mk('C');
    h.connect();
    tickAll([a, b, c]);
    const before = a.sent.length;
    for (let i = 0; i < 10; i++) {
      clock.t += 5_000;
      tickAll([a, b, c]);
    }
    expect(a.sent.length).toBe(before);
    expect(dirIds(a, 'public')).toEqual([b.id.id, c.id.id].sort());
    a.net.relayDown({ t: 'leave', id: b.id.id });
    expect(dirIds(a, 'public')).toEqual([c.id.id]);
    a.net.relayClosed();
    expect(a.net.directory().public).toEqual([]);
  });

  it('personal mode is on the relay too, listed in the personal area', async () => {
    const h = hub();
    const a = await h.mk('A');
    const b = await h.mk('B');
    b.personal = true;
    h.connect();
    tickAll([a, b]);
    expect(b.wants.at(-1)).toBe(true);
    expect(dirIds(a, 'personal')).toEqual([b.id.id]);
    expect(dirIds(a, 'public')).toEqual([]);
    expect(dirIds(b, 'public')).toEqual([a.id.id]);
    b.personal = false; // back to public: moves areas with its next frame
    clock.t += 1_000;
    b.net.sendNow();
    expect(dirIds(a, 'public')).toEqual([b.id.id]);
    expect(dirIds(a, 'personal')).toEqual([]);
  });

  it('team mode closes the relay', async () => {
    const h = hub();
    const a = await h.mk('A');
    const key = teamKey(Buffer.alloc(32, 7));
    a.offices = [{ tag: teamTag(key), key, name: 't' }];
    a.net.sendNow();
    expect(a.wants.at(-1)).toBe(false);
  });

  it('a joiner lists everyone from the roster; nobody sends anything for it', async () => {
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
    const before = a.sent.length + b.sent.length;
    tickAll([a, b]);
    expect(a.sent.length + b.sent.length).toBe(before);
    expect(dirIds(c, 'public')).toEqual([a.id.id, b.id.id].sort());
    c.net.sendNow(); // c tells the relay once; a and b list it
    expect(dirIds(a, 'public')).toEqual([b.id.id, c.id.id].sort());
  });

  it('a reconnect tells the relay again; a person for an id not on the relay is ignored', async () => {
    const h = hub();
    const a = await h.mk('A');
    const b = await h.mk('B');
    h.connect();
    tickAll([a, b]);
    expect(a.sent).toHaveLength(1);
    clock.t += 1_000;
    h.connect();
    tickAll([a, b]);
    expect(a.sent).toHaveLength(2);
    a.net.relayDown({ t: 'person', id: 'ghost', p: { peer: { id: 'ghost', account: 'g' } } });
    expect(dirIds(a, 'public')).toEqual([b.id.id]);
    // a person whose peer id is not the sender's is not listed
    a.net.relayDown({
      t: 'person',
      id: b.id.id,
      p: { peer: { id: 'other', account: 'x', nickname: '', palette: 0, hueShift: 0 } },
    });
    expect(a.net.directory().public[0].id).toBe(b.id.id);
  });

  it('an older PC sending its whole presence over the relay is listed, not put in the office', async () => {
    const h = hub();
    const a = await h.mk('A');
    const b = await h.mk('B');
    h.connect();
    tickAll([a, b]);
    // B's old-style full presence, sealed for A as a pub wire
    const o = b.net as unknown as {
      sealPub(id: string, h: unknown, t: string[]): PubWire[];
      relayKeys: Map<string, unknown>;
    };
    const full = JSON.stringify({
      seq: Date.now() + 1e9,
      packet: {
        v: 1,
        peer: { id: b.id.id, account: 'B', nickname: 'Old', palette: 0, hueShift: 0 },
        views: [view()],
        avatar: { col: 1, row: 1, dir: 'up' },
      },
    });
    a.net.relayDown({ t: 'w', w: o.sealPub(a.id.id, o.relayKeys.get(a.id.id), [full]) });
    expect(a.net.peers(PUBLIC_VIEW)).toEqual([]);
    expect(a.net.directory().public[0].nickname).toBe('Old');
  });

  /** A and B on UDP (each targets the other) and on the relay hub. */
  const udpPair = async () => {
    const h = hub();
    const ta: string[] = [];
    const tb: string[] = [];
    const a = await h.mk('A', ta);
    const b = await h.mk('B', tb);
    ta.push(`127.0.0.1:${b.port.toString()}`);
    tb.push(`127.0.0.1:${a.port.toString()}`);
    return { h, a, b };
  };
  /** `n` ignores UDP pubs from `from` (one-way UDP: from → n blocked). */
  const dropPubsFrom = (n: Node, from: string) => {
    const o = n.net as unknown as { receive(text: string, rinfo: unknown): void };
    const orig = o.receive.bind(o);
    o.receive = (text, rinfo) => {
      if (!(text.includes('"t":"pub"') && text.includes(`"from":"${from}"`))) orig(text, rinfo);
    };
  };
  const roster = (h: ReturnType<typeof hub>, a: Node, b: Node) => {
    a.net.relayOpened();
    a.net.relayDown({ t: 'roster', you: 'aaaa0001', peers: [h.entry(b, 'bbbb0002')] });
    b.net.relayOpened();
    b.net.relayDown({ t: 'roster', you: 'bbbb0002', peers: [h.entry(a, 'aaaa0001')] });
  };
  const pump = (ns: Node[], f: () => boolean) =>
    until(() => {
      tickAll(ns);
      return f();
    });

  it('same LAN: the office over UDP, nothing more to the relay, one row each', async () => {
    const { h, a, b } = await udpPair();
    await pump([a, b], () => a.net.netOf(b.id.id) === 'lan' && b.net.netOf(a.id.id) === 'lan');
    roster(h, a, b);
    a.net.sendNow(); // tells the relay who it is, once
    const told = a.sent.length;
    expect(a.net.netOf(b.id.id)).toBe('aaaa0001'); // confirmed over UDP: my net
    expect(a.net.viaOf(b.id.id)).toBe('lan');
    expect(a.net.viaOf(a.id.id)).toBeUndefined();
    for (let col = 1; col <= 3; col++) {
      clock.t += 1_000;
      a.avatar = { col, row: 1, dir: 'up' };
      await pump([a, b], () => b.net.peers(PUBLIC_VIEW)[0]?.avatar?.col === col);
    }
    expect(a.sent.length).toBe(told); // walking sends nothing to the relay
    expect(dirIds(a, 'public')).toEqual([b.id.id]);
    dropPubsFrom(a, b.id.id);
    clock.t += PEER_TTL_MS + 1;
    a.net.sendNow();
    expect(a.net.netOf(b.id.id)).toBe('bbbb0002');
    expect(a.net.viaOf(b.id.id)).toBe('relay'); // UDP lapsed, still on the relay
  });

  it('one-way UDP: hearing a hello is not enough, the relay still carries the person', async () => {
    const { h, a, b } = await udpPair();
    dropPubsFrom(a, b.id.id); // A hears B's hellos, never its pubs
    await pump([a, b], () => b.net.netOf(a.id.id) === 'lan');
    expect(a.net.viaOf(b.id.id)).toBe('lan'); // hello heard, no relay yet
    roster(h, a, b);
    expect(a.net.netOf(b.id.id)).toBe('bbbb0002');
    expect(a.net.viaOf(b.id.id)).toBe('relay'); // a hello alone loses to the relay
  });

  it('ignores a roster entry whose key differs from the pinned one', async () => {
    const h = hub();
    const a = await h.mk('A');
    const b = await h.mk('B');
    a.pins.set(b.id.id, createIdentity('X').publicKey);
    h.connect();
    tickAll([a, b]);
    expect(a.net.directory().public).toEqual([]);
    expect(a.net.netOf(b.id.id)).toBeUndefined();
    expect(a.net.viaOf(b.id.id)).toBeUndefined();
    expect(a.net.viaOf('nobody')).toBeUndefined();
  });

  it('a person over the relay cap goes without its look (listed rather than dropped)', async () => {
    const h = hub();
    const a = await h.mk('A');
    const b = await h.mk('B');
    a.outfit = { body: 'flat', parts: { hair: 'x'.repeat(RELAY_PERSON_MAX_BYTES) } };
    h.connect();
    tickAll([a, b]);
    expect(a.sent.at(-1)?.peer).not.toHaveProperty('outfit');
    expect(dirIds(b, 'public')).toEqual([a.id.id]);
    a.outfit = { body: 'flat', parts: { hair: 'bob' } };
    clock.t += 1_000;
    a.net.sendNow();
    expect(a.sent.at(-1)?.peer).toHaveProperty('outfit');
  });

  it('relay people never take LAN hello places, never get pinned', async () => {
    const h = hub();
    const a = await h.mk('A', [], false);
    const o = a.net as unknown as { hellos: Map<string, unknown> };
    const r = createIdentity('R');
    a.net.relayOpened();
    a.net.relayDown({ t: 'roster', peers: [{ id: r.id, pk: r.publicKey }] });
    expect(o.hellos.size).toBe(0);
    expect(a.pins.has(r.id)).toBe(false);
  });

  it('lists far more relay people than MAX_HELLO_PEERS', async () => {
    const h = hub();
    const a = await h.mk('A', [], false);
    const others = Array.from({ length: 600 }, (_, i) => createIdentity(`R${i.toString()}`));
    a.net.relayOpened();
    a.net.relayDown({
      t: 'roster',
      peers: others.map((o) => ({
        id: o.id,
        pk: o.publicKey,
        p: { peer: { id: o.id, account: o.id, nickname: '', palette: 0, hueShift: 0 } },
      })),
    });
    expect(a.net.directory().public).toHaveLength(600);
  });
});
