# 접속자 패널 3영역 (공개 / 팀 / 개인용) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 우측 접속자 패널을 공개 / 팀 / 개인용 세 영역으로 나눠, 어느 모드의 PC 에서도 LAN 의 지금 접속자(얼굴 + 이름)를 보여 주고, 개인용 모드 PC 도 이름 카드로 보이게 한다. 팀은 한 번에 하나만.

**Architecture:** PeerNet 에 v2 타입 두 개를 더한다 — 공개 오피스에 없는 PC 가 보내는 평문 `watch {id, pk}` 와 개인용 PC 가 페어 키로 봉인해 보내는 `card` (PeerInfo 만). 공개 PC 는 기존 `pub` presence 를 watcher 에게도 보내고, watcher 는 거기서 사람 정보만 별도 맵에 둔다. `PeerNet.directory()` → `LanService.directory()` → 새 서버 메시지 `peopleDirectory` 를 1 s 스냅샷과 함께 푸시, 웹뷰는 순수 모델 `directoryModel.ts` 로 영역을 만들어 `PeoplePanel` 에 그린다. 상단 탭 인원 수(`online`/`liveCount`)는 통째로 제거.

**Tech Stack:** TypeScript, Node stdlib (`dgram`, `crypto`, `zlib`), Fastify WS, React 19, Vitest, AsyncAPI 3 → `core/src/messages.ts` 생성.

**Spec:** `docs/superpowers/specs/2026-11-03-people-directory-design.md` (특히 "검토에서 정한 것", 목표 6)

## Global Constraints

- UDP 47800 하나, 모든 데이터그램 ≤ `MAX_DATAGRAM_BYTES` (1200), 새 포트·새 런타임 의존성 없음.
- 평문에 실리는 것은 hello 수준(`id`, `pk`)뿐: `watch` 에 모드(개인용/팀)·팀 태그·팀 이름 없음. `card` 평문 = `{seq, peer}` 만 (에이전트·채팅·아바타·레이아웃·오피스 없음).
- watcher 는 공개 PC 의 `hellos`·`peers(PUBLIC_VIEW)`·`LanService.people/office`·`officeSnapshot`·알림에 절대 들어가지 않는다. 다른 영역 사람은 목록에만.
- "공개 오피스에 있음" = `!offline && offices().length === 0`; "팀 presence 송신" = `!offline && offices().length > 0`; 개인용 + 팀 가입 = 개인용이 이긴다 (card 송신, 팀 presence 없음, 팀 presence 는 계속 복호화).
- card 송신자 pk 는 watch 에서만. watchers: 최대 `MAX_HELLO_PEERS`, `PEER_TTL_MS` 만료, 가득 차면 새 id 무시, 핀은 hello 와 같은 `pins`.
- 모든 디렉터리 항목 `PEER_TTL_MS` 만료. 공개·개인용 사이 같은 `peerId` 는 가장 최근에 들은 쪽만.
- `MAX_OFFICES = 1`. 프로필 로드 시 여러 팀 → `activeView` 팀, 아니면 첫 팀만 남기고 나머지 비밀 삭제 + 로그 한 줄.
- 피어 데이터는 표시만 (실행·쓰기 없음). `parseWire` 엄격 파싱 유지(모르는 `t` → null).
- 프로토콜: `core/asyncapi.yaml` 수정 → `npm run asyncapi:generate`, `messages.ts` 함께 커밋, 새 스키마 전부 `additionalProperties: false`.
- 상수 `server/src/constants.ts` / `webview-ui/src/constants.ts`, 색 literal 은 `webview-ui/src/constants.ts` 만, 문구 `webview-ui/src/i18n.ts` ko/en. 픽셀 스타일(`borderRadius: 0`, `2px solid`, `pixel-panel`).
- `server/`·`core/` 상대 import 는 `.js`; `import type`; `enum` 금지. 로그 `[Pixel Office]`. husky 훅 통과 (`--no-verify` 금지).

## Review Focus

1. **모드 전환 직후** (개인용 → 공개, 팀 → 공개): 같은 PC 가 공개·개인용 두 영역에 동시에 나오면 안 된다 — 가장 최근에 들은 쪽 하나. → Task 5 테스트.
2. **한쪽만 수동 피어** (브로드캐스트가 한 방향만 닿음): watch/hello 를 받은 PC 가 1:1 로 자기 발견 신호(hello 또는 watch)를 되돌려 서로 보인다. → Task 4 테스트.
3. **에이전트가 많은 공개 PC** (presence 가 분할 parts): watcher 도 조립해서 그 사람을 본다. → Task 4 테스트.
4. **card 위조**: watch 없이 온 card, `to` 가 내가 아닌 card, 다른 키로 봉인한 card, 키가 바뀐 watch, 재전송된 seq — 전부 무시. → Task 5 테스트.
5. **업데이트 전 여러 팀 프로필 + 버려진 팀의 채팅**: 남는 팀이 `activeView` 팀(없으면 첫 팀), 버려진 팀 채널의 `chat` 은 지워지고 `activeView` 가 유효. → Task 1 테스트.

---

## File Structure

