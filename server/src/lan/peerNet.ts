import * as dgram from 'dgram';
import * as os from 'os';
import * as zlib from 'zlib';

import type { LayoutRev, PeerInfo, PeerPacket } from '../../../core/src/lan.js';
import {
  MAX_PACKET_BYTES,
  newerLayout,
  parseLayoutRev,
  parsePeerInfo,
  parsePeerPacket,
  PERSONAL_VIEW,
  PUBLIC_VIEW,
} from '../../../core/src/lan.js';
import {
  GCM_NONCE_BYTES,
  GCM_TAG_BYTES,
  HELLO_REPLY_MS,
  LAYOUT_ASSEMBLY_MS,
  LAYOUT_PART_BYTES,
  LAYOUT_PUSH_MS,
  MAX_DATAGRAM_BYTES,
  MAX_HELLO_PEERS,
  MAX_LAYOUT_JSON,
  MAX_LAYOUT_PARTS,
  MAX_OFFICE_NAME,
  MAX_PRESENCE_ASSEMBLIES,
  MAX_PRESENCE_PARTS,
  MAX_WARN_KEYS,
  PRESENCE_ASSEMBLY_MS,
  PRESENCE_MAX_COMPRESSED,
  PRESENCE_MAX_JSON,
  PRESENCE_PART_BYTES,
  SEQ_MEMORY_MS,
  WIRE_MAX_ID,
} from '../constants.js';
import type { Identity, Wire } from './crypto.js';
import { cardAad, isWireId, open, pairKey, parseWire, pubAad, seal, teamAad } from './crypto.js';
import { layoutHash } from './sharedLayout.js';

export const PEER_TTL_MS = 5_000;
export const SEND_INTERVAL_MS = 1_000;
const WARN_OVERFLOW = '*';

/** A joined team office as PeerNet needs it (key = teamKey(secret)). */
export interface TeamChannel {
  tag: string;
  key: Buffer;
  name: string;
}

/** Who this PC can list per area (people panel). Never fed into the office or snapshot. */
export interface NetDirectory {
  /** Public-office people heard: in the public office = live peers(PUBLIC_VIEW); otherwise
   *  the person of every live pub sent to this watcher. */
  public: PeerInfo[];
  /** Joined tag → live members heard on it (also while personal). */
  teams: Record<string, PeerInfo[]>;
  /** Personal-mode PCs whose card arrived. A PC in both public and personal is listed
   *  once, in the area it was heard in last. */
  personal: PeerInfo[];
}

interface Heard {
  pk: string;
  key: Buffer | null;
  address: string;
  port: number;
  at: number;
  replied: number;
}

/** Encrypted payload of `pub` and `team` datagrams (single form). */
export interface Inner {
  seq: number;
  packet: PeerPacket;
  office?: { name: string };
}

const ipToInt = (ip: string): number =>
  ip.split('.').reduce((a, n) => ((a << 8) | Number(n)) >>> 0, 0);
const intToIp = (n: number): string => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');

/** Directed broadcast of each non-internal IPv4 interface, plus the limited broadcast. */
export function broadcastAddresses(
  ifaces: ReturnType<typeof os.networkInterfaces> = os.networkInterfaces(),
): string[] {
  const out = new Set<string>();
  for (const list of Object.values(ifaces)) {
    for (const i of list ?? []) {
      if (i.family !== 'IPv4' || i.internal) continue;
      const mask = ipToInt(i.netmask);
      out.add(intToIp(((ipToInt(i.address) & mask) | ~mask) >>> 0));
    }
  }
  out.add('255.255.255.255');
  return [...out];
}

/** Drops trailing views until the presence fits MAX_PRESENCE_PARTS deflated parts
 *  (and PRESENCE_MAX_JSON before deflate). */
export function fitPacket(p: PeerPacket): PeerPacket {
  const views = [...p.views];
  const fits = (): boolean => {
    const text = JSON.stringify({ ...p, views });
    return (
      Buffer.byteLength(text) <= PRESENCE_MAX_JSON &&
      zlib.deflateSync(text).length <= PRESENCE_MAX_COMPRESSED
    );
  };
  while (views.length && !fits()) views.pop();
  return { ...p, views };
}

