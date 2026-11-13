// Drawing of the three arcade games on the logical GAME_VIEW_W × GAME_VIEW_H canvas.
// Pure canvas calls; the state comes from core/src/games (never changed here).
import type { BugKind, BugsState } from '../../../../core/src/games/bugs.js';
import { BUGS_MONITORS, bugsMult } from '../../../../core/src/games/bugs.js';
import type { CableState, Pos } from '../../../../core/src/games/cable.js';
import { DIRS } from '../../../../core/src/games/cable.js';
import {
  GAME_BUGS_FRAME_H,
  GAME_BUGS_GAP,
  GAME_BUGS_MON_H,
  GAME_BUGS_MON_W,
  GAME_BUGS_ROUND_MS,
  GAME_CABLE_BURST_MS,
  GAME_CABLE_CELL,
  GAME_CABLE_COLS,
  GAME_CABLE_ROWS,
  GAME_COLORS as C,
  GAME_FONT,
  GAME_FONT_BIG,
  GAME_FONT_BOLD,
  GAME_FONT_NUM,
  GAME_FONT_TINY,
  GAME_HEADER_H,
  GAME_VIEW_H,
  GAME_VIEW_W,
} from '../../constants.js';
import { t } from '../../i18n.js';
import { drawSprite, SPRITE_H, SPRITE_W, spriteOf } from './sprites.js';

type Ctx = CanvasRenderingContext2D;

export function text(
  ctx: Ctx,
  s: string,
  x: number,
  y: number,
  color: string = C.text,
  font = GAME_FONT,
  align: CanvasTextAlign = 'left',
): void {
  ctx.font = font;
  ctx.textAlign = align;
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
  ctx.textAlign = 'left';
}

/** A label over a big number. */
export function stat(
  ctx: Ctx,
  label: string,
  value: string,
  x: number,
  y: number,
  color = C.text,
): void {
  text(ctx, label, x, y, C.muted);
  text(ctx, value, x, y + 9, color, GAME_FONT_NUM);
}

export function panel(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = C.panelEdge;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = C.panel;
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
}

export const fmt = (n: number): string => n.toLocaleString();

// ── Cable Run ────────────────────────────────────────────────

const GRID_Y = GAME_HEADER_H + 2;

/** Centre of a cable cell (logical px). */
export const cableAt = (p: Pos): [number, number] => [
  p.x * GAME_CABLE_CELL + GAME_CABLE_CELL / 2,
  GRID_Y + p.y * GAME_CABLE_CELL + GAME_CABLE_CELL / 2,
];

