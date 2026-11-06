# 인터넷 공개 오피스 (Cloudflare 중계) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공개 오피스 PC 들이 Cloudflare Worker + Durable Object 중계를 통해 망이 달라도 서로 보이게 한다 (팀/개인용은 같은 망 전용 그대로).

**Architecture:** 중계는 기존 sealed `pub` Wire 를 `to` 로 라우팅만 하는 DO 1개(`hub`). PC 는 Node 22 내장 `WebSocket` 으로 연결하고, `PeerNet` 이 중계 peer 를 UDP hello peer 와 같은 `hellos` 맵에 넣어 기존 수신 경로를 그대로 쓴다. 송신은 변할 때만 · 1 초 1 프레임 · 받는 사람 전원 한 프레임.

**Tech Stack:** TypeScript, Cloudflare Workers + Durable Objects (WebSocket Hibernation API), wrangler, Node 22 `WebSocket`, vitest, `ws` (테스트 전용, 이미 server devDependency).

**Spec:** `docs/superpowers/specs/2026-11-06-internet-public-office-design.md`

## Global Constraints

- 서버 새 런타임 의존성 금지. 중계 클라이언트 = Node 내장 `WebSocket` (prod Node v22.23.3).
- 레이어: `core/` 는 무의존; `server/`, `webview-ui/`, `relay/` 는 `core/` 에만 의존. `relay/` 는 루트 workspaces 에 넣지 않는다.
- 상수: 서버 → `server/src/constants.ts`, 프로토콜(닫기 코드·프레임) → `core/src/relay.ts`, 웹뷰 → `webview-ui/src/constants.ts`. 인라인 매직 넘버 금지.
- 프로토콜: `core/asyncapi.yaml` 수정 → `npm run asyncapi:generate`, `messages.ts` 같이 커밋. 모든 메시지 `additionalProperties: false`. 새 client 메시지는 privileged (기본).
- 사용자 문구는 `webview-ui/src/i18n.ts` (ko/en).
- 상한 기본 `RELAY_MAX_PEERS = 20`, 예산 `RELAY_DAILY_BUDGET = 1_800_000` (메시지 상당), 업그레이드·관리자 요청 1 건 = 20 메시지, 리셋 UTC 00:00.
- 소켓 속도 제한 `RELAY_MAX_FRAMES_PER_MIN = 120` 초과 → `kicked`, `RELAY_ABUSE_BAN_MIN = 60` 분 자동 차단. 관리자 강퇴 기본 `RELAY_KICK_HOURS = 24`.
- 송신 최소 간격 `RELAY_MIN_SEND_MS = 1_000`. 프레임 상한 `RELAY_MAX_FRAME_BYTES = 512 * 1024`.
- 만원·예산·강퇴·오류 어느 경우에도 공개 오피스에 머문다 — 개인용 전환 금지. 같은 망 UDP 는 계속.
- 팀/개인용 PC 는 중계에 연결하지 않는다. 자동 연결 (설정·안내 없음). 공유 레이아웃도 중계로 주고받는다.
- IP 차단·WAF·Turnstile 은 만들지 않는다 (spec "나중에").
- `ADMIN_TOKEN` 은 레포·설치 파일·웹뷰로 절대 나가지 않는다 (웹뷰에는 설정 여부 boolean 만).
- 커밋: husky (gitleaks + lint-staged), `--no-verify` 금지.

## Review Focus

1. **중계에 닿지 못함** (회사 프록시, DNS 차단, `RELAY_URL` 빈 값): 공개 오피스·같은 망 UDP 정상, 지수 백오프(5 s → 5 min), 로그는 상태 변화당 1 줄 — Task 4 테스트 `backs off and logs once`.
2. **같은 망 + 중계 둘 다로 닿는 peer**: UDP 로만 보내고 중계 프레임엔 넣지 않음; UDP 가 끊겨 중계로만 닿게 되면 그 peer 에 전체 presence 를 한 번 — Task 5 테스트 `udp lapse resends full over relay`.
3. **아바타를 계속 걷기** (초당 5 변화): 중계 프레임 ≤ 1/s — Task 5 테스트 `coalesces to one frame per second`.
4. **PC 시계가 틀림**: `budget`/`kicked` 재시도 시각은 서버가 주는 **상대 ms** 로 계산 (절대 시각 비교 금지) — Task 1 `close reason carries relative ms`, Task 4 `retry uses relative ms`.
5. **큰 presence/레이아웃** (받는 사람 20 명 × 수십 KB): 프레임 ≤ `RELAY_MAX_FRAME_BYTES` 로 나눠 보냄, 아무것도 버리지 않음 — Task 5 `splits frames over the byte cap`.

---

## File Structure

