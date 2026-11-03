# 내 에이전트 세션 전문 패널 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 내 에이전트 캐릭터(또는 내 아바타 옆 대기실 목록)를 클릭하면 좌측 패널에 그 세션 transcript 전체가 뜨고 실시간으로 이어진다.

**Architecture:** 서버의 새 `lan/transcript.ts` 가 Claude/Codex jsonl 줄을 공통 `TranscriptEntry` 로 정규화하고, 바이트 오프셋 페이지로 끝/앞 구간을 읽는다. `TranscriptService` 가 소켓당 구독 1개를 들고 1 s 마다 파일 끝을 따라 읽어 요청 소켓에만 보낸다. 파일 경로는 `Scanner.transcriptOf(id)` 로만 얻으므로(이 PC 스캐너에 있는 세션만) 남의 에이전트는 구조적으로 열 수 없다. 웹뷰는 순수 상태 모듈 + 훅 + `TranscriptPanel`/`AvatarAgentList` 컴포넌트.

**Tech Stack:** TypeScript, Node stdlib (`fs/promises`), Fastify WS, React 19, Vitest, AsyncAPI 3 → `core/src/messages.ts` 생성.

**Spec:** `docs/superpowers/specs/2026-11-03-agent-transcript-panel-design.md`

## Global Constraints

- 전문·파일 경로·제목은 **어떤 경로로도 피어에게 나가지 않는다** — `AgentView`/`PeerPacket`/presence/`officeSnapshot` 에 넣지 않는다. 응답은 요청 소켓에만.
- 새 client 메시지는 privileged (기존 `handleClientMessage` 게이트로 보기 전용 ctx 거부 — 게이트 수정 금지).
- 프로토콜: `core/asyncapi.yaml` 수정 → `npm run asyncapi:generate`, `messages.ts` 함께 커밋, 모든 새 스키마 `additionalProperties: false`.
- 런타임 의존성 추가 금지. 마크다운 렌더 라이브러리 금지 (줄바꿈 보존 텍스트).
- 상수: 서버 `server/src/constants.ts`, 웹뷰 `webview-ui/src/constants.ts`; 색 literal 은 `webview-ui/src/constants.ts` 만; 문자열은 `webview-ui/src/i18n.ts` ko/en.
- 픽셀 스타일: `borderRadius: 0`, `2px solid`, `2px 2px 0px` 섀도, `pixel-panel` 클래스, Pretendard; 다크/라이트 둘 다 CSS 변수로.
- `server/`·`core/` 상대 import 는 `.js` 확장자; `import type`; `enum` 금지.
- 로그 prefix `[Pixel Office]` / `[Webview]`. 커밋은 husky 훅 통과 (`--no-verify` 금지).

## Review Focus

1. **한 줄이 페이지보다 큰 경우** (도구 결과 한 줄이 5 MB) — 페이지가 줄 하나도 못 담아도 빈 화면/무한 루프 없이 그 줄을 읽어 상한으로 잘라 보여야 한다. → Task 2 테스트.
2. **열어 둔 사이 파일이 잘리거나 다시 쓰임** (size < offset) — 처음부터 다시 `transcriptLoaded`. → Task 4 테스트.
3. **다른 PC 에이전트 id 로 직접 `openTranscript` 전송** — `notFound`, 어떤 파일도 안 읽음. → Task 4 테스트.
4. **소켓이 끊긴 뒤 폴링 계속** (타이머 누수) — 소켓 close 시 구독 제거. → Task 4 테스트.
5. **실시간 중 줄이 두 폴 사이에서 쪼개짐 (멀티바이트 포함)** — 깨진 항목 없이 다음 폴에 완성 줄로. → Task 4 테스트.

---

## File Structure

