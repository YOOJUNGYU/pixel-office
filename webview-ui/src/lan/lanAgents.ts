import type { AvatarDir, OfficeAgent, Room } from '../../../core/src/lan.js';
import { parseAvatar, ROOM_LABELS } from '../../../core/src/lan.js';
import type { OfficePersonMessage, TagColors } from '../../../core/src/messages.js';
import { FX_DURATION_MS, FX_MAX, LAN_KIND_BADGES, LAN_ROOM_TOOL } from '../constants.js';
import { actText, t } from '../i18n.js';
import { requestRender } from '../office/engine/gameLoop.js';
import type { OfficeState } from '../office/engine/officeState.js';
import { screenKind } from '../office/engine/pcScreens.js';
import { Direction } from '../office/types.js';
import { isDemoKey } from '../tour/demoAgents.js';
import { type EffectTrigger, effectTriggers, type LiveEffect } from './effects.js';
import { avatarLabel } from './nicknames.js';

const DIRS: Record<AvatarDir, Direction> = {
  down: Direction.DOWN,
  up: Direction.UP,
  left: Direction.LEFT,
  right: Direction.RIGHT,
};
/** Protocol name of a facing. */
export const avatarDirName = (d: Direction): AvatarDir =>
  (Object.keys(DIRS) as AvatarDir[]).find((k) => DIRS[k] === d) ?? 'down';

const ARROWS: Readonly<Record<string, Direction>> = {
  ArrowUp: Direction.UP,
  ArrowDown: Direction.DOWN,
  ArrowLeft: Direction.LEFT,
  ArrowRight: Direction.RIGHT,
};

/** The facing an arrow key asks for; undefined for any other key. */
export const arrowDir = (key: string): Direction | undefined =>
  Object.hasOwn(ARROWS, key) ? ARROWS[key] : undefined;

/** A person's avatar on screen (name tag, chat bubble anchor). */
export interface AvatarRef {
  peerId: string;
  id: number;
  /** Nickname if set, else the account. */
  label: string;
  self: boolean;
  /** Their chosen tag colours; absent = the default tag. */
  tagColors?: TagColors;
}

/** The provider badge before an agent's activity line (i18n-neutral). */
export const providerName = (a: OfficeAgent): string =>
  a.provider === 'claude' ? 'Claude' : 'Codex';

/**
 * An agent's one-line name tag after its MAIN/SUB/SHELL badge (drawn separately): `#n` and the
 * nickname (else the account). A subagent or shell shows its parent's number (`parent` = the
 * parent's agent; without it, no number). `withName` false (personal mode: every agent is
 * mine, my name is on my avatar) = the number alone.
 */
export function tagText(a: OfficeAgent, parent?: OfficeAgent, withName = true): string {
  const main = a.kind === 'main' ? a : parent;
  const num = main ? `#${main.num}` : '';
  if (!withName) return num;
  const name = avatarLabel((main ?? a).peer);
  return main ? `${num} ${name}` : name;
}

/**
 * What an agent does, for its bubble and room card: the command alone for a run (its room,
 * 서버실, already says "running a command"), else the full activity text. A quiet agent
 * (another PC over the relay, no details) is just "working" unless idle or waiting.
 */
export const activityText = (a: OfficeAgent): string =>
  a.hidden
    ? t('act.hidden')
    : a.quiet && a.act !== 'idle' && a.act !== 'ask' && !a.permission
      ? t('act.quiet')
      : a.act === 'run' && a.target
        ? a.target
        : actText(a.act, a.target);

/** The badge at the front of a tag (i18n-neutral): MAIN / SUB / SHELL. */
export const tagBadge = (a: OfficeAgent): string => LAN_KIND_BADGES[a.kind].text;

/** A character's look: the palette human, or a pet (`pet` set). */
export interface Look {
  palette: number;
  hueShift: number;
  pet?: string;
}

/** The PC's own look (main agents). */
const peerLook = (p: OfficeAgent['peer']): Look => ({
  palette: p.palette,
  hueShift: p.hueShift,
  pet: p.pet,
});

/** Look of an agent's character: its PC's (human or pet) for main, subagent and shell
 *  alike — the MAIN / SUB / SHELL badge tells them apart. */
export const looks = (a: OfficeAgent): Look => peerLook(a.peer);

/** Agents per room: main agents by room, `extra` = subagents + shells. */
export interface RoomCount {
  main: number;
  extra: number;
}

export function roomCounts(agents: readonly OfficeAgent[]): Map<string, RoomCount> {
  const counts = new Map<string, RoomCount>(
    Object.values(ROOM_LABELS).map((label) => [label, { main: 0, extra: 0 }]),
  );
  for (const a of agents) {
    const c = counts.get(ROOM_LABELS[a.room])!;
    if (a.kind === 'main') c.main++;
    else c.extra++;
  }
  return counts;
}