| 파일                                                                                                                             | 책임                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `core/src/relay.ts` (새)                                                                                                         | 중계 프레임 타입, 닫기 코드, 상수, `isPeerId`, `parseUp`/`parseDown`, `closeReason`/`parseCloseReason` |
| `relay/src/hub.ts` (새)                                                                                                          | 순수 허브 로직: 업그레이드 판정, 라우팅, 속도 제한, 예산, 차단, 관리자 토큰                            |
| `relay/src/index.ts` (새)                                                                                                        | Worker `fetch` 라우팅 + DO 클래스 `Hub` (Hibernation API 껍데기)                                       |
| `relay/wrangler.toml`, `relay/package.json`, `relay/tsconfig.json`, `relay/README.md` (새)                                       | 배포 설정·문서                                                                                         |
| `relay/test/hub.test.ts` (새)                                                                                                    | hub 순수 함수 테스트 (루트 vitest 로 실행)                                                             |
| `server/src/lan/relay.ts` (새)                                                                                                   | 중계 클라이언트: 연결·재접속·상태·프레임 송수신, `relayKick` HTTP                                      |
| `server/src/lan/peerNet.ts`                                                                                                      | 중계 peer live 관리, 라우팅(UDP vs 중계), 변화 감지 송신, 중계 수신                                    |
| `server/src/cli.ts`                                                                                                              | `Relay` 생성·연결, 상태 브로드캐스트                                                                   |
| `server/src/httpServer.ts`, `server/src/clientMessageHandler.ts`, `server/src/configPersistence.ts`                              | `relayState` 푸시, `setRelayAdminToken`, `relayKick`                                                   |
| `core/asyncapi.yaml` → `core/src/messages.ts`                                                                                    | 새 메시지 4 개 + `settingsLoaded.relayAdmin`                                                           |
| `webview-ui/src/lan/PeoplePanel.tsx`, `components/SettingsModal.tsx`, `hooks/useExtensionMessages.ts`, `i18n.ts`, `constants.ts` | 상태 칩, [강퇴], 토큰 입력                                                                             |
| `server/src/lan/crypto.ts`                                                                                                       | `isWireId` → core `isPeerId` 재사용                                                                    |

---

### Task 1: 중계 프레임 프로토콜 (`core/src/relay.ts`)

**Files:**

- Create: `core/src/relay.ts`
- Modify: `server/src/lan/crypto.ts` (`isWireId = isPeerId` 로 교체, `ID` 정규식 삭제)
- Test: `server/__tests__/lan/relayFrames.test.ts`

**Interfaces:**

- Produces:

  ```ts
  export const RELAY_CLOSE = {
    full: 4020,
    budget: 4021,
    kicked: 4022,
    replaced: 4023,
    bad: 4024,
  } as const;
  export type RelayCloseKind = keyof typeof RELAY_CLOSE;
  export const RELAY_MAX_FRAME_BYTES = 512 * 1024;
  export const RELAY_PATH = '/ws';
  export function isPeerId(s: unknown): s is string; // ^[A-Za-z0-9_.-]{1,64}$ (WIRE_MAX_ID 64 이동)
  export function isPublicKey(s: unknown): s is string; // 정규 base64, 디코드 32 B
  export interface PubWire {
    v: 2;
    t: 'pub';
    from: string;
    to: string;
    n: string;
    c: string;
  }
  export type RelayUp = { t: 'send'; w: PubWire[] };
  export type RelayDown =
    | { t: 'roster'; peers: { id: string; pk: string }[] }
    | { t: 'join'; id: string; pk: string }
    | { t: 'leave'; id: string }
    | { t: 'w'; w: PubWire[] };
  export function parseUp(text: string, from: string): RelayUp | null; // w[] 각 항목: t==='pub', from===from, isPeerId(to), n/c 문자열; 하나라도 틀리면 null; 텍스트 > RELAY_MAX_FRAME_BYTES → null
  export function parseDown(text: string): RelayDown | null;
  export function closeReason(kind: RelayCloseKind, ms?: number): string; // JSON {k, ms?} (≤ 123 B)
  export function parseCloseReason(
    code: number,
    reason: string,
  ): { kind: RelayCloseKind | 'other'; ms?: number };
  ```

  `ms` = **지금부터 몇 ms 후** 재시도 가능 (상대값; 시계 차이 무관).

- [ ] **Step 1: 실패 테스트 작성** — `relayFrames.test.ts`:
  - `parseUp` 정상 1 건 → 그대로; `from` 이 다른 항목 1 개 섞임 → null; `t:'hello'` → null; `to` 가 65 자 → null; 크기 초과 → null; JSON 아님 → null.
  - `parseDown` roster/join/leave/w 각각 왕복; 알 수 없는 `t` → null; roster 항목 pk 31 B → null.
  - `closeReason('budget', 3_600_000)` → `parseCloseReason(4021, …)` = `{kind:'budget', ms:3_600_000}`; `parseCloseReason(1006, '')` = `{kind:'other'}`; 깨진 reason → `{kind:<code 의 kind>}` (ms 없음).
  - `isWireId` (crypto) 기존 테스트 그대로 통과.
- [ ] **Step 2: 실행해 실패 확인** — `cd server && npx vitest run __tests__/lan/relayFrames.test.ts` → FAIL (모듈 없음)
- [ ] **Step 3: 구현** — 위 시그니처대로. `WIRE_MAX_ID` 는 `server/src/constants.ts` 에서 core 로 옮기고 server 는 core 에서 re-export 하거나 import 경로 수정.
- [ ] **Step 4: 통과 확인** — `npm run test:server` PASS, `npm run check-types` PASS
- [ ] **Step 5: Commit** — `feat(core): relay frame protocol`

---

### Task 2: 허브 순수 로직 (`relay/src/hub.ts`)

**Files:**

- Create: `relay/src/hub.ts`, `relay/test/hub.test.ts`, `relay/vitest.config.ts` (`include: ['test/**/*.test.ts']`)
- Modify: 루트 `package.json` scripts: `"test:relay": "vitest run --root relay"`, `test` 에 추가

**Interfaces:**

