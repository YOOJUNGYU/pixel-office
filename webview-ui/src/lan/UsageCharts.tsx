// SVG charts of the usage window (layout in usageCharts.ts; pixel style: crisp integer boxes).
import { useState } from 'react';

import type { UsageDay } from '../../../core/src/messages.js';
import { USAGE_CHART_W, USAGE_SHARE_H, USAGE_TOKEN_COLORS } from '../constants.js';
import { t } from '../i18n.js';
import { hbars, shareBar, stackedBars } from './usageCharts.js';
import { tokensText } from './usageSignals.js';

type TokenKey = keyof typeof USAGE_TOKEN_COLORS;
const ALL_KEYS: TokenKey[] = ['input', 'output', 'cacheCreate', 'cacheRead'];

/** "2026-11-12" → "11/12". */
const shortDay = (day: string): string => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;

/** Stacked daily bars; hovering a day shows its four values in a pixel panel. */
export function DayBars({
  days,
  keys,
  height,
}: {
  days: UsageDay[];
  keys: TokenKey[];
  height: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const { bars } = stackedBars(days, keys, USAGE_CHART_W, height);
  const d = hover === null ? undefined : days[hover];
  const bar = hover === null ? undefined : bars[hover];
  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <svg
        viewBox={`0 0 ${String(USAGE_CHART_W)} ${String(height)}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
        className="block"
      >
        {bars.map((b, i) => (
          <g key={days[i].day} onMouseEnter={() => setHover(i)}>
            <rect x={b.x} y={0} width={b.w} height={height} fill="transparent" />
            {b.segs.map((s) => (
              <rect
                key={s.key}
                x={b.x}
                y={s.y}
                width={b.w}
                height={s.h}
                fill={USAGE_TOKEN_COLORS[s.key as TokenKey]}
                opacity={hover === null || hover === i ? 1 : 0.55}
              />
            ))}
          </g>
        ))}
      </svg>
      {days.length > 0 && (
        <div className="flex justify-between text-2xs text-text-muted mt-2">
          <span>{shortDay(days[0].day)}</span>
          <span>{shortDay(days[days.length - 1].day)}</span>
        </div>
      )}
      {d && bar && (
        <div
          className="pixel-panel absolute z-10 px-8 py-4 text-xs pointer-events-none whitespace-nowrap"
          style={{
            // beside the hovered bar, inside the chart: right of it in the left half, else left
            top: 0,
            ...(bar.x > USAGE_CHART_W / 2
              ? { right: `calc(${String(100 - (bar.x / USAGE_CHART_W) * 100)}% + 6px)` }
              : { left: `calc(${String(((bar.x + bar.w) / USAGE_CHART_W) * 100)}% + 6px)` }),
          }}
        >
          <div className="font-bold mb-2">{d.day}</div>
          {ALL_KEYS.map((k) => (
            <div key={k} className="flex items-center gap-6">
              <Swatch color={USAGE_TOKEN_COLORS[k]} />
              <span className="text-text-muted">{t(`usage.tok.${k}`)}</span>
              <span className="ml-auto pl-12 font-mono">{tokensText(d[k])}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Swatch({ color }: { color: string }) {
  return <span className="inline-block shrink-0 w-8 h-8" style={{ background: color }} />;
}

/** Name | bar (largest = full) | value, one row each. */
export function HBars({
  rows,
  color,
}: {
  rows: Array<{ name: string; value: number }>;
  color: string;
}) {
  const W = 100;
  return (
    <div className="flex flex-col gap-3">
      {hbars(rows, W).map((r) => (
        <div key={r.name} className="flex items-center gap-6 text-xs min-w-0">
          <span className="w-[120px] shrink-0 truncate" title={r.name}>
            {r.name}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block h-8" style={{ width: `${String(r.w)}%`, background: color }} />
          </span>
          <span className="w-[48px] shrink-0 text-right font-mono">{tokensText(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** One 100% bar split by share, with a legend (colour, name, %). */
export function ShareBar({
  rows,
  colorOf,
}: {
  rows: Array<{ name: string; label: string; value: number }>;
  colorOf: (name: string, i: number) => string;
}) {
  const segs = shareBar(rows, USAGE_CHART_W);
  const label = (name: string) => rows.find((r) => r.name === name)?.label ?? name;
  return (
    <div>
      <svg
        viewBox={`0 0 ${String(USAGE_CHART_W)} ${String(USAGE_SHARE_H)}`}
        width="100%"
        height={USAGE_SHARE_H}
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
        className="block"
      >
        {segs.map((s, i) => (
          <rect
            key={s.name}
            x={s.x}
            y={0}
            width={s.w}
            height={USAGE_SHARE_H}
            fill={colorOf(s.name, i)}
          >
            <title>{`${label(s.name)} ${String(s.pct)}%`}</title>
          </rect>
        ))}
      </svg>
      <div className="flex flex-wrap gap-x-12 gap-y-2 mt-4 text-xs">
        {segs.map((s, i) => (
          <span key={s.name} className="flex items-center gap-4">
            <Swatch color={colorOf(s.name, i)} />
            {label(s.name)}
            <span className="text-text-muted">{s.pct}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}
