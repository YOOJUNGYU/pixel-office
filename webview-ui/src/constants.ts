import type { Provider, Room } from '../../core/src/lan.js';
import { MAX_LAYOUT_COLS, MAX_LAYOUT_ROWS, ROOM_DEFAULT_COLORS } from '../../core/src/lan.js';
import type { ColorValue } from './components/ui/types.js';

// ── Grid & Layout ────────────────────────────────────────────
export const TILE_SIZE = 16;
export const DEFAULT_COLS = 20;
export const DEFAULT_ROWS = 11;
export const MAX_COLS = MAX_LAYOUT_COLS;
export const MAX_ROWS = MAX_LAYOUT_ROWS;
/** The bundled default layout (rooms of an imported layout that lacks them), relative to the base URL. */
export const DEFAULT_LAYOUT_ASSET = 'assets/default-layout-1.json';
/** Personal mode's smaller bundled default (scripts/generate-lan-layout.mjs --personal). */
export const PERSONAL_LAYOUT_ASSET = 'assets/default-layout-personal.json';
/** Floor chunk cache budget (device px², all chunks; chunks on screen are always kept). */
export const FLOOR_CACHE_MAX_PIXELS = 4096 * 4096;
/** Floor chunk side in device px (rounded to whole tiles) and its minimum in tiles. */
export const FLOOR_CHUNK_PX = 512;
export const FLOOR_CHUNK_MIN_TILES = 4;
/** Random tiles tried before scanning a whole room for a free one. */
export const FREE_TILE_PROBES = 16;

// ── Character Animation ─────────────────────────────────────
export const WALK_SPEED_PX_PER_SEC = 108;
export const WALK_FRAME_DURATION_SEC = 0.067;
export const TYPE_FRAME_DURATION_SEC = 0.3;
/** A follower that found no free tile beside its parent retries after this long. */
export const FOLLOW_RETRY_SEC = 1.0;
/** Two talking agents bob in turn (one speaks, then the other) every this long. */
export const TALK_FRAME_DURATION_SEC = 0.25;
/** How far (sprite px) a talking agent bobs up. */
export const TALK_BOB_PX = 1;

// ── Matrix Effect ────────────────────────────────────────────
export const MATRIX_EFFECT_DURATION_SEC = 0.3;
export const MATRIX_TRAIL_LENGTH = 6;
export const MATRIX_SPRITE_COLS = 16;
export const MATRIX_SPRITE_ROWS = 24;
export const MATRIX_FLICKER_FPS = 30;
export const MATRIX_FLICKER_VISIBILITY_THRESHOLD = 180;
export const MATRIX_COLUMN_STAGGER_RANGE = 0.3;
export const MATRIX_HEAD_COLOR = '#ccffcc';
export const matrixGreenBright = (a: number): string => `rgba(0, 255, 65, ${a})`;
export const matrixGreenMid = (a: number): string => `rgba(0, 170, 40, ${a})`;
export const matrixGreenDim = (a: number): string => `rgba(0, 85, 20, ${a})`;
export const MATRIX_TRAIL_OVERLAY_ALPHA = 0.6;
export const MATRIX_TRAIL_EMPTY_ALPHA = 0.5;
export const MATRIX_TRAIL_MID_THRESHOLD = 0.33;
export const MATRIX_TRAIL_DIM_THRESHOLD = 0.66;

// ── Rendering ────────────────────────────────────────────────
export const CHARACTER_SITTING_OFFSET_PX = 6;
export const CHARACTER_Z_SORT_OFFSET = 0.5;
export const OUTLINE_Z_SORT_OFFSET = 0.001;
export const SELECTED_OUTLINE_ALPHA = 1.0;
export const HOVERED_OUTLINE_ALPHA = 0.5;
/** Headless agents (adopted, no terminal to focus) render slightly translucent. */
export const HEADLESS_CHARACTER_ALPHA = 0.5;
export const GHOST_PREVIEW_SPRITE_ALPHA = 0.5;
export const GHOST_PREVIEW_TINT_ALPHA = 0.25;
export const SELECTION_DASH_PATTERN: [number, number] = [4, 3];
export const BUTTON_MIN_RADIUS = 6;
export const BUTTON_RADIUS_ZOOM_FACTOR = 3;
export const BUTTON_ICON_SIZE_FACTOR = 0.45;
export const BUTTON_LINE_WIDTH_MIN = 1.5;
export const BUTTON_LINE_WIDTH_ZOOM_FACTOR = 0.5;
export const BUBBLE_FADE_DURATION_SEC = 0.5;
export const BUBBLE_SITTING_OFFSET_PX = 10;
export const BUBBLE_VERTICAL_OFFSET_PX = 24;
export const FALLBACK_FLOOR_COLOR = '#808080';

// ── Rendering - Overlay Colors (canvas, not CSS) ─────────────
export const SEAT_OWN_COLOR = 'rgba(0, 127, 212, 0.35)';
export const SEAT_AVAILABLE_COLOR = 'rgba(0, 200, 80, 0.35)';
export const SEAT_BUSY_COLOR = 'rgba(220, 50, 50, 0.35)';
export const GRID_LINE_COLOR = 'rgba(255,255,255,0.12)';
export const VOID_TILE_OUTLINE_COLOR = 'rgba(255,255,255,0.08)';
export const VOID_TILE_DASH_PATTERN: [number, number] = [2, 2];
export const GHOST_VALID_TINT = '#00ff00';
export const GHOST_INVALID_TINT = '#ff0000';
export const SELECTION_HIGHLIGHT_COLOR = '#007fd4';
export const DELETE_BUTTON_BG = 'rgba(200, 50, 50, 0.85)';
export const ROTATE_BUTTON_BG = 'rgba(50, 120, 200, 0.85)';
export const BUTTON_ICON_COLOR = '#fff';
export const CANVAS_FALLBACK_TILE_COLOR = '#444';
export const CANVAS_ERROR_TILE_COLOR = '#FF00FF';
export const WALL_COLOR = '#3A3A5C';

// ── Camera ───────────────────────────────────────────────────
export const CAMERA_FOLLOW_LERP = 0.1;
export const CAMERA_FOLLOW_SNAP_THRESHOLD = 0.5;

