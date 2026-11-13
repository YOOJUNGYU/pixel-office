// One arcade game on a pixel-crisp canvas: logic from core/src/games (fixed ticks,
// recorded for the relay's replay), drawing in draw*.ts, effects + sound in effects.ts.
// Keys are taken in the CAPTURE phase so the office's arrow-key avatar walking never
// sees them. The canvas scale is the largest whole number that fits the window.
import { useEffect, useRef, useState } from 'react';

import { GAME_TICK_MS } from '../../../../core/src/constants.js';
import { BREAKER_ACT } from '../../../../core/src/games/breaker.js';
import { BUGS_MONITORS, bugsKeyIndex } from '../../../../core/src/games/bugs.js';
import type { Fx } from '../../../../core/src/games/fx.js';
import { MERGE_ACT } from '../../../../core/src/games/merge.js';
import { newRun, Recorder, type Run, tick } from '../../../../core/src/games/replay.js';
import type { GameId } from '../../../../core/src/lan.js';
import type { ArcadeTicket } from '../../../../core/src/messages.js';
import {
  GAME_BUGS_FRAME_H,
  GAME_BUGS_MON_W,
  GAME_COLORS as C,
  GAME_COUNTDOWN_MS,
  GAME_FIT_SPARE_H,
  GAME_FIT_SPARE_W,
  GAME_FONT_HUGE,
  GAME_MAX_STEP_MS,
  GAME_SCALE_MAX,
  GAME_SCALE_MIN,
  GAME_SCANLINE_ALPHA,
  GAME_VIEW_H,
  GAME_VIEW_W,
} from '../../constants.js';
import { t } from '../../i18n.js';
import {
  cableAt,
  drawBugs,
  drawCable,
  drawOverlay,
  monitorAt,
  monitorCentre,
  text,
} from './draw.js';
import { breakerAt, brickColor, drawBreaker } from './drawBreaker.js';
import { drawDrone, droneAt } from './drawDrone.js';
import { drawMerge, mergeAt } from './drawMerge.js';
import { Effects, playSfx } from './effects.js';

/** A finished run: its ticket (null = unranked, the relay was unreachable) and inputs. */
export interface FinishedRun {
  ticket: ArcadeTicket | null;
  inputs: number[];
  score: number;
}

/** Direction keys (arrows and WASD) → 0 up, 1 down, 2 left, 3 right (cable and merge use this order). */
const DIR_KEYS: Record<string, number> = {
  ArrowUp: 0,
  w: 0,
  ArrowDown: 1,
  s: 1,
  ArrowLeft: 2,
  a: 2,
  ArrowRight: 3,
  d: 3,
};
/** Letter keys for the bugs monitors, numpad layout (q w e = top row). */
const BUG_LETTERS = 'qweasdzxc';
const lower = (e: KeyboardEvent): string => (e.key.length === 1 ? e.key.toLowerCase() : e.key);

/** The run input a key press means in `game` (−1 = none). */
function downAction(game: GameId, e: KeyboardEvent): number {
  const k = lower(e);
  const dir = DIR_KEYS[k] ?? -1;
  switch (game) {
    case 'cable':
      return dir;
    case 'merge':
      return k === 'q' ? MERGE_ACT.end : dir;
    case 'bugs':
      if (/^[1-9]$/.test(k)) return bugsKeyIndex(Number(k));
      return BUG_LETTERS.indexOf(k);
    case 'breaker':
      if (dir === 2) return BREAKER_ACT.leftDown;
      if (dir === 3) return BREAKER_ACT.rightDown;
      return k === ' ' || dir === 0 ? BREAKER_ACT.launch : -1;
    case 'drone':
      return k === ' ' || dir === 0 ? 0 : -1;
  }
}

/** The run input a key release means (breaker's held paddle keys only). */
function upAction(game: GameId, e: KeyboardEvent): number {
  if (game !== 'breaker') return -1;
  const dir = DIR_KEYS[lower(e)];
  return dir === 2 ? BREAKER_ACT.leftUp : dir === 3 ? BREAKER_ACT.rightUp : -1;
}

