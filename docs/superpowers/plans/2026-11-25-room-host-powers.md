# Room Host Powers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A room survives its host (automatic handover), the host can change title / max people (2–20) / access code and kick members, and room features move to a 🚪 panel.

**Architecture:** A versioned `RoomState` (pure logic in `server/src/lan/room.ts`) lives in each member's `profile.json` and travels sealed on the team channel inside `Inner.office.room`, sent by the PC that wrote it. `LanService` applies the rules (accept, upkeep, takeover, kick, handover) on the 1 s httpServer tick and on client messages; `PeerNet` only carries it and uses it at admission. The webview gets a new `RoomsPanel` in the top-left `below` slot.

**Tech Stack:** TypeScript, Node stdlib UDP, React 19, vitest, AsyncAPI codegen.

**Spec:** `docs/superpowers/specs/2026-11-25-room-host-powers-design.md`

## Global Constraints

- Max people: `ROOM_MIN_PEOPLE` = 2 .. `OFFICE_MAX_PEOPLE` = 20. `ROOM_MAX_KICKED` = 20 (oldest dropped). `ROOM_HOST_GONE_MS` = 30 000. `ROOM_STATE_MIN_VER` = `'1.0.80'` (successor must run it). All in `server/src/constants.ts`.
- Title ≤ `MAX_OFFICE_NAME` (20), code ≤ `MAX_ROOM_PASSWORD` (32), '' = open room.
- Kick = honest client (`ponytail:` comment: a modified client keeps the team key). Open room (`pw === ''`): a kicked id cannot rejoin. Locked room: a correct code re-admits it.
- Every PeerNet datagram ≤ `MAX_DATAGRAM_BYTES` (1200): room state goes inside the presence `Inner`, which already splits.
- ≤ 1.0.79 peers must keep working: added JSON keys only (their `parseInner`/`parseWire`/`parseAdmit` ignore unknown keys); they never become host.
- Protocol changes only through `core/asyncapi.yaml` + `npm run asyncapi:generate`; `additionalProperties: false`.
- No new runtime deps; constants in the constants files; user text via `i18n.ts` (ko + en); pixel UI rules (no inline colors).
- The handover popup is mandatory: a view switch / leave / create / join that would take the host off its room without `handover: true` is refused (officesState re-sent).

## Review Focus

1. Original host back after a takeover, still holding its old rev → must become a plain member, never fight (test in Task 1 `acceptRoom` + Task 4).
2. Two members both think they are successor (split view of liveness) → higher (rev, by) wins on both (Task 1 `newer`).
3. Kicked PC in a locked room re-enters with the code → it must not be kicked again by the stale `kicked` list (Task 4 admit removes the id).
4. Host lowers max below the current count → nobody is dropped; the next joiner gets `roomFull` (Task 3).
5. Host on its room tab with no other member switches to 🏠 and back → still host (no handover written when there is no successor) (Task 4).

---

### Task 1: Room state rules (pure)

**Files:**

- Create: `server/src/lan/room.ts`
- Modify: `server/src/constants.ts` (constants above)
- Test: `server/__tests__/lan/room.test.ts`

**Interfaces:**

- Produces:
  ```ts
  export interface RoomState {
    rev: number;
    by: string;
    host: string;
    title: string;
    max: number;
    pw: string;
    order: string[];
    kicked: string[];
  }
  export function parseRoomState(x: unknown): RoomState | null; // strict; ids isWireId; title cleanChatText ≤ MAX_OFFICE_NAME; max 2..20; pw ≤ 32 code points; order ≤ 20, kicked ≤ 20, deduped
  export function newer(a: RoomState, b: RoomState | undefined): boolean; // a newer than b: rev, then larger by; b undefined → true
  export function acceptRoom(mine: RoomState | undefined, got: RoomState): boolean; // newer && (!mine || got.by === mine.host || got.by === got.host)
  export function successor(s: RoomState, live: (id: string) => boolean): string | null; // first in order, ≠ host, live
  export function upkeep(
    s: RoomState,
    me: string,
    live: (id: string) => boolean,
    gone: (id: string) => boolean,
  ): RoomState | null; // host only: append live missing ids, drop gone ones (never me), rev+1, by=me; null = unchanged
  export function admitVerdict(
    s: RoomState,
    id: string,
    pwOk: boolean,
    count: number,
    inside: boolean,
  ): 'ok' | 'password' | 'full' | 'banned';
  export function withKick(s: RoomState, me: string, id: string): RoomState; // remove from order, push to kicked (≤ ROOM_MAX_KICKED, oldest out), rev+1, by=me
  export function atLeastVersion(ver: string | undefined, min: string): boolean; // numeric x.y.z compare; undefined → false
  export function legacyRoom(me: string, title: string, pw: string): RoomState; // rev 0, host=me, max 20, order [me], kicked []
  ```