// ── Zoom ─────────────────────────────────────────────────────
/** Low enough that the whole 128×128 grid fits a 1280×720 screen. */
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 10;
/** Wheel/pinch zoom: zoom *= exp(-deltaY × this). A 100-px mouse notch ≈ ×1.16. */
export const ZOOM_WHEEL_SENSITIVITY = 0.0015;
/** Zoom +/- buttons multiply / divide by this. */
export const ZOOM_BUTTON_FACTOR = 1.25;
/** Wheel deltaMode 1 (lines) → px, so line-scrolling mice zoom like pixel ones. */
export const WHEEL_LINE_HEIGHT_PX = 40;
/** A zoom this close to an integer counts as that integer (crisp, unscaled frame). */
export const ZOOM_INTEGER_EPSILON = 1e-6;
export const ZOOM_DEFAULT_DPR_FACTOR = 2;
export const ZOOM_LEVEL_FADE_DELAY_MS = 1500;
export const ZOOM_LEVEL_HIDE_DELAY_MS = 2000;
export const ZOOM_LEVEL_FADE_DURATION_SEC = 0.5;
export const PAN_MARGIN_FRACTION = 0.25;
/** Left-button movement (CSS px) before a press becomes a map pan instead of a click */
export const PAN_DRAG_THRESHOLD_PX = 4;

// ── Editor ───────────────────────────────────────────────────
export const UNDO_STACK_MAX_SIZE = 50;
/** After [Save]: how long to wait for layoutSaved / layoutSaveRejected before showing an error. */
export const LAYOUT_SAVE_ACK_TIMEOUT_MS = 5_000;
/** data-testid of the office canvas — e2e drives real editor gestures on it. */
export const OFFICE_CANVAS_TEST_ID = 'office-canvas';

// ── Layout Import/Export (browser-native, standalone) ────────
/** Suggested filename when exporting the office layout from the standalone browser. */
export const LAYOUT_EXPORT_FILENAME = 'pixel-agents-layout.json';
/** localStorage key of this viewer's UI language ('ko' | 'en'). */
export const LANG_STORAGE_KEY = 'pixel-office.lang';
/** localStorage key: the update version this viewer closed the banner for. */
export const UPDATE_DISMISSED_STORAGE_KEY = 'pixel-office.updateDismissed';
/** localStorage key: the app version this viewer last ran (a newer one → "updated" notice once). */
export const SEEN_VERSION_STORAGE_KEY = 'pixel-office.seenVersion';
/** How long the "updated to vX" notice stays. */
export const UPDATED_NOTICE_MS = 10_000;
/** nicknameKey of the last nickname clash whose rename notice was handled (shown once per clash). */
export const NICKNAME_NOTICE_STORAGE_KEY = 'pixel-office.nicknameNotice';
/** localStorage key: epoch ms when this viewer chose [Later] on the install-as-app popup. */
export const INSTALL_DISMISSED_STORAGE_KEY = 'pixel-office.installDismissed';
/** [Later] hides the install popup for 7 days. */
export const INSTALL_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
// ── Server-off panel (lan/ServerPanel.tsx) ──────────────────
/** The installer registers this scheme to start the server; the URL itself is ignored. */
export const START_SERVER_URL = 'pixeloffice://start';
/** localStorage key: this viewer pressed [시작] before (the browser may remember "always allow"). */
export const SERVER_STARTED_BEFORE_KEY = 'pixel-office.startedBefore';
/** First load: no connection for this long → the panel (brief reconnects never show it). */
export const SERVER_PANEL_GRACE_MS = 3_000;
/** While the panel shows: poll /api/health this often; up → reload into the office. */
export const SERVER_PANEL_POLL_MS = 1_000;
/** After [시작]: no server within this long → the "start it from the Start menu" hint. */
export const SERVER_START_TIMEOUT_MS = 20_000;
/** MIME type for the exported layout Blob. */
export const LAYOUT_EXPORT_MIME = 'application/json';
export const DEFAULT_FLOOR_COLOR: ColorValue = { h: 35, s: 30, b: 15, c: 0 };
export const DEFAULT_WALL_COLOR: ColorValue = { h: 240, s: 25, b: 0, c: 0 };
export const DEFAULT_NEUTRAL_COLOR: ColorValue = { h: 0, s: 0, b: 0, c: 0 };

// ── Map background (outside the office + VOID tiles) ─────────
/** Solid background offered when the Background tab is first used: the page navy (#181828). */
export const BACKGROUND_DEFAULT_COLOR: ColorValue = { h: 240, s: 25, b: -76, c: 0, colorize: true };
/** Floor tint offered for a floor background (a dim gray-blue, so the office stands out). */
export const BACKGROUND_DEFAULT_FLOOR_COLOR: ColorValue = { h: 220, s: 15, b: -45, c: 0 };
export const BACKGROUND_DEFAULT_FLOOR_PATTERN = 1;
export const BACKGROUND_DEFAULT_CARPET_VARIANT = 0;
/** A carpet background repeats one rug of this many tiles square (body + accent trim). */
export const BACKGROUND_CARPET_PATCH_TILES = 2;

// ── Carpets ──────────────────────────────────────────────────
/** Main (lowest-luminance) color applied to carpets when no per-tile override is set. */
export const CARPET_DEFAULT_COLOR: ColorValue = { h: 0, s: 71, b: -32, c: 0, colorize: true };
/** Accent (highest-luminance) color applied to carpets when no per-tile override is set. */
export const CARPET_DEFAULT_ACCENT_COLOR: ColorValue = {
  h: 34,
  s: 64,
  b: 21,
  c: 0,
  colorize: true,
};
/** Keyboard key that switches from CARPET_PAINT to CARPET_PICK while editing. */
export const KEY_CARPET_PICK = 'p';

// ── Areas (the four fixed rooms) ─────────────────────────────
/** Room overlay colors of the bundled default layout: a layout missing a room gets these. */
export const ROOM_AREA_COLORS: Readonly<Record<Room, string>> = ROOM_DEFAULT_COLORS;
/** 서버실 zones: extra tiles a seat in another zone counts as when picking the seat closest
 *  to a parent — more than any room is wide, so the own zone always wins while it has room. */
export const OTHER_ZONE_PENALTY = 1000;
/** 서버실 work zone dividers = floor marking tape along the midlines, in sprite pixels (scaled
 *  with the render zoom, so it stays pixel-crisp): `width` wide, one `dash` per tile centred on
 *  it (the rest of the tile is a gap), a `mark`-sized square where the two lines cross; `shade` =
 *  a 1 px darker edge on the tape's lower/right side. Per theme (canvas). */
export const ZONE_TAPE = { width: 2, dash: 10, mark: 4 } as const;
export const ZONE_TAPE_COLORS = {
  dark: { tape: '#c9a24a', shade: '#7a5f2a' },
  light: { tape: '#d9a93c', shade: '#a67c26' },
} as const;

// ── VisualColorPicker (HSV wheel + brightness for carpets) ───
export const VISUAL_COLOR_PICKER_SV_SIZE_PX = 180;
export const VISUAL_COLOR_PICKER_HUE_WIDTH_PX = 20;
export const VISUAL_COLOR_PICKER_MARKER_RADIUS_PX = 6;
/**
 * The hue bar gradient is intrinsic to the color-picking interaction, not a
 * theme color — it must span the full hue circle. Centralized here so the
 * component body stays free of inline color literals. (The saturation/brightness
 * square is painted to a canvas from the carpet HSL model, not a CSS gradient.)
 */
