# Token Usage (usage window + 5 character signals) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track Claude/Codex token usage on this PC. Show it in a 📊 popout window ("now" + history), and as five signals on my own agent characters: size, model badge colour, burn border/flame, Σ, and 📦.

**Architecture:** A new server `UsageIndex` (`server/src/lan/usage.ts`) incrementally reads every transcript under the Scanner's roots. It folds usage lines (pure `usageLine.ts`) into per-file stats and per-day buckets, persisted in `~/.pixel-office/usage.json`. `Scanner.views(brief=false)` attaches `AgentView.usage` from it: local only, stripped by `redactView`/`quietView`, never parsed from peers. The usage window is a popout (`/?usage`) on the existing `/ws/transcript` socket: `openUsage` → `usageLoaded`, plus a per-tick `usageNow`. Finished sessions open through `openTranscript {id: 'usage:<key>'}`. The webview draws size, aura and chips from `usage` for my agents only.

**Tech Stack:** TypeScript, Node 22 stdlib, Fastify WS, React 19, Canvas 2D, vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-12-token-usage-design.md`

## Global Constraints

- **Never on the wire.** No usage/model/rate/big-result data goes into `PeerPacket`, presence or relay. `redactView` and `quietView` strip `usage`. `parseView` never reads it.
- **No new runtime dependencies.** No SQLite, no chart library. No CSS/canvas `filter` (`test/theme.test.ts`).
- **Protocol.** Edit `core/asyncapi.yaml`, then run `npm run asyncapi:generate`. Every message has `additionalProperties: false`. New client messages are privileged by default (the gate in `handleClientMessage`).
- **Token definitions** (spec "토큰 정의"):
  - billable = Claude `input_tokens + output_tokens + cache_creation_input_tokens`; Codex `input_tokens − cached_input_tokens + output_tokens`.
  - cacheRead = Claude `cache_read_input_tokens`; Codex `cached_input_tokens`.
  - Cache hit rate = cacheRead / (cacheRead + input + cacheCreate).
  - Claude: the last line per `message.id` wins.
  - Codex: `total_token_usage` delta; if it shrank, take the new total.
- **Thresholds** (constants):
  - Burn rate per minute: blue ≥ 15 000, yellow ≥ 40 000, red ≥ 75 000, averaged over 120 000 ms.
  - Size: 1× < 300 000, 1.5× 300 000–999 999, 2× ≥ 1 000 000.
  - Big result: ≥ 50 000 tokens (chars / 4).
- **My agents only.** Signals apply when `OfficeAgent.peer.peerId === selfPeerId`. Folded lounge agents show none.
- **Stored data.** No prompt text, tool input or result bodies are stored. The title is clipped to `VIEW_TITLE_MAX` (60).
- **Days and folders.** Day buckets use the server's local date; empty days are zero-filled. Project = `folderOf(cwd)`.
- **Session key.** Claude main = the jsonl basename, subagent → its parent dir name. Codex = `session_meta.payload.id`, child → `parent_thread_id`. Dedupe across roots is by session key plus per-file identity `(key, basename)`, never by path.
- **History.** `usage.json` is the history's source of truth. Never discard it on a format change: migrate. Offsets of vanished files are pruned; buckets are kept.
- **Constants and copy.** Server constants go in `server/src/constants.ts`, webview constants and colours in `webview-ui/src/constants.ts`. User text goes through `i18n.ts` (ko + en).

## Review Focus

1. **First scan of a huge history** (hundreds of MB) must not freeze the office. Yield per file (`setImmediate`). The window shows "스캔 중" (`scanning: true`) until done. Test in Task 3.
2. **A line half-written at EOF** must be re-read once complete, never counted twice or dropped. Test in Task 3.
3. **A Claude streaming snapshot arriving in a later read than its first copy** (same `message.id`, bigger usage) replaces the earlier tally rather than adding to it. Test in Task 2.
4. **`openTranscript` with `usage:<key>` for an unknown key or a deleted file** answers `transcriptError`. It never opens a client-chosen path. Test in Task 5.
5. **A peer's view carrying `usage`**: dropped by `parseView`. My view leaving through `redactView`/`quietView` has no `usage`. Test in Task 1.

---

### Task 1: Protocol + redaction

**Files:**

- Modify: `core/asyncapi.yaml`, `core/src/messages.ts` (generated), `core/src/lan.ts` (AgentView), `server/src/lan/redact.ts`
- Test: `server/__tests__/lan/redact.test.ts` (existing file — add cases), `core` parse test where `parseView` is tested (`grep -rn "parseView" server/__tests__ | head -1`)

**Interfaces:**

- Produces, in `core/src/lan.ts`:
  ```ts
  export interface AgentUsage {
    tokens: number; // this file's billable total
    rate: number; // billable per minute, last USAGE_RATE_WINDOW_MS
    model?: string; // last assistant model id (e.g. 'claude-opus-4-7', 'gpt-5-codex')
    sum?: number; // main only, when it has children: own + all children billable
    big?: { n: number; last: number }; // count of results ≥ threshold so far, size of the last
  }
  // AgentView gains:  usage?: AgentUsage;   (THIS PC's browser only)
  ```
- Produces messages (asyncapi):
  - Client → server: `openUsage {range: '7d'|'30d'|'all'}`.
  - Server → client: `usageNow {today: number, scanning: boolean}`.
  - Server → client: `usageLoaded {range, scanning, totals, days, projects, models, providers, top}`, where:
    - `totals {billable, input, output, cacheCreate, cacheRead, sessions}`
    - `days [{day:'YYYY-MM-DD', input, output, cacheCreate, cacheRead}]`
    - `projects [{name, billable}]` (≤ 8)
    - `models [{model, billable}]`
    - `providers [{provider, billable}]`
    - `top [{key, provider, title, folder, lastTs, billable, exists: boolean}]` (≤ 10)

- [ ] **Step 1: Write failing tests.**
  - `redactView({...view, usage:{tokens:1,rate:2}})` has no `usage`.
  - Same for `quietView`.
  - `parseView({...valid, usage:{tokens:5,rate:0}})` returns a view without `usage`.
- [ ] **Step 2:** Run `npm run test:server -- redact`. Expected: FAIL (`usage` kept).
- [ ] **Step 3: Implement.**
  - Add `AgentUsage` and `AgentView.usage` to asyncapi (description: "THIS PC's browser only; never sent to peers") and to the three messages above.
  - Run `npm run asyncapi:generate`.
  - Add `usage: _u` to both destructures in `redact.ts:89` and `:96`.
  - `parseView` already whitelists fields: confirm and leave it.
- [ ] **Step 4:** Run `npm run asyncapi:validate && npm run test:server -- redact && npm run check-types`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(usage): protocol for local token usage`.