| 파일                                                                                           | 책임                                                                                                              |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `server/src/lan/profile.ts`                                                                    | 팀 하나 마이그레이션 (`parseOffices`)                                                                             |
| `server/src/lan/office.ts`                                                                     | create/join = 팀 교체; `online()` 제거; `directory()` 추가                                                        |
| `server/src/constants.ts`                                                                      | `MAX_OFFICES = 1`                                                                                                 |
| `core/src/lan.ts`                                                                              | `parsePeerInfo` 추출 (card 검증 재사용)                                                                           |
| `server/src/lan/crypto.ts`                                                                     | `Wire` 에 `watch`/`card`, `cardAad`, `parseWire`                                                                  |
| `server/src/lan/peerNet.ts`                                                                    | watch/card 송수신, watcher 에게 pub, `directory()`; `liveCount` 제거                                              |
| `core/asyncapi.yaml` (+ `core/src/messages.ts`)                                                | `peopleDirectory`, `DirectoryPersonMessage`, `DirectoryTeamMessage`; `online` 제거; `OfficeErrorReason.full` 제거 |
| `server/src/clientMessageHandler.ts`, `server/src/httpServer.ts`                               | `directoryMessage`, 핸드셰이크 + 1 s 푸시                                                                         |
| `webview-ui/src/lan/directoryModel.ts` (new)                                                   | 영역 순수 모델                                                                                                    |
| `webview-ui/src/lan/PeoplePanel.tsx`, `App.tsx`, `hooks/useExtensionMessages.ts`               | 영역 렌더, 상태 배선                                                                                              |
| `webview-ui/src/lan/OfficeSwitcher.tsx`, `lan/OfficeSettings.tsx`, `lan/offices.ts`, `i18n.ts` | 탭 인원 제거, 팀 교체 확인 창, 문구                                                                               |
| `CLAUDE.md`, `README.md`, `docs/설치-안내.md`, `docs/INSTALL.en.md`                            | 문서                                                                                                              |

---

### Task 1: 팀은 한 번에 하나만

**Files:**

- Modify: `server/src/constants.ts` (`MAX_OFFICES`), `server/src/lan/profile.ts:127-137,248-252`, `server/src/lan/office.ts` (`createOffice`, `joinOffice`), `core/asyncapi.yaml` (`OfficeErrorReason`, `CreateOffice`/`JoinOffice` 설명), `core/src/messages.ts` (생성), `webview-ui/src/lan/offices.ts`, `webview-ui/src/lan/OfficeSettings.tsx`, `webview-ui/src/i18n.ts`
- Test: `server/__tests__/lan/profile.test.ts`, `server/__tests__/lan/office.test.ts`, `server/__tests__/lan/personal.test.ts`, `server/__tests__/lan/chat.test.ts`, `webview-ui/test/offices.test.ts`

**Interfaces:**

- Produces:
  - `MAX_OFFICES = 1` (`server/src/constants.ts`).
  - `function parseOffices(x: unknown, keepTag: unknown): TeamOffice[]` (profile.ts, 내부) — 유효·중복 제거한 전부 중 `tag === keepTag` 인 것, 없으면 첫 것, 하나만. 버린 게 있으면 `console.log('[Pixel Office] One team office at a time: left N other team office(s).')` (이름·태그는 로그에 안 씀).
  - `LanService.createOffice(name)` / `joinOffice(code, name?)` — 이미 팀에 있으면 **한 번의 `update({offices: [office], activeView: office.tag})`** 로 교체 (팀 2개 상태 없음). 같은 팀 코드로 join → 지금처럼 `'alreadyJoined'` + 전환, 아무것도 안 나감. `'full'` 은 더 이상 반환하지 않는다.
  - `OfficeErrorReason = 'invalidCode' | 'alreadyJoined' | 'nameInvalid'` (asyncapi enum 에서 `full` 제거).
  - `export function switchConfirmName(state: Omit<OfficesState, 'type'>): string | null` (`webview-ui/src/lan/offices.ts`) — 가입한 팀이 있으면 그 이름(`''` 가능), 없으면 `null`.
  - i18n `office.switchConfirm`: ko `'지금 팀({name})에서 나가고 새 팀으로 옮길까요?'`, en `'Leave your current team ({name}) and move to the new one?'`. `office.error.full` 삭제.

- [ ] **Step 1: 실패 테스트 작성**
  - profile.test `'keeps only the viewed team of several, else the first; logs once'` — 세 팀 + `activeView` = 둘째 태그 → `p.offices` = `[둘째]`, `activeView` = 둘째 태그, 파일에 다른 두 비밀 문자열 없음, `console.log` 1회 (`'One team office at a time'` 포함). `activeView: PUBLIC_VIEW` 인 세 팀 → `[첫째]`, `activeView` = 첫째 태그.
  - profile.test `'a chat said in a dropped team is dropped with it'` — 두 팀, `chat.view` = 둘째 태그, `activeView` = 첫째 → `p.chat` undefined.
  - 기존 `'drops broken offices, derives tags, fixes activeView…'` 는 그대로 통과해야 함.
  - office.test `'rejects bad names and a full office list'` → `'create or join while in a team replaces the team in one save'` 로 교체: `createOffice('a')` 후 `createOffice('b')` → `offices.map(o=>o.name)` = `['b']`, `activeView` = b 태그, `loadProfile(dir).offices.map(o=>o.name)` = `['b']`, 교체 중 `saveProfile` 호출 1회 (`vi.spyOn(profileModule, 'saveProfile')` 대신 `fs.writeFileSync` spy 로 `profile.json.tmp` 쓰기 1회); `joinOffice(codeOfA)` → `null`, offices = `[a 태그]`; 같은 코드 다시 → `'alreadyJoined'`, offices 그대로.
  - personal.test `'keeps team memberships inactive…'`: 둘째 `createOffice('둘')` 부분을 "개인용에서 그 팀을 나가도 개인용 유지" 로 바꿈 (`lan.leaveOffice(team.tag)` → `lan.personal === true`, offices `[]`). `'every office switch resends the layout…'`: `createOffice('b')` 대신 `setActiveView(PERSONAL_VIEW)` 로 두 뷰 사이 전환.
  - chat.test `'a team chat goes only on its team channel…'`: 둘째 팀 대신 `setActiveView(PERSONAL_VIEW)` 로 전환 후 돌아와도 유지, `createOffice('팀2')` (교체) 후 `lan.profile.chat` 없음.
  - offices.test `'switchConfirmName: the current team or null'` — `{offices: [], activeView: 'public'}` → `null`; `{offices: [{tag:'t', name:'우리'}], …}` → `'우리'`.
