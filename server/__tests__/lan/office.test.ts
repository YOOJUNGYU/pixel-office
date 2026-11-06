/* eslint-disable pixel-agents/no-inline-colors -- test fixtures */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AgentView, PeerInfo, PeerPacket } from '../../../core/src/lan.js';
import { PERSONAL_VIEW, PUBLIC_VIEW } from '../../../core/src/lan.js';
import {
  handleClientMessage,
  officesMessage,
  profileMessage,
  snapshotMessage,
} from '../../src/clientMessageHandler.js';
import { FileStateAdapter } from '../../src/fileStateAdapter.js';
import { createIdentity, parseInviteCode } from '../../src/lan/crypto.js';
import type { CreatedOffice } from '../../src/lan/office.js';
import { buildOffice, LanService } from '../../src/lan/office.js';
import type { Profile } from '../../src/lan/profile.js';
import { loadProfile, osAccount } from '../../src/lan/profile.js';

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
    hideWork: false,
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

  it('hideWork shares room, provider, kind and waiting only', () => {
    const lan = new LanService(
      { ...profile, hideWork: true },
      { views: () => [view({ permission: true, act: 'edit', target: 'a.ts', reason: 'r' })] },
    );
    const [v] = lan.packet().views;
    expect(v).toMatchObject({
      act: 'idle',
      target: '',
      reason: '',
      permission: true,
      hidden: true,
    });
    expect(v).toMatchObject({ room: view().room, provider: view().provider, kind: view().kind });
    expect(lan.office(PUBLIC_VIEW)[0]).toMatchObject({ act: 'edit', target: 'a.ts' }); // mine: as-is
    expect(lan.office(PUBLIC_VIEW)[0].hidden).toBeUndefined();
  });

  it('public presence is quiet (UDP and relay alike); team and my own snapshot keep detail', () => {
    const lan = new LanService(
      { ...profile },
      { views: () => [view({ act: 'edit', ageSec: 5, todo: { done: 1, total: 2 }, fail: true })] },
    );
    const [q] = lan.packet(PUBLIC_VIEW).views;
    expect(q).toMatchObject({ act: 'edit', room: 'coding', target: '', reason: '', quiet: true });
    for (const k of ['ageSec', 'todo', 'fail']) expect(q).not.toHaveProperty(k);
    const [team] = lan.packet('team-tag').views;
    expect(team).toMatchObject({ target: 'a.ts', ageSec: 5 });
    expect(team).not.toHaveProperty('quiet');
    expect(lan.office(PUBLIC_VIEW)[0]).toMatchObject({ target: '/home/kim/a.ts', ageSec: 5 });
    expect(lan.office(PUBLIC_VIEW)[0]).not.toHaveProperty('quiet');
  });

  it('a hidden PC stays hidden in the public office (not quiet)', () => {
    const lan = new LanService({ ...profile, hideWork: true }, { views: () => [view()] });
    const [v] = lan.packet(PUBLIC_VIEW).views;
    expect(v).toMatchObject({ act: 'idle', hidden: true });
    expect(v).not.toHaveProperty('quiet');
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
      const created = lan.createOffice('팀') as CreatedOffice;
      expect(ids(snapshotMessage(lan))).toEqual(['me*', 'mate']);
      expect(lan.people(PUBLIC_VIEW)).toEqual([]);
      expect(lan.people('unknown-tag')).toEqual([]);
      expect(lan.people(created.tag).map((p) => p.peerId)).toEqual(['me', 'mate']);
    });

    it('create: code to the caller, team view active, the public office is empty', () => {
      const { lan, sendNow } = mk();
      const created = lan.createOffice(' 우리팀 ') as CreatedOffice;
      expect(created.name).toBe('우리팀');
      expect(parseInviteCode(created.code)).not.toBeNull();
      expect(sendNow).toHaveBeenCalled();
      expect(lan.profile.activeView).toBe(created.tag);
      expect(keys(lan.office(created.tag))).toEqual(['me:s1', 'mate:team-secret-work']);
      expect(lan.office(PUBLIC_VIEW)).toEqual([]);
      // this PC's browser follows activeView
      expect(keys(snapshotMessage(lan).agents)).toContain('mate:team-secret-work');
      expect(lan.setActiveView(PUBLIC_VIEW)).toBe(false);
    });

    it('officesState carries names only; the secret stays in the 0600 profile', () => {
      const { lan } = mk();
      const created = lan.createOffice('팀') as CreatedOffice;
      const msg = JSON.stringify(officesMessage(lan));
      const { secret } = lan.profile.offices[0];
      expect(msg).not.toContain(secret);
      expect(msg).not.toContain(created.code);
      expect(msg).not.toContain(created.code.replace(/-/g, ''));
      expect(officesMessage(lan)).toEqual({
        type: 'officesState',
        offices: [{ tag: created.tag, name: '팀' }],
        activeView: created.tag,
      });
      const file = path.join(dir, 'profile.json');
      expect(fs.readFileSync(file, 'utf-8')).toContain(secret);
      if (process.platform !== 'win32') expect(fs.statSync(file).mode & 0o777).toBe(0o600);
      expect(loadProfile(dir).offices).toEqual(lan.profile.offices);
      expect(lan.officeCode(created.tag)).toBe(created.code);
    });

    it('join by a sloppy code (name announced by members), leave back to public', () => {
      const a = mk().lan;
      const { code, tag } = a.createOffice('팀') as CreatedOffice;
      const { lan } = mk();
      expect(lan.joinOffice('nope')).toBe('invalidCode');
      expect(lan.joinOffice(code, 'x'.repeat(21))).toBe('nameInvalid');
      expect(lan.joinOffice(` ${code.toLowerCase().replace(/-/g, ' ')} `, '')).toBeNull();
      expect(lan.profile.offices.map((o) => o.tag)).toEqual([tag]);
      expect(lan.officeList()).toEqual([{ tag, name: 'announced' }]);
      expect(lan.joinOffice(code)).toBe('alreadyJoined'); // again: no duplicate
      expect(lan.profile.offices).toHaveLength(1);
      expect(lan.leaveOffice('other')).toBe(false);
      expect(lan.leaveOffice(tag)).toBe(true);
      expect(lan.profile).toMatchObject({ offices: [], activeView: PUBLIC_VIEW });
      expect(keys(lan.office(PUBLIC_VIEW))).toContain('p1:public-work');
    });

    it('rejects bad names', () => {
      const { lan } = mk();
      expect(lan.createOffice('')).toBe('nameInvalid');
      expect(lan.createOffice('x'.repeat(21))).toBe('nameInvalid');
      expect(lan.createOffice(5)).toBe('nameInvalid');
    });

    it('create or join while in a team replaces the team in one save', () => {
      const { lan } = mk();
      const a = lan.createOffice('a') as CreatedOffice;
      saves.mockClear();
      const b = lan.createOffice('b') as CreatedOffice;
      expect(saves).toHaveBeenCalledTimes(1);
      expect(lan.profile.offices.map((o) => o.name)).toEqual(['b']);
      expect(lan.profile.activeView).toBe(b.tag);
      expect(loadProfile(dir).offices.map((o) => o.name)).toEqual(['b']);
      expect(lan.joinOffice(a.code)).toBeNull();
      expect(lan.profile.offices.map((o) => o.tag)).toEqual([a.tag]);
      expect(lan.profile.activeView).toBe(a.tag);
      expect(lan.joinOffice(a.code)).toBe('alreadyJoined');
      expect(lan.profile.offices.map((o) => o.tag)).toEqual([a.tag]);
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
      const { tag } = lan.createOffice('우리팀') as CreatedOffice;
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
      const { tag } = lan.createOffice('우리팀') as CreatedOffice;
      lan.net.directory = () => ({ public: [], teams: { [tag]: [mkPeer('m')] }, personal: [] });
      lan.setActiveView(PERSONAL_VIEW);
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
      const { tag } = lan.createOffice('우리팀') as CreatedOffice;
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
      const { tag } = lan.createOffice('우리팀') as CreatedOffice;
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
