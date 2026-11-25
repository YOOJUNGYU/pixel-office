/* eslint-disable pixel-agents/no-inline-colors -- test fixtures */
import * as dgram from 'dgram';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AgentView, PeerInfo, PeerPacket } from '../../../core/src/lan.js';
import { peerLabel, PERSONAL_VIEW, PUBLIC_VIEW } from '../../../core/src/lan.js';
import {
  handleClientMessage,
  officesMessage,
  profileMessage,
  snapshotMessage,
} from '../../src/clientMessageHandler.js';
import { ROOM_HOST_GONE_MS, ROOM_STATE_MIN_VER } from '../../src/constants.js';
import { FileStateAdapter } from '../../src/fileStateAdapter.js';
import { createIdentity, newRoomSecret } from '../../src/lan/crypto.js';
import { buildOffice, LanService } from '../../src/lan/office.js';
import type { JoinResult } from '../../src/lan/peerNet.js';
import { PeerNet } from '../../src/lan/peerNet.js';
import type { Profile } from '../../src/lan/profile.js';
import { loadProfile, osAccount } from '../../src/lan/profile.js';
import type { RoomState } from '../../src/lan/room.js';
import { APP_VERSION } from '../../src/lan/updater.js';

/** A room created by `lan` (its host), as stored. */
const room = (lan: LanService, name: string, password?: string) => {
  expect(lan.createOffice(name, password, true)).toBeNull();
  return lan.profile.offices[0];
};

const saves = vi.hoisted(() => vi.fn());
vi.mock('../../src/lan/profile.js', async (orig) => {
  const m = await orig<typeof import('../../src/lan/profile.js')>();
  return {
    ...m,
    saveProfile: (...a: Parameters<typeof m.saveProfile>) => {
      saves(...a);
      m.saveProfile(...a);
    },
  };
});

const view = (o: Partial<AgentView> = {}): AgentView => ({
  id: 's1',
  provider: 'claude',
  kind: 'main',
  num: 1,
  room: 'coding',
  permission: false,
  act: 'edit',
  target: '/home/kim/a.ts',
  reason: '',
  ...o,
});
const self: PeerInfo = { id: 'me', account: 'me', nickname: '나', palette: 0, hueShift: 0 };
const peer: PeerPacket = {
  v: 1,
  peer: { id: 'p1', account: 'kim', nickname: '김', palette: 1, hueShift: 10 },
  views: [view({ id: 'm' }), view({ id: 'm/sub/x', kind: 'subagent', num: 0, parentId: 'm' })],
};

describe('buildOffice', () => {
  it('passes local and peer views through untouched (this PC only; senders redact)', () => {
    expect(buildOffice(self, [view()], [])[0].target).toBe('/home/kim/a.ts');
    expect(buildOffice(self, [], [peer])[0].target).toBe('/home/kim/a.ts');
  });

  it('keys agents by peer and links children to their parent', () => {
    const agents = buildOffice(self, [view()], [peer]);
    expect(agents.map((a) => a.key)).toEqual(['me:s1', 'p1:m', 'p1:m/sub/x']);
    expect(agents[1].parentKey).toBeUndefined();
    expect(agents[2].parentKey).toBe('p1:m');
    expect(agents[2].peer).toEqual(peer.peer);
  });
});

