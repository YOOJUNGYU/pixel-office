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
  TRANSCRIPT_RESIZE_HANDLE_PX,
  TRANSCRIPT_RESIZE_STEP_PX,
  TRANSCRIPT_WIDTH_KEY,
} from '../constants.js';
import { t, useLang } from '../i18n.js';
import { badgeColors } from './badgeColors.js';
import type { Family } from './highlight.js';
import { highlight, languageOf } from './highlight.js';
import type { TranscriptState } from './transcript.js';
import { clampPanelWidth, foldText, isAtBottom } from './transcript.js';
import {
  headingText,
  prettyResult,
  splitFences,
  splitInline,
  toolFields,
} from './transcriptFormat.js';

const BYTES_PER_KB = 1024;
const PRE = 'm-0 px-8 py-6 font-mono text-xs leading-relaxed pixel-scrollbar border-2 [tab-size:2]';
/** Code from a reply keeps its lines (scrolls sideways); tool input / output wraps to the panel. */
const PRE_LINES = 'whitespace-pre overflow-x-auto';
const PRE_WRAP = 'whitespace-pre-wrap break-words';
const CODE_STYLE = { background: 'var(--transcript-code-bg)' };

/**
 * Left-side panel with one of my agents' full session transcript: header (badge, #n,
 * provider, title, folder, ×), then every entry. Opens at the bottom, follows new
 * entries while scrolled to the bottom (else a "new below" button), loads earlier
 * pages at the top (and by itself while it does not fill the panel) and keeps the
 * reading position when they arrive. The right edge is a splitter (drag, arrow keys,
 * double-click = default width); the width is kept per viewer. Memoized: its props only change with the transcript.
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
  const panel = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(readWidth);
  const [dragging, setDragging] = useState(false);
  const resize = (next: number, save: boolean) => {
    const w = clampPanelWidth(next, window.innerWidth);
    setWidth(w);
    if (save) saveWidth(w);
  };

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
      ref={panel}
      data-transcript-panel={state.id}
      className={`absolute left-8 pixel-panel flex flex-col${dragging ? ' select-none' : ''}`}
      style={{
        top: TRANSCRIPT_PANEL_TOP_PX,
        bottom: TRANSCRIPT_PANEL_BOTTOM_PX,
        width: `min(${width}px, 100vw - 16px)`,
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
          className="absolute inset-0 overflow-y-auto pixel-scrollbar px-8 py-6 flex flex-col gap-8 text-sm leading-normal"
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
          {info?.kind === 'shell' ? (
            <ShellOutput entries={entries} />
          ) : (
            entries.map((e, i) => <Entry key={i - keys.base} e={e} />)
          )}
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
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t('transcript.resize')}
        aria-valuenow={width}
        tabIndex={0}
        title={t('transcript.resize')}
        className="group absolute top-0 bottom-0 flex justify-center cursor-ew-resize touch-none outline-none"
        style={{ right: -TRANSCRIPT_RESIZE_HANDLE_PX / 2 - 2, width: TRANSCRIPT_RESIZE_HANDLE_PX }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
        }}
        onPointerMove={(e) => {
          const el = panel.current;
          if (dragging && el) resize(e.clientX - el.getBoundingClientRect().left, false);
        }}
        onPointerUp={() => {
          if (!dragging) return;
          setDragging(false);
          saveWidth(width);
        }}
        onLostPointerCapture={() => setDragging(false)}
        onDoubleClick={() => resize(TRANSCRIPT_PANEL_WIDTH_PX, true)}
        onKeyDown={(e) => {
          const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
          if (!step) return;
          e.preventDefault();
          resize(width + step * TRANSCRIPT_RESIZE_STEP_PX, true);
        }}
      >
        <span
          className={`w-2 h-full ${dragging ? 'bg-accent' : 'bg-transparent group-hover:bg-accent group-focus-visible:bg-accent'}`}
        />
      </div>
    </div>
  );
});

function readWidth(): number {
  try {
    const saved = Number(localStorage.getItem(TRANSCRIPT_WIDTH_KEY) ?? TRANSCRIPT_PANEL_WIDTH_PX);
    return clampPanelWidth(saved, window.innerWidth);
  } catch {
    return TRANSCRIPT_PANEL_WIDTH_PX;
  }
}

function saveWidth(width: number): void {
  try {
    localStorage.setItem(TRANSCRIPT_WIDTH_KEY, String(width));
  } catch {
    // Storage blocked: the width just is not kept.
  }
}

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
          className="mt-8 px-8 py-6 border-l-4 flex flex-col gap-4"
          style={{
            background: 'var(--transcript-user-bg)',
            borderColor: 'var(--transcript-user-border)',
          }}
        >
          <span className={LABEL} style={{ color: 'var(--transcript-user-border)' }}>
            {label}
          </span>
          <Rich text={e.text} />
          {clipped}
        </div>
      );
    case 'assistant':
      return (
        <div title={label} className="flex flex-col gap-6">
          <Rich text={e.text} />
          {clipped}
        </div>
      );
    case 'thinking':
    case 'meta':
      return <Muted label={label} text={e.text} clipped={clipped} />;
    case 'tool':
      return (
        <div title={label} className="flex flex-col gap-3 items-start">
          <span
            className="px-4 text-2xs font-bold leading-normal"
            style={{ background: 'var(--transcript-chip-bg)', color: 'var(--transcript-chip-fg)' }}
          >
            {e.tool ?? label}
          </span>
          <ToolInput text={e.text} tool={e.tool} />
          {clipped}
        </div>
      );
    case 'result':
      return (
        <div title={label} className="flex flex-col gap-2 items-start">
          <span
            className={LABEL}
            style={{ color: e.error ? 'var(--transcript-error-border)' : undefined }}
          >
            ↳ {label}
          </span>
          <Code text={prettyResult(e.text)} error={e.error === true} />
          {clipped}
        </div>
      );
    default:
      return null;
  }
}

/** A shell: its output as one terminal block (Codex: the polls that read it, muted). */
function ShellOutput({ entries }: { entries: TranscriptEntry[] }) {
  if (!entries.length) return <Note>{t('transcript.shellEmpty')}</Note>;
  return (
    <pre className={`${PRE} ${PRE_WRAP}`} style={{ ...CODE_STYLE, borderColor: 'transparent' }}>
      {entries.map((e, i) =>
        e.kind === 'tool' ? (
          <span key={i} className="block" style={{ color: 'var(--syntax-com)' }}>
            {`▸ ${e.text.split('\n')[0]}`}
          </span>
        ) : (
          <span
            key={i}
            className="block"
            style={e.error ? { color: 'var(--transcript-error-border)' } : undefined}
          >
            {e.text}
          </span>
        ),
      )}
    </pre>
  );
}