| 파일                                                                         | 책임                                                                         |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `server/src/lan/transcript.ts` (new)                                         | 정규화 `parseLines`, 페이지 읽기 `readPage`, `TranscriptService` (구독·폴링) |
| `server/src/lan/scanner.ts`                                                  | `transcriptOf(id)` 추가                                                      |
| `server/src/constants.ts`                                                    | `TRANSCRIPT_*` 상수                                                          |
| `core/asyncapi.yaml` (+ 생성 `core/src/messages.ts`)                         | 메시지 7종 + `TranscriptEntry`, `TranscriptInfo`                             |
| `server/src/clientMessageHandler.ts`, `httpServer.ts`, `server.ts`, `cli.ts` | 배선                                                                         |
| `webview-ui/src/lan/transcript.ts` (new)                                     | 순수 상태 리듀서 + 스크롤 판정                                               |
| `webview-ui/src/lan/useTranscript.ts` (new)                                  | transport 구독 훅                                                            |
| `webview-ui/src/lan/TranscriptPanel.tsx` (new)                               | 좌측 패널                                                                    |
| `webview-ui/src/lan/AvatarAgentList.tsx` (new)                               | 아바타 옆 대기실 목록                                                        |
| `webview-ui/src/lan/lanAgents.ts`                                            | `selfPeerId()`, `isMine()`, `loungeAgentsOf()`                               |
| `webview-ui/src/office/components/OfficeCanvas.tsx`                          | `onAvatarClick` prop                                                         |
| `webview-ui/src/lan/RoomPlates.tsx`                                          | `AgentCard` export (목록에서 재사용)                                         |
| `webview-ui/src/App.tsx`, `constants.ts`, `i18n.ts`, `index.css`             | 배선·상수·문구·변수                                                          |

---

### Task 1: 정규화 (`parseLines`)

**Files:**

- Create: `server/src/lan/transcript.ts`
- Modify: `server/src/constants.ts`
- Test: `server/__tests__/lan/transcript.test.ts`

**Interfaces:**

- Produces:
  ```ts
  export type TranscriptKind = 'user' | 'assistant' | 'thinking' | 'tool' | 'result' | 'meta';
  export interface TranscriptEntry {
    kind: TranscriptKind;
    text: string;
    ts?: string; // 원본 timestamp (ISO) 있으면
    tool?: string; // kind tool: 도구 이름
    callId?: string; // tool ↔ result 짝 (Claude tool_use id / Codex call_id)
    error?: true; // result 가 오류
    clipped?: number; // 잘려 나간 문자 수
  }
  export function parseLines(provider: Provider, lines: string[]): TranscriptEntry[];
  ```
  `Provider` 는 `core/src/lan.ts` 의 것.
- 상수 (`server/src/constants.ts`): `TRANSCRIPT_ENTRY_MAX_CHARS = 200_000`, `TRANSCRIPT_META_MAX_CHARS = 500`.

규칙:

- **Claude** (`obj.timestamp` → `ts`):
  - `type:'user'`, `message.content` 문자열 → `user` (단 `isMeta: true` 면 `meta`). 배열이면 `text` 블록 → `user`, `tool_result` 블록 → `result` (`callId = tool_use_id`, `is_error` → `error`, `content` 문자열 또는 블록 배열: text 이어 붙임, `image` → `[image]`).
  - `type:'assistant'`, `message.content` 배열: `text` → `assistant`, `thinking` → `thinking` (`b.thinking`, 빈 문자열이면 생략), `tool_use` → `tool` (`tool = name`, `callId = id`, `text = JSON.stringify(input, null, 2)`). `redacted_thinking` 생략.
  - `type:'system'` 의 `content` 문자열 → `meta`; `type:'summary'` 의 `summary` → `meta`; `attachment` 중 `content` 문자열 있는 것 → `meta`.
  - 그 밖의 type (`api-request*`, `last-prompt`, `mode`, `permission-mode`, `atis-latch`, `ai-title`, `custom-title`, `deferred_tools_record`, `file-history-snapshot` …) 생략.
- **Codex** (`{timestamp, type, payload}`):
  - `response_item` `message`: role `assistant` → `assistant`; role `user` → `user`, 단 텍스트가 `<environment_context>`·`<user_instructions>` 로 시작하면 `meta`; role `developer`/`system` 생략. content 는 블록 배열의 `text`(`input_text`/`output_text`) 이어 붙임.
  - `reasoning` → `thinking` (`summary[].text` 이어 붙임, 비면 생략).
  - `function_call` / `custom_tool_call` / `local_shell_call` / `web_search_call` → `tool` (`tool = name || type`, `callId = call_id`, `text` = `arguments` 문자열 / `input` / `JSON.stringify(action ?? {}, null, 2)`).
  - `function_call_output` / `custom_tool_call_output` → `result` (`output` 문자열, 또는 블록 배열 `text` 이어 붙임, 또는 `{content}` 객체의 `content`).
  - `event_msg` 전부 생략 — **단** 이 PC 의 실제 `~/.codex/sessions/**/rollout-*.jsonl` 에서 사용자 프롬프트가 `response_item` user 로 안 나오고 `event_msg user_message` 로만 나오면, `event_msg user_message` 를 `user` 로 쓰고 바로 앞 `user` 와 텍스트가 같으면 버린다. 구현 전에 실제 파일로 확인.
