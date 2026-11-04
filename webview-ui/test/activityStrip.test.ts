import assert from 'node:assert/strict';

import { test } from 'vitest';

import { stripCat, stripCells } from '../src/lan/activityStrip.js';

const at = (min: number, e: object) =>
  ({ text: '', ts: new Date(min * 60_000 + 5_000).toISOString(), ...e }) as never;

test('categories: edits, commands, reads, failures, thinking', () => {
  assert.equal(stripCat({ kind: 'tool', tool: 'Edit', text: '' }), 'edit');
  assert.equal(stripCat({ kind: 'tool', tool: 'apply_patch', text: '' }), 'edit');
  assert.equal(stripCat({ kind: 'tool', tool: 'exec_command', text: '' }), 'run');
  assert.equal(stripCat({ kind: 'tool', tool: 'Grep', text: '' }), 'read');
  assert.equal(stripCat({ kind: 'tool', tool: 'mcp__x__y', text: '' }), 'read');
  assert.equal(stripCat({ kind: 'tool', tool: 'TodoWrite', text: '' }), 'tool');
  assert.equal(stripCat({ kind: 'result', error: true, text: '' }), 'fail');
  assert.equal(stripCat({ kind: 'result', text: '' }), null);
  assert.equal(stripCat({ kind: 'thinking', text: '' }), 'think');
});

test('one cell per minute ending now; the most telling one wins; old and undated ignored', () => {
  const now = 1000 * 60_000 + 30_000;
  const cells = stripCells(
    [
      at(990, { kind: 'tool', tool: 'Edit' }), // too old for 5 cells
      at(997, { kind: 'assistant' }),
      at(997, { kind: 'tool', tool: 'Bash' }),
      at(999, { kind: 'tool', tool: 'Read' }),
      at(999, { kind: 'result', error: true }),
      { kind: 'tool', tool: 'Edit', text: '' }, // no ts
    ],
    now,
    5,
  );
  assert.deepEqual(cells, [null, 'run', null, 'fail', null]);
});
