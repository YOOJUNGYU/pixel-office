// Merge drawing: HUD on top, the 4 × 4 board below; the last move slides, then merged
// and new tiles pop (timing from the page: ms since the move).
import type { MergeState } from '../../../../core/src/games/merge.js';
import {
  GAME_COLORS as C,
  GAME_FONT,
  GAME_HEADER_H,
  GAME_MERGE_CELL,
  GAME_MERGE_FONTS,
  GAME_MERGE_GAP,
  GAME_MERGE_POP_MS,
  GAME_MERGE_SIZE,
  GAME_MERGE_SLIDE_MS,
  GAME_VIEW_W,
} from '../../constants.js';
import { t } from '../../i18n.js';
import { fmt, stat, text } from './draw.js';

type Ctx = CanvasRenderingContext2D;
const N = GAME_MERGE_SIZE;
const STEP = GAME_MERGE_CELL + GAME_MERGE_GAP;
const BOARD = N * STEP + GAME_MERGE_GAP;
const BX = Math.floor((GAME_VIEW_W - BOARD) / 2);
const BY = GAME_HEADER_H;

/** Top-left of cell i (px). */
const cellXY = (i: number): [number, number] => [
  BX + GAME_MERGE_GAP + (i % N) * STEP,
  BY + GAME_MERGE_GAP + Math.floor(i / N) * STEP,
];
export const mergeAt = (i: number): [number, number] => {
  const [x, y] = cellXY(i);
  return [x + GAME_MERGE_CELL / 2, y + GAME_MERGE_CELL / 2];
};
export const tileColor = (e: number): string => C.tiles[Math.min(e, C.tiles.length) - 1];

function tile(ctx: Ctx, e: number, cx: number, cy: number, scale: number): void {
  const size = Math.round(GAME_MERGE_CELL * scale);
  const x = Math.round(cx - size / 2);
  const y = Math.round(cy - size / 2);
  ctx.fillStyle = tileColor(e);
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = C.brickShine;
  ctx.fillRect(x, y, size, 2);
  ctx.fillStyle = C.brickShade;
  ctx.fillRect(x, y + size - 3, size, 3);
  const label = String(2 ** e);
  const font =
    GAME_MERGE_FONTS[Math.min(GAME_MERGE_FONTS.length - 1, Math.max(0, label.length - 2))];
  const px = Number.parseInt(font.replace(/^\D+/, ''), 10);
  const color = e >= C.tiles.length ? C.tileDarkText : C.text;
  text(ctx, label, cx, cy - px / 2 - 1, color, font, 'center');
}

export function drawMerge(ctx: Ctx, s: MergeState, best: number, sinceMove: number): void {
  stat(ctx, t('game.score'), fmt(s.score), 6, 1);
  stat(ctx, t('game.best'), fmt(Math.max(best, s.score)), GAME_VIEW_W - 50, 1, C.muted);
  text(
    ctx,
    `${t('game.merge.moves')} ${s.moves}`,
    GAME_VIEW_W / 2,
    7,
    C.muted,
    GAME_FONT,
    'center',
  );
  ctx.fillStyle = C.board;
  ctx.fillRect(BX, BY, BOARD, BOARD);
  for (let i = 0; i < N * N; i++) {
    const [x, y] = cellXY(i);
    ctx.fillStyle = C.cellEmpty;
    ctx.fillRect(x, y, GAME_MERGE_CELL, GAME_MERGE_CELL);
  }
  const { slides, merged, spawn } = s.last;
  if (sinceMove < GAME_MERGE_SLIDE_MS && slides.length) {
    const k = sinceMove / GAME_MERGE_SLIDE_MS;
    for (const sl of slides) {
      const [fx, fy] = mergeAt(sl.from);
      const [tx, ty] = mergeAt(sl.to);
      tile(ctx, sl.e, fx + (tx - fx) * k, fy + (ty - fy) * k, 1);
    }
    return;
  }
  const pop = Math.max(0, 1 - (sinceMove - GAME_MERGE_SLIDE_MS) / GAME_MERGE_POP_MS);
  s.cells.forEach((e, i) => {
    if (!e) return;
    const [cx, cy] = mergeAt(i);
    const scale = i === spawn ? 1 - 0.6 * pop : merged.includes(i) ? 1 + 0.12 * pop : 1;
    tile(ctx, e, cx, cy, scale);
  });
}