- 잘못된 JSON 줄은 조용히 생략.
- 모든 `text` 는 `TRANSCRIPT_ENTRY_MAX_CHARS` 초과 시 앞부분만 남기고 `clipped = 원래길이 - 남긴길이` (`meta` 는 `TRANSCRIPT_META_MAX_CHARS`).

- [ ] **Step 1: 실패 테스트 작성** — `describe('parseLines')`:
  - `'claude: prompt, answer, thinking, tool and result in order'` — user 문자열 줄 + assistant 줄(`[thinking, text, tool_use{id:'t1',name:'Bash',input:{command:'ls'}}]`) + user 줄(`[tool_result{tool_use_id:'t1', content:'a\nb', is_error:true}]`) →
    `kinds = ['user','thinking','assistant','tool','result']`, `tool` 항목 `{tool:'Bash', callId:'t1', text: JSON.stringify({command:'ls'},null,2)}`, `result` 항목 `{callId:'t1', text:'a\nb', error:true}`.
  - `'claude: noise lines are dropped'` — `api-request`, `last-prompt`, `permission-mode` 줄 → `[]`.
  - `'claude: image result becomes a placeholder'` → `text === '[image]'`.
  - `'codex: message, reasoning, call and output'` — `response_item` 4종 → `['user','thinking','tool','result']`, `callId` 짝 일치, developer 메시지 생략, `<environment_context>` user → `meta`.
  - `'clips a long text and reports how much'` — 길이 `TRANSCRIPT_ENTRY_MAX_CHARS + 10` → `text.length === TRANSCRIPT_ENTRY_MAX_CHARS`, `clipped === 10`.
  - `'bad json is skipped'` → `parseLines('claude', ['{oops', userLine])` 길이 1.
- [ ] **Step 2: 실행해 실패 확인** — `cd server && npx vitest run __tests__/lan/transcript.test.ts` → FAIL (모듈 없음).
- [ ] **Step 3: `parseLines` 구현** (위 규칙).
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS.
- [ ] **Step 5: 커밋** — `feat(transcript): normalize Claude/Codex transcript lines`

---

### Task 2: 페이지 읽기 (`readPage`)

**Files:**

- Modify: `server/src/lan/transcript.ts`, `server/src/constants.ts`
- Test: `server/__tests__/lan/transcript.test.ts`

**Interfaces:**

- Consumes: `parseLines` (Task 1).
- Produces:
  ```ts
  export interface TranscriptPage {
    entries: TranscriptEntry[];
    start: number;
    end: number;
    more: boolean;
  }
  /** [?, end) 의 완성된 줄들. end 는 줄 경계(파일 끝 또는 이전 page.start). */
  export async function readPage(
    file: string,
    provider: Provider,
    end: number,
  ): Promise<TranscriptPage>;
  ```
- 상수: `TRANSCRIPT_PAGE_BYTES = 512 * 1024`.

알고리즘: `from = max(0, end - PAGE)`; `[from, end)` 읽기; `from > 0` 이면 첫 `\n` 까지 버리고 `start = from + 그 위치 + 1`. 첫 `\n` 이 없고 `from > 0` 이면(한 줄이 페이지보다 큼) `from` 을 `PAGE` 만큼 더 뒤로 물려 다시 — `\n` 을 찾거나 0 에 닿을 때까지. `end` 가 파일 끝이고 마지막이 `\n` 으로 안 끝나면 그 미완성 꼬리는 제외하고 `end` 를 그 꼬리 시작으로 낮춘다(실시간 쪽이 이어 읽음). `more = start > 0`. 디코딩은 `Buffer` 를 줄 단위로 자른 뒤 `toString('utf8')` (멀티바이트가 경계에서 안 깨짐: 자르는 곳이 항상 `\n`).

