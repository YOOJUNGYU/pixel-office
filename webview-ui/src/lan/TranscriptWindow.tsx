import { useEffect, useState } from 'react';

import type { OfficeAgent } from '../../../core/src/lan.js';
import { t, useLang } from '../i18n.js';
import { useThemePref } from '../theme.js';
import { transport } from '../transport/index.js';
import { activityText } from './lanAgents.js';
import { transcriptStatus } from './transcript.js';
import { TranscriptPanel } from './TranscriptPanel.js';
import { useAnnounce } from './transcriptWindows.js';
import { useTranscripts } from './useTranscript.js';

/** A popout window's whole page: one transcript filling it (its own /ws/transcript socket). */
export function TranscriptWindow({ id }: { id: string }) {
  useLang();
  useThemePref(); // follows the office window's theme (storage event in theme.ts)
  const tr = useTranscripts();
  const { open, loadEarlier } = tr;
  const [agent, setAgent] = useState<OfficeAgent | undefined>();
  useAnnounce(id);

  useEffect(() => open(id), [open, id]);
  useEffect(
    () =>
      transport.onMessage((msg) => {
        if (msg.type !== 'officeSnapshot') return;
        const agents = (msg as { agents?: OfficeAgent[] }).agents ?? [];
        setAgent(agents.find((a) => a.id === id));
      }),
    [id],
  );

  const state = tr.list[0];
  const info = state?.info;
  useEffect(() => {
    document.title = info
      ? `${info.num > 0 ? `#${String(info.num)} ` : ''}${info.title || t('transcript.dialog')}`
      : t('transcript.dialog');
  }, [info]);

  if (!state) return null;
  return (
    <div className="fixed inset-0 bg-bg">
      <TranscriptPanel
        state={state}
        status={transcriptStatus(agent)}
        activity={agent ? activityText(agent) : ''}
        agent={agent}
        onClose={() => window.close()}
        onLoadEarlier={() => loadEarlier(id)}
      />
    </div>
  );
}
