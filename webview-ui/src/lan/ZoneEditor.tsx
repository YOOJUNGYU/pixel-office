import { useEffect, useRef, useState } from 'react';

import {
  TRANSCRIPT_PANEL_TOP_PX,
  ZONE_DIVIDER_PREVIEW_PX,
  ZONE_DIVIDER_SCREEN_PX,
  ZONE_EDITOR_Z_INDEX,
  ZONE_MAX,
  ZONE_OVERLAY_Z_INDEX,
  ZONE_PREVIEW_W_PX,
  ZONE_SPACING_MAX,
  ZONES_BUTTON_TOP_PX,
} from '../constants.js';
import { t, useLang } from '../i18n.js';
import type { Rect } from './transcript.js';
import type { Template, ZoneLayout } from './zones.js';
import {
  loadLayout,
  moveDivider,
  removeZone,
  saveLayout,
  splitCol,
  splitRow,
  template,
  TEMPLATES,
  zoneArea,
  zoneRects,
} from './zones.js';

/** The zones drawn over the office (Shift-drag, or while editing); `active` ones lit. */
export function ZoneOverlay({ rects, active = [] }: { rects: Rect[]; active?: readonly number[] }) {
  return (
    <div
      aria-hidden
      data-zone-overlay
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: ZONE_OVERLAY_Z_INDEX }}
    >
      {rects.map((r, i) => {
        const on = active.includes(i);
        return (
          <div
            key={i}
            data-zone={i}
            data-active={on || undefined}
            className="absolute flex items-center justify-center border-2 text-2xl font-bold"
            style={{
              left: r.x,
              top: r.y,
              width: r.w,
              height: r.h,
              background: on ? 'var(--zone-active-bg)' : 'var(--zone-bg)',
              borderColor: on ? 'var(--zone-active-border)' : 'var(--zone-border)',
              color: on ? 'var(--zone-active-border)' : 'var(--zone-border)',
            }}
          >
            {i + 1}
          </div>
        );
      })}
    </div>
  );
}

const zoneCount = (l: ZoneLayout) => l.cols.reduce((n, c) => n + c.rows.length, 0);

/**
 * Top-left [레이아웃 배치] button (under the name-tag toggle) and its editor: pick a
 * template and zone count, set the spacing, drag the dividers in the preview, click a zone
 * to split it (Shift+click: split its column, Ctrl+click: remove it). Saved per viewer;
 * the zones show over the office while the editor is open.
 */
export function ZoneEditor() {
  useLang();
  const [open, setOpen] = useState(false);
  const [layout, setLayout] = useState<ZoneLayout>(loadLayout);
  const [tpl, setTpl] = useState<Template>('columns');
  const [area, setArea] = useState<Rect>(zoneArea);
  useEffect(() => {
    if (!open) return;
    const onResize = () => setArea(zoneArea());
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open]);

  const change = (l: ZoneLayout) => {
    setLayout(l);
    saveLayout(l);
  };
  const n = zoneCount(layout);
  const pw = ZONE_PREVIEW_W_PX;
  const ph = area.w > 0 ? Math.round((pw * area.h) / area.w) : pw / 2;
  const scale = area.w > 0 ? pw / area.w : 1;
  const preview = zoneRects(
    { ...layout, spacing: layout.spacing * scale },
    { x: 0, y: 0, w: pw, h: ph },
  );

  return (
    <>
      <button
        type="button"
        data-tour="zones-button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{ top: ZONES_BUTTON_TOP_PX }}
        className="absolute left-8 z-10 pixel-panel py-4 px-8 text-sm text-text cursor-pointer whitespace-nowrap"
        title={t('zones.hint')}
      >
        {t('zones.button')}
      </button>
      {open && (
        <>
          <Preview
            variant="screen"
            origin={area}
            layout={layout}
            rects={zoneRects(layout, { x: 0, y: 0, w: area.w, h: area.h })}
            w={area.w}
            h={area.h}
            onChange={change}
          />
          <div
            role="dialog"
            aria-label={t('zones.title')}
            data-zone-editor
            className="fixed left-8 pixel-panel p-10 flex flex-col gap-8 text-sm"
            style={{ top: TRANSCRIPT_PANEL_TOP_PX, zIndex: ZONE_EDITOR_Z_INDEX, width: pw + 22 }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') setOpen(false);
            }}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold">{t('zones.title')}</span>
              <button
                type="button"
                className="px-4 text-base text-text-muted hover:text-text bg-transparent border-0 cursor-pointer"
                aria-label={t('transcript.close')}
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="flex flex-wrap gap-4">
              {TEMPLATES.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={tpl === k}
                  className={`px-6 py-2 text-xs border-2 cursor-pointer ${tpl === k ? 'bg-accent text-on-accent border-accent' : 'bg-bg-dark text-text border-border'}`}
                  onClick={() => {
                    setTpl(k);
                    change(template(k, n, layout.spacing));
                  }}
                >
                  {t(`zones.tpl.${k}`)}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-6">
              <span className="flex-1">{t('zones.count')}</span>
              <button
                type="button"
                className="w-[24px] border-2 border-border bg-bg-dark cursor-pointer"
                aria-label="-"
                onClick={() => change(template(tpl, n - 1, layout.spacing))}
              >
                −
              </button>
              <span className="w-[24px] text-center tabular-nums">{n}</span>
              <button
                type="button"
                className="w-[24px] border-2 border-border bg-bg-dark cursor-pointer"
                aria-label="+"
                disabled={n >= ZONE_MAX}
                onClick={() => change(template(tpl, n + 1, layout.spacing))}
              >
                +
              </button>
            </div>
            <label className="flex items-center gap-6">
              <span className="flex-1">{t('zones.spacing')}</span>
              <input
                type="range"
                min={0}
                max={ZONE_SPACING_MAX}
                value={layout.spacing}
                className="pixel-range w-[120px]"
                style={
                  {
                    '--range-fill': `${String((layout.spacing / ZONE_SPACING_MAX) * 100)}%`,
                  } as React.CSSProperties
                }
                onChange={(e) => change({ ...layout, spacing: Number(e.target.value) })}
              />
              <span className="w-[32px] text-right tabular-nums text-xs">{layout.spacing}px</span>
            </label>
            <Preview layout={layout} rects={preview} w={pw} h={ph} onChange={change} />
            <p className="m-0 text-xs text-text-muted leading-snug">{t('zones.editHint')}</p>
            <p className="m-0 text-xs text-text-muted leading-snug">{t('zones.hint')}</p>
          </div>
        </>
      )}
    </>
  );
}

