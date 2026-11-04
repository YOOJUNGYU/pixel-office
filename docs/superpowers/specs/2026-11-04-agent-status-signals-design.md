# 에이전트 상태 신호 (행동 아이콘·경과 시간·할 일 진행률·실패 표시) — 설계

작성일: 2026-11-04

## 의도

지금 오피스 화면이 에이전트에 대해 보여 주는 것은 방, 말풍선(`act` + `target`), 빨간 !(권한 대기), 서브에이전트 대화, 세션 상세 창이다. 화면을 축소하면 말풍선 글자는 읽히지 않고, "얼마나 오래 이러고 있나", "일이 어디까지 됐나", "방금 뭔가 실패했나"는 어디에도 나오지 않는다.

이 작업은 오피스를 훑어보는 것만으로 세 가지를 알 수 있게 한다:

1. **무엇을 하나** — 멀리서도 보이는 행동 아이콘
2. **얼마나 됐나** — 지금 행동의 경과 시간, 오래 걸리면 색으로 경고
3. **잘 되고 있나** — 할 일 진행률(3/7)과 방금 실패한 도구 표시

두 단계로 나눈다. 1단계는 아이콘(화면만)과 경과 시간(선택 필드 `ageSec` 하나), 2단계는 할 일·실패 선택 필드다. 둘을 한 번에 설계하고, 구현은 1단계 → 2단계 순서로 각각 출시할 수 있게 한다.

이 문서의 결정은 대부분 Claude 의 판단이다(사용자는 질문 없이 추천안대로 쓰라고 함). 사용자가 정한 것은 "1단계 = 1번 아이콘 + 4번 경과 시간, 2단계 = 7번 할 일 진행률 + 8번 실패 표시, 2단계까지 한 번에 설계" 와 "경과 시간은 화면이 아니라 실제 세션 기록에서" 다.

## 목표

- **G1 행동 아이콘.** 일하는 에이전트마다 `act` 를 나타내는 8×8 픽셀 아이콘. 축소해서 말풍선 글자가 안 읽히는 배율이면 말풍선 대신 아이콘만 보인다.
- **G2 경과 시간.** 지금 행동이 **세션에서 실제로** 시작된 뒤 지난 시간("3분")을 말풍선에 붙인다. 페이지를 새로 열거나 서버를 다시 켜도 값이 같다(사용자 결정: 화면이 처음 본 시각부터 세면 안 됨). 정해진 시간을 넘기면 색이 바뀐다(멈춘 에이전트 찾기).
- **G3 할 일 진행률.** Claude `TodoWrite`(+ `TaskCreate`/`TaskUpdate`), Codex `update_plan` 의 완료/전체 개수를 머리 위에 진행 막대로. 개수만 보낸다.
- **G4 실패 표시.** 도구 결과가 오류(Claude `tool_result.is_error`, Codex 0 이 아닌 종료 코드)면 잠깐 땀방울 아이콘.
- 넷 다 내 에이전트와 다른 PC 의 에이전트 모두에게 보인다(같은 화면 규칙).

## 반목표 / 절대 안 되는 것

- **새 `act` 값을 만들지 않는다.** ≤ 1.0.7 피어는 모르는 `act` 가 든 패킷을 통째로 버린다. 새 정보는 전부 `AgentView` 의 선택 필드로 보낸다.
- **할 일 내용(제목·설명)은 어떤 경로로도 피어에게 나가지 않는다.** 개수 두 개(`done`, `total`)만. 실패도 `true` 한 비트만 — 오류 메시지·명령·종료 코드 값은 보내지 않는다.
- **`profile.hideWork` 가 켜져 있으면 새 필드는 하나도 나가지 않는다.** 이것이 깨지면 기능이 동작해도 실패다.
- 말풍선과 아이콘을 같은 배율에서 동시에 띄우지 않는다(머리 위가 지저분해지는 것이 이 작업의 가장 큰 위험).
- 새 OS 알림은 없다(실패·오래 걸림 알림은 범위 밖).
- 모니터 화면, 서버실 LED, 변경량, 컨텍스트 사용률, 언어 색, 활동 띠(아이디어 2·3·5·6·9·10)는 이번 범위 밖.

