/* eslint-disable pixel-agents/no-inline-colors -- people's tag colours here are profile data, not UI colours */
// Fictional data for the README screenshots: ServerMessages the Vite dev page (browserMock)
// accepts as `window` message events. Nothing here is real — names, titles, numbers are made up.

import { readFileSync } from 'node:fs';

/** The page reloads on a server version other than its own bundle's (versionReload). */
const VERSION = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
).version;
const SELF = 'p-self';
const DAY = 86_400_000;

const peer = (id, account, palette, extra = {}) => ({
  id,
  account,
  nickname: '',
  palette,
  hueShift: 0,
  ver: VERSION,
  ...extra,
});

/** Me plus nine colleagues in the public office. */
export const PEERS = [
  peer(SELF, 'yoojungyu', 0, { tagColors: { bg: '#1d4ed8', fg: '#ffffff' } }),
  peer('p-minji', 'kim.minji', 1, {
    nickname: '민지',
    tagColors: { bg: '#be185d', fg: '#ffffff' },
  }),
  peer('p-jun', 'park.jun', 2, { nickname: '준' }),
  peer('p-seo', 'lee.seo', 3, { hueShift: 120 }),
  peer('p-choi', 'choi.dev', 4, {
    nickname: '최개발',
    tagColors: { bg: '#15803d', fg: '#ffffff' },
  }),
  peer('p-ha', 'jung.ha', 5, { hueShift: 200 }),
  peer('p-kang', 'kang.sw', 1, { hueShift: 300 }),
  peer('p-yoon', 'yoon.ai', 0, { pet: 'claudio', nickname: '윤' }),
  peer('p-han', 'han.git', 0, { pet: 'gitcat' }),
  peer('p-oh', 'oh.qa', 3, { ver: '1.0.41', hueShift: 60 }),
];
const P = Object.fromEntries(PEERS.map((p) => [p.id, p]));

let seq = 0;
/** One agent as it arrives in a snapshot (`OfficeAgent`). */
function agent(peerId, a) {
  const id = a.id ?? `s${String(++seq)}`;
  return {
    provider: 'claude',
    kind: 'main',
    num: 1,
    permission: false,
    target: '',
    reason: '',
    ...a,
    id,
    key: `${peerId}:${id}`,
    ...(a.parentId && { parentKey: `${peerId}:${a.parentId}` }),
    peer: P[peerId],
  };
}
/** Colleagues' sessions as the LAN shares them (1.0.65): title, model, tokens, context. */
const SESSIONS = {
  'p-minji:a': {
    title: '결제 API 리팩터링',
    model: 'claude-opus-5-5',
    tokens: 640_000,
    rate: 21_000,
    ctx: 41,
  },
  'p-jun:a': {
    title: '대시보드 차트 성능 개선',
    model: 'claude-sonnet-5-5',
    tokens: 180_000,
    rate: 8_000,
    ctx: 22,
  },
  'p-jun:b': {
    title: '푸시 알림 딥링크',
    model: 'claude-sonnet-5-5',
    tokens: 90_000,
    rate: 3_000,
    ctx: 12,
  },
  'p-seo:a': {
    title: '야간 배치 중복 제거',
    model: 'claude-opus-5-5',
    tokens: 1_200_000,
    rate: 52_000,
    ctx: 63,
  },
  'p-choi:a': {
    title: '결제 실패 재시도 정책',
    model: 'claude-opus-5-5',
    tokens: 310_000,
    rate: 12_000,
    ctx: 35,
  },
  'p-ha:a': { title: '빌드 정리', model: 'gpt-5-codex', tokens: 150_000, rate: 5_000, ctx: 18 },
  'p-kang:a': {
    title: '버튼 토큰 다크모드',
    model: 'claude-sonnet-5-5',
    tokens: 70_000,
    rate: 0,
    ctx: 9,
  },
  'p-kang:b': {
    title: '불꽃 오라 스프라이트',
    model: 'claude-haiku-5-5',
    tokens: 40_000,
    rate: 2_000,
    ctx: 6,
  },
  'p-yoon:a': {
    title: '대시보드 차트 성능 개선',
    model: 'claude-opus-5-5',
    tokens: 260_000,
    rate: 16_000,
    ctx: 30,
  },
  'p-yoon:b': {
    title: '푸시 알림 딥링크',
    model: 'claude-sonnet-5-5',
    tokens: 120_000,
    rate: 4_000,
    ctx: 15,
  },
  'p-han:a': {
    title: '야간 배치 중복 제거',
    model: 'claude-sonnet-5-5',
    tokens: 95_000,
    rate: 1_000,
    ctx: 11,
  },
  'p-oh:a': { title: '빌드 정리', model: 'gpt-5-codex', tokens: 60_000, rate: 2_000, ctx: 8 },
  'p-oh:b': {
    title: '버튼 토큰 다크모드',
    model: 'claude-sonnet-5-5',
    tokens: 30_000,
    rate: 0,
    ctx: 4,
  },
};
/** A colleague's agent in the public office (LAN): no target or reason, but the session's title,
 *  model, tokens and context; children carry their session's title only. */
