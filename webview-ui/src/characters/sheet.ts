// Adapted from pixel-agents (MIT, Copyright (c) 2026 Pablo De Lucca), characters/sheet.ts.
/**
 * Wardrobe sheet geometry: a 128x96 RGBA sheet of 24 frames (3 direction rows: down, up,
 * right x 8 frames: walk1-3, type1-2, read1-2, seated), each 16x32 pixels indexed y * 16 + x.
 * The office uses the first 7 frames of each row (no seated frame).
 */
import {
  CHAR_FRAME_H,
  CHAR_FRAME_W,
  PNG_ALPHA_THRESHOLD,
} from '../../../core/src/assets/constants.js';

/** Frames per sheet row (the 8th, seated, is unused by the office). */
export const SHEET_FRAMES_PER_ROW = 8;
export const SHEET_W = CHAR_FRAME_W * SHEET_FRAMES_PER_ROW;
export const SHEET_H = CHAR_FRAME_H * 3;

/** Whether an alpha value draws (lower ones are empty). */
export const isOpaque = (alpha: number) => alpha >= PNG_ALPHA_THRESHOLD;

/** Byte offset of pixel `i` (y * 16 + x) of sheet frame `ci` (row * 8 + frame). */
export const cellAt = (ci: number, i: number) =>
  ((Math.floor(ci / SHEET_FRAMES_PER_ROW) * CHAR_FRAME_H + Math.floor(i / CHAR_FRAME_W)) * SHEET_W +
    (ci % SHEET_FRAMES_PER_ROW) * CHAR_FRAME_W +
    (i % CHAR_FRAME_W)) *
  4;