### Task 2: Usage line parsing (pure)

**Files:**

- Create: `server/src/lan/usageLine.ts`
- Test: `server/__tests__/lan/usageLine.test.ts`

**Interfaces:**

- Produces:
  ```ts
  export interface Tally {
    input: number;
    output: number;
    cacheCreate: number;
    cacheRead: number;
  }
  export const billable = (t: Tally) => t.input + t.output + t.cacheCreate;
  export interface FileFold {
    // per-file running state, JSON-serialisable
    provider: Provider;
    byMsg: Record<string, { ts: number; model: string; t: Tally }>; // Claude: message.id → last; pruned of entries older than the rate window except their totals (see below)
    total: Tally; // sum of finalised + current byMsg
    codexLast?: Tally; // Codex: last cumulative total
    model: string;
    cwd: string;
    title: string; // custom-title > ai-title > first prompt (clipped 60)
    firstTs: number;
    lastTs: number;
    big: { n: number; last: number };
    recent: Array<[ts: number, billable: number]>; // for rate; ≤ window
  }
  export function newFold(provider: Provider): FileFold;
  /** Applies one JSONL line; returns the per-day delta it produced (for buckets), or null. */
  export function foldLine(
    f: FileFold,
    line: string,
    now: number,
  ): { ts: number; model: string; d: Tally } | null;
  export function rateOf(f: FileFold, now: number): number; // per minute over USAGE_RATE_WINDOW_MS
  ```