- [ ] **Step 2: 실패 확인** — `cd server && npx vitest run __tests__/lan/profile.test.ts __tests__/lan/office.test.ts __tests__/lan/personal.test.ts __tests__/lan/chat.test.ts` → 새 테스트 FAIL; `cd webview-ui && npx vitest run test/offices.test.ts` → FAIL (`switchConfirmName` 없음).
- [ ] **Step 3: 서버 구현** — 위 시그니처. `loadProfile` 은 `parseOffices(raw.offices, raw.activeView)`. `office.ts` 에서 `MAX_OFFICES` import 제거. asyncapi: enum 수정, CreateOffice/JoinOffice 설명에 "already in a team: that team is left in the same save" 추가 → `npm run asyncapi:generate`.
- [ ] **Step 4: 웹뷰 구현** — `OfficeSettings` 의 `create`/`join`: `const cur = switchConfirmName(state); if (cur !== null && !window.confirm(t('office.switchConfirm', { name: cur || t('office.unnamed') }))) return;` 를 `transport.send` 앞에. 취소 = 아무것도 안 보냄.
- [ ] **Step 5: 통과 확인** — Step 2 명령 PASS; `npm run check-types` 오류 0 (`'full'` 참조 남아 있으면 여기서 잡힘).
- [ ] **Step 6: 커밋** — `feat: one team office at a time (switch on create/join, migrate old profiles)`

---

### Task 2: 탭 인원 수 제거 (`online` / `liveCount`)

**Files:**

- Modify: `server/src/lan/peerNet.ts` (`liveCount` 삭제), `server/src/lan/office.ts` (`online()`, `net.liveCount?` 삭제), `server/src/clientMessageHandler.ts:313-321` (`online` 필드), `core/asyncapi.yaml` (`OfficeSnapshot.online` 삭제, required 에서도), `core/src/messages.ts` (생성), `webview-ui/src/lan/OfficeSwitcher.tsx`, `webview-ui/src/hooks/useExtensionMessages.ts`, `webview-ui/src/App.tsx`, `webview-ui/src/i18n.ts` (`office.online` 삭제)
- Test: `server/__tests__/lan/peerNet.test.ts`, `server/__tests__/lan/chat.test.ts`, `webview-ui/test/i18n.test.ts`

**Interfaces:**

- Produces: `OfficeSwitcher({ state }: { state: Omit<OfficesState, 'type'> })` (prop `online` 없음). `snapshotMessage(lan)` = `{type, agents, people, selfPeerId}`. `UseExtensionMessagesResult` 에서 `online` 제거.

- [ ] **Step 1: 테스트 정리** — chat.test `'online: me + live peers…'` 삭제. peerNet.test `'PeerNet personal mode: listen-only counts'` describe 삭제 (Task 4/5 가 대체). i18n.test 에 `'tab counts are gone'` — ko/en 사전 모두 `'office.online'` 키 없음.
- [ ] **Step 2: 실패 확인** — `cd webview-ui && npx vitest run test/i18n.test.ts` → FAIL.
- [ ] **Step 3: 구현** — 위 파일에서 제거, `npm run asyncapi:generate`.
- [ ] **Step 4: 확인** — `npm run check-types && npm run lint` 오류 0; `npm run test:server && npm run test:webview` PASS (server CLI 테스트는 `npm run build` 후).
- [ ] **Step 5: 커밋** — `refactor: drop the people counts on the office tabs`

---

### Task 3: 와이어 타입 `watch` / `card` + `parsePeerInfo`

**Files:**

- Modify: `server/src/lan/crypto.ts` (`Wire`, `parseWire`, `cardAad`), `core/src/lan.ts:414-460` (`parsePeerInfo` 추출)
- Test: `server/__tests__/lan/crypto.test.ts`, `server/__tests__/lan/packet.test.ts`

**Interfaces:**

- Produces:

  ```ts
  // crypto.ts
  export type Wire =
    | { v: 2; t: 'hello'; id: string; pk: string }
    | { v: 2; t: 'watch'; id: string; pk: string }
    | { v: 2; t: 'pub'; from: string; to: string; n: string; c: string }
    | { v: 2; t: 'card'; from: string; to: string; n: string; c: string }
    | { v: 2; t: 'team'; tag: string; n: string; c: string };
  export const cardAad = (from: string, to: string): string => `card|${from}|${to}`;
  // core/src/lan.ts
  /** Untrusted peer info (a presence's `peer`, a card's `peer`) → fresh PeerInfo, else null. */
  export function parsePeerInfo(raw: unknown): PeerInfo | null;
  ```

  `parseWire`: `watch` = hello 와 같은 검사, `card` = pub 과 같은 검사. `parsePeerInfo` = 지금 `parsePeerPacket` 안의 peer 검증 그대로(0.3.x 계정 대체, pet/tagColors/nickSince 포함); `parsePeerPacket` 은 그것을 호출 (동작 불변).