/** Largest whole scale that leaves room for the panel's other columns. */
function fitScale(): number {
  const s = Math.min(
    Math.floor((window.innerWidth - GAME_FIT_SPARE_W) / GAME_VIEW_W),
    Math.floor((window.innerHeight - GAME_FIT_SPARE_H) / GAME_VIEW_H),
  );
  return Math.max(GAME_SCALE_MIN, Math.min(GAME_SCALE_MAX, s));
}

const randomSeed = (): number => Math.floor(Math.random() * 2 ** 32);

/** Where an effect happens on screen (logical px). */
function fxAt(run: Run, f: Fx): [number, number] {
  switch (run.game) {
    case 'cable':
      return cableAt(f);
    case 'bugs':
      return monitorCentre(f.x);
    case 'breaker':
      return breakerAt(f.x, f.y);
    case 'drone':
      return droneAt(f.x, f.y);
    case 'merge':
      return mergeAt(f.x);
  }
}

const FX_COLOR: Record<string, string> = {
  eat: C.packet,
  gold: C.gold,
  wall: C.wall,
  bug: C.bug,
  glitch: C.glitch,
  clock: C.clock,
  patch: C.bad,
  miss: C.bad,
  packet: C.packet,
};

/** Turn one game event into particles, floating points and shake (the caller plays its sound). */
function visual(fx: Effects, run: Run, f: Fx): void {
  const [x, y] = fxAt(run, f);
  const color = FX_COLOR[f.k] ?? C.accent;
  switch (f.k) {
    case 'eat':
    case 'gold':
    case 'bug':
    case 'glitch':
    case 'clock':
    case 'packet':
      fx.burst(x, y, color, f.k === 'eat' ? 8 : 16);
      fx.float(x, y - 6, f.k === 'clock' ? `+${f.n / 1000}s` : `+${f.n}`, color);
      return;
    case 'pass':
      fx.float(x + 6, y - 6, `+${f.n}`, C.text);
      return;
    case 'patch':
    case 'miss':
      if (f.n < 0) fx.float(x, y - 6, String(f.n), C.bad);
      if (f.k === 'patch') fx.shake(2);
      return;
    case 'wall':
      fx.burst(x, y, color, 10, 0.05);
      return;
    case 'brick': {
      const c = brickColor(f.rows?.[0] ?? 0);
      fx.burst(x, y, c, 10, 0.06);
      if (f.n > 10) fx.float(x, y - 4, `+${f.n}`, c);
      return;
    }
    case 'crack':
    case 'steel':
      fx.burst(x, y, C.steelLight, 4, 0.04);
      return;
    case 'power':
      fx.burst(x, y, C.powers[f.n], 14);
      fx.float(x, y - 8, t(`game.breaker.power.${f.n as 0 | 1 | 2 | 3}`), C.powers[f.n]);
      return;
    case 'level':
      fx.float(x, y, `${t('game.level')} ${f.n}`, C.good);
      fx.shake(2);
      return;
    case 'lose':
      fx.shake(3);
      return;
    case 'flap':
      fx.burst(x + 6, y + 9, C.prop, 3, 0.03);
      return;
    case 'merge':
      fx.float(x, y - 10, `+${f.n}`);
      return;
    case 'big':
      fx.burst(x, y, C.accent, 24);
      fx.shake(2);
      return;
    case 'over':
      if (run.game === 'drone') fx.burst(x, y, C.droneAccent, 24);
      if (run.game !== 'merge') fx.shake(3);
      return;
  }
}

