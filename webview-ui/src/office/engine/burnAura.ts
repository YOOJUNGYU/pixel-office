// The burn border around my agents (token burn rate, lan/usageSignals.ts burnTier): tier 1 a
// static blue 1-px ring, tier 2 a low gold flame, tier 3 a red flame aura licking upward.
// Ported from the approved mockup (.superpowers/sdd/2026-11-12-token-usage/burn-aura-v4.html).
// Deterministic; cached per sprite, tier and frame.
import { USAGE_BURN_COLORS, USAGE_FLAME_FIRE, USAGE_FLAME_GOLD } from '../../constants.js';
import type { SpriteData } from '../types.js';

export const BURN_FRAME_SEC = 0.12;
export const BURN_FRAMES = 8;
/** Free sprite pixels around the silhouette: tongues rise ≤ 13 px above a 2-px grown body. */
const FLAME_PAD = 16;

type Aura = { data: SpriteData; pad: number };
const cache = new WeakMap<SpriteData, Map<string, Aura>>();

/** Sprite-pixel canvas of the border/aura for this silhouette, frame and tier (tier 1: frame
 *  ignored). Origin = sprite origin shifted by `pad` (returned) so it can be drawn behind the
 *  character. */
export function burnAuraSprite(sprite: SpriteData, tier: 1 | 2 | 3, frame: number): Aura {
  const key = tier === 1 ? '1' : `${tier}:${frame % BURN_FRAMES}`;
  let byKey = cache.get(sprite);
  if (!byKey) cache.set(sprite, (byKey = new Map()));
  const hit = byKey.get(key);
  if (hit) return hit;

  const h = sprite.length;
  const w = h ? sprite[0].length : 0;
  const pad = tier === 1 ? 1 : FLAME_PAD;
  const data: SpriteData = Array.from({ length: h + 2 * pad }, () =>
    Array<string>(w + 2 * pad).fill(''),
  );
  const solid = (x: number, y: number) => y >= 0 && y < h && x >= 0 && x < w && !!sprite[y][x];
  const touches = (x: number, y: number) =>
    solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1);
  const set = (x: number, y: number, c: string) => {
    const row = data[y + pad];
    if (row && x + pad >= 0 && x + pad < row.length) row[x + pad] = c;
  };
  // Pixels off the body within Manhattan distance r of it.
  const around = (r: number): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    for (let y = -r; y < h + r; y++)
      for (let x = -r; x < w + r; x++) {
        if (solid(x, y)) continue;
        let near = false;
        for (let dy = -r; dy <= r && !near; dy++)
          for (let dx = -r; dx <= r && !near; dx++)
            near = Math.abs(dx) + Math.abs(dy) <= r && solid(x + dx, y + dy);
        if (near) out.push([x, y]);
      }
    return out;
  };
  const ring = around(1);

  if (tier === 1) {
    for (const [x, y] of ring) set(x, y, USAGE_BURN_COLORS[1]);
  } else {
    const fl = tier === 3 ? USAGE_FLAME_FIRE : USAGE_FLAME_GOLD;
    const k = tier === 3 ? 1 : 0.4;
    const t = (frame % BURN_FRAMES) * 0.9;
    const grown = tier === 3 ? around(2) : ring;
    const top0 = Math.max(
      0,
      sprite.findIndex((row) => row.some(Boolean)),
    );
    const cx = (w - 1) / 2;
    // Body of the aura: orange next to the body, dark red outside.
    const top = new Map<number, number>();
    for (const [x, y] of grown) {
      if (!top.has(x) || y < top.get(x)!) top.set(x, y);
      set(x, y, touches(x, y) ? fl[2] : fl[1]);
    }
    // Tongues: tall in the middle, every column flickers on its own.
    for (const [x, ty] of top) {
      const c = Math.abs(x - cx);
      const th = Math.max(
        1,
        Math.round(
          k * (9 - c * 1.3) +
            2.2 * k * Math.sin(t * 1.9 + x * 2.1) +
            1.3 * Math.sin(t * 3.7 + x * 0.7),
        ),
      );
      for (let i = 1; i <= th; i++) {
        const f = i / th;
        set(x, ty - i, f > 0.8 ? fl[0] : f > 0.5 ? fl[1] : f > 0.25 ? fl[2] : fl[3]);
      }
    }
    // Side licks rising off the arms and legs.
    if (tier === 3)
      for (const [x, y] of grown) {
        if (y < top0 + 2) continue;
        const side = x < w / 2 ? -1 : 1;
        if (Math.sin(t * 2.9 + y * 1.7 + x * 0.9) > 0.35) {
          set(x + side, y - 1, fl[1]);
          if (Math.sin(t * 4.1 + y) > 0.6) set(x + side, y - 2, fl[0]);
        }
      }
    // White-hot core hugging the silhouette (both flame tiers, as in the mockup).
    for (const [x, y] of ring) if (Math.sin(t * 5 + x * 3 + y * 2) > 0.2) set(x, y, fl[4]);
    // Sparks drifting up.
    for (let i = 0; i < (tier === 3 ? 4 : 1); i++) {
      const sx = -1 + ((i * 3 + Math.floor(t * 2)) % (w + 2));
      const sy = top0 - 20 + Math.floor(20 - ((t * 3 + i * 4) % 9));
      set(sx, sy, i % 2 ? fl[3] : fl[4]);
    }
  }
  const out = { data, pad };
  byKey.set(key, out);
  return out;
}