- [ ] **Step 1: 실패 테스트** — `describe('readPage')` (tmp 파일):
  - `'small file: everything, no more'` → 3줄 파일, `readPage(f,'claude', size)` → `entries.length === 3`, `start === 0`, `more === false`.
  - `'big file: tail page then the page before it, no line lost or doubled'` — `PAGE` 의 약 2.5배 크기(사용자 줄 N개, 텍스트에 번호) → 끝 페이지 + `readPage(f,'claude', p1.start)` 반복 → 모은 번호가 `0..N-1` 정확히 한 번씩, 마지막 `more === false`.
  - `'one line larger than a page'` — 가운데 한 줄이 `PAGE * 2` 바이트 → 그 줄을 담은 페이지 항목의 `clipped > 0`, 무한루프 없음(테스트 timeout 기본).
  - `'unfinished last line is left for the live tail'` — 마지막 줄 `\n` 없음 → 그 줄 제외, `end` = 그 줄 시작.
  - `'multibyte text across a page boundary'` — 한글 텍스트 줄들 → 모든 `text` 에 `�` 없음.
- [ ] **Step 2: 실패 확인** — `cd server && npx vitest run __tests__/lan/transcript.test.ts`.
- [ ] **Step 3: `readPage` 구현.**
- [ ] **Step 4: 통과 확인.**
- [ ] **Step 5: 커밋** — `feat(transcript): read a transcript by byte pages`

---

### Task 3: `Scanner.transcriptOf`

**Files:**

- Modify: `server/src/lan/scanner.ts`
- Test: `server/__tests__/lan/scanner.test.ts`

**Interfaces:**

- Produces:
  ```ts
  export interface TranscriptSource {
    file: string; provider: Provider; kind: ViewKind; num: number;
    title: string; folder: string;   // LOCAL ONLY
  }
  /** id = AgentView.id of this PC (main / `${p}/sub/${n}` / `${s}/sh/${n}`). Shell → the session that started it. */
  transcriptOf(id: string): TranscriptSource | undefined;
  ```
  `ViewKind` 는 `core/src/lan.ts` 의 것 (`main|subagent|shell`).

규칙: id 가 `/sh/<x>` 로 끝나면 그 앞부분을 세션 id 로 쓰고 `kind = 'shell'`. `this.files` 에서 `t.s.id === 세션id` 인 항목 → `file` = Map 키. `num`: main 은 자기 `s.num`, 자식은 부모 main 의 `num`. `title`/`folder`: main 은 `this.info(id)`; 서브에이전트는 `title = s.local.prompt`, `folder = folderOf(s.local.cwd)` (없으면 부모 info). 못 찾으면 `undefined`.

- [ ] **Step 1: 실패 테스트** (기존 scanner.test 의 tmp 루트 패턴):
  - `'transcriptOf: main session → its file, title and folder'`.
  - `'transcriptOf: subagent → its own file, parent num'`.
  - `'transcriptOf: shell id → the session that started it'` (Codex 셸 fixture 또는 Claude 백그라운드 Bash 셸 — 기존 셸 테스트 fixture 재사용, `kind === 'shell'`, `file` = 부모 파일).
  - `'transcriptOf: unknown id → undefined'` — `'some-peer-session'`.
  - 기존 LOCAL ONLY 패킷 테스트에 단언 추가: `JSON.stringify(scanner.views(true))` 에 transcript 파일 경로(`proj` 디렉토리 문자열)가 없다.
- [ ] **Step 2: 실패 확인** — `cd server && npx vitest run __tests__/lan/scanner.test.ts`.
- [ ] **Step 3: 구현.**
- [ ] **Step 4: 통과 확인.**
- [ ] **Step 5: 커밋** — `feat(scanner): resolve this PC's agent id to its transcript file`

---

### Task 4: 프로토콜 + `TranscriptService` + 서버 배선

**Files:**

- Modify: `core/asyncapi.yaml` (→ `npm run asyncapi:generate`, `core/src/messages.ts`)
- Modify: `server/src/lan/transcript.ts`, `server/src/constants.ts`, `server/src/clientMessageHandler.ts`, `server/src/httpServer.ts`, `server/src/server.ts`, `server/src/cli.ts`
- Test: `server/__tests__/lan/transcript.test.ts`, `server/__tests__/clientMessageHandler.test.ts`

**Interfaces:**

