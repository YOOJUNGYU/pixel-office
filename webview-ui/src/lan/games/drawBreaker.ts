// Breaker drawing: HUD on top, the field below it (field px + GAME_HEADER_H).
import {
  type BreakerState,
  BRICK,
  brickBox,
  paddleWidth,
  POWERS,
} from '../../../../core/src/games/breaker.js';
import {
  GAME_BREAKER_PADDLE_H,
  GAME_BREAKER_PADDLE_Y,
  GAME_COLORS as C,
  GAME_FONT,
  GAME_FONT_BOLD,
  GAME_FONT_TINY,
  GAME_FP,
  GAME_HEADER_H,
  GAME_VIEW_H,
  GAME_VIEW_W,
} from '../../constants.js';
import { t } from '../../i18n.js';
import { fmt, stat, text } from './draw.js';

type Ctx = CanvasRenderingContext2D;
const TOP = GAME_HEADER_H;
const POWER_LETTER = ['W', 'M', 'S', '+'];

/** Field px → canvas px. */
export const breakerAt = (x: number, y: number): [number, number] => [x, y + TOP];
export const brickColor = (row: number): string => C.brickRows[row % C.brickRows.length];

function brick(ctx: Ctx, i: number, v: number): void {
  const { x, y, w, h } = brickBox(i);
  if (v === BRICK.steel) {
    ctx.fillStyle = C.steelDark;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = C.steel;
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = C.steelLight;
    for (let k = 2; k < w - 2; k += 5) ctx.fillRect(x + k, y + 2, 2, 1);
    ctx.fillStyle = C.steelDark;
    for (let k = 4; k < w - 2; k += 5) ctx.fillRect(x + k, y + h - 3, 2, 1);
    return;
  }
  const row = Math.floor(i / 10);
  ctx.fillStyle = brickColor(row);
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = C.brickShine;
  ctx.fillRect(x, y, w, 1);
  ctx.fillStyle = C.brickShade;
  ctx.fillRect(x, y + h - 2, w, 2);
  if (v === BRICK.tough || v === BRICK.cracked) {
    ctx.fillStyle = C.brickShade;
    ctx.fillRect(x, y, 2, h);
    ctx.fillRect(x + w - 2, y, 2, h);
    ctx.fillStyle = C.rivet;
    for (const [rx, ry] of [
      [2, 2],
      [w - 3, 2],
      [2, h - 4],
      [w - 3, h - 4],
    ])
      ctx.fillRect(x + rx, y + ry, 1, 1);
  }
  if (v === BRICK.cracked) {
    ctx.fillStyle = C.crack;
    for (const [cx, cy] of [
      [8, 1],
      [9, 2],
      [10, 3],
      [10, 4],
      [11, 5],
      [12, 6],
      [13, 3],
      [14, 2],
    ])
      ctx.fillRect(x + cx, y + cy, 1, 1);
  }
}

export function drawBreaker(ctx: Ctx, s: BreakerState, best: number, now: number): void {
  // HUD
  stat(ctx, t('game.score'), fmt(s.score), 6, 1);
  text(
    ctx,
    `${t('game.level')} ${s.level}`,
    GAME_VIEW_W / 2,
    4,
    C.accent,
    GAME_FONT_BOLD,
    'center',
  );
  if (s.combo > 1)
    text(ctx, `${t('game.combo')} ×${s.combo}`, GAME_VIEW_W / 2, 13, C.good, GAME_FONT, 'center');
  for (let i = 0; i < s.lives; i++) {
    const x = GAME_VIEW_W - 16 - i * 14;
    ctx.fillStyle = C.paddleDark;
    ctx.fillRect(x, 5, 12, 4);
    ctx.fillStyle = C.paddle;
    ctx.fillRect(x, 5, 12, 3);
  }
  text(
    ctx,
    `${t('game.best')} ${fmt(Math.max(best, s.score))}`,
    GAME_VIEW_W - 4,
    12,
    C.muted,
    GAME_FONT,
    'right',
  );
  ctx.save();
  ctx.translate(0, TOP);
  const h = GAME_VIEW_H - TOP;
  ctx.fillStyle = C.field;
  ctx.fillRect(0, 0, GAME_VIEW_W, h);
  ctx.fillStyle = C.fieldGrid;
  for (let x = 12; x < GAME_VIEW_W; x += 12) ctx.fillRect(x, 0, 1, h);
  for (let y = 12; y < h; y += 12) ctx.fillRect(0, y, GAME_VIEW_W, 1);
  s.bricks.forEach((v, i) => {
    if (v) brick(ctx, i, v);
  });
  // power-up capsules
  for (const d of s.drops) {
    const x = Math.round(d.x / GAME_FP);
    const y = Math.round(d.y / GAME_FP);
    const color = C.powers[POWERS.indexOf(d.power)];
    ctx.fillStyle = C.rivet;
    ctx.fillRect(x, y, 10, 6);
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y, 8, 6);
    ctx.fillRect(x, y + 1, 10, 4);
    text(
      ctx,
      POWER_LETTER[POWERS.indexOf(d.power)],
      x + 5,
      y,
      C.tileDarkText,
      GAME_FONT_TINY,
      'center',
    );
  }
  // paddle: a router with blinking LEDs (blue while wide)
  const px = Math.round(s.paddle / GAME_FP);
  const pw = paddleWidth(s);
  const py = GAME_BREAKER_PADDLE_Y;
  ctx.fillStyle = C.paddleDark;
  ctx.fillRect(px, py, pw, GAME_BREAKER_PADDLE_H + 1);
  ctx.fillStyle = s.wideMs > 0 ? C.powers[0] : C.paddle;
  ctx.fillRect(px + 1, py, pw - 2, GAME_BREAKER_PADDLE_H - 1);
  const blink = Math.floor(now / 250);
  ctx.fillStyle = C.paddleLed;
  for (let k = 0; k < 3; k++) if ((blink + k) % 3 !== 0) ctx.fillRect(px + 4 + k * 3, py + 1, 1, 1);
  // balls
  for (const b of s.balls) {
    const x = Math.round(b.x / GAME_FP);
    const y = Math.round(b.y / GAME_FP);
    ctx.fillStyle = s.slowMs > 0 ? C.powers[2] : C.ballGlow;
    ctx.fillRect(x - 1, y - 1, 5, 5);
    ctx.fillStyle = C.ball;
    ctx.fillRect(x, y, 3, 3);
  }
  if (s.stuck >= 0 && Math.floor(now / 400) % 2 === 0)
    text(ctx, t('game.breaker.launch'), GAME_VIEW_W / 2, py - 26, C.text, GAME_FONT_BOLD, 'center');
  ctx.restore();
}