/** base64 length of a sealed plaintext (ciphertext + GCM tag). */
const sealedLength = (plain: string): number =>
  4 * Math.ceil((Buffer.byteLength(plain) + GCM_TAG_BYTES) / 3);

/** Wire bytes around `c` for a datagram (n filled to its real length). */
const envelope = (wire: Record<string, unknown>): number =>
  Buffer.byteLength(
    JSON.stringify({ ...wire, n: 'x'.repeat(4 * Math.ceil(GCM_NONCE_BYTES / 3)), c: '' }),
  );

/**
 * Plaintexts of one presence. Fits one datagram → the single 0.4.x form (the
 * Inner itself, so older peers still see this PC). Otherwise deflated and split
 * into ≤ MAX_PRESENCE_PARTS parts `{seq, from, part, parts, d}` (0.4.x peers miss those).
 */
export function presencePlains(inner: Inner, from: string, around: number): string[] {
  const text = JSON.stringify(inner);
  if (around + sealedLength(text) <= MAX_DATAGRAM_BYTES) return [text];
  const z = zlib.deflateSync(text);
  const parts = Math.ceil(z.length / PRESENCE_PART_BYTES);
  if (parts > MAX_PRESENCE_PARTS) return [];
  return Array.from({ length: parts }, (_, part) =>
    JSON.stringify({
      seq: inner.seq,
      from,
      part,
      parts,
      d: z
        .subarray(part * PRESENCE_PART_BYTES, (part + 1) * PRESENCE_PART_BYTES)
        .toString('base64'),
    }),
  );
}

interface Part {
  seq: number;
  from: string;
  part: number;
  parts: number;
  d: Buffer;
}

/** A presence part, else null (a single-form Inner has no `parts`). */
function parsePart(o: Record<string, unknown>): Part | null {
  const { seq, from, part, parts, d } = o;
  if (!Number.isSafeInteger(seq) || !isWireId(from)) return null;
  if (!Number.isInteger(parts) || (parts as number) < 2 || (parts as number) > MAX_PRESENCE_PARTS)
    return null;
  if (!Number.isInteger(part) || (part as number) < 0 || (part as number) >= (parts as number))
    return null;
  if (typeof d !== 'string') return null;
  const buf = Buffer.from(d, 'base64');
  if (buf.length < 1 || buf.length > PRESENCE_PART_BYTES || buf.toString('base64') !== d)
    return null;
  return { seq: seq as number, from, part: part as number, parts: parts as number, d: buf };
}

/** Plaintexts of a shared layout: `{lay: {rev, by, h, part, parts, d}}`, d = a slice of
 *  the deflated layout JSON. Older peers find no presence in them and drop them. */
export function layoutPlains(rev: LayoutRev, blob: Buffer): string[] {
  const parts = Math.ceil(blob.length / LAYOUT_PART_BYTES);
  if (parts < 1 || parts > MAX_LAYOUT_PARTS) return [];
  return Array.from({ length: parts }, (_, part) =>
    JSON.stringify({
      lay: {
        ...rev,
        part,
        parts,
        d: blob
          .subarray(part * LAYOUT_PART_BYTES, (part + 1) * LAYOUT_PART_BYTES)
          .toString('base64'),
      },
    }),
  );
}

interface LayoutPart {
  rev: LayoutRev;
  part: number;
  parts: number;
  d: Buffer;
}

/** A layout part, else null (anything else: a presence). */
function parseLayoutPart(text: string): LayoutPart | null {
  if (!text.startsWith('{"lay":')) return null;
  try {
    const o = (JSON.parse(text) as { lay?: Record<string, unknown> }).lay;
    const rev = parseLayoutRev(o);
    if (!o || !rev || rev.rev === 0) return null;
    const { part, parts, d } = o;
    if (!Number.isInteger(parts) || (parts as number) < 1 || (parts as number) > MAX_LAYOUT_PARTS)
      return null;
    if (!Number.isInteger(part) || (part as number) < 0 || (part as number) >= (parts as number))
      return null;
    if (typeof d !== 'string') return null;
    const buf = Buffer.from(d, 'base64');
    if (buf.length < 1 || buf.length > LAYOUT_PART_BYTES || buf.toString('base64') !== d)
      return null;
    return { rev, part: part as number, parts: parts as number, d: buf };
  } catch {
    return null;
  }
}

