// What a front-facing PC shows while its agent works: code (edit), a terminal (run) or a
// document (reading, searching, the web). 10×5 screen frames painted over the PC's "on"
// sprite; other acts keep the PC's own on-animation.
import type { OfficeAgent } from '../../../../core/src/lan.js';
import { PC_SCREEN_COLORS, PC_SCREEN_ORIGIN } from '../../constants.js';
import type { SpriteData } from '../types.js';

export type ScreenKind = 'code' | 'term' | 'doc';

/** One string per screen row; each letter = a PC_SCREEN_COLORS key. Frames loop. */
export const SCREENS: Record<ScreenKind, readonly (readonly string[])[]> = {
  code: [
    ['kkkkkkkkkk', 'kggggkkkkk', 'kkkGGGGgkk', 'kkkGGkkkkk', 'kgggkkkkkk'],
    ['kkkkkkkkkk', 'kkkGGGGgkk', 'kkkGGkkkkk', 'kgggkkkkkk', 'kkkgggGGkk'],
    ['kkkkkkkkkk', 'kkkGGkkkkk', 'kgggkkkkkk', 'kkkgggGGkk', 'kggggggkkk'],
  ],
  term: [
    ['bbbbbbbbbb', 'bwwwbwwbbb', 'bwwwwwbbbb', 'bcbbbbbbbb', 'bbbbbbbbbb'],
    ['bbbbbbbbbb', 'bwwwbwwbbb', 'bwwwwwbbbb', 'bbbbbbbbbb', 'bbbbbbbbbb'],
    ['bbbbbbbbbb', 'bwwwwwbbbb', 'bwwbwwwbbb', 'bcbbbbbbbb', 'bbbbbbbbbb'],
  ],
  doc: [
    ['pppppppppp', 'phhhhhpppp', 'plllllllpp', 'pllllllppp', 'plllllllpp'],
    ['pppppppppp', 'plllllllpp', 'pllllllppp', 'plllllllpp', 'pllllppppp'],
    ['pppppppppp', 'pllllllppp', 'plllllllpp', 'pllllppppp', 'phhhhhpppp'],
  ],
};

/** The screen an agent's act shows; null = the PC's own animation. */
export function screenKind(a: Pick<OfficeAgent, 'act' | 'hidden'>): ScreenKind | null {
  if (a.hidden) return null;
  switch (a.act) {
    case 'edit':
      return 'code';
    case 'run':
      return 'term';
    case 'read':
    case 'search':
    case 'find':
    case 'web':
    case 'fetch':
    case 'mcp':
    case 'image':
      return 'doc';
    default:
      return null;
  }
}

const cache = new WeakMap<SpriteData, Map<string, SpriteData>>();

/** `base` (a PC "on" sprite) with screen `kind` frame `frame` painted in; cached. */
export function screenSprite(base: SpriteData, kind: ScreenKind, frame: number): SpriteData {
  const frames = SCREENS[kind];
  const f = ((frame % frames.length) + frames.length) % frames.length;
  const key = `${kind}${String(f)}`;
  let byKey = cache.get(base);
  if (!byKey) cache.set(base, (byKey = new Map()));
  let s = byKey.get(key);
  if (!s) {
    s = base.map((row) => [...row]);
    frames[f].forEach((row, dy) => {
      for (let dx = 0; dx < row.length; dx++) {
        const color = PC_SCREEN_COLORS[row[dx]];
        const y = PC_SCREEN_ORIGIN.y + dy;
        const x = PC_SCREEN_ORIGIN.x + dx;
        if (color && s![y]?.[x] !== undefined) s![y][x] = color;
      }
    });
    byKey.set(key, s);
  }
  return s;
}
