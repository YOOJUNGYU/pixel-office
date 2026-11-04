import assert from 'node:assert/strict';

import { test } from 'vitest';

import {
  clampZoom,
  foldText,
  isAtBottom,
  listSide,
  openState,
  reduceTranscript,
  transcriptStatus,
} from '../src/lan/transcript.js';

const e = (text: string) => ({ kind: 'user' as const, text });
const info = { kind: 'main', provider: 'claude', num: 1, title: 't', folder: 'f' };

test('loaded replaces, earlier prepends, append appends', () => {
  let s = reduceTranscript(openState('a'), {
    type: 'transcriptLoaded',
    id: 'a',
    info,
    entries: [e('2'), e('3')],
    start: 5,
    more: true,
  });
  assert.equal(s?.loading, false);
  assert.equal(s?.start, 5);
  s = reduceTranscript(s, {
    type: 'transcriptEarlier',
    id: 'a',
    entries: [e('1')],
    start: 2,
    more: false,
  });
  assert.deepEqual(
    s?.entries.map((x) => x.text),
    ['1', '2', '3'],
  );
  assert.equal(s?.start, 2);
  assert.equal(s?.more, false);
  s = reduceTranscript(s, { type: 'transcriptAppend', id: 'a', entries: [e('4')] });
  assert.deepEqual(
    s?.entries.map((x) => x.text),
    ['1', '2', '3', '4'],
  );
  s = reduceTranscript(s, {
    type: 'transcriptLoaded',
    id: 'a',
    info,
    entries: [e('x')],
    start: 0,
    more: false,
  });
  assert.deepEqual(
    s?.entries.map((x) => x.text),
    ['x'],
  );
});

test('messages for another id are ignored', () => {
  const s = openState('a');
  assert.equal(reduceTranscript(s, { type: 'transcriptAppend', id: 'b', entries: [e('1')] }), s);
  assert.equal(reduceTranscript(null, { type: 'transcriptAppend', id: 'a', entries: [] }), null);
});

test('ended keeps entries and sets error', () => {
  let s = reduceTranscript(openState('a'), {
    type: 'transcriptLoaded',
    id: 'a',
    info,
    entries: [e('1')],
    start: 0,
    more: false,
  });
  s = reduceTranscript(s, { type: 'transcriptError', id: 'a', reason: 'ended' });
  assert.equal(s?.error, 'ended');
  assert.equal(s?.entries.length, 1);
});

test('isAtBottom within slack', () => {
  assert.equal(isAtBottom(76, 100, 200), true);
  assert.equal(isAtBottom(50, 100, 200), false);
});

test('foldText keeps the first N lines and counts the rest', () => {
  assert.deepEqual(foldText('a\nb\nc', 2), { shown: 'a\nb', hidden: 1 });
  assert.deepEqual(foldText('a\nb', 2), { shown: 'a\nb', hidden: 0 });
  assert.deepEqual(foldText('', 2), { shown: '', hidden: 0 });
});

test('listSide: right when it fits, else left', () => {
  assert.equal(listSide(100, 260, 1000, 12), 'right');
  assert.equal(listSide(900, 260, 1000, 12), 'left');
  assert.equal(listSide(728, 260, 1000, 12), 'right');
  assert.equal(listSide(729, 260, 1000, 12), 'left');
});

test('clampZoom keeps a whole percentage within 50–200', () => {
  assert.equal(clampZoom(125), 125);
  assert.equal(clampZoom(112.6), 113);
  assert.equal(clampZoom(10), 50);
  assert.equal(clampZoom(900), 200);
  assert.equal(clampZoom(NaN), 100);
});

test('transcriptStatus: ended, waiting, idle, thinking, working', () => {
  assert.equal(transcriptStatus(undefined), 'ended');
  assert.equal(transcriptStatus({ act: 'edit', target: 'a.ts', permission: true }), 'waiting');
  assert.equal(transcriptStatus({ act: 'idle', target: '', permission: false }), 'idle');
  assert.equal(transcriptStatus({ act: 'tool', target: '', permission: false }), 'thinking');
  assert.equal(transcriptStatus({ act: 'tool', target: 'mcp__x', permission: false }), 'working');
  assert.equal(transcriptStatus({ act: 'run', target: 'npm test', permission: false }), 'working');
});