export const VISUAL_COLOR_PICKER_HUE_GRADIENT =
  'linear-gradient(to bottom, ' +
  '#ff0000 0%, #ffff00 16.7%, #00ff00 33.3%, ' +
  '#00ffff 50%, #0000ff 66.7%, #ff00ff 83.3%, #ff0000 100%)';
export const VISUAL_COLOR_PICKER_MARKER_BORDER = '2px solid #fff';
export const VISUAL_COLOR_PICKER_MARKER_SHADOW = '0 0 0 1px rgba(0,0,0,0.6)';
/** Width of the collapsed swatch + hex trigger row (compact mode). */
export const VISUAL_COLOR_PICKER_COMPACT_WIDTH_PX = 160;
/** Swatch square size shown in the collapsed trigger. */
export const VISUAL_COLOR_PICKER_SWATCH_PX = 22;
/** Gap (px) between the collapsed trigger and the expanded popup panel. */
export const VISUAL_COLOR_PICKER_POPUP_GAP_PX = 6;

// ── Furniture Animation ─────────────────────────────────────
export const FURNITURE_ANIM_INTERVAL_SEC = 0.2;
/** 서버실 PCs blink their LEDs while a command runs there (the furniture animation tick drives
 *  them). Pixels on the PC_SIDE sprite (unmirrored coords) and the colour of each, lit. */
export const SERVER_LED_PIXELS: ReadonlyArray<{ x: number; y: number; color: string }> = [
  { x: 8, y: 19, color: '#3fe07a' },
  { x: 10, y: 19, color: '#ffb02e' },
];
/** Each LED's on/off steps (one per furniture tick); PCs start at different steps. */
export const SERVER_LED_PATTERNS = ['1101001110', '1000110100'];
/** A front PC's screen (top-left pixel of its 10×5 area) and the colours of its frames
 *  (office/engine/pcScreens.ts): code, terminal, document. One frame per this many seconds. */
export const PC_SCREEN_ORIGIN = { x: 3, y: 5 } as const;
export const PC_SCREEN_FRAME_SEC = 0.8;
/** Working PCs glow (office/engine/pcGlow.ts): halo width (sprite px), the pulse's alpha
 *  steps (one per PC_GLOW_FRAME_SEC: stepped, so the scene wakes on a timer, not every
 *  frame) and its colour per screen (`plain` = any other work). A failure flashes it red
 *  for PC_FAIL_FLASH_SEC, on/off every PC_GLOW_FRAME_SEC. */
export const PC_GLOW_RADIUS = 2;
export const PC_GLOW_FRAME_SEC = 0.25;
export const PC_GLOW_ALPHAS = [0.4, 0.55, 0.7, 0.85, 0.7, 0.55] as const;
export const PC_GLOW_COLORS = {
  code: '#2ee87a',
  term: '#5f86ff',
  doc: '#ffd84a',
  plain: '#38b6ff',
  fail: '#ff3b4e',
} as const;
export const PC_FAIL_FLASH_SEC = 1.5;
/** The PC itself lights up too: its pixels at least this light (0..1) are mixed toward the
 *  glow colour (lifted toward white by PC_TINT_LIFT), by one step of PC_TINT_AMOUNTS per frame. */
export const PC_TINT_MIN_LUMA = 0.55;
export const PC_TINT_LIFT = 0.35;
export const PC_TINT_AMOUNTS = [0.3, 0.45, 0.6, 0.72, 0.6, 0.45] as const;
/** One-shot effects over agents (lan/effects.ts): how long each plays, and at most this many
 *  at once (a burst of snapshots never floods the screen). */
export const FX_DURATION_MS = { plus: 1600, confetti: 1800, smoke: 1600, box: 1600 } as const;
export const FX_MAX = 40;
/** "+12" / "−3" text over the map (with a dark pixel shadow, --fx-shadow). */
export const FX_PLUS_COLOR = '#5cff9d';
export const FX_MINUS_COLOR = '#ff6b78';
/** Where the effects start, world px from the character's centre (right of the head). */
export const FX_SIDE_OFFSET_X = 9;
/** Confetti pieces per burst and their colours. */
export const FX_CONFETTI_PIECES = 14;
export const FX_CONFETTI_COLORS = [
  '#ffd94a',
  '#ff7fa6',
  '#6cb6ff',
  '#4ade80',
  '#d197ff',
  '#ffb04d',
];

