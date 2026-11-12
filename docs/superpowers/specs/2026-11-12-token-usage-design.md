# 토큰 사용량 (사용량 창 + 캐릭터 신호 5종) — 설계

작성일: 2026-11-12

## 의도

[token-dashboard](https://github.com/nateherkai/token-dashboard) 는 Claude Code 기록(`~/.claude/projects/**/*.jsonl`)의 `usage` 를 모아 "얼마나·언제·어디에 썼나" 를 보여 주는 로컬 대시보드다. pixel-office 는 같은 파일을 이미 읽지만(`claudeParser.noteUsage`, `codexParser` `token_count`) 지금은 컨텍스트 %(`ctx`) 만 쓴다.

이 작업은 두 가지를 더한다:

1. **사용량 창** — 버튼 하나로 여는 별도 창. 위쪽은 "지금"(오늘 누적, 살아 있는 내 에이전트별 토큰·모델·소모 속도), 아래쪽은 "기록"(기간별 합계, 일별, 프로젝트·모델 비중, 비싼 세션). 사용자는 하루를 돌아볼 때와 작업 중 "지금 너무 쓰나" 확인할 때 **둘 다** 쓴다.
2. **내 에이전트 캐릭터의 신호 5종** — 오피스를 훑어보는 것만으로 비용 상태를 알 수 있게. 정보 하나 = 시각 요소 하나, 서로 눈으로 분명히 구분되게(사용자 요구).

## 사용자가 정한 것

- 사용량 창은 **B안 "지금 + 기록"**(시안 `.superpowers/brainstorm/*/content/usage-layout.html`).
- 캐릭터 신호 5종 모두 한다, **내 에이전트에만**. 다른 사람 정보는 필요 없다(피어로 아무것도 보내지 않음).
- **소모 속도 = 캐릭터 테두리 3단계**: 파랑 → 노랑 → 빨강. 노랑은 **약한 불꽃**, 빨강은 그냥 테두리가 아니라 **삐죽삐죽 타오르는 불꽃 오라**("초사이언 느낌"). 시안 `burn-aura-v4.html`.
- **누적 토큰 = 캐릭터 크기** 1× / 1.5× / 2×. 2× 가 책상·옆자리를 가리는 것은 감수한다.
- 효과들이 눈으로 명확히 구분될 것.

## 목표

### G1 사용량 창

- 진입: 좌상단 버튼 줄(`components/ZoomControls.tsx` / `MenuButtons.tsx`)에 사용량 아이콘 버튼. 데스크톱만, 읽기 전용이면 숨김. 누르면 transcript 와 같은 방식의 popout 창(`/?usage`), 이미 열려 있으면 그 창에 focus.
- **지금 칸**(위, 1 초마다 갱신):
  - 오늘(로컬 자정부터) billable 합계.
  - 살아 있는 내 에이전트 목록(MAIN 아래 SUB/SHELL 들여쓰기 — SHELL 은 토큰이 없으니 생략 가능): 이름(`Claude #1`), 폴더, 모델, 세션 누적, 소모 속도(분당) + 단계 색. 행 클릭 → 그 에이전트의 transcript 창(`openPopout`).
- **기록 칸**(아래):
  - 범위 탭 7일 / 30일 / 전체(기본 7일, 창별 localStorage 기억).
  - KPI: billable 토큰, 캐시 읽기, 캐시 적중률, 세션 수.
  - 일별 막대: billable(입력·출력·캐시 생성 쌓기) 한 차트, 캐시 읽기는 **별도 차트**(규모가 ~100 배 달라 한 축에 두면 billable 이 안 보임). 일 경계 = **로컬 날짜**, **빈 날도 0 으로 칸을 채움**.
  - 프로젝트 Top 8(가로 막대), 모델 비중(100% 가로 누적 막대 + 범례), provider(Claude/Codex) 비중.
  - 비싼 세션 Top 10: 제목 · 폴더 · 날짜 · billable. 클릭 → transcript 창 (끝난 세션 포함, 아래 "끝난 세션의 transcript 열기").
- 차트는 **직접 SVG**(정수 좌표, `shape-rendering: crispEdges`, radius 0, 픽셀 스타일). hover 툴팁은 pixel-panel DOM. 새 차트 라이브러리 없음.

### G2 캐릭터 신호 (내 에이전트에만)

| #   | 정보           | 시각 요소                                                                                                             | 정의                                  |
| --- | -------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| ①   | 세션 누적 토큰 | **캐릭터 크기** 1× / 1.5× / 2× (발 기준) + 이름표 칩 `1.2M` (ctx 칩 옆)                                               | 그 세션 billable 합                   |
| ②   | 모델           | 말풍선 헤더 provider 배지 **색** (Opus 보라 / Sonnet 파랑 / Haiku 초록 / 기타·Codex 는 지금 색) + 배지 글자 `Opus` 등 | 마지막 assistant 호출의 model         |
| ③   | 소모 속도      | **테두리**: 1 단계 파랑 1px 실루엣 / 2 단계 노랑 약불꽃 / 3 단계 빨강 불꽃 오라                                       | 최근 창의 billable / 분               |
| ④   | 서브 합산      | MAIN 이름표 칩에 `Σ4.1M` (자식이 있을 때만)                                                                           | MAIN + 그 세션의 모든 subagent 누적   |
| ⑤   | 큰 툴 결과     | 한 번 떠올라 사라지는 `📦 +82k` (기존 `effects.ts` one-shot 과 같은 방식)                                             | tool_result 본문 ≥ 50k 토큰(글자수/4) |

- ③ 불꽃 모양(시안 v4 기준): 노랑 = 1px 실루엣 테두리에서 금색 혀가 머리 위로 2–4px 낮게 일렁, 불티 1개. 빨강 = 실루엣을 2px 감싸는 오라, 몸 바로 옆은 흰·노랑 심, 바깥 빨강, 머리 위로 최대 ~9px 혀가 기둥마다 따로 일렁, 팔·다리 옆 혀, 불티 여러 개. 프레임은 일정 간격(예: 120ms) — 테두리 있는 캐릭터가 있는 동안 `nextFrameIn` 이 그 간격을 돌려줘야 한다.
- 선택/호버 흰 테두리와 겹치면: 흰 테두리를 몸에 붙이고 소모 속도 테두리/오라는 그 바깥.
- 빨강 불꽃은 실패 표시(빨간 방울·PC 빨간 깜빡임)와 **모양**으로 구분된다(불꽃 오라 vs 방울).
- 접는 경우(대기실 = 캐릭터 없음, 아바타로 합쳐짐): 신호는 표시하지 않는다(사람 캐릭터는 사람). 사용량 창 "지금" 칸에는 나온다.
- 화면 축소(`ACT_ICON_ONLY_BELOW_SCALE` 아래)에서도 크기·테두리는 유지(캔버스 쪽이므로), 이름표 칩은 기존 규칙을 따른다.

## 경계값 (실측 기반, 상수로 조정 가능)

이 PC 최근 14 일 Claude 기록 실측(세션·분 5 458 칸, 세션 381 개, billable 기준):

- 분당 billable: p50 7k, p75 15k, p90 39k, p97 72k, p99 93k.
- 세션 billable 합: p50 127k, p75 235k, p90 396k, p97 791k, p99 1.28M.

그래서(Claude 의 판단):

- ③ 소모 속도: 파랑 ≥ 15k/분, 노랑 ≥ 40k/분, 빨강 ≥ 75k/분. 창은 최근 2 분 평균(1 분은 호출 하나에 튐). 내려갈 때는 바로 내려간다(히스테리시스 없음 — 필요하면 나중에).
- ① 크기: 1× < 300k, 1.5× 300k–1M, 2× ≥ 1M. (처음 제안 1M/5M 은 실측상 거의 안 커져서 낮춤.)
- ⑤ 큰 툴 결과: ≥ 50k 토큰(글자수/4, token-dashboard 와 같은 근사).
- 모두 `webview-ui/src/constants.ts`(화면 쪽) / `server/src/constants.ts`(집계 쪽) 상수.

## 토큰 정의 (어디서나 같게)

token-dashboard 는 화면마다 "tokens" 정의가 달랐다(최근 세션 = 입력+출력, 프로젝트 = +캐시 생성). 여기서는 하나로:

- **billable** = 입력 + 출력 + 캐시 생성. Claude: `input_tokens + output_tokens + cache_creation_input_tokens`. Codex: `input_tokens − cached_input_tokens + output_tokens` (reasoning 은 output 에 포함된 값이면 중복 없이).
- **캐시 읽기** = Claude `cache_read_input_tokens`, Codex `cached_input_tokens`. KPI·별도 차트에만, billable 에 넣지 않는다.
- **캐시 적중률** = 캐시 읽기 / (캐시 읽기 + 입력 + 캐시 생성).
- Claude 중복 제거: 한 응답이 스트리밍 중 2–3 줄로 기록된다 → `message.id` 별 **마지막** 줄만 센다.
- Codex: `token_count` 의 `total_token_usage` 는 세션 누적값 → 직전 값과의 차이를 그 시각에 더한다(줄어들면 리셋으로 보고 새 값 전체).

## 데이터

### 집계기 `server/src/lan/usage.ts` (새 파일)

- 대상: `Scanner` 와 **같은 roots**(`discoverRoots`: Claude projects 루트들, Codex 루트들, 보이는 WSL 배포판 포함). **멈춘 WSL 배포판을 깨우지 않는다**(Scanner 의 roots 를 그대로 받음).
- 전체 기록을 **증분** 스캔: 파일별 `{size, mtime, offset}` 기억, 끝에 줄바꿈 없는 조각은 다음에 다시 읽음. 시작 시 1 회 + 주기(예: 10 분) + 살아 있는 세션 파일은 매 스냅샷 주기에 이어 읽기(①③ 가 서버 재시작 뒤에도 맞아야 함 — Scanner 는 `TAIL_BYTES` 만 읽으므로 그 값으로 세면 안 됨).
- 첫 스캔은 무거울 수 있다(수십 MB): 이벤트 루프를 막지 않게 파일 단위로 쪼개 양보(예: 파일마다 `setImmediate`).
- 저장: `~/.pixel-office/usage.json`(atomic tmp+rename) — **집계만**: 파일별 offset·세션 키, 세션별 `{provider, folder, title?, model, firstTs, lastTs, billable, cacheRead, input, output, cacheCreate}`, 일×프로젝트×모델 버킷. 프롬프트 원문·도구 입력·결과 본문은 **저장하지 않는다**. 세션 제목은 `Scanner.info` 와 같은 규칙(custom-title > ai-title > 첫 프롬프트 잘라낸 것)이 이미 로컬 화면에 나오는 정보라 저장해도 되지만, 길이 제한(`VIEW_TITLE_MAX`) 적용.
- 파일 형식이 바뀌면(버전 필드) 버리고 다시 스캔.
- 실시간 값(③ 소모 속도, ⑤ 큰 툴 결과)은 `SessionState.local` 쪽 — 이어 읽는 줄에서 계산. ⑤는 Scanner 가 이미 tool_result 를 보므로 거기서 한 번 표시(`local.bigResult {tokens, at}`).

### 전달

- 캐릭터 신호: `toViews` 의 `!brief` 분기(지금 `ctx`, `title` 과 같은 자리)에 선택 필드 추가 — 예 `AgentView.usage {tokens, rate, model?, sumTokens?, big?}`. `redactView`/`quietView` 가 지우고 `parseView` 는 읽지 않는다. 즉 **피어로는 절대 안 나감**.
- 사용량 창: 새 메시지 `openUsage {range}`(privileged) → `usageLoaded {...}` 를 **요청한 소켓에만**. "지금" 칸은 1 초 스냅샷(내 에이전트 `usage` 필드)으로 그린다. 창은 transcript popout 처럼 자기 loopback 소켓(`/ws/usage` 또는 `/ws/transcript` 확장 — 구현자 판단)을 쓰고 페이지의 `/ws` 를 대체하지 않는다.
- asyncapi: `core/asyncapi.yaml` 수정 → `npm run asyncapi:generate`, `additionalProperties: false`.

## 리뷰 후 정한 것 (Claude 의 판단)

- **서브에이전트 기록**(`<session>/subagents/agent-*.jsonl`): 기록 칸에서는 부모 세션에 합친다. 세션 수, 비싼 세션 Top 10, 프로젝트·모델 비중 모두 "MAIN + 자식" 한 세션으로 센다. 집계기는 파일별 합도 따로 갖고 있어서 ④ `Σ` 는 그 합으로 계산한다.
- **캐릭터별 신호**:
  - SUB 캐릭터도 ①②③ 을 **자기 기록**으로 받는다. 그래서 무거운 SUB 가 가벼운 MAIN 보다 클 수 있다.
  - MAIN 의 ①③ 은 자기 파일만 센다. 자식까지 합친 값은 ④ `Σ` 뿐이다.
  - SHELL 은 토큰이 없어서 1× 로, 테두리 없이 그린다.
  - 실측 경계값은 서브에이전트 파일도 포함해서 잰 값이다.
- **지운 기록 파일**: Claude Code 는 오래된 기록을 지운다(기본 30 일). 그래도 `usage.json` 의 일별 버킷과 세션 요약은 **남긴다**. "전체" = 설치 후 전부.
  - 그래서 `usage.json` 은 단순 캐시가 아니라 기록의 원본이다. 형식이 바뀌면 버리지 말고 코드로 옮긴다(migrate). 지울 수 있는 것은 파일별 offset 뿐이다.
  - 사라진 파일의 offset 항목은 정리하고, 버킷은 그대로 둔다.
- **지금 칸의 오늘 합계**: 사용량 창 소켓은 1 초 tick 마다 작은 `usageNow {today}` 를 받는다. 에이전트별 값은 같은 tick 의 스냅샷 `usage` 필드에서 읽는다. 기록 칸은 `openUsage` 를 보냈을 때와 범위를 바꿨을 때만 받는다. 열려 있는 동안은 주기 스캔 뒤에 서버가 한 번 다시 보낸다.
- **끝난 세션의 transcript 열기**(사용자 결정: 열리게): 비싼 세션 Top 10 의 모든 행을 클릭할 수 있다. 행이 가리키는 기록 파일이 아직 있으면 transcript 창이 열린다.
  - 클라이언트는 **세션 키만** 보낸다. 경로는 절대 보내지 않는다. 서버가 집계기의 파일 목록에서 키를 파일로 바꾼다. 집계기가 모르는 키는 거부한다.
  - 기존 `openTranscript {id}` 와 `TranscriptService` 를 그대로 쓴다. 다만 id 공간을 넓힌다. 예: `usage:<sessionKey>` → `UsageIndex.fileOf(key)` → `TranscriptSource`.
  - 내용 규칙은 지금과 같다. 요청한 소켓에만 보내고, 경로는 보내지 않는다.
  - 파일이 지워졌으면 `transcriptError`, 그리고 창에 "기록 파일이 삭제됨" 을 띄운다.
  - 살아 있는 세션이면 지금처럼 그 에이전트의 창이 열린다. 같은 창을 두 개 띄우지 않는다.
  - 서브에이전트가 합쳐진 세션은 MAIN 기록을 연다.
- **프로젝트** = cwd 의 basename(기존 `folderOf`). worktree 는 따로 센다. WSL 과 Windows 에 같은 이름의 폴더가 있으면 합쳐진다.
- **중복 제거**: 같은 파일이 두 root 로 보이는 경우가 있다. 파일 경로가 아니라 **세션 id**(Claude `sessionId` / 파일명, Codex rollout id)로 한 번만 센다.

## 반목표 / 절대 안 되는 것

- 사용량·모델·소모 속도·큰 결과 어떤 것도 `PeerPacket`/presence/relay 로 나가지 않는다.
- 금액($) 환산 없음(단가표 유지보수, Max 구독자에겐 무의미).
- 새 런타임 의존성 없음(SQLite·ECharts 금지 — `node:sqlite` 는 Node 22 에서 experimental).
- 프롬프트 원문 저장 없음.
- CSS/canvas `filter` 금지(`theme.test`). 불꽃·테두리는 픽셀로 직접 그린다.
- 새 `act` 값 없음.

## 비목표 (이번에 안 함)

- Skills 탭, 팁 엔진(반복 Read·큰 결과 경고 규칙) — 나중에 OS 알림으로.
- 팀/공개 오피스에 사용량 공유.
- 요금제 설정.

## 구현자에게 남긴 것

- 크기 1.5× 렌더: `getCachedSprite(sprite, round(zoom × 1.5))` 처럼 정수 배율 캐시를 쓰면 픽셀이 고르다 — 방법은 구현자 판단. 크기에 맞춰 이름표·말풍선 위치(머리 높이)도 올라가야 함. hit-test 도 커진 크기로.
- 불꽃 프레임 생성(실루엣 마스크 → 테두리/오라 → 혀 높이 = f(열, 프레임)): 시안 코드를 참고, 스프라이트·단계·프레임별 캐시.
- 라이트 테마에서 테두리·불꽃 색(캐릭터는 테마 변환을 안 받으므로 그대로 둬도 됨).
- 사용량 창의 i18n 키, 빈 상태(기록 없음), 첫 스캔 중 표시.
- Codex 모델 이름 위치(rollout `turn_context.model` 등) 확인.
- 테스트: 집계 순수 함수(중복 제거, Codex 차이 계산, 로컬 날짜 버킷, 빈 날 채움), `redactView` 가 새 필드를 지움, 단계 계산, 큰 결과 트리거.
