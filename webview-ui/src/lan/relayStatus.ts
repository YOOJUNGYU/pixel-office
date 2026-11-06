// The internet public office's connection (relayState) as a chip next to the public area heading.
import type { RelayState } from '../../../core/src/messages.js';
import type { Key } from '../i18n.js';

export interface RelayStatusView {
  key: Key;
  tone: 'ok' | 'warn' | 'muted';
  /** Local "HH:MM" the relay may be tried again (budget, kicked); absent = unknown. */
  until?: string;
}

const hhmm = (ms: number): string => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** null = no chip (relay off). */
export function relayStatusView(
  s: Pick<RelayState, 'state' | 'retryInMs'>,
  now: number,
): RelayStatusView | null {
  switch (s.state) {
    case 'off':
      return null;
    case 'connected':
      return { key: 'relay.connected', tone: 'ok' };
    case 'connecting':
      return { key: 'relay.connecting', tone: 'muted' };
    case 'budget':
    case 'kicked':
      return {
        key: `relay.${s.state}`,
        tone: 'warn',
        ...(s.retryInMs !== undefined && { until: hhmm(now + s.retryInMs) }),
      };
    default:
      return { key: `relay.${s.state}`, tone: 'warn' };
  }
}