// ── Mini games (lan/games/; rules in core/src/constants.ts) ─────────
/** Every game draws on one logical canvas (px), blown up by an integer scale that fits the window. */
export const GAME_VIEW_W = 240;
export const GAME_VIEW_H = 208;
export const GAME_SCALE_MIN = 2;
export const GAME_SCALE_MAX = 4;
/** Room the arcade panel needs around the canvas (how-to column, hall of fame, header, padding). */
export const GAME_FIT_SPARE_W = 520;
export const GAME_FIT_SPARE_H = 110;
/** Longest frame step fed to the game logic (a backgrounded tab must not jump). */
export const GAME_MAX_STEP_MS = 100;
/** 3-2-1 before a run starts (the run's clock waits). */
export const GAME_COUNTDOWN_MS = 1500;
/** Effects (visual only). */
export const GAME_FLOAT_MS = 900;
export const GAME_PARTICLE_MS = 700;
export const GAME_PARTICLE_GRAVITY = 0.0004;
export const GAME_PARTICLES_MAX = 240;
export const GAME_SHAKE_MS = 260;
export const GAME_CLEAR_FLASH_MS = 260;
/** Every 3rd device row darkened a little (CRT). */
export const GAME_SCANLINE_ALPHA = 0.14;
export const GAME_SOUND_VOLUME = 0.05;
/** localStorage: '1' = arcade sound off. */
export const GAME_MUTE_KEY = 'pixel-office.arcade.mute';
export {
  GAME_BREAKER_PADDLE_H,
  GAME_BREAKER_PADDLE_Y,
  GAME_BUGS_ROUND_MS,
  GAME_CABLE_BURST_MS,
  GAME_CABLE_COLS,
  GAME_CABLE_ROWS,
  GAME_DRONE_BOX_H,
  GAME_DRONE_BOX_W,
  GAME_DRONE_H,
  GAME_DRONE_RACK_W,
  GAME_DRONE_X,
  GAME_FP,
  GAME_MERGE_SIZE,
} from '../../core/src/constants.js';
/** Canvas text, in logical px (scaled with the canvas). */
export const GAME_FONT = '7px Pretendard';
export const GAME_FONT_TINY = 'bold 5px Pretendard';
export const GAME_FONT_BOLD = 'bold 8px Pretendard';
export const GAME_FONT_NUM = 'bold 11px Pretendard';
export const GAME_FONT_BIG = 'bold 18px Pretendard';
export const GAME_FONT_HUGE = 'bold 36px Pretendard';
export const GAME_COLORS = {
  bg: '#0d0f17',
  panel: '#161a26',
  panelEdge: '#2a3042',
  text: '#e6e9f2',
  muted: '#7d859c',
  accent: '#ffd94a',
  good: '#5cff9d',
  bad: '#ff5d6c',
  overlay: 'rgba(6, 8, 14, 0.78)',
  scanline: '#000000',
  white: '#ffffff',
  /** Breaker: field, bricks per row, paddle, power-ups (wide multi slow life). */
  field: '#0a0d17',
  fieldGrid: '#111626',
  brickRows: ['#ff5d6c', '#ff8a3d', '#ffd94a', '#4ade80', '#3ee0d0', '#6cb6ff', '#b48cff'],
  brickShade: 'rgba(0, 0, 0, 0.35)',
  brickShine: 'rgba(255, 255, 255, 0.35)',
  rivet: '#20242f',
  crack: '#11131b',
  steel: '#7d859c',
  steelDark: '#4c5266',
  steelLight: '#b8bfd0',
  paddle: '#d9e0ee',
  paddleDark: '#8a93a8',
  paddleLed: '#4ade80',
  ball: '#ffffff',
  ballGlow: 'rgba(255, 255, 255, 0.25)',
  powers: ['#6cb6ff', '#ffd94a', '#5ce1ff', '#ff6bd5'],
  /** Drone: sky bands, skyline, racks, drone. */
  sky: ['#0b1020', '#0e1428', '#121a33', '#16203d'],
  skyline: '#0f1630',
  skylineLit: '#2a3560',
  rackBody: '#3a3f4f',
  rackLight: '#4c5266',
  rackEdge: '#20242f',
  rackLed: '#4ade80',
  rackLedAmber: '#ffb04d',
  droneBody: '#e6e9f2',
  droneDark: '#8a93a8',
  droneAccent: '#ff8a3d',
  prop: '#b8bfd0',
  ground: '#1c2133',
  groundLine: '#2e3550',
  /** Merge: board, empty cell, tiles by exponent (1 = 2, 2 = 4, …; last = beyond). */
  board: '#161a26',
  cellEmpty: '#1f2433',
  tiles: [
    '#2c3a5c',
    '#2f5277',
    '#2f6f8f',
    '#2f8a86',
    '#37995f',
    '#6ba63a',
    '#c2a12f',
    '#d97b2f',
    '#d94a4a',
    '#c23a8a',
    '#8a3ac2',
    '#ffd94a',
  ],
  tileDarkText: '#1a1423',
  /** Cable: board, cable stripes, plug, packets, firewalls. */
  pcb: '#0e1a16',
  pcbTrace: '#15291f',
  pcbDot: '#1d3a2c',
  cable: '#3d7bd9',
  cableDark: '#2a5aa6',
  cableStripe: '#78a8ff',
  plug: '#d9e0ee',
  plugDark: '#8a93a8',
  plugPin: '#ffd94a',
  packet: '#4ade80',
  packetDark: '#1f8a4a',
  gold: '#ffd94a',
  goldDark: '#b8901c',
  wall: '#c2413a',
  wallDark: '#7a2420',
  wallLight: '#ff7a5c',
  /** Bugs: monitors, screen, sprites. */
  monitor: '#3d4356',
  monitorLight: '#5a6178',
  monitorDark: '#232838',
  screen: '#0b1a2c',
  screenCode: '#163552',
  screenCode2: '#1d4a3a',
  ring: '#ffffff',
  bug: '#ff5d6c',
  bugDark: '#a8243a',
  glitch: '#c77dff',
  glitchDark: '#6b2fb0',
  patch: '#4ade80',
  patchDark: '#1f8a4a',
  clock: '#5ce1ff',
  clockDark: '#1f7a99',
  eye: '#ffffff',
  pupil: '#0d0f17',
};
/** One-letter palettes for the games' pixel sprites (lan/games/sprites.ts). */
export const GAME_SPRITE_COLORS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  bug: { a: '#ff5d6c', b: '#a8243a', e: '#ffffff', p: '#0d0f17', l: '#3a1520' },
  glitch: { a: '#c77dff', b: '#6b2fb0', e: '#ffffff', p: '#0d0f17', l: '#2a1440' },
  patch: { a: '#4ade80', b: '#1f8a4a', e: '#ffffff', p: '#0d0f17', l: '#0f3a22' },
  clock: { a: '#5ce1ff', b: '#1f7a99', e: '#ffffff', p: '#0d0f17', l: '#0f2a3a' },
};
/** Sounds: [start Hz, end Hz, ms, wave]. */
export const GAME_SFX: Readonly<
  Record<string, readonly [number, number, number, 'sine' | 'square' | 'sawtooth' | 'triangle']>
> = {
  move: [440, 440, 25, 'square'],
  turn: [620, 700, 35, 'square'],
  lock: [180, 120, 60, 'triangle'],
  drop: [300, 90, 90, 'triangle'],
  hold: [520, 780, 70, 'sine'],
  clear: [523, 1046, 220, 'square'],
  level: [660, 1320, 380, 'square'],
  eat: [700, 1000, 60, 'square'],
  gold: [880, 1760, 260, 'square'],
  burst: [1200, 1500, 90, 'sine'],
  wall: [140, 90, 140, 'sawtooth'],
  fade: [500, 300, 120, 'sine'],
  pop: [900, 1100, 25, 'sine'],
  bug: [300, 900, 80, 'square'],
  glitch: [400, 1600, 120, 'square'],
  clock: [1000, 1500, 160, 'sine'],
  patch: [200, 80, 220, 'sawtooth'],
  miss: [160, 120, 90, 'sawtooth'],
  escape: [400, 250, 90, 'triangle'],
  over: [440, 110, 600, 'sawtooth'],
  count: [660, 660, 80, 'square'],
  go: [990, 990, 160, 'square'],
};
/** Merge: board (px) and its tile fonts by digit count (≤ 2, 3, 4+). */
export const GAME_MERGE_CELL = 41;
export const GAME_MERGE_GAP = 4;
export const GAME_MERGE_FONTS = [
  'bold 16px Pretendard',
  'bold 13px Pretendard',
  'bold 10px Pretendard',
];
/** Merge animation: slide, then the pop of merged / new tiles (ms). */
export const GAME_MERGE_SLIDE_MS = 90;
export const GAME_MERGE_POP_MS = 120;
/** Cable Run cells (px) under a header. */
export const GAME_CABLE_CELL = 10;
export const GAME_HEADER_H = 22;
/** Bug Squash monitors (px): frame + stand, gaps between. */
export const GAME_BUGS_MON_W = 72;
export const GAME_BUGS_MON_H = 56;
export const GAME_BUGS_FRAME_H = 48;
export const GAME_BUGS_GAP = 6;
/** How-to column beside the game (px). */
export const ARCADE_HOWTO_WIDTH_PX = 210;
export const PC_SCREEN_COLORS: Readonly<Record<string, string>> = {
  k: '#10261a',
  g: '#4ade80',
  G: '#22a35a',
  b: '#0b0b10',
  w: '#c8c8d0',
  c: '#f0f0f0',
  p: '#f4f4f0',
  l: '#9aa0aa',
  h: '#5a6070',
};

