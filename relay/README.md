# Pixel Office relay

Cloudflare Worker + one Durable Object (`Hub`) that relays the public office's sealed `pub`
datagrams between PCs on different networks. It sees only peer ids, public keys and recipient
ids — never the content. Routing, budget and ban decisions live in `src/hub.ts` (tested by
`npm run test:relay` at the repo root); `src/index.ts` is the thin Worker/DO shell.

## Deploy

```bash
cd relay
npm ci
npx wrangler login
npx wrangler deploy
npx wrangler secret put ADMIN_TOKEN    # a long random string; never commit it
```

`wrangler deploy` prints `https://pixel-office-relay.<sub>.workers.dev`. The app's
`RELAY_URL` (`server/src/constants.ts`) is that host as `wss://pixel-office-relay.<sub>.workers.dev/ws`.

Limits can be overridden in `wrangler.toml` `[vars]` (`MAX_PEERS`, `DAILY_BUDGET`,
`MAX_FRAMES_PER_MIN`, `ABUSE_BAN_MIN`, `KICK_HOURS`); otherwise `DEFAULT_LIMITS` applies.

## Local

```bash
echo 'ADMIN_TOKEN=test' > .dev.vars     # gitignored
npx wrangler dev --port 8787
node scripts/smoke.mjs ws://127.0.0.1:8787/ws   # prints OK
```

## Admin (curl)

```bash
R=https://pixel-office-relay.<sub>.workers.dev
T='Authorization: Bearer <ADMIN_TOKEN>'

curl -s -H "$T" $R/admin/stats                       # {peers, used, budget, day}
curl -s -H "$T" -X POST -d '{"id":"<peerId>","hours":24}' $R/admin/kick   # {until}
curl -s -H "$T" $R/admin/bans                        # {bans: {id: until}}
curl -s -H "$T" -X DELETE $R/admin/bans/<peerId>     # {ok}
```

A ban is per peer id: deleting `profile.json` gets a new id. No IP bans (a whole office shares one NAT IP).

## Arcade hall of fame

The hub also referees the lounge arcade's cumulative leaderboard (`src/arcade.ts`, types and
parsers shared with the PC in `core/src/arcade.ts`). Scores are never taken from clients: the
relay replays the recorded inputs on its own seed with the shared engine (`core/src/games/`).

| Request                                                           | Answer                                         |
| ----------------------------------------------------------------- | ---------------------------------------------- |
| `POST /arcade/start {id, game}`                                   | `{seed, issued, sig}` (HMAC ticket, 3 h, once) |
| `POST /arcade/submit {id, name, game, seed, issued, sig, inputs}` | `{score, best, rank}` (rank null = off board)  |
| `GET /arcade/board`                                               | `{boards: {rack, cable, bugs}}`, 50 rows each  |

Errors: 400 `{error: bad|sig|expired|used|replay|time}`, 405 wrong method, 503 `{error: budget}`.
Each request counts 20 against the day budget. Known limits (ids unproven, bots, slow-motion
play) are the `ponytail:` note in `src/arcade.ts`. A change here needs a redeploy:
`cd relay && npx wrangler deploy`.

## Cloudflare free limits (2026-11)

| Limit               | Value                  | Meaning                                                                                         |
| ------------------- | ---------------------- | ----------------------------------------------------------------------------------------------- |
| DO requests         | 100,000/day            | Incoming WebSocket messages count 20:1 → about 2,000,000 messages/day. Outgoing fan-out is free |
| DO duration         | 13,000 GB-s/day        | One 128 MB DO awake for 24 h ≈ 11,059 GB-s → **exactly one DO**                                 |
| Workers requests    | 100,000/day            | One per WebSocket upgrade or admin request                                                      |
| DO storage (SQLite) | 100,000 row writes/day | Never write per message                                                                         |

Reset = UTC 00:00 (KST 09:00). The hub stops at 95 % (`DAILY_BUDGET` 1,900,000 messages, an
upgrade or admin request = 20) and closes everyone with `budget` until the reset.
