/// <reference lib="dom" />
/// <reference types="vite/client" />
// Adapted from pixel-agents (MIT, Copyright (c) 2026 Pablo De Lucca), webview-ui/src/characters/.
/**
 * Decode the wardrobe in the browser. Every art/ PNG is inlined into the bundle as a data
 * URI: a canvas can read a data: image back, while one served from another origin (VS
 * Code's webview resource host) would taint it.
 */

import manifest from './art/wardrobe.json';
import { EYE_FOLDERS } from './slots.js';
import { decodeWardrobe, parseWardrobeManifest, type Rgba, type Wardrobe } from './wardrobe.js';

/** './art/hair/bob.png' → data URI. */
const pngs = import.meta.glob<string>('./art/**/*.png', {
  eager: true,
  query: '?inline',
  import: 'default',
});

export async function decodePng(url: string): Promise<Rgba> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, img.width, img.height);
}

let loading: Promise<Wardrobe> | null = null;

/** The wardrobe, decoded once. */
export function loadWardrobe(): Promise<Wardrobe> {
  loading ??= Promise.all(
    Object.entries(pngs).map(
      async ([file, url]) =>
        [file.replace(/^\.\/art\//, '').replace(/\.png$/, ''), await decodePng(url)] as const,
    ),
  ).then((files) => decodeWardrobe(parseWardrobeManifest(manifest), new Map(files), EYE_FOLDERS));
  return loading;
}