// ── Version Notice ──────────────────────────────────────────
export const WHATS_NEW_AUTO_CLOSE_MS = 20000;
export const WHATS_NEW_FADE_MS = 1000;

// ── Game Logic ───────────────────────────────────────────────
export const MAX_DELTA_TIME_SEC = 0.1;
/** dt cap for a frame woken by the animation-boundary timer (only timers advance then). */
export const MAX_IDLE_DELTA_TIME_SEC = 1;
export const WAITING_BUBBLE_DURATION_SEC = 2.0;
export const DISMISS_BUBBLE_FAST_FADE_SEC = 0.3;
/** Default/fallback palette count (bundled characters). Actual count comes from getLoadedCharacterCount(). */
export const PALETTE_COUNT = 6;
export const AUTO_ON_FACING_DEPTH = 3;
export const AUTO_ON_SIDE_DEPTH = 2;
export const CHARACTER_HIT_HALF_WIDTH = 8;
export const CHARACTER_HIT_HEIGHT = 24;
/** Pet character hit box (measured on claudio/gitcat): front/back frames are
 *  16 px wide, side frames 32; the animal is 16 (sitting) to 21 (walking) px tall. */
export const PET_HIT_HALF_WIDTH = 7;
export const PET_HIT_HALF_WIDTH_SIDE = 11;
export const PET_HIT_HEIGHT = 19;
/** A pet's head is this much lower than a human's: bubbles and the "!" sit lower. */
export const PET_HEAD_DROP_PX = 2;

// ── Greeter + Intro bubble ──────────────────────────────────
/** Reserved character id for the Intro's greeter. Far outside both real agent
 *  ids (positive) and sub-agent ids (small negatives from -1 down). */
export const GREETER_ID = -1_000_000_000;
/** The greeter stands this many tiles in from the office's bottom-left corner
 *  (target tile (margin, rows-1-margin); nearest walkable tile if blocked). */
export const GREETER_TILE_MARGIN = 3;

// ── Context Fuel Gauge ──────────────────────────────────────
/** Window assumed before the runtime reports one (it always does for agents
 *  that have taken a turn; this only covers characters created ahead of it). */
export const DEFAULT_MAX_CONTEXT_TOKENS = 200_000;

// ── Pet characters (a profile's character may be a pet) ─────
/** Time per IDLE animation cycle step (4 cycle steps × 0.3s = 1.2s per loop). */
export const PET_IDLE_FRAME_DURATION_SEC = 0.3;
/** Walk cycle: 4-step lookup into the 3-frame walkDown/walkUp/walkRight arrays. */
export const PET_WALK_SEQUENCE = [0, 1, 0, 2] as const;
/** Idle cycle: 4-step lookup into the 3-frame idleDown/idleUp arrays. */
export const PET_IDLE_SEQUENCE = [0, 1, 2, 1] as const;
/** A pet's color (hueShift ≠ 0) is a colorize tint, not a hue rotation: gitcat is
 *  nearly black/grey, where rotating the hue changes nothing. Saturation of the tint
 *  and a per-pet lightness lift (colorize `b`) so dark pets show the color. */
export const PET_TINT_SATURATION = 55;
export const PET_TINT_BRIGHTNESS: Readonly<Record<string, number>> = { claudio: 0, gitcat: 40 };

// ── WebSocket reconnect (standalone only) ────────────────────
/** Reconnect backoff ladder for the /ws transport (transport/reconnectBackoff.ts).
 *  The last rung repeats. */
export const WS_RECONNECT_DELAYS_MS = [250, 500, 1_000, 2_000, 4_000] as const;

// ── Mobile ───────────────────────────────────────────────────
// Below this the app uses touch-friendly chrome (no zoom buttons, floating
// Settings). Phones match the first clause in either orientation; the second
// catches touch tablets.
export const MOBILE_MEDIA_QUERY = '(max-width: 768px), ((pointer: coarse) and (max-width: 1024px))';

// ── Touch input (every surface) ──────────────────────────────
/** Tap slop shared by every touch surface (withinTapSlop): a finger that
 *  travels less than this from where it landed is still a tap; beyond it the
 *  gesture becomes that surface's drag (pan, scroll, reorder). */
export const TOUCH_TAP_MAX_MOVE_PX = 10;
/** A press longer than this is not a tap even if the finger never moved. */
export const TOUCH_TAP_MAX_DURATION_MS = 350;

// ── Dropdown ─────────────────────────────────────────────────
/** Gap a viewport-fitted Dropdown keeps from the top of the viewport when its
 *  content is taller than the room above its anchor. */
export const DROPDOWN_VIEWPORT_MARGIN_PX = 8;

// ── LAN agents ──────────────────────────────────────────────
/** Animation tool per room: typing (coding/server), reading (library), none = idle (lounge). */
export const LAN_ROOM_TOOL: Record<Room, string | null> = {
  coding: 'Edit',
  library: 'Read',
  server: 'Bash',
  lounge: null,
};
/** Tools drawn with the reading animation (no provider sends providerCapabilities). */
export const LAN_READING_TOOLS = ['Read'];
/** Avatar name tag colours the profile's pickers start from (a profile without
 *  `tagColors` shows the theme's `--avatar-tag-bg` / `--avatar-tag-fg`). */
export const AVATAR_TAG_DEFAULT_BG = '#127068';
export const AVATAR_TAG_DEFAULT_FG = '#FFFFFF';
export const MAX_HUE_DEG = 360;
/** Skin colors of char_0..5.png (measured); exempt from a character's hue shift. */
export const CHARACTER_SKIN_COLORS: ReadonlySet<string> = new Set([
  '#E9A384',
  '#C5896E',
  '#FBBF97',
  '#FFD8B2',
  '#E29878',
  '#BD8068',
  '#84523A',
  '#FFF2EC',
  '#FCD6C4',
  '#E1AA91',
  '#CF9D86',
  '#BA917E',
  '#5F4132',
  '#493227',
  '#B67352',
  '#8C583F',
]);
/** Provider badge before the activity line: background (text = LAN_PROVIDER_BADGE_FG). */
export const LAN_PROVIDER_COLORS: Record<Provider, string> = {
  claude: '#D97757',
  codex: '#10A37F',
};
export const LAN_PROVIDER_BADGE_FG = '#ffffff';
/** Badge at the front of a name tag: SUB / SHELL on children (which show the parent's number), MAIN on main agents. */
export const LAN_KIND_BADGES: Record<
  'main' | 'subagent' | 'shell',
  { text: string; bg: string; fg: string }