- Consumes: `readPage`, `parseLines`, `Scanner.transcriptOf`.
- Produces (protocol; 필드 이름 그대로):
  - client → server: `openTranscript {id: string}`, `loadTranscriptBefore {id: string, before: integer}`, `closeTranscript {}`.
  - server → 요청 소켓: `transcriptLoaded {id, info: TranscriptInfo, entries: TranscriptEntry[], start: integer, more: boolean}`, `transcriptEarlier {id, entries, start, more}`, `transcriptAppend {id, entries}`, `transcriptError {id, reason: 'notFound'|'unreadable'|'ended'}`.
  - 스키마 `TranscriptEntry` = Task 1 의 필드 (`kind` enum, `text` 필수, 나머지 optional), `TranscriptInfo {kind: ViewKind, provider, num, title, folder}`.
  ```ts
  export class TranscriptService {
    constructor(
      source: { transcriptOf(id: string): TranscriptSource | undefined },
      pollMs?: number,
    );
    open(client: object, id: string, send: WsSend): Promise<void>; // 기존 구독 대체
    before(client: object, id: string, before: number, send: WsSend): Promise<void>;
    close(client: object): void;
    stop(): void; // 모든 타이머 정리
  }
  ```
  - `ClientMessageContext` 에 `transcripts?: TranscriptService` 와 `client?: object` (소켓 자체) 추가. `HttpServerOptions`·`PixelAgentsServer.start` 옵션에 `transcripts?: TranscriptService`.
- 상수: `TRANSCRIPT_POLL_MS = 1000`.

동작:

- `open`: `transcriptOf(id)` 없으면 `transcriptError notFound` (파일 안 건드림). 있으면 `stat` → `readPage(file, provider, size)` → `transcriptLoaded` (info 는 source 에서 file 빼고). 구독 = `{id, file, provider, offset: page.end, buf: '', decoder}` + `setInterval(TRANSCRIPT_POLL_MS)`; 이전 구독 타이머는 clear.
- 폴: `stat` ENOENT → `transcriptError ended` 한 번 후 구독 제거. `size < offset` → `readPage(size)` 로 `transcriptLoaded` 다시, offset 리셋. `size > offset` → `[offset, size)` 읽어 `StringDecoder` + 줄 버퍼(scanner `readNew` 와 같은 방식), 완성 줄 `parseLines` → 비어있지 않으면 `transcriptAppend`. 폴 중첩 방지 플래그.
- `before`: 구독의 id 와 같을 때만 `readPage(file, provider, before)` → `transcriptEarlier`. `before` 는 정수 ≥ 0, 아니면 무시.
- `clientMessageHandler`: 세 case 추가 → `ctx.transcripts?.open(ctx.client ?? send, msg.id, send)` 등 (`id` 문자열 아닌 경우 무시). 게이트는 건드리지 않음 → 보기 전용은 자동 거부.
- `httpServer`: `handleClientMessage(..., { ..., transcripts: options.transcripts, client: socket })`; `socket.on('close')` 에서 `options.transcripts?.close(socket)`.
- `cli.ts`: `const transcripts = new TranscriptService(scanner)`; server.start 에 전달; 종료 경로(`scanner.stop()` 옆)에서 `transcripts.stop()`.

- [ ] **Step 1: asyncapi 메시지·스키마 추가 → `npm run asyncapi:validate && npm run asyncapi:generate`** — 성공, `messages.ts` 에 `OpenTranscript`, `TranscriptLoaded` 등 생성.
- [ ] **Step 2: 실패 테스트** — `describe('TranscriptService')` (가짜 source 가 tmp 파일을 가리킴, `pollMs` 짧게 20 ms, `vi.waitFor`):
  - `'open sends the tail page with info'` → 첫 메시지 `type === 'transcriptLoaded'`, `info.title`, `entries.length`.
  - `'unknown id → notFound, nothing read'` → source `undefined` → `transcriptError {reason:'notFound'}`.
  - `'appended lines arrive as transcriptAppend'` — open 후 파일에 user 줄 append → `transcriptAppend.entries[0].text`.
  - `'a line split across polls (multibyte) arrives once, whole'` — 한글 줄 앞 절반 바이트 append, 폴 1회 대기, 나머지 append → 정확히 1 항목, `�` 없음.
  - `'truncated file → transcriptLoaded again'` — 파일을 더 짧게 다시 씀 → 두 번째 `transcriptLoaded`.
  - `'deleted file → ended once, polling stops'` — `transcriptError ended` 1회, 이후 append 해도 메시지 없음.
  - `'close(client) stops polling; a second open replaces the first'` — close 후 append → 메시지 없음; 다른 id open → 이전 id 의 append 안 옴.
  - `'before returns the earlier page'` — 큰 파일, `before(client, id, loaded.start)` → `transcriptEarlier.entries` 비어있지 않음.
  - `clientMessageHandler.test.ts`: `'read-only ctx cannot open a transcript'` — `privileged:false` + `openTranscript` → `transcripts.open` 호출 안 됨 (vi.fn 가짜 서비스).
