// An agent's speech bubble: a header (provider badge + act icon | session title | todo +
// elapsed) over the activity text at the bubble's full width. Pure geometry.
import {
  ACT_ICON_INLINE_PX,
  CHAT_BORDER_PX,
  LAN_ACTIVITY_LINE_PX,
  LAN_ACTIVITY_MAX_LINES,
  LAN_ACTIVITY_MAX_WIDTH_PX,
  LAN_ACTIVITY_PAD_X_PX,
  LAN_ACTIVITY_PAD_Y_PX,
  LAN_BUBBLE_HEADER_GAP_PX,
  LAN_TAG_BADGE_CHROME_PX,
  LAN_TAG_LINE_PX,
  STATUS_CHIP_PAD_X_PX,
  STATUS_PART_GAP_PX,
} from '../constants.js';
import { clampRows, wrapLines } from './chat.js';

export interface BubbleParts {
  provider: string;
  icon: boolean;
  /** The session title ('' = none: the centre stays empty). */
  title: string;
  todo: string;
  elapsed: string;
  text: string;
  /** Wrap the text to ≤ LAN_ACTIVITY_MAX_LINES (else one clipped line). */
  wrap: boolean;
}

export interface BubbleMeasures {
  text: (s: string) => number;
  badge: (s: string) => number;
  chip: (s: string) => number;
  title: (s: string) => number;
}

export interface BubbleLayout {
  /** Unscaled outer size (CSS px, border included). */
  w: number;
  h: number;
  /** The body's lines (wrap), else undefined = one line clipped with an ellipsis. */
  rows?: string[];
}

export function agentBubbleLayout(p: BubbleParts, m: BubbleMeasures): BubbleLayout {
  const chrome = 2 * (LAN_ACTIVITY_PAD_X_PX + CHAT_BORDER_PX);
  const inner = LAN_ACTIVITY_MAX_WIDTH_PX - chrome;
  const chip = (s: string) => (s ? m.chip(s) + 2 * STATUS_CHIP_PAD_X_PX + STATUS_PART_GAP_PX : 0);
  const header =
    LAN_TAG_BADGE_CHROME_PX +
    m.badge(p.provider) +
    (p.icon ? STATUS_PART_GAP_PX + ACT_ICON_INLINE_PX : 0) +
    (p.title ? STATUS_PART_GAP_PX + m.title(p.title) : 0) +
    chip(p.todo) +
    chip(p.elapsed);
  const rows = p.wrap
    ? clampRows(wrapLines(p.text, inner, m.text), LAN_ACTIVITY_MAX_LINES, inner, m.text)
    : undefined;
  const body = Math.max(...(rows ?? [p.text]).map(m.text));
  const lines = rows?.length ?? 1;
  return {
    // The title shrinks first: the header never widens the bubble past the max.
    w: Math.min(LAN_ACTIVITY_MAX_WIDTH_PX, chrome + Math.max(header, body)),
    h:
      LAN_TAG_LINE_PX +
      LAN_BUBBLE_HEADER_GAP_PX +
      lines * (lines > 1 ? LAN_ACTIVITY_LINE_PX : LAN_TAG_LINE_PX) +
      2 * (LAN_ACTIVITY_PAD_Y_PX + CHAT_BORDER_PX),
    rows,
  };
}