> = {
  main: { text: 'MAIN', bg: '#feca57', fg: '#1e1e2e' },
  subagent: { text: 'SUB', bg: '#5f27cd', fg: '#ffffff' },
  shell: { text: 'SHELL', bg: '#576574', fg: '#ffffff' },
};
/** Light-theme override of the MAIN badge (the gold above is too pale on paper). */
export const LAN_MAIN_BADGE_LIGHT = { bg: '#8a5a00', fg: '#ffffff' } as const;
/** Waiting/permission "!" over a character's head: red glyph, 1px dark outline. */
export const LAN_ALERT_COLOR = '#e8202a';
export const LAN_ALERT_OUTLINE_COLOR = '#2b0608';
/** The "!" glyph (sprite pixels, before the outline): bar, gap, dot. */
export const LAN_ALERT_GLYPH = ['###', '###', '###', '###', '.#.', '...', '###', '###'];
// ── Status signals over agents (act icon, elapsed time, task progress, failure) ──
/** Below this bubble scale (text no longer readable) an agent's bubble is its act icon alone. */
export const ACT_ICON_ONLY_BELOW_SCALE = 0.6;
/** The icon-only bubble's icon and the failure drop at bubble scale 1 (CSS px, 2× the 8×8
 *  art); both scale with the map like the bubbles. */
export const ACT_ICON_SCREEN_PX = 16;
/** The icon inside a full bubble (unscaled bubble px; the bubble scales with the map). */
export const ACT_ICON_INLINE_PX = 11;
/** Chip text in a bubble (task count, elapsed): same face as the provider badge. */
export const STATUS_CHIP_FONT = 'bold 11px Pretendard';
/** Horizontal padding inside a chip (each side) and the bubble's gap between its parts, px. */
export const STATUS_CHIP_PAD_X_PX = 2;
export const STATUS_PART_GAP_PX = 4;
/** Task progress bar under the icon-only bubble's icon, CSS px. */
export const TODO_BAR_HEIGHT_PX = 2;
/** Elapsed time turns to the warning colour after this long: waiting for me / anything else. */
export const ELAPSED_WARN_PERMISSION_MS = 2 * 60_000;
export const ELAPSED_WARN_MS = 10 * 60_000;
/** The failure drop sits this many world px right of a character's centre (its sprite edge). */
export const FAIL_DROP_OFFSET_X = 8;
/** An edit/read icon takes its file's language colour (lan/highlight.ts families), bright
 *  enough for the slate bubble in both themes. */
export const LANG_ICON_COLORS: Record<
  'js' | 'py' | 'sh' | 'json' | 'css' | 'c' | 'go' | 'rust' | 'sql' | 'yaml' | 'xml',
  string
> = {
  js: '#6cb6ff',
  py: '#ffd94a',
  sh: '#9be26a',
  json: '#e0d36a',
  css: '#d197ff',
  c: '#ff7fa6',
  go: '#5fd7f0',
  rust: '#f0b48a',
  sql: '#ffb04d',
  yaml: '#ff8a8a',
  xml: '#ff8f5e',
};

export const LAN_BUBBLE_MAX_WIDTH_PX = 300;
/** Hover bubble sits this many world px above a character's feet (sprite height). */
export const LAN_BUBBLE_HEAD_OFFSET = 32;
/** Activity bubble above working agents (tags & bubbles shown): truncated at this width (CSS px). */
export const LAN_ACTIVITY_MAX_WIDTH_PX = 240;
/** Personal + public office: the activity bubble wraps to at most this many lines (the last one ends in …); a team office keeps one clipped line. */
export const LAN_ACTIVITY_MAX_LINES = 5;
/** Line height of a wrapped activity bubble (CSS px). */
export const LAN_ACTIVITY_LINE_PX = 16;
/** Gap between the bubble's header (badge, title, elapsed) and the activity text under it. */
export const LAN_BUBBLE_HEADER_GAP_PX = 3;
/** The session title in the bubble header (centre, clipped with …). */
export const LAN_BUBBLE_TITLE_FONT = '11px Pretendard';
/** Its padding inside the pixel-panel border (CSS px); the tail and border match the chat bubbles. */
export const LAN_ACTIVITY_PAD_X_PX = 6;
export const LAN_ACTIVITY_PAD_Y_PX = 3;
export const LAN_TAG_Z_INDEX = 40;
/** Name tag / activity line box for overlap stacking (CSS px), one line: text-sm leading-none (13) + py-1 ×2. Width = PAD ×2 + badge (px-2 ×2 + gap 4) + text. */
export const LAN_TAG_LINE_PX = 13;
export const LAN_TAG_HEIGHT_PX = LAN_TAG_LINE_PX + 2;
export const LAN_TAG_STACK_GAP_PX = 2;
export const LAN_TAG_PAD_X_PX = 6;
export const LAN_TAG_BADGE_CHROME_PX = 8;
export const LAN_TAG_FONT = '13px Pretendard';
export const LAN_TAG_BADGE_FONT = 'bold 11px Pretendard';
export const LAN_PERMISSION_Z_INDEX = 41;
export const LAN_BUBBLE_Z_INDEX = 42;
// ── Avatars (one per person; mine walks with the arrow keys) ─
/** A remote avatar further than this (tiles) from its new spot jumps there instead of walking. */
export const AVATAR_TELEPORT_TILES = 20;
/** Avatar name tag box (CSS px), one line: text-sm leading-none + py-1 ×2; width = PAD ×2 + text. */
export const AVATAR_TAG_HEIGHT_PX = LAN_TAG_LINE_PX + 2;

// ── Chat bubbles (above the avatar) and the bottom chat bar ───
/** Text column of a chat bubble wraps at this width (CSS px). */
export const CHAT_TEXT_MAX_PX = 200;
export const CHAT_FONT = '13px Pretendard';
/** Line boxes (CSS px), set explicitly so the height estimate used for stacking holds. */
export const CHAT_LINE_PX = 17;
export const CHAT_PAD_X_PX = 8;
export const CHAT_PAD_Y_PX = 4;
export const CHAT_BORDER_PX = 2;
/** Gap between the bubble and the head it points at (the tail), and between stacked bubbles. */
export const CHAT_TAIL_PX = 8;
export const CHAT_STACK_GAP_PX = 4;
/** The chat bar at the bottom centre (CSS px): width, gap from the bottom edge. */
export const CHAT_BAR_WIDTH_PX = 440;
export const CHAT_BAR_BOTTOM_PX = 10;
/** The × on my own bubble (square, CSS px) and its gap from the text. */
export const CHAT_DELETE_PX = 16;
export const CHAT_DELETE_GAP_PX = 6;
/** Bubbles with the "!" sprites; the bar above everything but the top-right stack's modals. */
export const CHAT_Z_INDEX = 41;
export const CHAT_INPUT_Z_INDEX = 44;

