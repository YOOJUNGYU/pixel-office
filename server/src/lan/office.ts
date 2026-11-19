// Merges this PC's and peers' agents into one office; single-instance probe.
import { randomBytes } from 'crypto';

import type {
  AgentView,
  AvatarPos,
  LayoutRev,
  OfficeAgent,
  PeerChat,
  PeerInfo,
  PeerPacket,
} from '../../../core/src/lan.js';
import {
  CHAT_ID_LENGTH,
  CHAT_MIN_INTERVAL_MS,
  nicknameKey,
  parseAvatar,
  parseChat,
  peerLabel,
  PERSONAL_VIEW,
  PUBLIC_VIEW,
  SEAT_ID,
} from '../../../core/src/lan.js';
import type {
  ChatMessage,
  DirectoryPersonMessage,
  OfficeErrorReason,
  OfficePersonMessage,
  PeopleDirectory,
  RoomSummary,
} from '../../../core/src/messages.js';
import {
  AVATAR_SAVE_DELAY_MS,
  AVATAR_SEND_DELAY_MS,
  OFFICE_MAX_PEOPLE,
  PING_APP,
  PING_TIMEOUT_MS,
} from '../constants.js';
import { MAX_SEAT_REPORT, MAX_SEAT_VIEW_ID } from '../constants.js';
import { newRoomSecret, teamKey } from './crypto.js';
import type { HostedRoom, JoinResult, NetDirectory, RoomInfo, TeamChannel } from './peerNet.js';
import { fitPacket } from './peerNet.js';
import type { EditableProfile, Profile, TeamOffice } from './profile.js';
import {
  isViewOpen,
  officeFromSecret,
  osAccount,
  saveProfile,
  validateOfficeName,
  validateRoomPassword,
} from './profile.js';
import { quietView, redactView } from './redact.js';
import { SharedLayouts } from './sharedLayout.js';
import { APP_VERSION } from './updater.js';

const toAgents = (peer: PeerInfo, views: AgentView[]): OfficeAgent[] =>
  views.map((v) => ({
    ...v,
    key: `${peer.id}:${v.id}`,
    ...(v.parentId !== undefined && { parentKey: `${peer.id}:${v.parentId}` }),
    peer,
  }));

/** This PC's views as-is (its own browser); peers redact before sending. */
export function buildOffice(
  self: PeerInfo,
  local: AgentView[],
  peers: PeerPacket[],
): OfficeAgent[] {
  return [...toAgents(self, local), ...peers.flatMap((p) => toAgents(p.peer, p.views))];
}

const toChatMessage = (c: PeerChat): ChatMessage => ({ id: c.id, text: c.text });

const toPeerChat = ({ id, text, ts }: PeerChat): PeerChat => ({ id, text, ts });