- [ ] **Step 1: 실패 테스트** — crypto.test `describe('parseWire')`:
  - `'watch and card: fresh objects, same checks as hello and pub'` — 유효 watch/card → 필드만 가진 새 객체(`extra` 키 없음); 짧은 pk 의 watch, 잘못된 id 의 card, 짧은 nonce 의 card → null.
  - `'peers before watch/card drop them: an unknown t is null'` — 같은 watch/card 텍스트에서 `t` 만 `'x'` 로 바꾸면 `null` (1.0.24 의 `default: return null` 경로와 같음), 그리고 `cardAad('a','b') !== pubAad('a','b')`.
  - packet.test `'parsePeerInfo: same rules as a presence peer'` — `parsePeerInfo({id:'p', nickname:'n', palette:0, hueShift:0})` (account 없음) → `{account:'n', nickname:''}`; `pet:'bogus'` 는 빠짐; `views` 같은 다른 키는 결과에 없음; `palette: 9` → null.
- [ ] **Step 2: 실패 확인** — `cd server && npx vitest run __tests__/lan/crypto.test.ts __tests__/lan/packet.test.ts` → FAIL.
- [ ] **Step 3: 구현.**
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS (기존 packet 테스트 포함).
- [ ] **Step 5: 커밋** — `feat(lan): watch and card wire types`

---

### Task 4: PeerNet — watch 송신, watcher 에게 pub, 공개 영역 디렉터리

**Files:**

- Modify: `server/src/lan/peerNet.ts`
- Test: `server/__tests__/lan/peerNet.test.ts`

**Interfaces:**

- Consumes: `Wire` `watch` (Task 3).
- Produces:
  ```ts
  export interface NetDirectory {
    /** Public-office people heard: in the public office = live peers(PUBLIC_VIEW); otherwise
     *  the person of every live pub sent to this watcher. */
    public: PeerInfo[];
    /** Joined tag → live members heard on it (also while personal). */
    teams: Record<string, PeerInfo[]>;
    /** Personal-mode PCs whose card arrived (Task 5; [] until then). */
    personal: PeerInfo[];
  }
  PeerNet.directory(): NetDirectory;
  ```
  내부 (이름은 이대로): `private inPublic(): boolean` (`!offline && offices().length === 0`), `private discovery(): Wire` (inPublic → hello, 아니면 `{v:2, t:'watch', id, pk}`), `private readonly watchers = new Map<string, { pk: string; key: Buffer | null; address: string; port: number; at: number; replied: number }>()`, `private readonly heardPublic = new Map<string, { peer: PeerInfo; at: number }>()`, `private fresh(key: string, seq: number): boolean` (lastSeq 검사·기록; `accept` 도 이것을 쓴다).

동작:

- **sendNow**: `inPublic` → 지금처럼 hello + 각 hello 피어에게 pub(+레이아웃 push), 그리고 **hellos 에 없는 각 live watcher 에게 같은 plains** (같은 seq, 레이아웃 push 없음; `envelope(longest)` 그대로). 아니면 → `discovery()`(watch) 브로드캐스트; `!offline` 이면 팀 presence 지금처럼. 개인용은 Task 5 에서 card 추가.
- **receive hello**: 모든 모드에서 (`id === me` 제외) 핀 검사 → hellos 에 기록 (cap 규칙 그대로). 답장 = `discovery()` (공개: hello, 팀·개인용: watch), 지금과 같은 `HELLO_REPLY_MS` 제한. (오프라인 "답장 없음" 규칙은 사라짐 — 개인용도 watch 로 답한다.)
- **receive watch**: hello 와 똑같은 핀·cap·답장 규칙으로 `watchers` 에만 기록. `hellos`/`seen` 은 건드리지 않음.
- **receive pub**: `inPublic` → 지금 그대로. 아니면 (watcher): `hellos.get(from)` 필요, 복호화, `{"lay":` 로 시작하면 버림(레이아웃 저장 금지), `unpack(PUBLIC_VIEW, plain, from)` 후 `packet.peer.id === from && fresh(\`${PUBLIC_VIEW}|${from}\`, seq)`이면`heardPublic.set(from, {peer: packet.peer, at})`— views/chat/avatar 는 저장하지 않음,`onAvatar` 안 부름.
- **prune**: `if (offices.length) this.hellos.clear()` 삭제 (팀 PC 도 공개 PC 의 pk 가 필요). `live` 채널 = `PUBLIC_VIEW` + 가입 태그 (분할 조립이 watcher 쪽에서도 살아야 함). `watchers`·`heardPublic` TTL 만료.
- **peers(view)** 게이트 그대로 (팀·개인용에서 PUBLIC 은 `[]`).