- `admitVerdict` order: `banned` when `pw === '' && kicked.includes(id)`; `password` when `!pwOk`; `full` when `!inside && count >= max`; else `ok`.

- [ ] **Step 1: Write failing tests** in `room.test.ts`:
  - `parseRoomState` rejects max 1 and 21, a 33-char pw, non-array order; keeps a valid state round-trip.
  - `newer({rev:2,by:'a'}, {rev:1,by:'z'})` true; same rev → larger `by` wins; equal → false.
  - `acceptRoom`: host's change accepted; handover (`by` = old host, `host` = b) accepted; a takeover (`by === host`) accepted; a member edit (`by` ≠ host and ≠ mine.host) refused; an older rev from the returning original host refused.
  - `successor` skips the host and non-live ids, returns null when none.
  - `upkeep` appends a live missing id, drops a gone id, never drops `me`, returns null when nothing changes.
  - `admitVerdict`: open + kicked → `banned`; locked + kicked + right code → `ok`; count 5, max 5, not inside → `full`; inside → `ok`.
  - `withKick` caps `kicked` at 20 dropping the oldest.
  - `atLeastVersion('1.0.80','1.0.80')` true, `('1.0.9','1.0.80')` false, `(undefined,…)` false.
- [ ] **Step 2:** `cd server && npx vitest run __tests__/lan/room.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement `room.ts` with the signatures above.
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5:** Commit `feat(rooms): versioned room state rules`.

### Task 2: Protocol

**Files:**

- Modify: `core/asyncapi.yaml`, generated `core/src/messages.ts`

**Interfaces (Produces):**

- `OfficeSummary` + `hostId?: string`, `max?: integer`, `next?: string` (successor's label, host only, '' = none).
- `OfficeNotice` + `title?: string`; `OfficeNoticeReason` + `kicked`, `nowHost`.
- `OfficeErrorReason` + `banned`, `maxInvalid`.
- `SetActiveView`, `LeaveOffice`, `CreateOffice`, `JoinOffice` + `handover?: boolean`.
- New client messages `SetRoom {type: 'setRoom', title?: string, max?: integer, password?: string}` and `KickMember {type: 'kickMember', peerId: string}` (pattern like `RelayKick.peerId`), added to the client message union.
- Descriptions say: room state is never sent to the browser except these fields; `password` still host-only.

- [ ] **Step 1:** Edit the YAML; `npm run asyncapi:validate` → passes.
- [ ] **Step 2:** `npm run asyncapi:generate && npm run check-types` → type errors only where the new reasons/messages are not handled yet (expected; fixed in Tasks 5–6). If `check-types` must be green per commit, add the two message types to the privileged list in `clientMessageHandler.ts` with an empty `case` that Task 5 fills.
- [ ] **Step 3:** Commit `feat(protocol): room settings, kick, handover messages`.

### Task 3: Profile + PeerNet carry the state

**Files:**

- Modify: `server/src/lan/profile.ts` (`TeamOffice.room?: RoomState`; `parseOffices(x, keepTag, me)` parses `room`, migrates a `host: true` room without it via `legacyRoom(me, name, password)`; on save, when `room.host === me` also write `host: true` + `password` = `room.pw`, else drop them — keeps a silent-update rollback working).
- Modify: `server/src/lan/crypto.ts` (`RoomWire.max?: number`; `parseWire` keeps an integer 2..20, else omits it).
- Modify: `server/src/lan/peerNet.ts`:
  - `TeamChannel` + `room?: RoomState` (from `LanService.teamChannels`).
  - `Inner.office` → `{ name: string; room?: RoomState }`; `parseInner` keeps `room` via `parseRoomState`. Sent only when `room.host === me || room.by === me`.
  - New option `onRoom?: (tag: string, room: RoomState, from: string) => void`, called from `receiveTeam` after `accept`.
  - New `lastHeard(tag: string, id: string): number | undefined` (from `seen`) and `peerVer(tag, id): string | undefined`.
  - `HostedRoom` + `max: number`, `room: RoomState`; the advert sends `max`; `RoomInfo.max`.
  - `receiveAsk` uses `admitVerdict(room.room, w.from, samePassword(...), peers(tag).length + 1, inside)`; reasons on the wire `password|full|banned`; an ok admit carries `room` (the host's state, after `onAdmit`).
  - New option `onAdmit?: (tag: string, id: string) => RoomState` — LanService removes `id` from `kicked` (rev+1) and returns the state to put in the admit.
  - `parseAdmit` + `room`; `JoinResult` ok + `room?: RoomState`, error reason + `'banned'` (from wire `banned`).
- Modify: `server/src/lan/office.ts` `rooms()` uses `r.max ?? OFFICE_MAX_PEOPLE`.
- Test: `server/__tests__/lan/peerNet.test.ts` (team offices / rooms describe), `server/__tests__/lan/profile.test.ts` (or where profile parsing is tested).

- [ ] **Step 1: Failing tests:**
  - profile: a stored `{host: true, password: 'pw'}` room loads with `room.host === peerId`, `room.pw === 'pw'`, `room.max === 20`; saving a member's room writes no `host`.
  - peerNet (two nodes, existing harness): host with `room.max = 2` and one member → a third asker gets `roomFull`; open room with the asker in `kicked` → `banned`; locked room, kicked asker, right code → admitted and `JoinResult.room` present; a member receives the host's `room` through `onRoom`; the advert carries `max` and `roomList()[0].max === 2`.
- [ ] **Step 2:** `cd server && npx vitest run __tests__/lan/peerNet.test.ts __tests__/lan/profile.test.ts` → FAIL.
- [ ] **Step 3:** Implement the changes above.
- [ ] **Step 4:** Same → PASS; whole `npm run test:server` still green.
- [ ] **Step 5:** Commit `feat(rooms): room state on the team channel and at admission`.

### Task 4: LanService rules

**Files:**

- Modify: `server/src/lan/office.ts`
- Test: `server/__tests__/lan/office.test.ts`

**Interfaces:**

- Consumes: Task 1 functions, Task 3 `onRoom`/`onAdmit`/`lastHeard`/`peerVer`.
- Produces (on `LanService`):
  ```ts
  receiveRoom(tag: string, room: RoomState): RoomNotice | null   // wired to PeerNet.onRoom
  admitted(tag: string, id: string): RoomState                     // wired to PeerNet.onAdmit
  tickRoom(now: number): RoomNotice | null                         // host: upkeep; member: takeover
  setRoom(u: { title?: unknown; max?: unknown; password?: unknown }): OfficeErrorReason | null
  kickMember(peerId: unknown): boolean
  needsHandover(): boolean                                          // I host the room on screen and leaving it would drop it
  type RoomNotice = { reason: 'kicked' | 'nowHost'; title: string }
  ```
- `hostedRoom()` = `room.host === me && activeView === tag`; returns `max`, `room`.
- `receiveRoom`: `acceptRoom(mine, got)` → store (`TeamOffice.room`, `name = title`); if `got.kicked` has me and I am inside → `leaveOffice(tag)`, `activeView = personal`, return `{kicked, title}`; if `got.host === me` and before it was not → `{nowHost, title}`.
- `tickRoom` (only while the room is on screen): host → `upkeep(s, me, live, gone)` with `live(id)` = heard ≤ `PEER_TTL_MS` and `atLeastVersion(peerVer, ROOM_STATE_MIN_VER)` (me always live), `gone(id)` = not heard for `ROOM_HOST_GONE_MS`. Member → if host not heard for `ROOM_HOST_GONE_MS` (since `max(lastHeard, onScreenSince)`) and `successor(s, live) === me` → write `{...s, rev+1, by: me, host: me}`, return `{nowHost}`.
- Handover: `setActiveView(view, handover)`, `leaveOffice(tag, handover)`, `createOffice(..., handover)`, `joinOffice(..., handover)`: when `needsHandover()` and the move leaves the room's screen: without `handover` → refuse (`false` / `'handover'` internal → officesState re-sent); with it → if `successor(s, live)` → write `{rev+1, by: me, host: next}`, `net.sendNow()` (the presence still goes out on this view), then the move. No successor → move only, state unchanged.
- `setRoom`: host only; `validateOfficeName`, `max` integer 2..20 else `maxInvalid`, `validateRoomPassword`; rev+1. `kickMember`: host only, not me, `withKick`.
- `peersIn(view)` drops ids in that room's `kicked`.
- `officeList()` adds `hostId`, `max`, and for the host `next` = successor's `peerLabel` ('' none).

- [ ] **Step 1: Failing tests** (fake `net` like the existing office tests):
  - member receiving a state that kicks it → offices empty, `activeView === 'personal'`, notice `kicked` with title.
  - host `setActiveView('personal')` without handover while a successor is live → refused, still host; with `handover: true` → state written with `host = successor` before the view changes (assert `net.sendNow` saw it).
  - host alone switches to personal with handover and back → still host (Review Focus 5).
  - original host (rev 3) receives the successor's takeover rev 4 → becomes member; its own stale rev 3 is never re-accepted by others (Review Focus 1).
  - `tickRoom` as successor after 30 s silence → `nowHost`; as a non-successor → nothing.
  - `setRoom({max: 1})` → `maxInvalid`; lowering max below the count keeps everyone (Review Focus 4).
  - `admitted(tag, id)` removes `id` from `kicked` (Review Focus 3).
- [ ] **Step 2:** `cd server && npx vitest run __tests__/lan/office.test.ts` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(rooms): handover, takeover, kick, room settings`.