- Consumes: Task 1 전부.
- Produces:
  ```ts
  export interface Limits {
    maxPeers: number;
    dailyBudget: number;
    maxFramesPerMin: number;
    abuseBanMin: number;
    kickHours: number;
  }
  export const DEFAULT_LIMITS: Limits; // 20, 1_800_000, 120, 60, 24
  export const REQUEST_WEIGHT = 20; // 업그레이드/관리자 요청 1 건 = 메시지 20
  export interface HubState {
    day: string;
    used: number;
    bans: Record<string, number>;
  } // bans: id → until(ms epoch, 허브 시계)
  export interface Conn {
    id: string;
    pk: string;
    frames: number[];
  } // frames: 최근 1 분 수신 시각
  export function newState(now: number): HubState;
  export function charge(s: HubState, n: number, now: number): void; // UTC 날짜 바뀌면 used=0, day 갱신
  export function exhausted(s: HubState, l: Limits): boolean; // used >= dailyBudget
  export function msToReset(now: number): number; // 다음 UTC 00:00 까지
  export type Admit =
    { ok: true; replace?: Conn } | { ok: false; kind: RelayCloseKind; ms?: number };
  export function admit(
    s: HubState,
    conns: Conn[],
    id: string,
    pk: string,
    now: number,
    l: Limits,
  ): Admit;
  export type FrameResult =
    { deliver: Map<string, PubWire[]> } | { close: RelayCloseKind; ms: number; ban: true };
  export function onFrame(
    s: HubState,
    c: Conn,
    text: string,
    conns: Conn[],
    now: number,
    l: Limits,
  ): FrameResult;
  export function kick(s: HubState, id: string, hours: number, now: number): number; // until 반환
  export function unban(s: HubState, id: string): boolean;
  export function pruneBans(s: HubState, now: number): void;
  export function authorized(header: string | null, token: string): boolean; // "Bearer <t>", 상수 시간 비교, token '' → 항상 false
  ```

**판정 규칙 (테스트로 고정):**

- `admit` 순서: 형식(`isPeerId`, `isPublicKey`) 아님 → `bad`; 차단 중 → `kicked` (ms = until−now); `exhausted` → `budget` (ms = `msToReset`); 같은 id 접속 중 & pk 같음 → `{ok, replace}`; 같은 id & pk 다름 → `bad`; `conns.length >= maxPeers` → `full`; 그 외 ok.
- `onFrame`: 1 분 창 frames 가 `maxFramesPerMin` 초과 → `bans[id] = now + abuseBanMin 분`, `{close:'kicked', ms, ban:true}`; `parseUp(text, c.id)` null → 무시 (빈 deliver); 정상 → `to` 별로 묶음, 접속 안 한 `to` 는 버림, 자기 자신 `to` 버림.
- `charge` 는 DO 껍데기가 부른다 (프레임 1 = 1, 업그레이드·관리자 = `REQUEST_WEIGHT`).

- [ ] **Step 1: 실패 테스트** — `hub.test.ts`:
  - `admit`: 21 번째 → `{ok:false, kind:'full'}`; 차단된 id → `kicked` + ms ≈ 남은 시간; 예산 1_800_000 도달 → `budget` + `ms === msToReset(now)`; 같은 id·같은 pk → `replace` 에 옛 Conn; 같은 id·다른 pk → `bad`; id `'a b'` → `bad`.
  - `charge`: `2026-11-06T23:59:59Z` 에 100, `2026-11-07T00:00:01Z` 에 1 → `used === 1`.
  - `onFrame`: 1 분에 121 번째 프레임 → `{close:'kicked', ban:true, ms: 3_600_000}` 그리고 `s.bans[id]` 설정; `to` 가 없는 사람인 항목은 deliver 에 없음; `from` 위조 항목 → 빈 deliver.
  - `authorized('Bearer x', 'x')` true, `('Bearer y','x')` false, `(null,'x')` false, `('Bearer ', '')` false.
  - `msToReset(Date.parse('2026-11-06T15:00:00Z')) === 9 * 3_600_000`.
- [ ] **Step 2: 실패 확인** — `npm run test:relay` → FAIL
- [ ] **Step 3: 구현** — 위 시그니처·규칙대로. CF 타입 사용 금지 (순수 TS).
- [ ] **Step 4: 통과 확인** — `npm run test:relay` PASS
- [ ] **Step 5: Commit** — `feat(relay): hub admission, routing, budget and bans`

---

### Task 3: Worker + DO 껍데기, 배포 설정

**Files:**

- Create: `relay/src/index.ts`, `relay/wrangler.toml`, `relay/package.json` (devDependencies: `wrangler`, `@cloudflare/workers-types` 고정 버전; scripts `dev`, `deploy`, `check-types`), `relay/tsconfig.json`, `relay/README.md`, `relay/scripts/smoke.mjs`
- Modify: `.github/workflows/ci.yml` (`npm ci --prefix relay && npm run check-types --prefix relay`), `.gitignore` (`relay/node_modules`, `relay/.wrangler`)

**Interfaces:**

