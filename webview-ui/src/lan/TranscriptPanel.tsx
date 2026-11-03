import type { ReactNode } from 'react';
import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { TranscriptEntry } from '../../../core/src/messages.js';
import {
  LAN_KIND_BADGES,
  LAN_PROVIDER_BADGE_FG,
  LAN_PROVIDER_COLORS,
  TRANSCRIPT_FOLD_LINES,
  TRANSCRIPT_PANEL_BOTTOM_PX,
  TRANSCRIPT_PANEL_TOP_PX,
  TRANSCRIPT_PANEL_WIDTH_PX,
  TRANSCRIPT_PANEL_Z_INDEX,
} from '../constants.js';
import { t, useLang } from '../i18n.js';
import { badgeColors } from './badgeColors.js';
import type { TranscriptState } from './transcript.js';
import { foldText, isAtBottom } from './transcript.js';

const BYTES_PER_KB = 1024;
const PRE = 'm-0 px-6 py-4 font-mono text-xs whitespace-pre-wrap break-words border-2';
const CODE_STYLE = { background: 'var(--transcript-code-bg)' };

/**
 * Left-side panel with one of my agents' full session transcript: header (badge, #n,
 * provider, title, folder, ×), then every entry. Opens at the bottom, follows new
 * entries while scrolled to the bottom (else a "new below" button), loads earlier
 * pages at the top (and by itself while it does not fill the panel) and keeps the
 * reading position when they arrive. Memoized: its props only change with the transcript.
 */
export const TranscriptPanel = memo(function TranscriptPanel({
  state,
  onClose,
  onLoadEarlier,
}: {
  state: TranscriptState;
  onClose(): void;
  onLoadEarlier(): void;
}) {
  useLang();
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const prev = useRef({ len: 0, start: 0 });
  /** scrollHeight at the last layout: an earlier page shifts the view by what it added. */
  const lastHeight = useRef(0);
  const [newBelow, setNewBelow] = useState(false);
  const { info, entries } = state;

  // Entries changed: keep the reading position, follow the bottom, or flag new ones below.
  const { start, error, more, loading } = state;
  const len = entries.length;
  // Entry keys stay with their entry when an earlier page goes in on top (open folds stay put).
  const [keys, setKeys] = useState({ start, len, base: 0 });
  if (keys.start !== start || keys.len !== len) {
    const added = start < keys.start ? len - keys.len : 0;
    setKeys({ start, len, base: keys.base + added });
  }
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const p = prev.current;
    if (p.len > 0 && start < p.start) {
      // Earlier entries went in on top: keep the one being read in place.
      el.scrollTop += el.scrollHeight - lastHeight.current;
    } else if (atBottom.current) {
      el.scrollTop = el.scrollHeight;
    } else if (len > p.len) {
      setNewBelow(true);
    }
    prev.current = { len, start };
    // No scrollbar yet, so no scroll to the top: fetch the earlier page now.
    if (more && !loading && el.scrollHeight <= el.clientHeight) onLoadEarlier();
  }, [len, start, error, more, loading, onLoadEarlier]);
  // After every layout (declared last, so after the correction above).
  useLayoutEffect(() => {
    if (scroller.current) lastHeight.current = scroller.current.scrollHeight;
  });

  const toBottom = () => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
    setNewBelow(false);
  };

  return (
    <div
      data-transcript-panel={state.id}
      className="absolute left-8 pixel-panel flex flex-col"
      style={{
        top: TRANSCRIPT_PANEL_TOP_PX,
        bottom: TRANSCRIPT_PANEL_BOTTOM_PX,
        width: `min(${TRANSCRIPT_PANEL_WIDTH_PX}px, 100vw - 16px)`,
        zIndex: TRANSCRIPT_PANEL_Z_INDEX,
      }}
      onWheel={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        // Keys pressed in the panel scroll it; they never move my avatar.
        e.stopPropagation();
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="flex items-center gap-6 px-8 py-4 border-b-2 border-border min-w-0">
        {info && (
          <>
            <span
              className="shrink-0 px-2 text-2xs font-bold leading-normal"
              style={badgeColors(info.kind)}
            >
              {LAN_KIND_BADGES[info.kind].text}
            </span>
            {info.num > 0 && <span className="shrink-0 text-sm font-bold">#{info.num}</span>}
            <span
              className="shrink-0 px-2 text-2xs font-bold leading-normal"
              style={{
                background: LAN_PROVIDER_COLORS[info.provider],
                color: LAN_PROVIDER_BADGE_FG,
              }}
            >
              {info.provider === 'claude' ? 'Claude' : 'Codex'}
            </span>
            <span className="truncate text-sm" title={info.title}>
              {info.title}
            </span>
            <span
              className="shrink-0 max-w-[30%] truncate text-xs text-text-muted"
              title={info.folder}
            >
              {info.folder}
            </span>
          </>
        )}
        <button
          type="button"
          className="ml-auto shrink-0 px-6 text-base text-text-muted hover:text-text cursor-pointer bg-transparent border-0"
          title={t('transcript.close')}
          aria-label={t('transcript.close')}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="relative flex-1 min-h-0">
        <div
          ref={scroller}
          tabIndex={0}
          className="absolute inset-0 overflow-y-auto px-8 py-6 flex flex-col gap-8 text-sm leading-normal"
          onScroll={(e) => {
            const el = e.currentTarget;
            atBottom.current = isAtBottom(el.scrollTop, el.clientHeight, el.scrollHeight);
            if (atBottom.current) setNewBelow(false);
            lastHeight.current = el.scrollHeight;
            if (el.scrollTop === 0 && more && !loading) onLoadEarlier();
          }}
        >
          {loading && (
            <Note>{t(entries.length ? 'transcript.loadingEarlier' : 'transcript.loading')}</Note>
          )}
          {info && !more && !loading && <Note>{t('transcript.start')}</Note>}
          {entries.map((e, i) => (
            <Entry key={i - keys.base} e={e} />
          ))}
          {error && <Note>{t(`transcript.${error}`)}</Note>}
        </div>
        {newBelow && (
          <button
            type="button"
            className="absolute left-1/2 -translate-x-1/2 bottom-8 pixel-panel px-8 py-2 text-xs cursor-pointer"
            onClick={toBottom}
          >
            {t('transcript.newBelow')}
          </button>
        )}
      </div>
    </div>
  );
});

