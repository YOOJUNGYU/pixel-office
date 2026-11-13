// Drone drawing: HUD on top, the sky below it (field px + GAME_HEADER_H), parallax skyline.
import type { DroneState } from '../../../../core/src/games/drone.js';
import {
  GAME_COLORS as C,
  GAME_DRONE_BOX_H,
  GAME_DRONE_BOX_W,
  GAME_DRONE_H,
  GAME_DRONE_RACK_W,
  GAME_DRONE_X,
  GAME_FONT_BOLD,
  GAME_FONT_NUM,
  GAME_FP,
  GAME_HEADER_H,
  GAME_VIEW_W,
} from '../../constants.js';
import { t } from '../../i18n.js';
import { fmt, stat, text } from './draw.js';

type Ctx = CanvasRenderingContext2D;
const TOP = GAME_HEADER_H;
const SKYLINE_W = 18;

export const droneAt = (x: number, y: number): [number, number] => [x, y + TOP];

/** Fixed pseudo-random building heights / lit windows per skyline slot. */
const hash = (i: number): number => ((i * 2654435761) >>> 0) % 1000;

export function drawDrone(ctx: Ctx, s: DroneState, best: number, now: number): void {
  stat(ctx, t('game.best'), fmt(Math.max(best, s.score)), GAME_VIEW_W - 50, 1, C.muted);
  text(ctx, fmt(s.score), GAME_VIEW_W / 2, 4, C.text, GAME_FONT_NUM, 'center');
  text(ctx, `${t('game.drone.racks')} ${s.passed}`, 6, 7, C.muted, GAME_FONT_BOLD);
  ctx.save();
  ctx.translate(0, TOP);
  // sky bands
  const band = Math.ceil(GAME_DRONE_H / C.sky.length);
  C.sky.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(0, i * band, GAME_VIEW_W, band);
  });
  // parallax skyline: a third of the racks' speed
  const flown = (s.ms / 10) * (s.speed / GAME_FP);
  const off = Math.floor(flown / 3);
  const first = Math.floor(off / SKYLINE_W);
  for (let k = first; k < first + GAME_VIEW_W / SKYLINE_W + 2; k++) {
    const hgt = 30 + (hash(k) % 50);
    const x = k * SKYLINE_W - off;
    ctx.fillStyle = C.skyline;
    ctx.fillRect(x, GAME_DRONE_H - hgt, SKYLINE_W - 2, hgt);
    ctx.fillStyle = C.skylineLit;
    for (let wy = GAME_DRONE_H - hgt + 4; wy < GAME_DRONE_H - 8; wy += 6)
      for (let wx = 3; wx < SKYLINE_W - 4; wx += 5)
        if (hash(k * 31 + wy * 7 + wx) % 4 === 0) ctx.fillRect(x + wx, wy, 2, 2);
  }
  // racks
  const blink = Math.floor(now / 300);
  for (const r of s.racks) {
    const x = Math.round(r.x / GAME_FP);
    const top = r.gapY - Math.floor(r.gap / 2);
    const bottom = r.gapY + Math.ceil(r.gap / 2);
    for (const [y0, y1] of [
      [0, top],
      [bottom, GAME_DRONE_H],
    ]) {
      ctx.fillStyle = C.rackEdge;
      ctx.fillRect(x, y0, GAME_DRONE_RACK_W, y1 - y0);
      ctx.fillStyle = C.rackBody;
      ctx.fillRect(x + 1, y0, GAME_DRONE_RACK_W - 2, y1 - y0);
      ctx.fillStyle = C.rackLight;
      ctx.fillRect(x + 1, y0, 1, y1 - y0);
      for (let y = y0 + 3; y < y1 - 2; y += 6) {
        ctx.fillStyle = C.rackEdge;
        ctx.fillRect(x + 3, y + 3, GAME_DRONE_RACK_W - 6, 1);
        ctx.fillStyle = (y + blink) % 4 === 0 ? C.rackLedAmber : C.rackLed;
        if ((Math.floor(y / 6) + blink) % 3 !== 0)
          ctx.fillRect(x + GAME_DRONE_RACK_W - 5, y + 1, 1, 1);
      }
      // lip at the gap
      const lip = y0 === 0 ? y1 - 3 : y0;
      ctx.fillStyle = C.rackLight;
      ctx.fillRect(x - 2, lip, GAME_DRONE_RACK_W + 4, 3);
      ctx.fillStyle = C.rackEdge;
      ctx.fillRect(x - 2, lip + (y0 === 0 ? 2 : 0), GAME_DRONE_RACK_W + 4, 1);
    }
    if (r.packet) {
      const bob = Math.floor(now / 200) % 2;
      const cx = x + GAME_DRONE_RACK_W / 2;
      ctx.fillStyle = C.packetDark;
      ctx.fillRect(cx - 4, r.gapY - 4 + bob, 8, 8);
      ctx.fillStyle = C.packet;
      ctx.fillRect(cx - 3, r.gapY - 3 + bob, 6, 6);
      ctx.fillStyle = C.white;
      ctx.fillRect(cx - 2, r.gapY - 2 + bob, 2, 1);
    }
  }
  // ground
  ctx.fillStyle = C.ground;
  ctx.fillRect(0, GAME_DRONE_H - 3, GAME_VIEW_W, 3);
  ctx.fillStyle = C.groundLine;
  for (let x = -(Math.floor(flown) % 12); x < GAME_VIEW_W; x += 12)
    ctx.fillRect(x, GAME_DRONE_H - 2, 6, 1);
  // drone: body, light, two rotors (spinning while it flies), hovering bob before the first flap
  const bob = s.flying ? 0 : Math.round(Math.sin(now / 250) * 2);
  const dx = GAME_DRONE_X;
  const dy = Math.round(s.y / GAME_FP) + bob;
  const w = GAME_DRONE_BOX_W;
  const spin = Math.floor(now / (s.flying ? 40 : 90)) % 2;
  ctx.fillStyle = C.prop;
  for (const rx of [dx - 2, dx + w - 4]) ctx.fillRect(rx + spin * 2, dy - 2, spin ? 2 : 6, 1);
  ctx.fillStyle = C.droneDark;
  ctx.fillRect(dx + 1, dy - 1, 1, 2);
  ctx.fillRect(dx + w - 2, dy - 1, 1, 2);
  ctx.fillRect(dx, dy + 1, w, GAME_DRONE_BOX_H - 2);
  ctx.fillStyle = C.droneBody;
  ctx.fillRect(dx + 1, dy + 1, w - 2, GAME_DRONE_BOX_H - 4);
  ctx.fillStyle = C.droneAccent;
  ctx.fillRect(dx + 3, dy + GAME_DRONE_BOX_H - 3, w - 6, 2);
  ctx.fillStyle = Math.floor(now / 300) % 2 ? C.bad : C.good;
  ctx.fillRect(dx + w - 3, dy + 2, 1, 1);
  if (!s.flying && !s.over)
    text(
      ctx,
      t('game.drone.start'),
      GAME_VIEW_W / 2,
      GAME_DRONE_H / 2 + 18,
      C.text,
      GAME_FONT_BOLD,
      'center',
    );
  ctx.restore();
}
