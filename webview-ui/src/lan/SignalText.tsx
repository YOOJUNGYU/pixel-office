import type { OfficeAgent } from '../../../core/src/lan.js';
import { LAN_ALERT_COLOR } from '../constants.js';
import { t } from '../i18n.js';
import { ctxText, elapsedText, elapsedWarn, todoText } from './statusSignals.js';
import { modelLabel, tokensText } from './usageSignals.js';

/** Task count, changed lines, elapsed time and a fresh failure as plain text, for panels (room card, the
 *  session window's status line). Panel colours, not the bubble's: readable in both themes. */
export function SignalText({
  a,
  inBubble = false,
}: {
  a: Pick<OfficeAgent, 'ageSec' | 'permission' | 'todo' | 'fail' | 'diff' | 'ctx' | 'usage'>;
  /** Inside the hover bubble: its header already shows the task count and elapsed time,
   *  and the slate bubble takes a dimmed text instead of the panel's muted colour. */
  inBubble?: boolean;
}) {
  const elapsed = inBubble ? '' : elapsedText(a.ageSec);
  const todo = inBubble ? '' : todoText(a);
  const ctx = ctxText(a);
  if (!elapsed && !todo && !a.fail && !a.diff && !ctx && !a.usage) return null;
  return (
    <span
      className={`shrink-0 flex items-center gap-4 ${inBubble ? 'opacity-70' : 'text-text-muted'}`}
    >
      {todo && <span data-todo={todo}>{t('signal.todo', { n: todo })}</span>}
      {a.diff && (
        <span data-diff className="font-mono" title={t('signal.diff')}>
          <span style={{ color: 'var(--transcript-new-border)' }}>+{a.diff.add}</span>{' '}
          <span style={{ color: 'var(--transcript-old-border)' }}>−{a.diff.del}</span>
        </span>
      )}
      {elapsed && (
        <span
          data-elapsed={elapsed}
          className={elapsedWarn(a) ? 'font-bold' : ''}
          style={elapsedWarn(a) ? { color: 'var(--transcript-status-waiting)' } : undefined}
        >
          {elapsed}
        </span>
      )}
      {ctx && (
        <span data-ctx-text={ctx}>
          {t('transcript.context')} {ctx}
        </span>
      )}
      {a.usage && (
        <span data-usage-text>
          {[
            modelLabel(a.usage.model),
            tokensText(a.usage.tokens),
            a.usage.sum !== undefined && `${t('usage.sum')} ${tokensText(a.usage.sum)}`,
            a.usage.rate > 0 && t('usage.rate', { n: tokensText(a.usage.rate) }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      )}
      {a.fail && (
        <span className="font-bold" style={{ color: LAN_ALERT_COLOR }}>
          {t('signal.fail')}
        </span>
      )}
    </span>
  );
}
