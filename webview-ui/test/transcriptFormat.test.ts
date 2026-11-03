import assert from 'node:assert/strict';

import { test } from 'vitest';

import {
  headingText,
  prettyResult,
  splitFences,
  splitInline,
  toolFields,
} from '../src/lan/transcriptFormat.js';

test('splitFences keeps text and code (with indentation) apart', () => {
  const text = 'Fix:\n\n```ts\nif (a) {\n  b();\n}\n```\n\nDone.';
  assert.deepEqual(splitFences(text), [
    { kind: 'text', text: 'Fix:' },
    { kind: 'code', lang: 'ts', text: 'if (a) {\n  b();\n}' },
    { kind: 'text', text: 'Done.' },
  ]);
});

test('splitFences: no fence → one text block; an unclosed fence runs to the end', () => {
  assert.deepEqual(splitFences('plain'), [{ kind: 'text', text: 'plain' }]);
  assert.deepEqual(splitFences('a\n```\nx\n  y'), [
    { kind: 'text', text: 'a' },
    { kind: 'code', lang: '', text: 'x\n  y' },
  ]);
});

test('splitInline finds `code` and **bold**', () => {
  assert.deepEqual(splitInline('run `npm test` **now**.'), [
    { kind: 'plain', text: 'run ' },
    { kind: 'code', text: 'npm test' },
    { kind: 'plain', text: ' ' },
    { kind: 'bold', text: 'now' },
    { kind: 'plain', text: '.' },
  ]);
});

test('headingText', () => {
  assert.equal(headingText('## Title'), 'Title');
  assert.equal(headingText('#nope'), undefined);
});

test('toolFields turns a JSON input into fields with real line breaks', () => {
  const f = toolFields(JSON.stringify({ command: 'ls\ncd x', description: 'List' }, null, 2));
  assert.deepEqual(f, [
    { key: 'command', value: 'ls\ncd x', block: true, tone: undefined },
    { key: 'description', value: 'List', block: false, tone: undefined },
  ]);
  const e = toolFields(JSON.stringify({ old_string: 'a', new_string: 'b', n: 2 }));
  assert.deepEqual(
    e?.map((x) => [x.key, x.tone, x.block, x.value]),
    [
      ['old_string', 'old', true, 'a'],
      ['new_string', 'new', true, 'b'],
      ['n', undefined, false, '2'],
    ],
  );
  assert.equal(toolFields('not json'), undefined);
  assert.equal(toolFields('[1]'), undefined);
  assert.equal(toolFields('{}'), undefined);
});

test('prettyResult indents JSON and leaves other text alone', () => {
  assert.equal(prettyResult('{"a":1}'), '{\n  "a": 1\n}');
  assert.equal(prettyResult('{oops'), '{oops');
  assert.equal(prettyResult('ok'), 'ok');
});