/** Decrypted card text → `{seq, peer}` (peer rebuilt from PeerInfo fields), else null. */
export function parseCard(text: string | null): { seq: number; peer: PeerInfo } | null {
  if (text === null) return null;
  try {
    const o = JSON.parse(text) as Record<string, unknown> | null;
    if (!o || typeof o !== 'object' || !Number.isSafeInteger(o.seq)) return null;
    const peer = parsePeerInfo(o.peer);
    return peer && { seq: o.seq as number, peer };
  } catch {
    return null;
  }
}

/** Decrypted text → validated inner payload, else null. */
function parseInner(text: string | null): Inner | null {
  if (text === null) return null;
  try {
    const o = JSON.parse(text) as Record<string, unknown> | null;
    if (!o || typeof o !== 'object' || !Number.isSafeInteger(o.seq)) return null;
    const packet = parsePeerPacket(JSON.stringify(o.packet));
    if (!packet) return null;
    const name = (o.office as { name?: unknown } | undefined)?.name;
    return {
      seq: o.seq as number,
      packet,
      ...(typeof name === 'string' && { office: { name: name.slice(0, MAX_OFFICE_NAME) } }),
    };
  } catch {
    return null;
  }
}

/**
 * v2 LAN protocol. Public office (no team joined, not personal): plaintext `hello {id, pk}`
 * broadcast, encrypted pairwise `pub` unicast to every live hello'd peer and watcher.
 * Everyone else broadcasts `watch {id, pk}` instead (heard by public PCs, never counted
 * there) and gets the public PCs' pub; a team PC also sends one encrypted `team`
 * broadcast per joined office.
 */
export class PeerNet {
  private sock: dgram.Socket | null = null;
  private timer: NodeJS.Timeout | null = null;
  /** Public-office PCs from their hello (heard in every mode): key cached per pk, reply
   *  address from rinfo, last reply. */
  private readonly hellos = new Map<string, Heard>();
  /** PCs outside the public office from their watch: get our pub, never listed or counted. */
  private readonly watchers = new Map<string, Heard>();
  /** As a watcher: the person (only) of every public PC whose pub reached us. */
  private readonly heardPublic = new Map<string, { peer: PeerInfo; at: number }>();
  /** Personal-mode PCs from their card (sender known from its watch): the person only. */
  private readonly cards = new Map<string, { peer: PeerInfo; at: number }>();
  /** channel (PUBLIC_VIEW | tag) → sender id → last packet. */
  private readonly seen = new Map<string, Map<string, { packet: PeerPacket; at: number }>>();
  /** `${channel}|${sender}` → last accepted seq. */
  private readonly lastSeq = new Map<string, { seq: number; at: number }>();
  /** `${channel}|${sender}` → the split presence being assembled (one per sender). */
  private readonly assemblies = new Map<
    string,
    { seq: number; parts: (Buffer | undefined)[]; got: number; at: number }
  >();
  /** channel → the newer shared layout being assembled (one per channel). */
  private readonly layoutAssemblies = new Map<
    string,
    { rev: LayoutRev; parts: (Buffer | undefined)[]; got: number; at: number }
  >();
  /** `pub|${peer}` or a team tag → when this PC last pushed its layout there. */
  private readonly layoutPushed = new Map<string, number>();
  /** Team names as members announce them (shown when joined without a name). */
  private readonly names = new Map<string, string>();
  private readonly warned = new Set<string>();
  /** Per process, seeded with the clock so a restart still counts upward. */
  private seq = Date.now();
  private readonly now: () => number;

