// Tower drawing: HUD on top, the shaft below it (field px + GAME_HEADER_H); the page-only
// view state (camera, debris, flashes) is `TowerView` in towerView.ts.
import type { TowerState } from '../../../../core/src/games/tower.js';
import {
  GAME_COLORS as C,
  GAME_FONT_BOLD,
  GAME_FONT_NUM,
  GAME_FONT_TINY,
  GAME_FP,
  GAME_HEADER_H,
  GAME_TOWER_FLASH_MS,
  GAME_TOWER_H,
  GAME_TOWER_MARK_EVERY,
  GAME_TOWER_RING_MS,
  GAME_TOWER_SKY_BAND_PX,
  GAME_TOWER_STAR_FROM_PX,
  GAME_TOWER_UNIT_H,
  GAME_TOWER_VIEW_FLOORS,
  GAME_VIEW_W,
} from '../../constants.js';
import { t } from '../../i18n.js';
import { fmt, stat, text } from './draw.js';
import { hash, type TowerView, unitColor, worldY } from './towerView.js';

type Ctx = CanvasRenderingContext2D;
const TOP = GAME_HEADER_H;
const U = GAME_TOWER_UNIT_H;
const RAIL_EVERY = 24;
const STAR_CELL = 12;

/** Back wall: colour bands by altitude, rack rails low down, stars high up. */
function wall(ctx: Ctx, cam: number, now: number): void {
  for (let y = 0; y < GAME_TOWER_H;) {
    const alt = GAME_TOWER_H - y + cam;
    const band = Math.min(C.towerSky.length - 1, Math.floor(alt / GAME_TOWER_SKY_BAND_PX));
    // rows down to this band's lower edge
    const next = Math.min(GAME_TOWER_H, GAME_TOWER_H + cam - band * GAME_TOWER_SKY_BAND_PX);
    const end = Math.max(y + 1, next);
    ctx.fillStyle = C.towerSky[band];
    ctx.fillRect(0, y, GAME_VIEW_W, end - y);
    // dither the seam with the band below
    if (band > 0 && end < GAME_TOWER_H) {
      ctx.fillStyle = C.towerSky[band - 1];
      for (let x = 0; x < GAME_VIEW_W; x += 2) ctx.fillRect(x + (end % 2), end - 1, 1, 1);
    }
    y = end;
  }
  ctx.fillStyle = C.fieldGrid;
  const railTop = Math.max(0, GAME_TOWER_H + cam - GAME_TOWER_STAR_FROM_PX);
  for (let x = RAIL_EVERY; x < GAME_VIEW_W; x += RAIL_EVERY)
    if (railTop < GAME_TOWER_H) {
      ctx.fillRect(x, railTop, 1, GAME_TOWER_H - railTop);
      for (let y = railTop + ((((cam - railTop) % 6) + 6) % 6); y < GAME_TOWER_H; y += 6)
        ctx.fillRect(x - 1, y, 3, 1);
    }
  // stars scroll at half speed (far away), twinkle
  const par = Math.floor(cam / 2);
  const first = Math.floor(par / STAR_CELL);
  for (let r = first; r < first + GAME_TOWER_H / STAR_CELL + 1; r++) {
    for (let c = 0; c < GAME_VIEW_W / STAR_CELL; c++) {
      const h = hash(r * 97 + c);
      if (h % 9 !== 0) continue;
      const y = GAME_TOWER_H - (r * STAR_CELL - par) - (h % STAR_CELL);
      if (GAME_TOWER_H - y + cam < GAME_TOWER_STAR_FROM_PX) continue;
      ctx.globalAlpha = (Math.floor(now / 400) + h) % 5 === 0 ? 0.35 : 0.8;
      ctx.fillStyle = C.star;
      ctx.fillRect(c * STAR_CELL + (h % 7), y, 1, 1);
    }
  }
  ctx.globalAlpha = 1;
}

/** One 1U server: ears with a hole, drive bays, status LEDs. */
function unit(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  color: string,
  floor: number,
  now: number,
) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, U - 1);
  ctx.fillStyle = C.brickShine;
  ctx.fillRect(x, y, w, 1);
  ctx.fillStyle = C.brickShade;
  ctx.fillRect(x, y + U - 3, w, 2);
  if (w < 6) return;
  ctx.fillStyle = C.rivet;
  ctx.fillRect(x, y + 1, 2, U - 4);
  ctx.fillRect(x + w - 2, y + 1, 2, U - 4);
  ctx.fillStyle = C.bg;
  ctx.fillRect(x, y + 4, 1, 1);
  ctx.fillRect(x + w - 1, y + 4, 1, 1);
  if (floor === 0) return;
  // bays on the left part, LEDs at the right
  ctx.fillStyle = C.brickShade;
  for (let bx = x + 4; bx + 6 <= x + w - 12; bx += 8) {
    ctx.fillRect(bx, y + 2, 6, 4);
    ctx.fillStyle = C.brickShine;
    ctx.fillRect(bx + 1, y + 3, 4, 1);
    ctx.fillStyle = C.brickShade;
  }
  if (w >= 14) {
    const h = hash(floor);
    const on = (Math.floor(now / (150 + (h % 250))) + h) % 3 !== 0;
    ctx.fillStyle = on ? C.rackLed : C.brickShade;
    ctx.fillRect(x + w - 8, y + 3, 2, 2);
    ctx.fillStyle = h % 4 === 0 ? C.rackLedAmber : C.rackLed;
    ctx.fillRect(x + w - 5, y + 3, 1, 2);
  }
}

