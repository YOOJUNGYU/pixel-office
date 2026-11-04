import type { OfficeAgent } from '../../../core/src/lan.js';
import { LAN_ALERT_COLOR } from '../constants.js';
import { t } from '../i18n.js';
import { elapsedText, elapsedWarn, todoText } from './statusSignals.js';

/** Task count, elapsed time and a fresh failure as plain text, for panels (room card, the
 *  session window's status line). Panel colours, not the bubble's: readable in both themes. */
export function SignalText({
  a,
}: {
  a: Pick<OfficeAgent, 'ageSec' | 'permission' | 'todo' | 'fail'>;
}) {
  const elapsed = elapsedText(a.ageSec);
  const todo = todoText(a);
  if (!elapsed && !todo && !a.fail) return null;
  return (
    <span className="shrink-0 flex items-center gap-4 text-text-muted">
      {todo && <span data-todo={todo}>{t('signal.todo', { n: todo })}</span>}
      {elapsed && (
        <span
          data-elapsed={elapsed}
          className={elapsedWarn(a) ? 'font-bold' : ''}
          style={elapsedWarn(a) ? { color: 'var(--transcript-status-waiting)' } : undefined}
        >
          {elapsed}
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
