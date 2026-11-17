// Adapted from pixel-agents (MIT, Copyright (c) 2026 Pablo De Lucca), core/src/characterProfiles.ts:
// the character model the wardrobe renderer draws. Pixel edits and custom items are not ported.

/** A part's colour: HSBC sliders, optionally on top of one of the part's exact colourways. */
export interface CharacterColor {
  h: number;
  s: number;
  b: number;
  c: number;
  colorize?: boolean;
  palette?: string;
}

/** Pixel edits are not ported; the type stays so the renderer's edit hooks compile to no-ops. */
export interface CharacterPixelEdits {
  cells: Record<string, Record<string, string | null>>;
}

/** Profile fields that hold a wardrobe part id (one per slot). */
export const CHARACTER_SLOTS = [
  'body',
  'utop',
  'under',
  'hair',
  'beard',
  'top',
  'jacket',
  'pants',
  'shoes',
  'full',
  'hat',
  'necklace',
  'lanyard',
  'earrings',
  'shades',
  'hairshades',
  'watch',
] as const;
export type CharacterSlot = (typeof CHARACTER_SLOTS)[number];

/** Which eye pixel takes the eye colour. */
export const EYE_ROWS = ['top', 'bottom', 'both'] as const;
export type EyeRows = (typeof EYE_ROWS)[number];
export const DEFAULT_EYE_ROWS: EyeRows = 'bottom';

/** A character the renderer composes: a part id per slot, its colours (never edits here). */
export type CharacterProfile = { body: string; eyeShape?: string; eyeRows?: EyeRows } & {
  [K in Exclude<CharacterSlot, 'body'>]?: string;
} & {
  colors?: Record<string, CharacterColor>;
  edits?: Record<string, CharacterPixelEdits>;
};

/** A pixel set's id ('<piece>:<part id>'). */
export const pixId = (set: string, id: string): string => `${set}:${id}`;

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
