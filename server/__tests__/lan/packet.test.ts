/* eslint-disable pixel-agents/no-inline-colors -- test fixtures */
import { describe, expect, it } from 'vitest';

import type { AgentView, PeerPacket } from '../../../core/src/lan.js';
import {
  AGE_MAX_SEC,
  MAX_PACKET_BYTES,
  parsePeerInfo,
  parsePeerPacket,
  TODO_MAX,
} from '../../../core/src/lan.js';

const view = (over: Partial<AgentView> = {}): AgentView => ({
  id: 's1',
  provider: 'claude',
  kind: 'main',
  num: 1,
  room: 'coding',
  permission: false,
  act: 'edit',
  target: 'a.ts',
  reason: '',
  ...over,
});
const packet = (over: Partial<PeerPacket> = {}): PeerPacket => ({
  v: 1,
  peer: { id: 'peer-1', account: 'kim.j', nickname: 'kim', palette: 2, hueShift: 90 },
  views: [view(), view({ id: 's1/sub/a', kind: 'subagent', num: 0, parentId: 's1' })],
  ...over,
});
const parse = (p: unknown) => parsePeerPacket(JSON.stringify(p));

describe('parsePeerPacket', () => {
  it('status signals: valid ones kept, a bad one dropped alone', () => {
    const one = (over: object) => parse(packet({ views: [{ ...view(), ...over }] }))?.views[0];
    expect(
      one({ ageSec: 60, todo: { done: 2, total: 5 }, fail: true, diff: { add: 4, del: 2 } }),
    ).toMatchObject({
      diff: { add: 4, del: 2 },
      ageSec: 60,
      todo: { done: 2, total: 5 },
      fail: true,
    });
    for (const bad of [
      { ageSec: -1 },
      { ageSec: 1.5 },
      { ageSec: AGE_MAX_SEC + 1 },
      { todo: { done: 3, total: 2 } },
      { todo: { done: 0, total: 0 } },
      { todo: { done: 1, total: TODO_MAX + 1 } },
      { todo: [1, 2] },
      { fail: 1 },
      { diff: { add: -1, del: 0 } },
      { diff: { add: 0, del: 0 } },
    ]) {
      const got = one(bad);
      expect(got).toBeDefined();
      expect(got).not.toHaveProperty('ageSec');
      expect(got).not.toHaveProperty('todo');
      expect(got).not.toHaveProperty('fail');
      expect(got).not.toHaveProperty('diff');
    }
    // an older view without them is unchanged
    expect(one({})).toEqual(view());
  });

  it('local-only fields (title, ctx, usage) are never read from a peer', () => {
    const got = parse(
      packet({
        views: [
          {
            ...view(),
            title: 'peer title',
            ctx: { used: 1, window: 2 },
            usage: { tokens: 5, rate: 0 },
          },
        ],
      }),
    )?.views[0];
    expect(got).toEqual(view());
  });

  it('hidden: only true survives', () => {
    expect(parse(packet({ views: [{ ...view(), hidden: true }] }))?.views[0].hidden).toBe(true);
    const bad = { ...view(), hidden: 'yes' };
    expect(
      parse(packet({ views: [bad as unknown as AgentView] }))?.views[0].hidden,
    ).toBeUndefined();
  });

  it('account: validated; a 0.3.x packet without one: nickname (or short id) becomes the account, nickname cleared', () => {
    const { account: _, ...old } = packet().peer;
    expect(parse(packet({ peer: old as never }))?.peer).toMatchObject({
      account: 'kim',
      nickname: '',
    });
    expect(parse(packet({ peer: { ...old, nickname: '' } as never }))?.peer.account).toBe('peer');
    expect(
      parse(packet({ peer: { ...old, account: '😀'.repeat(32) } as never }))?.peer.account,
    ).toBe('😀'.repeat(32)); // 32 code points fit
    expect(
      parse(packet({ peer: { ...old, account: 'x'.repeat(33) } as never }))?.peer.account,
    ).toBe('kim');
    expect(parse(packet({ peer: { ...old, account: 'a\nb' } as never }))?.peer.account).toBe('kim');
    expect(parse(packet({ peer: { ...old, account: ' yoo ' } as never }))?.peer.account).toBe(
      'yoo',
    );
  });

  it('nickname: control/bidi/format chars stripped; nickSince kept only when a safe integer >= 0', () => {
    const peer = packet().peer;
    expect(parse(packet({ peer: { ...peer, nickname: ' k\u202eim\u0007 ' } }))?.peer.nickname).toBe(
      'kim',
    );
    expect(parse(packet({ peer: { ...peer, nickSince: 5 } }))?.peer.nickSince).toBe(5);
    for (const bad of [-1, 1.5, 'x', Number.MAX_SAFE_INTEGER + 2, null]) {
      expect(
        parse(packet({ peer: { ...peer, nickSince: bad as never } }))?.peer,
      ).not.toHaveProperty('nickSince');
    }
  });

  it('pet: optional, one of the bundled ids; anything else is dropped (the palette human shows)', () => {
    const peer = packet().peer;
    expect(parse(packet())?.peer).not.toHaveProperty('pet');
    expect(parse(packet({ peer: { ...peer, pet: 'gitcat' } }))?.peer.pet).toBe('gitcat');
    expect(parse(packet({ peer: { ...peer, pet: 'claudio' } }))?.peer.pet).toBe('claudio');
    for (const bad of ['dragon', '', 1, null, { id: 'gitcat' }]) {
      const out = parse(packet({ peer: { ...peer, pet: bad as never } }));
      expect(out?.peer).not.toHaveProperty('pet');
      expect(out?.peer.palette).toBe(2);
    }
  });

  it('tagColors: optional pair of hex colours; anything else is dropped', () => {
    const peer = packet().peer;
    expect(parse(packet())?.peer).not.toHaveProperty('tagColors');
    expect(
      parse(packet({ peer: { ...peer, tagColors: { bg: '#abcdef', fg: '#000000' } } }))?.peer
        .tagColors,
    ).toEqual({ bg: '#ABCDEF', fg: '#000000' });
    for (const bad of [{ bg: 'url(x)', fg: '#000000' }, { bg: '#abcdef' }, 'x', 1]) {
      expect(
        parse(packet({ peer: { ...peer, tagColors: bad as never } }))?.peer,
      ).not.toHaveProperty('tagColors');
    }
  });

  it('round-trips a valid packet', () => {
    const p = packet();
    expect(parse(p)).toEqual(p);
  });

  it('rejects invalid structure and values', () => {
    expect(parse({ ...packet(), v: 2 })).toBeNull();
    expect(parse({ ...packet(), views: 'x' })).toBeNull();
    expect(parse(packet({ views: [view({ room: 'kitchen' as never })] }))).toBeNull();
    expect(parse(packet({ views: [view({ act: 'dance' as never })] }))).toBeNull();
    expect(parse(packet({ views: [view({ target: 5 as never })] }))).toBeNull();
    expect(parse(packet({ peer: { ...packet().peer, palette: 9 } }))).toBeNull();
    expect(parse(packet({ peer: { ...packet().peer, hueShift: 400 } }))).toBeNull();
    expect(parse(packet({ peer: { ...packet().peer, palette: 1.5 } }))).toBeNull();
    expect(parse(packet({ peer: { ...packet().peer, id: '' } }))).toBeNull();
    expect(parse(null)).toBeNull();
    expect(parse([])).toBeNull();
    expect(parse(5)).toBeNull();
    expect(parsePeerPacket('x'.repeat(MAX_PACKET_BYTES + 1))).toBeNull();
  });

  it('truncates strings and caps views', () => {
    const p = parse(
      packet({
        peer: { ...packet().peer, nickname: 'n'.repeat(30) },
        views: [view({ target: 's'.repeat(500), reason: 'r'.repeat(500) })],
      }),
    )!;
    expect(p.peer.nickname).toHaveLength(20);
    expect(p.views[0].target).toHaveLength(120);
    expect(p.views[0].reason).toHaveLength(200);
    const many = parse(
      packet({ views: Array.from({ length: 80 }, (_, i) => view({ id: `s${i}` })) }),
    )!;
    expect(many.views.map((v) => v.id)).toEqual(Array.from({ length: 50 }, (_, i) => `s${i}`));
  });

  it('keeps html-looking nickname verbatim and drops unknown fields', () => {
    const nick = '<b onload=alert(1)>';
    const raw = packet({ peer: { ...packet().peer, nickname: nick } }) as unknown as {
      views: Record<string, unknown>[];
    };
    raw.views[0].evil = 1;
    const p = parse(raw)!;
    expect(p.peer.nickname).toBe(nick);
    expect(p.views[0]).not.toHaveProperty('evil');
  });

  it('never throws on garbage', () => {
    expect(parsePeerPacket('{nope')).toBeNull();
    expect(parsePeerPacket('')).toBeNull();
  });
});

