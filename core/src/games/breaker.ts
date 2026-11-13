// Breaker (brick breaker): slide the paddle (held ← / →), keep the ball(s) up and break
// every firewall brick. Tough bricks take two hits, steel never breaks; broken bricks
// may drop a power-up (wide paddle, multi-ball, slow ball, extra life). A level cleared
// brings the next, faster one. Integer fixed point (× GAME_FP) only: replays are exact.
import {
  GAME_BREAKER_AUTO_LAUNCH_MS,
  GAME_BREAKER_BALL,
  GAME_BREAKER_BALL_SPEED,
  GAME_BREAKER_BALL_SPEED_MAX,
  GAME_BREAKER_BALL_SPEED_STEP,
  GAME_BREAKER_BRICK_GAP,
  GAME_BREAKER_BRICK_H,
  GAME_BREAKER_BRICK_POINTS,
  GAME_BREAKER_BRICK_TOP,
  GAME_BREAKER_BRICK_W,
  GAME_BREAKER_COLS,
  GAME_BREAKER_COMBO_POINTS,
  GAME_BREAKER_DROP_PCT,
  GAME_BREAKER_DROP_SPEED,
  GAME_BREAKER_H,
  GAME_BREAKER_LEVEL_BONUS,
  GAME_BREAKER_LIVES,
  GAME_BREAKER_LIVES_MAX,
  GAME_BREAKER_PADDLE_H,
  GAME_BREAKER_PADDLE_SPEED,
  GAME_BREAKER_PADDLE_W,
  GAME_BREAKER_PADDLE_WIDE_W,
  GAME_BREAKER_PADDLE_Y,
  GAME_BREAKER_POWER_MS,
  GAME_BREAKER_ROWS,
  GAME_BREAKER_SLOW_SPEED,
  GAME_BREAKER_STEEL_FROM,
  GAME_BREAKER_STEEL_PCT,
  GAME_BREAKER_TOUGH_PCT,
  GAME_BREAKER_TOUGH_STEP_PCT,
  GAME_BREAKER_W,
  GAME_FP,
} from '../constants.js';
import { type Fx, pushFx, type Rng } from './fx.js';

/** Brick cells: EMPTY, NORMAL, TOUGH (2 hits left), CRACKED (tough, 1 left), STEEL. */
export const BRICK = { empty: 0, normal: 1, tough: 2, cracked: 3, steel: 9 } as const;
export const POWERS = ['wide', 'multi', 'slow', 'life'] as const;
export type Power = (typeof POWERS)[number];
/** Inputs: hold / release ← and →, launch. */
export const BREAKER_ACT = { leftDown: 0, leftUp: 1, rightDown: 2, rightUp: 3, launch: 4 } as const;

/** Leaving the paddle: 8 directions (× 1000) from its left end to its right end. */
const ANGLES: readonly (readonly [number, number])[] = [
  [-866, -500],
  [-707, -707],
  [-500, -866],
  [-259, -966],
  [259, -966],
  [500, -866],
  [707, -707],
  [866, -500],
];
const MAX_BALLS = 6;

export interface Ball {
  /** Top-left, × GAME_FP. */
  x: number;
  y: number;
  vx: number;
  vy: number;
}
export interface Drop {
  x: number;
  y: number;
  power: Power;
}
export interface BreakerState {
  /** Row-major GAME_BREAKER_COLS × ROWS of BRICK values. */
  bricks: number[];
  /** Paddle left edge, × GAME_FP. */
  paddle: number;
  left: boolean;
  right: boolean;
  balls: Ball[];
  /** The ball waits on the paddle (ms waited). −1 = in play. */
  stuck: number;
  drops: Drop[];
  wideMs: number;
  slowMs: number;
  lives: number;
  level: number;
  /** Bricks broken since the paddle last touched a ball. */
  combo: number;
  score: number;
  over: boolean;
  rng: Rng;
  fx: Fx[];
}

const FP = GAME_FP;
const BALL = GAME_BREAKER_BALL * FP;
const PADDLE_Y = GAME_BREAKER_PADDLE_Y * FP;