- Consumes: Task 2 `admit`, `onFrame`, `charge`, `kick`, `unban`, `pruneBans`, `authorized`, `DEFAULT_LIMITS`, `REQUEST_WEIGHT`; Task 1 `RELAY_CLOSE`, `closeReason`, `RELAY_PATH`.
- Produces (HTTP 계약, Task 4·6 이 사용):
  - `GET /ws?id=&pk=&v=` (Upgrade) → DO. 거부 시에도 **업그레이드 후** `close(RELAY_CLOSE[kind], closeReason(kind, ms))` (브라우저/Node WS 가 코드를 읽을 수 있게).
  - `POST /admin/kick` body `{id, hours?}` → `200 {until}` | `401` | `400`
  - `GET /admin/bans` → `200 {bans: {id: until}}`; `DELETE /admin/bans/<id>` → `200 {ok}`
  - `GET /admin/stats` → `200 {peers, used, budget, day}`

**DO 동작 (`class Hub`, `idFromName('hub')` 1 개):**

- `state.acceptWebSocket(ws)`; `ws.serializeAttachment({id, pk, frames: []})`; `state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))`.
- 접속 성공: 새 소켓에 `roster`(자기 제외 전원), 나머지에 `join`. `replace` 면 옛 소켓 `close(replaced)` + 나머지에 `leave` 후 `join`.
- `webSocketMessage`: `charge(1)` → `onFrame` → deliver 마다 받는 소켓에 `{t:'w', w}`; close 면 그 소켓 닫고 `leave` 방송. attachment 의 frames 갱신.
- `webSocketClose`/`webSocketError`: 남은 전원에 `leave`.
- 예산이 `exhausted` 로 바뀐 순간: 전원 `close(budget, ms)`.
- 상태 저장: `HubState` 를 `state.storage` 에 — `RELAY_BUDGET_FLUSH = 50` 회 charge 마다, 그리고 bans 바뀔 때 즉시. 생성자에서 `blockConcurrencyWhile` 로 로드. (`// ponytail: 잠들기 직전 최대 49 건 미기록, 예산 90% 여유로 흡수`)
- 한도 값은 `wrangler.toml [vars]` (`MAX_PEERS`, `DAILY_BUDGET` …) 가 있으면 우선, 없으면 `DEFAULT_LIMITS`. `ADMIN_TOKEN` 은 secret.
- `wrangler.toml`: `name = "pixel-office-relay"`, DO 바인딩 `HUB`, `[[migrations]] tag="v1" new_sqlite_classes=["Hub"]` (Free 플랜은 SQLite DO 만).

- [ ] **Step 1: 스모크 스크립트 작성** — `relay/scripts/smoke.mjs <wsUrl>`: Node 내장 WebSocket 으로 id A, B 접속 → A 가 B 앞 가짜 pub(정규 base64 n/c) 1 건 send → B 가 `{t:'w'}` 수신하면 `OK` 출력·exit 0, 3 초 내 못 받으면 exit 1. 같은 id·다른 pk 로 C 접속 → close code 4024 확인.
- [ ] **Step 2: 실패 확인** — `cd relay && npm i && npx wrangler dev --port 8787 &` 후 `node scripts/smoke.mjs ws://127.0.0.1:8787/ws` → FAIL (구현 없음)
- [ ] **Step 3: `index.ts` 구현** (위 동작)
- [ ] **Step 4: 통과 확인** — 같은 스모크 → `OK`; `curl -s -H 'Authorization: Bearer wrong' localhost:8787/admin/stats` → 401; `.dev.vars` 의 `ADMIN_TOKEN=test` 로 `curl -s -H 'Authorization: Bearer test' localhost:8787/admin/stats` → `{"peers":0,…}`; `npm run check-types --prefix relay` PASS
- [ ] **Step 5: README** — `npx wrangler login` → `npx wrangler deploy` → `npx wrangler secret put ADMIN_TOKEN` → 출력된 `https://pixel-office-relay.<sub>.workers.dev` 를 `RELAY_URL` (wss) 로; curl 관리 예시 4 개; 무료 한도 표 (spec 그대로).
- [ ] **Step 6: Commit** — `feat(relay): Cloudflare worker and hub durable object`

---

### Task 4: 중계 클라이언트 (`server/src/lan/relay.ts`)

**Files:**

- Create: `server/src/lan/relay.ts`, `server/__tests__/lan/relay.test.ts`
- Modify: `server/src/constants.ts`

**Interfaces:**

- Consumes: Task 1 `RelayDown`, `PubWire`, `parseDown`, `parseCloseReason`, `RELAY_PATH`.
- Produces:
  ```ts
  // constants.ts
  export const RELAY_URL = ''; // Task 8 에서 실제 주소. '' = 끔
  export const RELAY_URL_ENV = 'PIXEL_OFFICE_RELAY_URL';
  export const RELAY_MIN_SEND_MS = 1_000;
  export const RELAY_RETRY_MIN_MS = 5_000;
  export const RELAY_RETRY_MAX_MS = 5 * 60_000;
  export const RELAY_RETRY_FULL_MS = 5 * 60_000;
  export const RELAY_RETRY_JITTER_MS = 10 * 60_000; // budget 리셋 몰림 방지 (0..이 값)
  export const RELAY_PING_MS = 30_000; // 'ping' 텍스트 (auto-response)

  // relay.ts
  export type RelayStateKind =
    'off' | 'connecting' | 'connected' | 'full' | 'budget' | 'kicked' | 'error';
  export interface RelayStatus {
    state: RelayStateKind;
    retryInMs?: number;
  }
  export function relayUrl(env: NodeJS.ProcessEnv): string; // env 우선; wss:// 만, ws://127.0.0.1|localhost 예외; 그 외 ''
  export function retryAfter(
    kind: RelayCloseKind | 'other',
    ms: number | undefined,
    attempt: number,
    rand: () => number,
  ): number;
  //   full → RELAY_RETRY_FULL_MS; budget → ms + rand()*JITTER; kicked → ms; replaced → Infinity; bad/other → min(MIN*2^attempt, MAX)
  export class Relay {
    constructor(opts: {
      url: string;
      id: string;
      pk: string;
      version: string;
      onDown(f: RelayDown): void;
      onOpen(): void;
      onClosed(): void;
      onStatus(s: RelayStatus): void;
      now?: () => number;
      rand?: () => number;
    });
    want(on: boolean): void; // true: 미연결이고 재시도 시각 지났으면 연결; false: 닫고 'off'
    send(w: PubWire[]): boolean; // 연결 중이 아니면 false. 직렬화 > RELAY_MAX_FRAME_BYTES 면 false (호출측이 나눔)
    get status(): RelayStatus;
    stop(): void;
  }
  export async function relayKick(
    url: string,
    token: string,
    id: string,
  ): Promise<{ ok: boolean; reason?: 'auth' | 'network' | 'bad' }>;
  //   wss→https, POST {origin}/admin/kick
  ```
