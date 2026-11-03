import type { TranscriptEntry, TranscriptInfo } from '../../../core/src/messages.js';
import { TRANSCRIPT_FOLLOW_SLACK_PX } from '../constants.js';

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
