// The 📊 usage panel under the top-left buttons: my live agents' usage now (top), my token
// history below; resized from its right edge, bottom edge and bottom-right corner. LOCAL ONLY:
// everything here comes from this PC's server over the page's own socket (openUsage).
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import type { OfficeAgent } from '../../../core/src/lan.js';
import type { UsageLoaded, UsageRange } from '../../../core/src/messages.js';
import {
  LAN_PROVIDER_BADGE_FG,
  LAN_PROVIDER_COLORS,
  USAGE_BURN_DOT,
  USAGE_CACHE_H,
  USAGE_DAILY_H,
  USAGE_MODEL_COLORS,
  USAGE_PANEL_CORNER_PX,
  USAGE_PANEL_EDGE_PX,
  USAGE_PANEL_MARGIN_PX,
  USAGE_RANGE_KEY,
  USAGE_SHARE_COLORS,
  USAGE_TOKEN_COLORS,
} from '../constants.js';
import { t, useLang } from '../i18n.js';
import { transport } from '../transport/index.js';
import { providerName, tagBadge } from './lanAgents.js';
import { openPopout } from './transcriptWindows.js';
import { DayBars, HBars, ShareBar, Swatch } from './UsageCharts.js';
import { hitRate } from './usageCharts.js';
import type { Grip as GripKind, Size } from './usagePanelSize.js';
import { clampSize, dragSize, storedSize, storeSize } from './usagePanelSize.js';
import { burnTier, modelFamily, modelLabel, tokensText } from './usageSignals.js';

const RANGES: UsageRange[] = ['7d', '30d', 'all'];

function storedRange(): UsageRange {
  try {
    const v = localStorage.getItem(USAGE_RANGE_KEY) as UsageRange | null;
    return v && RANGES.includes(v) ? v : '7d';
  } catch {
    return '7d';
  }
}

const modelColor = (model: string, i: number): string => {
  const f = modelFamily(model);
  return f ? USAGE_MODEL_COLORS[f] : USAGE_SHARE_COLORS[i % USAGE_SHARE_COLORS.length];
};

