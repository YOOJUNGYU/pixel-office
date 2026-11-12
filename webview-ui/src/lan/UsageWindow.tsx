// The 📊 popout window: my live agents' usage now (top), my token history below. LOCAL ONLY:
// everything here comes from this PC's server over the popout socket (/ws/transcript).
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
  USAGE_RANGE_KEY,
  USAGE_SHARE_COLORS,
  USAGE_TOKEN_COLORS,
} from '../constants.js';
import { t, useLang } from '../i18n.js';
import { useThemePref } from '../theme.js';
import { transport } from '../transport/index.js';
import { providerName, tagBadge } from './lanAgents.js';
import { openPopout } from './transcriptWindows.js';
import { DayBars, HBars, ShareBar, Swatch } from './UsageCharts.js';
import { hitRate } from './usageCharts.js';
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

export function UsageWindow() {
  useLang();
  useThemePref(); // follows the office window's theme (storage event in theme.ts)
  const [range, setRange] = useState<UsageRange>(storedRange);
  const rangeRef = useRef(range);
  const [now, setNow] = useState<{ today: number; scanning?: boolean }>({ today: 0 });
  const [data, setData] = useState<UsageLoaded | null>(null);
  const [agents, setAgents] = useState<OfficeAgent[]>([]);

  useEffect(() => {
    document.title = t('usage.window');
  });

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
  useEffect(() => {
    rangeRef.current = range;
    try {
      localStorage.setItem(USAGE_RANGE_KEY, range);
    } catch {
      // private window: the range is just not remembered
    }
    if (transport.state === 'connected') transport.send({ type: 'openUsage', range });
  }, [range]);
  useEffect(
    () =>
      transport.onStateChange((s) => {
        if (s === 'connected') transport.send({ type: 'openUsage', range: rangeRef.current });
      }),
    [],
  );

  const scanning = now.scanning ?? !!data?.scanning; // usageNow is the fresher word once seen
  return (
    <div className="fixed inset-0 bg-bg text-text overflow-y-auto pixel-scrollbar">
      <div className="flex flex-col gap-10 p-12">
        <NowPanel agents={agents} today={now.today} scanning={scanning} />

        <div className="flex items-center gap-8">
          <div className="flex gap-2" role="tablist">
            {RANGES.map((r) => (
              <button
                key={r}
                role="tab"
                aria-selected={r === range}
                onClick={() => setRange(r)}
                className={`border-2 rounded-none px-8 py-2 text-sm cursor-pointer ${
                  r === range
                    ? 'bg-active-bg border-accent'
                    : 'bg-btn-bg border-transparent hover:bg-btn-hover'
                }`}
              >
                {t(`usage.range.${r}`)}
              </button>
            ))}
          </div>
        </div>

        {data && <History data={data} />}
      </div>
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
      <div className="grid grid-cols-4 gap-8">
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

      <div className="grid grid-cols-2 gap-8">
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
