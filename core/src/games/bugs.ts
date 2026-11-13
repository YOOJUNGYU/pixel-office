// Bug Squash: things pop up on 3 × 3 monitors for a shrinking time. Squash bugs (red)
// and glitches (fast, worth more); leave patches (green) alone; a clock adds time.
// Hits in a row raise a multiplier; a miss, an escaped bug or a squashed patch resets
// it. 45 s round, more at once as it goes on. Pure logic (no DOM).
import {
  GAME_BUGS_ACTIVE_MAX,
  GAME_BUGS_ACTIVE_START,
  GAME_BUGS_ACTIVE_STEP_MS,
  GAME_BUGS_CLOCK_MS,
  GAME_BUGS_CLOCK_PCT,
  GAME_BUGS_FLASH_MS,
  GAME_BUGS_GAP_MIN_MS,
  GAME_BUGS_GAP_START_MS,
  GAME_BUGS_GLITCH_PCT,
  GAME_BUGS_GLITCH_POINTS,
  GAME_BUGS_GLITCH_SHOW_PCT,
  GAME_BUGS_MISS,
  GAME_BUGS_MULT_MAX,
  GAME_BUGS_PATCH_PCT,
  GAME_BUGS_PATCH_PENALTY,
  GAME_BUGS_POINTS,
  GAME_BUGS_RETRY_MS,
  GAME_BUGS_ROUND_MS,
  GAME_BUGS_SHOW_MIN_MS,
  GAME_BUGS_SHOW_START_MS,
  GAME_BUGS_STREAK_STEP,
} from '../constants.js';
import { type Fx, pushFx, type Rng } from './fx.js';

export const BUGS_MONITORS = 9;
export const BUG_KINDS = ['bug', 'glitch', 'patch', 'clock'] as const;
export type BugKind = (typeof BUG_KINDS)[number];

export interface Monitor {
  kind: BugKind | null;
  /** ms it stays; `show` = its full time (for the page's countdown ring). */
  ms: number;
  show: number;
  /** Feedback flash, ms left; hit = good. */
  flash: number;
  hit: boolean;
}

export interface BugsState {
  timeLeft: number;
  /** ms played (drives difficulty; the clock bonus does not rewind it). */
  elapsed: number;
  mons: Monitor[];
  /** ms until the next spawn. */
  wait: number;
  streak: number;
  best: number;
  score: number;
  over: boolean;
  rng: Rng;
  fx: Fx[];
}

export const newBugs = (rng: Rng = Math.random): BugsState => ({
  timeLeft: GAME_BUGS_ROUND_MS,
  elapsed: 0,
  mons: Array.from({ length: BUGS_MONITORS }, () => ({
    kind: null,
    ms: 0,
    show: 0,
    flash: 0,
    hit: false,
  })),
  wait: GAME_BUGS_GAP_START_MS,
  streak: 0,
  best: 0,
  score: 0,
  over: false,
  rng,
  fx: [],
});

/** Digit 1–9 → monitor index in numpad layout (7 8 9 = top row). */
export const bugsKeyIndex = (digit: number): number =>
  (2 - Math.floor((digit - 1) / 3)) * 3 + ((digit - 1) % 3);

/** start → min linearly over the round (whole ms). */
const ease = (s: BugsState, start: number, min: number): number =>
  start -
  Math.round(((start - min) * Math.min(s.elapsed, GAME_BUGS_ROUND_MS)) / GAME_BUGS_ROUND_MS);

export const bugsMult = (streak: number): number =>
  Math.min(GAME_BUGS_MULT_MAX, 1 + Math.floor(streak / GAME_BUGS_STREAK_STEP));

