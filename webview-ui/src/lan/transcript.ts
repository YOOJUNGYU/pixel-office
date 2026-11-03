import type { OfficeAgent } from '../../../core/src/lan.js';
import type { TranscriptEntry, TranscriptInfo } from '../../../core/src/messages.js';
import {
  TRANSCRIPT_DIALOG_KEEP_PX,
  TRANSCRIPT_DIALOG_MIN_H_PX,
  TRANSCRIPT_DIALOG_MIN_W_PX,
  TRANSCRIPT_FOLLOW_SLACK_PX,
  TRANSCRIPT_ZOOM_DEFAULT,
  TRANSCRIPT_ZOOM_MAX,
  TRANSCRIPT_ZOOM_MIN,
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

/** A typed / saved content zoom (%) as a whole number within the range (bad → the default). */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return TRANSCRIPT_ZOOM_DEFAULT;
  return Math.round(Math.min(TRANSCRIPT_ZOOM_MAX, Math.max(TRANSCRIPT_ZOOM_MIN, zoom)));
}

/** What the agent behind an open transcript is doing now (no agent = it ended). */
export type TranscriptStatus = 'waiting' | 'thinking' | 'working' | 'idle' | 'ended';
export function transcriptStatus(
  a: Pick<OfficeAgent, 'act' | 'target' | 'permission'> | undefined,
): TranscriptStatus {
  if (!a) return 'ended';
  if (a.permission) return 'waiting';
  if (a.act === 'idle') return 'idle';
  // A turn with no tool running yet (setThinking: act 'tool', no target) = thinking.
  return a.act === 'tool' && !a.target ? 'thinking' : 'working';
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A dialog's box kept usable: at least the minimum size, no bigger than the window, and
 *  enough of it (its header) on screen to grab it again. */
export function clampRect(r: Rect, view: { w: number; h: number }): Rect {
  const w = Math.round(Math.max(TRANSCRIPT_DIALOG_MIN_W_PX, Math.min(r.w, view.w)));
  const h = Math.round(Math.max(TRANSCRIPT_DIALOG_MIN_H_PX, Math.min(r.h, view.h)));
  const x = Math.round(
    Math.min(Math.max(r.x, TRANSCRIPT_DIALOG_KEEP_PX - w), view.w - TRANSCRIPT_DIALOG_KEEP_PX),
  );
  const y = Math.round(Math.min(Math.max(r.y, 0), view.h - TRANSCRIPT_DIALOG_KEEP_PX));
  return { x, y, w, h };
}