## 제약 (기존 프로젝트 규칙)

- 프로토콜: `core/asyncapi.yaml` 의 에이전트 스키마(`hidden`, `talk` 옆)에 필드 추가 → `npm run asyncapi:generate`, `additionalProperties: false` 유지.
- 받은 값은 `core/src/lan.ts` `parseView` 에서 검증한다(잘못된 필드는 그 필드만 버리고 뷰는 살린다 — `talk`/`hidden` 과 같은 방식).
- 데이터그램 ≤ 1200 B: `fitPacket` 이 뷰를 뒤에서부터 덜어 낸다. 새 필드는 뷰마다 최대 ~40 B 라 그대로 두되, 크기 테스트로 확인한다.
- 상수는 `server/src/constants.ts` / `webview-ui/src/constants.ts`, 색은 `webview-ui/src/constants.ts` 또는 `index.css` 변수(다크/라이트 둘 다), 문자열은 `i18n.ts`(ko/en).
- 캔버스·오버레이 규칙: 바뀐 상태는 `requestRender`, 스스로 움직이는 것은 `nextFrameIn` 에 반영. 경과 시간 표시는 1초마다 바뀌므로 반영 대상이다(아래 G2).
- 런타임 의존성 추가 금지. CSS/캔버스 `filter` 금지(테마 테스트).

## 1단계 — 아이콘(화면만) + 경과 시간(`ageSec`)

### G1 행동 아이콘

**아이콘 집합** (`webview-ui/src/lan/actIcons.ts`, 순수 모듈): 8×8 비트맵 문자열(`'.'` = 투명, 문자 = 팔레트 색)과 `act` → 아이콘 매핑.

| act                            | 아이콘          |
| ------------------------------ | --------------- |
| `edit`                         | 연필            |
| `read`                         | 문서            |
| `search`, `find`               | 돋보기          |
| `web`, `fetch`                 | 지구본          |
| `mcp`                          | 플러그          |
| `run`                          | ▶ 터미널        |
| `delegate`                     | 편지            |
| `ask`                          | ?               |
| `image`                        | 그림            |
| `tool` + target 있음           | 톱니            |
| `tool` + target 없음 (생각 중) | 말줄임 구름 `…` |
| `idle`, `hidden`               | 없음            |

- `permission` 인 에이전트는 아이콘 대신 지금의 빨간 ! 만 보인다(경고가 우선).
- 그리는 방법은 구현자 몫이다. 추천: 인라인 SVG `<rect>` + `shape-rendering="crispEdges"` (DOM 오버레이라 `LanOverlay` 의 기존 말풍선 옆에 그대로 들어간다). 색은 `constants.ts` 의 아이콘 팔레트(밝은 획 + 어두운 외곽 2색이면 충분, 다크/라이트 둘 다 보이는지 확인).

**배율에 따른 전환 (LOD)** — `LanOverlay`:

- `k = bubbleScale(zoom, dpr)` (기존). `k ≥ ACT_ICON_ONLY_BELOW_SCALE` (추천 0.6, 상수) → 지금 말풍선 그대로, 맨 앞 Claude/Codex 배지 오른쪽에 아이콘을 작게(글자 높이) 넣는다.
- `k < ACT_ICON_ONLY_BELOW_SCALE` → 말풍선 대신 아이콘만 든 작은 말풍선(`.bubble-agent` 같은 모양, 꼬리 포함). 이 아이콘 말풍선은 **배율을 따라 줄지 않는다**: 화면 고정 크기(`ACT_ICON_SCREEN_PX`, 추천 16 CSS px = 8×8 의 2배). 겹치면 기존 `stackBubbles` 로 위로 쌓는다.
- 마우스를 올렸을 때의 전체 말풍선(hover)은 지금 그대로 — 아이콘 모드에서도 올리면 전체 글이 보인다.
- 이름표·말풍선 토글(`tagsHidden`)을 끄면 아이콘도 숨는다(말풍선과 같은 취급).
- 방 이름판 팝업(`RoomTip`)의 에이전트 카드 `actText` 앞에도 같은 아이콘을 붙인다(싸고 일관됨).