- A Claude `message.id` line seen again replaces its prior tally: `d` = new − old, which may be negative per field. Buckets add `d` as given.
- `ts` = the line's `timestamp` (ISO), else `now`.
- Codex model comes from `turn_context.payload.model`. Codex tally comes from `event_msg` `token_count` `info.total_token_usage {input_tokens, cached_input_tokens, output_tokens}`.
- Big result: Claude `user` content `tool_result` blocks, text length / 4 ≥ `USAGE_BIG_RESULT_TOKENS`. Codex: `function_call_output` output length / 4.

- [ ] **Step 1: Write failing tests** (fixtures inline):
  - Two Claude lines with the same `message.id` (usage 100/10 then 100/50) give `total.output === 50`. The second `foldLine` returns `d.output === 40`.
  - Claude cache fields map to `cacheCreate`/`cacheRead`. `billable` excludes `cacheRead`.
  - Codex `token_count` totals 1000 then 1500 (cached 200 then 300): deltas `input` 800 then 400. Totals shrink to 100 → delta = full 100 (reset).
  - `model` = last assistant `message.model`; Codex from `turn_context`.
  - `tool_result` of 200 004 chars → `big {n:1,last:50001}`. 100 chars → unchanged.
  - `rateOf`: billable 30 000 at now−30 s and 30 000 at now−150 s, window 120 s → `15000`.
  - A non-JSON line → returns null, fold unchanged.
  - `title`: a `custom-title` line beats `ai-title`; clipped to 60 code points.
- [ ] **Step 2:** Run `npm run test:server -- usageLine`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** in `usageLine.ts`.
  - Constants: `USAGE_RATE_WINDOW_MS = 120_000`, `USAGE_BIG_RESULT_TOKENS = 50_000`, `USAGE_CHARS_PER_TOKEN = 4` in `server/src/constants.ts`.
  - `byMsg` keeps only ids whose `ts` is within the rate window. Older ones are already in `total`.
  - Claude snapshots of one message arrive seconds apart, so keep the last `USAGE_MSG_KEEP` = 64 ids regardless of age.