export function GameCanvas(props: {
  game: GameId;
  /** My best on the hall of fame (0 = none). */
  best: number;
  muted: boolean;
  onToggleMute: () => void;
  /** A ticket for the next run (null = play unranked). */
  requestTicket: () => Promise<ArcadeTicket | null>;
  onGameOver: (run: FinishedRun) => void;
  onQuit: () => void;
}) {
  const { game } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cb = useRef(props);
  cb.current = props;
  const [scale, setScale] = useState(fitScale);
  useEffect(() => {
    const on = () => setScale(fitScale());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    // Fixed GAME_TICK_MS steps (the relay replays the same ticks); inputs go through the Recorder.
    let rec: Recorder | null = null;
    let ticket: ArcadeTicket | null = null;
    let paused = false;
    let reported = false;
    let countdown = 0;
    /** The countdown number last sounded (−1 = none yet). */
    let beat = -1;
    let acc = 0;
    let last = performance.now();
    let raf = 0;
    let alive = true;
    let startBest = 0;
    /** merge: the last move's seq and when it was seen (slide animation). */
    let mergeSeq = -1;
    let mergeSince = 0;
    const fx = new Effects();
    const sound = (k: string) => {
      if (!cb.current.muted) playSfx(k);
    };

    const start = () => {
      rec = null;
      reported = false;
      paused = false;
      mergeSeq = -1;
      fx.clear();
      startBest = cb.current.best;
      void cb.current.requestTicket().then((tk) => {
        if (!alive) return;
        ticket = tk;
        rec = new Recorder(newRun(game, tk?.seed ?? randomSeed()));
        acc = 0;
        countdown = game === 'merge' ? 0 : GAME_COUNTDOWN_MS;
        beat = -1;
      });
    };
    start();

    const drain = (run: Run) => {
      const q = run.s.fx;
      for (const f of q.splice(0, q.length)) {
        sound(f.k);
        visual(fx, run, f);
      }
    };

    const playing = () => !!rec && countdown <= 0 && !paused && !rec.run.s.over;

    const frame = (now: number) => {
      const dt = Math.min(GAME_MAX_STEP_MS, now - last);
      last = now;
      raf = requestAnimationFrame(frame);
      const sc = scaleRef.current;
      ctx.setTransform(sc, 0, 0, sc, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.textBaseline = 'top';
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, GAME_VIEW_W, GAME_VIEW_H);
      if (!rec) {
        drawOverlay(ctx, t('game.ready'), []);
        return scanlines(ctx, sc);
      }
      const run = rec.run;
      if (countdown > 0 && !paused) {
        countdown -= dt;
        const n = Math.ceil(Math.max(0, countdown) / (GAME_COUNTDOWN_MS / 3));
        if (n !== beat) sound(n > 0 ? 'count' : 'go');
        beat = n;
      } else if (!paused && !run.s.over) {
        acc += dt;
        while (acc >= GAME_TICK_MS && !run.s.over) {
          acc -= GAME_TICK_MS;
          tick(run);
        }
      }
      drain(run);
      fx.update(dt);
      if (run.s.over && !reported) {
        reported = true;
        if (run.s.score > 0)
          cb.current.onGameOver({ ticket, inputs: rec.inputs, score: run.s.score });
      }

      const [ox, oy] = fx.offset();
      ctx.save();
      ctx.translate(ox, oy);
      const best = cb.current.best;
      switch (run.game) {
        case 'cable':
          drawCable(ctx, run.s, best, now);
          break;
        case 'bugs':
          drawBugs(ctx, run.s, now);
          break;
        case 'breaker':
          drawBreaker(ctx, run.s, best, now);
          break;
        case 'drone':
          drawDrone(ctx, run.s, best, now);
          break;
        case 'merge':
          if (run.s.last.seq !== mergeSeq) {
            mergeSeq = run.s.last.seq;
            mergeSince = now;
          }
          drawMerge(ctx, run.s, best, now - mergeSince);
          break;
      }
      fx.draw(ctx);
      ctx.restore();

      if (countdown > 0) {
        const n = Math.ceil(countdown / (GAME_COUNTDOWN_MS / 3));
        ctx.fillStyle = C.overlay;
        ctx.fillRect(0, 0, GAME_VIEW_W, GAME_VIEW_H);
        text(
          ctx,
          String(n),
          GAME_VIEW_W / 2,
          GAME_VIEW_H / 2 - 20,
          C.accent,
          GAME_FONT_HUGE,
          'center',
        );
      } else if (run.s.over) {
        const record = run.s.score > startBest && run.s.score > 0;
        drawOverlay(
          ctx,
          record ? t('game.newBest') : t('game.over'),
          [`${t('game.score')} ${run.s.score.toLocaleString()}`, t('game.restart')],
          record ? C.accent : C.text,
        );
      } else if (paused) drawOverlay(ctx, t('game.paused'), [t('game.resume')]);
      scanlines(ctx, sc);
    };
    raf = requestAnimationFrame(frame);

    /** Release breaker's held keys (recorded) so a pause never leaves the paddle sliding. */
    const releaseAll = () => {
      if (rec && game === 'breaker' && !rec.run.s.over) {
        rec.act(BREAKER_ACT.leftUp);
        rec.act(BREAKER_ACT.rightUp);
      }
    };

    const onKey = (e: KeyboardEvent) => {
      const k = lower(e);
      const a = downAction(game, e);
      const used = a >= 0 || k === ' ' || k === 'Enter' || k === 'Escape' || k === 'p' || k === 'm';
      if (!used) return;
      e.preventDefault();
      e.stopPropagation();
      if (k === 'Escape') return cb.current.onQuit();
      if (e.repeat) return;
      if (k === 'm') return cb.current.onToggleMute();
      if (!rec) return;
      if (rec.run.s.over) {
        if (k === ' ' || k === 'Enter') start();
        return;
      }
      if (k === 'p') {
        if (!paused) releaseAll();
        paused = !paused;
        return;
      }
      if (paused) {
        if (k === ' ' || k === 'Enter') paused = false;
        return;
      }
      if (a >= 0 && playing()) rec.act(a);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const a = upAction(game, e);
      if (a >= 0 && rec && !rec.run.s.over) rec.act(a);
    };
    const onBlur = () => {
      releaseAll();
      if (rec && !rec.run.s.over && countdown <= 0) paused = true;
    };

    const onPointer = (e: PointerEvent) => {
      if (!rec || !playing()) return;
      if (game === 'drone') return rec.act(0);
      if (game !== 'bugs') return;
      const r = canvas.getBoundingClientRect();
      const lx = ((e.clientX - r.left) / r.width) * GAME_VIEW_W;
      const ly = ((e.clientY - r.top) / r.height) * GAME_VIEW_H;
      for (let i = 0; i < BUGS_MONITORS; i++) {
        const { x, y } = monitorAt(i);
        if (lx >= x && lx < x + GAME_BUGS_MON_W && ly >= y && ly < y + GAME_BUGS_FRAME_H)
          return rec.act(i);
      }
    };

    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', onBlur);
    canvas.addEventListener('pointerdown', onPointer);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('pointerdown', onPointer);
    };
  }, [game]);

  return (
    <canvas
      ref={canvasRef}
      width={GAME_VIEW_W * scale}
      height={GAME_VIEW_H * scale}
      style={{
        display: 'block',
        imageRendering: 'pixelated',
        border: '2px solid var(--color-border)',
        cursor: game === 'bugs' ? 'crosshair' : game === 'drone' ? 'pointer' : undefined,
      }}
    />
  );
}

/** A faint CRT line every `sc` device px (drawn in device space). */
function scanlines(ctx: CanvasRenderingContext2D, sc: number): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = GAME_SCANLINE_ALPHA;
  ctx.fillStyle = C.scanline;
  const h = GAME_VIEW_H * sc;
  for (let y = sc - 1; y < h; y += sc) ctx.fillRect(0, y, GAME_VIEW_W * sc, 1);
  ctx.globalAlpha = 1;
}