const quiet = (peerId, a) => {
  const s = SESSIONS[`${peerId}:${a.parentId ?? a.id}`];
  const main = !a.parentId;
  return agent(peerId, {
    ...a,
    quiet: true,
    target: '',
    reason: '',
    ...(s && { title: s.title }),
    ...(s &&
      main && {
        usage: { tokens: s.tokens, rate: s.rate, model: s.model },
        ctx: { used: s.ctx * 2_000, window: 200_000 },
        heat: heat(s.tokens, s.rate),
      }),
  });
};
/** core heatOf, for made-up numbers. */
const heat = (tokens, rate) => ({
  size: tokens >= 1_000_000 ? 2 : tokens >= 300_000 ? 1 : 0,
  burn: rate >= 75_000 ? 3 : rate >= 40_000 ? 2 : rate >= 15_000 ? 1 : 0,
});

/** My agents in full detail; `t` advances the effect counters between snapshots. */
export function myAgents(t = 0) {
  return [
    agent(SELF, {
      id: 'm1',
      num: 1,
      room: 'coding',
      act: 'edit',
      target: 'webview-ui/src/lan/UsagePanel.tsx',
      reason: '사용량 패널을 왼쪽 위 버튼 아래로 옮기는 중',
      title: '토큰 사용량 패널',
      ageSec: 74,
      todo: { done: 3 + Math.min(t, 1), total: 7 },
      diff: { add: 186 + t * 24, del: 41 + t * 6 },
      ctx: { used: 624_000, window: 1_000_000 },
      usage: { tokens: 1_420_000, rate: 92_000, model: 'claude-opus-5-5', sum: 1_910_000 },
    }),
    agent(SELF, {
      id: 'm1/sub/a',
      kind: 'subagent',
      num: 0,
      parentId: 'm1',
      room: 'server',
      zone: 'build',
      act: 'run',
      target: 'npx tsc --noEmit -p webview-ui',
      reason: '차트 레이아웃 타입 검사',
      title: '차트 레이아웃',
      ageSec: 31,
      ctx: { used: 88_000, window: 200_000 },
      usage: { tokens: 490_000, rate: 46_000, model: 'claude-sonnet-5-5' },
    }),
    agent(SELF, {
      id: 'm2',
      num: 2,
      room: 'server',
      zone: 'test',
      act: 'run',
      target: 'npm run test:server -- usage',
      reason: '사용량 집계 테스트 실행',
      title: '사용량 집계',
      ageSec: 410,
      fail: t >= 1 ? true : undefined,
      ctx: { used: 152_000, window: 200_000 },
      usage: {
        tokens: 610_000,
        rate: 21_000,
        model: 'claude-opus-5-5',
        big: { n: t, last: 82_000 },
      },
    }),
    agent(SELF, {
      id: 'm2/sh/1',
      kind: 'shell',
      num: 0,
      parentId: 'm2',
      room: 'server',
      zone: 'run',
      act: 'run',
      target: 'npm run dev',
      ageSec: 1260,
    }),
    agent(SELF, {
      id: 'm3',
      num: 3,
      room: 'library',
      act: 'search',
      target: 'tokensText',
      reason: '숫자 표기가 쓰이는 곳 찾기',
      title: '표기 정리',
      ageSec: 12,
      ctx: { used: 41_000, window: 200_000 },
      usage: { tokens: 120_000, rate: 6_000, model: 'claude-haiku-5-5' },
    }),
    agent(SELF, {
      id: 'c4',
      provider: 'codex',
      num: 4,
      room: 'server',
      zone: 'git',
      act: 'run',
      target: 'git push -u origin feat/token-usage',
      title: '브랜치 올리기',
      ageSec: 8,
      usage: { tokens: 230_000, rate: 9_000, model: 'gpt-5-codex' },
    }),
  ];
}

