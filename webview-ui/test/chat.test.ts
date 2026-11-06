import { describe, expect, it } from 'vitest';

import type { OfficePersonMessage } from '../../core/src/messages.js';
import { ChatBubbles, clampRows, isTextEntry, stackBubbles, wrapLines } from '../src/lan/chat.js';

const person = (
  peerId: string,
  chat?: OfficePersonMessage['chat'],
  self = false,
): OfficePersonMessage => ({
  peerId,
  account: peerId,
  nickname: 'nick',
  palette: 0,
  hueShift: 0,
  self,
  ...(chat && { chat }),
});
const msg = (o: Partial<NonNullable<OfficePersonMessage['chat']>> = {}) => ({
  id: 'abcd1234',
  text: 'hello',
  ...o,
});

describe('ChatBubbles', () => {
  it('one bubble per person from the snapshot; no expiry; a new id replaces, a missing chat removes', () => {
    const c = new ChatBubbles();
    c.apply([person('me', msg({ text: 'mine' }), true), person('p', msg())]);
    expect(c.active()).toEqual([
      { peerId: 'me', id: 'abcd1234', text: 'mine', self: true },
      { peerId: 'p', id: 'abcd1234', text: 'hello', self: false },
    ]);
    expect(c.mine()?.text).toBe('mine');
    c.apply([person('p', msg())]); // later snapshots: still there (no timer)
    expect(c.active()).toHaveLength(1);
    expect(c.mine()).toBeUndefined();
    c.apply([person('p', msg({ id: 'next0001', text: 'moved' }))]);
    expect(c.active()).toMatchObject([{ id: 'next0001', text: 'moved' }]);
    c.apply([person('p')]); // deleted
    expect(c.active()).toEqual([]);
    c.apply([person('p', msg())]);
    c.apply([]); // went offline
    expect(c.active()).toEqual([]);
  });

  it('sanitises received text; drops unusable chats; ignores an old col/row', () => {
    const c = new ChatBubbles();
    c.apply([
      person('a', { ...msg({ text: 'x‮y\nz' }), col: 3, row: 4 } as never),
      person('b', msg({ text: '​' })),
    ]);
    expect(c.active()).toEqual([{ peerId: 'a', id: 'abcd1234', text: 'xy z', self: false }]);
  });

  it('say: cleaned text, nothing shown locally; 1 per 2 s', () => {
    const c = new ChatBubbles();
    expect(c.say('  hi ', 0)).toBe('hi');
    expect(c.active()).toEqual([]);
    expect(c.say('again', 1999)).toBeNull();
    expect(c.say('\u0007', 5000)).toBeNull();
    expect(c.say('ok', 2000)).toBe('ok');
  });
});

describe('chat geometry', () => {
  it('wrapLines: greedy by word, long words broken anywhere', () => {
    const m = (s: string) => s.length * 10;
    expect(wrapLines('aa bb cc', 50, m)).toEqual(['aa bb', 'cc']);
    expect(wrapLines('abcdefghij', 40, m)).toEqual(['abcd', 'efgh', 'ij']);
    expect(wrapLines('', 40, m)).toEqual(['']);
  });

  it('wrapLines: commands and paths break after separators, never inside a word', () => {
    const m = (s: string) => s.length * 10;
    const cmd =
      'cd /home/yoojungyu/GIT/PRIVATE/pixel-office; sleep 10; p=$(gh run list --workflow=ci.yml | head -1)';
    const lines = wrapLines(cmd, 200, m);
    expect(lines.join('').replace(/ /g, '')).toBe(cmd.replace(/ /g, ''));
    for (const l of lines) expect(m(l)).toBeLessThanOrEqual(200);
    // every line ends at a separator or a space (no word cut in half)
    for (const l of lines.slice(0, -1)) expect(l).toMatch(/[/;|,=]$|&&$|\w$/);
    expect(lines).toEqual([
      'cd /home/yoojungyu/',
      'GIT/PRIVATE/',
      'pixel-office; sleep',
      '10; p=$(gh run list',
      '--workflow=ci.yml |',
      'head -1)',
    ]);
    // a long URL/path breaks after slashes
    expect(wrapLines('https://example.com/a/very/long/path/file.ts', 120, m)).toEqual([
      'https://',
      'example.com/',
      'a/very/long/',
      'path/file.ts',
    ]);
    // && is one separator
    expect(wrapLines('npm ci&&npm test', 80, m)).toEqual(['npm ci&&', 'npm test']);
  });

  it('wrapLines: CJK without spaces breaks by character; with spaces by word', () => {
    const m = (s: string) => Array.from(s).length * 10;
    expect(wrapLines('가나다라마바사아자차', 40, m)).toEqual(['가나다라', '마바사아', '자차']);
    expect(wrapLines('설정 파일을 읽는 중', 60, m)).toEqual(['설정 파일을', '읽는 중']);
  });

  it('wrapLines + clampRows: at most 5 lines, the last ends in …', () => {
    const m = (s: string) => s.length * 10;
    const rows = clampRows(wrapLines('a/'.repeat(60), 100, m), 5, 100, m);
    expect(rows).toHaveLength(5);
    expect(rows[4].endsWith('…')).toBe(true);
    for (const r of rows) expect(m(r)).toBeLessThanOrEqual(100);
  });

  it('stackBubbles: separate ones stay; overlapping ones move up, never overlap', () => {
    expect(
      stackBubbles(
        [
          { x: 0, bottom: 100, w: 50, h: 30 },
          { x: 200, bottom: 100, w: 50, h: 30 },
        ],
        4,
      ),
    ).toEqual([100, 100]);
    const boxes = [
      { x: 0, bottom: 100, w: 80, h: 30 },
      { x: 10, bottom: 105, w: 80, h: 30 },
      { x: 20, bottom: 95, w: 80, h: 40 },
    ];
    const b = stackBubbles(boxes, 4);
    expect(b[1]).toBe(105); // lowest keeps its place
    const spans = b.map((bottom, i) => [bottom - boxes[i].h, bottom]).sort((x, y) => x[0] - y[0]);
    for (let i = 1; i < spans.length; i++)
      expect(spans[i][0]).toBeGreaterThanOrEqual(spans[i - 1][1] + 4);
  });

  it('isTextEntry: inputs, textareas, selects, contenteditable', () => {
    expect(isTextEntry({ tagName: 'INPUT' })).toBe(true);
    expect(isTextEntry({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isTextEntry({ tagName: 'BUTTON' })).toBe(false);
    expect(isTextEntry(null)).toBe(false);
  });
});

describe('clampRows', () => {
  const measure = (s: string) => s.length * 10;
  it('keeps up to max lines; past that the last kept line ends with … and still fits', () => {
    expect(clampRows(['a', 'b'], 5, 100, measure)).toEqual(['a', 'b']);
    const out = clampRows(['l1', 'l2', 'l3', 'l4', 'abcdefghij', 'x'], 5, 100, measure);
    expect(out).toHaveLength(5);
    expect(out[4]).toBe('abcdefghi…');
    expect(measure(out[4])).toBeLessThanOrEqual(100);
  });
});