- [ ] **Step 1: 실패 테스트** — 새 `describe('PeerNet directory: watchers')` (기존 `mkNodes`/`pump`/`rawSocket` 사용):
  - `'a team PC watches: lists public PCs, which never count it'` — T(팀) + B(공개): `pump` 까지 `T.net.directory().public` 에 B → `ids` = `['B']`; `B.net.peers(PUBLIC_VIEW)` = `[]`; `B.net.directory().public` 에 T 없음; `T.net.peers(PUBLIC_VIEW)` = `[]`; `T.net.directory().teams[tag]` = `[]`.
  - `'a personal PC watches: lists public PCs and sends no hello, pub or team'` — A(offline) + B: `A.net.directory().public` = B; A 소켓 `send` spy 의 모든 버퍼를 JSON 파싱 → `t` 는 `'watch'` 만 (Task 5 에서 `'watch' | 'card'` 로 넓힘); `B.net.peers(PUBLIC_VIEW)` = `[]`.
  - `'a watcher keeps only the person: no agents, chat, avatar or layout'` — B 의 `getPacket` 에 views 1개 + chat + avatar, B `layouts` 옵션 rev 1 + blob, T 에 `layouts.receive` spy → `T.net.directory().public[0]` 의 키 ⊆ `['id','account','nickname','nickSince','palette','hueShift','pet','tagColors']`; `receive` 호출 0.
  - `'a busy public PC (split presence) still reaches a watcher'` — B 에 40-view presence (기존 split 테스트의 view 생성기) → `T.net.directory().public` 에 B.
  - `'manual peer on one side: a watcher and a public PC still find each other'` — 기존 `'manual peer on one side only'` 구조, A 를 `offline: () => true` (또는 팀) 로: A 의 targets 만 B → `A.net.directory().public` = `['B']` (B 는 A 의 watch 에 hello 로 답함).
  - `'a watch with a changed key is ignored'` — B `pins` 에 `X → x1.publicKey`, raw 가 `{v:2,t:'watch',id:'X',pk:x2.publicKey}` 를 B 로 → `pump` 후 raw 가 받은 것 중 `t==='pub' && to==='X'` 없음; 경고 1회 (`'PC X '`).
  - `'watchers are bounded like hellos'` — raw 로 `MAX_HELLO_PEERS + 10` 개 watch → `(net as any).watchers.size === MAX_HELLO_PEERS`.
  - 기존 `'PeerNet personal mode (offline)'` 수정: "sends no datagram at all" → 보낸 데이터그램 `t` 가 전부 `'watch'`, X 의 hello 에 대한 답이 hello 가 아님; `peers(…)` 기대값은 그대로.
- [ ] **Step 2: 실패 확인** — `cd server && npx vitest run __tests__/lan/peerNet.test.ts` → 새 테스트 FAIL (`directory` 없음).
- [ ] **Step 3: 구현** (위 동작).
- [ ] **Step 4: 통과 확인** — 같은 명령 전부 PASS (기존 `'joining stops hello at once…'`, 팀·split·bounded 테스트 포함).
- [ ] **Step 5: 커밋** — `feat(lan): PCs outside the public office watch it`

---

### Task 5: PeerNet — 개인용 PC 의 이름 카드 (`card`)

**Files:**

- Modify: `server/src/lan/peerNet.ts`
- Test: `server/__tests__/lan/peerNet.test.ts`

**Interfaces:**

- Consumes: `cardAad`, `parsePeerInfo` (Task 3), `watchers`, `fresh`, `NetDirectory` (Task 4).
- Produces: `NetDirectory.personal` 채움; 내부 `private readonly cards = new Map<string, { peer: PeerInfo; at: number }>()`, `export function parseCard(text: string | null): { seq: number; peer: PeerInfo } | null` (peerNet.ts, 테스트용 export).

동작:

- **sendNow (offline)**: watch 브로드캐스트 뒤, 평문 `JSON.stringify({ seq: ++this.seq, peer: getPacket(PERSONAL_VIEW).peer })` 하나를 live `hellos` ∪ live `watchers` 의 각 id 에게 (id 당 한 번, watcher 항목 우선) `pairKey` 로 봉인해 `{v:2, t:'card', from: me, to: id, ...seal(key, cardAad(me, id), plain)}` 유니캐스트. 평문에 다른 필드 금지 — `peer` 는 `PeerInfo` 필드만 다시 골라 담는다 (`getPacket` 이 무엇을 주든).
- **receive card** (모든 모드): `to === me`, `watchers.get(from)` 가 있고 `now - at ≤ PEER_TTL_MS` (없으면 버림, 버퍼링 없음), `key ??= pairKey(...)`, `open(key, cardAad(from, to), n, c)` → `parseCard` → `peer.id === from` → `fresh(\`card|${from}\`, seq)`→`cards.set(from, {peer, at})`.
- **directory()**: `personal` = live cards. 공개와 개인용에 같은 id 가 있으면 `at` 이 큰 쪽만 남긴다 (공개 쪽 `at` = inPublic 이면 `seen` 의 at, 아니면 `heardPublic` 의 at).
- **prune**: cards TTL 만료.