describe('parsePeerInfo', () => {
  it('parsePeerInfo: same rules as a presence peer', () => {
    const base = { id: 'p', nickname: 'n', palette: 0, hueShift: 0 };
    expect(parsePeerInfo(base)).toEqual({
      id: 'p',
      account: 'n',
      nickname: '',
      palette: 0,
      hueShift: 0,
    });
    const r = parsePeerInfo({ ...base, pet: 'bogus', views: [] });
    expect(r).not.toHaveProperty('pet');
    expect(r).not.toHaveProperty('views');
    expect(parsePeerInfo({ ...base, palette: 9 })).toBeNull();
  });
  it('ver: semver-like kept; missing or malformed dropped (the peer stays)', () => {
    const base = { id: 'p', account: 'a', nickname: '', palette: 0, hueShift: 0 };
    for (const ok of ['1.0.45', '10.20.300', '1.0.45-rc.1', '2.0.0-beta-2'])
      expect(parsePeerInfo({ ...base, ver: ok })?.ver).toBe(ok);
    expect(parsePeerInfo(base)).not.toHaveProperty('ver');
    for (const bad of [
      '1.0',
      'v1.0.45',
      '1.0.45 ',
      '12345.0.0',
      '1.0.0-' + 'x'.repeat(21),
      '1.0.0-a b',
      1,
      null,
    ]) {
      const r = parsePeerInfo({ ...base, ver: bad });
      expect(r).not.toBeNull();
      expect(r).not.toHaveProperty('ver');
    }
  });
});

