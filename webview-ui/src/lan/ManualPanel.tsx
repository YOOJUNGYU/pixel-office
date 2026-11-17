// The ? manual under the top-left buttons: every feature on the left (grouped, searchable),
// the chosen one on the right with its looping animation and explanation. Sized like the 📊
// usage panel (right/bottom edges, corner; remembered per viewer). [온보딩 시작] replays the tour.
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  MANUAL_LIST_WIDTH_PX,
  MANUAL_PANEL_DEFAULT_H_PX,
  MANUAL_PANEL_DEFAULT_W_PX,
  MANUAL_PANEL_SIZE_KEY,
} from '../constants.js';
import { type Key, t, useLang } from '../i18n.js';
import { bodyKey, MANUAL_CATS, type ManualEntry, searchManual, titleKey } from './manual.js';
import { type Look, ManualStage } from './ManualScenes.js';
import { PanelGrips } from './PanelGrips.js';
import { useResizable } from './usagePanelSize.js';

const DEFAULT_SIZE = { w: MANUAL_PANEL_DEFAULT_W_PX, h: MANUAL_PANEL_DEFAULT_H_PX };

interface ManualPanelProps {
  onClose: () => void;
  onStartTour: () => void;
  /** The viewer's own character, drawn as the star of every animation. */
  me: Look;
}

export function ManualPanel({ onClose, onStartTour, me }: ManualPanelProps) {
  useLang();
  const box = useResizable(MANUAL_PANEL_SIZE_KEY, DEFAULT_SIZE);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState('office');
  const hits = useMemo(() => searchManual(q), [q]);
  const listRef = useRef<HTMLDivElement>(null);
  const shown = hits.some((h) => h.id === sel) ? sel : hits[0]?.id;
  // Other people in the scenes: the first three palettes that are not mine.
  const others = useMemo<Look[]>(
    () =>
      [0, 1, 2, 3, 4, 5]
        .filter((p) => p !== me.palette)
        .slice(0, 3)
        .map((palette) => ({ palette, hueShift: 0 })),
    [me.palette],
  );

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-manual-item="${shown}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [shown]);

  const move = (step: number) => {
    if (!hits.length) return;
    const i = hits.findIndex((h) => h.id === shown);
    setSel(hits[(i + step + hits.length) % hits.length].id);
  };

  return (
    <div
      ref={box.ref}
      data-manual-panel
      data-tour="manual-panel"
      className="relative flex flex-col pixel-panel text-text"
      style={{ width: box.size.w, height: box.size.h }}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-8 shrink-0 pl-12 border-b-2 border-border bg-bg-dark">
        <h2 className="m-0 py-6 text-base font-bold">{t('manual.title')}</h2>
        <button
          data-manual-tour
          onClick={onStartTour}
          title={t('manual.startTourTip')}
          className="ml-auto my-4 px-10 py-2 text-sm font-bold rounded-none border-2 border-accent bg-active-bg text-text cursor-pointer hover:bg-btn-hover shadow-pixel"
        >
          ▶ {t('manual.startTour')}
        </button>
        <button
          onClick={onClose}
          title={t('manual.close')}
          aria-label={t('manual.close')}
          className="self-stretch w-32 shrink-0 bg-bg-dark border-0 border-l-2 border-border rounded-none text-text-muted hover:text-text cursor-pointer text-lg leading-none"
        >
          ×
        </button>
      </div>
      <div className="shrink-0 px-12 py-6 border-b-2 border-border">
        <input
          data-manual-search
          type="search"
          value={q}
          placeholder={t('manual.search')}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              move(e.key === 'ArrowDown' ? 1 : -1);
            } else if (e.key === 'Escape') {
              e.stopPropagation();
              if (q) setQ('');
              else onClose();
            }
          }}
          className="w-full py-4 px-8 bg-bg-dark border-2 border-border rounded-none text-text text-sm"
        />
      </div>
      <div className="flex flex-1 min-h-0">
        <div
          ref={listRef}
          role="listbox"
          aria-label={t('manual.title')}
          className="shrink-0 overflow-y-auto pixel-scrollbar border-r-2 border-border py-4"
          style={{ width: `min(${MANUAL_LIST_WIDTH_PX}px, 40%)` }}
        >
          {hits.length === 0 && (
            <div className="px-12 py-8 text-sm text-text-muted">{t('manual.none')}</div>
          )}
          {MANUAL_CATS.map((cat) => {
            const rows = hits.filter((h) => h.cat === cat);
            if (!rows.length) return null;
            return (
              <div key={cat} className="mb-4">
                <div className="px-12 pt-6 pb-2 text-xs font-bold text-text-muted">
                  {t(`manual.cat.${cat}` as Key)}
                </div>
                {rows.map((h) => (
                  <ListItem key={h.id} entry={h} active={h.id === shown} onPick={setSel} />
                ))}
              </div>
            );
          })}
        </div>
        <div className="flex-1 min-w-0 overflow-y-auto pixel-scrollbar p-12">
          {shown && (
            <div data-manual-detail={shown} className="flex flex-col gap-10">
              <ManualStage id={shown} me={me} others={others} />
              <div>
                <div className="text-xs text-text-muted">
                  {t(`manual.cat.${hits.find((h) => h.id === shown)!.cat}` as Key)}
                </div>
                <h3 className="m-0 mt-2 text-lg font-bold">{t(titleKey(shown))}</h3>
              </div>
              {t(bodyKey(shown))
                .split('\n')
                .map((p, i) => (
                  <p key={i} className="m-0 text-sm leading-relaxed">
                    {p}
                  </p>
                ))}
            </div>
          )}
        </div>
      </div>
      <PanelGrips box={box} />
    </div>
  );
}

function ListItem({
  entry,
  active,
  onPick,
}: {
  entry: ManualEntry;
  active: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <button
      role="option"
      aria-selected={active}
      data-manual-item={entry.id}
      onClick={() => onPick(entry.id)}
      className={`block w-full text-left px-12 py-4 text-sm border-0 border-l-4 rounded-none cursor-pointer ${
        active
          ? 'bg-active-bg border-l-accent text-text font-bold'
          : 'bg-transparent border-l-transparent text-text hover:bg-btn-hover'
      }`}
    >
      {t(titleKey(entry.id))}
    </button>
  );
}
