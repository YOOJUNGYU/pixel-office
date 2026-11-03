import { useEffect, useRef, useState } from 'react';

import {
  TRANSCRIPT_DIALOG_CASCADE_PX,
  TRANSCRIPT_DIALOG_GRIP_PX,
  TRANSCRIPT_DIALOG_HEIGHT_PX,
  TRANSCRIPT_DIALOG_MIN_H_PX,
  TRANSCRIPT_DIALOG_MIN_W_PX,
  TRANSCRIPT_DIALOG_SIZE_KEY,
  TRANSCRIPT_PANEL_TOP_PX,
  TRANSCRIPT_PANEL_WIDTH_PX,
  TRANSCRIPT_PANEL_Z_INDEX,
} from '../constants.js';
import { t } from '../i18n.js';
import type { Rect } from './transcript.js';
import { clampRect } from './transcript.js';
import type { TranscriptPanelProps } from './TranscriptPanel.js';
import { TranscriptPanel } from './TranscriptPanel.js';

function savedSize(): { w: number; h: number } {
  try {
    const v = JSON.parse(localStorage.getItem(TRANSCRIPT_DIALOG_SIZE_KEY) ?? 'null') as unknown;
    const o = v as { w?: unknown; h?: unknown } | null;
    if (o && typeof o.w === 'number' && typeof o.h === 'number') return { w: o.w, h: o.h };
  } catch {
    // none / blocked
  }
  return { w: TRANSCRIPT_PANEL_WIDTH_PX, h: TRANSCRIPT_DIALOG_HEIGHT_PX };
}

const view = () => ({ w: window.innerWidth, h: window.innerHeight });

type Grip = 'move' | 'e' | 's' | 'se';

/**
 * One transcript as a floating, movable (header) and resizable (right / bottom edge,
 * corner) dialog. Several can be open; the one pressed last is on top (`onFront`).
 */
export function TranscriptDialog({
  index,
  onFront,
  ...panel
}: TranscriptPanelProps & { index: number; onFront(): void }) {
  const [rect, setRect] = useState<Rect>(() => {
    const { w, h } = savedSize();
    const step = (index % 8) * TRANSCRIPT_DIALOG_CASCADE_PX;
    const y = TRANSCRIPT_PANEL_TOP_PX + step;
    // Opens wholly on screen (its bottom-right grip reachable).
    const fit = Math.min(h, window.innerHeight - y - TRANSCRIPT_DIALOG_CASCADE_PX);
    return clampRect({ x: 8 + step, y, w, h: fit }, view());
  });
  const drag = useRef<{ grip: Grip; x: number; y: number; from: Rect } | null>(null);
  const [active, setActive] = useState(false);

  // The window got smaller: keep the dialog reachable.
  useEffect(() => {
    const onResize = () => setRect((r) => clampRect(r, view()));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const start = (grip: Grip) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    drag.current = { grip, x: e.clientX, y: e.clientY, from: rect };
    setActive(true);
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = ev.clientX - d.x;
      const dy = ev.clientY - d.y;
      const f = d.from;
      const next =
        d.grip === 'move'
          ? { ...f, x: f.x + dx, y: f.y + dy }
          : {
              ...f,
              w: d.grip === 's' ? f.w : Math.max(TRANSCRIPT_DIALOG_MIN_W_PX, f.w + dx),
              h: d.grip === 'e' ? f.h : Math.max(TRANSCRIPT_DIALOG_MIN_H_PX, f.h + dy),
            };
      setRect(clampRect(next, view()));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const d = drag.current;
      drag.current = null;
      setActive(false);
      if (d && d.grip !== 'move') {
        setRect((r) => {
          try {
            localStorage.setItem(TRANSCRIPT_DIALOG_SIZE_KEY, JSON.stringify({ w: r.w, h: r.h }));
          } catch {
            // blocked: the size just is not kept
          }
          return r;
        });
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const grip = (g: Exclude<Grip, 'move'>, style: React.CSSProperties, cursor: string) => (
    <div
      aria-hidden
      className="absolute"
      style={{ ...style, cursor, touchAction: 'none' }}
      onPointerDown={start(g)}
    />
  );
  const G = TRANSCRIPT_DIALOG_GRIP_PX;

  return (
    <div
      role="dialog"
      aria-label={t('transcript.dialog')}
      data-transcript-dialog={panel.state.id}
      className={`fixed ${active ? 'select-none' : ''}`}
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        zIndex: TRANSCRIPT_PANEL_Z_INDEX,
        maxWidth: `calc(100vw - ${String(G)}px)`,
      }}
      onPointerDownCapture={onFront}
    >
      <TranscriptPanel {...panel} onHeaderPointerDown={start('move')} />
      {grip('e', { top: 0, right: -G / 2, width: G, bottom: G }, 'ew-resize')}
      {grip('s', { left: 0, bottom: -G / 2, height: G, right: G }, 'ns-resize')}
      {grip('se', { right: -G / 2, bottom: -G / 2, width: G * 2, height: G * 2 }, 'nwse-resize')}
    </div>
  );
}