export const paddleWidth = (s: BreakerState): number =>
  s.wideMs > 0 ? GAME_BREAKER_PADDLE_WIDE_W : GAME_BREAKER_PADDLE_W;

/** Brick i's box in px. */
export function brickBox(i: number): { x: number; y: number; w: number; h: number } {
  const col = i % GAME_BREAKER_COLS;
  const row = Math.floor(i / GAME_BREAKER_COLS);
  return {
    x: 1 + col * (GAME_BREAKER_BRICK_W + GAME_BREAKER_BRICK_GAP),
    y: GAME_BREAKER_BRICK_TOP + row * (GAME_BREAKER_BRICK_H + GAME_BREAKER_BRICK_GAP),
    w: GAME_BREAKER_BRICK_W,
    h: GAME_BREAKER_BRICK_H,
  };
}

const pct = (s: BreakerState, p: number): boolean => Math.floor(s.rng() * 100) < p;
const breakable = (b: number): boolean =>
  b === BRICK.normal || b === BRICK.tough || b === BRICK.cracked;

/** Ball speed (× GAME_FP per tick) of this level, or slowed. */
export const ballSpeed = (s: BreakerState): number =>
  s.slowMs > 0
    ? GAME_BREAKER_SLOW_SPEED
    : Math.min(
        GAME_BREAKER_BALL_SPEED_MAX,
        GAME_BREAKER_BALL_SPEED + (s.level - 1) * GAME_BREAKER_BALL_SPEED_STEP,
      );

/** Level layouts cycle: full wall, checker, pyramid, two towers. */
function buildLevel(s: BreakerState): void {
  const pattern = (s.level - 1) % 4;
  const tough = Math.min(50, GAME_BREAKER_TOUGH_PCT + (s.level - 1) * GAME_BREAKER_TOUGH_STEP_PCT);
  const mid = (GAME_BREAKER_COLS - 1) / 2;
  s.bricks = [];
  for (let row = 0; row < GAME_BREAKER_ROWS; row++)
    for (let col = 0; col < GAME_BREAKER_COLS; col++) {
      const off =
        (pattern === 1 && (row + col) % 3 === 0) ||
        (pattern === 2 && Math.abs(col - mid) > row + 0.5) ||
        (pattern === 3 && (col === 4 || col === 5 || row === 3));
      let b: number = off ? BRICK.empty : BRICK.normal;
      if (b && row < GAME_BREAKER_ROWS - 1) {
        if (s.level >= GAME_BREAKER_STEEL_FROM && pct(s, GAME_BREAKER_STEEL_PCT)) b = BRICK.steel;
        else if (pct(s, tough)) b = BRICK.tough;
      }
      s.bricks.push(b);
    }
}

function stick(s: BreakerState): void {
  s.stuck = 0;
  s.balls = [{ x: 0, y: PADDLE_Y - BALL, vx: 0, vy: 0 }];
  follow(s);
}

/** A waiting ball rides on the paddle's middle. */
function follow(s: BreakerState): void {
  const b = s.balls[0];
  if (s.stuck < 0 || !b) return;
  b.x = s.paddle + Math.trunc((paddleWidth(s) * FP - BALL) / 2);
}

export function newBreaker(rng: Rng = Math.random): BreakerState {
  const s: BreakerState = {
    bricks: [],
    paddle: Math.trunc(((GAME_BREAKER_W - GAME_BREAKER_PADDLE_W) * FP) / 2),
    left: false,
    right: false,
    balls: [],
    stuck: 0,
    drops: [],
    wideMs: 0,
    slowMs: 0,
    lives: GAME_BREAKER_LIVES,
    level: 1,
    combo: 0,
    score: 0,
    over: false,
    rng,
    fx: [],
  };
  buildLevel(s);
  stick(s);
  return s;
}

function aim(b: Ball, section: number, speed: number): void {
  const [ax, ay] = ANGLES[Math.max(0, Math.min(ANGLES.length - 1, section))];
  b.vx = Math.trunc((ax * speed) / 1000);
  b.vy = Math.trunc((ay * speed) / 1000);
}