const LABEL = 'text-2xs font-bold uppercase tracking-wide text-text-muted';

/** Prose with ``` code blocks, `inline code`, **bold** and # headings; line breaks kept. */
function Rich({ text }: { text: string }) {
  const blocks = useMemo(() => splitFences(text), [text]);
  return (
    <>
      {blocks.map((b, i) =>
        b.kind === 'code' ? (
          <Code key={i} text={b.text} lang={b.lang} family={languageOf(b.lang)} keepLines />
        ) : (
          <div key={i} className="whitespace-pre-wrap break-words leading-relaxed">
            {b.text.split('\n').map((line, j) => {
              const h = headingText(line);
              return (
                <span
                  key={j}
                  className={h ? 'block font-bold text-base mt-4' : 'block min-h-[1lh]'}
                >
                  <Marks text={h ?? line} />
                </span>
              );
            })}
          </div>
        ),
      )}
    </>
  );
}

function Marks({ text }: { text: string }) {
  return (
    <>
      {splitInline(text).map((m, i) =>
        m.kind === 'code' ? (
          <code
            key={i}
            className="px-2 font-mono text-xs"
            style={{
              background: 'var(--transcript-code-bg)',
              color: 'var(--transcript-inline-code-fg)',
            }}
          >
            {m.text}
          </code>
        ) : m.kind === 'bold' ? (
          <strong key={i}>{m.text}</strong>
        ) : (
          m.text
        ),
      )}
    </>
  );
}

