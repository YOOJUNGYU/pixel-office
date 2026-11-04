// Pure helpers for the status signals shown with an agent: elapsed time and task progress.
import type { OfficeAgent } from '../../../core/src/lan.js';
import { ELAPSED_WARN_MS, ELAPSED_WARN_PERMISSION_MS } from '../constants.js';
import { t } from '../i18n.js';

/** "3분" / "1시간 12분" for the session's own act age; '' under a minute or unknown. */
export function elapsedText(ageSec: number | undefined): string {
  if (ageSec === undefined || ageSec < 60) return '';
  const m = Math.floor(ageSec / 60);
  if (m < 60) return t('elapsed.m', { m: String(m) });
  return t('elapsed.hm', { h: String(Math.floor(m / 60)), m: String(m % 60) });
}

/** Long enough to look stuck: waiting for me sooner than anything else. */
export function elapsedWarn(a: Pick<OfficeAgent, 'ageSec' | 'permission'>): boolean {
  if (a.ageSec === undefined) return false;
  return a.ageSec * 1000 >= (a.permission ? ELAPSED_WARN_PERMISSION_MS : ELAPSED_WARN_MS);
}

/** "3/7", or '' without a list. */
export const todoText = (a: Pick<OfficeAgent, 'todo'>): string =>
  a.todo ? `${String(a.todo.done)}/${String(a.todo.total)}` : '';

/** Progress fill in %, for the chip / bar background. */
export const todoPercent = (a: Pick<OfficeAgent, 'todo'>): number =>
  a.todo ? Math.round((a.todo.done / a.todo.total) * 100) : 0;

/** Text no longer readable at this bubble scale: show the act icon alone. */
export const iconOnly = (scale: number, threshold: number): boolean => scale < threshold;