function pickKind(r: number): BugKind {
  const pct = Math.floor(r * 100);
  if (pct < GAME_BUGS_GLITCH_PCT) return 'glitch';
  if (pct < GAME_BUGS_GLITCH_PCT + GAME_BUGS_PATCH_PCT) return 'patch';
  if (pct < GAME_BUGS_GLITCH_PCT + GAME_BUGS_PATCH_PCT + GAME_BUGS_CLOCK_PCT) return 'clock';
  return 'bug';
}

/** Puts something on a free monitor; false = the screen is full for now. */
function spawn(s: BugsState): boolean {
  const active = s.mons.filter((m) => m.kind).length;
  const cap = Math.min(
    GAME_BUGS_ACTIVE_MAX,
    GAME_BUGS_ACTIVE_START + Math.floor(s.elapsed / GAME_BUGS_ACTIVE_STEP_MS),
  );
  if (active >= cap) return false;
  const free = s.mons.flatMap((m, i) => (m.kind || m.flash > 0 ? [] : [i]));
  if (!free.length) return false;
  const i = free[Math.floor(s.rng() * free.length) % free.length];
  const kind = pickKind(s.rng());
  let show = ease(s, GAME_BUGS_SHOW_START_MS, GAME_BUGS_SHOW_MIN_MS);
  if (kind === 'glitch') show = Math.round((show * GAME_BUGS_GLITCH_SHOW_PCT) / 100);
  s.mons[i] = { kind, ms: show, show, flash: 0, hit: false };
  pushFx(s.fx, { k: 'pop', x: i, y: 0, n: 0 });
  return true;
}

export function bugsStep(s: BugsState, dtMs: number): void {
  if (s.over) return;
  s.elapsed += dtMs;
  s.timeLeft -= dtMs;
  if (s.timeLeft <= 0) {
    s.timeLeft = 0;
    s.over = true;
    for (const m of s.mons) m.kind = null;
    pushFx(s.fx, { k: 'over', x: 0, y: 0, n: s.score });
    return;
  }
  s.mons.forEach((m, i) => {
    if (m.flash > 0) m.flash = Math.max(0, m.flash - dtMs);
    if (!m.kind || (m.ms -= dtMs) > 0) return;
    // Ran out: a bug or glitch got away (breaks the streak); a patch or clock just leaves.
    if (m.kind === 'bug' || m.kind === 'glitch') {
      s.streak = 0;
      pushFx(s.fx, { k: 'escape', x: i, y: 0, n: 0 });
    }
    m.kind = null;
  });
  s.wait -= dtMs;
  if (s.wait > 0) return;
  s.wait = spawn(s) ? ease(s, GAME_BUGS_GAP_START_MS, GAME_BUGS_GAP_MIN_MS) : GAME_BUGS_RETRY_MS;
}

export function bugsWhack(s: BugsState, i: number): void {
  if (s.over || i < 0 || i >= BUGS_MONITORS) return;
  const m = s.mons[i];
  const kind = m.kind;
  m.kind = null;
  m.flash = GAME_BUGS_FLASH_MS;
  if (kind === 'bug' || kind === 'glitch') {
    s.streak++;
    s.best = Math.max(s.best, s.streak);
    const pts = (kind === 'bug' ? GAME_BUGS_POINTS : GAME_BUGS_GLITCH_POINTS) * bugsMult(s.streak);
    s.score += pts;
    m.hit = true;
    pushFx(s.fx, { k: kind, x: i, y: 0, n: pts });
  } else if (kind === 'clock') {
    s.timeLeft += GAME_BUGS_CLOCK_MS;
    m.hit = true;
    pushFx(s.fx, { k: 'clock', x: i, y: 0, n: GAME_BUGS_CLOCK_MS });
  } else {
    const lost = Math.min(s.score, kind === 'patch' ? GAME_BUGS_PATCH_PENALTY : GAME_BUGS_MISS);
    s.score -= lost;
    s.streak = 0;
    m.hit = false;
    pushFx(s.fx, { k: kind === 'patch' ? 'patch' : 'miss', x: i, y: 0, n: -lost });
  }
}