- [ ] **Step 1: 실패 테스트** — `describe('PeerNet directory: cards')`:
  - `'personal A + public B: each lists the other by name'` — `B.net.directory().personal` = `['A']` (nickname 일치), `A.net.directory().public` = `['B']`; `B.net.peers(PUBLIC_VIEW)` 에 A 없음.
  - `'two personal PCs list each other'` — A, C offline → 서로 `personal`.
  - `'a team PC lists a personal PC; the personal PC lists no one in that team unless it is a member'` — T(팀 s1) + A(offline, 팀 없음) → `T…personal` = A; `A…teams` = `{}`. A 가 s1 가입(offline 유지) → `A.net.directory().teams[tag]` = `['T']`, `T.net.directory().teams[tag]` 에 A 없음, `T…personal` = A.
  - `'a card carries the person only, never a team'` — A(offline, 팀 s1 이름 `'비밀팀'` 가입) + raw X: raw 가 X 의 watch 를 A 에 보냄 → raw 가 받은 card 를 `pairKey(x, A.pk)` + `cardAad('A','X')` 로 열어 `Object.keys(plain)` = `['seq','peer']`, `plain.peer` 키 ⊆ PeerInfo 키, `views/chat/avatar/layout/office` 없음 (A 의 `getPacket` 은 views·chat·avatar 를 담아도). A 가 보낸 **모든** 데이터그램 원문에 팀 태그와 `'비밀팀'` 문자열 없음, `t` ∈ `{'watch','card'}`.
  - `'every watch and card fits one datagram'` — 최대 크기 peer (id 64자, account 32 code point 의 4바이트 문자, nickname 20자, `nickSince`, `pet`, `tagColors`) 로 A offline + raw watcher(id 64자) → raw 가 받은 모든 데이터그램 `Buffer.byteLength ≤ MAX_DATAGRAM_BYTES`.
  - `'forged cards are dropped'` — raw X 가 B 에게: watch 없이 card (→ personal 비어 있음), watch 후 `to:'Z'` card, 다른 키로 봉인한 card, `cardAad` 대신 `pubAad` 로 봉인한 card, inner `peer.id !== from`, 같은 seq 재전송 → 정상 card(seq 5, nickname `'one'`) 만 반영, 나머지 후에도 `'one'`. watch 만료(`b.t += PEER_TTL_MS + 1`) 후 온 card 는 버림.
  - `'a PC that switches personal → public is listed once, where it was heard last'` — A offline 으로 B 의 personal 에 나온 뒤 `A.offline = false` → `pump` 후 `B…public` = A, `B…personal` 에 A 없음 (TTL 지나기 전에도).
  - Task 4 의 개인용 테스트 기대 `t` 를 `'watch' | 'card'` 로 넓힘.
- [ ] **Step 2: 실패 확인** — `cd server && npx vitest run __tests__/lan/peerNet.test.ts -t 'cards'` → FAIL.
- [ ] **Step 3: 구현.**
- [ ] **Step 4: 통과 확인** — `cd server && npx vitest run __tests__/lan/peerNet.test.ts` 전부 PASS.
- [ ] **Step 5: 커밋** — `feat(lan): personal-mode PCs send a name card`

---

### Task 6: `LanService.directory()` + `peopleDirectory` 메시지

**Files:**

- Modify: `server/src/lan/office.ts`, `core/asyncapi.yaml`, `core/src/messages.ts` (생성), `server/src/clientMessageHandler.ts`, `server/src/httpServer.ts:170-186`
- Test: `server/__tests__/lan/office.test.ts`, `server/__tests__/httpServerWs.test.ts`

**Interfaces:**

- Consumes: `NetDirectory`, `PeerNet.directory()` (Task 4/5), `officeList()`.
- Produces:
  - asyncapi (`ServerMessage` oneOf 의 LAN office 아래):
    - `DirectoryPersonMessage` — `OfficePersonMessage` 에서 `chat`·`avatar` 를 뺀 것: required `[peerId, account, nickname, palette, hueShift, self]`, optional `nickSince`, `pet`, `tagColors`.
    - `DirectoryTeamMessage` — required `[tag, name, people]` (`name` '' = 아직 모름).
    - `PeopleDirectory` — `{type: 'peopleDirectory', public: DirectoryPersonMessage[], teams: DirectoryTeamMessage[], personal: DirectoryPersonMessage[]}`, 전부 required.
  - `LanService.net` 타입에 `directory(): NetDirectory` 추가, 기본 스텁 `() => ({ public: [], teams: {}, personal: [] })`.
  - `LanService.directory(): Omit<PeopleDirectory, 'type'>`:
    - 나(`self: true`, 맨 앞): 개인용 → `personal`; 아니면 팀 가입 → 그 팀; 아니면 `public`.
    - `public` = (나?) + `net.directory().public`; `teams` = `profile.offices` 마다 `{tag, name: officeList() 의 name, people: (개인용 아니면 나) + net.teams[tag] ?? []}` (가입 팀 없으면 `[]`); `personal` = (나?) + `net.personal`.
    - 내 `peerId` 를 가진 피어 행은 버림; 영역 안 같은 peerId 는 첫 것만.
  - `private person(p: PeerInfo, self: boolean): DirectoryPersonMessage` — `people()` 도 이것을 쓰고 chat/avatar 만 덧붙인다.
  - `export function directoryMessage(lan: LanService)` (clientMessageHandler.ts) = `{ type: 'peopleDirectory', ...lan.directory() } as const`. 핸드셰이크: 첫 `officeSnapshot` 바로 뒤에 한 번 (privileged 일 때, snapshot 과 같은 조건). httpServer 1 s 타이머: 각 소켓에 snapshot 다음 `safeSend(c, directoryMessage(lan))` (같은 try).