- [ ] **Step 4:** Run `npm run test:server -- usageLine`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(usage): fold Claude/Codex usage lines`.

### Task 3: UsageIndex (incremental scan, buckets, persistence)

**Files:**

- Create: `server/src/lan/usage.ts`
- Modify: `server/src/constants.ts` (`USAGE_FILE = 'usage.json'`, `USAGE_RESCAN_MS = 600_000`, `USAGE_VERSION = 1`, `USAGE_SAVE_DELAY_MS = 5_000`)
- Test: `server/__tests__/lan/usage.test.ts`

**Interfaces:**

- Consumes: `FileFold`, `newFold`, `foldLine`, `rateOf`, `billable` (Task 2); `Roots` (`./roots.js`); `folderOf` (`./session.js`).
- Produces:
  ```ts
  export type UsageRange = '7d' | '30d' | 'all';
  export interface FileUsage {
    tokens: number;
    rate: number;
    model: string;
    big: { n: number; last: number };
  }
  export class UsageIndex {
    constructor(opts: { dir: string; roots: () => Roots; now?: () => number });
    load(): void; // reads usage.json (migrates by version)
    scanAll(): Promise<void>; // every *.jsonl under roots (Claude projects/*/*.jsonl + */subagents/*.jsonl, Codex YYYY/MM/DD/*.jsonl), yields per file
    refresh(files: string[]): Promise<void>; // read appended bytes of these files only (live ones, every tick)
    fileUsage(file: string): FileUsage | undefined;
    sumOf(sessionKey: string): number; // all files of that session key
    keyOf(file: string): string | undefined;
    fileOf(key: string): { file: string; provider: Provider } | undefined; // main file of the session, only if it exists on disk now
    today(): number; // billable since local midnight
    report(range: UsageRange): Omit<UsageLoaded, 'type'>; // the usageLoaded body
    get scanning(): boolean;
    onChanged?: () => void; // after a scanAll that added anything
  }
  ```
- Stored JSON: `{version, files: {[path]: {size, mtimeMs, offset, key, fold}}, sessions: {[key]: {provider, folder, title, model, firstTs, lastTs, tally: Tally, mainFile?}}, days: {[YYYY-MM-DD]: {[folder]: {[model]: {[provider]: Tally}}}}}`. Written atomically: tmp + rename, coalesced by `USAGE_SAVE_DELAY_MS`.
- File identity across roots: when a second path reaches a `(key, basename)` already tracked under another path, it is skipped.

- [ ] **Step 1: Write failing tests** (temp dir with fake `~/.claude/projects/p/<uuid>.jsonl` and `<uuid>/subagents/agent-a.jsonl`):
  - `scanAll` → `report('all').totals.billable` = main + subagent. `totals.sessions === 1`. `top[0].key === <uuid>`.
  - Append half a line (no `\n`), `refresh`: tally unchanged. Complete the line, `refresh`: added once.
  - Days: lines on two dates with a gap day → `days` contains the gap with zeros. `report('7d')` covers exactly the last 7 local dates, today included.
  - Same file copied to a second root → counted once.
  - `load` after `scanAll` in a new instance → same `report`, and `refresh` reads nothing more.
  - Delete the jsonl, `scanAll` again → `report` totals unchanged, `fileOf(key) === undefined`, `top[0].exists === false`.
  - `usage.json` with `version: 0` (no `sessions`) → `load` migrates without throwing and rescans files.
  - `scanning` is true during `scanAll` (check inside a root reader stub) and false after.
- [ ] **Step 2:** Run `npm run test:server -- usage.test`. Expected: FAIL.
- [ ] **Step 3: Implement `UsageIndex`.**
  - Read from `offset` to `size`, whole lines only. Keep the remainder by not advancing `offset` past the last `\n`.
  - A shrunk file (size < offset) = rewritten: re-fold from 0. Subtract its old fold from buckets first.
  - `report` resolves `exists` via `fs.existsSync`.
- [ ] **Step 4:** Run `npm run test:server -- usage.test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(usage): incremental usage index with persisted history`.

### Task 4: Live signals on my views

**Files:**

- Modify: `server/src/lan/scanner.ts` (`rootsNow()`, `liveFiles()`, usage attach in `views()`), `server/src/cli.ts` (create, load, scan, refresh each tick, rescan timer)
- Test: `server/__tests__/lan/scanner.test.ts` (add cases)

**Interfaces:**

- Consumes: `UsageIndex.fileUsage`, `sumOf`, `keyOf` (Task 3).
- Produces:
  - `Scanner.rootsNow(): Roots`.
  - `Scanner.liveFiles(): string[]` (tracked files).
  - `Scanner.usage?: Pick<UsageIndex, 'fileUsage' | 'sumOf' | 'keyOf'>`.
  - `views(false)` sets `v.usage = {tokens, rate, model?, big?}` on main/subagent views (not shells). It adds `sum` on a main when any tracked subagent has `parentId === s.id`. `views(true)` never sets it.

- [ ] **Step 1: Write failing tests.**
  - With a stub `usage` returning `{tokens:500_000, rate:20_000, model:'claude-opus-4-7', big:{n:0,last:0}}`: `views()` main has those values; a shell view has no `usage`.
  - `views(true)` has no `usage`.
  - A main with a child: `usage.sum === stub.sumOf(key)`.
- [ ] **Step 2:** Run `npm run test:server -- scanner`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - In `cli.ts`, after the Scanner:
    ```ts
    const usage = new UsageIndex({ dir: DATA_DIR, roots: () => scanner.rootsNow() });
    usage.load();
    scanner.usage = usage;
    ```
  - `void usage.scanAll()` once after the first discover cycle. Then every `USAGE_RESCAN_MS`.
  - In the existing `SNAPSHOT_INTERVAL_MS` tick: `await usage.refresh(scanner.liveFiles())`, then `usage.save()` (coalesced).
  - Never touch roots the Scanner does not list. This keeps stopped WSL distros asleep.
- [ ] **Step 4:** Run `npm run test:server -- scanner && npm run check-types`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(usage): attach live usage to my agent views`.

