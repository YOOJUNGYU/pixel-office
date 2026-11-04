// A soft pixel halo around a working PC (front: monitor and keyboard; 서버실's side PCs:
// monitor and tower), drawn just behind it: the sprite's silhouette grown by PC_GLOW_RADIUS,
// the colour fading with the distance. Cached per sprite, colour and alpha step.
import { PC_GLOW_RADIUS, PC_TINT_LIFT, PC_TINT_MIN_LUMA } from '../../constants.js';
import type { SpriteData } from '../types.js';

const cache = new WeakMap<SpriteData, Map<string, SpriteData>>();
const hex2 = (a: number) =>
  Math.round(Math.max(0, Math.min(1, a)) * 255)
    .toString(16)
    .padStart(2, '0');

/** `base`'s halo in `color` (#rrggbb) at `alpha` (0..1), PC_GLOW_RADIUS px larger on each side. */
export function glowSprite(base: SpriteData, color: string, alpha: number): SpriteData {
  const key = `${color}${hex2(alpha)}`;
  let byKey = cache.get(base);
  if (!byKey) cache.set(base, (byKey = new Map()));
  const hit = byKey.get(key);
  if (hit) return hit;
  const r = PC_GLOW_RADIUS;
  const h = base.length;
  const w = h ? base[0].length : 0;
  // Chebyshev distance to the nearest opaque pixel, within r.
  const dist = Array.from({ length: h + 2 * r }, () => Array<number>(w + 2 * r).fill(Infinity));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!base[y][x]) continue;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          const row = dist[y + r + dy];
          if (d < row[x + r + dx]) row[x + r + dx] = d;
        }
    }
  const out = dist.map((row) =>
    row.map((d) => (d === Infinity ? '' : `${color}${hex2(alpha * (1 - (d - 1) / r))}`)),
  );
  byKey.set(key, out);
  return out;
}

const tints = new WeakMap<SpriteData, Map<string, SpriteData>>();
const rgb = (hex: string): [number, number, number] | null => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
};
const toHex = (c: number[]) =>
  `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** `base` with its light pixels (the white / light-grey case and monitor frame) lit in `color`:
 *  mixed `amount` (0..1) toward the colour lifted by PC_TINT_LIFT toward white. Dark pixels
 *  (outlines, a dark screen) stay. Cached per sprite, colour and amount. */
export function tintSprite(base: SpriteData, color: string, amount: number): SpriteData {
  const key = `${color}${hex2(amount)}`;
  let byKey = tints.get(base);
  if (!byKey) tints.set(base, (byKey = new Map()));
  const hit = byKey.get(key);
  if (hit) return hit;
  const c = rgb(color) ?? [255, 255, 255];
  const target = c.map((v) => v + (255 - v) * PC_TINT_LIFT);
  const out = base.map((row) =>
    row.map((px) => {
      const p = px ? rgb(px) : null;
      if (!p) return px;
      const luma = (0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]) / 255;
      if (luma < PC_TINT_MIN_LUMA) return px;
      return toHex(p.map((v, i) => v + (target[i] - v) * amount));
    }),
  );
  byKey.set(key, out);
  return out;
}