  constructor(
    private readonly opts: {
      port: number;
      identity: Identity;
      /** This PC's presence for one channel (PUBLIC_VIEW or a team tag). */
      getPacket: (channel: string) => PeerPacket;
      manualPeers: () => string[];
      offices: () => TeamChannel[];
      /** Personal mode: send nothing, answer nothing, see no one; only counts who is heard. */
      offline?: () => boolean;
      /** TOFU: first public key seen per peer id. */
      pins: { get(id: string): string | undefined; set(id: string, pk: string): void };
      /** Broadcast targets override ("host:port"), for tests. */
      targets?: () => string[];
      /** A live peer's avatar moved (or appeared), so the UI can show it before the next tick. */
      onAvatar?: () => void;
      /** Shared layouts: this PC's version and deflated JSON per channel, and a peer's
       *  newer one, assembled and hash-checked (LanService checks and stores it). */
      layouts?: {
        rev(channel: string): LayoutRev;
        blob(channel: string): Buffer | null;
        receive(channel: string, rev: LayoutRev, text: string): void;
      };
      now?: () => number;
    },
  ) {
    this.now = opts.now ?? Date.now;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      sock.on('message', (msg, rinfo) => this.receive(msg.toString('utf8'), rinfo));
      sock.once('error', reject);
      sock.bind(this.opts.port, '0.0.0.0', () => {
        sock.removeListener('error', reject);
        sock.on('error', (err) => console.error('[Pixel Office] UDP socket error:', err.message));
        sock.setBroadcast(true);
        this.sock = sock;
        this.timer = setInterval(() => this.sendNow(), SEND_INTERVAL_MS);
        this.timer.unref();
        resolve();
      });
    });
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.sock?.close();
    this.sock = null;
  }

  /** Send this PC's state now; called every SEND_INTERVAL_MS and after any change. */
  sendNow(): void {
    const sock = this.sock;
    if (!sock) return;
    this.prune();
    const { identity } = this.opts;
    const offices = this.opts.offices();
    const broadcast = this.opts.targets?.() ?? [
      ...broadcastAddresses(),
      ...this.opts.manualPeers(),
    ];
    if (!this.inPublic()) {
      const watch = this.discovery();
      for (const t of broadcast) this.send(sock, watch, t);
      if (this.isOffline()) {
        this.sendCards(sock);
        return;
      }
      for (const o of offices) {
        const inner: Inner = {
          seq: ++this.seq,
          packet: this.opts.getPacket(o.tag),
          ...(o.name && { office: { name: o.name } }),
        };
        const around = envelope({ v: 2, t: 'team', tag: o.tag });
        for (const plain of presencePlains(inner, identity.id, around)) {
          const wire: Wire = { v: 2, t: 'team', tag: o.tag, ...seal(o.key, teamAad(o.tag), plain) };
          for (const t of broadcast) this.send(sock, wire, t);
        }
        // A member with an older layout (≥ 1.0.14, so it says which): the whole team gets ours.
        const plains = this.layoutToPush(o.tag, o.tag, [...(this.seen.get(o.tag)?.values() ?? [])]);
        for (const plain of plains) {
          const wire: Wire = { v: 2, t: 'team', tag: o.tag, ...seal(o.key, teamAad(o.tag), plain) };
          for (const t of broadcast) this.send(sock, wire, t);
        }
      }
      return;
    }
    const hello = this.discovery();
    for (const t of broadcast) this.send(sock, hello, t);
    // One presence (one seq, deflated once) sealed per peer; sized for the longest peer id.
    const watchers = [...this.watchers].filter(([id]) => !this.hellos.has(id));
    const inner: Inner = { seq: ++this.seq, packet: this.opts.getPacket(PUBLIC_VIEW) };
    const longest = { v: 2, t: 'pub', from: identity.id, to: 'x'.repeat(WIRE_MAX_ID) };
    const around = envelope(longest);
    const plains = this.hellos.size ? presencePlains(inner, identity.id, around) : [];
    // Watchers get the person only (no agents, chat, avatar, layout). Same seq as the full
    // presence: a receiver gets only one of the two per tick (hello'd ids skip this list),
    // so its `public|from` replay guard sees one increasing seq either way.
    const personOnly: Inner = {
      seq: inner.seq,
      packet: { v: 1, peer: inner.packet.peer, views: [] },
    };
    const watcherPlains = watchers.length ? presencePlains(personOnly, identity.id, around) : [];
    const pubTo = (id: string, h: Heard, texts: string[]) => {
      h.key ??= pairKey(identity.privateKeyPem, h.pk, identity.id, id);
      if (!h.key) return;
      for (const plain of texts) {
        const sealed = seal(h.key, pubAad(identity.id, id), plain);
        const wire: Wire = { v: 2, t: 'pub', from: identity.id, to: id, ...sealed };
        this.send(sock, wire, `${h.address}:${h.port.toString()}`);
      }
    };
    for (const [id, h] of this.hellos) {
      const peer = this.seen.get(PUBLIC_VIEW)?.get(id);
      pubTo(id, h, [
        ...plains,
        ...(peer ? this.layoutToPush(PUBLIC_VIEW, `pub|${id}`, [peer]) : []),
      ]);
    }
    for (const [id, h] of watchers) pubTo(id, h, watcherPlains);
  }

  /** Personal mode: our name card, sealed pairwise, to every live hello'd PC and watcher
   *  (once per id; the watcher's address wins). The person only, never a team or agents. */
  private sendCards(sock: dgram.Socket): void {
    const { identity } = this.opts;
    const peer = parsePeerInfo(this.opts.getPacket(PERSONAL_VIEW).peer);
    if (!peer) return;
    const plain = JSON.stringify({ seq: ++this.seq, peer });
    for (const [id, h] of new Map([...this.hellos, ...this.watchers])) {
      h.key ??= pairKey(identity.privateKeyPem, h.pk, identity.id, id);
      if (!h.key) continue;
      const sealed = seal(h.key, cardAad(identity.id, id), plain);
      const wire: Wire = { v: 2, t: 'card', from: identity.id, to: id, ...sealed };
      this.send(sock, wire, `${h.address}:${h.port.toString()}`);
    }
  }

  /** This PC's layout parts for `channel` when one of `peers` (live) has an older version,
   *  at most once per LAYOUT_PUSH_MS per `target`; else none. */
  private layoutToPush(
    channel: string,
    target: string,
    peers: { packet: PeerPacket; at: number }[],
  ): string[] {
    const layouts = this.opts.layouts;
    if (!layouts) return [];
    const mine = layouts.rev(channel);
    const blob = layouts.blob(channel);
    const t = this.now();
    if (mine.rev === 0 || !blob) return [];
    if (t - (this.layoutPushed.get(target) ?? -Infinity) < LAYOUT_PUSH_MS) return [];
    const lagging = peers.some(
      (e) => t - e.at <= PEER_TTL_MS && e.packet.layout && newerLayout(mine, e.packet.layout),
    );
    if (!lagging) return [];
    this.layoutPushed.set(target, t);
    return layoutPlains(mine, blob);
  }

  /** Live packets of one office; the public office is empty while in any team. */
  peers(view: string): PeerPacket[] {
    if (this.isOffline()) return [];
    if (view === PUBLIC_VIEW ? this.opts.offices().length > 0 : !this.isJoined(view)) return [];
    const t = this.now();
    const out: PeerPacket[] = [];
    for (const e of this.seen.get(view)?.values() ?? [])
      if (t - e.at <= PEER_TTL_MS) out.push(e.packet);
    return out;
  }

  /** People heard per area, for the people panel (display only). */
  directory(): NetDirectory {
    const t = this.now();
    const live = <T extends { at: number }>(e: T) => t - e.at <= PEER_TTL_MS;
    type Row = { peer: PeerInfo; at: number };
    const teamRows = (tag: string): Row[] =>
      [...(this.seen.get(tag)?.values() ?? [])]
        .filter(live)
        .map((e) => ({ peer: e.packet.peer, at: e.at }));
    const pub: Row[] = this.inPublic()
      ? teamRows(PUBLIC_VIEW)
      : [...this.heardPublic.values()].filter(live);
    const teams = this.opts.offices().map((o) => [o.tag, teamRows(o.tag)] as const);
    const cards = [...this.cards.values()].filter(live);
    // Heard in several areas (switched mode within the TTL): the newest wins; on a tie
    // public, then team, then personal.
    const rank = [pub, ...teams.map(([, r]) => r), cards];
    const best = new Map<string, { at: number; area: number }>();
    rank.forEach((rows, area) => {
      for (const { peer, at } of rows) {
        const b = best.get(peer.id);
        if (!b || at > b.at) best.set(peer.id, { at, area });
      }
    });
    const keep = (rows: Row[], area: number) =>
      rows.filter((r) => best.get(r.peer.id)?.area === area).map((r) => r.peer);
    return {
      public: keep(pub, 0),
      teams: Object.fromEntries(teams.map(([tag, rows], i) => [tag, keep(rows, i + 1)])),
      personal: keep(cards, rank.length - 1),
    };
  }

  /** The name a member last announced for a team office. */
  teamName(tag: string): string | undefined {
    return this.names.get(tag);
  }

  private isOffline(): boolean {
    return this.opts.offline?.() === true;
  }

  private inPublic(): boolean {
    return !this.isOffline() && this.opts.offices().length === 0;
  }

  /** What this PC broadcasts to be found: hello in the public office, else a watch. */
  private discovery(): Wire {
    const { id, publicKey: pk } = this.opts.identity;
    return this.inPublic() ? { v: 2, t: 'hello', id, pk } : { v: 2, t: 'watch', id, pk };
  }

  private isJoined(tag: string): boolean {
    return this.opts.offices().some((o) => o.tag === tag);
  }

  private send(sock: dgram.Socket, wire: Wire, target: string): void {
    const buf = Buffer.from(JSON.stringify(wire), 'utf8');
    // "host:port" overrides the port (tests, rinfo replies; hostnames/IPv4 never contain ':')
    const [host, port] = target.split(':');
    sock.send(buf, port ? Number(port) : this.opts.port, host, (err) => {
      if (!err) return;
      this.warnOnce(
        `send:${target}`,
        `[Pixel Office] UDP send to ${target} failed: ${err.message}`,
      );
    });
  }

  /** Once per key; keys come from the network, so past MAX_WARN_KEYS the rest go unlogged. */
  private warnOnce(key: string, message: string): void {
    if (this.warned.has(key) || this.warned.has(WARN_OVERFLOW)) return;
    if (this.warned.size >= MAX_WARN_KEYS) {
      this.warned.add(WARN_OVERFLOW);
      console.warn('[Pixel Office] Too many UDP warnings; further ones are not logged.');
      return;
    }
    this.warned.add(key);
    console.warn(message);
  }

  /** Untrusted datagram: anything off is dropped silently, never throws. */
  private receive(text: string, rinfo: { address: string; port: number }): void {
    const w = parseWire(text);
    if (!w) {
      if (text.startsWith('{"v":1,'))
        this.warnOnce('v1', '[Pixel Office] 구버전 PC 감지 (v0.1.x): 업데이트해야 서로 보입니다.');
      return;
    }
    const me = this.opts.identity.id;
    if (w.t === 'hello' || w.t === 'watch') {
      // A plaintext watch never removes anything (a replay would hide that PC): a mode
      // switch is settled by directory()'s last-heard dedupe and PEER_TTL_MS expiry.
      if (w.id !== me) this.heard(w.t === 'hello' ? this.hellos : this.watchers, w.id, w.pk, rinfo);
      return;
    }
    if (w.t === 'card') {
      // Only from a live watcher: its pk (from the watch, pinned) is the sender's.
      const h = this.watchers.get(w.from);
      if (w.to !== me || !h || this.now() - h.at > PEER_TTL_MS) return;
      h.key ??= pairKey(this.opts.identity.privateKeyPem, h.pk, me, w.from);
      if (!h.key) return;
      const card = parseCard(open(h.key, cardAad(w.from, w.to), w.n, w.c));
      if (card?.peer.id === w.from && this.fresh(`card|${w.from}`, card.seq))
        this.cards.set(w.from, { peer: card.peer, at: this.now() });
      return;
    }
    if (w.t === 'pub') {
      const h = this.hellos.get(w.from);
      if (w.to !== me || !h) return;
      h.key ??= pairKey(this.opts.identity.privateKeyPem, h.pk, me, w.from);
      if (!h.key) return;
      const plain = open(h.key, pubAad(w.from, w.to), w.n, w.c);
      if (this.inPublic()) {
        if (this.layoutPart(PUBLIC_VIEW, plain)) return;
        const inner = this.unpack(PUBLIC_VIEW, plain, w.from);
        if (inner?.packet.peer.id === w.from) this.accept(PUBLIC_VIEW, inner);
        return;
      }
      // Watcher: the person only — no agents, chat, avatar, and never a layout.
      if (plain === null || plain.startsWith('{"lay":')) return;
      const inner = this.unpack(PUBLIC_VIEW, plain, w.from);
      if (inner?.packet.peer.id === w.from && this.fresh(`${PUBLIC_VIEW}|${w.from}`, inner.seq))
        this.heardPublic.set(w.from, { peer: inner.packet.peer, at: this.now() });
      return;
    }
    const office = this.opts.offices().find((o) => o.tag === w.tag);
    if (!office) return;
    const plain = open(office.key, teamAad(w.tag), w.n, w.c);
    if (this.layoutPart(w.tag, plain)) return;
    const inner = this.unpack(w.tag, plain);
    if (!inner || inner.packet.peer.id === me) return;
    if (this.accept(w.tag, inner) && inner.office?.name) this.names.set(w.tag, inner.office.name);
  }

  /**
   * A hello or watch: TOFU pin check, at most MAX_HELLO_PEERS ids (a full map ignores new
   * ones), recorded in `map`. Answered 1:1 with our discovery() (rate-limited): a peer that
   * reaches us only via its manual-peer list would otherwise never hear us (watcher ↔
   * watcher too: a card is accepted only from a PC whose watch we heard).
   */
  private heard(
    map: Map<string, Heard>,
    id: string,
    pk: string,
    rinfo: { address: string; port: number },
  ): void {
    const pinned = this.opts.pins.get(id);
    if (pinned !== undefined && pinned !== pk) {
      this.warnOnce(`pin:${id}`, `[Pixel Office] PC ${id} 의 키가 바뀌어 무시합니다 (사칭 의심).`);
      return;
    }
    const prev = map.get(id);
    if (!prev && map.size >= MAX_HELLO_PEERS) return;
    if (pinned === undefined) this.opts.pins.set(id, pk);
    const t = this.now();
    const reply = !prev || t - prev.replied >= HELLO_REPLY_MS;
    map.set(id, {
      pk,
      key: prev?.pk === pk ? prev.key : null,
      address: rinfo.address,
      port: rinfo.port,
      at: t,
      replied: reply ? t : prev.replied,
    });
    if (reply && this.sock)
      this.send(this.sock, this.discovery(), `${rinfo.address}:${rinfo.port.toString()}`);
  }

  /**
   * Decrypted presence → Inner: the single form as is, or a part added to its
   * sender's assembly (complete → inflated, parsed, checked against the part
   * header). `sender` (pub: the wire `from`) must match the part's `from`.
   * One assembly per (channel, sender), MAX_PRESENCE_ASSEMBLIES in all; a newer
   * seq replaces an unfinished one, replays of a complete seq are dropped.
   */
  private unpack(channel: string, text: string | null, sender?: string): Inner | null {
    if (text === null) return null;
    let o: unknown;
    try {
      o = JSON.parse(text);
    } catch {
      return null;
    }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
    if (!('parts' in o)) return parseInner(text);
    const p = parsePart(o as Record<string, unknown>);
    if (!p || (sender !== undefined && p.from !== sender)) return null;
    const key = `${channel}|${p.from}`;
    const last = this.lastSeq.get(key);
    if (last && p.seq <= last.seq) return null;
    const t = this.now();
    let a = this.assemblies.get(key);
    if (a && t - a.at > PRESENCE_ASSEMBLY_MS) {
      this.assemblies.delete(key);
      a = undefined;
    }
    if (a && p.seq < a.seq) return null;
    if (!a || p.seq > a.seq) {
      if (!a && this.assemblies.size >= MAX_PRESENCE_ASSEMBLIES) return null;
      a = { seq: p.seq, parts: new Array<Buffer | undefined>(p.parts), got: 0, at: t };
      this.assemblies.set(key, a);
    }
    if (a.parts.length !== p.parts || a.parts[p.part]) return null;
    a.parts[p.part] = p.d;
    if (++a.got < p.parts) return null;
    this.assemblies.delete(key);
    try {
      const z = Buffer.concat(a.parts as Buffer[]);
      const inner = parseInner(
        zlib.inflateSync(z, { maxOutputLength: MAX_PACKET_BYTES }).toString('utf8'),
      );
      return inner && inner.seq === p.seq && inner.packet.peer.id === p.from ? inner : null;
    } catch {
      return null;
    }
  }

  /**
   * A decrypted layout part (true; false = not one). Only a version newer than this
   * PC's is assembled, one per channel (a newer one replaces it); complete → inflated
   * (≤ MAX_LAYOUT_JSON), hash-checked, handed to `layouts.receive`.
   */
  private layoutPart(channel: string, text: string | null): boolean {
    const p = text === null ? null : parseLayoutPart(text);
    if (!p) return false;
    const layouts = this.opts.layouts;
    if (!layouts || !newerLayout(p.rev, layouts.rev(channel))) return true;
    const t = this.now();
    let a = this.layoutAssemblies.get(channel);
    if (a && t - a.at > LAYOUT_ASSEMBLY_MS) a = undefined;
    const same = a && a.rev.rev === p.rev.rev && a.rev.by === p.rev.by && a.rev.h === p.rev.h;
    if (a && !same && !newerLayout(p.rev, a.rev)) return true;
    if (!a || !same) {
      a = { rev: p.rev, parts: new Array<Buffer | undefined>(p.parts), got: 0, at: t };
      this.layoutAssemblies.set(channel, a);
    }
    if (a.parts.length !== p.parts || a.parts[p.part]) return true;
    a.parts[p.part] = p.d;
    if (++a.got < p.parts) return true;
    this.layoutAssemblies.delete(channel);
    try {
      const json = zlib
        .inflateSync(Buffer.concat(a.parts as Buffer[]), { maxOutputLength: MAX_LAYOUT_JSON })
        .toString('utf8');
      if (layoutHash(json) === p.rev.h) layouts.receive(channel, p.rev, json);
    } catch {
      // corrupt or too big: dropped
    }
    return true;
  }

  /** Stores the packet unless its seq is not newer than the sender's last on this channel. */
  private accept(channel: string, inner: Inner): boolean {
    const id = inner.packet.peer.id;
    if (!this.fresh(`${channel}|${id}`, inner.seq)) return false;
    const at = this.now();
    let ch = this.seen.get(channel);
    if (!ch) this.seen.set(channel, (ch = new Map()));
    const before = ch.get(id)?.packet.avatar;
    ch.set(id, { packet: inner.packet, at });
    const after = inner.packet.avatar;
    if (
      after &&
      (before?.col !== after.col || before.row !== after.row || before.dir !== after.dir)
    ) {
      this.opts.onAvatar?.();
    }
    return true;
  }

  /** Records `seq` as the sender's last on `key` (`${channel}|${sender}`) unless it is not newer. */
  private fresh(key: string, seq: number): boolean {
    const last = this.lastSeq.get(key);
    if (last && seq <= last.seq) return false;
    this.lastSeq.set(key, { seq, at: this.now() });
    return true;
  }

  /** Drops expired peers/watchers and state of left teams. Hellos are kept in every mode
   *  (a watcher needs the public PCs' keys); peers() hides what the mode does not show. */
  private prune(): void {
    const t = this.now();
    const live = new Set([PUBLIC_VIEW, ...this.opts.offices().map((o) => o.tag)]);
    for (const m of [this.hellos, this.watchers, this.heardPublic, this.cards])
      for (const [id, e] of m) if (t - e.at > PEER_TTL_MS) m.delete(id);
    for (const [ch, peers] of this.seen) {
      if (!live.has(ch)) this.seen.delete(ch);
      else for (const [id, e] of peers) if (t - e.at > PEER_TTL_MS) peers.delete(id);
    }
    for (const tag of this.names.keys()) if (!live.has(tag)) this.names.delete(tag);
    for (const [ch, a] of this.layoutAssemblies)
      if (t - a.at > LAYOUT_ASSEMBLY_MS || !live.has(ch)) this.layoutAssemblies.delete(ch);
    for (const [k, at] of this.layoutPushed)
      if (t - at > LAYOUT_PUSH_MS) this.layoutPushed.delete(k);
    for (const [k, a] of this.assemblies) {
      if (t - a.at > PRESENCE_ASSEMBLY_MS || !live.has(k.slice(0, k.indexOf('|'))))
        this.assemblies.delete(k);
    }
    // ponytail: a sender silent past SEQ_MEMORY_MS can be replayed once more; add a time window to seq if that matters
    for (const [k, s] of this.lastSeq) if (t - s.at > SEQ_MEMORY_MS) this.lastSeq.delete(k);
  }
}
