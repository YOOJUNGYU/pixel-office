// 8×8 pixel icons over agents: what they do (one per act) and a failed tool (the drop).
// '#' = a pixel in the current text colour; drawn as crisp SVG rects (no image assets).
import type { OfficeAgent } from '../../../core/src/lan.js';

export const ICONS = {
  edit: [
    '......##',
    '.....###',
    '....###.',
    '...###..',
    '..###...',
    '.###....',
    '##......',
    '#.......',
  ],
  read: [
    '.#####..',
    '.#...##.',
    '.#....#.',
    '.#.##.#.',
    '.#....#.',
    '.#.##.#.',
    '.#....#.',
    '.######.',
  ],
  search: [
    '.####...',
    '#....#..',
    '#....#..',
    '#....#..',
    '.####...',
    '....##..',
    '.....##.',
    '......##',
  ],
  web: [
    '..####..',
    '.#.##.#.',
    '#..##..#',
    '########',
    '#..##..#',
    '.#.##.#.',
    '..####..',
    '........',
  ],
  mcp: [
    '..#..#..',
    '..#..#..',
    '.######.',
    '.######.',
    '..####..',
    '...##...',
    '...##...',
    '...##...',
  ],
  run: [
    '..#.....',
    '..##....',
    '..###...',
    '..####..',
    '..###...',
    '..##....',
    '..#.....',
    '........',
  ],
  delegate: [
    '........',
    '########',
    '##....##',
    '#.#..#.#',
    '#..##..#',
    '#......#',
    '########',
    '........',
  ],
  ask: [
    '..####..',
    '.##..##.',
    '.....##.',
    '....##..',
    '...##...',
    '...##...',
    '........',
    '...##...',
  ],
  image: [
    '########',
    '#......#',
    '#.##...#',
    '#......#',
    '#...#..#',
    '#..###.#',
    '#.######',
    '########',
  ],
  tool: [
    '...##...',
    '.#.##.#.',
    '..####..',
    '###..###',
    '###..###',
    '..####..',
    '.#.##.#.',
    '...##...',
  ],
  thinking: [
    '........',
    '........',
    '........',
    '##.##.##',
    '##.##.##',
    '........',
    '........',
    '........',
  ],
  fail: [
    '...#....',
    '..###...',
    '..###...',
    '.#####..',
    '.#####..',
    '.#####..',
    '..###...',
    '........',
  ],
} as const satisfies Record<string, readonly string[]>;
export type IconId = keyof typeof ICONS;

/** The icon of what an agent does now; none when idle or hidden. */
export function actIcon(a: Pick<OfficeAgent, 'act' | 'target' | 'hidden'>): IconId | null {
  if (a.hidden) return null;
  switch (a.act) {
    case 'idle':
      return null;
    case 'find':
      return 'search';
    case 'fetch':
      return 'web';
    case 'tool':
      return a.target ? 'tool' : 'thinking'; // setThinking: act tool, no target
    default:
      return a.act;
  }
}