### Task 5: Server wiring

**Files:**

- Modify: `server/src/clientMessageHandler.ts` (`setRoom`, `kickMember` privileged → `onOfficesChanged(false)` or `officeError`; `handover` passed through on the four office messages)
- Modify: `server/src/httpServer.ts` (1 s tick: `lan.tickRoom(now)` → `officeNotice {reason, title}` to every client + `onOfficesChanged`; same for a `receiveRoom` notice, delivered via a callback set by httpServer)
- Modify: `server/src/cli.ts` (PeerNet `onRoom` → `lan.receiveRoom`, `onAdmit` → `lan.admitted`)
- Test: `server/__tests__/clientMessageHandler.test.ts` (or the existing handler test file)

- [ ] **Step 1: Failing tests:** `setRoom` from a non-privileged ctx is refused; from a privileged one answers officesState with the new `max`; `setActiveView` without `handover` while hosting with a live successor re-sends officesState unchanged.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** `npm run check-types && npm run test:server` → PASS.
- [ ] **Step 5:** Two-instance check (CLAUDE.md Rooms recipe: two `dist/cli.js`, separate HOMEs, mirrored `PIXEL_OFFICE_UDP_PORT`/`_TARGETS`): create → join → host quits → after ~35 s the member's officesState shows `hostId` = itself and `roomsState` lists the room again.
- [ ] **Step 6:** Commit `feat(rooms): wire room messages and notices`.

