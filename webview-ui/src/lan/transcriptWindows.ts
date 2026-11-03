// Where transcripts open (in-page dialog or popout window, per viewer), and which ids
// popout windows have open (announced over a BroadcastChannel, so the office outlines them).
import { useEffect, useState } from 'react';

import {
  TRANSCRIPT_CHANNEL,
  TRANSCRIPT_HEARTBEAT_MS,
  TRANSCRIPT_OPEN_IN_KEY,
  TRANSCRIPT_WINDOW_H_PX,
  TRANSCRIPT_WINDOW_W_PX,
} from '../constants.js';

export type OpenIn = 'dialog' | 'window';
export const OPEN_IN: readonly OpenIn[] = ['dialog', 'window'];

/** The URL query a popout window carries its agent id in. */
const PARAM = 'transcript';

export function getOpenIn(): OpenIn {
  try {
    return localStorage.getItem(TRANSCRIPT_OPEN_IN_KEY) === 'window' ? 'window' : 'dialog';
  } catch {
    return 'dialog';
  }
}

export function setOpenIn(v: OpenIn): void {
  try {
    localStorage.setItem(TRANSCRIPT_OPEN_IN_KEY, v);
  } catch {
    // blocked: the choice just is not kept
  }
}

/** This window is a popout: the agent id it shows, else null. */
export function popoutId(search: string = window.location.search): string | null {
  return new URLSearchParams(search).get(PARAM);
}

/** Opens (or focuses: one window per id) the popout window of transcript `id`. */
export function openPopout(id: string): void {
  const url = `${window.location.pathname}?${PARAM}=${encodeURIComponent(id)}`;
  const name = `po-transcript-${id.replace(/[^\w-]/g, '_')}`;
  const w = window.open(
    url,
    name,
    `popup,width=${String(TRANSCRIPT_WINDOW_W_PX)},height=${String(TRANSCRIPT_WINDOW_H_PX)}`,
  );
  w?.focus();
}

type Note = { id: string; open: boolean };
const channel = (): BroadcastChannel | null =>
  typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(TRANSCRIPT_CHANNEL);

/** Popout side: announce `id` as open (heartbeat) until this window goes. */
export function useAnnounce(id: string): void {
  useEffect(() => {
    const ch = channel();
    if (!ch) return;
    const say = (open: boolean) => ch.postMessage({ id, open } satisfies Note);
    say(true);
    const timer = setInterval(() => say(true), TRANSCRIPT_HEARTBEAT_MS);
    const bye = () => say(false);
    window.addEventListener('pagehide', bye);
    return () => {
      clearInterval(timer);
      window.removeEventListener('pagehide', bye);
      bye();
      ch.close();
    };
  }, [id]);
}

/** Office side: the ids popout windows have open now (silent ones drop after 2 beats). */
export function usePopoutIds(): string[] {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    const ch = channel();
    if (!ch) return;
    const seen = new Map<string, number>();
    const publish = () =>
      setIds((prev) => {
        const next = [...seen.keys()].sort();
        return next.join('\n') === prev.join('\n') ? prev : next;
      });
    ch.onmessage = (e: MessageEvent<Note>) => {
      if (typeof e.data?.id !== 'string') return;
      if (e.data.open) seen.set(e.data.id, Date.now());
      else seen.delete(e.data.id);
      publish();
    };
    const sweep = setInterval(() => {
      const now = Date.now();
      for (const [id, at] of seen) if (now - at > 2 * TRANSCRIPT_HEARTBEAT_MS) seen.delete(id);
      publish();
    }, TRANSCRIPT_HEARTBEAT_MS);
    return () => {
      clearInterval(sweep);
      ch.close();
    };
  }, []);
  return ids;
}