function Note({ children }: { children: string }) {
  return <div className="text-center text-xs text-text-muted">{children}</div>;
}

function Entry({ e }: { e: TranscriptEntry }) {
  if (!e.text && e.kind !== 'tool' && e.kind !== 'result') return null;
  const label = t(`transcript.kind.${e.kind}`);
  const clipped = e.clipped ? (
    <span className="block text-xs text-text-muted">
      {t('transcript.clipped', { kb: String(Math.ceil(e.clipped / BYTES_PER_KB)) })}
    </span>
  ) : null;
  switch (e.kind) {
    case 'user':
      return (
        <div
          title={label}
          className="px-8 py-4 border-2 whitespace-pre-wrap break-words"
          style={{
            background: 'var(--transcript-user-bg)',
            borderColor: 'var(--transcript-user-border)',
          }}
        >
          {e.text}
          {clipped}
        </div>
      );
    case 'assistant':
      return (
        <div title={label} className="whitespace-pre-wrap break-words">
          {e.text}
          {clipped}
        </div>
      );
    case 'thinking':
    case 'meta':
      return <Muted label={label} text={e.text} clipped={clipped} />;
    case 'tool':
    case 'result':
      return (
        <div title={label} className="flex flex-col gap-2 items-start">
          {e.kind === 'tool' && (
            <span
              className="px-4 text-2xs font-bold leading-normal"
              style={{
                background: 'var(--transcript-chip-bg)',
                color: 'var(--transcript-chip-fg)',
              }}
            >
              {e.tool ?? label}
            </span>
          )}
          <Code text={e.text} error={e.kind === 'result' && e.error === true} />
          {clipped}
        </div>
      );
    default:
      return null;
  }
}

/** Thinking / meta: one muted line, click to read it all. */
function Muted({ label, text, clipped }: { label: string; text: string; clipped: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      aria-expanded={open}
      className={`text-left text-xs text-text-muted bg-transparent border-0 p-0 cursor-pointer ${open ? 'whitespace-pre-wrap break-words' : 'truncate'}`}
      onClick={() => setOpen((o) => !o)}
    >
      <span className="font-bold">{label} · </span>
      {text}
      {open && clipped}
    </button>
  );
}

/** A tool input / result block, folded past TRANSCRIPT_FOLD_LINES lines. */
function Code({ text, error }: { text: string; error: boolean }) {
  const [open, setOpen] = useState(false);
  const fold = useMemo(() => foldText(text, TRANSCRIPT_FOLD_LINES), [text]);
  return (
    <>
      <pre
        className={`${PRE} self-stretch`}
        style={{
          ...CODE_STYLE,
          borderColor: error ? 'var(--transcript-error-border)' : 'transparent',
        }}
      >
        {open || fold.hidden === 0 ? text : fold.shown}
      </pre>
      {fold.hidden > 0 && (
        <button
          type="button"
          className="text-xs text-text-muted hover:text-text bg-transparent border-0 p-0 cursor-pointer"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? t('transcript.collapse') : t('transcript.expand', { n: String(fold.hidden) })}
        </button>
      )}
    </>
  );
}