function launch(s: BreakerState): void {
  if (s.stuck < 0) return;
  s.stuck = -1;
  aim(s.balls[0], s.right ? 5 : s.left ? 2 : 4, ballSpeed(s));
  pushFx(s.fx, { k: 'launch', x: 0, y: 0, n: 0 });
}

export function breakerAct(s: BreakerState, a: number): void {
  if (s.over) return;
  if (a === BREAKER_ACT.leftDown) s.left = true;
  else if (a === BREAKER_ACT.leftUp) s.left = false;
  else if (a === BREAKER_ACT.rightDown) s.right = true;
  else if (a === BREAKER_ACT.rightUp) s.right = false;
  else if (a === BREAKER_ACT.launch) launch(s);
}

/** The bricks the ball box overlaps (indices). */
function hits(s: BreakerState, b: Ball): number[] {
  const out: number[] = [];
  s.bricks.forEach((v, i) => {
    if (!v) return;
    const r = brickBox(i);
    if (
      b.x < (r.x + r.w) * FP &&
      b.x + BALL > r.x * FP &&
      b.y < (r.y + r.h) * FP &&
      b.y + BALL > r.y * FP
    )
      out.push(i);
  });
  return out;
}

function hitBrick(s: BreakerState, i: number): void {
  const v = s.bricks[i];
  const r = brickBox(i);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const row = Math.floor(i / GAME_BREAKER_COLS);
  if (v === BRICK.steel) return pushFx(s.fx, { k: 'steel', x: cx, y: cy, n: 0 });
  if (v === BRICK.tough) {
    s.bricks[i] = BRICK.cracked;
    return pushFx(s.fx, { k: 'crack', x: cx, y: cy, n: 0 });
  }
  s.bricks[i] = BRICK.empty;
  s.combo++;
  const pts =
    GAME_BREAKER_BRICK_POINTS * (v === BRICK.cracked ? 2 : 1) +
    GAME_BREAKER_COMBO_POINTS * (s.combo - 1);
  s.score += pts;
  pushFx(s.fx, { k: 'brick', x: cx, y: cy, n: pts, rows: [row] });
  if (pct(s, GAME_BREAKER_DROP_PCT)) {
    const power = POWERS[Math.floor(s.rng() * POWERS.length) % POWERS.length];
    s.drops.push({ x: (cx - 5) * FP, y: r.y * FP, power });
  }
}

/** Move one ball one tick, axis by axis (no tunnelling: a step is < a brick). false = lost. */
function moveBall(s: BreakerState, b: Ball): boolean {
  const W = GAME_BREAKER_W * FP;
  b.x += b.vx;
  if (b.x < 0 || b.x + BALL > W) {
    b.x = Math.max(0, Math.min(W - BALL, b.x));
    b.vx = -b.vx;
    pushFx(s.fx, { k: 'bounce', x: 0, y: 0, n: 0 });
  }
  let hit = hits(s, b);
  if (hit.length) {
    b.x -= b.vx;
    b.vx = -b.vx;
    hitBrick(s, hit[0]);
  }
  const bottom = b.y + BALL;
  b.y += b.vy;
  if (b.y < 0) {
    b.y = 0;
    b.vy = -b.vy;
    pushFx(s.fx, { k: 'bounce', x: 0, y: 0, n: 0 });
  }
  hit = hits(s, b);
  if (hit.length) {
    b.y -= b.vy;
    b.vy = -b.vy;
    hitBrick(s, hit[0]);
  }
  const pw = paddleWidth(s) * FP;
  if (
    b.vy > 0 &&
    bottom <= PADDLE_Y &&
    b.y + BALL >= PADDLE_Y &&
    b.x + BALL > s.paddle &&
    b.x < s.paddle + pw
  ) {
    const centre = b.x + BALL / 2 - s.paddle;
    aim(b, Math.floor((centre * ANGLES.length) / pw), ballSpeed(s));
    b.y = PADDLE_Y - BALL;
    s.combo = 0;
    pushFx(s.fx, {
      k: 'paddle',
      x: Math.trunc((b.x + BALL / 2) / FP),
      y: GAME_BREAKER_PADDLE_Y,
      n: 0,
    });
  }
  return b.y < GAME_BREAKER_H * FP;
}