/** A tool input: JSON objects as key / value fields (long ones as code blocks), else raw. */
/** Fields holding source code take their language from the call's path field. */
const CODE_FIELDS = new Set(['content', 'old_string', 'new_string', 'new_source', 'code']);

function ToolInput({ text, tool }: { text: string; tool?: string }) {
  const fields = useMemo(() => toolFields(text), [text]);
  const shell = tool !== undefined && /^(bash|shell|exec_command|local_shell)$/i.test(tool);
  if (!fields) return <Code text={text} family={shell ? 'sh' : undefined} />;
  const path = fields.find((f) => /^(file_path|path|notebook_path)$/.test(f.key))?.value;
  const familyOf = (key: string) =>
    key === 'command' || key === 'cmd' ? 'sh' : CODE_FIELDS.has(key) ? languageOf(path) : undefined;
  return (
    <div className="self-stretch flex flex-col gap-3">
      {fields.map((f) =>
        f.block ? (
          <div key={f.key} className="flex flex-col gap-1">
            <span className="font-mono text-2xs" style={{ color: 'var(--transcript-key-fg)' }}>
              {f.key}
            </span>
            <Code text={f.value} tone={f.tone} family={familyOf(f.key)} />
          </div>
        ) : (
          <div key={f.key} className="flex gap-6 font-mono text-xs min-w-0">
            <span className="shrink-0" style={{ color: 'var(--transcript-key-fg)' }}>
              {f.key}
            </span>
            <span className="break-all">{f.value}</span>
          </div>
        ),
      )}
    </div>
  );
}

/** Thinking / meta: one muted line, click to read it all. */
function Muted({ label, text, clipped }: { label: string; text: string; clipped: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      aria-expanded={open}
      className={`text-left text-xs italic text-text-muted bg-transparent border-0 p-0 cursor-pointer ${open ? 'whitespace-pre-wrap break-words leading-relaxed' : 'truncate'}`}
      onClick={() => setOpen((o) => !o)}
    >
      <span className="font-bold not-italic">{label} · </span>
      {text}
      {open && clipped}
    </button>
  );
}

const TONE_BORDER = {
  old: 'var(--transcript-old-border)',
  new: 'var(--transcript-new-border)',
} as const;

/** A code block (indentation kept), folded past TRANSCRIPT_FOLD_LINES lines. */
function Code({
  text,
  error = false,
  lang,
  tone,
  keepLines = false,
  family,
}: {
  text: string;
  error?: boolean;
  lang?: string;
  tone?: 'old' | 'new';
  keepLines?: boolean;
  family?: Family;
}) {
  const [open, setOpen] = useState(false);
  const fold = useMemo(() => foldText(text, TRANSCRIPT_FOLD_LINES), [text]);
  const shown = open || fold.hidden === 0 ? text : fold.shown;
  const tokens = useMemo(() => highlight(shown, family), [shown, family]);
  const edge = error ? 'var(--transcript-error-border)' : tone ? TONE_BORDER[tone] : undefined;
  return (
    <div className="self-stretch flex flex-col gap-2 items-start min-w-0">
      <div className="relative self-stretch min-w-0">
        {lang && (
          <span className="absolute top-0 right-0 px-4 text-2xs text-text-muted pointer-events-none">
            {lang}
          </span>
        )}
        <pre
          className={`${PRE} ${keepLines ? PRE_LINES : PRE_WRAP}`}
          style={{
            ...CODE_STYLE,
            borderColor: 'transparent',
            borderLeftColor: edge ?? 'transparent',
            borderLeftWidth: edge ? 4 : 2,
          }}
        >
          {tokens.map((tk, i) =>
            tk.kind === 'plain' ? (
              tk.text
            ) : (
              <span key={i} style={{ color: `var(--syntax-${tk.kind})` }}>
                {tk.text}
              </span>
            ),
          )}
        </pre>
      </div>
      {fold.hidden > 0 && (
        <button
          type="button"
          className="text-xs text-text-muted hover:text-text bg-transparent border-0 p-0 cursor-pointer"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? t('transcript.collapse') : t('transcript.expand', { n: String(fold.hidden) })}
        </button>
      )}
    </div>
  );
}