/** Colleagues' agents (quiet) spread over every room and server zone. */
export function peerAgents() {
  return [
    quiet('p-minji', { id: 'a', num: 1, room: 'coding', act: 'edit', ageSec: 0 }),
    quiet('p-minji', {
      id: 'a/sub/x',
      kind: 'subagent',
      num: 0,
      parentId: 'a',
      room: 'coding',
      act: 'edit',
    }),
    quiet('p-jun', { id: 'a', num: 1, room: 'coding', act: 'edit' }),
    quiet('p-jun', { id: 'b', num: 2, room: 'library', act: 'web' }),
    quiet('p-seo', { id: 'a', num: 1, room: 'server', zone: 'build', act: 'run' }),
    quiet('p-seo', {
      id: 'a/sh/1',
      kind: 'shell',
      num: 0,
      parentId: 'a',
      room: 'server',
      zone: 'build',
      act: 'run',
    }),
    quiet('p-choi', { id: 'a', num: 1, room: 'library', act: 'read' }),
    quiet('p-choi', {
      id: 'a/sub/r',
      kind: 'subagent',
      num: 0,
      parentId: 'a',
      room: 'library',
      act: 'read',
      talk: true,
    }),
    quiet('p-ha', { id: 'a', provider: 'codex', num: 1, room: 'server', zone: 'git', act: 'run' }),
    quiet('p-kang', { id: 'a', num: 1, room: 'lounge', act: 'ask', permission: true }),
    quiet('p-kang', { id: 'b', num: 2, room: 'coding', act: 'edit' }),
    quiet('p-yoon', { id: 'a', num: 1, room: 'library', act: 'search' }),
    quiet('p-yoon', { id: 'b', num: 2, room: 'server', zone: 'test', act: 'run' }),
    quiet('p-han', { id: 'a', num: 1, room: 'server', zone: 'git', act: 'run' }),
    quiet('p-oh', { id: 'a', provider: 'codex', num: 1, room: 'server', zone: 'test', act: 'run' }),
    quiet('p-oh', { id: 'b', num: 2, room: 'lounge', act: 'idle' }),
  ];
}

const chat = (id, text) => ({ id, text });
/** Everyone's avatar spot (an unwalkable one moves to the closest free tile) and chat bubbles. */
export function people(view = 'public') {
  if (view === 'gallery') view = 'personal';
  const spots = {
    [SELF]: { col: 49, row: 44, dir: 'right' },
    'p-minji': { col: 52, row: 44, dir: 'left', chat: chat('c1', '사용량 패널 좋네요 👍') },
    'p-jun': { col: 60, row: 40, dir: 'down' },
    'p-seo': { col: 66, row: 46, dir: 'up', chat: chat('c2', '빌드 5분 뒤 끝나요') },
    'p-choi': { col: 72, row: 41, dir: 'down' },
    'p-ha': { col: 76, row: 47, dir: 'left' },
    'p-kang': { col: 56, row: 48, dir: 'up' },
    'p-yoon': { col: 63, row: 43, dir: 'right', chat: chat('c3', '점심 뭐 먹죠?') },
    'p-han': { col: 70, row: 45, dir: 'left' },
    'p-oh': { col: 79, row: 43, dir: 'down' },
  };
  const list = view === 'public' ? PEERS : PEERS.filter((p) => p.id === SELF);
  return list.map((p) => {
    const s = spots[p.id];
    const { id, ...rest } = p;
    return {
      peerId: id,
      ...rest,
      // The office is one LAN since 1.0.64: everyone here is on my network.
      ...(id === SELF ? { self: true, net: 'a1' } : { via: 'lan', net: 'a1' }),
      ...(view === 'public' && s.chat && { chat: s.chat }),
      avatar: { col: s.col, row: s.row, dir: s.dir },
    };
  });
}

/** The character gallery (personal office, mine only): one agent per state, `t` 1 fires the
 *  effects (lines added, a failure, a big tool result, a finished task list). */
