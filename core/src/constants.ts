/**
 * Shared constants used across server and webview.
 * Only constants needed by core interfaces live here.
 * Server-specific constants stay in server/src/constants.ts.
 * Webview-specific rendering constants stay in webview-ui/src/constants.ts.
 */

// ── Transport ────────────────────────────────────────────────
// Connection-state names for the MessageTransport state machine.

export const TRANSPORT_STATE_CONNECTING = 'connecting';
export const TRANSPORT_STATE_CONNECTED = 'connected';
export const TRANSPORT_STATE_RECONNECTING = 'reconnecting';
export const TRANSPORT_STATE_DISCONNECTED = 'disconnected';
/** Another window of this PC took over (WS_CLOSE_REPLACED): no reconnect follows. */
export const TRANSPORT_STATE_REPLACED = 'replaced';

/** WebSocket close code: the app was quit (tray / Settings) — the page stops reconnecting. */
export const WS_CLOSE_APP_QUIT = 4010;

/** WebSocket close code: a newer window (browser tab or PWA) opened — only one UI at a time. */
export const WS_CLOSE_REPLACED = 4011;

// ── Arcade games (core/src/games/) ───────────────────────────
// Rules shared by the page (play) and the relay (replay check): changing one changes
// every replay's score, so old replays no longer verify.
/** Fixed simulation step: every game advances in whole ticks (replays are exact). */
export const GAME_TICK_MS = 10;
/** Effect events a game queues for the page (sound, particles); the page drains them, a replay never does. */
export const GAME_FX_MAX = 32;
/**
 * Breaker (brick breaker): field GAME_BREAKER_W × _H px (fixed point × GAME_FP); the paddle
 * slides while ← / → is held, the ball leaves it at one of 8 angles by where it hit.
 */