export function drawCable(ctx: Ctx, s: CableState, best: number, now: number): void {
  const n = GAME_CABLE_CELL;
  text(ctx, t('game.score'), 4, 3, C.muted);
  text(ctx, fmt(s.score), 4, 10, C.text, GAME_FONT_NUM);
  text(ctx, t('game.best'), GAME_VIEW_W - 4, 3, C.muted, GAME_FONT, 'right');
  text(ctx, fmt(Math.max(best, s.score)), GAME_VIEW_W - 4, 10, C.muted, GAME_FONT_NUM, 'right');
  text(
    ctx,
    `${t('game.length')} ${s.body.length}`,
    GAME_VIEW_W / 2,
    3,
    C.muted,
    GAME_FONT,
    'center',
  );
  if (s.burst) {
    const w = 80;
    const x = (GAME_VIEW_W - w) / 2;
    ctx.fillStyle = C.panelEdge;
    ctx.fillRect(x, 13, w, 5);
    ctx.fillStyle = C.gold;
    ctx.fillRect(x + 1, 14, Math.round(((w - 2) * s.burst.ms) / GAME_CABLE_BURST_MS), 3);
  }
  // board
  ctx.fillStyle = C.pcb;
  ctx.fillRect(0, GRID_Y, GAME_CABLE_COLS * n, GAME_CABLE_ROWS * n);
  ctx.fillStyle = C.pcbTrace;
  for (let y = 0; y < GAME_CABLE_ROWS; y += 3)
    ctx.fillRect(0, GRID_Y + y * n + n / 2, GAME_CABLE_COLS * n, 1);
  ctx.fillStyle = C.pcbDot;
  for (let y = 0; y < GAME_CABLE_ROWS; y++)
    for (let x = 0; x < GAME_CABLE_COLS; x++)
      ctx.fillRect(x * n + n / 2, GRID_Y + y * n + n / 2, 1, 1);
  // firewalls
  const flick = Math.floor(now / 120) % 2;
  for (const w of s.walls) {
    const x = w.x * n;
    const y = GRID_Y + w.y * n;
    ctx.fillStyle = C.wallDark;
    ctx.fillRect(x, y, n, n);
    ctx.fillStyle = C.wall;
    ctx.fillRect(x + 1, y + 1, 4, 3);
    ctx.fillRect(x + 6, y + 1, 3, 3);
    ctx.fillRect(x + 1, y + 5, 2, 4);
    ctx.fillRect(x + 4, y + 5, 5, 4);
    ctx.fillStyle = C.wallLight;
    ctx.fillRect(x + 2 + flick * 4, y + 1, 1, 1);
  }
  // packet (pulses)
  const pulse = Math.floor(now / 200) % 2;
  {
    const x = s.packet.x * n;
    const y = GRID_Y + s.packet.y * n;
    ctx.fillStyle = C.packetDark;
    ctx.fillRect(x + 1 - pulse, y + 1 - pulse, n - 2 + 2 * pulse, n - 2 + 2 * pulse);
    ctx.fillStyle = C.packet;
    ctx.fillRect(x + 2, y + 2, n - 4, n - 4);
    ctx.fillStyle = C.white;
    ctx.fillRect(x + 3, y + 3, 2, 1);
  }
  if (s.burst && (s.burst.ms > 1500 || Math.floor(now / 100) % 2 === 0)) {
    const [cx, cy] = cableAt(s.burst);
    ctx.fillStyle = C.goldDark;
    for (let i = 0; i <= 5; i++) ctx.fillRect(cx - i, cy - 5 + i, 2 * i, 1);
    for (let i = 0; i <= 5; i++) ctx.fillRect(cx - i, cy + 5 - i, 2 * i, 1);
    ctx.fillStyle = C.gold;
    for (let i = 0; i <= 3; i++) ctx.fillRect(cx - i, cy - 3 + i, 2 * i, 1);
    for (let i = 0; i <= 3; i++) ctx.fillRect(cx - i, cy + 3 - i, 2 * i, 1);
  }
  // cable: segments joined to the one before, a stripe every 3rd
  const len = s.body.length;
  for (let i = len - 1; i >= 1; i--) {
    const b = s.body[i];
    const a = s.body[i - 1];
    const x = b.x * n;
    const y = GRID_Y + b.y * n;
    const inset = i === len - 1 ? 3 : 2;
    ctx.fillStyle = C.cableDark;
    ctx.fillRect(x + inset - 1, y + inset - 1, n - 2 * inset + 2, n - 2 * inset + 2);
    const jx = Math.min(a.x, b.x) * n;
    const jy = GRID_Y + Math.min(a.y, b.y) * n;
    if (a.x !== b.x) ctx.fillRect(jx + n / 2, y + 1, n, n - 2);
    else ctx.fillRect(x + 1, jy + n / 2, n - 2, n);
    ctx.fillStyle = i % 3 === 0 ? C.cableStripe : C.cable;
    ctx.fillRect(x + inset, y + inset, n - 2 * inset, n - 2 * inset);
    if (a.x !== b.x) ctx.fillRect(jx + n / 2, y + 2, n, n - 4);
    else ctx.fillRect(x + 2, jy + n / 2, n - 4, n);
  }
  // plug
  const h = s.body[0];
  const d = DIRS[s.dir];
  const x = h.x * n;
  const y = GRID_Y + h.y * n;
  ctx.fillStyle = C.plugDark;
  ctx.fillRect(x, y, n, n);
  ctx.fillStyle = C.plug;
  ctx.fillRect(x + 1, y + 1, n - 2, n - 2);
  ctx.fillStyle = C.plugPin;
  for (let k = -1; k <= 1; k++) {
    const px = d.x !== 0 ? x + (d.x > 0 ? n - 2 : 0) : x + n / 2 - 1 + k * 2;
    const py = d.y !== 0 ? y + (d.y > 0 ? n - 2 : 0) : y + n / 2 - 1 + k * 2;
    ctx.fillRect(px, py, d.x !== 0 ? 2 : 1, d.y !== 0 ? 2 : 1);
  }
}

// ── Bug Squash ───────────────────────────────────────────────

const MON_Y = GAME_HEADER_H;

/** Monitor i's box (frame + stand) in logical px. */
export const monitorAt = (i: number) => ({
  x: GAME_BUGS_GAP + (i % 3) * (GAME_BUGS_MON_W + GAME_BUGS_GAP),
  y: MON_Y + Math.floor(i / 3) * (GAME_BUGS_MON_H + GAME_BUGS_GAP),
});
/** Centre of monitor i's screen. */
export const monitorCentre = (i: number): [number, number] => {
  const { x, y } = monitorAt(i);
  return [x + GAME_BUGS_MON_W / 2, y + GAME_BUGS_FRAME_H / 2];
};
/** Key hint per monitor (numpad digit and letter key). */
const KEY_HINT = ['7·Q', '8·W', '9·E', '4·A', '5·S', '6·D', '1·Z', '2·X', '3·C'];
const KIND_COLOR: Record<BugKind, string> = {
  bug: C.bug,
  glitch: C.glitch,
  patch: C.patch,
  clock: C.clock,
};