- 로그: 상태가 **바뀔 때만** `[Pixel Office] 인터넷 공개 오피스: <state>` 한 줄.

- [ ] **Step 1: 실패 테스트** — `relay.test.ts` (가짜 중계 = `ws` 의 `WebSocketServer`, 테스트 안 미니 라우터: 접속 시 roster, 메시지면 `to` 소켓에 `{t:'w', w}`):
  - `relayUrl({PIXEL_OFFICE_RELAY_URL:'ws://evil.com/ws'})` → `''`; `'ws://127.0.0.1:9/ws'` 허용; `'wss://x.workers.dev/ws'` 허용; 미설정 → `RELAY_URL`.
  - `retry uses relative ms`: `retryAfter('budget', 1000, 0, () => 0) === 1000`; `('kicked', 5000, 3, …) === 5000`; `('full', undefined, 0, …) === RELAY_RETRY_FULL_MS`; `('other', undefined, 10, …) === RELAY_RETRY_MAX_MS`; `('replaced', …) === Infinity`.
  - 연결 → `onOpen`, roster 수신 → `onDown({t:'roster'…})`, status `connected`.
  - 서버가 `close(4020, closeReason('full'))` → status `{state:'full', retryInMs: RELAY_RETRY_FULL_MS}`, `onClosed` 1 회, `want(true)` 즉시 재호출해도 재연결 안 함.
  - `backs off and logs once`: 닫힌 포트 URL 로 `want(true)` 반복 (가짜 now 진행) → 시도 간격 5 s, 10 s, 20 s…; `console.log` 의 상태 줄은 `error` 1 회.
  - `want(false)` → 소켓 닫힘, status `off`.
- [ ] **Step 2: 실패 확인** — `cd server && npx vitest run __tests__/lan/relay.test.ts` → FAIL
- [ ] **Step 3: 구현** — 내장 `WebSocket` (`globalThis.WebSocket`), URL 에 `?id=&pk=&v=` (encodeURIComponent). `RELAY_PING_MS` 마다 `'ping'`. 재시도는 `want()` 호출 시점 판정 (자체 타이머 없음 — PeerNet 1 s 틱이 부른다).
- [ ] **Step 4: 통과 확인** — PASS
- [ ] **Step 5: Commit** — `feat(server): relay client with backoff and status`

---

### Task 5: PeerNet 중계 통합

**Files:**

- Modify: `server/src/lan/peerNet.ts`, `server/src/lan/redact.ts` (`quietView`), `core/src/lan.ts` (`AgentView.quiet?: true`, `parseView` 읽기)
- Test: `server/__tests__/lan/peerNetRelay.test.ts` (새), `server/__tests__/lan/redact.test.ts` (quietView 추가)

**Interfaces:**

- Consumes: Task 4 `Relay` (opts 로 주입받는 최소 인터페이스만), Task 1 `RelayDown`, `PubWire`, `RELAY_MAX_FRAME_BYTES`.
- Produces:
  ```ts
  // PeerNet opts 추가
  relay?: { want(on: boolean): void; send(w: PubWire[]): boolean; connected(): boolean };
  // PeerNet 공개 메서드 추가
  relayDown(f: RelayDown): void;   // cli 가 Relay.onDown 에 연결
  relayClosed(): void;             // Relay.onClosed / want(false) 시
  relayOpened(): void;             // Relay.onOpen: 다음 roster 전원을 needsFull 로
  ```

**규칙:**