export const GAME_FP = 256;
export const GAME_BREAKER_W = 240;
export const GAME_BREAKER_H = 186;
export const GAME_BREAKER_PADDLE_Y = 176;
export const GAME_BREAKER_PADDLE_W = 36;
export const GAME_BREAKER_PADDLE_WIDE_W = 56;
export const GAME_BREAKER_PADDLE_H = 4;
/** px per tick (× GAME_FP). */
export const GAME_BREAKER_PADDLE_SPEED = 640;
export const GAME_BREAKER_BALL = 3;
export const GAME_BREAKER_BALL_SPEED = 300;
export const GAME_BREAKER_BALL_SPEED_STEP = 30;
export const GAME_BREAKER_BALL_SPEED_MAX = 560;
export const GAME_BREAKER_SLOW_SPEED = 220;
/** Brick grid: COLS × ROWS of BRICK_W × BRICK_H with a 2 px gap, from BRICK_TOP. */
export const GAME_BREAKER_COLS = 10;
export const GAME_BREAKER_ROWS = 7;
export const GAME_BREAKER_BRICK_W = 22;
export const GAME_BREAKER_BRICK_H = 8;
export const GAME_BREAKER_BRICK_GAP = 2;
export const GAME_BREAKER_BRICK_TOP = 14;
export const GAME_BREAKER_LIVES = 3;
export const GAME_BREAKER_BRICK_POINTS = 10;
/** A tough brick takes 2 hits; steel never breaks. Chance per brick (%) grows with the level. */
export const GAME_BREAKER_TOUGH_PCT = 12;
export const GAME_BREAKER_TOUGH_STEP_PCT = 6;
export const GAME_BREAKER_STEEL_FROM = 3;
export const GAME_BREAKER_STEEL_PCT = 6;
export const GAME_BREAKER_LEVEL_BONUS = 200;
/** A broken brick drops a power-up (%): wide, multi-ball, slow, extra life. */
export const GAME_BREAKER_DROP_PCT = 14;
export const GAME_BREAKER_DROP_SPEED = 120;
export const GAME_BREAKER_POWER_MS = 12_000;
export const GAME_BREAKER_LIVES_MAX = 5;
/** Combo: bricks broken without touching the paddle add COMBO × (combo − 1). */
export const GAME_BREAKER_COMBO_POINTS = 5;
/** The ball launches by itself after this on the paddle. */
export const GAME_BREAKER_AUTO_LAUNCH_MS = 4000;
/** Drone (one button): flap up, gravity pulls; fly through gaps between server racks. */
export const GAME_DRONE_W = 240;
export const GAME_DRONE_H = 186;
export const GAME_DRONE_X = 56;
export const GAME_DRONE_BOX_W = 12;
export const GAME_DRONE_BOX_H = 8;
/** × GAME_FP per tick² / per tick. */
export const GAME_DRONE_GRAVITY = 14;
export const GAME_DRONE_FLAP = -400;
export const GAME_DRONE_FALL_MAX = 760;
export const GAME_DRONE_SPEED = 230;
export const GAME_DRONE_SPEED_STEP = 6;
export const GAME_DRONE_SPEED_MAX = 420;
export const GAME_DRONE_RACK_W = 22;
export const GAME_DRONE_SPACING = 100;
export const GAME_DRONE_GAP = 70;
export const GAME_DRONE_GAP_STEP = 1;
export const GAME_DRONE_GAP_MIN = 50;
/** Largest move of the gap centre from one rack to the next (px). */
export const GAME_DRONE_GAP_SHIFT = 56;
export const GAME_DRONE_MARGIN = 14;
export const GAME_DRONE_PASS_POINTS = 10;
/** A packet floats in some gaps (%), worth more. */
export const GAME_DRONE_PACKET_PCT = 35;
export const GAME_DRONE_PACKET_POINTS = 25;
/** Merge (sliding tiles): 4 × 4, a new 2 (else 4: NEW_FOUR_PCT %) after every move. */
export const GAME_MERGE_SIZE = 4;
export const GAME_MERGE_NEW_FOUR_PCT = 10;
/** Cable Run: 24 × 18 grid. */
export const GAME_CABLE_COLS = 24;
export const GAME_CABLE_ROWS = 18;
export const GAME_CABLE_START_LEN = 4;
export const GAME_CABLE_POINTS = 10;
/** Every Nth packet a gold burst appears for BURST_MS: BURST points + BURST_SEC_POINTS per second left. */
export const GAME_CABLE_BURST_EVERY = 5;
export const GAME_CABLE_BURST_MS = 6000;
export const GAME_CABLE_BURST_POINTS = 50;
export const GAME_CABLE_BURST_SEC_POINTS = 10;
/** From this many packets on, every FIREWALL_EVERY packets a firewall block appears (≤ MAX, never within SAFE tiles of the head). */
export const GAME_CABLE_FIREWALL_FROM = 6;
export const GAME_CABLE_FIREWALL_EVERY = 3;
export const GAME_CABLE_FIREWALL_MAX = 30;
export const GAME_CABLE_FIREWALL_SAFE = 4;
/** Turns buffered ahead of the cable (fast double taps). */
export const GAME_CABLE_TURN_QUEUE = 3;
export const GAME_CABLE_TICK_MS = 150;
export const GAME_CABLE_TICK_STEP_MS = 3;
export const GAME_CABLE_TICK_MIN_MS = 60;
/** Bug Squash: 3 × 3 monitors, 45 s round. Show times shrink from START to MIN over the round. */
export const GAME_BUGS_ROUND_MS = 45_000;
export const GAME_BUGS_SHOW_START_MS = 1500;
export const GAME_BUGS_SHOW_MIN_MS = 550;
/** Gap between spawns, shrinking the same way. */
export const GAME_BUGS_GAP_START_MS = 550;
export const GAME_BUGS_GAP_MIN_MS = 260;
/** Things on screen at once: ACTIVE_START + elapsed / ACTIVE_STEP_MS, ≤ ACTIVE_MAX. */
export const GAME_BUGS_ACTIVE_START = 2;
export const GAME_BUGS_ACTIVE_STEP_MS = 15_000;
export const GAME_BUGS_ACTIVE_MAX = 4;
/** When the screen is full, the next spawn is tried this soon after. */
export const GAME_BUGS_RETRY_MS = 150;
/** Spawn weights (out of 100): glitch (fast, worth more), patch (do NOT hit), clock (+time); rest = bug. */
export const GAME_BUGS_GLITCH_PCT = 18;
export const GAME_BUGS_PATCH_PCT = 14;
export const GAME_BUGS_CLOCK_PCT = 5;
/** A glitch stays this % of a bug's show time. */
export const GAME_BUGS_GLITCH_SHOW_PCT = 60;
export const GAME_BUGS_POINTS = 10;
export const GAME_BUGS_GLITCH_POINTS = 30;
export const GAME_BUGS_PATCH_PENALTY = 30;
export const GAME_BUGS_MISS = 5;
export const GAME_BUGS_CLOCK_MS = 3000;
/** Combo: points × (1 + streak / STREAK_STEP), ≤ MULT_MAX. */
export const GAME_BUGS_STREAK_STEP = 5;
export const GAME_BUGS_MULT_MAX = 4;
export const GAME_BUGS_FLASH_MS = 200;