describe('isFailure (failure drop and activity strip)', () => {
  it('refusals, hook blocks and probes that find nothing are not failures', async () => {
    const { isFailure, exitCodeOf, firstProgram } = await import('../../../core/src/lan.js');
    expect(isFailure("The user doesn't want to proceed with this tool use.")).toBe(false);
    expect(isFailure('Permission to use Bash with command x has been denied.')).toBe(false);
    expect(isFailure('PreToolUse:Bash hook error: blocked')).toBe(false);
    expect(isFailure('This session is isolated in the worktree /w. Refusing to run it — …')).toBe(
      false,
    );
    expect(isFailure('Exit code 1', 'cd /repo && grep -rn foo src')).toBe(false);
    expect(isFailure('Exit code 1', 'command -v pdftotext')).toBe(false);
    expect(isFailure('Exit code 1', 'git diff --quiet')).toBe(false);
    expect(isFailure('{"exit_code":1,"output":""}', 'rg needle')).toBe(false);
    // real failures
    expect(isFailure('Exit code 1', 'npm test')).toBe(true);
    expect(isFailure('Exit code 2', 'grep -E "(" x')).toBe(true); // grep's own error
    expect(isFailure('File does not exist.')).toBe(true);
    expect(isFailure('{"exit_code":0}')).toBe(false);
    expect(exitCodeOf('Exit code 144')).toBe(144);
    expect(firstProgram('FOO=1 cd /a && /usr/bin/rg x')).toBe('rg');
  });
});

describe('view zone (서버실 work zone)', () => {
  const zoneOf = (over: Record<string, unknown>) =>
    parse(packet({ views: [view(over as Partial<AgentView>)] }))?.views[0]?.zone;
  it('keeps a known zone in 서버실 only; a bad one is dropped alone', () => {
    expect(zoneOf({ room: 'server', zone: 'test' })).toBe('test');
    expect(zoneOf({ room: 'coding', zone: 'test' })).toBeUndefined();
    expect(zoneOf({ room: 'server', zone: 'deploy' })).toBeUndefined();
    expect(
      parse(packet({ views: [view({ room: 'server', zone: 'x' as never })] }))?.views,
    ).toHaveLength(1);
  });
});
