import assert from 'node:assert/strict';

import { test } from 'vitest';

import { netNumbers } from '../src/lan/netBadges.js';

const rows = (...nets: (string | undefined)[]) => nets.map((net) => ({ net }));

test('one network (or none) → no badges', () => {
  assert.equal(netNumbers(rows('lan', 'lan', undefined), 'lan').size, 0);
  assert.equal(netNumbers(rows(undefined, undefined), undefined).size, 0);
});

test('mine is 1, the rest by people count, ties by net string', () => {
  const m = netNumbers(rows('aa', 'cc', 'cc', 'bb', 'dd', 'cc', undefined), 'aa');
  assert.deepEqual(
    [...m.entries()],
    [
      ['aa', 1],
      ['cc', 2],
      ['bb', 3],
      ['dd', 4],
    ],
  );
});

test('no own net: numbering starts at 1 with the biggest', () => {
  const m = netNumbers(rows('bb', 'aa', 'bb'), undefined);
  assert.deepEqual(
    [...m.entries()],
    [
      ['bb', 1],
      ['aa', 2],
    ],
  );
});