### Task 5: Usage socket messages + finished-session transcripts

**Files:**

- Modify: `server/src/clientMessageHandler.ts` (`handleTranscriptMessage` also handles `openUsage`), `server/src/httpServer.ts` (popout tick sends `usageNow`; options gain `usage?: UsageIndex`), `server/src/cli.ts` (combined transcript source)
- Test: `server/__tests__/httpServer.test.ts` or the existing transcript socket test (`grep -rln "ws/transcript" server/__tests__`)

**Interfaces:**

- Consumes: `UsageIndex.report`, `today`, `scanning`, `fileOf` (Task 3); `TranscriptService` source `{transcriptOf(id)}`.
- Produces:
  - `openUsage {range}` on `/ws/transcript` → `usageLoaded` to that socket. The socket remembers its range. On `usage.onChanged` the server re-sends `usageLoaded` to every popout that opened usage.
  - Each snapshot tick sends `usageNow {today, scanning}` to those sockets.
  - Transcript source:
    ```ts
    transcriptOf(id) = id.startsWith('usage:')
      ? usageSource(id.slice(6))
      : scanner.transcriptOf(id);
    ```
    `usageSource(key)` uses `usage.fileOf(key)` → `{file, provider, kind:'main', num:0, title, folder}`. Unknown key → `undefined` → the existing `transcriptError`.

- [ ] **Step 1: Write failing tests.**
  - Open `/ws/transcript`, send `{type:'openUsage', range:'7d'}` → receives `usageLoaded` with `range:'7d'`.
  - The next tick → `usageNow`.
  - `openTranscript {id:'usage:nope'}` → `transcriptError`.
  - `openTranscript {id:'usage:../../etc/passwd'}` → `transcriptError` (key lookup only).
  - A known key → `transcriptLoaded`.
- [ ] **Step 2:** Run `npm run test:server -- <that test file>`. Expected: FAIL.
- [ ] **Step 3: Implement** as described. Validate `range` against the three values; else ignore.
- [ ] **Step 4:** Run the same test plus `npm run build && npm run test:server`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(usage): usage window messages and finished-session transcripts`.

### Task 6: Webview signal model (pure)

**Files:**

- Create: `webview-ui/src/lan/usageSignals.ts`
- Modify: `webview-ui/src/constants.ts`, `webview-ui/src/i18n.ts`
- Test: `webview-ui/test/usageSignals.test.ts`

**Interfaces:**

- Produces:
  ```ts
  export type SizeTier = 1 | 1.5 | 2;
  export type BurnTier = 0 | 1 | 2 | 3; // none / blue / yellow / red
  export function sizeTier(u?: AgentUsage): SizeTier; // USAGE_SIZE_TIERS = [300_000, 1_000_000]
  export function burnTier(u?: AgentUsage): BurnTier; // USAGE_BURN_TIERS = [15_000, 40_000, 75_000]
  export function tokensText(n: number): string; // 999 → '999', 1_234 → '1.2k', 1_250_000 → '1.3M'
  export type ModelFamily = 'opus' | 'sonnet' | 'haiku' | null;
  export function modelFamily(model?: string): ModelFamily; // substring match, lower-case
  export function modelLabel(model?: string): string; // 'Opus' | 'Sonnet' | 'Haiku' | ''
  export function bigTrigger(prev?: AgentUsage, next?: AgentUsage): number | null; // tokens of a new big result, else null
  ```
- Constants: `USAGE_MODEL_COLORS = {opus:'#7c5cff', sonnet:'#4a9eff', haiku:'#3fb68b'}`, `USAGE_BURN_COLORS = {1:'#4aa8ff'}`, `USAGE_FLAME_GOLD = ['#c08a10','#e8b020','#ffd23a','#ffe88a','#fffbe0']`, `USAGE_FLAME_FIRE = ['#c8101a','#ff3b1a','#ff8a1a','#ffd23a','#fff6c0']`.

- [ ] **Step 1: Write failing tests.**
  - `sizeTier` at 299_999 / 300_000 / 999_999 / 1_000_000 → 1 / 1.5 / 1.5 / 2.
  - `burnTier` at 14_999 / 15_000 / 40_000 / 75_000 → 0 / 1 / 2 / 3.
  - `tokensText` cases as above.
  - `modelFamily('claude-opus-4-7') === 'opus'`, `'gpt-5-codex'` → null.
  - `bigTrigger({…big:{n:1,last:60000}}, {…big:{n:2,last:82000}}) === 82000`. Same `n` → null. `prev` undefined → null (baseline).
- [ ] **Step 2:** Run `npm run test:webview -- usageSignals`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run `npm run test:webview -- usageSignals`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(usage): signal tiers and formatting`.