/** True when a Pixel Office already answers on this port. */
export async function checkExisting(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port.toString()}/api/ping`, {
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    });
    const body = (await res.json()) as { app?: unknown };
    return body.app === PING_APP;
  } catch {
    return false;
  }
}

/** This PC's live LAN state: profile, local agents, peers, offices. */
export class LanService {
  /** Set once PeerNet is up; until then (or if UDP bind failed) there are no peers. */
  net: {
    peers(view: string): PeerPacket[];
    sendNow(): void;
    teamName(tag: string): string | undefined;
    directory(): NetDirectory;
    /** A person's network ('lan' or the relay's 8-hex tag); public office only. */
    netOf?(id: string): string | undefined;
    /** How a person reaches this PC (UDP or relay); public office only. */
    viaOf?(id: string): 'lan' | 'relay' | undefined;
    /** Rooms heard on the LAN. */
    roomList?(): RoomInfo[];
    /** The public office has no room for this PC (PeerNet.publicFull). */
    publicFull?(): boolean;
    /** Ask a room's host to let this PC in. */
    joinRoom?(tag: string, pw: string, done: (r: JoinResult) => void): void;
  } = {
    peers: () => [],
    sendNow: () => {},
    teamName: () => undefined,
    directory: () => ({ public: [], teams: {}, personal: [] }),
  };
  private channels: { src: TeamOffice[]; list: TeamChannel[] } | null = null;
  /** This PC's OS account name: fixed, read at start, never from a client. */
  readonly account = osAccount();
  /** When this PC last sent a chat (rate limit; deleting doesn't reset it). */
  private lastChatAt = -Infinity;
  /** Pending coalesced presence send / profile write after avatar moves. */
  private moveSend: NodeJS.Timeout | null = null;
  private moveSave: NodeJS.Timeout | null = null;
  /** A peer's avatar moved (PeerNet); the UI server pushes a snapshot. */
  peerMoved: () => void = () => {};
  /** Shared (public + team) office layouts, newest version per channel. */
  readonly layouts: SharedLayouts;
  /** A layout fit to store (sanitizeLayout against the bundled default), else null.
   *  Set by the UI server, which has the default; until then nothing is accepted. */
  checkLayout: (raw: unknown) => Record<string, unknown> | null = () => null;
  /** A peer's newer layout of `channel` was stored; the UI server re-sends layoutLoaded. */
  layoutChanged: (channel: string) => void = () => {};

  constructor(
    public profile: Profile,
    /** brief=true: commands as program name / description only (always, for peers) */
    private readonly local: { views(brief?: boolean): AgentView[] },
    /** profile.json directory; undefined = ~/.pixel-office */
    private readonly dir?: string,
  ) {
    this.layouts = new SharedLayouts(dir);
  }

  /** Personal mode: offline (PeerNet sends and accepts nothing), this PC alone. */
  get personal(): boolean {
    return this.profile.activeView === PERSONAL_VIEW;
  }

  self(): PeerInfo {
    const {
      peerId,
      nickname,
      palette,
      hueShift,
      pet,
      tagColors,
      statusColors,
      outfit,
      nicknameSince,
    } = this.profile;
    return {
      id: peerId,
      account: this.account,
      nickname,
      palette,
      hueShift,
      ...(pet && { pet }),
      ...(tagColors && { tagColors }),
      ...(statusColors && { statusColors }),
      ...(outfit && { outfit }),
      ...(nickname !== '' && { nickSince: nicknameSince }),
      ver: APP_VERSION,
    };
  }

  /** What PeerNet sends (encrypted) on `channel` (PUBLIC_VIEW or a team tag). Never
   *  throws: a failing scan sends no views. The chat goes only to the view it was said in.
   *  The public office gets quiet views (no work details), over UDP and the relay alike. */
  packet(channel: string = PUBLIC_VIEW): PeerPacket {
    let views: AgentView[] = [];
    try {
      views = this.local.views(true).map(redactView);
      if (channel === PUBLIC_VIEW) views = views.map(quietView);
      const seats = this.seats?.view === channel ? this.seats.byId : undefined;
      if (seats) views = views.map((v) => (seats.has(v.id) ? { ...v, seat: seats.get(v.id) } : v));
    } catch (err) {
      console.error('[Pixel Office] Building peer packet failed:', err);
      views = [];
    }
    const chat = this.ownChat(channel);
    const avatar = this.ownAvatar(channel);
    return fitPacket({
      v: 1,
      peer: this.self(),
      views,
      ...(chat && { chat }),
      ...(avatar && { avatar }),
      layout: this.layouts.rev(channel),
    });
  }

  /** Save `layout` (already checked) as the newest shared layout of the active view:
   *  one rev above every version this PC knows of, so it wins on every PC. False in personal mode. */
  saveSharedLayout(layout: Record<string, unknown>): boolean {
    const view = this.profile.activeView;
    if (this.personal || !this.isOpen(view)) return false;
    const seen = this.net.peers(view).map((p) => p.layout?.rev ?? 0);
    const rev = Math.max(this.layouts.rev(view).rev, ...seen) + 1;
    this.layouts.offer(view, rev, this.profile.peerId, layout);
    this.net.sendNow();
    return true;
  }

  /**
   * A peer's layout (PeerNet: assembled, hash checked). Stored only when it is newer
   * and passes checkLayout; data only — it is drawn, never executed.
   */
  receiveLayout(channel: string, rev: LayoutRev, text: string): void {
    if (!this.isOpen(channel)) return;
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return;
    }
    const layout = this.checkLayout(raw);
    if (layout && this.layouts.offer(channel, rev.rev, rev.by, layout)) {
      this.layoutChanged(channel);
    }
  }

  /** My avatar in `view`'s layout (personal has its own). */
  private ownAvatar(view: string): AvatarPos | undefined {
    const a = this.profile.avatar?.[view === PERSONAL_VIEW ? 'personal' : 'office'];
    return a && { ...a };
  }

  /** My avatar moved in the active view's layout (strictly validated). Peers hear
   *  it within AVATAR_SEND_DELAY_MS (coalesced), the file within AVATAR_SAVE_DELAY_MS. */
  /** My page's seats for my agents, for the office it showed then (`view`). */
  private seats: { view: string; byId: Map<string, string> } | null = null;

  /** `agentSeats`: where my page seated my agents (view id → seat uid), for peers. */
  setSeats(raw: unknown): void {
    if (!Array.isArray(raw)) return;
    const byId = new Map<string, string>();
    for (const x of raw.slice(0, MAX_SEAT_REPORT)) {
      const o = x as { id?: unknown; seat?: unknown };
      if (
        typeof o?.id === 'string' &&
        o.id.length <= MAX_SEAT_VIEW_ID &&
        typeof o.seat === 'string' &&
        SEAT_ID.test(o.seat)
      )
        byId.set(o.id, o.seat);
    }
    this.seats = { view: this.profile.activeView, byId };
  }

  moveAvatar(raw: unknown): boolean {
    const pos = parseAvatar(raw, true);
    if (!pos) return false;
    const key = this.personal ? 'personal' : 'office';
    this.profile = { ...this.profile, avatar: { ...this.profile.avatar, [key]: pos } };
    this.moveSend ??= setTimeout(() => {
      this.moveSend = null;
      this.net.sendNow();
    }, AVATAR_SEND_DELAY_MS).unref();
    // ponytail: a move in the last AVATAR_SAVE_DELAY_MS before a crash is lost; fine for a position.
    this.moveSave ??= setTimeout(() => {
      this.moveSave = null;
      try {
        saveProfile(this.profile, this.dir);
      } catch (err) {
        console.error('[Pixel Office] Failed to write profile:', err);
      }
    }, AVATAR_SAVE_DELAY_MS).unref();
    return true;
  }

  /** Say `text` as my avatar in the active view, replacing this PC's previous
   *  bubble (saved in profile.json). null = refused (empty, or less than
   *  CHAT_MIN_INTERVAL_MS after the last one). */
  sendChat(text: unknown, now = Date.now()): PeerChat | null {
    if (now - this.lastChatAt < CHAT_MIN_INTERVAL_MS) return null;
    const id = randomBytes(CHAT_ID_LENGTH)
      .toString('base64')
      .replace(/[^0-9a-z]/gi, '')
      .padEnd(CHAT_ID_LENGTH, '0')
      .slice(0, CHAT_ID_LENGTH);
    const chat = parseChat({ id, text, ts: now });
    if (!chat) return null;
    this.lastChatAt = now;
    this.update({ chat: { ...chat, view: this.profile.activeView } });
    return chat;
  }

  /** Remove this PC's bubble. */
  deleteChat(): void {
    if (this.profile.chat) this.update({ chat: undefined });
  }

  private ownChat(view: string): PeerChat | undefined {
    const c = this.profile.chat;
    return c?.view === view ? toPeerChat(c) : undefined;
  }

  /** Joined team offices with their keys, for PeerNet (derived once per offices change). */
  teamChannels(): TeamChannel[] {
    const src = this.profile.offices;
    if (this.channels?.src !== src) {
      this.channels = {
        src,
        list: src.map((o) => ({
          tag: o.tag,
          name: o.name,
          key: teamKey(Buffer.from(o.secret, 'base64')),
        })),
      };
    }
    return this.channels.list;
  }

  /** One office's agents. The public office is empty while this PC is in any team. */
  office(view: string): OfficeAgent[] {
    if (!this.isOpen(view)) return [];
    return buildOffice(this.self(), this.local.views(), this.peersIn(view));
  }

  /** Everyone in one office (this PC first, then live peers, agents or not); same gate as office(). */
  people(view: string): OfficePersonMessage[] {
    if (!this.isOpen(view)) return [];
    const rows = [
      { peer: this.self(), chat: this.ownChat(view), avatar: this.ownAvatar(view) },
      ...this.peersIn(view),
    ];
    const pub = view === PUBLIC_VIEW;
    return rows.map(({ peer, chat, avatar }, i) => ({
      ...this.person(peer, i === 0, pub),
      ...(chat && { chat: toChatMessage(chat) }),
      ...(avatar && { avatar: { ...avatar } }),
    }));
  }

  /** `pub` = a public office row: carries the person's network (and, not for me, the path)
   *  when known. */
  private person(p: PeerInfo, self: boolean, pub = false): DirectoryPersonMessage {
    const net = pub ? this.net.netOf?.(p.id) : undefined;
    const via = pub && !self ? this.net.viaOf?.(p.id) : undefined;
    return {
      peerId: p.id,
      account: p.account,
      nickname: p.nickname,
      ...(p.nickSince !== undefined && { nickSince: p.nickSince }),
      palette: p.palette,
      hueShift: p.hueShift,
      ...(p.pet && { pet: p.pet }),
      ...(p.tagColors && { tagColors: p.tagColors }),
      ...(p.statusColors && { statusColors: p.statusColors }),
      ...(p.outfit && { outfit: p.outfit }),
      ...(p.ver && { ver: p.ver }),
      ...(net && { net }),
      ...(via && { via }),
      self,
    };
  }

  /** People per area for the panel. Display only: never feeds office(), people() or notifications.
   *  This PC is listed first in the area it is in; a peer row with my id is dropped. */
  directory(): Omit<PeopleDirectory, 'type'> {
    const net = this.net.directory();
    const me = this.profile.peerId;
    const tag = this.profile.offices[0]?.tag;
    const mine = (area: 'public' | 'team' | 'personal') => {
      const here = this.personal ? 'personal' : tag ? 'team' : 'public';
      return here === area ? [this.person(this.self(), true, area === 'public')] : [];
    };
    const list = (own: DirectoryPersonMessage[], peers: PeerInfo[], pub = false) => {
      const seen = new Set<string>([...own.map((p) => p.peerId), me]);
      return [
        ...own,
        ...peers
          .filter((p) => !seen.has(p.id) && seen.add(p.id))
          .map((p) => this.person(p, false, pub)),
      ];
    };
    return {
      public: list(mine('public'), net.public, true),
      teams: this.officeList().map(({ tag: t, name }) => ({
        tag: t,
        name,
        people: list(mine('team'), net.teams[t] ?? []),
      })),
      personal: list(mine('personal'), net.personal),
    };
  }

  /** Another live PC in any office this PC can see (public while in it, every
   *  joined team) already uses this nickname. Unset ('') and keeping the
   *  current nickname are never taken. */
  nicknameTaken(nickname: string): boolean {
    const key = nicknameKey(nickname);
    if (key === '' || key === nicknameKey(this.profile.nickname)) return false;
    const { offices, peerId } = this.profile;
    const views = [...(offices.length === 0 ? [PUBLIC_VIEW] : []), ...offices.map((o) => o.tag)];
    return views.some((v) =>
      this.net.peers(v).some((p) => p.peer.id !== peerId && nicknameKey(p.peer.nickname) === key),
    );
  }

  /** Live peers of a view; none at all in personal mode (PeerNet is offline too). */
  private peersIn(view: string): PeerPacket[] {
    return this.personal ? [] : this.net.peers(view);
  }

  /** The public office only while in no team; a team office only once joined. */
  private isOpen(view: string): boolean {
    return isViewOpen(this.profile.offices, view);
  }

  /** Offices for this PC's browser: names only, never secrets (my own room's access code
   *  is shown to me, its host). */
  officeList(): { tag: string; name: string; host?: true; password?: string }[] {
    return this.profile.offices.map((o) => ({
      tag: o.tag,
      name: o.name || this.net.teamName(o.tag) || '',
      ...(o.host && { host: true as const }),
      ...(o.host && o.password && { password: o.password }),
    }));
  }

  /** New room hosted by this PC (title + optional access code); it becomes the active view
   *  and replaces the current team (one at a time) in the same save. null = created. */
  createOffice(name: unknown, password?: unknown): OfficeErrorReason | null {
    const n = validateOfficeName(name);
    if (n === null) return 'nameInvalid';
    const pw = validateRoomPassword(password);
    if (pw === null) return 'passwordInvalid';
    const office: TeamOffice = { ...officeFromSecret(newRoomSecret(), n), host: true };
    if (pw) office.password = pw;
    this.update({ offices: [office], activeView: office.tag });
    return null;
  }

  /** Join a listed room through its host. `done(null)` = joined (the room is the view now);
   *  already in it → switched to it, 'alreadyJoined'. */
  joinOffice(tag: unknown, password: unknown, done: (err: OfficeErrorReason | null) => void): void {
    const pw = validateRoomPassword(password);
    if (typeof tag !== 'string' || pw === null) {
      done(pw === null ? 'passwordInvalid' : 'roomGone');
      return;
    }
    if (this.profile.offices.some((o) => o.tag === tag)) {
      this.setActiveView(tag);
      done('alreadyJoined');
      return;
    }
    if (!this.net.joinRoom) {
      done('roomGone');
      return;
    }
    this.net.joinRoom(tag, pw, (r) => {
      if (!r.ok) {
        done(r.reason);
        return;
      }
      const office = officeFromSecret(r.secret, validateOfficeName(r.title) ?? '');
      if (office.tag !== tag) {
        done('roomGone');
        return;
      }
      try {
        this.update({ offices: [office], activeView: office.tag });
      } catch (err) {
        // Runs from a UDP datagram: never throw out of it.
        console.error('[Pixel Office] Failed to save offices:', err);
        done('roomGone');
        return;
      }
      done(null);
    });
  }

  /** The public office is on screen and full for this PC: move to personal mode (the caller
   *  tells the page). true = moved. */
  leaveFullPublic(): boolean {
    if (this.profile.activeView !== PUBLIC_VIEW || this.net.publicFull?.() !== true) return false;
    console.log('[Pixel Office] 공개 오피스가 가득 차 개인용으로 옮깁니다.');
    return this.setActiveView(PERSONAL_VIEW);
  }

  /** The room this PC hosts while it is on screen (advertised and admitting), else null. */
  hostedRoom(): HostedRoom | null {
    const o = this.profile.offices[0];
    if (!o?.host || this.profile.activeView !== o.tag) return null;
    return {
      tag: o.tag,
      title: o.name,
      by: peerLabel(this.self()),
      password: o.password ?? '',
      secret: Buffer.from(o.secret, 'base64'),
    };
  }

  /** Rooms on this LAN for the browser (never their secrets or codes). */
  rooms(): RoomSummary[] {
    return (this.net.roomList?.() ?? []).map((r) => ({
      tag: r.tag,
      title: r.title,
      host: r.host,
      locked: r.locked,
      count: r.count,
      max: OFFICE_MAX_PEOPLE,
    }));
  }

  leaveOffice(tag: unknown): boolean {
    const offices = this.profile.offices.filter((o) => o.tag !== tag);
    if (offices.length === this.profile.offices.length) return false;
    const { activeView } = this.profile;
    this.update({
      offices,
      activeView: isViewOpen(offices, activeView) ? activeView : (offices[0]?.tag ?? PUBLIC_VIEW),
    });
    return true;
  }

  /** PUBLIC_VIEW only while in no team, a joined tag, or PERSONAL_VIEW (always). */
  setActiveView(view: unknown): boolean {
    if (!isViewOpen(this.profile.offices, view)) return false;
    if (view !== this.profile.activeView) this.update({ activeView: view as string });
    return true;
  }

  /** Persist a validated update and announce it to peers right away. */
  saveProfile(update: EditableProfile): void {
    const changed = nicknameKey(update.nickname) !== nicknameKey(this.profile.nickname);
    this.update({
      ...update,
      pet: update.pet, // absent in the update = back to the human
      tagColors: update.tagColors, // absent = the default tag
      statusColors: update.statusColors, // absent = the default status tag
      outfit: update.outfit, // absent = the palette character
      setUp: true,
      nicknameSince: !changed
        ? this.profile.nicknameSince
        : update.nickname === ''
          ? 0
          : Date.now(),
    });
  }

  private update(patch: Partial<Profile>): void {
    const next: Profile = { ...this.profile, ...patch };
    // A bubble lives in its office: leaving it (or joining a team, for public) drops it.
    if (!next.chat || !isViewOpen(next.offices, next.chat.view)) delete next.chat;
    saveProfile(next, this.dir);
    this.profile = next;
    this.net.sendNow();
  }
}
