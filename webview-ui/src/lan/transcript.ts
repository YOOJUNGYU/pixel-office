import type { TranscriptEntry, TranscriptInfo } from '../../../core/src/messages.js';
import {
  TRANSCRIPT_FOLLOW_SLACK_PX,
  TRANSCRIPT_PANEL_EDGE_PX,
  TRANSCRIPT_PANEL_MIN_WIDTH_PX,
  TRANSCRIPT_PANEL_WIDTH_PX,
} from '../constants.js';

export interface TranscriptState {
  id: string;
  info?: TranscriptInfo;
  entries: TranscriptEntry[];
  start: number;
  more: boolean;
  loading: boolean;
  error?: 'notFound' | 'unreadable' | 'ended';
}

export function openState(id: string): TranscriptState {
  return { id, entries: [], start: 0, more: false, loading: true };
}

/** Applies a transcript* server message; other ids and other types leave the state as is. */
export function reduceTranscript(
  s: TranscriptState | null,
  msg: Record<string, unknown>,
): TranscriptState | null {
  if (!s || msg.id !== s.id) return s;
  const entries = msg.entries as TranscriptEntry[];
  switch (msg.type) {
    case 'transcriptLoaded':
      return {
        id: s.id,
        info: msg.info as TranscriptInfo,
        entries,
        start: msg.start as number,
        more: msg.more as boolean,
        loading: false,
      };
    case 'transcriptEarlier':
      return {
        ...s,
        entries: [...entries, ...s.entries],
        start: msg.start as number,
        more: msg.more as boolean,
        loading: false,
      };
    case 'transcriptAppend':
      return { ...s, entries: [...s.entries, ...entries] };
    case 'transcriptError':
      return { ...s, loading: false, error: msg.reason as TranscriptState['error'] };
    default:
      return s;
  }
}

export function isAtBottom(scrollTop: number, clientHeight: number, scrollHeight: number): boolean {
  return scrollHeight - scrollTop - clientHeight <= TRANSCRIPT_FOLLOW_SLACK_PX;
}

/** The first `lines` lines of a long tool input/result, and how many lines are left out. */
export function foldText(text: string, lines: number): { shown: string; hidden: number } {
  const all = text.split('\n');
  return { shown: all.slice(0, lines).join('\n'), hidden: Math.max(0, all.length - lines) };
}

/** Which side of my avatar the lounge-agent list goes: right when it fits in the viewport. */
export function listSide(
  avatarScreenX: number,
  listWidth: number,
  viewportWidth: number,
  gap: number,
): 'right' | 'left' {
  return avatarScreenX + gap + listWidth <= viewportWidth ? 'right' : 'left';
}

/** A dragged / saved panel width kept between the minimum and the window (a bad value → the default). */
export function clampPanelWidth(width: number, viewport: number): number {
  if (!Number.isFinite(width)) width = TRANSCRIPT_PANEL_WIDTH_PX;
  const max = Math.max(TRANSCRIPT_PANEL_MIN_WIDTH_PX, viewport - TRANSCRIPT_PANEL_EDGE_PX);
  return Math.round(Math.min(max, Math.max(TRANSCRIPT_PANEL_MIN_WIDTH_PX, width)));
}