### Task 7: Character size + burn border/flame aura

**Files:**

- Create: `webview-ui/src/office/engine/burnAura.ts`
- Modify: `webview-ui/src/office/types.ts` (`Character.usageScale?: SizeTier`, `Character.burn?: BurnTier`), `webview-ui/src/lan/lanAgents.ts` (`reconcile`: set both for `isMine` agents, clear otherwise), `webview-ui/src/office/engine/renderer.ts` (character draw ~L520-590), `webview-ui/src/office/engine/officeState.ts` (`nextFrameIn`, `getCharacterAt`)
- Test: `webview-ui/test/burnAura.test.ts`; add to `test/renderScheduler.test.ts`, `test/lanAgents.test.ts`

**Interfaces:**

- Consumes: `sizeTier`, `burnTier`, colour constants (Task 6).
- Produces:
  ```ts
  export const BURN_FRAME_SEC = 0.12;
  export const BURN_FRAMES = 8;
  /** Sprite-pixel canvas of the border/aura for this silhouette, frame and tier (tier 1: frame ignored).
   *  Origin = sprite origin shifted by `pad` (returned) so it can be drawn behind the character. */
  export function burnAuraSprite(
    sprite: SpriteData,
    tier: 1 | 2 | 3,
    frame: number,
  ): { data: SpriteData; pad: number };
  ```
- Algorithm (fixed by the approved mockup `burn-aura-v4.html`):
  - Tier 1: 1-px 4-neighbour ring of the silhouette, blue.
  - Tier 2 (k = 0.4): the ring plus, per column, a tongue up from that column's top ring pixel:
    - height `max(1, round(k·(9 − 1.3·|x − cx|) + 2.2k·sin(t·1.9 + x·2.1) + 1.3·sin(t·3.7 + x·0.7)))`;
    - colours `FLAME_GOLD` by height fraction (>0.8 [0], >0.5 [1], >0.25 [2], else [3]);
    - one spark.
  - Tier 3 (k = 1): the silhouette grown by 2 (Manhattan ≤ 2), inner ring `FIRE[2]`, outer `FIRE[1]`, the same tongues in `FIRE` colours, side licks, a white-hot core `FIRE[4]` on ring pixels where `sin(t·5 + 3x + 2y) > 0.2`, four sparks.
  - `t = frame · 0.9`. Deterministic (no `Math.random`). Cached per (sprite, tier, frame).
- Renderer:
  - Draw the character with `getCachedSprite(sprite, round(zoom · usageScale))`, anchored bottom-centre as now.
  - Draw the aura (same scaled zoom) as a drawable at `charZY − OUTLINE_Z_SORT_OFFSET − 0.001`, so the white selection outline, which hugs the body, sits above it.
  - Frame index = `floor(nowSec / BURN_FRAME_SEC) % BURN_FRAMES`.
- `nextFrameIn`: when any character has `burn ≥ 2`, return at most the time to the next `BURN_FRAME_SEC` boundary.
- `getCharacterAt`: multiply hit width/height by `usageScale`.
- Name tag and bubble anchor: wherever the head height is taken (`CHARACTER_HIT_HEIGHT` / sprite height in `LanOverlay`), multiply by `usageScale`.