export function drawTower(ctx: Ctx, s: TowerState, view: TowerView, best: number, now: number) {
  stat(ctx, t('game.best'), fmt(Math.max(best, s.score)), GAME_VIEW_W - 50, 1, C.muted);
  text(ctx, fmt(s.score), GAME_VIEW_W / 2, 4, C.text, GAME_FONT_NUM, 'center');
  text(ctx, `${t('game.tower.floors')} ${s.stack.length - 1}`, 6, 7, C.muted, GAME_FONT_BOLD);
  const cam = Math.round(view.cam);
  ctx.save();
  ctx.translate(0, TOP);
  ctx.beginPath();
  ctx.rect(0, 0, GAME_VIEW_W, GAME_TOWER_H);
  ctx.clip();
  wall(ctx, cam, now);
  // height marks on the left edge
  for (
    let i = GAME_TOWER_MARK_EVERY;
    i < s.stack.length + GAME_TOWER_VIEW_FLOORS;
    i += GAME_TOWER_MARK_EVERY
  ) {
    const y = worldY(i) + cam;
    if (y < 0 || y > GAME_TOWER_H) continue;
    ctx.fillStyle = C.muted;
    ctx.fillRect(0, y, 4, 1);
    text(ctx, String(i), 6, y - 3, C.muted, GAME_FONT_TINY);
  }
  // placed units (only the visible ones); the newest one flashes
  const first = Math.max(0, s.stack.length - GAME_TOWER_VIEW_FLOORS - 2);
  const newest = s.stack.length - 1;
  for (let i = first; i < s.stack.length; i++) {
    const u = s.stack[i];
    const y = worldY(i) + cam;
    unit(ctx, u.x, y, u.w, i === 0 ? C.steel : unitColor(i), i, now);
    if (i === newest && i > 0 && view.flashMs > 0) {
      ctx.globalAlpha = (view.flashMs / GAME_TOWER_FLASH_MS) * 0.7;
      ctx.fillStyle = C.white;
      ctx.fillRect(u.x, y, u.w, U - 1);
      ctx.globalAlpha = 1;
    }
  }
  // a perfect's ring grows out of the newest unit
  if (view.ringMs > 0 && newest > 0) {
    const u = s.stack[newest];
    const k = view.ringMs / GAME_TOWER_RING_MS;
    const r = Math.round((1 - k) * 10) + 1;
    const y = worldY(newest) + cam;
    ctx.globalAlpha = k;
    ctx.strokeStyle = C.accent;
    ctx.lineWidth = 1;
    ctx.strokeRect(u.x - r + 0.5, y - r + 0.5, u.w + 2 * r - 1, U - 1 + 2 * r - 1);
    ctx.globalAlpha = 1;
  }
  if (!s.over) {
    // drop guide down the top unit's edges, the sliding unit, and what a drop now would cut (red)
    const top = s.stack[newest];
    const y = worldY(s.stack.length) + cam;
    ctx.fillStyle = C.panelEdge;
    for (let gy = 0; gy < worldY(newest) + cam; gy += 4) {
      ctx.fillRect(top.x, gy, 1, 2);
      ctx.fillRect(top.x + top.w - 1, gy, 1, 2);
    }
    const sx = Math.trunc(s.x / GAME_FP);
    unit(ctx, sx, y, s.w, unitColor(s.stack.length), s.stack.length, now);
    const l = Math.max(sx, top.x);
    const r = Math.min(sx + s.w, top.x + top.w);
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = C.bad;
    if (r <= l) ctx.fillRect(sx, y, s.w, U - 1);
    else {
      if (l > sx) ctx.fillRect(sx, y, l - sx, U - 1);
      if (r < sx + s.w) ctx.fillRect(r, y, sx + s.w - r, U - 1);
    }
    ctx.globalAlpha = 1;
  }
  for (const d of view.debris) {
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = d.color;
    ctx.fillRect(Math.round(d.x), Math.round(d.y) + cam, d.w, U - 1);
    ctx.fillStyle = C.brickShade;
    ctx.fillRect(Math.round(d.x), Math.round(d.y) + cam + U - 3, d.w, 2);
  }
  ctx.globalAlpha = 1;
  if (s.streak >= 2 && !s.over) {
    const pulse = Math.floor(now / 120) % 2 === 0;
    text(
      ctx,
      `${t('game.tower.perfect')} ×${s.streak}`,
      GAME_VIEW_W / 2,
      GAME_TOWER_H - 14,
      pulse ? C.accent : C.white,
      GAME_FONT_BOLD,
      'center',
    );
  }
  ctx.restore();
}