function catchPower(s: BreakerState, d: Drop): void {
  const x = Math.trunc(d.x / FP) + 5;
  pushFx(s.fx, { k: 'power', x, y: GAME_BREAKER_PADDLE_Y, n: POWERS.indexOf(d.power) });
  if (d.power === 'wide') {
    if (s.wideMs <= 0) s.paddle -= ((GAME_BREAKER_PADDLE_WIDE_W - GAME_BREAKER_PADDLE_W) * FP) / 2;
    s.wideMs = GAME_BREAKER_POWER_MS;
  } else if (d.power === 'slow') {
    const from = ballSpeed(s);
    s.slowMs = GAME_BREAKER_POWER_MS;
    for (const b of s.balls) {
      b.vx = Math.trunc((b.vx * GAME_BREAKER_SLOW_SPEED) / from);
      b.vy = Math.trunc((b.vy * GAME_BREAKER_SLOW_SPEED) / from);
    }
  } else if (d.power === 'life') s.lives = Math.min(GAME_BREAKER_LIVES_MAX, s.lives + 1);
  else if (s.stuck < 0) {
    const src = s.balls[0];
    for (const section of [1, 6]) {
      if (!src || s.balls.length >= MAX_BALLS) break;
      const b = { ...src };
      aim(b, section, ballSpeed(s));
      s.balls.push(b);
    }
  }
}

function clampPaddle(s: BreakerState): void {
  s.paddle = Math.max(0, Math.min((GAME_BREAKER_W - paddleWidth(s)) * FP, s.paddle));
}

export function breakerStep(s: BreakerState, dtMs: number): void {
  if (s.over) return;
  if (s.wideMs > 0 && (s.wideMs -= dtMs) <= 0)
    s.paddle += ((GAME_BREAKER_PADDLE_WIDE_W - GAME_BREAKER_PADDLE_W) * FP) / 2;
  if (s.slowMs > 0) s.slowMs -= dtMs;
  s.paddle += ((s.right ? 1 : 0) - (s.left ? 1 : 0)) * GAME_BREAKER_PADDLE_SPEED;
  clampPaddle(s);
  if (s.stuck >= 0) {
    follow(s);
    if ((s.stuck += dtMs) >= GAME_BREAKER_AUTO_LAUNCH_MS) launch(s);
    return;
  }
  s.balls = s.balls.filter((b) => moveBall(s, b));
  const pw = paddleWidth(s) * FP;
  s.drops = s.drops.filter((d) => {
    d.y += GAME_BREAKER_DROP_SPEED;
    const caught =
      d.y + 6 * FP >= PADDLE_Y &&
      d.y <= PADDLE_Y + GAME_BREAKER_PADDLE_H * FP &&
      d.x + 10 * FP > s.paddle &&
      d.x < s.paddle + pw;
    if (caught) catchPower(s, d);
    return !caught && d.y < GAME_BREAKER_H * FP;
  });
  if (!s.bricks.some(breakable)) {
    const bonus = GAME_BREAKER_LEVEL_BONUS * s.level;
    s.score += bonus;
    s.level++;
    pushFx(s.fx, { k: 'level', x: GAME_BREAKER_W / 2, y: GAME_BREAKER_H / 2, n: s.level });
    buildLevel(s);
    s.drops = [];
    s.combo = 0;
    return stick(s);
  }
  if (s.balls.length > 0) return;
  s.lives--;
  s.drops = [];
  s.wideMs = 0;
  s.slowMs = 0;
  s.combo = 0;
  clampPaddle(s);
  if (s.lives <= 0) {
    s.over = true;
    pushFx(s.fx, { k: 'over', x: GAME_BREAKER_W / 2, y: GAME_BREAKER_H / 2, n: s.score });
    return;
  }
  pushFx(s.fx, { k: 'lose', x: GAME_BREAKER_W / 2, y: GAME_BREAKER_H, n: s.lives });
  stick(s);
}