- [ ] **Step 1: Write failing tests.**
  - `burnAuraSprite` tier 1 on an 8×10 block silhouette: ring pixel count = 2·(8+10) = 36 (4-neighbour ring, no corners). No pixel overlaps the body.
  - Tier 3 is taller than tier 2, which is taller than tier 1 (highest non-empty row).
  - Same args twice → identical arrays. Frames 0 and 1 of tier 3 differ.
  - `renderScheduler`: a seated idle character with `burn: 2` → `nextFrameIn(now) ≤ BURN_FRAME_SEC`. With `burn: 1` → `Infinity`.
  - `lanAgents`: my agent with `usage {tokens:1_200_000, rate:80_000}` → character `usageScale 2`, `burn 3`. A peer's agent with the same → unset.
  - `getCharacterAt` hits a point 1.5× above a scaled character's feet that misses at 1×.
- [ ] **Step 2:** Run `npm run test:webview -- burnAura renderScheduler lanAgents`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run the same command, then `npm run test:webview`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(usage): character size and burn aura`.

### Task 8: Chips, model badge, 📦 effect

**Files:**

- Modify: `webview-ui/src/lan/LanOverlay.tsx` (tag chip after `CtxChip` ~L407; bubble badge ~L126; hover bubble), `webview-ui/src/lan/agentBubble.ts` (header width with the model label), `webview-ui/src/lan/effects.ts` (`EffectKind` + `'box'`), `webview-ui/src/index.css` (`.fx-box` keyframes, reuse `.fx-plus` timing), `webview-ui/src/lan/SignalText.tsx` (hover/room-card text: tokens, Σ, model, rate)
- Test: `webview-ui/test/effects.test.ts`, `webview-ui/test/agentBubble.test.ts`

**Interfaces:**

- Consumes: `tokensText`, `modelFamily`, `modelLabel`, `bigTrigger`, `USAGE_MODEL_COLORS` (Task 6).
- Produces:
  - Tag chip `data-usage-tokens`: text `1.2M`, or `3.4M · Σ4.1M` when `usage.sum` is set.
  - Bubble provider badge: background `USAGE_MODEL_COLORS[family]` and text `modelLabel` when the family is known, else today's `LAN_PROVIDER_COLORS`/`providerName`.
  - `effectTriggers` emits `{kind:'box', text:'📦 +82k'}` when `bigTrigger(p.usage, a.usage)` is non-null.

- [ ] **Step 1: Write failing tests.**
  - `effectTriggers(prev with big.n 1, next with big.n 2 last 82_000)` includes `{kind:'box', text:'📦 +82k'}`.
  - A newcomer (not in `prev`) emits none.
  - `agentBubbleLayout` with model label 'Sonnet' reserves badge width ≥ the label's width (use the existing width-measure stub in that test).
- [ ] **Step 2:** Run `npm run test:webview -- effects agentBubble`. Expected: FAIL.
- [ ] **Step 3: Implement.** i18n keys `usage.sum` ("합계"/"total") and `usage.rate` ("{n}/분"/"{n}/min") for `SignalText`.
- [ ] **Step 4:** Run `npm run test:webview && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(usage): token chips, model badge colour, big-result effect`.

### Task 9: Usage window

**Files:**

- Create: `webview-ui/src/lan/UsageWindow.tsx`, `webview-ui/src/lan/usageCharts.ts` (pure layout), `webview-ui/src/lan/UsageCharts.tsx` (SVG)
- Modify: `webview-ui/src/main.tsx` (`?usage` → `<UsageWindow/>`), `webview-ui/src/transport/index.ts` (`?usage` also uses `/ws/transcript`), `webview-ui/src/lan/transcriptWindows.ts` (`openUsageWindow()`: `window.open('?usage', 'po-usage', popup …)`), `webview-ui/src/components/MenuButtons.tsx` (📊 bar-chart SVG icon button, `data-tour="usage-button"`, desktop only, not read-only), `webview-ui/src/i18n.ts`, `webview-ui/src/constants.ts` (`USAGE_WINDOW_W_PX = 720`, `USAGE_WINDOW_H_PX = 820`, `USAGE_TOKEN_COLORS {input, output, cacheCreate, cacheRead}` per theme via CSS variables `--usage-*` in `index.css`)
- Test: `webview-ui/test/usageCharts.test.ts`

**Interfaces:**

- Consumes: `usageLoaded`, `usageNow`, `officeSnapshot` (`agents` with `usage`, `selfPeerId`); `openPopout(id)`; `tokensText`, `burnTier`, `modelLabel` (Task 6).
- Produces (pure):
  ```ts
  export interface Bar {
    x: number;
    w: number;
    segs: Array<{ y: number; h: number; key: string }>;
  }
  export function stackedBars(
    days: UsageDay[],
    keys: Array<keyof Tally>,
    width: number,
    height: number,
  ): { bars: Bar[]; max: number };
  export function hbars(
    rows: Array<{ name: string; value: number }>,
    width: number,
  ): Array<{ name: string; w: number; value: number }>;
  export function shareBar(
    rows: Array<{ name: string; value: number }>,
    width: number,
  ): Array<{ name: string; x: number; w: number; pct: number }>;
  ```
  All coordinates are integers, widths sum exactly to `width` (the last segment takes the rounding rest).
- Layout (approved mockup B):
  - **Now panel** (top, green border): `오늘 {today}` with `scanning` → "기록 스캔 중…".
  - One row per my live agent from the latest snapshot (`peer.peerId === selfPeerId`, not shells), children indented under their main. Each row: burn colour dot, `Claude #1`, folder (from `title`'s session — use the agent's `title`), `modelLabel`, `tokensText(tokens)`, `tokensText(rate)/분`.
  - Row click → `openPopout(a.id)`.
  - **History** (below):
    - Range tabs 7일/30일/전체 (localStorage `pixel-office.usage.range`, default `7d`).
    - KPI row: billable, cache read, hit rate %, sessions.
    - Daily stacked bars (input/output/cacheCreate). A separate cache-read bar chart.
    - Projects hbars. Model share bar. Provider share bar.
    - Top 10 list (title or folder, date, billable). Click → `openPopout(\`usage:${key}\`)`; rows with `exists: false` are muted with the title attribute "기록 파일이 삭제됨".
  - Hover on a day bar → pixel-panel tooltip with that day's four values.
  - Pixel style: radius 0, 2px borders, `shape-rendering="crispEdges"`, Pretendard.
  - The window re-sends `openUsage` on range change and on reconnect.

