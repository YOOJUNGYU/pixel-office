import { describe, expect, it } from 'vitest';

import { rankings } from '../src/lan/arcade.js';

const row = (id: string, score: number) => ({ id, name: id, score, at: 1 });

describe('arcade hall of fame', () => {
  it('ties share a rank; me and online people are marked', () => {
    const rows = rankings(
      [row('b', 500), row('a', 200), row('me', 200), row('d', 50)],
      'me',
      new Set(['b']),
    );
    expect(rows.map((r) => [r.rank, r.id, r.self, r.online])).toEqual([
      [1, 'b', false, true],
      [2, 'a', false, false],
      [2, 'me', true, false],
      [4, 'd', false, false],
    ]);
  });
});