/** The count chip beside a room plate ("에이전트 5": mains and children together); null when empty. */
export function plateCount(c: RoomCount | undefined): string | null {
  const n = c ? c.main + c.extra : 0;
  return n > 0 ? t('plate.agents', { n: String(n) }) : null;
}

/** Agents in a room for its plate's cards: by PC, each main followed by its children. */
export function roomAgents(agents: readonly OfficeAgent[], room: Room): OfficeAgent[] {
  const here = agents.filter((a) => a.room === room);
  const order = (a: OfficeAgent) => {
    const main = a.kind === 'main' ? a : here.find((m) => m.key === a.parentKey);
    return [a.peer.id, main?.num ?? Infinity, a.kind === 'main' ? 0 : 1, a.key] as const;
  };
  return here.sort((x, y) => {
    const a = order(x);
    const b = order(y);
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
    return 0;
  });
}

/**
 * Reconciles `officeSnapshot` agents into OfficeState characters: stable ids
 * per key (never reused in a page session), room moves, permission bubbles,
 * and children holding hands with their parent when they share its room.
 * O(n) per snapshot; seat searches only on a room change.
 */
export class LanAgents {
  private readonly ids = new Map<string, number>();
  private readonly byId = new Map<number, OfficeAgent>();
  private agents: OfficeAgent[] = [];
  /** Latest snapshot agents and client-only tour demos; shown together. */
  private real: OfficeAgent[] = [];
  private demo: OfficeAgent[] = [];
  private nextId = 1;
  /** A real snapshot was reconciled: agents that start working later step out of their avatar. */
  private primed = false;
  private readonly os: OfficeState;
  private highlight: string | null = null;
  /** Peer whose name tags are emphasized (people panel hover); null = none. */
  get highlightPeer(): string | null {
    return this.highlight;
  }
  set highlightPeer(peerId: string | null) {
    if (this.highlight === peerId) return;
    this.highlight = peerId;
    requestRender('highlight');
  }

  /** peerId → avatar character id (one per live person of the viewed office). */
  private readonly avatarIds = new Map<string, number>();
  private people: OfficePersonMessage[] = [];
  /** My avatar was placed where the server had no (usable) spot: save it there. */
  onSelfPlaced: (col: number, row: number, dir: Direction) => void = () => {};

  constructor(os: OfficeState) {
    this.os = os;
  }

  /**
   * The snapshot's people → one avatar each (their look, their spot). Mine is
   * placed once from the server's spot (then the arrow keys own it); others
   * walk to their latest spot. Peer coords are re-validated (clamped).
   */
  applyPeople(people: OfficePersonMessage[]): void {
    this.people = people;
    const os = this.os;
    const seen = new Set<string>();
    for (const p of people) {
      seen.add(p.peerId);
      const look: Look = { palette: p.palette, hueShift: p.hueShift, pet: p.pet };
      const a = parseAvatar(p.avatar);
      const at = a && { col: a.col, row: a.row, dir: DIRS[a.dir] };
      let id = this.avatarIds.get(p.peerId);
      if (id === undefined) {
        id = this.nextId++;
        this.avatarIds.set(p.peerId, id);
        const t = os.addAvatar(id, p.peerId, look, at);
        if (p.self) {
          os.myAvatarId = id;
          if (!at || t.col !== at.col || t.row !== at.row) {
            this.onSelfPlaced(t.col, t.row, at?.dir ?? Direction.DOWN);
          }
        }
        continue;
      }
      this.restyle(id, look);
      if (!p.self && at) os.walkAvatarTo(id, at);
    }
    for (const [peerId, id] of this.avatarIds) {
      if (seen.has(peerId)) continue;
      os.removeAgent(id);
      this.avatarIds.delete(peerId);
      if (os.myAvatarId === id) os.myAvatarId = null;
    }
    requestRender('snapshot');
  }

  /** A new layout (mode switch, reset): my avatar is placed again from the next snapshot. */
  resetSelfAvatar(): void {
    const id = this.os.myAvatarId;
    if (id === null) return;
    for (const [peerId, v] of this.avatarIds) if (v === id) this.avatarIds.delete(peerId);
    this.os.removeAgent(id);
    this.os.myAvatarId = null;
  }

  /** Every live person's avatar (characters still spawning included). */
  avatars(): AvatarRef[] {
    const out: AvatarRef[] = [];
    for (const p of this.people) {
      const id = this.avatarIds.get(p.peerId);
      if (id === undefined) continue;
      const { peerId, self, tagColors } = p;
      out.push({ peerId, id, label: avatarLabel(p), self, tagColors });
    }
    return out;
  }