/** Fixed fake code lines per monitor (lengths), so each screen looks different. */
const CODE = Array.from({ length: BUGS_MONITORS }, (_, i) =>
  Array.from({ length: 6 }, (_, r) => 8 + ((i * 7 + r * 13) % 30)),
);

export function drawBugs(ctx: Ctx, s: BugsState, now: number): void {
  text(ctx, t('game.score'), 6, 3, C.muted);
  text(ctx, fmt(s.score), 6, 10, C.text, GAME_FONT_NUM);
  // combo meter
  const mult = bugsMult(s.streak);
  const mid = GAME_VIEW_W / 2;
  text(ctx, `×${mult}`, mid - 14, 6, mult > 1 ? C.accent : C.muted, GAME_FONT_NUM, 'right');
  const pips = s.streak % 5;
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = mult >= 4 ? C.accent : i < pips ? C.accent : C.panelEdge;
    ctx.fillRect(mid - 10 + i * 6, 9, 4, 5);
  }
  // time bar
  const secs = Math.ceil(s.timeLeft / 1000);
  const tw = 60;
  const tx = GAME_VIEW_W - 6 - tw;
  text(ctx, `${secs}s`, tx - 4, 7, secs <= 10 ? C.bad : C.text, GAME_FONT_BOLD, 'right');
  ctx.fillStyle = C.panelEdge;
  ctx.fillRect(tx, 8, tw, 6);
  ctx.fillStyle = secs <= 10 ? C.bad : C.good;
  ctx.fillRect(
    tx + 1,
    9,
    Math.max(0, Math.min(tw - 2, Math.round(((tw - 2) * s.timeLeft) / GAME_BUGS_ROUND_MS))),
    4,
  );
  const frame = Math.floor(now / 140);
  s.mons.forEach((m, i) => {
    const { x, y } = monitorAt(i);
    const w = GAME_BUGS_MON_W;
    const fh = GAME_BUGS_FRAME_H;
    // stand
    ctx.fillStyle = C.monitorDark;
    ctx.fillRect(x + w / 2 - 5, y + fh, 10, 3);
    ctx.fillRect(x + w / 2 - 14, y + fh + 3, 28, 2);
    // frame (flashes on a whack)
    const flash = m.flash > 0 ? (m.hit ? C.good : C.bad) : null;
    ctx.fillStyle = flash ?? C.monitor;
    ctx.fillRect(x, y, w, fh);
    ctx.fillStyle = flash ?? C.monitorLight;
    ctx.fillRect(x, y, w, 1);
    ctx.fillStyle = C.screen;
    ctx.fillRect(x + 3, y + 3, w - 6, fh - 9);
    ctx.fillStyle = i % 2 ? C.screenCode : C.screenCode2;
    CODE[i].forEach((len, r) => ctx.fillRect(x + 6 + (r % 3) * 3, y + 6 + r * 5, len, 2));
    text(ctx, KEY_HINT[i], x + w - 4, y + fh - 5, C.muted, GAME_FONT_TINY, 'right');
    if (!m.kind) return;
    // the thing on screen, bobbing; a glitch tears sideways
    const px = 3;
    const sx = x + (w - SPRITE_W * px) / 2;
    const sy = y + 3 + (fh - 9 - SPRITE_H * px) / 2 - 1 + (frame % 2);
    const tear =
      m.kind === 'glitch'
        ? (r: number) => ((frame + r) % 5 === 0 ? ((r + frame) % 3) - 1 : 0)
        : undefined;
    drawSprite(ctx, spriteOf(m.kind, frame), m.kind, sx, sy, px, tear);
    // time left on screen
    const bw = w - 10;
    ctx.fillStyle = C.panelEdge;
    ctx.fillRect(x + 5, y + fh - 10, bw, 2);
    ctx.fillStyle = KIND_COLOR[m.kind];
    ctx.fillRect(x + 5, y + fh - 10, Math.round((bw * m.ms) / m.show), 2);
  });
}

// ── Shared ───────────────────────────────────────────────────

export function drawOverlay(ctx: Ctx, title: string, lines: string[], titleColor = C.text): void {
  ctx.fillStyle = C.overlay;
  ctx.fillRect(0, 0, GAME_VIEW_W, GAME_VIEW_H);
  const mid = GAME_VIEW_W / 2;
  const y = GAME_VIEW_H / 2 - 24;
  text(ctx, title, mid, y, titleColor, GAME_FONT_BIG, 'center');
  lines.forEach((l, i) =>
    text(ctx, l, mid, y + 28 + i * 12, i === 0 ? C.text : C.muted, GAME_FONT_BOLD, 'center'),
  );
}