### Task 6: Rooms panel (webview)

**Files:**

- Create: `webview-ui/src/lan/RoomsPanel.tsx` (content moved from `OfficeSettings.tsx`, plus host controls and member list), `webview-ui/src/lan/roomsModel.ts` (pure)
- Delete: `webview-ui/src/lan/OfficeSettings.tsx`; remove its section from `components/SettingsModal.tsx`
- Modify: `components/MenuButtons.tsx` (🚪 button, `data-tip`, `data-tour="rooms-button"`, hidden read-only, shown like 📊 except also on mobile is not required), `App.tsx` (`topPanel` adds `'rooms'`), `lan/OfficeSwitcher.tsx` (tab click → handover confirm), `constants.ts` (`ROOMS_PANEL_SIZE_KEY`), `i18n.ts` (ko/en: panel texts, `office.notice.kicked`, `office.notice.nowHost`, `office.error.banned`, `office.error.maxInvalid`, handover confirms)
- Test: `webview-ui/test/roomsModel.test.ts`

**Interfaces:**

- `roomsModel.ts`: `handoverPrompt(office: OfficeSummary | undefined, selfId: string): { key: 'rooms.handover' | 'rooms.handoverClose'; next: string } | null` — null when I am not host; `members(people, office): {peerId, label, host, me}[]` from the team snapshot's people.
- Every path that leaves the hosted room (switcher tab, [나가기], create, join) asks `window.confirm(t(prompt.key, {next}))` (same mechanism as today's `switchConfirmName` confirm) and sends `handover: true` on OK; Cancel sends nothing.
- Host controls: title, max (`<select>` 2..20), code, [저장] → `setRoom`; member row [강퇴] (host only, not me, confirm) → `kickMember`.

- [ ] **Step 1: Failing tests:** `handoverPrompt` null for a member, `rooms.handoverClose` when `next === ''`, `rooms.handover` with the name otherwise; `members` marks host and me.
- [ ] **Step 2:** `npm run test:webview -- roomsModel` → FAIL. **Step 3:** Implement panel + model + wiring. **Step 4:** `npm run test:webview && npm run lint && npm run check-types` → PASS.
- [ ] **Step 5:** Commit `feat(rooms): rooms panel with host controls`.

### Task 7: Docs and manual

**Files:** `webview-ui/src/lan/manual.ts` (entry `rooms` in category `offices`), `ManualScenes.tsx` (scene), `i18n.ts` (`manual.rooms.*` ko/en), `site/index.html` + `site/en.html` (room section), `CLAUDE.md` (Rooms section: state, handover, kick, panel; Settings no longer has 오피스).

- [ ] **Step 1:** Add the entry; `npm run test:webview -- manual` → PASS (`test/manual.test.ts` checks entry + text + scene).
- [ ] **Step 2:** Update site pages and CLAUDE.md.
- [ ] **Step 3:** `npm run build && npm test` → green.
- [ ] **Step 4:** Commit `docs(rooms): manual, site and reference for host powers`.