describe('LanService', () => {
  const profile: Profile = {
    peerId: 'me',
    nickname: '',
    palette: 2,
    hueShift: 30,
    manualPeers: [],
    identity: (({ publicKey, privateKeyPem }) => ({ publicKey, privateKeyPem }))(
      createIdentity('me'),
    ),
    offices: [],
    activeView: PUBLIC_VIEW,
    setUp: false,
    nicknameSince: 0,
  };

  it('sends an empty nickname until one is set, and always redacts', () => {
    const lan = new LanService({ ...profile }, { views: () => [view()] });
    const p = lan.packet('team-tag');
    expect(p.peer).toEqual({
      id: 'me',
      account: lan.account,
      nickname: '',
      palette: 2,
      hueShift: 30,
      ver: APP_VERSION,
    });
    expect(p.views[0].target).toBe('a.ts');
  });

  it('always asks for brief (program-name) views for peers', () => {
    const asked: Array<boolean | undefined> = [];
    const local = {
      views: (brief?: boolean) => {
        asked.push(brief);
        return [view({ target: brief ? 'ssh' : 'ssh dev@db01.acme.local' })];
      },
    };
    const lan = new LanService({ ...profile }, local);
    expect(lan.packet('team-tag').views[0].target).toBe('ssh');
    expect(lan.office(PUBLIC_VIEW)[0].target).toBe('ssh dev@db01.acme.local');
    expect(asked).toEqual([true, undefined]);
  });

  it('public presence is quiet (no target/reason, counts and title shared); team and my own snapshot keep detail', () => {
    const lan = new LanService(
      { ...profile },
      {
        views: () => [
          view({ act: 'edit', ageSec: 5, todo: { done: 1, total: 2 }, fail: true, title: 'T' }),
        ],
      },
    );
    const [q] = lan.packet(PUBLIC_VIEW).views;
    expect(q).toMatchObject({ act: 'edit', room: 'coding', target: '', reason: '', quiet: true });
    expect(q).toMatchObject({ ageSec: 5, todo: { done: 1, total: 2 }, fail: true, title: 'T' });
    const [team] = lan.packet('team-tag').views;
    expect(team).toMatchObject({ target: 'a.ts', ageSec: 5 });
    expect(team).not.toHaveProperty('quiet');
    expect(lan.office(PUBLIC_VIEW)[0]).toMatchObject({ target: '/home/kim/a.ts', ageSec: 5 });
    expect(lan.office(PUBLIC_VIEW)[0]).not.toHaveProperty('quiet');
  });

  it('a profile.json with the removed hideWork still loads; the team packet keeps full detail', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-hidework-'));
    try {
      fs.writeFileSync(
        path.join(dir, 'profile.json'),
        JSON.stringify({
          peerId: 'k',
          nickname: '',
          palette: 1,
          hueShift: 0,
          hideWork: true,
          manualPeers: [],
        }),
      );
      const loaded = loadProfile(dir);
      const lan = new LanService(loaded, { views: () => [view({ act: 'edit', ageSec: 5 })] });
      const [team] = lan.packet('team-tag').views;
      expect(team).toMatchObject({ act: 'edit', target: 'a.ts', ageSec: 5 });
      expect(team).not.toHaveProperty('hidden');
      expect(lan.self().ver).toBe(APP_VERSION);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("agentSeats: my page's seats go into that office's presence only", () => {
    const lan = new LanService({ ...profile }, { views: () => [view({ act: 'edit' })] });
    lan.setSeats([
      { id: 's1', seat: 'lan-007:1' },
      { id: 'x', seat: 'bad seat!' },
    ]);
    expect(lan.packet(PUBLIC_VIEW).views[0].seat).toBe('lan-007:1');
    expect(lan.packet('team-tag').views[0]).not.toHaveProperty('seat');
  });

  it('packet() never throws: a failing scan sends no views', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const lan = new LanService(
      { ...profile },
      {
        views: () => {
          throw new Error('boom');
        },
      },
    );
    expect(lan.packet().views).toEqual([]);
    err.mockRestore();
  });

  it("shared layouts: a save outranks every known version; a peer's is checked, newer only", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-lan-'));
    const lan = new LanService({ ...profile }, { views: () => [] }, dir);
    const peerAt = (rev: number) => ({ ...peer, layout: { rev, by: 'p1', h: 'a'.repeat(16) } });
    lan.net = {
      peers: () => [peerAt(7)],
      sendNow: () => {},
      teamName: () => undefined,
      directory: () => ({ public: [], teams: {}, personal: [] }),
    };
    expect(lan.saveSharedLayout({ m: 'mine' })).toBe(true);
    expect(lan.layouts.rev(PUBLIC_VIEW)).toMatchObject({ rev: 8, by: 'me' });

    const changed = vi.fn();
    lan.layoutChanged = changed;
    lan.checkLayout = (raw) =>
      (raw as { ok?: boolean }).ok ? (raw as Record<string, unknown>) : null;
    const rev = (n: number, by = 'p1') => ({ rev: n, by, h: 'a'.repeat(16) });
    lan.receiveLayout(PUBLIC_VIEW, rev(8, 'a'), '{"ok":true}'); // 'a' < 'me': older
    lan.receiveLayout(PUBLIC_VIEW, rev(9), '{"ok":false}'); // fails the check
    lan.receiveLayout(PUBLIC_VIEW, rev(9), 'not json');
    lan.receiveLayout('AAAAAAAAAAA', rev(9), '{"ok":true}'); // not a joined team
    expect(changed).not.toHaveBeenCalled();
    lan.receiveLayout(PUBLIC_VIEW, rev(9), '{"ok":true}');
    expect(changed).toHaveBeenCalledWith(PUBLIC_VIEW);
    expect(lan.layouts.layout(PUBLIC_VIEW)).toEqual({ ok: true });

    lan.setActiveView('personal');
    expect(lan.saveSharedLayout({ m: 'x' })).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('saveProfile persists, keeps peerId and announces right away', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-lan-'));
    const lan = new LanService({ ...profile }, { views: () => [] }, dir);
    const sendNow = vi.fn();
    lan.net = {
      peers: () => [],
      sendNow,
      teamName: () => undefined,
      directory: () => ({ public: [], teams: {}, personal: [] }),
    };
    const { peerId: _, ...rest } = profile;
    lan.saveProfile({ ...rest, nickname: '유' });
    expect(lan.profile).toMatchObject({ peerId: 'me', nickname: '유' });
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'profile.json'), 'utf-8'))).toMatchObject({
      peerId: 'me',
      nickname: '유',
    });
    expect(sendNow).toHaveBeenCalledOnce();
    const since = lan.profile.nicknameSince;
    expect(since).toBeGreaterThan(0);
    expect(lan.self().nickSince).toBe(since);
    lan.saveProfile({ ...rest, nickname: ' 유 ', palette: 3 }); // same nickname: time kept
    expect(lan.profile.nicknameSince).toBe(since);
    lan.saveProfile({ ...rest, nickname: '' });
    expect(lan.profile.nicknameSince).toBe(0);
    expect(lan.self()).not.toHaveProperty('nickSince');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('pet: announced in self() and people(); a save without one goes back to the human', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-lan-'));
    const lan = new LanService({ ...profile }, { views: () => [] }, dir);
    lan.net = {
      peers: () => [],
      sendNow: () => {},
      teamName: () => undefined,
      directory: () => ({ public: [], teams: {}, personal: [] }),
    };
    const { peerId: _, ...rest } = profile;
    expect(lan.self()).not.toHaveProperty('pet');
    lan.saveProfile({ ...rest, pet: 'gitcat' });
    expect(lan.self().pet).toBe('gitcat');
    expect(lan.people('public')[0].pet).toBe('gitcat');
    expect(lan.packet().peer.pet).toBe('gitcat');
    lan.saveProfile({ ...rest });
    expect(lan.self()).not.toHaveProperty('pet');
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'profile.json'), 'utf-8'))).not.toHaveProperty(
      'pet',
    );
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('tagColors: announced in self() and people(); a save without them goes back to the default', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-lan-'));
    const lan = new LanService({ ...profile }, { views: () => [] }, dir);
    lan.net = {
      peers: () => [],
      sendNow: () => {},
      teamName: () => undefined,
      directory: () => ({ public: [], teams: {}, personal: [] }),
    };
    const { peerId: _, ...rest } = profile;
    const tagColors = { bg: '#112233', fg: '#FFEEDD' };
    lan.saveProfile({ ...rest, tagColors });
    expect(lan.self().tagColors).toEqual(tagColors);
    expect(lan.people('public')[0].tagColors).toEqual(tagColors);
    expect(lan.packet().peer.tagColors).toEqual(tagColors);
    lan.saveProfile({ ...rest });
    expect(lan.self()).not.toHaveProperty('tagColors');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('statusColors: announced in self(), people() and the packet; a save without them drops them', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-lan-'));
    const lan = new LanService({ ...profile }, { views: () => [] }, dir);
    lan.net = {
      peers: () => [],
      sendNow: () => {},
      teamName: () => undefined,
      directory: () => ({ public: [], teams: {}, personal: [] }),
    };
    const { peerId: _, ...rest } = profile;
    const statusColors = { bg: '#112233', fg: '#FFEEDD', border: '#ABCDEF' };
    lan.saveProfile({ ...rest, statusColors });
    expect(lan.self().statusColors).toEqual(statusColors);
    expect(lan.people('public')[0].statusColors).toEqual(statusColors);
    expect(lan.packet().peer.statusColors).toEqual(statusColors);
    lan.saveProfile({ ...rest });
    expect(lan.self()).not.toHaveProperty('statusColors');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('nickname uniqueness', () => {
    const pkt = (id: string, nickname: string): PeerPacket => ({
      v: 1,
      peer: { id, account: id, nickname, palette: 0, hueShift: 0 },
      views: [],
    });
    let dir: string;
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
    const mk = (offices: Profile['offices'] = []) => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-nick-'));
      const lan = new LanService({ ...profile, nickname: 'Me', offices }, { views: () => [] }, dir);
      const peers: Record<string, PeerPacket[]> = {
        [PUBLIC_VIEW]: [pkt('p1', 'Ji  Min'), pkt('me', 'Spoof'), pkt('p2', 'Caf\u00e9')],
        team: [pkt('mate', 'Mate')],
        other: [pkt('x', 'Stranger')],
      };
      lan.net = {
        peers: (v) => peers[v] ?? [],
        sendNow: () => {},
        teamName: () => undefined,
        directory: () => ({ public: [], teams: {}, personal: [] }),
      };
      return lan;
    };

    it('rejects a live public name in case/whitespace/NFC variants; own and unset are fine', () => {
      const lan = mk();
      for (const n of ['Ji Min', ' ji min ', 'JI\tMIN', 'ji   min'])
        expect(lan.nicknameTaken(n)).toBe(true);
      expect(lan.nicknameTaken('Mate')).toBe(false); // team peer not visible while public
      expect(lan.nicknameTaken('Stranger')).toBe(false);
      expect(lan.nicknameTaken('Spoof')).toBe(false); // our own peer id is not "another PC"
      expect(lan.nicknameTaken('me')).toBe(false); // own current name
      expect(lan.nicknameTaken('')).toBe(false);
      expect(lan.nicknameTaken('CAFE\u0301')).toBe(true); // decomposed é
    });

    it('in a team: only joined teams count, not public or other teams', () => {
      const lan = mk([{ tag: 'team', name: 't', secret: 's' }]);
      expect(lan.nicknameTaken('mate')).toBe(true);
      expect(lan.nicknameTaken('Ji Min')).toBe(false);
      expect(lan.nicknameTaken('stranger')).toBe(false);
    });

    it('saveProfile with a taken name: profileError then the unchanged profile, nothing saved', () => {
      const lan = mk();
      const sent: Record<string, unknown>[] = [];
      const {
        peerId: _,
        identity: __,
        offices: ___,
        activeView: ____,
        setUp: _____,
        ...rest
      } = profile;
      handleClientMessage(
        { type: 'saveProfile', profile: { ...rest, nickname: 'JI MIN' } },
        (m) => sent.push(m),
        { adapter: new FileStateAdapter(), cache: null, privileged: true, lan },
      );
      expect(sent.map((m) => m.type)).toEqual(['profileError', 'profileLoaded']);
      expect(sent[0]).toEqual({ type: 'profileError', reason: 'nicknameTaken' });
      expect(lan.profile.nickname).toBe('Me');
    });
  });

  it('profileLoaded: fixed account and firstRun until the first save; saveProfile cannot set the account', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-acct-'));
    const lan = new LanService({ ...profile }, { views: () => [] }, dir);
    expect(lan.account).toBe(osAccount());
    expect(profileMessage(lan, true)).toMatchObject({ account: lan.account, firstRun: true });
    expect(lan.self().account).toBe(lan.account);
    const sent: Record<string, unknown>[] = [];
    const {
      peerId: _,
      identity: __,
      offices: ___,
      activeView: ____,
      setUp: _____,
      ...rest
    } = profile;
    handleClientMessage(
      { type: 'saveProfile', profile: { ...rest, nickname: '', account: 'hacker', peerId: 'x' } },
      (m) => sent.push(m),
      { adapter: new FileStateAdapter(), cache: null, privileged: true, lan },
    );
    expect(lan.profile).toMatchObject({ nickname: '', setUp: true });
    expect(lan.profile).not.toHaveProperty('account');
    expect(lan.self().account).toBe(osAccount());
    expect(profileMessage(lan, true)).toMatchObject({ account: osAccount(), firstRun: false });
    expect(fs.readFileSync(path.join(dir, 'profile.json'), 'utf-8')).not.toContain('hacker');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('offices', () => {
    const teamPeer: PeerPacket = {
      v: 1,
      peer: { id: 'mate', account: 'mate', nickname: '팀원', palette: 0, hueShift: 0 },
      views: [view({ id: 'team-secret-work' })],
    };
    const pubPeer: PeerPacket = { ...peer, views: [view({ id: 'public-work' })] };
    let dir: string;
    const mk = () => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-off-'));
      const lan = new LanService({ ...profile }, { views: () => [view()] }, dir);
      const sendNow = vi.fn();
      lan.net = {
        ...lan.net,
        peers: (v: string) => (v === PUBLIC_VIEW ? [pubPeer] : [teamPeer]),
        sendNow,
        teamName: () => 'announced',
      };
      return { lan, sendNow };
    };
    const keys = (agents: { key: string }[]) => agents.map((a) => a.key);
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    it('public office: self + public peers while in no team', () => {
      const { lan } = mk();
      expect(keys(lan.office(PUBLIC_VIEW))).toEqual(['me:s1', 'p1:public-work']);
      expect(lan.office('unknown-tag')).toEqual([]);
    });

    it('people: self first, zero-agent peers included, team peers never in public', () => {
      const { lan } = mk();
      const idle: PeerPacket = { ...pubPeer, peer: { ...pubPeer.peer, id: 'idle' }, views: [] };
      lan.net.peers = (v: string) => (v === PUBLIC_VIEW ? [pubPeer, idle] : [teamPeer]);
      const ids = (m: { people: { peerId: string; self: boolean }[] }) =>
        m.people.map((p) => `${p.peerId}${p.self ? '*' : ''}`);
      expect(ids(snapshotMessage(lan))).toEqual(['me*', 'p1', 'idle']);
      expect(snapshotMessage(lan).people[1]).toEqual({
        peerId: 'p1',
        account: 'kim',
        nickname: '김',
        palette: 1,
        hueShift: 10,
        self: false,
      });
      const created = room(lan, '팀');
      expect(ids(snapshotMessage(lan))).toEqual(['me*', 'mate']);
      expect(lan.people(PUBLIC_VIEW)).toEqual([]);
      expect(lan.people('unknown-tag')).toEqual([]);
      expect(lan.people(created.tag).map((p) => p.peerId)).toEqual(['me', 'mate']);
    });

    it('create: a hosted room becomes the view, the public office is empty', () => {
      const { lan, sendNow } = mk();
      const created = room(lan, ' 우리팀 ', ' 1234 ');
      expect(created).toMatchObject({ name: '우리팀', host: true, password: '1234' });
      expect(sendNow).toHaveBeenCalled();
      expect(lan.profile.activeView).toBe(created.tag);
      expect(keys(lan.office(created.tag))).toEqual(['me:s1', 'mate:team-secret-work']);
      expect(lan.office(PUBLIC_VIEW)).toEqual([]);
      // this PC's browser follows activeView
      expect(keys(snapshotMessage(lan).agents)).toContain('mate:team-secret-work');
      expect(lan.setActiveView(PUBLIC_VIEW)).toBe(false);
      expect(lan.createOffice('a', 'x'.repeat(33))).toBe('passwordInvalid');
      expect(lan.createOffice('a', 5)).toBe('passwordInvalid');
    });

    it('hostedRoom: only while the room is on screen; no code = open', () => {
      const { lan } = mk();
      const r = room(lan, '방');
      expect(lan.hostedRoom()).toMatchObject({
        tag: r.tag,
        title: '방',
        by: peerLabel(lan.self()),
        max: 20,
        room: { host: lan.profile.peerId, pw: '', max: 20 },
      });
      expect(lan.hostedRoom()?.secret.toString('base64')).toBe(r.secret);
      lan.setActiveView(PERSONAL_VIEW, true);
      expect(lan.hostedRoom()).toBeNull();
    });

    it('officesState carries names only; the code to its host; the secret stays in the 0600 profile', () => {
      const { lan } = mk();
      const created = room(lan, '팀', 'pw');
      const msg = JSON.stringify(officesMessage(lan));
      const { secret } = lan.profile.offices[0];
      expect(msg).not.toContain(secret);
      expect(officesMessage(lan)).toEqual({
        type: 'officesState',
        offices: [
          {
            tag: created.tag,
            name: '팀',
            host: true,
            password: 'pw',
            hostId: 'me',
            max: 20,
            next: '',
          },
        ],
        activeView: created.tag,
      });
      const file = path.join(dir, 'profile.json');
      expect(fs.readFileSync(file, 'utf-8')).toContain(secret);
      if (process.platform !== 'win32') expect(fs.statSync(file).mode & 0o777).toBe(0o600);
      expect(loadProfile(dir).offices).toEqual(lan.profile.offices);
    });

    it('join through the host, leave back to public', () => {
      const host = mk().lan;
      const { tag, secret } = room(host, '팀');
      const { lan } = mk();
      const answers: JoinResult[] = [{ ok: false, reason: 'wrongPassword' }];
      lan.net.joinRoom = (_t, _pw, done) =>
        done(answers.shift() ?? { ok: true, secret: Buffer.from(secret, 'base64'), title: '팀' });
      const got: (string | null)[] = [];
      const join = (t: unknown, pw?: unknown) => lan.joinOffice(t, pw, (e) => got.push(e));
      join(tag, 'x'.repeat(33));
      join(tag, 'bad');
      join(tag, 'ok');
      expect(lan.profile.offices.map((o) => o.tag)).toEqual([tag]);
      expect(lan.profile.offices[0]).not.toHaveProperty('host');
      expect(lan.officeList()).toEqual([{ tag, name: '팀' }]);
      join(tag); // again: no duplicate
      expect(got).toEqual(['passwordInvalid', 'wrongPassword', null, 'alreadyJoined']);
      expect(lan.profile.offices).toHaveLength(1);
      expect(lan.leaveOffice('other')).toBe(false);
      expect(lan.leaveOffice(tag)).toBe(true);
      expect(lan.profile).toMatchObject({ offices: [], activeView: PUBLIC_VIEW });
      expect(keys(lan.office(PUBLIC_VIEW))).toContain('p1:public-work');
    });

    it("a join answered with another room's secret is refused", () => {
      const { lan } = mk();
      lan.net.joinRoom = (_t, _pw, done) => done({ ok: true, secret: newRoomSecret(), title: 'x' });
      const got: (string | null)[] = [];
      lan.joinOffice('AAAAAAAAAAA', '', (e) => got.push(e));
      expect(got).toEqual(['roomGone']);
      expect(lan.profile.offices).toEqual([]);
    });

    it('rooms: the LAN list with the cap, never a secret', () => {
      const { lan } = mk();
      lan.net.roomList = () => [
        { tag: 'T', title: '방', host: 'kim', hostId: 'H', locked: true, count: 4 },
      ];
      expect(lan.rooms()).toEqual([
        { tag: 'T', title: '방', host: 'kim', locked: true, count: 4, max: 20 },
      ]);
    });

    it('leaveFullPublic: only from a full public office, into personal mode', () => {
      const { lan } = mk();
      let full = false;
      lan.net.publicFull = () => full;
      expect(lan.leaveFullPublic()).toBe(false);
      full = true;
      expect(lan.leaveFullPublic()).toBe(true);
      expect(lan.profile.activeView).toBe(PERSONAL_VIEW);
      expect(lan.leaveFullPublic()).toBe(false); // not in the public office any more
    });

    it('rejects bad names', () => {
      const { lan } = mk();
      expect(lan.createOffice('')).toBe('nameInvalid');
      expect(lan.createOffice('x'.repeat(21))).toBe('nameInvalid');
      expect(lan.createOffice(5)).toBe('nameInvalid');
    });

    it('create or join while in a team replaces the team in one save', () => {
      const { lan } = mk();
      const a = room(lan, 'a');
      saves.mockClear();
      const b = room(lan, 'b');
      expect(saves).toHaveBeenCalledTimes(1);
      expect(lan.profile.offices.map((o) => o.name)).toEqual(['b']);
      expect(lan.profile.activeView).toBe(b.tag);
      expect(loadProfile(dir).offices.map((o) => o.name)).toEqual(['b']);
      lan.net.joinRoom = (_t, _pw, done) =>
        done({ ok: true, secret: Buffer.from(a.secret, 'base64'), title: 'a' });
      const got: (string | null)[] = [];
      lan.joinOffice(a.tag, '', (e) => got.push(e), true);
      lan.joinOffice(a.tag, '', (e) => got.push(e));
      expect(got).toEqual([null, 'alreadyJoined']);
      expect(lan.profile.offices.map((o) => o.tag)).toEqual([a.tag]);
      expect(lan.profile.activeView).toBe(a.tag);
    });
  });

  describe('room host powers', () => {
    const NEW = ROOM_STATE_MIN_VER;
    const pk = (id: string, ver = NEW): PeerPacket => ({
      v: 1,
      peer: { id, account: id, nickname: id, palette: 0, hueShift: 0, ver },
      views: [],
    });
    const dirs: string[] = [];
    afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
    /** A LanService with a fake net: `live` = live team packets, `heard` = lastHeard per id,
     *  `sent` = the profile at every sendNow. */
    const mk = (peerId: string) => {
      const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-room-'));
      dirs.push(d);
      const lan = new LanService({ ...profile, peerId }, { views: () => [] }, d);
      const live: PeerPacket[] = [];
      const heard = new Map<string, number>();
      const sent: Profile[] = [];
      lan.net = {
        ...lan.net,
        peers: (v: string) => (v === PUBLIC_VIEW ? [] : live),
        sendNow: () => sent.push(lan.profile),
        lastHeard: (_t: string, id: string) => heard.get(id),
      };
      return { lan, live, heard, sent };
    };
    const state = (lan: LanService) => lan.profile.offices[0]?.room as RoomState;
    /** Host 'me' with a room listing `members` in its order (via its own upkeep). */
    const hosting = (members: string[], pw?: string) => {
      const h = mk('me');
      const { tag, secret } = room(h.lan, 'R', pw);
      h.live.push(...members.map((m) => pk(m)));
      members.forEach((m) => h.heard.set(m, 0));
      h.lan.tickRoom(0);
      expect(state(h.lan).order).toEqual(['me', ...members]);
      return { ...h, tag, secret };
    };
    /** `id` joined the host's room, holding `s`. */
    const joined = (id: string, tag: string, secret: string, s: RoomState) => {
      const m = mk(id);
      m.lan.net.joinRoom = (_t, _pw, done) =>
        done({ ok: true, secret: Buffer.from(secret, 'base64'), title: s.title, room: s });
      const got: (string | null)[] = [];
      m.lan.joinOffice(tag, '', (e) => got.push(e));
      expect(got).toEqual([null]);
      expect(state(m.lan)).toEqual(s);
      return m;
    };

    it('a member named in a newer kick leaves for personal mode; others hide it', () => {
      const h = hosting(['mate']);
      const m = joined('mate', h.tag, h.secret, state(h.lan));
      expect(h.lan.kickMember('me')).toBe(false);
      expect(h.lan.kickMember('bad id!')).toBe(false);
      expect(h.lan.kickMember('mate')).toBe(true);
      expect(state(h.lan)).toMatchObject({ order: ['me'], kicked: ['mate'] });
      expect(h.sent.at(-1)?.offices[0].room?.kicked).toEqual(['mate']);
      expect(h.lan.people(h.tag).map((p) => p.peerId)).toEqual(['me']);
      expect(m.lan.kickMember('me')).toBe(false); // not the host
      expect(m.lan.receiveRoom(h.tag, state(h.lan))).toEqual({ reason: 'kicked', title: 'R' });
      expect(m.lan.profile).toMatchObject({ offices: [], activeView: PERSONAL_VIEW });
    });

    it('leaving the hosted room needs consent; with it the successor is written first', () => {
      const h = hosting(['mate']);
      expect(h.lan.needsHandover()).toBe(true);
      expect(h.lan.setActiveView(PERSONAL_VIEW)).toBe(false);
      expect(h.lan.leaveOffice(h.tag)).toBe(false);
      expect(h.lan.createOffice('other')).toBe('handover');
      const got: (string | null)[] = [];
      h.lan.joinOffice('AAAAAAAAAAA', '', (e) => got.push(e));
      expect(got).toEqual(['handover']);
      expect(h.lan.hostedRoom()?.tag).toBe(h.tag);
      const rev = state(h.lan).rev;
      h.sent.length = 0;
      expect(h.lan.setActiveView(PERSONAL_VIEW, true)).toBe(true);
      // sent while still on the room's view, before the switch
      expect(h.sent[0]).toMatchObject({ activeView: h.tag });
      expect(h.sent[0].offices[0].room).toMatchObject({ rev: rev + 1, by: 'me', host: 'mate' });
      expect(h.lan.profile.activeView).toBe(PERSONAL_VIEW);
      expect(h.lan.needsHandover()).toBe(false);
      // back on the room tab: a plain member
      h.lan.setActiveView(h.tag);
      expect(h.lan.hostedRoom()).toBeNull();
    });

    it('an old peer is no successor; the host alone keeps the room across a view switch', () => {
      const h = hosting([]);
      h.live.push(pk('old', '1.0.79'));
      h.lan.tickRoom(1);
      expect(state(h.lan).order).toEqual(['me']);
      expect(h.lan.officeList()[0]).toMatchObject({ host: true, hostId: 'me', next: '' });
      const before = state(h.lan);
      expect(h.lan.setActiveView(PERSONAL_VIEW, true)).toBe(true);
      expect(state(h.lan)).toEqual(before);
      expect(h.lan.setActiveView(h.tag)).toBe(true);
      expect(h.lan.hostedRoom()?.tag).toBe(h.tag);
    });

    it('officeList names the successor to the host', () => {
      const h = hosting(['mate']);
      expect(h.lan.officeList()[0]).toMatchObject({ hostId: 'me', max: 20, next: 'mate' });
    });

    it('a takeover demotes the original host; its stale rev is never taken back', () => {
      const h = hosting(['mate', 'zed']);
      const s = state(h.lan);
      const z = joined('zed', h.tag, h.secret, s);
      const take: RoomState = { ...s, rev: s.rev + 1, by: 'mate', host: 'mate' };
      expect(z.lan.receiveRoom(h.tag, take)).toBeNull();
      expect(h.lan.receiveRoom(h.tag, take)).toBeNull();
      expect(state(h.lan)).toEqual(take);
      expect(h.lan.hostedRoom()).toBeNull();
      expect(h.lan.officeList()[0]).not.toHaveProperty('host');
      expect(h.lan.officeList()[0]).toMatchObject({ hostId: 'mate' });
      expect(z.lan.receiveRoom(h.tag, s)).toBeNull();
      expect(state(z.lan)).toEqual(take);
      // a state written by a plain member is ignored
      expect(z.lan.receiveRoom(h.tag, { ...take, rev: take.rev + 1, by: 'me' })).toBeNull();
      expect(state(z.lan)).toEqual(take);
    });

    it('the successor takes over after ROOM_HOST_GONE_MS of host silence; others wait', () => {
      const h = hosting(['mate', 'zed']);
      const s = state(h.lan);
      const m = joined('mate', h.tag, h.secret, s);
      const z = joined('zed', h.tag, h.secret, s);
      m.live.push(pk('zed'));
      z.live.push(pk('mate'));
      for (const x of [m, z]) x.heard.set('me', 1000);
      expect(m.lan.tickRoom(1000)).toBeNull();
      expect(z.lan.tickRoom(1000)).toBeNull();
      expect(m.lan.tickRoom(1000 + ROOM_HOST_GONE_MS)).toBeNull();
      expect(z.lan.tickRoom(1001 + ROOM_HOST_GONE_MS)).toBeNull();
      expect(m.lan.tickRoom(1001 + ROOM_HOST_GONE_MS)).toEqual({ reason: 'nowHost', title: 'R' });
      expect(state(m.lan)).toMatchObject({ rev: s.rev + 1, by: 'mate', host: 'mate' });
      expect(m.lan.hostedRoom()?.tag).toBe(h.tag);
      expect(z.lan.receiveRoom(h.tag, state(m.lan))).toBeNull();
      expect(state(z.lan).host).toBe('mate');
    });

    it('a handed-over host role is announced to its new host', () => {
      const h = hosting(['mate']);
      const m = joined('mate', h.tag, h.secret, state(h.lan));
      h.lan.setActiveView(PERSONAL_VIEW, true);
      expect(m.lan.receiveRoom(h.tag, state(h.lan))).toEqual({ reason: 'nowHost', title: 'R' });
      expect(m.lan.receiveRoom(h.tag, state(h.lan))).toBeNull(); // the same rev again
    });

    it('setRoom: host only, validated; a lower max keeps everyone', () => {
      const h = hosting(['mate', 'zed']);
      const s = state(h.lan);
      expect(h.lan.setRoom({ max: 1 })).toBe('maxInvalid');
      expect(h.lan.setRoom({ max: 21 })).toBe('maxInvalid');
      expect(h.lan.setRoom({ max: 2.5 })).toBe('maxInvalid');
      expect(h.lan.setRoom({ title: '' })).toBe('nameInvalid');
      expect(h.lan.setRoom({ password: 'x'.repeat(33) })).toBe('passwordInvalid');
      expect(state(h.lan)).toEqual(s);
      expect(h.lan.setRoom({ max: 2, title: ' New ', password: 'pw' })).toBeNull();
      expect(state(h.lan)).toMatchObject({
        rev: s.rev + 1,
        title: 'New',
        max: 2,
        pw: 'pw',
        order: ['me', 'mate', 'zed'],
      });
      expect(h.lan.profile.offices[0].name).toBe('New');
      expect(h.lan.officeList()[0]).toMatchObject({ name: 'New', password: 'pw', max: 2 });
      const m = joined('mate', h.tag, h.secret, state(h.lan));
      expect(m.lan.setRoom({ max: 5 })).toBe('roomGone');
    });

    it('admitted lifts a kick once (locked room re-admission), idempotent', () => {
      const h = hosting(['mate'], 'pw');
      h.lan.kickMember('mate');
      const rev = state(h.lan).rev;
      expect(h.lan.admitted(h.tag, 'mate')?.kicked).toEqual([]);
      expect(state(h.lan)).toMatchObject({ rev: rev + 1, kicked: [] });
      expect(h.lan.admitted(h.tag, 'mate')?.rev).toBe(rev + 1);
      expect(h.lan.admitted(h.tag, 'new')?.rev).toBe(rev + 1);
      expect(h.lan.admitted('other-tag', 'mate')).toBeUndefined(); // not hosting that room
    });

    describe('page messages', () => {
      const ask = (lan: LanService, msg: Record<string, unknown>, privileged = true) => {
        const sent: Record<string, unknown>[] = [];
        handleClientMessage(msg as never, (m) => sent.push(m), {
          adapter: new FileStateAdapter(),
          cache: null,
          privileged,
          lan,
          onOfficesChanged: () => sent.push(officesMessage(lan)),
        });
        return sent;
      };

      it('setRoom: refused read-only; privileged → officesState with the new max, or officeError', () => {
        const h = hosting(['mate']);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(ask(h.lan, { type: 'setRoom', max: 5 }, false)).toEqual([]);
        warn.mockRestore();
        expect(state(h.lan).max).not.toBe(5);
        const ok = ask(h.lan, { type: 'setRoom', max: 5 });
        expect(ok).toHaveLength(1);
        expect(ok[0]).toMatchObject({ type: 'officesState' });
        expect(h.lan.officeList()[0].max).toBe(5);
        expect(ask(h.lan, { type: 'setRoom', max: 999 })).toEqual([
          { type: 'officeError', reason: 'maxInvalid' },
        ]);
      });

      it('kickMember: officesState (after the change, or unchanged when refused)', () => {
        const h = hosting(['mate']);
        expect(ask(h.lan, { type: 'kickMember', peerId: 'mate' })[0]).toMatchObject({
          type: 'officesState',
        });
        expect(state(h.lan).kicked).toEqual(['mate']);
        const rev = state(h.lan).rev;
        expect(ask(h.lan, { type: 'kickMember', peerId: 'me' })).toEqual([officesMessage(h.lan)]);
        expect(state(h.lan).rev).toBe(rev);
      });

      it('createOffice / joinOffice / leaveOffice from the hosted room need handover', () => {
        const h = hosting(['mate']);
        const unchanged = officesMessage(h.lan);
        expect(ask(h.lan, { type: 'createOffice', name: 'other' })).toEqual([unchanged]);
        h.lan.net.joinRoom = () => {
          throw new Error('asked without consent');
        };
        expect(ask(h.lan, { type: 'joinOffice', tag: 'AAAAAAAAAAA', password: '' })).toEqual([
          unchanged,
        ]);
        expect(ask(h.lan, { type: 'leaveOffice', tag: h.tag })).toEqual([unchanged]);
        expect(h.lan.profile.offices.map((o) => o.tag)).toEqual([h.tag]);
        expect(state(h.lan).host).toBe('me');

        // leaveOffice with handover: the role passes, then the room is left
        h.sent.length = 0;
        ask(h.lan, { type: 'leaveOffice', tag: h.tag, handover: true });
        expect(h.sent[0].offices[0].room).toMatchObject({ host: 'mate' });
        expect(h.lan.profile.offices).toEqual([]);

        // createOffice with handover
        const c = hosting(['mate']);
        ask(c.lan, { type: 'createOffice', name: 'other', handover: true });
        expect(
          c.sent.some((p) => p.offices[0]?.tag === c.tag && p.offices[0].room?.host === 'mate'),
        ).toBe(true);
        expect(c.lan.profile.offices.map((o) => o.name)).toEqual(['other']);

        // joinOffice with handover
        const j = hosting(['mate']);
        const other = mk('x');
        const { tag, secret } = room(other.lan, 'O');
        j.lan.net.joinRoom = (_t, _pw, done) =>
          done({ ok: true, secret: Buffer.from(secret, 'base64'), title: 'O' });
        ask(j.lan, { type: 'joinOffice', tag, password: '', handover: true });
        expect(
          j.sent.some((p) => p.offices[0]?.tag === j.tag && p.offices[0].room?.host === 'mate'),
        ).toBe(true);
        expect(j.lan.profile.offices.map((o) => o.tag)).toEqual([tag]);
      });

      it('a host switching view without handover gets officesState unchanged; with it, it moves', () => {
        const h = hosting(['mate']);
        const out = ask(h.lan, { type: 'setActiveView', view: PERSONAL_VIEW });
        expect(out).toEqual([officesMessage(h.lan)]);
        expect(h.lan.profile.activeView).toBe(h.tag);
        ask(h.lan, { type: 'setActiveView', view: PERSONAL_VIEW, handover: true });
        expect(h.lan.profile.activeView).toBe(PERSONAL_VIEW);
        expect(state(h.lan).host).toBe('mate');
      });
    });

    it('directory: a kicked id is not listed in the team area', () => {
      const h = hosting(['mate', 'zed']);
      const info = (id: string) => pk(id).peer;
      h.lan.net.directory = () => ({
        public: [],
        teams: { [h.tag]: [info('mate'), info('zed')] },
        personal: [],
      });
      expect(h.lan.kickMember('mate')).toBe(true);
      expect(h.lan.directory().teams[0].people.map((p) => p.peerId)).toEqual(['me', 'zed']);
    });

    it('a handover and a takeover of the same rev (two hosts) converge after upkeep', () => {
      const h = hosting(['mate', 'zed']);
      const s = state(h.lan);
      const m = joined('mate', h.tag, h.secret, s);
      const z = joined('zed', h.tag, h.secret, s);
      m.live.push(pk('zed'));
      z.live.push(pk('mate'));
      for (const x of [h, m, z]) x.lan.tickRoom(1000);
      for (const x of [m, z]) x.heard.set('me', 1000);
      // The host no longer hears mate: it hands over to zed as it leaves the room's screen…
      h.live.splice(0, h.live.length, pk('zed'));
      expect(h.lan.setActiveView(PERSONAL_VIEW, true)).toBe(true);
      const handed = state(h.lan);
      expect(handed).toMatchObject({ rev: s.rev + 1, by: 'me', host: 'zed' });
      // …while mate, not hearing it, takes over: same rev, by mate ('me' > 'mate').
      expect(m.lan.tickRoom(1001 + ROOM_HOST_GONE_MS)).toEqual({ reason: 'nowHost', title: 'R' });
      const taken = state(m.lan);
      expect(taken).toMatchObject({ rev: s.rev + 1, by: 'mate', host: 'mate' });
      expect(z.lan.receiveRoom(h.tag, handed)).toEqual({ reason: 'nowHost', title: 'R' });
      expect(z.lan.receiveRoom(h.tag, taken)).toBeNull();
      expect(m.lan.receiveRoom(h.tag, handed)).toBeNull();
      expect([m.lan.hostedRoom()?.tag, z.lan.hostedRoom()?.tag]).toEqual([h.tag, h.tag]);
      // Both hosts drop the silent original host from the order: r+2 each, larger `by` wins.
      const later = 2000 + ROOM_HOST_GONE_MS;
      m.lan.tickRoom(later);
      z.lan.tickRoom(later);
      const [ms, zs] = [state(m.lan), state(z.lan)];
      expect([ms.rev, zs.rev]).toEqual([s.rev + 2, s.rev + 2]);
      for (const x of [h, m, z]) {
        x.lan.receiveRoom(h.tag, ms);
        x.lan.receiveRoom(h.tag, zs);
      }
      for (const x of [h, m, z]) expect(state(x.lan)).toEqual(zs);
      expect(zs).toMatchObject({ by: 'zed', host: 'zed' });
      expect(zs.order).not.toContain('me');
      expect(m.lan.hostedRoom()).toBeNull();
      expect(z.lan.hostedRoom()?.tag).toBe(h.tag);
    });

    it('real PeerNet: silence is judged on ROOM_HOST_GONE_MS, not the peer TTL', async () => {
      const freePort = () =>
        new Promise<number>((res) => {
          const sock = dgram.createSocket('udp4');
          sock.bind(0, '127.0.0.1', () => {
            const { port } = sock.address();
            sock.close(() => res(port));
          });
        });
      const clock = { t: 0, quiet: false };
      const ports = [await freePort(), await freePort()];
      const targets = ports.map((p) => `127.0.0.1:${p.toString()}`);
      const nets: PeerNet[] = [];
      const wire = (lan: LanService, port: number) => {
        const net = new PeerNet({
          port,
          targets: () => (clock.quiet ? [] : targets),
          identity: { id: lan.profile.peerId, ...lan.profile.identity },
          // this build may be older than ROOM_STATE_MIN_VER: announce a room-aware version
          getPacket: (c) => {
            const p = lan.packet(c);
            return { ...p, peer: { ...p.peer, ver: NEW } };
          },
          manualPeers: () => [],
          offices: () => lan.teamChannels(),
          hostedRoom: () => lan.hostedRoom(),
          offline: () => lan.personal,
          onRoom: (tag, r) => lan.receiveRoom(tag, r),
          pins: new Map<string, string>(),
          now: () => clock.t,
        });
        nets.push(net);
        return net;
      };
      try {
        const h = mk('me');
        const { tag, secret } = room(h.lan, 'R');
        const m = joined('mate', tag, secret, state(h.lan));
        h.lan.net = wire(h.lan, ports[0]);
        m.lan.net = wire(m.lan, ports[1]);
        await Promise.all(nets.map((n) => n.start()));
        for (const x of [h, m]) x.lan.tickRoom(clock.t);
        clock.t = 100_000; // long on the room's screen
        const pump = async () => {
          for (let i = 0; i < 100 && !state(h.lan).order.includes('mate'); i++) {
            nets.forEach((n) => n.sendNow());
            await new Promise((r) => setTimeout(r, 20));
            h.lan.tickRoom(clock.t);
          }
          for (let i = 0; i < 5; i++) {
            nets.forEach((n) => n.sendNow());
            await new Promise((r) => setTimeout(r, 20));
          }
        };
        await pump();
        expect(state(h.lan).order).toEqual(['me', 'mate']);
        expect(m.lan.net.lastHeard?.(tag, 'me')).toBe(clock.t);
        expect(h.lan.net.lastHeard?.(tag, 'mate')).toBe(clock.t);
        const heard = clock.t;
        clock.quiet = true; // both silent from here on (still ticking: stale peers are pruned)
        clock.t = heard + 10_000; // past PEER_TTL_MS, within ROOM_HOST_GONE_MS
        nets.forEach((n) => n.sendNow());
        expect(m.lan.net.peers(tag)).toEqual([]);
        expect(m.lan.tickRoom(clock.t)).toBeNull();
        expect(state(m.lan).host).toBe('me');
        h.lan.tickRoom(clock.t);
        expect(state(h.lan).order).toEqual(['me', 'mate']); // the host keeps the member
        clock.t = heard + 31_000;
        nets.forEach((n) => n.sendNow());
        expect(m.lan.tickRoom(clock.t)).toEqual({ reason: 'nowHost', title: 'R' });
        h.lan.tickRoom(clock.t);
        expect(state(h.lan).order).toEqual(['me']);
      } finally {
        nets.forEach((n) => n.stop());
      }
    });

    it('receiveRoom never throws (a failing save is logged)', () => {
      const h = hosting(['mate']);
      const m = joined('mate', h.tag, h.secret, state(h.lan));
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      saves.mockImplementationOnce(() => {
        throw new Error('disk full');
      });
      const s = state(h.lan);
      expect(m.lan.receiveRoom(h.tag, { ...s, rev: s.rev + 1, title: 'T2' })).toBeNull();
      expect(err).toHaveBeenCalled();
      err.mockRestore();
    });
  });

  describe('directory', () => {
    const mkPeer = (id: string): PeerInfo => ({ ...peer.peer, id, account: id });
    let dir: string;
    const mk = (net: {
      public?: PeerInfo[];
      teams?: Record<string, PeerInfo[]>;
      personal?: PeerInfo[];
    }) => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-dir-'));
      const lan = new LanService({ ...profile }, { views: () => [view()] }, dir);
      lan.net = {
        peers: () => [],
        sendNow: () => {},
        teamName: () => undefined,
        directory: () => ({ public: [], teams: {}, personal: [], ...net }),
      };
      return lan;
    };
    const ids = (ps: { peerId: string }[]) => ps.map((p) => p.peerId);
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    it('public PC: me first in public, cards in personal, no team area', () => {
      const lan = mk({ public: [mkPeer('a')], personal: [mkPeer('c')] });
      const d = lan.directory();
      expect(d.public[0]).toMatchObject({ peerId: 'me', self: true });
      expect(ids(d.public)).toEqual(['me', 'a']);
      expect(d.teams).toEqual([]);
      expect(d.personal).toMatchObject([{ peerId: 'c', self: false }]);
    });

    it('team PC: me in the team under its name, public PCs listed without me', () => {
      const lan = mk({});
      const { tag } = room(lan, '우리팀');
      lan.net.directory = () => ({
        public: [mkPeer('a')],
        teams: { [tag]: [mkPeer('m')] },
        personal: [],
      });
      const d = lan.directory();
      expect(ids(d.public)).toEqual(['a']);
      expect(d.teams).toHaveLength(1);
      expect(d.teams[0]).toMatchObject({ tag, name: '우리팀' });
      expect(ids(d.teams[0].people)).toEqual(['me', 'm']);
    });

    it('personal PC in a team: me in personal only; the team still lists its members', () => {
      const lan = mk({});
      const { tag } = room(lan, '우리팀');
      lan.net.directory = () => ({ public: [], teams: { [tag]: [mkPeer('m')] }, personal: [] });
      lan.setActiveView(PERSONAL_VIEW, true);
      const d = lan.directory();
      expect(ids(d.personal)).toEqual(['me']);
      expect(ids(d.teams[0].people)).toEqual(['m']);
    });

    it('a peer claiming my id is dropped; rows carry no chat or avatar', () => {
      const lan = mk({ public: [mkPeer('me'), mkPeer('a'), mkPeer('a')] });
      lan.sendChat('hi');
      const d = lan.directory();
      expect(ids(d.public)).toEqual(['me', 'a']);
      for (const row of d.public) {
        expect(row).not.toHaveProperty('chat');
        expect(row).not.toHaveProperty('avatar');
      }
    });

    it('net: public rows and the public office people only, self included', () => {
      const lan = mk({ public: [mkPeer('a'), mkPeer('b')] });
      const nets: Record<string, string> = { me: 'lan', a: '0a1b2c3d' };
      lan.net.netOf = (id) => nets[id];
      lan.net.peers = (v) => (v === PUBLIC_VIEW ? [{ ...peer, peer: mkPeer('a') }] : []);
      const d = lan.directory();
      expect(d.public.map((p) => p.net)).toEqual(['lan', '0a1b2c3d', undefined]);
      expect(d.public[2]).not.toHaveProperty('net');
      expect(lan.people(PUBLIC_VIEW).map((p) => p.net)).toEqual(['lan', '0a1b2c3d']);
      const { tag } = room(lan, '우리팀');
      lan.net.directory = () => ({ public: [], teams: { [tag]: [mkPeer('a')] }, personal: [] });
      for (const p of [...lan.directory().teams[0].people, ...lan.people(tag)])
        expect(p).not.toHaveProperty('net');
    });

    it('via: other people in the public office only, never me', () => {
      const lan = mk({ public: [mkPeer('a'), mkPeer('b')] });
      const vias: Record<string, 'lan' | 'relay'> = { me: 'lan', a: 'lan', b: 'relay' };
      lan.net.viaOf = (id) => vias[id];
      lan.net.peers = (v) => (v === PUBLIC_VIEW ? [{ ...peer, peer: mkPeer('b') }] : []);
      expect(lan.directory().public.map((p) => p.via)).toEqual([undefined, 'lan', 'relay']);
      expect(lan.directory().public[0]).not.toHaveProperty('via');
      expect(lan.people(PUBLIC_VIEW).map((p) => p.via)).toEqual([undefined, 'relay']);
      const { tag } = room(lan, '우리팀');
      lan.net.directory = () => ({ public: [], teams: { [tag]: [mkPeer('a')] }, personal: [] });
      for (const p of [...lan.directory().teams[0].people, ...lan.people(tag)])
        expect(p).not.toHaveProperty('via');
    });

    it('the office view ignores the directory', () => {
      const lan = mk({ public: [mkPeer('w')], personal: [mkPeer('c')] });
      expect(ids(lan.people(PUBLIC_VIEW))).toEqual(['me']);
      const snap = snapshotMessage(lan);
      expect(ids(snap.people)).toEqual(['me']);
      expect(snap.agents.some((a) => a.key.startsWith('w'))).toBe(false);
    });
  });
});