- [ ] **Step 1: 실패 테스트** — office.test `describe('directory')` (`lan.net.directory` 스텁):
  - `'public PC: me first in public, cards in personal, no team area'` — `public[0]` = `{peerId: 'me', self: true}`, `teams` = `[]`, `personal` = 스텁 그대로 (`self: false`).
  - `'team PC: me in the team under its name, public PCs listed without me'` — `createOffice('우리팀')` → `teams` = `[{tag, name:'우리팀', people:[me, …net.teams[tag]]}]`, `public` 에 me 없음.
  - `'personal PC in a team: me in personal only; the team still lists its members'` — `setActiveView(PERSONAL_VIEW)` → me 는 `personal` 에만, `teams[0].people` 에 me 없음, 스텁 멤버는 있음.
  - `'a peer claiming my id is dropped; rows carry no chat or avatar'` — 스텁 public 에 `id:'me'` → 하나만(self); 모든 행 키에 `chat`/`avatar` 없음 (`sendChat` 한 뒤에도).
  - `'the office view ignores the directory'` — 스텁 public 에 `'w'`, `net.peers` = `[]` → `lan.people(PUBLIC_VIEW)` peerId = `['me']`, `snapshotMessage(lan).agents` 에 `w` 없음.
  - httpServerWs.test `'pushes peopleDirectory with every snapshot'` — 기존 `'pushes officeSnapshot every second'` 패턴: 연결 후 `waitForMessage(socket, 'peopleDirectory')` 가 `public[0].self === true`.
- [ ] **Step 2: 실패 확인** — `cd server && npx vitest run __tests__/lan/office.test.ts` → FAIL; httpServerWs 는 `npm run build` 후 `npx vitest run __tests__/httpServerWs.test.ts` → FAIL.
- [ ] **Step 3: 구현** — asyncapi 수정 → `npm run asyncapi:generate` → 서버 코드.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS; `npm run asyncapi:validate` OK; `npm run check-types` 0.
- [ ] **Step 5: 커밋** — `feat: peopleDirectory — public, team and personal people for the panel`

---

### Task 7: 웹뷰 — 영역 모델 + 패널 세 영역

**Files:**

- Create: `webview-ui/src/lan/directoryModel.ts`
- Modify: `webview-ui/src/hooks/useExtensionMessages.ts`, `webview-ui/src/lan/PeoplePanel.tsx`, `webview-ui/src/App.tsx:725-730`, `webview-ui/src/i18n.ts`
- Test: `webview-ui/test/directoryModel.test.ts`

**Interfaces:**

- Consumes: `PeopleDirectory`, `DirectoryPersonMessage` (Task 6), `PersonRow`/`peopleRows` (peopleModel.ts), `tieBreak`/`peerLabel` (nicknames.ts).
- Produces:
  ```ts
  export type AreaKey = 'public' | 'team' | 'personal';
  export interface AreaSection {
    area: AreaKey;
    /** PUBLIC_VIEW, the team tag, or PERSONAL_VIEW. */
    view: string;
    /** Team name, '' = unknown (shown as office.unnamed); '' for public/personal. */
    name: string;
    /** Self first, then peerLabel, then peerId; names tie-broken within the area (tieBreak). */
    people: DirectoryPersonMessage[];
    /** This area is the office on screen (its rows keep the full panel behaviour). */
    viewed: boolean;
  }
  export const EMPTY_DIRECTORY: Omit<PeopleDirectory, 'type'>;
  /** [public, ...teams by name then tag, personal]; no team sections without a team. */
  export function areaSections(
    dir: Omit<PeopleDirectory, 'type'>,
    activeView: string,
  ): AreaSection[];
  /** Area people the viewed office's snapshot rows do not have (shown as plain rows). */
  export function viewedExtras(section: AreaSection, rows: PersonRow[]): DirectoryPersonMessage[];
  /** Distinct peerIds over every section and the snapshot rows (the panel title). */
  export function totalPeople(sections: AreaSection[], rows: PersonRow[]): number;
  ```
  - `useExtensionMessages` 결과에 `directory: Omit<PeopleDirectory, 'type'>` (초기 `EMPTY_DIRECTORY`, `peopleDirectory` 받을 때 교체; 그 외 state 는 건드리지 않음 → `requestRender` 불필요, React state 만).
  - `PeoplePanel` props: `{ rows: PersonRow[]; sections: AreaSection[]; lan; officeState; forceOpen }`. App: `sections={areaSections(directory, offices?.activeView ?? PUBLIC_VIEW)}`.
  - i18n (ko / en): `people.area.public` `'공개 오피스 · {n}'` / `'Public office · {n}'`; `people.area.team` `'팀 · {n}'` / `'Team · {n}'`; `people.area.teamName` `'🔒 {name} · {n}'` / 같음; `people.area.personal` `'개인용 · {n}'` / `'Personal · {n}'`; `people.area.empty` `'없음'` / `'No one'`. `office.personalHint` 교체: ko `'이 PC 혼자 쓰는 작은 오피스 — 에이전트·채팅·아바타는 다른 PC 로 보내지 않고, 접속자 목록에 이름만 보입니다 (팀 오피스는 그대로 남습니다)'`, en `'A small office for this PC alone — agents, chat and avatar stay here; other PCs see only your name in their people list (your team offices are kept)'`.

렌더: 제목 버튼(접기/펼치기, 기존 그대로, `people.title` 의 n = `totalPeople`) 아래 영역 순서대로. 영역 제목 줄(`text-xs font-bold`, `border-t-2 border-border`), 팀은 `people.area.team` 한 줄 + 팀마다 `people.area.teamName` 한 줄. 사람 0 → 제목 + `people.area.empty` (공개·개인용; 팀 섹션은 가입 시에만 존재). **viewed 영역** = 기존 `rows` 버튼 행 전부(클릭 = 따라가기, hover = 하이라이트, 상태 표시, hover 중 순서 고정) + `viewedExtras` 의 일반 행; **다른 영역** = 일반 행 (`CharacterPreview` 얼굴 + 이름 + 나면 `people.you`, `button` 아님, 클릭 반응 없음). 일반 행 이름 = `peerLabel(area tie-broken person)`. 넘치면 기존처럼 목록 영역 `overflow-y-auto`.

