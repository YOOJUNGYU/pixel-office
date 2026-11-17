// Pure helpers for the usage panel's rate-limit rows (provider-reported windows, Codex today)
// and the name tag's prompt-cache countdown. Times are relative seconds from the server.
import type { OfficeAgent } from '../../../core/src/lan.js';
import type { UsageLimit } from '../../../core/src/messages.js';
import { LIMIT_PACE_MIN_ELAPSED } from '../constants.js';
import { t } from '../i18n.js';

export interface LimitPace {
  /** Used minus the even share of the window gone by, in points (+ = burning faster). */
  delta: number | null;
  /** Seconds until 100 % at the window's average pace so far, when that comes before the reset. */
  hitInSec: number | null;
}

export function limitPace(l: UsageLimit): LimitPace {
  const win = l.windowMin * 60;
  const elapsed = Math.min(win, Math.max(0, win - l.resetsInSec));
  if (l.usedPct >= 100) return { delta: null, hitInSec: 0 };
  if (elapsed < win * LIMIT_PACE_MIN_ELAPSED) return { delta: null, hitInSec: null };
  const delta = Math.round(l.usedPct - (elapsed / win) * 100);
  const perSec = l.usedPct / elapsed;
  const hit = perSec > 0 ? (100 - l.usedPct) / perSec : Infinity;
  return { delta, hitInSec: hit < l.resetsInSec ? Math.round(hit) : null };
}

/** "5h" / "7d" style window name. */
export function windowName(min: number): string {
  return min % 1440 === 0
    ? t('limit.days', { n: String(min / 1440) })
    : t('limit.hours', { n: String(Math.round(min / 60)) });
}

/** A span of seconds: "12분", "3시간 5분", "2일 4시간". */
export function spanText(sec: number): string {
  const m = Math.max(1, Math.ceil(sec / 60));
  if (m < 60) return t('elapsed.m', { m: String(m) });
  const h = Math.floor(m / 60);
  if (h < 48) return t('elapsed.hm', { h: String(h), m: String(m % 60) });
  return t('elapsed.dh', { d: String(Math.floor(h / 24)), h: String(h % 24) });
}

/** "❄ 4:23" while my main agent waits for me and its prompt cache still lasts; '' otherwise. */
export function cacheChipText(
  a: Pick<OfficeAgent, 'kind' | 'act' | 'permission' | 'usage'>,
): string {
  const s = a.usage?.cache;
  if (!s || a.kind !== 'main' || !(a.act === 'idle' || a.act === 'ask' || a.permission)) return '';
  return `❄ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
