// Pixel sprites for Bug Squash, one letter per pixel ('.' = clear), coloured by
// GAME_SPRITE_COLORS[kind]: a body, b edge, e white, p pupil, l legs.
import type { BugKind } from '../../../../core/src/games/bugs.js';
import { GAME_SPRITE_COLORS } from '../../constants.js';

type Sprite = readonly string[];

const BUG: readonly [Sprite, Sprite] = [
  [
    '..l.....l..',
    '...l...l...',
    '..bbbbbbb..',
    '.baaaaaaab.',
    'lbaeaaaeabl',
    '.bapaaapab.',
    'lbaaabaaabl',
    '.baaabaaab.',
    'l.bbbbbbb.l',
  ],
  [
    '.l.......l.',
    '..l.....l..',
    '..bbbbbbb..',
    'lbaaaaaaabl',
    '.baeaaaeab.',
    'lbapaaapabl',
    '.baaabaaab.',
    'lbaaabaaabl',
    '..bbbbbbb..',
  ],
];
const PATCH: Sprite = [
  '....lll....',
  '.bbbbbbbbb.',
  '.baaaaaaab.',
  '.baaaaaaeb.',
  '.baaaaaeab.',
  '.baeaaeaab.',
  '.baaeeaaab.',
  '.baaaaaaab.',
  '.bbbbbbbbb.',
];
const CLOCK: Sprite = [
  '...bbbbb...',
  '..baaeaab..',
  '.baaaeaaab.',
  '.baaaeaaab.',
  '.beaaeeeeb.',
  '.baaaaaaab.',
  '.baaaaaaab.',
  '..baaeaab..',
  '...bbbbb...',
];
export const SPRITE_W = 11;
export const SPRITE_H = 9;

export function spriteOf(kind: BugKind, frame: number): Sprite {
  if (kind === 'patch') return PATCH;
  if (kind === 'clock') return CLOCK;
  return BUG[frame % 2];
}

/** Draws a sprite at (x, y), `px` logical px per pixel; `rowShift(y)` shifts a row sideways (glitch). */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  kind: BugKind,
  x: number,
  y: number,
  px: number,
  rowShift: (row: number) => number = () => 0,
): void {
  const pal = GAME_SPRITE_COLORS[kind];
  sprite.forEach((line, r) => {
    const dx = rowShift(r);
    for (let c = 0; c < line.length; c++) {
      const color = pal[line[c]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x + (c + dx) * px, y + r * px, px, px);
    }
  });
}