- [ ] **Step 1: 실패 테스트** — `webview-ui/test/directoryModel.test.ts`:
  - `'areas in order public, team, personal; no team area without a team'` — `teams: []` → `area` 목록 `['public','personal']`; 팀 둘(`'나'`,`'가'`) → `['public','team','team','personal']`, 팀 이름 순 `['가','나']`.
  - `'self first, then label order'` — people `[{account:'b'},{account:'a'},{self:true, account:'z'}]` → `['z','a','b']`.
  - `'viewed marks the area of the active view'` — `activeView` = 팀 태그 → 그 팀만 `viewed`; `'personal'` → personal 만.
  - `'names are tie-broken within an area'` — 같은 nickname 두 명 → 한 명 nickname 에 `·` 접미사 (`tieBreak` 규칙).
  - `'viewedExtras: area people missing from the snapshot rows'` — rows peerId `['me','b']`, section `['me','b','c']` → `['c']`.
  - `'totalPeople counts each peerId once'` — 공개 `['me','b']` + 개인용 `['c']` + rows `['me','b','demo']` → 4.
- [ ] **Step 2: 실패 확인** — `cd webview-ui && npx vitest run test/directoryModel.test.ts` → FAIL (모듈 없음).
- [ ] **Step 3: 모델 구현.**
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS.
- [ ] **Step 5: 패널·훅·App·i18n 구현** — 위 렌더 규칙.
- [ ] **Step 6: 확인** — `npm run check-types && npm run lint && npm run test:webview` PASS.
- [ ] **Step 7: 실제 확인** — 두 인스턴스(`PIXEL_OFFICE_UDP_PORT=47810 PIXEL_OFFICE_UDP_TARGETS=127.0.0.1:47811` 와 반대쪽, CLAUDE.md "Data"): 공개+개인용 → 양쪽 패널에 서로 이름, 탭에 인원 수 없음; 한쪽이 팀 만들기 → 공개 쪽 패널에 그 PC 없음, 팀 쪽 패널 공개 영역에 상대; 팀에서 새 팀 만들기 → 확인 창, 취소하면 그대로. 다크/라이트 둘 다.
- [ ] **Step 8: 커밋** — `feat(webview): people panel shows public, team and personal areas`

---

### Task 8: 문서 + 전체 검증

**Files:**

- Modify: `CLAUDE.md` (`lan/peerNet.ts` 줄에 watch/card·watcher pub; "Personal mode" 단락: 이제 watch + card 를 보내고 `liveCount` 없음; "Handshake": 첫 `officeSnapshot` 뒤 `peopleDirectory`, `online` 제거; 팀 하나 규칙(`MAX_OFFICES` 1, 로드 마이그레이션, create/join = 교체); Office UI essentials 의 people panel 세 영역), `README.md:64`, `docs/설치-안내.md:66-75`, `docs/INSTALL.en.md` 대응 절 (팀은 하나만, 개인용도 이름은 목록에 보임, 1.0.24 이하 PC 와는 서로 목록에 안 나올 수 있음)

- [ ] **Step 1: 문서 갱신.**
- [ ] **Step 2: 전체 검증** — `npm run build && npm test` 전부 PASS; `npm run asyncapi:validate` OK; `git status` 에 생성 파일 drift 없음.
- [ ] **Step 3: 커밋** — `docs: people panel areas, watch/card, one team`

---

## Self-Review

- **스펙 커버리지**: 목표 1 → Task 2; 2·3 → Task 6·7; 4 (가입 팀만, 없으면 숨김) → Task 6 `teams` = `profile.offices` 기반 + Task 7 테스트; 5 → Task 5; 6 (팀 하나) → Task 1. 반목표: 개인용 PC 의 에이전트·채팅·아바타 안 나감 → Task 5 card 테스트; 팀 정보 평문 없음 → Task 5 원문 스캔; 다른 영역이 화면에 안 나옴 → Task 4 (`peers`) + Task 6 (`people`/snapshot); 1.0.24 이하 → Task 3 (모르는 `t` null) + Task 4 (watcher 는 hello 가 아님); 피어 데이터 실행 금지 → Task 4 (watcher 는 레이아웃 조각 버림). 제약 1200 B → Task 5. 검토 1–5 → Global Constraints + Task 4/5/6. 스펙 테스트 목록 전부 Task 3–5, 7 에 대응.
- **타입 일관성**: `NetDirectory` (Task 4) → Task 5·6; `cardAad`/`parsePeerInfo` (Task 3) → Task 5; `DirectoryPersonMessage`/`PeopleDirectory` (Task 6) → Task 7; `switchConfirmName` (Task 1) 은 OfficeSettings 에서만.
- **판단으로 정한 것** (스펙 빈칸): `online`/`liveCount` 완전 제거; `OfficeErrorReason.full` 제거; create/join 은 새 필드 없이 항상 교체(확인은 웹뷰); 같은 팀 코드 join 도 확인 창은 뜨지만 서버가 `alreadyJoined` 로 아무것도 안 바꿈; 한쪽 수동 피어를 위해 hello·watch 를 받으면 자기 발견 신호로 1:1 답장(기존 hello 답장 규칙 확장); watcher 는 공개 레이아웃 조각을 버림; 패널 제목 n = 전체 고유 인원; 다른 영역 행은 버튼이 아님.