### G2 경과 시간

**기준 시각은 세션 기록에서 온다** (스캐너, 사용자 결정):

- Claude JSONL 과 Codex rollout 은 줄마다 ISO `timestamp` 가 있다. 파서(`applyClaudeLine`/`applyCodexLine`)가 그 줄의 시각 `lineAt` 을 읽는다. 없거나 잘못됐거나 미래(지금 + `LINE_CLOCK_SLACK_MS`, 추천 1분 초과)면 지금 시각으로 대신한다.
- `SessionState.actSince` (ms epoch): `(act, target, permission)` 중 하나가 바뀔 때 `lineAt` 으로 갱신한다(`setActivity`/`setThinking`/`setIdle` 와 권한 판정 지점). 권한 대기는 `tick` 의 추측으로 켜지므로(줄이 없음) 그때는 `pendingTool.since` = 그 도구 호출 줄의 시각을 쓴다.
  - 주의: 지금 파서의 `now` 는 **줄을 읽은 시각**이다. 서버 시작 직후 첫 스캔은 파일 끝 여러 줄을 한꺼번에 읽어 모두 같은 `now` 를 받는다 — 그래서 경과 시간에는 `now` 가 아니라 `lineAt` 을 써야 한다. 기존 방 판정(`candidateSince`, TTL 등)은 그대로 `now` 를 쓴다(이번에 바꾸지 않음).
- 셸 뷰: 셸이 시작된 결과 줄의 `lineAt` 을 `shells` 항목에 저장해 `actSince` 로 쓴다.
- 같은 `act` 라도 `target` 이 바뀌면(다른 파일 편집) 새로 센다 — "같은 일을 오래 붙잡고 있음"을 보려는 것이므로.
- `idle`, `hidden` 은 시간이 없다.

**전달: 시각이 아니라 나이** (PC 마다 시계가 달라서):

- `AgentView.ageSec?: number` — 보내는 순간 `floor((now - actSince) / 1000)`, 0 ≤ ageSec ≤ `AGE_MAX_SEC` (추천 7일). `idle`/`hidden`/셸 아닌 비활성이면 없음.
- 내 화면 스냅샷(1초마다)은 매번 새로 계산한 `ageSec` 를 싣는다.
- 피어: 받은 쪽 `PeerNet` 이 패킷을 받는 순간 `since = 받은시각 - ageSec*1000` 로 **자기 시계 기준 시각**으로 바꿔 저장하고, 스냅샷을 만들 때마다 `ageSec = (지금 - since)/1000` 로 다시 계산한다. 저장된 패킷을 다음 presence 까지 그대로 쓰면 나이가 멈춰 보이기 때문이다. 전송 지연(수백 ms)만큼 오차 — 분 단위 표시라 무시.
- `parseView`: 정수·범위일 때만 붙임, 아니면 그 필드만 버림.
- `hideView` 는 `ageSec` 도 지운다(새 필드는 숨기기에서 하나도 안 나감).
- **`ageSec` 가 없으면 경과 시간을 표시하지 않는다.** 화면이 대신 세는 대체 방식은 두지 않는다(잘못된 값보다 없는 게 낫다). 그래서 옛 버전 PC 의 에이전트는 시간이 안 보인다.
- 화면: 스냅샷이 1초마다 새 `ageSec` 를 싣고 오고 스냅샷마다 다시 그리므로, 화면은 받은 값을 그대로 쓴다(구현 때 확인: 화면 쪽 시계·`nextFrameIn` 변경은 필요 없었음).

**표시** (`lan/elapsed.ts`, 순수 모듈):