/** Room name plate (DOM badge) inset from the room's top-left tile corner, CSS px. */
export const ROOM_PLATE_INSET_PX = 4;
/** Room plates: above every name tag, bubble and chat bubble (LAN_*, CHAT_Z_INDEX), below the chat bar, the top-right stack and modals. */
export const ROOM_PLATE_Z_INDEX = 43;
/** A plate's hover popup (what sends an agent there + its agents' cards): above the tags and chat. */
export const ROOM_PLATE_TIP_Z_INDEX = 46;
/** The top-left button row (Layout, Settings, theme, zoom): above room plates and their popups. */
export const TOP_LEFT_CONTROLS_Z_INDEX = 47;
/** 서버실 work zone plate's hover tooltip width (px). */
export const ZONE_TIP_WIDTH_PX = 240;
/** The popup's width (CSS px); it never reaches past the room's right or bottom edge (then scrolls). */
export const ROOM_TIP_WIDTH_PX = 300;

// ── Team offices ─────────────────────────────────────────────
/** Office name length the server accepts (server MAX_OFFICE_NAME). */
export const MAX_OFFICE_NAME = 20;
/** How long "copied" stays next to a Copy button. */
export const OFFICE_COPIED_MS = 2_000;

// ── Onboarding tour ──────────────────────────────────────────
/** localStorage flag: this browser finished or skipped the tour. */
export const TOUR_STORAGE_KEY = 'pixel-office.tour.v1';
/** Peer id prefix of the client-only demo characters (never sent anywhere). */
export const TOUR_DEMO_PREFIX = 'tour-demo:';
/** Fewer visible agents than this → the tour adds demo characters. */
export const TOUR_DEMO_MIN_AGENTS = 3;
/** Wait for the first snapshot before deciding on demos. */
export const TOUR_AUTOSTART_DELAY_MS = 800;
export const TOUR_Z_INDEX = 100;
/** Spotlight padding around a target, and the gap every hole/tooltip keeps from the viewport edge. */
export const TOUR_SPOTLIGHT_PAD_PX = 6;
export const TOUR_VIEWPORT_MARGIN_PX = 8;
export const TOUR_TOOLTIP_GAP_PX = 12;
export const TOUR_TOOLTIP_MAX_WIDTH_PX = 340;
/** Fraction of the remaining distance a spotlight hole moves per frame. */
export const TOUR_SPOTLIGHT_EASE = 0.25;
/** Spotlight outline width (CSS px). */
export const TOUR_OUTLINE_PX = 2;
/** The tour fits the whole office into this fraction of the screen. */
export const TOUR_FIT_FILL = 0.92;
/** First open: share of the window the whole office fills when it would not fit at the default zoom. */
export const FIRST_OPEN_FIT_FILL = 0.95;
/** First-open fit leaves this much room at the top (CSS px): the office switcher + a gap. */
export const FIT_TOP_MARGIN_PX = 56;
/** How long a toast stays (layout not saved, relay kick result). */
export const TOAST_MS = 4_000;

// ── App version ─────────────────────────────────────────────
/** An unbuilt (dev/test) server's version: never triggers a reload. */
export const DEV_SERVER_VERSION = '0.0.0';
/** sessionStorage: the server version this tab last reloaded for (no reload loop). */
export const VERSION_RELOAD_KEY = 'pixel-office.reloadedFor';

// ── Room legend (top left) ───────────────────────────────────

// ── People panel ─────────────────────────────────────────────
/** localStorage: '1' = collapsed, '0' = expanded (per viewer); unset = by screen width. */
export const PEOPLE_COLLAPSED_KEY = 'pixel-office.people.collapsed';
/** Narrower than this (CSS px) the panel starts collapsed. */
export const PEOPLE_WIDE_MIN_PX = 1100;
/** Face crop of the standing frame (sprite rows) and its integer scale. */
export const PEOPLE_FACE_TOP = 10;
export const PEOPLE_FACE_ROWS = 14;
/** Pet face crop (rows of the front idle frame; the animal starts at row 15). */
export const PEOPLE_PET_FACE_TOP = 15;
export const PEOPLE_FACE_SCALE = 2;
/** Face crops of a character / pet thumbnail (people panel, room cards). */
export const PEOPLE_FACE_CROP = { top: PEOPLE_FACE_TOP, rows: PEOPLE_FACE_ROWS };
export const PEOPLE_PET_FACE_CROP = { top: PEOPLE_PET_FACE_TOP, rows: PEOPLE_FACE_ROWS };
/** How long the "no agents" hint stays after clicking an agentless row. */
export const PEOPLE_HINT_MS = 2_000;
/** Settings → 관리자 토큰: longest token the server accepts (asyncapi setRelayAdminToken maxLength). */
export const RELAY_ADMIN_TOKEN_MAX = 256;
/** Same-network badges in the public area (망 1, 망 2, …), cycled by number. */
export const NET_BADGE_COLORS: ReadonlyArray<{ bg: string; fg: string }> = [
  { bg: '#3794ff', fg: '#ffffff' },
  { bg: '#10a37f', fg: '#ffffff' },
  { bg: '#cc7a00', fg: '#ffffff' },
  { bg: '#9b4dca', fg: '#ffffff' },
  { bg: '#d14249', fg: '#ffffff' },
];
/** Connection-path badge in the public area (LAN = over UDP, 인터넷 = through the relay). */
export const VIA_BADGE_COLORS: Readonly<Record<'lan' | 'relay', { bg: string; fg: string }>> = {
  lan: { bg: '#2e7d32', fg: '#ffffff' },
  relay: { bg: '#5c6bc0', fg: '#ffffff' },
};
/** Top-right stack (update banner, install popup, people panel): room kept clear below it, CSS px. */
export const TOP_RIGHT_BOTTOM_RESERVE_PX = 64;
/** Top-right stack: above name tags, bubbles and room plates, below plate popups (46) and modals (50). */
export const TOP_RIGHT_Z_INDEX = 45;

// ── Theme (per viewer: dark = the original look, light = bright office + UI) ──
/** localStorage: 'dark' | 'light' | 'system'; unset = dark. */
export const THEME_STORAGE_KEY = 'pixel-office.theme';
/** `<meta name="theme-color">` per theme (= --color-bg). */
export const THEME_META_COLORS = { dark: '#1e1e2e', light: '#fcfcfd' } as const;
/**
 * Light-theme pixel transforms (office canvas only; characters/pets are never
 * transformed). HSL lightness l (0–1) becomes lo + (hi − lo)·(1 − (1 − l)^lift)
 * (lift > 1 brightens mid-tones more than near-black outlines/screens) and the
 * saturation is multiplied by `sat`, hue kept: the saved layout colors stay as
 * they are, only what is drawn changes. Tuned on the default office so the
 * four rooms and the corridor stay distinguishable.
 */
