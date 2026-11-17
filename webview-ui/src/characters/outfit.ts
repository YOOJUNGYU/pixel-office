// A person's wardrobe look (core Outfit: part ids + '#rrggbb' colours, as profiles and peers
// carry it) as the ported pixel-agents renderer's profile, and as office sprites. The
// wardrobe loads once, in the background: until then (and for a look it cannot draw) callers
// fall back to the palette character.
import { rgbaToHex } from '../../../core/src/assets/colorUtils.js';
import type { Outfit, OutfitColorKey } from '../../../core/src/lan.js';
import { OUTFIT_COLOR_KEYS, OUTFIT_SLOTS } from '../../../core/src/lan.js';
import { requestRender } from '../office/engine/gameLoop.js';
import type { SpriteData } from '../office/types.js';
import { loadWardrobe } from './loadWardrobe.js';
import { CharacterRenderer } from './renderer.js';
import { SHEET_FRAMES_PER_ROW, SHEET_W } from './sheet.js';
import { colorArt, type ColorKey, type RenderProfile, startingUtop, UNDERWEAR } from './slots.js';
import type { CharacterColor } from './types.js';

let renderer: CharacterRenderer | null = null;
const listeners = new Set<() => void>();

/** Start loading the wardrobe (once); every listener runs when it is ready. */
export function startWardrobe(): void {
  void loadWardrobe()
    .then((w) => {
      renderer = new CharacterRenderer(w);
      for (const l of listeners) l();
      requestRender('wardrobe');
    })
    .catch((err: unknown) => console.error('[Webview] wardrobe failed to load:', err));
}

export const wardrobeRenderer = (): CharacterRenderer | null => renderer;

/** Run `fn` once the wardrobe is ready (now, if it is). Returns the unsubscribe. */
export function onWardrobe(fn: () => void): () => void {
  if (renderer) fn();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** A swatch '#rrggbb' as the colour the renderer wears for `key`: the part's own colourway
 *  when the hex is one of its palette squares, else fitted to the part's shading. */
function colorFor(r: CharacterRenderer, p: RenderProfile, key: ColorKey, hex: string) {
  const art = colorArt(p, key);
  const pal = r.paletteFor(art);
  const i = pal ? pal.squares.findIndex((sq) => sq.hex.toLowerCase() === hex) : -1;
  return pal && i >= 0 ? pal.row[i] : r.swatchValue(art, hex, key);
}

/** The renderer's profile for an outfit (the underwear follows the body). */
export function outfitProfile(r: CharacterRenderer, o: Outfit): RenderProfile {
  const p: RenderProfile = { body: o.body, under: UNDERWEAR, utop: startingUtop(o.body) };
  if (o.eyes) p.eyeShape = o.eyes;
  for (const slot of OUTFIT_SLOTS) {
    const id = o.parts?.[slot];
    if (id) p[slot] = id;
  }
  const colors: Record<string, CharacterColor> = {};
  for (const key of OUTFIT_COLOR_KEYS) {
    const hex = o.colors?.[key];
    if (hex) colors[key] = colorFor(r, p, key as ColorKey, hex);
  }
  p.colors = colors;
  return p;
}

/** The composed RGBA sheet of an outfit, or null before the wardrobe is ready. */
export function outfitSheet(o: Outfit): Uint8ClampedArray | null {
  return renderer ? renderer.sheet(outfitProfile(renderer, o)) : null;
}

/** Per-direction frames (down, up, right x the office's 7) of a composed sheet. */
export interface OutfitFrames {
  down: SpriteData[];
  up: SpriteData[];
  right: SpriteData[];
}

const FRAME_W = 16;
const FRAME_H = 32;
/** The office's frames per row (walk1-3, type1-2, read1-2): the sheet's seated 8th is unused. */
const OFFICE_FRAMES = 7;

function sheetFrames(d: Uint8ClampedArray): OutfitFrames {
  const out: OutfitFrames = { down: [], up: [], right: [] };
  (['down', 'up', 'right'] as const).forEach((dir, row) => {
    for (let f = 0; f < OFFICE_FRAMES && f < SHEET_FRAMES_PER_ROW; f++) {
      const frame: SpriteData = [];
      for (let y = 0; y < FRAME_H; y++) {
        const line: string[] = [];
        for (let x = 0; x < FRAME_W; x++) {
          const i = ((row * FRAME_H + y) * SHEET_W + f * FRAME_W + x) * 4;
          line.push(rgbaToHex(d[i], d[i + 1], d[i + 2], d[i + 3]));
        }
        frame.push(line);
      }
      out[dir].push(frame);
    }
  });
  return out;
}

/** Stable cache key of an outfit (its content). */
export const outfitKey = (o: Outfit): string => JSON.stringify(o);

const frameCache = new Map<string, OutfitFrames>();
const FRAME_CACHE_MAX = 200;

/** An outfit's office frames, or null before the wardrobe is ready. Cached per outfit. */
export function outfitFrames(o: Outfit): OutfitFrames | null {
  if (!renderer) return null;
  const key = outfitKey(o);
  let f = frameCache.get(key);
  if (!f) {
    const sheet = outfitSheet(o);
    if (!sheet) return null;
    f = sheetFrames(sheet);
    if (frameCache.size >= FRAME_CACHE_MAX) frameCache.clear();
    frameCache.set(key, f);
  }
  return f;
}

/** The default look a new outfit starts from: the flat body, short hair, a tee, jeans, sneakers. */
export const DEFAULT_OUTFIT: Outfit = {
  body: 'flat',
  parts: { hair: 'short', top: 'tshirt', pants: 'jeans', shoes: 'sneakers' },
};

export type { OutfitColorKey };