export function galleryAgents(t = 0) {
  const mine = myAgents(t).filter((a) => a.id !== 'm3');
  return [
    ...mine,
    agent(SELF, {
      id: 'm3',
      num: 3,
      room: 'library',
      act: 'read',
      target: 'docs/설치-안내.md',
      reason: '설치 안내에서 알림 설명 찾기',
      title: '알림 설명',
      ageSec: 12,
      todo: { done: 6 + Math.min(t, 1), total: 7 },
      ctx: { used: 41_000, window: 200_000 },
      usage: { tokens: 120_000, rate: 6_000, model: 'claude-haiku-5-5' },
    }),
    agent(SELF, {
      id: 'm5',
      num: 5,
      room: 'lounge',
      act: 'ask',
      permission: true,
      target: 'rm -rf dist',
      title: '빌드 정리',
      ageSec: 95,
      usage: { tokens: 40_000, rate: 0, model: 'claude-sonnet-5-5' },
    }),
  ];
}

export function snapshot(view = 'public', t = 0) {
  return {
    type: 'officeSnapshot',
    agents:
      view === 'public'
        ? [...myAgents(t), ...peerAgents()]
        : view === 'gallery'
          ? galleryAgents(t)
          : myAgents(t),
    people: people(view),
    selfPeerId: SELF,
  };
}

/** App users on other networks: the relay lists them in the people panel only (never in the
 *  office), grouped by network; one is in personal mode. */
const REMOTE = [
  { ...peer('p-song', 'song.be', 4), via: 'relay', net: 'b2' },
  { ...peer('p-lim', 'lim.ios', 1, { hueShift: 120 }), via: 'relay', net: 'b2' },
  { ...peer('p-baek', 'baek.data', 5), via: 'relay', net: 'c3' },
].map(({ id, ...p }) => ({ peerId: id, ...p }));
const REMOTE_PERSONAL = [{ ...peer('p-moon', 'moon.ml', 2), net: 'c3' }].map(({ id, ...p }) => ({
  peerId: id,
  ...p,
}));

export function directory(view = 'public') {
  if (view === 'gallery') view = 'personal';
  const ps = people(view).map(({ chat: _c, avatar: _a, ...p }) => p);
  return view === 'public'
    ? { type: 'peopleDirectory', public: [...ps, ...REMOTE], teams: [], personal: REMOTE_PERSONAL }
    : { type: 'peopleDirectory', public: [], teams: [], personal: ps };
}

/** The handshake bits the page needs before snapshots (assets come from browserMock). */
export function handshake(view = 'public') {
  if (view === 'gallery') view = 'personal';
  return [
    { type: 'officeAccess', readOnly: false, version: VERSION },
    {
      type: 'profileLoaded',
      profile: {
        nickname: '',
        palette: 0,
        hueShift: 0,
        manualPeers: [],
        tagColors: PEERS[0].tagColors,
      },
      canEdit: true,
      account: 'yoojungyu',
      firstRun: false,
    },
    { type: 'officesState', offices: [], activeView: view },
    { type: 'relayState', state: view === 'public' ? 'connected' : 'off' },
    directory(view),
  ];
}

// ── Usage panel: a busy month across projects, models and both providers ──────────────

const rnd = (() => {
  let s = 7;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
})();