  /** A fresh `officeSnapshot`. */
  apply(agents: OfficeAgent[]): void {
    // A peer can never impersonate a tour demo (their keys are client-only).
    // One agent per key: a session reported twice (the same transcript under two roots) would
    // give the overlays duplicate React keys, which leave orphaned bubbles/tags on screen.
    const keys = new Set<string>();
    const prev = new Map(this.real.map((a) => [a.key, a] as const));
    this.real = agents.filter((a) => !isDemoKey(a.key) && !keys.has(a.key) && !!keys.add(a.key));
    this.reconcile();
    // Effects come only from what changed between two real snapshots (the first is the baseline).
    if (this.primed) this.startEffects(effectTriggers(prev, this.real));
    this.primed = true;
  }

  private effects: LiveEffect[] = [];
  private nextEffect = 1;

  /** Effects still playing (anchored to a character that still exists). */
  liveEffects(now = performance.now()): LiveEffect[] {
    this.effects = this.effects.filter((e) => now - e.born < FX_DURATION_MS[e.kind]);
    return this.effects.filter((e) => this.os.characters.has(e.anchor));
  }

  private startEffects(triggers: EffectTrigger[]): void {
    if (!triggers.length) return;
    const born = performance.now();
    for (const t of triggers) {
      const a = this.real.find((x) => x.key === t.key);
      const own = this.ids.get(t.key);
      const ch = own !== undefined ? this.os.characters.get(own) : undefined;
      // Folded into its PC's avatar (lounge): the avatar shows it.
      const avatar = a ? this.avatarIds.get(a.peer.id) : undefined;
      const anchor = ch && ch.mergeInto === undefined ? own : avatar;
      if (anchor === undefined) continue;
      if (t.kind === 'smoke' && ch) this.os.flashFail(ch.id);
      this.effects.push({ ...t, id: this.nextEffect++, anchor, born });
    }
    this.effects = this.effects.slice(-FX_MAX);
    requestRender('effects');
    // Once they end, one more frame drops their DOM.
    setTimeout(() => requestRender('effectsEnd'), Math.max(...Object.values(FX_DURATION_MS)) + 50);
  }

  /** Client-only tour demo agents (never sent anywhere); [] removes them. */
  setDemo(agents: OfficeAgent[]): void {
    this.demo = agents;
    this.reconcile();
  }

  /** This PC's peer id (the `self` person of the snapshot). */
  selfPeerId(): string | undefined {
    return this.people.find((p) => p.self)?.peerId;
  }

  isMine(a: OfficeAgent): boolean {
    const me = this.selfPeerId();
    return me !== undefined && a.peer.id === me;
  }

  /** Agents of a PC folded into its avatar (room lounge, avatar shown), in `roomAgents` order. */
  loungeAgentsOf(peerId: string): OfficeAgent[] {
    if (!this.avatarIds.has(peerId)) return [];
    return roomAgents(this.real, 'lounge').filter((a) => a.peer.id === peerId);
  }

  /** Snapshot agents only (no tour demos). */
  realAgents(): OfficeAgent[] {
    return this.real;
  }