- `Heard` 에 `udpAt: number` 추가 (UDP hello 로 들은 시각, 중계만이면 0). `relayLive: Set<string>` = roster/join 으로 들어와 leave 전인 id.
- roster/join: 각 `{id, pk}` 를 `heard()` 와 같은 TOFU 핀·`MAX_HELLO_PEERS` 검사로 `hellos` 에 (UDP 회신 없음), `relayLive.add`, `needsFull.add(id)`. leave: `relayLive.delete`. `relayClosed`: `relayLive.clear()`, `needsFull.clear()`.
- `w`: 각 PubWire 를 `parseWire(JSON.stringify(w))` 로 재검증 → 기존 `pub` 처리 (공통 함수로 추출: `receivePub(w)`). 중계에서 온 hello/watch/card/team 은 존재할 수 없음 (parseDown 이 PubWire 만 허용).
- 생존: `live(id, at) = t - at <= PEER_TTL_MS || relayLive.has(id)` 를 `prune`(hellos, seen[PUBLIC_VIEW]), `peers`, `directory`, `layoutToPush` 의 TTL 검사에 사용. `aged(packet, t - e.at)` 는 그대로 (받은 뒤 경과로 늘리는 게 맞다).
- `sendNow()` 첫 줄 근처: `this.opts.relay?.want(this.inPublic())`.
- 공개 오피스 송신: 기존 UDP 루프는 `udpLive(h) = h.udpAt && t - h.udpAt <= PEER_TTL_MS` 인 peer 에만. 나머지 중 `relayLive` peer = 중계 대상.
  - 이전 틱에 UDP 로 보냈는데 이번엔 중계 대상 → `needsFull.add`.
  - `key = JSON.stringify(packet with every view's ageSec removed)`; `changed = key !== lastRelayKey`.
  - `t - lastRelaySend < RELAY_MIN_SEND_MS` 면 이번 틱 중계 송신 생략 (다음 틱이 잡는다: `lastRelayKey` 는 보낸 뒤에만 갱신).
  - 대상 = changed 면 중계 대상 전원, 아니면 `needsFull` 만. + 각 대상의 `layoutToPush(PUBLIC_VIEW, 'pub|'+id, …)`.
  - 대상별 sealed pub (기존 `pubTo` 의 seal 부분을 `sealPub(id, h, texts): PubWire[]` 로 추출, UDP 와 공유) 을 모아 `RELAY_MAX_FRAME_BYTES` 이하로 자른 프레임들로 `relay.send`. 첫 send 가 false 면 중단 (상태 유지 → 다음 틱 재시도).
  - 보냈으면 `lastRelayKey = key`, `lastRelaySend = t`, `needsFull.clear()` (보낸 대상만 제거).
- 팀/개인용일 때는 중계 송신 없음 (`want(false)` 가 닫는다).
- **중계로 보내는 presence 는 작업 상세를 뺀다** (사용자 결정 2026-11-06, 범위는 중계만 — controller ruling): `quietView(v: AgentView): AgentView` (`redact.ts`) = `ageSec`·`todo`·`diff`·`fail`·`ctx` 삭제, `target: ''`, `reason: ''`, `quiet: true`; **`act`·`room`·`provider`·`kind`·`tree`·`permission` 은 그대로** (방 이동·앉아서 일하기·PC 화면·! 는 유지). 이미 `hidden` 인 view 는 그대로 둔다 (`hideView` 가 더 강함). UDP 경로·자기 snapshot 은 불변. 변화 감지 `key` 는 quiet 적용 후 packet 으로 계산 (target 변화로는 송신하지 않음).
- `core/src/lan.ts`: `AgentView` 에 `quiet?: true`; `parseView` 가 `raw.quiet === true` 만 읽는다.

- [ ] **Step 1: 실패 테스트** — `peerNetRelay.test.ts`. 가짜 relay 객체 2 개를 메모리로 서로 잇는 헬퍼 `pair()` (A.send → B.relayDown({t:'w'}) 동기 전달, connected()=true) + `targets: () => []` (UDP 없음), 가짜 `now`:
  - `sees each other over relay only`: 양쪽에 roster 주입 → `sendNow()` 각 1 회 → `a.peers(PUBLIC_VIEW)` 에 B.
  - `no frame when nothing changed`: 이후 `now += 5_000` 마다 `sendNow()` 10 회 → 추가 send 0 건, 그런데도 B 는 `peers()` 에 남음 (relayLive).
  - `leave removes at once`: `relayDown({t:'leave', id:B})` → `peers()` 에서 B 사라짐.
  - `coalesces to one frame per second`: 0.2 s 간격으로 아바타 바꾸며 `sendNow()` 5 회 → send 1 건; `now += 1_000` 후 1 건 더 (마지막 값 담김).
  - `ageSec only change sends nothing`: views 의 ageSec 만 +1 → send 0 건.
  - `target only change sends nothing`: act 같고 target 만 바뀜 → send 0 건; act 가 바뀌면 1 건.
  - `relay presence is quiet`: B 가 받은 A 의 view 에 `quiet === true`, `target === ''`, `act` 는 A 의 act 그대로, `todo`/`diff`/`fail`/`ageSec` 없음. 같은 망(UDP) 으로 받은 경우엔 quiet 없음·target 그대로.
  - redact.test: `quietView` 가 act/room/permission 유지, 상세 삭제, `hidden` view 는 변경 없음.
  - `new joiner gets full state`: 변화 없음 상태에서 C join → 다음 `sendNow()` 가 C 앞 pub 만 담은 프레임 1 건.
  - `udp lapse resends full over relay`: B 를 UDP hello 로도 들은 상태(udpAt=now) → 송신은 UDP 만 (relay send 0); `now += PEER_TTL_MS + 1` → 다음 틱 relay send 에 B 앞 pub 포함.
  - `splits frames over the byte cap`: 받는 사람 30 명, presence 를 큰 views 로 → 모든 send 인자 직렬화 ≤ `RELAY_MAX_FRAME_BYTES`, 합치면 30 명 전원 포함.
  - `team mode closes relay`: offices 1 개 → `want(false)` 호출 확인.
  - `relay layout reaches peer`: A 의 layout rev 가 B 보다 새것 → 중계로 B 에 `layouts.receive` 호출.
  - 기존 `peerNet.test.ts` 전부 PASS (UDP 경로 불변).
