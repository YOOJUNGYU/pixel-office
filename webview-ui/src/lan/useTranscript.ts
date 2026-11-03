import { useCallback, useEffect, useRef, useState } from 'react';

import { transport } from '../transport/index.js';
import type { TranscriptState } from './transcript.js';
import { openState, reduceTranscript } from './transcript.js';

export function useTranscript(): {
  state: TranscriptState | null;
  open(id: string): void;
  close(): void;
  loadEarlier(): void;
} {
  const [state, setState] = useState<TranscriptState | null>(null);
  const ref = useRef<TranscriptState | null>(null);
  const set = useCallback((s: TranscriptState | null) => {
    ref.current = s;
    setState(s);
  }, []);

  useEffect(
    () =>
      transport.onMessage((msg) => {
        const m = msg as unknown as Record<string, unknown>;
        if (m.type === 'officeAccess') {
          // Reconnect: the server forgot our subscription.
          if (ref.current) transport.send({ type: 'openTranscript', id: ref.current.id });
        } else if (typeof m.type === 'string' && m.type.startsWith('transcript')) {
          set(reduceTranscript(ref.current, m));
        }
      }),
    [set],
  );

  const open = useCallback(
    (id: string) => {
      set(openState(id));
      transport.send({ type: 'openTranscript', id });
    },
    [set],
  );
  const close = useCallback(() => {
    transport.send({ type: 'closeTranscript' });
    set(null);
  }, [set]);
  const loadEarlier = useCallback(() => {
    const s = ref.current;
    if (!s || s.loading || !s.more) return;
    set({ ...s, loading: true });
    transport.send({ type: 'loadTranscriptBefore', id: s.id, before: s.start });
  }, [set]);

  return { state, open, close, loadEarlier };
}
