import assert from 'node:assert/strict';

import { test } from 'vitest';

import { highlight, languageOf } from '../src/lan/highlight.js';

const kinds = (text: string, lang: string) =>
  highlight(text, languageOf(lang))
    .filter((t) => t.kind !== 'plain')
    .map((t) => `${t.kind}:${t.text}`);

test('languageOf reads fence tags and file extensions', () => {
  assert.equal(languageOf('tsx'), 'js');
  assert.equal(languageOf('Bash'), 'sh');
  assert.equal(languageOf('/a/b/c.py'), 'py');
  assert.equal(languageOf('README.md'), undefined);
  assert.equal(languageOf(undefined), undefined);
});

test('highlight: js keywords, strings, numbers, comments, calls, types', () => {
  assert.deepEqual(kinds('const a = foo("x", 2); // hi\nnew Map()', 'ts'), [
    'kw:const',
    'fn:foo',
    'str:"x"',
    'num:2',
    'com:// hi',
    'kw:new',
    'fn:Map',
  ]);
  assert.deepEqual(kinds('let s: Foo = `t`', 'ts'), ['kw:let', 'type:Foo', 'str:`t`']);
});

test('highlight: a comment marker inside a string stays a string', () => {
  assert.deepEqual(kinds('x = "a // b"', 'js'), ['str:"a // b"']);
  assert.deepEqual(kinds('url = "http://x" # note', 'py'), ['str:"http://x"', 'com:# note']);
});

test('highlight: shell commands, variables, flags', () => {
  assert.deepEqual(kinds('cd "$HOME" && npm test | tail -3', 'sh'), [
    'fn:cd',
    'str:"$HOME"',
    'fn:npm',
    'fn:tail',
    'num:3',
  ]);
  assert.deepEqual(kinds('echo ${A}', 'sh'), ['fn:echo', 'type:${A}']);
});

test('highlight: json keys vs values', () => {
  assert.deepEqual(kinds('{"a": "b", "n": 1, "t": true}', 'json'), [
    'prop:"a"',
    'str:"b"',
    'prop:"n"',
    'num:1',
    'prop:"t"',
    'kw:true',
  ]);
});

test('highlight: no language or a huge text → one plain token, text unchanged', () => {
  assert.deepEqual(highlight('a b', undefined), [{ kind: 'plain', text: 'a b' }]);
  const big = 'x'.repeat(20001);
  assert.equal(highlight(big, 'js').length, 1);
  const src = 'if (a) {\n  b(1) /* c */\n}';
  assert.equal(
    highlight(src, 'js')
      .map((t) => t.text)
      .join(''),
    src,
  );
});
