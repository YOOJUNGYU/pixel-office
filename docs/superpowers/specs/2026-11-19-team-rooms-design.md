# Team rooms (host, title, access code, room list)

Replaces the invite-code team office (user decision, 1.0.75).

## Intent

Like a game lobby: a host creates a room with a title and an optional access code
(a password). Everyone on the same network sees the list of open rooms and joins
one from it; a room with a code asks for it. Same office size as the public office
(the bundled default layout, as team offices already used). At most 20 people per
room, and the public office is capped at 20 per network too (counted per LAN: people
seen only over the relay never count).

## Decisions

- **List scope = the LAN** (UDP broadcast). The office itself only travels over the
  LAN, so a room heard from another network could not be shown anyway.
- **The host admits** (user's "방장" concept): the host's PC checks the code and hands
  the room's secret over, sealed pairwise. The code never travels in clear and cannot
  be brute-forced offline from captured traffic; online guesses are rate limited at the
  host. Cost: nobody new can join while the host is offline.
- **Host leaves** → the room disappears from the list; people inside stay (they hold
  the key) and can keep working. (My call.)
- **A room is a team office**: same `team` channel, key, layout and panel. Only how one
  gets in changed. One room at a time (`MAX_OFFICES` = 1).
- **Old invite-code teams** keep working, unlisted (no host). The code UI and protocol
  (`officeCreated`, `getOfficeCode`/`officeCode`, join by code) are removed.

## Wire (PeerNet, v2; older peers drop unknown `t`)

- `room {id, pk, tag, title, by, locked, n}` — plaintext broadcast every tick by the host
  while that room is on its screen (not personal). `by` = host label, `n` = people in it.
- `ask {from, to, pk, n, c}` — joiner → host (unicast to the advert's address), sealed
  with the pair key, AAD `ask|from|to`, plaintext `{seq, tag, pw}`. Re-sent every tick
  until answered or `ROOM_JOIN_TIMEOUT_MS`.
- `admit {from, to, n, c}` — host → joiner, AAD `admit|from|to`, plaintext
  `{seq, tag, ok: true, secret}` or `{seq, tag, ok: false, reason: 'password'|'full'}`.
  The joiner keeps the secret only when `teamTag(teamKey(secret))` is the asked tag.

Host checks: pinned pk, ≤ 1 ask per requester per `ROOM_ASK_GAP_MS`, ≤ `ROOM_ASKS_PER_SEC`
asks in all, code compared in constant time, members < `ROOM_MAX_PEOPLE` (a current
member is always let back in).

## Protocol (browser)

- `createOffice {name, password?}` → officesState (the room becomes the view).
- `joinOffice {tag, password?}` → officesState, or `officeError {reason}` with
  `wrongPassword | roomFull | roomGone | timeout | alreadyJoined | nameInvalid | passwordInvalid`.
- `roomsState {rooms: [{tag, title, host, locked, count, max}]}` — handshake and on change.
- `officesState.offices[]` gains `host?: true` and, for my own room, `password?`.

## UI

Settings → 오피스: create (title + optional code), room list (🔒, host, n/20, [입장] →
code field when locked; full rooms disabled), my room (host badge, code, [나가기]).