- [ ] **Step 2: 실패 확인** — `cd server && npx vitest run __tests__/lan/peerNetRelay.test.ts` → FAIL
- [ ] **Step 3: 구현** — 위 규칙. 상수 `RELAY_MIN_SEND_MS` 는 Task 4 의 것. `// ponytail:` 주석 2 개: (1) roster pk 는 TOFU — 악의적 중계 운영자가 첫 만남에 가짜 pk 를 끼울 수 있음, 지문 비교 UI 로 업그레이드; (2) 같은 id+pk 흉내로 상대 소켓 밀어내기 가능 (내용은 못 읽음).
- [ ] **Step 4: 통과 확인** — `npm run test:server` PASS
- [ ] **Step 5: Commit** — `feat(server): public office over the relay, change-only sends`

---

### Task 6: 서버 연결 · 프로토콜 · 강퇴 API

**Files:**

- Modify: `server/src/cli.ts`, `server/src/httpServer.ts`, `server/src/clientMessageHandler.ts`, `server/src/configPersistence.ts`, `core/asyncapi.yaml`, `core/src/messages.ts` (생성)
- Test: `server/__tests__/clientMessageHandler.relay.test.ts` (새; 기존 핸들러 테스트 위치 관례 따름)

**Interfaces:**

- Consumes: Task 4 `Relay`, `relayUrl`, `relayKick`, `RelayStatus`; Task 5 `relayDown/relayOpened/relayClosed`, opts `relay`.
- Produces (asyncapi):
  - server→client `relayState {state: 'off'|'connecting'|'connected'|'full'|'budget'|'kicked'|'error', retryInMs?: integer ≥ 0}` — 핸드셰이크(`autostartState` 다음) + 바뀔 때 전원 소켓.
  - server→client `relayKickResult {ok: boolean, reason?: 'auth'|'network'|'bad'|'noToken'}` — 요청 소켓에만.
  - client→server `setRelayAdminToken {token: string}` (maxLength 256; '' = 삭제) → 응답으로 `settingsLoaded`.
  - client→server `relayKick {peerId: string}` (pattern = peer id) → `relayKickResult`.
  - `settingsLoaded.relayAdmin: boolean` (토큰 설정 여부; 값은 절대 안 보냄).
- `config.json standalone.relayAdminToken: string` (기본 '').
- `ClientMessageContext.relay?: { status(): RelayStatus; kick(id: string): Promise<{ok, reason?}> }`.

- [ ] **Step 1: 실패 테스트** — 핸들러 테스트:
  - `setRelayAdminToken {token:'abc'}` → config 에 저장, 응답 `settingsLoaded.relayAdmin === true`, 응답 JSON 어디에도 `'abc'` 없음.
  - `relayKick` 토큰 없음 → `relayKickResult {ok:false, reason:'noToken'}`; 있음 → `ctx.relay.kick` 가 `('peer-1')` 로 호출되고 결과 전달.
  - read-only ctx 에서 두 메시지 모두 거부 (기존 게이트).
  - 핸드셰이크에 `relayState` 포함.
- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: asyncapi 수정 + `npm run asyncapi:generate`**, 핸들러·config 구현. `cli.ts`: `const relay = new Relay({url: relayUrl(process.env), id, pk, version: APP_VERSION, onDown: f => peerNet.relayDown(f), onOpen: () => peerNet.relayOpened(), onClosed: () => peerNet.relayClosed(), onStatus: s => server.broadcast(relayStateMessage(s))})`; URL '' 이면 Relay 를 만들지 않음 (status 'off'). `NO_PEERS_ENV` 면 연결 안 함. shutdown 에서 `relay.stop()`. httpServer 에 기존 updater.broadcast 처럼 전원 송신 훅 추가.
- [ ] **Step 4: 통과 확인** — `npm run asyncapi:validate`, `npm run check-types`, `npm run test:server` PASS
- [ ] **Step 5: Commit** — `feat: relay state, admin token and kick messages`

---

### Task 7: 웹뷰 — 상태 칩, [강퇴], 관리자 토큰

**Files:**

- Modify: `webview-ui/src/hooks/useExtensionMessages.ts`, `webview-ui/src/lan/PeoplePanel.tsx`, `webview-ui/src/components/SettingsModal.tsx`, `webview-ui/src/i18n.ts`, `webview-ui/src/constants.ts`
- Create: `webview-ui/src/lan/relayStatus.ts` (순수: 상태 → i18n 키·칩 종류, `retryInMs` → "HH:MM" 표시)
- Modify: `webview-ui/src/lan/lanAgents.ts` / 말풍선 렌더 경로 (quiet → 말풍선 없음)
- Test: `webview-ui/test/relayStatus.test.ts`, quiet 말풍선 테스트 (기존 lanAgents/statusSignals 테스트 파일 관례 따름)

**Interfaces:**

- Consumes: Task 6 메시지들.
- Produces: `relayStatusView(s: {state, retryInMs?}, now: number): { key: Key; tone: 'ok'|'warn'|'muted'; until?: string } | null` (`off` → null).

**UI 결정:**

