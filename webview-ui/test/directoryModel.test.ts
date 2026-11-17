/**
 * People panel areas: public / team / personal sections from peopleDirectory.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { test } from 'vitest';

import type { DirectoryPersonMessage } from '../../core/src/messages.js';
import {
  areaSections,
  byNetGroup,
  EMPTY_DIRECTORY,
  pagedCount,
  rowWindow,
  totalPeople,
  viewedExtras,
  viewedRows,
} from '../src/lan/directoryModel.js';
import type { PersonRow } from '../src/lan/peopleModel.js';

const person = (
  peerId: string,
  more: Partial<DirectoryPersonMessage> = {},
): DirectoryPersonMessage => ({
  peerId,
  account: peerId,
  nickname: '',
  palette: 0,
  hueShift: 0,
  self: false,
  ...more,
});

const row = (peerId: string): PersonRow => ({
  person: { ...person(peerId) },
  claude: 0,
  codex: 0,
  status: 'idle',
  focusKey: null,
});

const TAG_A = 'aaaaaaaaaaa';
const TAG_B = 'bbbbbbbbbbb';

test('areas in order public, team, personal; no team area without a team', () => {
  assert.deepEqual(
    areaSections(EMPTY_DIRECTORY, 'public').map((s) => s.area),
    ['public', 'personal'],
  );
  const dir = {
    ...EMPTY_DIRECTORY,
    teams: [
      { tag: TAG_A, name: '나', people: [] },
      { tag: TAG_B, name: '가', people: [] },
    ],
  };
  const sections = areaSections(dir, 'public');
  assert.deepEqual(
    sections.map((s) => s.area),
    ['public', 'team', 'team', 'personal'],
  );
  assert.deepEqual(
    sections.filter((s) => s.area === 'team').map((s) => s.name),
    ['가', '나'],
  );
  assert.deepEqual(
    sections.map((s) => s.view),
    ['public', TAG_B, TAG_A, 'personal'],
  );
});

test('self first, then label order', () => {
  const dir = {
    ...EMPTY_DIRECTORY,
    public: [
      person('1', { account: 'b' }),
      person('2', { account: 'a' }),
      person('3', { account: 'z', self: true }),
    ],
  };
  const [pub] = areaSections(dir, 'public');
  assert.deepEqual(
    pub.people.map((p) => p.account),
    ['z', 'a', 'b'],
  );
});

test('viewed marks the area of the active view', () => {
  const dir = { ...EMPTY_DIRECTORY, teams: [{ tag: TAG_A, name: 'T', people: [] }] };
  const viewed = (view: string) =>
    areaSections(dir, view)
      .filter((s) => s.viewed)
      .map((s) => s.area);
  assert.deepEqual(viewed(TAG_A), ['team']);
  assert.deepEqual(viewed('personal'), ['personal']);
  assert.deepEqual(viewed('public'), ['public']);
});

test('names are tie-broken within an area', () => {
  const dir = {
    ...EMPTY_DIRECTORY,
    public: [
      person('p1aaaa', { nickname: 'kim', nickSince: 1 }),
      person('p2bbbb', { nickname: 'kim', nickSince: 2 }),
    ],
  };
  const [pub] = areaSections(dir, 'public');
  const nicks = pub.people.map((p) => p.nickname).sort();
  assert.equal(nicks[0], 'kim');
  assert.match(nicks[1], /^kim · /);
});

test('viewedExtras: area people missing from the snapshot rows', () => {
  const dir = {
    ...EMPTY_DIRECTORY,
    public: [person('me', { self: true }), person('b'), person('c')],
  };
  const [pub] = areaSections(dir, 'public');
  assert.deepEqual(
    viewedExtras(pub, [row('me'), row('b')]).map((p) => p.peerId),
    ['c'],
  );
});

test('totalPeople counts each peerId once', () => {
  const dir = {
    ...EMPTY_DIRECTORY,
    public: [person('me', { self: true }), person('b')],
    personal: [person('c')],
  };
  assert.equal(totalPeople(areaSections(dir, 'public'), [row('me'), row('b'), row('demo')]), 4);
});

const ids = (rows: PersonRow[]) => rows.map((r) => r.person.peerId);

test('viewedRows: a PC the directory moved to another area is not listed twice', () => {
  // b switched to personal; the public snapshot still has it until the peer TTL.
  const dir = {
    ...EMPTY_DIRECTORY,
    public: [person('me', { self: true })],
    personal: [person('b')],
  };
  const sections = areaSections(dir, 'public');
  assert.deepEqual(ids(viewedRows(sections, [row('me'), row('b')])), ['me']);
});

test('areaSections: a just-joined team shows its name from the offices state', () => {
  const named = areaSections(EMPTY_DIRECTORY, TAG_A, [{ tag: TAG_A, name: 'Alpha' }]);
  assert.equal(named.find((s) => s.viewed)?.name, 'Alpha');
  assert.equal(areaSections(EMPTY_DIRECTORY, TAG_A).find((s) => s.viewed)?.name, '');
});

test('viewedRows: no directory area for the viewed office yet = the snapshot as is', () => {
  const dir = { ...EMPTY_DIRECTORY, personal: [person('b')] };
  const sections = areaSections(dir, TAG_A); // joined a team, no peopleDirectory with it yet
  const team = sections.find((s) => s.viewed);
  assert.equal(team?.area, 'team');
  assert.deepEqual(
    sections.map((s) => s.area),
    ['public', 'team', 'personal'],
  );
  assert.deepEqual(ids(viewedRows(sections, [row('me'), row('b')])), ['me', 'b']);
  // No directory received at all: the public snapshot as is.
  assert.deepEqual(
    ids(viewedRows(areaSections(EMPTY_DIRECTORY, 'public'), [row('me'), row('b')])),
    ['me', 'b'],
  );
});

test('viewedRows: a snapshot person in no directory area (old peer) stays', () => {
  const dir = {
    ...EMPTY_DIRECTORY,
    public: [person('me', { self: true })],
    personal: [person('c')],
  };
  const sections = areaSections(dir, 'public');
  assert.deepEqual(ids(viewedRows(sections, [row('me'), row('old')])), ['me', 'old']);
});

test('byNetGroup: my LAN first, then each network by number, unknown last; stable within', () => {
  const people = [
    { id: 'x', n: 3 },
    { id: 'me', n: 1 },
    { id: 'y', n: 2 },
    { id: 'u', n: undefined },
    { id: 'lan2', n: 1 },
    { id: 'z', n: 2 },
  ];
  assert.deepEqual(
    byNetGroup(people, (p) => p.n).map((p) => p.id),
    ['me', 'lan2', 'y', 'z', 'x', 'u'],
  );
  // a single network: badges are off (no numbers), the order is kept
  assert.deepEqual(
    byNetGroup(people, () => undefined).map((p) => p.id),
    people.map((p) => p.id),
  );
});

test('pagedCount / rowWindow: pages of rows, only the rows in view ± overscan', () => {
  assert.deepEqual(pagedCount(25, 10), { n: 10, more: true });
  assert.deepEqual(pagedCount(25, 30), { n: 25, more: false });
  assert.deepEqual(pagedCount(3, 10), { n: 3, more: false });
  assert.deepEqual(rowWindow(0, 420, 42, 1000, 4), { first: 0, last: 14 });
  assert.deepEqual(rowWindow(42 * 500, 420, 42, 1000, 4), { first: 496, last: 514 });
  assert.deepEqual(rowWindow(42 * 995, 420, 42, 1000, 4), { first: 991, last: 1000 });
});