- 형식: 60초 미만은 표시 안 함(잦은 도구 호출로 깜빡이지 않게), 1–59분 `3분` / `3m`, 1시간 이상 `1시간 12분` / `1h 12m`. i18n 키로.
- 위치: 말풍선 맨 끝 칩(작은 글씨, 흐린 색). 아이콘 모드에서는 표시하지 않는다(경고 색만, 아래).
- 경고: `permission` 은 `ELAPSED_WARN_PERMISSION_MS` (추천 2분), 그 외 일하는 행동은 `ELAPSED_WARN_MS` (추천 10분)를 넘기면 칩 색을 경고색(`--elapsed-warn-*`, 다크/라이트)으로. 아이콘 모드에서는 아이콘 말풍선 테두리를 같은 경고색으로.
- 세션 상세 창 상태줄(`StatusBar`)에도 같은 경과 시간을 붙인다: `작업 중 · 3분 · Edit foo.ts`.

**다시 그리기**: 별도 처리 없음 — 위와 같이 1초마다 오는 스냅샷이 다시 그린다.

## 2단계 — `AgentView` 선택 필드

### 새 필드

(1단계의 `ageSec` 와 함께 `asyncapi.yaml` 에 정의한다.)

```ts
interface AgentView {
  // …기존…
  /** 1단계: 지금 행동이 세션에서 시작된 뒤 지난 초. 받은 쪽이 자기 시계로 바꿔 다시 계산. */
  ageSec?: number;
  /** 할 일 진행률: 개수만. 목록이 없으면 없음. 0 ≤ done ≤ total ≤ TODO_MAX(999), total ≥ 1. */
  todo?: { done: number; total: number };
  /** 방금 도구가 실패함: 보낸 쪽이 FAIL_SHOW_MS 동안만 실어 보냄(talk 와 같은 방식). */
  fail?: true;
}
```

- 메인과 서브에이전트에만 붙는다. 셸 뷰(`kind: 'shell'`)에는 없음.
- 오래된 피어는 `parseView` 가 모르는 필드를 버리므로 그냥 안 보인다(패킷은 살아 있음). 확인 테스트 포함.
- `parseView`: `todo` 는 정수·범위·`done ≤ total` 을 모두 만족할 때만, `fail` 은 `=== true` 일 때만 붙인다. 아니면 그 필드만 버린다.
- **`hideView` 는 `todo`/`fail`/`ageSec` 모두 지운다.** 지금 `hideView` 는 `{...v, …}` 로 펼치므로 새 필드가 그대로 따라 나간다 — 명시적으로 빼야 한다. 테스트: `hideView` 결과에 `todo`/`fail`/`ageSec` 키가 없음.
- `redactView` 는 셋 다 그대로 둔다(개수·한 비트·나이는 민감하지 않음).

### G3 할 일 진행률 — 스캐너

`SessionState` 에 `todo: { done: number; total: number } | null` 과 Claude 작업 목록용 `tasks: Map<string, string>`(id → status)을 추가한다. **할 일 제목은 저장하지 않는다**(개수만 필요).

- **Claude `TodoWrite`**: 입력 `todos[]` 가 매번 전체 목록 → `total = todos.length`, `done = status === 'completed' 인 개수`. 빈 목록 → `todo = null`.
- **Claude `TaskCreate` / `TaskUpdate`**: 변경분만 온다. `TaskCreate` 의 결과(tool_result)에서 새 id 를 읽어 `tasks.set(id, 'pending')`, `TaskUpdate` 입력의 id/status 로 갱신(`deleted` 계열이면 제거). `todo` = `tasks` 에서 계산. 정확한 입력/결과 모양은 **구현자가 실제 transcript 로 확인**한다(이 PC 의 `~/.claude/projects` 에는 표본이 없었음). 모양을 확신할 수 없으면 `TaskCreate`/`TaskUpdate` 는 건너뛰고 `TodoWrite` 만 지원해도 된다 — 문서에 그렇게 적는다.
- **Codex `update_plan`**: 인자 `plan[]` 의 `status === 'completed'` 개수 / 길이. 인자는 JSON 문자열이므로 `JSON.parse` 실패 → 무시.
- 수명: 세션이 살아 있는 동안 유지된다(턴이 바뀌어도). 전부 끝난 목록(`done === total`)은 그 턴이 끝나면(`setIdle`) 지운다 — 다 된 진행 막대가 계속 떠 있지 않게.
- 서브에이전트는 자기 transcript 에서 따로 센다(부모와 섞지 않음).

