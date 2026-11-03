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
  EMPTY_DIRECTORY,
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