- [ ] **Step 1: Write failing tests.**
  - `stackedBars` with 7 days, one all-zero → 7 bars, the zero one has no segs. Tallest bar height === `height`. Every `y`/`h`/`x`/`w` is an integer.
  - `shareBar([{a,3},{b,1}], 101)` → widths 76 + 25 = 101.
  - `hbars` max row `w === width`.
- [ ] **Step 2:** Run `npm run test:webview -- usageCharts`. Expected: FAIL.
- [ ] **Step 3: Implement** the pure functions, then the components and the wiring.
- [ ] **Step 4:** Run `npm run build && npm test`. Expected: PASS.
- [ ] **Step 5: Manual check.**
  - `node dist/cli.js --port 47801`, open `http://localhost:47801`, click 📊.
  - The now panel lists my running agents.
  - The 7일 chart shows bars.
  - Clicking a Top 10 row opens its transcript.
  - Screenshot with Playwright into the scratchpad.
- [ ] **Step 6:** Commit `feat(usage): usage popout window`.

### Task 10: Docs

**Files:**

- Modify: `CLAUDE.md` (server tree: `lan/usage.ts`, `lan/usageLine.ts`; Data: `usage.json`; Handshake: `usage` is local only like `ctx`; Office UI essentials: size/aura/chips/📦; popout `?usage`)

- [ ] **Step 1:** Add the lines, matching the file's terse style.
- [ ] **Step 2:** Run `npm run lint`. Expected: PASS.
- [ ] **Step 3:** Commit `docs: token usage in CLAUDE.md`.