**표시**:

- 말풍선 모드: 경과 시간 칩 앞에 `3/7` 칩 + 그 아래 2px 진행 막대(채움 = 진행색, 바탕 = 흐린 색).
- 아이콘 모드: 아이콘 말풍선 아래쪽 테두리에 같은 진행 막대만(글자 없음).
- idle 에이전트는 말풍선이 없으므로 머리 위에는 표시하지 않는다(대기실 에이전트는 캐릭터도 없음). `RoomTip` 카드와 세션 상세 상태줄에는 목록이 있는 동안 항상 보인다.
- 색: `--todo-bar-fill` / `--todo-bar-track`, 다크/라이트.

### G4 실패 표시 — 스캐너

`SessionState.failUntil: number` (ms epoch, 0 = 없음). `toViews` 는 `now < failUntil` 이면 `fail: true` 를 붙인다(`talkUntil` 과 같은 패턴).

- **Claude**: `onUser` 의 `tool_result` 중 `is_error === true` 가 있으면 `failUntil = now + FAIL_SHOW_MS` (추천 8 s, `server/src/constants.ts`). 권한 거절(사용자가 No)도 `is_error` 로 오는데, 이건 실패가 아니다 — 결과 텍스트가 거절 문구면 건너뛰는지 구현자가 실제 transcript 로 확인하고, 구분이 안 되면 그냥 실패로 친다(문서에 기록).
- **Codex**: `function_call_output` 에서 0 이 아닌 종료 코드. 지금 `EXIT_RE = /"exit_code"/` 는 존재만 본다 — 값을 읽는 정규식을 추가한다. 정확한 출력 모양은 구현자가 실제 rollout 으로 확인.
- 표시: 머리 옆에 땀방울 아이콘(8×8, `actIcons.ts` 에 함께), 말풍선/아이콘 모드 둘 다, 배율 고정 크기. 정지 그림이라 `nextFrameIn` 은 바뀌지 않는다(스냅샷이 오면 생기고 사라짐 — 스냅샷마다 이미 `requestRender`). 빨간 ! 이 떠 있으면 땀방울은 숨긴다.

### 크기

`todo` 는 `"todo":{"done":3,"total":7}` 약 28 B, `fail` 은 `"fail":true` 11 B, `ageSec` 는 `"ageSec":604800` 최대 15 B. 뷰마다 최대 ~55 B. `fitPacket` 이 넘치는 뷰를 덜어 내므로 안전하지만, 바쁜 PC(뷰 다수)에서 덜어지는 뷰가 늘 수 있다. 테스트: 뷰 N 개 + 전부 `todo`/`fail` 인 패킷이 `presencePlains` 후 모든 데이터그램 ≤ 1200 B.

## 테스트 (필수)

서버/코어:

