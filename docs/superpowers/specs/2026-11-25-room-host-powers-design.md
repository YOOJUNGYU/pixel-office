# Room host powers (handover, settings, kick, rooms panel)

Builds on `2026-11-19-team-rooms-design.md` (rooms with a host, title, access code, LAN list).

## Intent

A room should outlive its host and be run like a game lobby. Today the room's title, access
code and admission live only on the host's PC: when the host's PC is off nobody new gets in,
and when the host leaves the room drops off the list for good. The user wants:

1. **Handover**: when the host leaves (or the host's PC goes off) the host role passes to the
   next person automatically.
2. **Host powers**: the host sets the room's max people (≤ 20), changes its title, and kicks
   people out.
3. **Kick**: the kicked PC leaves the room and moves to personal mode (🏠).
   - Locked room (has a code): may come back by entering the code again.
   - Open room (no code): may NOT come back.
4. **Open rooms**: a room created without a code lets anyone in; the list shows 🔒 for locked
   ones (already so today; kept).
5. **Rooms panel**: room features move out of Settings into their own panel.

## Goals / non-goals / anti-goals

- Goals: the above, for rooms (`TeamOffice.host` era, ≥ 1.0.75 protocol).
- Non-goals: a cryptographic kick (re-keying). Bans can be lifted only by re-creating the room
  (no unban UI). Invite-code teams (≤ 1.0.74, no host) get none of this. Peers ≤ 1.0.79 never
  become host and ignore room state (they keep working as plain members).
- Anti-goals: two hosts fighting forever (must converge); a short network blip handing the
  room away and the original host then being stuck out; the access code leaking to non-members
  (it may be known to members, see below).

## Approaches

Kick (decided by the user: A):

- **A. Honest-client kick (chosen).** The host publishes a kick; the kicked PC's own app
  leaves to personal mode, every other member stops showing it, the host refuses to re-admit
  it in an open room. Ceiling: a modified client keeps the team key and can still read the
  team channel. Accepted: coworkers on one LAN. Mark it `ponytail:` in code.
- B. Re-key on kick (new secret to the remaining members only). Real exclusion, but the tag is
  derived from the secret, so the layout channel, seats etc. move to a new tag and members
  offline at kick time must be re-admitted. Rejected as too heavy for the need.

Panel placement (decided by the user: 1):

- **1. Top-left 🚪 button → panel in `ZoomControls`' `below` slot (chosen)**, like 📊 usage and
  ? manual (`topPanel` gains `'rooms'`; one panel at a time; resizable via `useResizable`).
- 2. Modal like Settings — hides the office. 3. A `+` tab in the office switcher — too small.

## Design

### Shared room state

Today only the host holds title/code. To hand over, every member must hold the room's
settings. New `RoomState` (core, `core/src/lan.ts`, parsed by a strict `parseRoomState`):

```
RoomState {
  rev: number        // version; newer = higher rev, then larger `by` (like LayoutRev)
  by: string         // peer id that wrote this rev
  host: string       // current host's peer id
  title: string      // ≤ MAX_OFFICE_NAME
  max: number        // ROOM_MIN_PEOPLE (2) .. OFFICE_MAX_PEOPLE (20)
  pw: string         // access code, '' = open, ≤ MAX_ROOM_PASSWORD
  order: string[]    // members in join order, ≤ OFFICE_MAX_PEOPLE (see "Order upkeep")
  kicked: string[]   // kicked ids, ≤ ROOM_MAX_KICKED (20, oldest dropped). One list: an open
                     // room refuses them; a locked room re-admits one with the right code and
                     // removes it from the list (admit writes a new rev)
}
```

- Travels only on the team channel (sealed with the team key; never in the plaintext `room`
  advert). Members therefore learn the access code — accepted: they need it to admit when they
  become host. The UI shows the code to the host only (as today).
- Stored per room in `profile.json` (`TeamOffice.room?: RoomState`; `host: true` becomes
  derived: `room.host === me`). A ≤ 1.0.79 `host: true` room without `room` is migrated on load
  into a rev 0 state (host = me, title = name, pw = password, max = 20, order = [me]).
- Joiners get the current state in the `admit` (added field; ≤ 1.0.79 hosts send none →
  the joiner starts with no state and takes the first one it hears).
- Acceptance rule: a received state replaces mine only if it is newer AND (its `by` is the
  host of my current state, or it is a valid takeover — see Handover). A state written by a
  non-host member is ignored. (Honest-client trust: any member holds the key; same ceiling as
  the kick.)
- Size/transport is the builder's call within `MAX_DATAGRAM_BYTES`: e.g. carry `rev`+`by` in
  each team presence and push the full state (like shared layouts) to members that lag, or put
  it whole in `Inner.office`. Must not change the single-form presence bytes for peers that
  never had room state beyond added keys that ≤ 1.0.79 ignore.

### Order upkeep (decided by Claude)

- The host appends an id when it admits it, and also any live team member it hears that is
  missing (in the order first heard) — so members admitted before this version, or by a
  ≤ 1.0.79 host, become eligible without re-joining.
- The host drops an id that has not been live for `ROOM_HOST_GONE_MS`; a returning member is
  appended again at the end.
- Each change is a new rev (coalesced: at most one order-only rev per tick).

### Host powers (host PC only; privileged messages)

- `setRoom {title?, max?, password?}` → validate (title like `createOffice`, max 2–20,
  password ≤ 32) → new rev. Lowering max below the current count keeps everyone in; only new
  joins are refused (`roomFull`).
- `kickMember {peerId}` → new rev with the id added to `kicked`
  (one `kicked` list for both room kinds); remove from `order`.
- The admit check (host): code matches (constant time, as today) AND count < `max` (live
  members incl. host, unless already inside) AND, when `pw === ''`, not in `kicked`. In a locked
  room a correct code admits a kicked id and removes it from `kicked`. Admit appends the
  id to `order` (new rev) if missing.
- The plaintext advert gains `max` (≤ 1.0.79 parsers rebuild the object and ignore it; they
  show 20). `title` in the advert = the state's title.

Kick in a locked room: the kicked PC leaves (to personal) and may re-enter at once with the
code (decided by the user); only open-room kicks block re-entry.

### Kicked PC

On a newer state naming me in `kicked`: leave the room
(`leaveOffice`), switch to personal (`activeView = personal`), send the page
`officeNotice {reason: kicked, title}` → long toast "‘<title>’ 방에서 강퇴되어 개인용으로
이동했습니다". Every other member drops a kicked id from `peers(tag)` immediately
(hides its avatar/agents/people row) until a newer state readmits it.

### Handover

- **Successor** = first id in `order` (skipping the host) that is live on the team channel
  (`PEER_TTL_MS`) and on ≥ 1.0.80 (sent room state at least once / announces support). All
  members compute it the same way from the same state.
- **Host leaves the room's screen** (decided by the user): [나가기], creating/joining another
  room, and switching the view to 🏠 personal or 🌐 public all first show a confirm popup:
  "방장 권한이 <successor 이름>님에게 넘어갑니다. 계속할까요?" (no live successor: "다른
  멤버가 없어 방이 목록에서 사라집니다. 계속할까요?"). Cancel = nothing changes, the view
  stays on the room. OK = the host writes a new rev with `host = successor` and broadcasts it,
  then the switch/leave happens (repeating the broadcast on the next couple of ticks is the
  builder's call; the switch must not wait on it). Coming back to the room tab later = a plain
  member (no reclaim). The popup is the webview's; the server applies the handover on the same
  privileged message (e.g. `setActiveView {view, handover: true}` / `leaveOffice`), and a view
  switch without it while hosting is refused with `officesState` (so a stale page cannot drop
  the room silently). Members in personal/public view are not live on the team channel and
  are skipped as successors.
- **No live successor**: the room drops off the list (nobody advertises). Members who come
  back later still hold the key and the state; the takeover below makes the first of them
  host after `ROOM_HOST_GONE_MS`, and the room is listed again.
- **Host goes silent** (PC off, network): when the host has not been heard for
  `ROOM_HOST_GONE_MS` (30 s, new constant), the successor writes rev+1 with `host = me`
  (takeover). This covers the PC going off / network loss only; on-screen view switches are
  explicit handovers above. Members accept a takeover rev whose `by` is the successor they
  compute themselves (or any member when they see no live successor ahead of it — builder
  decides the exact rule; requirement: everyone converges on one host).
- **Original host returns**: it sees a newer state with another host → becomes a member (its
  `host` is gone; no reclaim).
- **Conflict** (two PCs both think they are host, e.g. a split network re-joins): higher rev,
  then larger `by`, wins; the loser becomes a member.
- The new host starts advertising (`room` advert) and admitting at once; its PC needs no code
  from anyone (it has `pw` in the state).

### Rooms panel (webview)

- New top-left button 🚪 (`MenuButtons`, `data-tip` 방, `data-tour="rooms-button"`; hidden
  read-only; also on mobile? builder's call — follow the 📊 rule) toggles `topPanel === 'rooms'`
  → `lan/RoomsPanel.tsx` in the `below` slot, resizable (`useResizable`, own size key).
- Contents (sketch):
  ```
  ┌ 방 ───────────────────────── × ┐
  │ 내 방: 개발팀 🔒  [방장]   [나가기] │
  │  제목 [개발팀      ] 최대 [12▾]/20 │   ← host only, [저장]
  │  코드 [****]                       │   ← host only
  │  멤버  홍길동 (나)  [방장]          │
  │        김철수              [강퇴]   │   ← [강퇴] host only, confirm
  │ ── 이 네트워크의 방 ────────────── │
  │  🔒 기획팀   by 이영희  5/10 [입장] │   ← locked → code field
  │     자유방   by 박민수  3/20 [입장] │   ← full → disabled
  │ [+ 새 방 만들기]  제목 / 코드(선택) / 최대 │
  └────────────────────────────────────┘
  ```
- `OfficeSettings.tsx`'s content moves here; Settings loses its 오피스 section.
- `officesState.offices[]` gains `max`, `hostName`, and for members the member list comes from
  the snapshot's `people` (already the team's live people). `roomsState.rooms[].max` = the
  advert's `max`.
- New error reasons: `banned` (open room you were kicked from) — "강퇴된 방이라 다시 들어갈
  수 없습니다". Handover → notice toast to the new host ("방장이 되었습니다").
- Manual: new entry (`lan/manual.ts` + text ko/en + scene) and the tour/site docs (both
  languages) updated per the project rules. CLAUDE.md "Rooms" section updated.

## Constants (new)

`ROOM_MIN_PEOPLE` 2, `ROOM_MAX_KICKED` 20, `ROOM_HOST_GONE_MS` 30 000 (server/core as fits the
layering rules).

## Left to the builder

Room-state transport and push cadence (within the datagram limit), exact takeover acceptance
rule (must converge), how many ticks the leaving host repeats the handover, panel styling within
the pixel rules, i18n keys, test split (core parser, PeerNet two-instance tests for handover /
kick / ban, LanService, webview pure model).