- [ ] **Step 3: 실패 확인** — `cd server && npx vitest run __tests__/lan/transcript.test.ts __tests__/clientMessageHandler.test.ts`.
- [ ] **Step 4: `TranscriptService` + 배선 구현.**
- [ ] **Step 5: 통과 확인 + `npm run check-types && npm run lint`.**
- [ ] **Step 6: 커밋** — `feat(transcript): live transcript subscription over the UI socket` (`core/asyncapi.yaml`, `core/src/messages.ts` 포함)

---

### Task 5: 웹뷰 상태 + 훅 + "내 것" 판정

**Files:**

- Create: `webview-ui/src/lan/transcript.ts`, `webview-ui/src/lan/useTranscript.ts`
- Modify: `webview-ui/src/lan/lanAgents.ts`, `webview-ui/src/constants.ts`
- Test: `webview-ui/test/transcript.test.ts`, `webview-ui/test/lanAgents.test.ts`

**Interfaces:**

- Consumes: 생성된 `TranscriptLoaded`/`TranscriptAppend`/`TranscriptEarlier`/`TranscriptError`/`TranscriptEntry`/`TranscriptInfo` 타입 (`core/src/messages.ts`).
- Produces:
  ```ts
  // webview-ui/src/lan/transcript.ts
  export interface TranscriptState {
    id: string; info?: TranscriptInfo; entries: TranscriptEntry[];
    start: number; more: boolean; loading: boolean; error?: 'notFound' | 'unreadable' | 'ended';
  }
  export function openState(id: string): TranscriptState;                       // loading: true
  export function reduceTranscript(s: TranscriptState | null, msg: Record<string, unknown>): TranscriptState | null;
  //   다른 id 의 메시지는 무시(s 그대로). loaded → 교체, earlier → 앞에 붙이고 start/more 갱신,
  //   append → 뒤에 붙임, error → error 설정(ended 는 entries 유지).
  export function isAtBottom(scrollTop: number, clientHeight: number, scrollHeight: number): boolean;
  //   scrollHeight - scrollTop - clientHeight <= TRANSCRIPT_FOLLOW_SLACK_PX
  // webview-ui/src/lan/useTranscript.ts
  export function useTranscript(): {
    state: TranscriptState | null; open(id: string): void; close(): void; loadEarlier(): void;
  };
  //   open → transport.send({type:'openTranscript', id}); close → closeTranscript + state null;
  //   loadEarlier → loading 아닐 때 & more 일 때만 loadTranscriptBefore {id, before: state.start}.
  //   transport 재연결(officeAccess 재수신) 시 열려 있으면 openTranscript 다시 보냄.
  // lanAgents.ts (LanAgents)
  selfPeerId(): string | undefined;                // people 중 self 의 peerId
  isMine(a: OfficeAgent): boolean;                 // a.peer.id === selfPeerId()
  loungeAgentsOf(peerId: string): OfficeAgent[];   // room 'lounge' && 그 PC 아바타 표시 중 (= 접힌 것), roomAgents 와 같은 순서(main 뒤 자식)
  ```
- 상수: `TRANSCRIPT_FOLLOW_SLACK_PX = 24`.

- [ ] **Step 1: 실패 테스트** — `transcript.test.ts`: `'loaded replaces, earlier prepends, append appends'`, `'messages for another id are ignored'`, `'ended keeps entries and sets error'`, `'isAtBottom within slack'` (`isAtBottom(76,100,200)===true`, `isAtBottom(50,100,200)===false`). `lanAgents.test.ts`: `'isMine only for the self person'`, `'loungeAgentsOf lists folded lounge agents of that PC only'` (다른 방 에이전트·남의 PC 제외).
- [ ] **Step 2: 실패 확인** — `cd webview-ui && npx vitest run test/transcript.test.ts test/lanAgents.test.ts`.
- [ ] **Step 3: 구현.**
- [ ] **Step 4: 통과 확인.**
- [ ] **Step 5: 커밋** — `feat(webview): transcript state and my-agent helpers`

---

### Task 6: `TranscriptPanel` + 캐릭터 클릭

**Files:**

