import type { OfficeAgent } from '../../../core/src/lan.js';
import type { TranscriptEntry, TranscriptInfo } from '../../../core/src/messages.js';
import {
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
  /** How full its context window is (transcriptContext); kept across reloads of the page. */
  context?: { used: number; window: number };
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
        ...(s.context && { context: s.context }),
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
    case 'transcriptContext':
      return { ...s, context: { used: msg.used as number, window: msg.window as number } };
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

/** "165k / 1M · 17%" for a context window's use, and how full it is (%). */
export function contextText(c: { used: number; window: number }): { text: string; pct: number } {
  const short = (n: number) =>
    n >= 1_000_000
      ? `${String(Math.round(n / 100_000) / 10)}M`
      : n >= 1000
        ? `${String(Math.round(n / 1000))}k`
        : String(n);
  const pct = Math.min(100, Math.round((c.used / c.window) * 100));
  return { text: `${short(c.used)} / ${short(c.window)} · ${String(pct)}%`, pct };
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