- `parseView`: 올바른 `todo`/`fail` 통과, 잘못된 값(음수, 소수, `done > total`, `total = 0`, 999 초과, `fail: 1`)은 그 필드만 버리고 뷰는 남음; 필드 없는 옛 뷰 그대로.
- `hideView`: 결과에 `todo`/`fail` 없음. `redactView`: 그대로 있음.
- `claudeParser`: `TodoWrite` 개수, 빈 목록 → null, 다 된 목록은 턴 끝에 지움, `is_error` → `failUntil`, (지원하면) `TaskCreate`/`TaskUpdate` 누적.
- `codexParser`: `update_plan` 개수, 잘못된 JSON 무시, 0 이 아닌 종료 코드 → 실패, 0 → 실패 아님.
- `toViews`: `fail` 은 `FAIL_SHOW_MS` 뒤 사라짐, 셸 뷰에는 없음.
- 경과 시간: 줄 `timestamp` 로 `actSince` 가 정해짐(읽은 시각 아님 — 과거 timestamp 줄 여러 개를 한 번에 넣은 첫 스캔에서도 맞는 나이), timestamp 없음/잘못됨/미래 → 지금, target 변경 → 리셋, 권한 대기 → 도구 호출 줄 시각, idle → `ageSec` 없음.
- 피어 나이 재계산: `ageSec=120` 패킷을 받고 시계를 60초 진행 → 스냅샷 `ageSec=180`.
- `parseView`: `ageSec` 음수·소수·`AGE_MAX_SEC` 초과 → 그 필드만 버림.
- 기존 scanner.test 의 "로컬 전용 정보는 패킷에 없음" 검사에 할 일 제목이 패킷 어디에도 없음을 추가.
- 패킷 크기(위).

화면:

- `actIcons`: 모든 `ACTS` 값에 매핑이 있음(새 act 가 생기면 테스트가 깨지게), 비트맵이 8×8.
- `elapsed`: 형식(59초 → 없음, 3분, 1시간 12분, ko/en), 경고 임계(권한/일반), `ageSec` 없음 → 표시 없음.
- LOD 임계 판정 순수 함수.

## 문서

- `CLAUDE.md`: Office UI essentials 의 말풍선 항목에 아이콘 LOD·경과 시간·진행 막대·땀방울을, Handshake/`AgentView` 설명에 `ageSec`(나이, 받은 쪽 시계로 재계산)·`todo`/`fail`(선택, `hideView` 가 모두 지움, 개수만)을 추가.
- `README.md` / `README.en.md`: 화면 설명에 한두 줄.

## 구현자에게 맡기는 것

- 아이콘 픽셀 그림 자체와 팔레트(다크/라이트에서 모두 또렷하게).
- SVG/캔버스 등 아이콘 그리는 방법.
- 상수의 정확한 값(위 추천값은 출발점).
- 투어 데모 에이전트에 `todo`/`fail` 예시를 넣을지(넣으면 투어 화면이 기능을 보여 줌 — 추천).
- `TaskCreate`/`TaskUpdate` 지원 여부(실제 표본 확인 후), 권한 거절을 실패에서 뺄지.

## 출시 순서

1. 1단계(G1 + G2) — 아이콘(화면) + `ageSec`(프로토콜·스캐너·화면), 단독 릴리스 가능.
2. 2단계(G3 + G4) — 프로토콜 + 스캐너 + 화면. 2단계를 먼저 받은 PC 와 아직 1단계인 PC 가 섞여도 문제없다(옛 피어는 새 필드를 무시).

## 구현 때 정한 것 (2026-11-04)

- Claude `TaskCreate`/`TaskUpdate` 는 세지 않는다(로컬 표본 없음, `ponytail:` 주석). `TodoWrite` 만.
- 실패에서 뺀 `is_error`: 사용자 거절("The user doesn't want to proceed", "Permission to use …"), 훅 차단(`… hook error:`). 실제 transcript 에서 확인한 문구.
- Codex 실패 = 출력 텍스트의 `"exit_code":N`, N ≠ 0 (실제 rollout 에서 확인). `update_plan` 은 인자(JSON 또는 custom exec 의 JS 객체)에서 `status:"…"` 를 센다.
- 피어 나이 재계산은 `PeerNet.peers()` 의 `aged(packet, 지금 - 받은시각)`.
- 아이콘은 인라인 SVG(`lan/ActIcon.tsx`, 비트맵 `lan/actIcons.ts`), 패널 쪽 글자 표시는 `lan/SignalText.tsx`(방 카드, 세션 창 상태줄).