- Create: `webview-ui/src/lan/TranscriptPanel.tsx`
- Modify: `webview-ui/src/App.tsx`, `webview-ui/src/constants.ts`, `webview-ui/src/i18n.ts`, `webview-ui/src/index.css`, `webview-ui/src/lan/RoomPlates.tsx` (`badgeColors`/`tagBadge` 등 헤더용 재사용 import 만)
- Test: `webview-ui/test/transcript.test.ts` (순수 부분만)

**Interfaces:**

- Consumes: `useTranscript`, `isAtBottom`, `LanAgents.isMine`, `OfficeCanvas` 의 기존 `onClick(agentId: number)`.
- Produces: `export function TranscriptPanel(props: { state: TranscriptState; onClose(): void; onLoadEarlier(): void }): JSX.Element`; 순수 `export function foldText(text: string, lines: number): { shown: string; hidden: number }` (`transcript.ts` 에 추가).
- 상수: `TRANSCRIPT_PANEL_WIDTH_PX = 480`, `TRANSCRIPT_FOLD_LINES = 12`, `TRANSCRIPT_PANEL_TOP_PX` = `TAG_TOGGLE_TOP_PX` + 토글 높이 + 8 (토글 아래), `TRANSCRIPT_PANEL_BOTTOM_PX` = 좌하단 툴바 높이 + 8 (툴바 위). 좁은 화면: `width: min(WIDTH, 100vw - 16px)`.
- i18n 키: `transcript.close`, `transcript.loadingEarlier`, `transcript.start`(세션 시작), `transcript.ended`(세션이 끝났습니다), `transcript.notFound`, `transcript.unreadable`, `transcript.expand`({n}줄 더 보기), `transcript.collapse`, `transcript.newBelow`(새 내용 ↓), `transcript.clipped`({kb} KB 생략), `transcript.kind.user|assistant|thinking|tool|result|meta`, `transcript.image` 는 서버 `[image]` 그대로.

화면 규칙:

- 헤더: MAIN/SUB/SHELL 배지(`badgeColors(kind)`), `#num`, provider 배지(`LAN_PROVIDER_COLORS`), title(truncate), folder(muted), [×].
- 목록: `user` = 강조 배경 블록, `assistant` = 본문, `thinking`/`meta` = muted 작은 글씨 + 기본 접힘, `tool` = 도구명 칩 + `<pre>` 고정폭, `result` = `<pre>` (error 면 `--transcript-error-border` 2px 테두리). `whiteSpace: 'pre-wrap'`, `wordBreak: 'break-word'`. `TRANSCRIPT_FOLD_LINES` 초과 `tool`/`result` 는 `foldText` 로 접고 [펼치기]. `clipped` 면 끝에 `transcript.clipped`.
- 스크롤: 처음 로드 → 맨 아래. append 때 직전 `isAtBottom` 이면 맨 아래로, 아니면 위치 유지 + `transcript.newBelow` 버튼(누르면 맨 아래). 맨 위 도달 & `more` → `onLoadEarlier`, 붙인 뒤 보던 항목이 제자리(이전 `scrollHeight` 차이만큼 `scrollTop` 보정). `!more` 면 맨 위에 `transcript.start`. `error === 'ended'` 면 맨 아래 `transcript.ended`.
- 패널 위 wheel/키 이벤트는 캔버스로 안 감 (`onWheel` stopPropagation — RoomTip 과 같음).
- App 배선: `const tr = useTranscript()`; `<OfficeCanvas onClick={(id) => { const a = lan.agentFor(id); if (a && lan.isMine(a)) tr.open(a.id); }} …/>` (데모/투어 에이전트는 `isMine` false 여야 함 — 데모 peer id ≠ self). 같은 에이전트가 열려 있는데 다시 클릭(선택 해제됨) → `tr.close()`. 패널 열림 중 Esc(포커스가 input/textarea 아님) → close. `editor.isEditMode` 또는 투어 시작 → close. 렌더: `{tr.state && !editor.isEditMode && <TranscriptPanel …/>}`.