  private reconcile(): void {
    const agents = this.demo.length ? [...this.real, ...this.demo] : this.real;
    const os = this.os;
    // A command running in 서버실 (any PC's, shells included) blinks its PCs' LEDs.
    os.setServerBusy(agents.some((x) => x.room === 'server' && x.act === 'run'));
    const prevByKey = new Map<string, OfficeAgent>();
    for (const a of this.agents) prevByKey.set(a.key, a);
    const seen = new Set<string>();
    /** Keys shown as characters (an agent in the lounge is folded into its PC's avatar). */
    const shown = new Set<string>();
    // A child talking with its parent (`talk`): the pair stands face to face, never folded.
    // ponytail: one talk per parent (the first child); parallel ones wait for the next snapshot.
    const talkOf = new Map<string, string>();
    for (const a of agents) {
      const p = a.talk && a.parentKey !== undefined ? a.parentKey : undefined;
      if (p === undefined || talkOf.has(p) || !agents.some((x) => x.key === p)) continue;
      talkOf.set(p, a.key);
      talkOf.set(a.key, p);
    }

    for (const a of agents) {
      seen.add(a.key);
      let id = this.ids.get(a.key);
      if (id === undefined) {
        id = this.nextId++;
        this.ids.set(a.key, id);
      }
      this.byId.set(id, a);
      const avatarId = this.avatarIds.get(a.peer.id);
      const ch = os.characters.get(id);
      if (ch?.talkWith !== undefined && !talkOf.has(a.key)) os.endTalk(id);
      if (a.room === 'lounge' && avatarId !== undefined && !talkOf.has(a.key)) {
        if (ch) os.mergeAgent(id, avatarId);
        continue;
      }
      shown.add(a.key);
      const look = looks(a);
      if (!ch || ch.matrixEffect === 'despawn') {
        if (ch) os.characters.delete(id); // merged away mid-despawn: start over
        const depart = this.primed && avatarId !== undefined;
        os.addAgent(id, look.palette, look.hueShift, undefined, depart);
        if (depart) os.departFrom(id, avatarId);
      } else if (ch.mergeInto !== undefined) {
        os.cancelMerge(id); // homeArea is unset: re-homed below
      }
      this.restyle(id, look);
      const shownCh = os.characters.get(id);
      if (shownCh) shownCh.peerId = a.peer.id;
      if (a.permission) os.showPermissionBubble(id);
      else os.clearPermissionBubble(id);
    }

    for (const [key, id] of this.ids) {
      if (seen.has(key)) continue;
      os.removeAgent(id);
      this.ids.delete(key);
      this.byId.delete(id);
    }
    this.agents = agents;

    // Everyone sits in the room of its own state whenever a seat is free there (standing only
    // in a full room); a child in its parent's room takes the free seat closest to the parent
    // (hand in hand only when the room is full), a child elsewhere acts on its own.
    const byKey = new Map<string, OfficeAgent>();
    for (const a of agents) byKey.set(a.key, a);
    os.roomCounts = roomCounts(agents);
    // Parents first: a child picks the seat closest to where its parent sits now.
    const depth = (a: OfficeAgent, n = 0): number => {
      const p = a.parentKey !== undefined ? byKey.get(a.parentKey) : undefined;
      return p && n < agents.length ? depth(p, n + 1) : n;
    };
    for (const a of [...agents].sort((x, y) => depth(x) - depth(y))) {
      if (!shown.has(a.key)) continue;
      const id = this.ids.get(a.key)!;
      const partner = talkOf.get(a.key);
      if (partner !== undefined) {
        // The parent walks over to its child, wherever the child stands.
        if (a.kind !== 'main') os.setTalk(this.ids.get(partner)!, id);
        continue;
      }
      const parent = a.parentKey !== undefined ? byKey.get(a.parentKey) : undefined;
      if (parent?.room === a.room && shown.has(parent.key)) {
        const ch = os.characters.get(id);
        const label = ROOM_LABELS[a.room];
        // Already seated here (since the last snapshot): stay put.
        if (ch && ch.followId === undefined && ch.homeArea === label && ch.seatId) continue;
        const parentId = this.ids.get(parent.key)!;
        const seat = os.freeSeatNear(label, parentId);
        if (seat === null) {
          os.setFollowTarget(id, parentId);
          continue;
        }
        os.setFollowTarget(id, null);
        this.enterRoom(id, a.room, seat);
        continue;
      }
      os.setFollowTarget(id, null);
      const ch = os.characters.get(id);
      if (ch && (prevByKey.get(a.key)?.room !== a.room || ch.homeArea === undefined)) {
        this.enterRoom(id, a.room);
      } else if (ch && !ch.seatId) {
        // Standing because the room was full: take the seat that freed up closest to it.
        const seat = os.freeSeatNear(ROOM_LABELS[a.room], id);
        if (seat !== null) this.enterRoom(id, a.room, seat);
      }
    }
    // Each working character's PC screen follows its act (code / terminal / document).
    for (const a of agents) {
      const cid = this.ids.get(a.key);
      const ch = cid !== undefined ? os.characters.get(cid) : undefined;
      if (ch) ch.screen = screenKind(a);
    }
    requestRender('snapshot');
  }

  /** A PC edited its profile: existing characters take the new look. */
  private restyle(id: number, look: Look): void {
    const ch = this.os.characters.get(id);
    if (!ch) return;
    ch.palette = look.palette;
    ch.hueShift = look.hueShift;
    ch.pet = look.pet;
  }

  /** Lounge idles (seated, or standing still when the room is full); every other room works at a desk. */
  private enterRoom(id: number, room: Room, seat?: string): void {
    const tool = LAN_ROOM_TOOL[room];
    // Before moveToArea: deactivating clears the path it is about to set.
    this.os.setAgentActive(id, tool !== null);
    this.os.setAgentTool(id, tool);
    this.os.moveToArea(id, ROOM_LABELS[room], seat);
  }

  /** PCs (peerId) with an agent folded into their avatar that waits for an answer. */
  waitingPeers(): Set<string> {
    const out = new Set<string>();
    for (const a of this.agents) {
      if (a.room === 'lounge' && (a.permission || a.act === 'ask') && this.avatarIds.has(a.peer.id))
        out.add(a.peer.id);
    }
    return out;
  }

  idFor(key: string): number | undefined {
    return this.ids.get(key);
  }

  agentFor(id: number): OfficeAgent | undefined {
    return this.byId.get(id);
  }

  all(): OfficeAgent[] {
    return this.agents;
  }
}
