import { useCallback, useEffect, useRef, useState } from 'react';

import { transport } from '../transport/index.js';
import type { TranscriptState } from './transcript.js';
import { openState, reduceTranscript } from './transcript.js';

/**
 * The transcripts this window follows, in open order (several at once: one dialog each,
 * or the single one of a popout window). The server keeps one subscription per id.
 */
export function useTranscripts(): {
  list: TranscriptState[];
  open(id: string): void;
  close(id: string): void;
  closeAll(): void;
  loadEarlier(id: string): void;
} {
  const [list, setList] = useState<TranscriptState[]>([]);
  const ref = useRef<TranscriptState[]>([]);
  const set = useCallback((next: TranscriptState[]) => {
    ref.current = next;
    setList(next);
  }, []);

  useEffect(
    () =>
      transport.onMessage((msg) => {
        const m = msg as unknown as Record<string, unknown>;
        if (m.type === 'officeAccess') {
          // Reconnect: the server forgot our subscriptions.
          for (const s of ref.current) transport.send({ type: 'openTranscript', id: s.id });
        } else if (typeof m.type === 'string' && m.type.startsWith('transcript')) {
          const next = ref.current.map((s) => reduceTranscript(s, m) ?? s);
          if (next.some((s, i) => s !== ref.current[i])) set(next);
        }
      }),
    [set],
  );

  const open = useCallback(
    (id: string) => {
      if (ref.current.some((s) => s.id === id)) return;
      set([...ref.current, openState(id)]);
      transport.send({ type: 'openTranscript', id });
    },
    [set],
  );
  const close = useCallback(
    (id: string) => {
      transport.send({ type: 'closeTranscript', id });
      set(ref.current.filter((s) => s.id !== id));
    },
    [set],
  );
  const closeAll = useCallback(() => {
    if (!ref.current.length) return;
    transport.send({ type: 'closeTranscript' });
    set([]);
  }, [set]);
  const loadEarlier = useCallback(
    (id: string) => {
      const s = ref.current.find((x) => x.id === id);
      if (!s || s.loading || !s.more) return;
      set(ref.current.map((x) => (x.id === id ? { ...x, loading: true } : x)));
      transport.send({ type: 'loadTranscriptBefore', id, before: s.start });
    },
    [set],
  );

  return { list, open, close, closeAll, loadEarlier };
}
