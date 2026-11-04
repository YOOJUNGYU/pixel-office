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

test('probes are no failures; unloaded minutes are unknown', () => {
  const now = 1000 * 60_000 + 30_000;
  const tool = (min: number, cmd: string, id: string) =>
    at(min, {
      kind: 'tool',
      tool: 'Bash',
      callId: id,
      text: JSON.stringify({ command: cmd }, null, 2),
    });
  const res = (min: number, id: string) =>
    at(min, { kind: 'result', error: true, callId: id, text: 'Exit code 1' });
  const cells = stripCells(
    [tool(998, 'grep -rn x src', 'a'), res(998, 'a'), tool(999, 'npm test', 'b'), res(999, 'b')],
    now,
    5,
    true,
  );
  assert.deepEqual(cells, ['unknown', 'unknown', 'run', 'fail', null]);
  assert.deepEqual(stripCells([], now, 2, false), [null, null]);
});
