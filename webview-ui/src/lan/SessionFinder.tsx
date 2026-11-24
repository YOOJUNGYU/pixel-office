// The usage panel's 세션 tab: this PC's past sessions, newest first, filtered by title/folder or
// (대화 내용까지) by what was said in them. A row opens its transcript; a body hit opens it at
// the match. LOCAL ONLY: findSessions → sessionsFound on the page's own socket.
import { useEffect, useRef, useState } from 'react';

import type { SessionsFound, UsageTopSession } from '../../../core/src/messages.js';
import {
  LAN_PROVIDER_BADGE_FG,
  LAN_PROVIDER_COLORS,
  SESSION_FIND_DEBOUNCE_MS,
  SESSION_RANK_INDENT_PX,
} from '../constants.js';
import { t } from '../i18n.js';
import { transport } from '../transport/index.js';
import { Loading } from './Loading.js';
import { openPopout } from './transcriptWindows.js';
import { tokensText } from './usageSignals.js';

/** Active minutes as `1시간 20분` / `20분`. */
function activeText(min: number): string {
  const h = Math.floor(min / 60);
  return h
    ? t('sessions.hm', { h: String(h), m: String(min % 60) })
    : t('sessions.m', { m: String(min) });
}

export function SessionFinder() {
  const [q, setQ] = useState('');
  const [body, setBody] = useState(false);
  const [found, setFound] = useState<SessionsFound | null>(null);
  const asked = useRef({ q: '', body: false });

  useEffect(() => {
    const offMsg = transport.onMessage((msg) => {
      if (msg.type !== 'sessionsFound') return;
      // Only the answer to the latest question (a slow full-text search may trail).
      if (msg.q === asked.current.q && msg.body === asked.current.body) setFound(msg);
    });
    // A reconnect drops a pending answer (the server forgets the socket's search): ask again.
    const offState = transport.onStateChange((st) => {
      if (st === 'connected') transport.send({ type: 'findSessions', ...asked.current });
    });
    return () => {
      offMsg();
      offState();
    };
  }, []);
  useEffect(() => {
    const ask = { q: q.trim(), body: body && !!q.trim() };
    const timer = setTimeout(() => {
      asked.current = ask;
      transport.send({ type: 'findSessions', ...ask });
    }, SESSION_FIND_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q, body]);

  const busy = !found || found.q !== q.trim() || found.body !== (body && !!q.trim());
  return (
    <div data-session-finder className="flex flex-col gap-8">
      {/* Stays at the top of the panel's scroll area; the negative margins cover its padding so
          rows scroll under it, not past it. */}
      <div
        data-session-search
        className="sticky top-0 z-10 flex items-center gap-8 -mx-12 -mt-12 px-12 pt-12 pb-8 bg-bg border-b-2 border-border"
      >
        <input
          type="search"
          value={q}
          maxLength={100}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder={t(body ? 'sessions.placeholderBody' : 'sessions.placeholder')}
          className="flex-1 min-w-0 px-6 py-2 text-sm bg-bg-dark text-text border-2 border-border rounded-none"
        />
        <label className="flex items-center gap-4 shrink-0 text-xs cursor-pointer select-none">
          <input type="checkbox" checked={body} onChange={(e) => setBody(e.target.checked)} />
          {t('sessions.body')}
        </label>
      </div>
      {busy && <Loading text={t('sessions.searching')} />}
      {found && !busy && found.sessions.length === 0 && (
        <div className="text-xs text-text-muted">{t('sessions.none')}</div>
      )}
      <div className="flex flex-col">
        {found?.sessions.map((s) => (
          <SessionRow key={s.key} s={s} find={found.body ? found.q : undefined} />
        ))}
      </div>
      {found?.more && !busy && <div className="text-xs text-text-muted">{t('sessions.more')}</div>}
    </div>
  );
}

/** One session: provider, title, folder, date, tokens; activity and a search snippet below. */
export function SessionRow({
  s,
  rank,
  find,
}: {
  s: UsageTopSession;
  rank?: number;
  find?: string;
}) {
  const d = new Date(s.lastTs);
  const stats =
    s.activeMin !== undefined && (s.tools || s.activeMin)
      ? [
          activeText(s.activeMin),
          t('sessions.tools', { n: String(s.tools ?? 0) }),
          t('sessions.edits', { n: String(s.edits ?? 0) }),
        ].join(' · ')
      : '';
  return (
    <button
      data-session-row={s.key}
      onClick={() => openPopout(`usage:${s.key}`, find)}
      title={s.exists ? undefined : t('usage.deleted')}
      className={`flex flex-col w-full min-w-0 py-2 text-left text-sm bg-transparent border-0 cursor-pointer hover:bg-btn-hover ${s.exists ? '' : 'opacity-50'}`}
    >
      <span className="flex items-center gap-6 w-full min-w-0">
        {rank !== undefined && (
          <span className="w-[20px] shrink-0 text-right text-text-muted font-mono">{rank}</span>
        )}
        <span
          className="shrink-0 px-2 text-2xs font-bold leading-normal"
          style={{
            background:
              s.provider === 'claude' || s.provider === 'codex'
                ? LAN_PROVIDER_COLORS[s.provider]
                : undefined,
            color: LAN_PROVIDER_BADGE_FG,
          }}
        >
          {s.provider === 'codex' ? 'Codex' : 'Claude'}
        </span>
        <span className="truncate" title={s.exists ? s.title || s.folder : undefined}>
          {s.title || s.folder}
        </span>
        {s.title && s.folder && (
          <span className="shrink-0 max-w-[25%] truncate text-xs text-text-muted">{s.folder}</span>
        )}
        <span className="ml-auto shrink-0 text-xs text-text-muted">
          {`${String(d.getMonth() + 1)}/${String(d.getDate())}`}
        </span>
        <span className="w-[56px] shrink-0 text-right font-mono">{tokensText(s.billable)}</span>
      </span>
      {(stats || s.snippet) && (
        <span
          className="flex flex-col w-full min-w-0 text-xs text-text-muted"
          style={{ paddingLeft: rank !== undefined ? SESSION_RANK_INDENT_PX : 0 }}
        >
          {stats && <span data-session-stats>{stats}</span>}
          {s.snippet && (
            <span data-session-snippet className="truncate text-text">
              {s.snippet}
            </span>
          )}
        </span>
      )}
    </button>
  );
}