export function UsagePanel({ onClose }: { onClose: () => void }) {
  useLang();
  const [range, setRange] = useState<UsageRange>(storedRange);
  const rangeRef = useRef(range);
  const [now, setNow] = useState<{ today: number; scanning?: boolean }>({ today: 0 });
  const [data, setData] = useState<UsageLoaded | null>(null);
  const [agents, setAgents] = useState<OfficeAgent[]>([]);
  const box = useResizable();

  useEffect(
    () =>
      transport.onMessage((msg) => {
        if (msg.type === 'usageNow') setNow({ today: msg.today, scanning: msg.scanning });
        else if (msg.type === 'usageLoaded') {
          if (msg.range === rangeRef.current) setData(msg);
        } else if (msg.type === 'officeSnapshot') {
          const all = msg.agents as OfficeAgent[];
          setAgents(all.filter((a) => a.peer.id === msg.selfPeerId && a.kind !== 'shell'));
        }
      }),
    [],
  );

  // (Re)open on every range change and every (re)connect; a send before the first connect
  // would be queued AND re-sent by the state handler, so only send while connected here.
  // Closing the panel stops the server's usage messages to this page.
  useEffect(() => {
    rangeRef.current = range;
    try {
      localStorage.setItem(USAGE_RANGE_KEY, range);
    } catch {
      // private window: the range is just not remembered
    }
    if (transport.state === 'connected') transport.send({ type: 'openUsage', range });
  }, [range]);
  useEffect(() => {
    const off = transport.onStateChange((s) => {
      if (s === 'connected') transport.send({ type: 'openUsage', range: rangeRef.current });
    });
    return () => {
      off();
      if (transport.state === 'connected') transport.send({ type: 'closeUsage' });
    };
  }, []);

  const scanning = now.scanning ?? !!data?.scanning; // usageNow is the fresher word once seen
  return (
    <div
      ref={box.ref}
      data-usage-panel
      className="relative flex flex-col pixel-panel text-text"
      style={{ width: box.size.w, height: box.size.h }}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-8 shrink-0 px-12 pt-8 pb-6 border-b-2 border-border">
        <h2 className="m-0 text-sm font-bold">{t('usage.window')}</h2>
        <div className="flex gap-2" role="tablist">
          {RANGES.map((r) => (
            <button
              key={r}
              role="tab"
              aria-selected={r === range}
              onClick={() => setRange(r)}
              className={`border-2 rounded-none px-8 py-1 text-xs cursor-pointer ${
                r === range
                  ? 'bg-active-bg border-accent'
                  : 'bg-btn-bg border-transparent hover:bg-btn-hover'
              }`}
            >
              {t(`usage.range.${r}`)}
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          title={t('usage.close')}
          aria-label={t('usage.close')}
          className="ml-auto w-24 h-24 shrink-0 bg-transparent border-0 text-text-muted hover:text-text cursor-pointer text-lg leading-none"
        >
          ×
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto pixel-scrollbar">
        <div className="flex flex-col gap-10 p-12">
          <NowPanel agents={agents} today={now.today} scanning={scanning} />
          {data && <History data={data} />}
        </div>
      </div>
      <Grip which="right" box={box} />
      <Grip which="bottom" box={box} />
      <Grip which="corner" box={box} />
    </div>
  );
}

interface Box {
  ref: React.RefObject<HTMLDivElement | null>;
  size: Size;
  start: (which: GripKind, e: React.PointerEvent) => void;
}

/** The panel's size: remembered per viewer, kept inside the viewport (also when it shrinks). */
function useResizable(): Box {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<Size>(storedSize);
  const room = (): Size => {
    const r = ref.current?.getBoundingClientRect();
    return {
      w: window.innerWidth - (r?.left ?? 0) - USAGE_PANEL_MARGIN_PX,
      h: window.innerHeight - (r?.top ?? 0) - USAGE_PANEL_MARGIN_PX,
    };
  };
  useEffect(() => {
    const fit = () => setSize((s) => clampSize(s, room()));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  const start = (which: GripKind, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const from = { x: e.clientX, y: e.clientY };
    const base = size;
    const max = room();
    let last = base;
    const move = (ev: PointerEvent) => {
      last = dragSize(base, which, ev.clientX - from.x, ev.clientY - from.y, max);
      setSize(last);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      storeSize(last);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  return { ref, size, start };
}

const GRIP_STYLE: Record<GripKind, React.CSSProperties> = {
  right: {
    top: 0,
    right: -USAGE_PANEL_EDGE_PX / 2,
    width: USAGE_PANEL_EDGE_PX,
    bottom: USAGE_PANEL_CORNER_PX,
    cursor: 'ew-resize',
  },
  bottom: {
    left: 0,
    bottom: -USAGE_PANEL_EDGE_PX / 2,
    height: USAGE_PANEL_EDGE_PX,
    right: USAGE_PANEL_CORNER_PX,
    cursor: 'ns-resize',
  },
  corner: {
    right: -USAGE_PANEL_EDGE_PX / 2,
    bottom: -USAGE_PANEL_EDGE_PX / 2,
    width: USAGE_PANEL_CORNER_PX,
    height: USAGE_PANEL_CORNER_PX,
    cursor: 'nwse-resize',
  },
};

/** A resize handle on the right edge, the bottom edge or the bottom-right corner. */
function Grip({ which, box }: { which: GripKind; box: Box }) {
  return (
    <div
      data-usage-grip={which}
      className="absolute touch-none"
      style={GRIP_STYLE[which]}
      onPointerDown={(e) => box.start(which, e)}
    >
      {which === 'corner' && (
        // Two pixel steps in the corner, so the diagonal grip can be found
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          aria-hidden
          className="absolute right-4 bottom-4 text-text-muted"
          shapeRendering="crispEdges"
        >
          <rect x="6" y="2" width="2" height="2" fill="currentColor" />
          <rect x="2" y="6" width="2" height="2" fill="currentColor" />
          <rect x="6" y="6" width="2" height="2" fill="currentColor" />
        </svg>
      )}
    </div>
  );
}

function NowPanel({
  agents,
  today,
  scanning,
}: {
  agents: OfficeAgent[];
  today: number;
  scanning: boolean;
}) {
  const mains = agents.filter((a) => a.kind === 'main');
  const mainKeys = new Set(mains.map((a) => a.key));
  const rows: Array<{ a: OfficeAgent; parent?: OfficeAgent }> = [];
  for (const m of mains) {
    rows.push({ a: m });
    for (const c of agents) if (c.parentKey === m.key) rows.push({ a: c, parent: m });
  }
  for (const c of agents)
    if (c.kind !== 'main' && !(c.parentKey && mainKeys.has(c.parentKey))) rows.push({ a: c });
  return (
    <section className="pixel-panel px-10 py-8" style={{ borderColor: 'var(--usage-now-border)' }}>
      <h2 className="flex items-baseline gap-8 m-0 mb-6 text-sm font-bold">
        <span>{t('usage.now')}</span>
        <span className="text-text-muted font-normal">
          · {t('usage.today', { n: tokensText(today) })}
        </span>
        {scanning && (
          <span className="ml-auto text-xs text-text-muted font-normal">{t('usage.scanning')}</span>
        )}
      </h2>
      {rows.length === 0 && <div className="text-xs text-text-muted">{t('usage.noAgents')}</div>}
      {rows.map(({ a, parent }) => (
        <NowRow key={a.key} a={a} parent={parent} />
      ))}
    </section>
  );
}

function NowRow({ a, parent }: { a: OfficeAgent; parent?: OfficeAgent }) {
  const u = a.usage;
  const family = modelFamily(u?.model);
  const num = (parent ?? a).num;
  return (
    <button
      onClick={() => openPopout(a.id)}
      className="flex items-center gap-6 w-full min-w-0 py-2 text-left text-sm bg-transparent border-0 cursor-pointer hover:bg-btn-hover"
      style={{ paddingLeft: parent ? 20 : 0 }}
    >
      <span
        className="inline-block shrink-0 w-8 h-8"
        style={{ background: USAGE_BURN_DOT[burnTier(u)] }}
      />
      {parent ? (
        <span className="shrink-0 font-bold">
          └ {tagBadge(a)} #{num}
        </span>
      ) : (
        <>
          <span
            className="shrink-0 px-2 text-2xs font-bold leading-normal"
            style={{ background: LAN_PROVIDER_COLORS[a.provider], color: LAN_PROVIDER_BADGE_FG }}
          >
            {providerName(a)}
          </span>
          <span className="shrink-0 font-bold">#{num}</span>
        </>
      )}
      <span className="truncate text-text-muted" title={a.title}>
        {a.title ?? ''}
      </span>
      <span className="ml-auto shrink-0 flex items-center gap-8">
        {family && (
          <span className="text-xs font-bold" style={{ color: USAGE_MODEL_COLORS[family] }}>
            {modelLabel(u?.model)}
          </span>
        )}
        <span className="font-mono">{tokensText(u?.tokens ?? 0)}</span>
        <span className="w-[72px] text-right font-mono text-text-muted">
          {t('usage.rate', { n: tokensText(u?.rate ?? 0) })}
        </span>
      </span>
    </button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pixel-panel px-10 py-8">
      <h3 className="m-0 mb-6 text-xs font-bold text-text-muted">{title}</h3>
      {children}
    </section>
  );
}

function History({ data }: { data: UsageLoaded }) {
  const { totals } = data;
  const empty = totals.billable === 0 && totals.cacheRead === 0 && data.top.length === 0;
  if (empty) return <div className="text-sm text-text-muted px-2">{t('usage.empty')}</div>;
  const kpis: Array<[string, string]> = [
    [t('usage.kpi.billable'), tokensText(totals.billable)],
    [t('usage.tok.cacheRead'), tokensText(totals.cacheRead)],
    [t('usage.kpi.hit'), hitRate(totals)],
    [t('usage.kpi.sessions'), String(totals.sessions)],
  ];
  const dayKeys = ['input', 'output', 'cacheCreate'] as const;
  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-8">
        {kpis.map(([label, value]) => (
          <div key={label} className="pixel-panel px-8 py-6">
            <div className="text-2xs text-text-muted">{label}</div>
            <div className="text-xl font-bold font-mono">{value}</div>
          </div>
        ))}
      </div>

      <Section title={t('usage.daily')}>
        <DayBars days={data.days} keys={[...dayKeys]} height={USAGE_DAILY_H} />
        <div className="flex gap-12 mt-4 text-xs">
          {dayKeys.map((k) => (
            <span key={k} className="flex items-center gap-4">
              <Swatch color={USAGE_TOKEN_COLORS[k]} />
              {t(`usage.tok.${k}`)}
            </span>
          ))}
        </div>
      </Section>

      <Section title={t('usage.dailyCache')}>
        <DayBars days={data.days} keys={['cacheRead']} height={USAGE_CACHE_H} />
      </Section>

      {data.projects.length > 0 && (
        <Section title={t('usage.projects')}>
          <HBars
            rows={data.projects.map((p) => ({ name: p.name, value: p.billable }))}
            color={USAGE_SHARE_COLORS[0]}
          />
        </Section>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-8">
        <Section title={t('usage.models')}>
          <ShareBar
            rows={data.models.map((m) => ({
              name: m.model,
              label: modelLabel(m.model) || m.model,
              value: m.billable,
            }))}
            colorOf={modelColor}
          />
        </Section>
        <Section title={t('usage.providers')}>
          <ShareBar
            rows={data.providers.map((p) => ({
              name: p.provider,
              label:
                p.provider === 'codex' ? 'Codex' : p.provider === 'claude' ? 'Claude' : p.provider,
              value: p.billable,
            }))}
            colorOf={(name, i) =>
              name === 'claude' || name === 'codex'
                ? LAN_PROVIDER_COLORS[name]
                : USAGE_SHARE_COLORS[i % USAGE_SHARE_COLORS.length]
            }
          />
        </Section>
      </div>

      {data.top.length > 0 && (
        <Section title={t('usage.top')}>
          <div className="flex flex-col">
            {data.top.map((s, i) => {
              const d = new Date(s.lastTs);
              return (
                <button
                  key={s.key}
                  onClick={() => openPopout(`usage:${s.key}`)}
                  title={s.exists ? undefined : t('usage.deleted')}
                  className={`flex items-center gap-6 w-full min-w-0 py-2 text-left text-sm bg-transparent border-0 cursor-pointer hover:bg-btn-hover ${s.exists ? '' : 'opacity-50'}`}
                >
                  <span className="w-[20px] shrink-0 text-right text-text-muted font-mono">
                    {i + 1}
                  </span>
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
                    <span className="shrink-0 max-w-[25%] truncate text-xs text-text-muted">
                      {s.folder}
                    </span>
                  )}
                  <span className="ml-auto shrink-0 text-xs text-text-muted">
                    {`${String(d.getMonth() + 1)}/${String(d.getDate())}`}
                  </span>
                  <span className="w-[56px] shrink-0 text-right font-mono">
                    {tokensText(s.billable)}
                  </span>
                </button>
              );
            })}
          </div>
        </Section>
      )}
    </>
  );
}