/** The layout to edit: zones to click (split / remove), dividers to drag. `preview` = small
 *  in the editor; `screen` = full size over the office, at `origin` (like FancyZones' editor). */
function Preview({
  layout,
  rects,
  w,
  h,
  onChange,
  variant = 'preview',
  origin,
}: {
  layout: ZoneLayout;
  rects: Rect[];
  w: number;
  h: number;
  onChange(l: ZoneLayout): void;
  variant?: 'preview' | 'screen';
  origin?: Rect;
}) {
  const screen = variant === 'screen';
  const bar = screen ? ZONE_DIVIDER_SCREEN_PX : ZONE_DIVIDER_PREVIEW_PX;
  const drag = useRef<{
    kind: 'col' | 'row';
    col: number;
    i: number;
    x: number;
    y: number;
    from: ZoneLayout;
  } | null>(null);
  const startDrag = (kind: 'col' | 'row', col: number, i: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    drag.current = { kind, col, i, x: e.clientX, y: e.clientY, from: layout };
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const f = d.from;
      if (d.kind === 'col') {
        const ws = moveDivider(
          f.cols.map((c) => c.w),
          d.i,
          (ev.clientX - d.x) / w,
        );
        onChange({ ...f, cols: f.cols.map((c, k) => ({ ...c, w: ws[k] })) });
      } else {
        const rows = moveDivider(f.cols[d.col].rows, d.i, (ev.clientY - d.y) / h);
        onChange({ ...f, cols: f.cols.map((c, k) => (k === d.col ? { ...c, rows } : c)) });
      }
    };
    const up = () => {
      drag.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // Zone index → (column, row).
  const cells: Array<{ col: number; row: number }> = [];
  layout.cols.forEach((c, col) => c.rows.forEach((_, row) => cells.push({ col, row })));
  // Divider positions from the zone boxes (between neighbours).
  const colX: number[] = [];
  let k = 0;
  layout.cols.forEach((c, col) => {
    const r = rects[k];
    if (col < layout.cols.length - 1)
      colX.push(r.x + r.w + (rects[k + c.rows.length].x - r.x - r.w) / 2);
    k += c.rows.length;
  });

  return (
    <div
      data-zone-preview={variant}
      className={screen ? 'fixed' : 'relative bg-bg-dark border-2 border-border'}
      style={
        screen && origin
          ? { left: origin.x, top: origin.y, width: w, height: h, zIndex: ZONE_OVERLAY_Z_INDEX }
          : { width: w + 4, height: h + 4 }
      }
    >
      {rects.map((r, i) => (
        <button
          key={i}
          type="button"
          data-zone-cell={i}
          className={`absolute flex items-center justify-center font-bold border-2 cursor-pointer p-0 ${screen ? 'text-2xl' : 'text-xs'}`}
          style={{
            left: r.x,
            top: r.y,
            width: r.w,
            height: r.h,
            background: 'var(--zone-bg)',
            borderColor: 'var(--zone-border)',
            color: 'var(--zone-border)',
          }}
          title={t('zones.editHint')}
          onClick={(e) => {
            const { col, row } = cells[i];
            if (e.ctrlKey || e.metaKey) onChange(removeZone(layout, col, row));
            else if (e.shiftKey) onChange(splitCol(layout, col));
            else onChange(splitRow(layout, col, row));
          }}
        >
          {i + 1}
        </button>
      ))}
      {colX.map((x, i) => (
        <div
          key={`c${String(i)}`}
          data-zone-divider="col"
          className="group absolute top-0 bottom-0 flex justify-center cursor-ew-resize touch-none"
          style={{ left: x - bar, width: bar * 2 }}
          onPointerDown={startDrag('col', 0, i)}
        >
          <span
            className="h-full opacity-60 group-hover:opacity-100"
            style={{ width: bar / 2, background: 'var(--zone-active-border)' }}
          />
        </div>
      ))}
      {(() => {
        const out: React.ReactNode[] = [];
        let base = 0;
        layout.cols.forEach((c, col) => {
          for (let i = 0; i < c.rows.length - 1; i++) {
            const a = rects[base + i];
            const b = rects[base + i + 1];
            out.push(
              <div
                key={`r${String(col)}-${String(i)}`}
                data-zone-divider="row"
                className="group absolute flex flex-col justify-center cursor-ns-resize touch-none"
                style={{ left: a.x, width: a.w, top: (a.y + a.h + b.y) / 2 - bar, height: bar * 2 }}
                onPointerDown={startDrag('row', col, i)}
              >
                <span
                  className="w-full opacity-60 group-hover:opacity-100"
                  style={{ height: bar / 2, background: 'var(--zone-active-border)' }}
                />
              </div>,
            );
          }
          base += c.rows.length;
        });
        return out;
      })()}
    </div>
  );
}