export const LIGHT_THEME_TRANSFORMS = {
  floor: { lo: 0.78, hi: 0.95, lift: 1, sat: 1 },
  wall: { lo: 0.74, hi: 0.96, lift: 1, sat: 0.3 },
  furniture: { lo: 0, hi: 1, lift: 1.6, sat: 0.95 },
} as const;
/** Editor grid / VOID outline on the canvas, per theme. */
export const GRID_LINE_COLORS = { dark: GRID_LINE_COLOR, light: 'rgba(0,0,0,0.14)' } as const;
export const VOID_TILE_OUTLINE_COLORS = {
  dark: VOID_TILE_OUTLINE_COLOR,
  light: 'rgba(0,0,0,0.12)',
} as const;

/** Transcript panel: within this many px of the bottom counts as "at the bottom" (keeps following new entries). */
export const TRANSCRIPT_FOLLOW_SLACK_PX = 24;
/** Transcript panel (left side, my agents only): default width; narrow screens use `100vw - 16px`. */
export const TRANSCRIPT_PANEL_WIDTH_PX = 480;
/** Transcript content zoom (%), separate from the office zoom: slider range, step, default. */
export const TRANSCRIPT_ZOOM_MIN = 50;
export const TRANSCRIPT_ZOOM_MAX = 200;
export const TRANSCRIPT_ZOOM_STEP = 10;
export const TRANSCRIPT_ZOOM_DEFAULT = 100;
/** The session window's context use turns to the warning colour from this full (%). */
export const CONTEXT_WARN_PCT = 80;
/** The session window's activity strip: this many minutes, one cell each; its height (px). */
export const ACTIVITY_STRIP_MINUTES = 30;
export const ACTIVITY_STRIP_HEIGHT_PX = 6;
/** It re-reads the clock this often (a new minute slides the cells). */
export const ACTIVITY_STRIP_TICK_MS = 15_000;
/** localStorage key: this viewer's transcript content zoom, %. */
export const TRANSCRIPT_ZOOM_KEY = 'pixel-office.transcript.zoom';
/** A tool input/result longer than this many lines is folded behind [더 보기]. */
export const TRANSCRIPT_FOLD_LINES = 12;
/** Above name tags, bubbles and room plates (≤ 43) and the chat bar; below plate popups (46) and modals. */
export const TRANSCRIPT_PANEL_Z_INDEX = 45;
/** Popout window: default size, and the BroadcastChannel its open ids are announced on. */
export const TRANSCRIPT_WINDOW_W_PX = 640;
export const TRANSCRIPT_WINDOW_H_PX = 820;
export const TRANSCRIPT_CHANNEL = 'pixel-office.transcripts';
/** A popout window re-announces its id this often; silent twice as long = gone. */
export const TRANSCRIPT_HEARTBEAT_MS = 2000;

// ── My avatar's lounge-agent list ─────────────────────────────
/** The list beside my avatar (my agents folded into it, click one = its transcript), CSS px. */
export const AVATAR_LIST_WIDTH_PX = 260;
/** Gap between the avatar's side and the list, and the list's margin inside the office view. */
export const AVATAR_LIST_GAP_PX = 12;
/** Like a plate popup: above tags, bubbles, plates and the transcript panel (45). */
export const AVATAR_LIST_Z_INDEX = 46;

/** Token usage size/burn thresholds: HEAT_SIZE_TOKENS / HEAT_BURN_RATES in core/src/lan.ts. */
export const USAGE_MODEL_COLORS = { opus: '#7c5cff', sonnet: '#4a9eff', haiku: '#3fb68b' } as const;
/** Burn tier 1 only; tiers 2/3 use the flame palettes. */
export const USAGE_BURN_COLORS = { 1: '#4aa8ff' } as const;
export const USAGE_FLAME_GOLD = ['#c08a10', '#e8b020', '#ffd23a', '#ffe88a', '#fffbe0'] as const;
export const USAGE_FLAME_FIRE = ['#c8101a', '#ff3b1a', '#ff8a1a', '#ffd23a', '#fff6c0'] as const;
/** Usage panel (📊, under the top-left buttons): default/min size, resize grips, the gap kept
 *  to the viewport's right/bottom edge, the remembered size and range, its token colours
 *  (per theme, index.css). */
export const USAGE_PANEL_DEFAULT_W_PX = 720;
export const USAGE_PANEL_DEFAULT_H_PX = 640;
export const USAGE_PANEL_MIN_W_PX = 360;
export const USAGE_PANEL_MIN_H_PX = 240;
export const USAGE_PANEL_EDGE_PX = 6;
export const USAGE_PANEL_CORNER_PX = 14;
export const USAGE_PANEL_MARGIN_PX = 8;
export const USAGE_PANEL_SIZE_KEY = 'pixel-office.usage.size';
export const USAGE_RANGE_KEY = 'pixel-office.usage.range';
export const USAGE_TOKEN_COLORS = {
  input: 'var(--usage-input)',
  output: 'var(--usage-output)',
  cacheCreate: 'var(--usage-cache-create)',
  cacheRead: 'var(--usage-cache-read)',
} as const;
/** Burn-rate dot of a now-panel row, by burn tier (0 = calm). */
export const USAGE_BURN_DOT = [
  'var(--color-text-muted)',
  USAGE_BURN_COLORS[1],
  USAGE_FLAME_GOLD[2],
  USAGE_FLAME_FIRE[1],
] as const;
/** Share-bar segments (projects/models/providers) cycle through these. */
export const USAGE_SHARE_COLORS = [
  'var(--usage-share-1)',
  'var(--usage-share-2)',
  'var(--usage-share-3)',
  'var(--usage-share-4)',
  'var(--usage-share-5)',
] as const;
/** SVG chart sizes (viewBox px, scaled to the window width). */
export const USAGE_CHART_W = 640;
export const USAGE_DAILY_H = 120;
export const USAGE_CACHE_H = 60;
export const USAGE_SHARE_H = 14;

// ── Lounge arcade (sitting at a cabinet opens the games, `lan/ArcadePanel.tsx`) ──
export const ARCADE_Z_INDEX = 48; // above the chat and top-left buttons, below modals (50)
/** Leaderboard rows shown per game. */
export const ARCADE_RANK_ROWS = 10;
export const ARCADE_LEADERBOARD_WIDTH_PX = 220;
/** How long a run waits for its relay ticket before it starts unranked. */
export const ARCADE_TICKET_WAIT_MS = 5000;
/** The arcade's "taken" notice: shown this long, this far above the bottom edge (over the chat bar). */
export const ARCADE_NOTICE_MS = 3500;
export const ARCADE_NOTICE_BOTTOM_PX = 64;
