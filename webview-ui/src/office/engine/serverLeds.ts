// 서버실 PCs blink while a command runs there: the PC_SIDE sprite with its LED pixels lit,
// each PC at its own step of the pattern so the room flickers instead of pulsing in sync.
import { SERVER_LED_PATTERNS, SERVER_LED_PIXELS } from '../../constants.js';
import type { SpriteData } from '../types.js';

/** Which LEDs are lit for the PC at (col, row) on furniture tick `frame` (bit i = LED i). */
export function ledMask(col: number, row: number, frame: number): number {
  const phase = (col * 7 + row * 13) >>> 0;
  let mask = 0;
  SERVER_LED_PATTERNS.forEach((p, i) => {
    if (p[(frame + phase + i * 3) % p.length] === '1') mask |= 1 << i;
  });
  return mask;
}

const cache = new WeakMap<SpriteData, Map<number, SpriteData>>();

/** `base` with the LEDs of `mask` lit (cached per sprite and mask; mask 0 = `base`). */
export function ledSprite(base: SpriteData, mask: number): SpriteData {
  if (!mask) return base;
  let byMask = cache.get(base);
  if (!byMask) cache.set(base, (byMask = new Map()));
  let s = byMask.get(mask);
  if (!s) {
    s = base.map((row) => [...row]);
    SERVER_LED_PIXELS.forEach((led, i) => {
      if (mask & (1 << i) && s![led.y]?.[led.x] !== undefined) s![led.y][led.x] = led.color;
    });
    byMask.set(mask, s);
  }
  return s;
}