export function usageLoaded(range = '30d', now = Date.UTC(2026, 10, 12, 9)) {
  const n = range === '7d' ? 7 : range === '30d' ? 30 : 74;
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now - i * DAY);
    const dow = d.getUTCDay();
    const weekend = dow === 0 || dow === 6;
    const k = weekend ? 0.15 : 0.5 + rnd() * 1.1;
    const quietDay = !weekend && rnd() < 0.08;
    const m = quietDay ? 0 : k;
    days.push({
      day: d.toISOString().slice(0, 10),
      input: Math.round(m * 90_000 * (0.6 + rnd())),
      output: Math.round(m * 260_000 * (0.6 + rnd())),
      cacheCreate: Math.round(m * 1_900_000 * (0.6 + rnd())),
      cacheRead: Math.round(m * 48_000_000 * (0.6 + rnd())),
    });
  }
  const sum = (key) => days.reduce((a, d) => a + d[key], 0);
  const totals = {
    input: sum('input'),
    output: sum('output'),
    cacheCreate: sum('cacheCreate'),
    cacheRead: sum('cacheRead'),
    sessions: Math.round(n * 9.4),
  };
  totals.billable = totals.input + totals.output + totals.cacheCreate;
  const share = (rows) => {
    const w = rows.reduce((a, r) => a + r[1], 0);
    return rows.map(([name, x]) => [name, Math.round((totals.billable * x) / w)]);
  };
  const projects = share([
    ['payments-api', 31],
    ['pixel-office', 24],
    ['web-console', 15],
    ['infra-terraform', 9],
    ['mobile-app', 7],
    ['design-system', 6],
    ['data-pipeline', 5],
    ['docs-site', 3],
  ]).map(([name, billable]) => ({ name, billable }));
  const models = share([
    ['claude-opus-5-5', 46],
    ['claude-sonnet-5-5', 28],
    ['gpt-5-codex', 17],
    ['claude-haiku-5-5', 9],
  ]).map(([model, billable]) => ({ model, billable }));
  const providers = share([
    ['claude', 83],
    ['codex', 17],
  ]).map(([provider, billable]) => ({ provider, billable }));
  const titles = [
    ['결제 API 리팩터링', 'payments-api', 'claude', true],
    ['토큰 사용량 패널', 'pixel-office', 'claude', true],
    ['대시보드 차트 성능 개선', 'web-console', 'claude', true],
    ['VPC 모듈 정리', 'infra-terraform', 'codex', true],
    ['결제 실패 재시도 정책', 'payments-api', 'claude', false],
    ['푸시 알림 딥링크', 'mobile-app', 'claude', true],
    ['버튼 토큰 다크모드', 'design-system', 'codex', true],
    ['야간 배치 중복 제거', 'data-pipeline', 'claude', false],
    ['불꽃 오라 스프라이트', 'pixel-office', 'claude', true],
    ['API 문서 예제 갱신', 'docs-site', 'codex', true],
  ];
  const top = titles.map(([title, folder, provider, exists], i) => ({
    key: `k${String(i)}`,
    provider,
    title,
    folder,
    lastTs: now - Math.floor(i * 2.7 + rnd() * 2) * DAY,
    billable: Math.round(totals.billable * (0.11 / (1 + i * 0.42))),
    exists,
  }));
  return {
    type: 'usageLoaded',
    range,
    scanning: false,
    totals,
    days,
    projects,
    models,
    providers,
    top,
  };
}

export const usageNow = (today = 3_870_000) => ({ type: 'usageNow', today, scanning: false });

/** The English screenshots' copy of the made-up texts above. */
const EN = {
  'API 문서 예제 갱신': 'Refresh API doc examples',
  'VPC 모듈 정리': 'Tidy the VPC module',
  'docs/설치-안내.md': 'docs/INSTALL.en.md',
  '결제 API 리팩터링': 'Refactor the payments API',
  '결제 실패 재시도 정책': 'Payment retry policy',
  '대시보드 차트 성능 개선': 'Faster dashboard charts',
  민지: 'Minji',
  '버튼 토큰 다크모드': 'Dark-mode button tokens',
  '불꽃 오라 스프라이트': 'Flame aura sprite',
  '브랜치 올리기': 'Push the branch',
  '빌드 5분 뒤 끝나요': 'Build done in 5 min',
  '빌드 정리': 'Clean the build',
  '사용량 집계 테스트 실행': 'Running the usage index tests',
  '사용량 집계': 'Usage index',
  '사용량 패널 좋네요 👍': 'Love the usage panel 👍',
  '사용량 패널을 왼쪽 위 버튼 아래로 옮기는 중':
    'Moving the usage panel under the top-left buttons',
  '설치 안내에서 알림 설명 찾기': 'Looking up the notifications in the install guide',
  '숫자 표기가 쓰이는 곳 찾기': 'Finding where numbers are formatted',
  '알림 설명': 'Notification docs',
  '야간 배치 중복 제거': 'Dedupe the nightly batch',
  윤: 'Yoon',
  '점심 뭐 먹죠?': 'Lunch?',
  준: 'Jun',
  '차트 레이아웃 타입 검사': 'Type-checking the chart layout',
  '차트 레이아웃': 'Chart layout',
  최개발: 'Choi',
  '토큰 사용량 패널': 'Token usage panel',
  '표기 정리': 'Number formats',
  '푸시 알림 딥링크': 'Push notification deep links',
};

/** `msgs` with the made-up Korean texts in English (longest first, so no partial hits). */
export function inLang(msgs, lang) {
  if (lang !== 'en') return msgs;
  let json = JSON.stringify(msgs);
  for (const ko of Object.keys(EN).sort((a, b) => b.length - a.length))
    json = json.split(JSON.stringify(ko).slice(1, -1)).join(EN[ko]);
  return JSON.parse(json);
}