- 칩: 공개 오피스를 보고 있을 때 접속자 패널 "공개 오피스" 제목 오른쪽. `connected` = 🌐 + `relay.connected` ("인터넷 연결됨"), `connecting` = muted, `full`/`budget`/`kicked`/`error` = warn + 한 줄 사유 (`relay.full` "인터넷 연결 대기: 만원", `relay.budget` "인터넷 연결 중단: 오늘 한도 소진 (~HH:MM)", `relay.kicked` "관리자에 의해 퇴장 (~HH:MM 까지)", `relay.error` "인터넷 연결 안 됨 — 같은 망만 보임"). 영어 대응 키 같이.
- [강퇴]: `settings.relayAdmin === true` && 공개 오피스 보는 중 && 행이 나 아님 → 행 끝 작은 버튼 → `confirm(t('relay.kickConfirm', {name}))` → `relayKick`. `relayKickResult` → 기존 토스트 경로로 성공/실패 (`relay.kickOk`, `relay.kickFail.<reason>`).
- **quiet agent** (`OfficeAgent.quiet`, 중계로 받은 다른 PC 에이전트): 머리 위 말풍선·호버 말풍선·실패 물방울·효과(+N, 연기, 폭죽) 없음. 캐릭터 이동·착석·타이핑·PC 화면·서버실 LED·대기 ! 는 그대로. 방 팝업 카드의 활동 문구 = `act.quiet` ("작업 중" / "Working"; act idle 이면 기존 대기 문구).
- Settings: "관리자 토큰" password input + [저장] (빈 값 저장 = 삭제), 설정 여부 표시 (`settings.relayAdminSet`). 픽셀 스타일 규칙 (radius 0, 2px border).

- [ ] **Step 1: 실패 테스트** — quiet: `act:'edit', quiet:true` 에이전트 → 말풍선 텍스트/아이콘 없음(`actIcon` null 이 아니라 말풍선 자체 미생성), `effectTriggers` 가 아무것도 안 냄, `screenKind` 는 code 그대로. `relayStatus.test.ts`: `off` → null; `connected` → `{key:'relay.connected', tone:'ok'}`; `budget` + `retryInMs: 3_600_000`, now = 로컬 10:00 → `until === '11:00'`; `kicked` 동일; `full` → warn, until 없음.
- [ ] **Step 2: 실패 확인** — `npm run test:webview` FAIL
- [ ] **Step 3: 구현** — 위 결정. 색은 `constants.ts`/CSS 변수만 (eslint `no-inline-colors`).
- [ ] **Step 4: 통과 확인** — `npm run test:webview`, `npm run lint`, `npm run build` PASS. 수동: `PIXEL_OFFICE_RELAY_URL=ws://127.0.0.1:8787/ws node dist/cli.js` + `wrangler dev` → 칩 "인터넷 연결됨"; wrangler 끄면 "인터넷 연결 안 됨".
- [ ] **Step 5: Commit** — `feat(webview): relay status chip, admin kick and token`

---

### Task 8: 두 PC 종단 확인 · 문서 · 배포 주소

**Files:**

- Modify: `server/src/constants.ts` (`RELAY_URL`), `CLAUDE.md` (중계 절), `docs/설치-안내.md`, `docs/INSTALL.en.md`, `README.md`, `README.en.md`
- Create: `.superpowers/relay/e2e.mjs` (로컬 전용, 커밋 안 함 — 기존 `.superpowers/*/e2e.mjs` 관례)

- [ ] **Step 1: 로컬 종단** — `wrangler dev` + 인스턴스 2 개 (`PIXEL_OFFICE_UDP_PORT=47810 PIXEL_OFFICE_UDP_TARGETS=` 비움으로 UDP 차단, 각자 `PIXEL_OFFICE_RELAY_URL=ws://127.0.0.1:8787/ws`, 다른 HOME) → Playwright 로 서로의 아바타·채팅 보이는지, 레이아웃 저장이 건너가는지, `curl /admin/kick` 후 강퇴된 쪽 칩 "관리자에 의해 퇴장" + 여전히 공개 오피스, `/admin/stats` 의 `used` 가 1 분 정지 상태에서 늘지 않는지 (변화 없을 때 0 프레임). 결과 스크린샷.
- [ ] **Step 2: 배포 (사용자 작업)** — 사용자에게 순서대로 요청: `! cd relay && npx wrangler login`, `! cd relay && npx wrangler deploy`, `! cd relay && npx wrangler secret put ADMIN_TOKEN`. 출력된 workers.dev 주소 확인 후 `relay/scripts/smoke.mjs wss://…/ws` → `OK`.
- [ ] **Step 3: `RELAY_URL` 에 `wss://…workers.dev/ws` 기록**, `npm run build && npm test` PASS.
- [ ] **Step 4: 문서** — 설치 안내 ko/en·README: "공개 오피스는 인터넷으로도 연결됨 (계정명·닉네임·에이전트 활동 요약·채팅이 어디서든 공개 오피스의 모든 사람에게 보임; 내 작업 내용 숨기기로 줄일 수 있음; 팀 오피스는 같은 망 전용)", 상태 칩 의미, 회사 프록시 환경에선 연결 안 될 수 있음. CLAUDE.md: 중계 절 (구조, 프레임, 상한·예산·속도 제한, 강퇴, ponytail 한계 2 개, `relay/README.md` 링크), Data/Ports 에 "WSS 443 나가는 연결" 추가.
- [ ] **Step 5: Commit** — `feat: public office over the internet via Cloudflare relay`