- [ ] **Step 1: 실패 테스트** — `'foldText keeps the first N lines and counts the rest'` (`foldText('a\nb\nc', 2)` → `{shown:'a\nb', hidden:1}`; 짧으면 `hidden:0`).
- [ ] **Step 2: 실패 확인** — `cd webview-ui && npx vitest run test/transcript.test.ts`.
- [ ] **Step 3: `foldText`, `TranscriptPanel`, 상수, i18n(ko/en), CSS 변수(다크/라이트 `--transcript-*`), App 배선 구현.**
- [ ] **Step 4: 통과 + `npm run check-types && npm run lint` (no-inline-colors, ui-font 포함).**
- [ ] **Step 5: 실제 확인** — `npm run build && node dist/cli.js --port 47801`, 브라우저에서 내 에이전트 클릭 → 패널, 이 세션이 일하는 동안 실시간으로 붙는지, 위로 스크롤 시 이전 로드, 라이트 테마. Playwright 스크린샷 1장 (`.superpowers/transcript/` 로컬, 커밋 안 함).
- [ ] **Step 6: 커밋** — `feat(webview): transcript panel for my agents`

---

### Task 7: 내 아바타 클릭 → 대기실 에이전트 목록

**Files:**

- Create: `webview-ui/src/lan/AvatarAgentList.tsx`
- Modify: `webview-ui/src/office/components/OfficeCanvas.tsx`, `webview-ui/src/lan/RoomPlates.tsx` (`AgentCard` export), `webview-ui/src/App.tsx`, `webview-ui/src/lan/transcript.ts` (배치 함수), `webview-ui/src/constants.ts`
- Test: `webview-ui/test/transcript.test.ts`

**Interfaces:**

- Consumes: `LanAgents.loungeAgentsOf`, `selfPeerId`, `lan.avatars()`, `overlayProjection` (ChatLayer 와 같은 머리 위치 계산), `AgentCard`.
- Produces:
  - `OfficeCanvas` prop `onAvatarClick?: (peerId: string, selected: boolean) => void` — `performTap` 의 아바타 분기에서 `selectedPeer` 갱신 직후 호출 (`selected = !again`). 기존 선택 동작은 그대로.
  - `export function listSide(avatarScreenX: number, listWidth: number, viewportWidth: number, gap: number): 'right' | 'left'` — 오른쪽에 `x + gap + listWidth <= viewportWidth` 면 right.
  - `export function AvatarAgentList(props: { officeState; lan; peerId: string; containerRef; zoom; panRef; onPick(agentId: string): void; onClose(): void }): JSX.Element | null` — `onFrame` 으로 아바타 따라 위치 갱신 (RoomTip 과 같은 방식).
- 상수: `AVATAR_LIST_WIDTH_PX = 260`, `AVATAR_LIST_GAP_PX = 12`.

동작: App 이 `listPeer` state 를 가진다. `onAvatarClick(peerId, selected)` → `peerId === lan.selfPeerId() && selected && lan.loungeAgentsOf(peerId).length > 0` 이면 `setListPeer(peerId)`, 아니면 `null`. 빈 바닥 클릭(= `selectedPeer` 해제)·Esc·편집 모드·투어 → `null`. 렌더 중 `loungeAgentsOf` 가 비면 null 반환(목록 닫힘). 카드(`AgentCard`) 클릭 → `tr.open(a.id)` + 목록 닫기. 카드는 `button` 으로 감싸 키보드 포커스 가능 (`aria-label` = `tagText`).

- [ ] **Step 1: 실패 테스트** — `'listSide: right when it fits, else left'` (`listSide(100,260,1000,12)==='right'`, `listSide(900,260,1000,12)==='left'`).
- [ ] **Step 2: 실패 확인.**
- [ ] **Step 3: 구현.**
- [ ] **Step 4: 통과 + check-types + lint.**
- [ ] **Step 5: 실제 확인** — 턴이 끝난 내 에이전트(대기실) 상태에서 내 아바타 클릭 → 옆 목록 → 카드 클릭 → 패널; 남의 아바타 클릭 → 목록 없음; 아바타 화살표로 이동 시 목록이 따라감.
- [ ] **Step 6: 커밋** — `feat(webview): my avatar lists my lounge agents to open their transcript`

---

### Task 8: 문서 + 전체 검증

**Files:**

- Modify: `CLAUDE.md` (서버 `lan/transcript.ts` 한 줄, Office UI essentials 에 패널·아바타 목록·LOCAL ONLY 한 단락, Handshake 아래 transcript 메시지가 요청 소켓 전용임)

- [ ] **Step 1: CLAUDE.md 갱신.**
- [ ] **Step 2: 전체 검증** — `npm run build && npm test` → 전부 PASS; `npm run asyncapi:validate`; `git status` 깨끗(생성 파일 drift 없음).
- [ ] **Step 3: 커밋** — `docs: transcript panel in CLAUDE.md`
