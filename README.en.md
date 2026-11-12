<h1 align="center">Pixel Office</h1>

<p align="center">
  <a href="README.md">한국어</a> · <b>English</b>
</p>

<p align="center">
  Your AI coding agents as characters in a <b>pixel-art office</b>.<br>
  Alone, with your team, or with everyone.
</p>

<p align="center">
  <a href="https://github.com/YOOJUNGYU/pixel-office/releases/latest"><b>⬇️ Download</b></a> ·
  <a href="docs/INSTALL.en.md">Install guide</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#development">Development</a>
</p>

**In short:** Pixel Office reads the Claude Code and Codex sessions on your PC and draws **each agent as a character**. A character walks to the room that matches its work — **coding room, library, server room (test · build · git · run zones) or lounge** — and its bubble, icon and PC screen show what it is doing right now. Choose a **public office (internet, anyone), a team office (same network, invite code, encrypted) or personal mode**. The 📊 **token usage panel** shows today, the last 7 or 30 days or everything, and your own agents **grow as they use more tokens and burn blue → gold flame → red flame aura the faster they use them**. There are also people avatars and chat, a window with a session's whole conversation, PC notifications when an agent waits or finishes, a layout editor, and Windows/Mac installers with automatic updates.

![The public office with ten people](docs/images/office-en.png)

<sub>Made-up data: ten people in the public office. Agents are spread over the coding room, the library, the four server-room zones and the lounge. My agents (blue name tags) show their size, flame outline, token chip and bubble; colleagues' agents are quiet, as the public office shows them (no bubble). The lounge has people, chat bubbles and a red ! waiting for approval; on the right, the people panel with LAN / internet / network badges.</sub>

See at a glance who is doing what, with which agent (Claude Code / Codex). Pick one of three offices (switch any time with the buttons at the top):

- 🌐 **Public office** (default): everyone with the app, on any network (same network directly, others through the internet relay).
- 🔒 **Team office**: teammates with the invite code, same network only.
- 🏠 **Personal**: your PC alone; agents and chat never leave it.

### How it differs from the original

A fork of [pixel-agents](https://github.com/pixel-agents-hq/pixel-agents) (MIT). The original is a **VS Code extension** that runs Claude Code agents inside VS Code and shows the agents of your own PC as characters. The office engine, the layout editor and the furniture assets come from it.

|             | pixel-agents (original)                                    | Pixel Office                                                                                                                                                                                   |
| ----------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Form        | VS Code extension                                          | Standalone app (local server + browser/PWA), Windows/Mac installers, tray, automatic updates                                                                                                   |
| Agents      | Claude Code, launched with a terminal inside the extension | Claude Code **+ Codex**; launches nothing, only reads the transcripts of the CLI/desktop apps you already use (WSL included)                                                                   |
| Who you see | your PC                                                    | **public office (internet relay), team office (LAN, encrypted), personal**                                                                                                                     |
| Office      | free layout                                                | room = activity (coding, library, server room with 4 zones, lounge), shared layouts                                                                                                            |
| People      | —                                                          | people avatars (arrow keys), chat bubbles, people panel (LAN / internet / network badges)                                                                                                      |
| Status      | character animation                                        | bubbles (session title, activity), action icons, elapsed time, task progress, failures, lines changed, context %, PC screens, glow and server LEDs, one-shot effects (+N, smoke, confetti, 📦) |
| Tokens      | —                                                          | 📊 usage panel; my characters' size, flame outline, token chip, model badge                                                                                                                    |
| More        | —                                                          | session detail windows, PC notifications (waiting, done, join/leave, chat), light theme, Korean/English                                                                                        |
| Removed     | —                                                          | launching agents, the terminal, the VS Code extension, the original's hooks and consent flow                                                                                                   |

## Install

1. Download from [Releases](https://github.com/YOOJUNGYU/pixel-office/releases/latest): Windows `PixelOffice-<version>-Windows.exe`, Mac (Apple silicon · Intel) `PixelOffice-<version>-Mac.pkg`. Node is bundled; nothing else to install.
2. The installers are not code-signed, so you get a warning.
   - **Windows**: "Windows protected your PC" → **More info** → **Run anyway** → User Account Control **Yes**
   - **Mac**: on "Not Opened" click **Done** (not Move to Trash) → **System Settings → Privacy & Security → Open Anyway** → open the pkg again. Or in Terminal: `sudo installer -pkg <the pkg> -target /`. If the firewall is on, "Allow incoming connections"
3. When the office opens in your browser, pick a character and colour (nickname optional). A short tour follows.

- It starts at login (**Settings → Start at login**). To quit: tray icon → **Quit Pixel Office**, or **Settings → Quit Pixel Office**.
- Reopen: tray → **Open Pixel Office**, the Windows desktop / Start menu shortcut, Mac **Applications**, or `http://localhost:47801`.
- Updates are automatic (see [More](#more)).

PCs not showing up, uninstalling: see the **[install guide](docs/INSTALL.en.md)**. If company security software blocks it, ask IT for an exception.

## Using it

### Room = activity

Once an activity lasts 3 seconds, the agent walks to its room and sits on a free seat. Hover a room plate for its description and the agents there; `Agents N` on the plate counts the agents in the room (subagents and shells included), none on the lounge.

The server room is split into four zones by divider lines, and an agent sits in the zone of its command (another free server-room seat when that zone is full): top left **Test** (vitest, pytest, npm test, e2e/verify, curl, browser checks), top right **Build** (tsc, build, lint, installs, codegen, docker, file moves), bottom left **Git** (git, gh, worktrees), bottom right **Run** (every other command). Each zone has a plate with a count at its top right; hover it for what the zone is for.

| Room           | Activity                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------ |
| 🖥️ Coding Room | Editing files (Claude `Edit`/`Write`, Codex `apply_patch`)                                       |
| 📚 Library     | Reading files, searching code or the web (incl. Codex read commands like `rg`, `cat`, `git log`) |
| 🗄️ Server Room | Running commands (`Bash`, Codex shell), background shells — test, build, Git and run zones       |
| 🛋️ Lounge      | Waiting for input or approval, turn finished — merged into its PC's person character             |

- **Name tags**: one line — a **MAIN** / **SUB** / **SHELL** badge, `#number`, the nickname (else the PC account). People's own characters always show their tag, in the colours each person picks in their profile (yours with a yellow frame).
- **Bubble**: every working agent shows a Claude / Codex badge, the session title (your own agents only) and what it is doing over its head (up to 5 lines in the public and personal offices); hover for the full text. A **red !** overhead = waiting for you (over the person's character when the agent has merged into it in the lounge).
- A working agent's bubble shows an icon for what it does, task progress (3/7) and how long the current step has run (orange when long); a failed tool shows a drop beside its head for a moment. Zoomed out, the bubble is the icon alone (shrinking with the characters). My own agents' name tags end with their context use (`29%`, this PC only). The hover bubble, room cards and the session window also show the lines the session changed (`+120 −30`). Edit/read icons take the file's language colour (ts blue, py yellow, …). An agent's PC screen follows what it does too (edit = green code, run = a black terminal, reading/searching = a white page). Working PCs glow in their screen's colour (server-room PCs, monitor and tower), edits float up as `+12 −3`, a failed tool flashes the PC red with a puff of smoke, and finishing a task list or a turn sets off confetti (all from real changes in the session records). While a command runs in the server room, its PCs' LEDs blink.
- **Subagents and shells** in their parent's room sit at the free seat closest to it (in a full room they hold its hand), and work on their own in another room. When the parent hands work to a subagent or messages it, and when the subagent reports back, the two stand face to face and talk for a moment.
- **Map**: drag to pan, wheel to zoom (or + / − at the top left).

### The character signals at a glance

One of my agent characters carries several layers of information, one visual element each, so they never get in each other's way. All screenshots below use made-up data. Size, flame outline, token chip, model badge and 📦 show **on my own agents only** and never leave this PC.

|                        Screen                        | State                        | What you see                                                                                                                                                                                                                                                                                                                          |
| :--------------------------------------------------: | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|  <img src="docs/images/sig-red-en.png" width="300">  | **Heavy and fast**           | 1M+ tokens: **2× size**; 75k+ tokens per minute: **red flame aura** (flames flicker above the head, a white-hot core next to the body). Name-tag chip `1.4M · Σ1.9M` = this session's tokens · with its subagents. Bubble header: **model badge** (Opus purple), action icon (edit), session title, task progress `3/7`, elapsed time |
| <img src="docs/images/sig-gold-en.png" width="300">  | **Medium pace** (a subagent) | 300k+ tokens: **1.5×**; 40k+ per minute: **gold low flame**. Sonnet's badge is blue. A subagent has the `SUB` badge and its parent's number                                                                                                                                                                                           |
| <img src="docs/images/sig-blue-en.png" width="300">  | **Slow and steady**          | 15k+ per minute: a **blue outline**. Sitting in the server room's test zone running a command (terminal on its PC screen)                                                                                                                                                                                                             |
| <img src="docs/images/sig-plain-en.png" width="300"> | **Light work**               | Below 300k tokens and 15k per minute: normal size, no outline. Haiku's badge is green. Read icon and a document on the screen                                                                                                                                                                                                         |
| <img src="docs/images/sig-codex-en.png" width="300"> | **Codex**                    | Codex sessions keep the green Codex badge (model badges are for Claude). Server room, git zone                                                                                                                                                                                                                                        |
| <img src="docs/images/sig-wait-en.png" width="200">  | **Waiting for you**          | An agent in the lounge folds into my person character; waiting for approval puts a **red !** over its head                                                                                                                                                                                                                            |
|  <img src="docs/images/fx-diff-en.png" width="300">  | **Edited files**             | The lines it changed rise as `+24 −6`                                                                                                                                                                                                                                                                                                 |
|  <img src="docs/images/fx-fail-en.png" width="300">  | **Big result / failure**     | A tool result of 50k+ tokens rises as **📦 +82k**. A failing tool blinks the PC red, puffs smoke and shows a drop beside the head                                                                                                                                                                                                     |
|  <img src="docs/images/fx-done-en.png" width="300">  | **Task list done**           | When the task list reaches `7/7`, or a main agent finishes, confetti                                                                                                                                                                                                                                                                  |
|   <img src="docs/images/hover-en.png" width="300">   | **On hover**                 | The same header with the full activity, room, reason, elapsed time, tasks, lines changed, context, tokens, model and tokens per minute                                                                                                                                                                                                |

- **Size** (session tokens): below 300k 1× · 300k+ 1.5× · 1M+ 2×. Only these three steps, so pixels stay even.
- **Outline** (tokens per minute over the last 2 minutes): 15k blue → 40k gold low flame → 75k red flame aura. The red flame differs in shape from a failure (red drop, blinking PC).
- **Tokens** = input + output + cache writes (cache reads are left out and shown separately in the usage panel).
- Other people's agents in the public office show **no bubble**: only room, seat, PC screen and ! (the colleagues in the top screenshot). A team office shows their bubbles, but never their size, flames or tokens.

### Token usage (📊)

The 📊 button at the top left opens the **usage panel** right under the button row. Its top-left corner stays under the buttons; drag the **right edge, bottom edge or bottom-right corner** to change its width, height or both (the size is remembered). Click 📊 again or × to close it.

![The office with the usage panel open](docs/images/usage-office-en.png)

<table><tr>
<td width="50%"><img src="docs/images/usage-30d-en.png"></td>
<td width="50%"><img src="docs/images/usage-all-en.png"></td>
</tr><tr>
<td>Last 30 days. Hover a bar for that day's input, output, cache writes and cache reads</td>
<td>All history</td>
</tr></table>

- **Now**: tokens used today (since midnight), and for each of my working agents a burn-colour dot, model, session tokens and tokens per minute (subagents indented under their parent). Click a row to open that session's conversation window.
- **History** (7 days · 30 days · all): tokens, cache reads, cache hit rate, sessions; daily bars (input, output, cache writes; idle days stay as gaps); daily cache reads (about 100× larger, so on their own); top projects; model and provider (Claude/Codex) shares; the 10 costliest sessions. A top-10 row opens the conversation window **even for a finished session**; a session whose transcript file is gone is dimmed.
- **Data**: the whole Claude Code and Codex history (WSL included) is read incrementally and only totals are kept in `~/.pixel-office/usage.json` (no prompt text). Totals stay when Claude Code deletes old transcripts. The first start reads everything once (meanwhile "Scanning history…"), then only what was appended. On this PC only, never sent anywhere.
- A response written several times to the transcript is counted once (as billed). No cost conversion.

### Offices (switcher at the top)

The people panel on the right has three areas, **Public office / Team / Personal**, so you see by name who is in the areas you are not viewing (only the team you joined; none = no team area).

- 🌐 **Public office** (default): **anyone who installed the app, on any network** (home, office, cafe) joins the same public office. Same-network PCs see each other directly, other networks through a Cloudflare relay (one outbound `wss` connection on 443). Nothing to set up; it connects automatically after the update.
  - Everyone in the public office sees your **account name, nickname, character, chat and your agents' room and kind of activity**. Other people's agents always look **quiet, with no speech bubble** (no file names, commands, elapsed time, todo counts, diff or failure marks), wherever they come from; your own agents stay fully detailed on your screen. In a team office members' agents show their work (speech bubbles) in full.
  - The relay holds **20** people at a time. A chip next to the people panel's "Public office" title shows the state: `🌐 Internet connected` · `Connecting to the internet…` · `Internet: waiting, office full` · `Internet paused: daily limit reached` · `Removed by the admin` · `No internet connection — same network only`. In every case you **stay in the public office** (never switched to personal), same-network PCs stay visible, and it reconnects by itself when the condition clears.
  - When the people panel sees two or more different networks, people on the same network share a `Net 1` / `Net 2` badge. Every other person's row always shows its connection: `LAN` (same network, direct) / `Internet` (relay).
  - The shared layout also travels over the internet (anyone can save, last save wins).
- 🔒 **Team office**: only people with the invite code (`PO2-…`), **same network only** (never sent over the internet). **Settings → Offices**: create (copy the code and send it), join with a code, leave. **One team at a time**: creating or joining another replaces the current one after a confirmation. ⚠️ While you are in a team office you are **out of the public office entirely** (you see its names in the people panel's public area, but you are not listed there).
- 🏠 **Personal**: a small office of your own. Agents, chat and avatar position never leave the PC; only your name card (account, nickname, character look) shows in other PCs' people list under `Personal`. PCs on 1.0.24 or older and you may not list each other. Team memberships are kept, so you go back without a code.

### Your character and chat

- Besides agents, every person has one character. Walk into any room with the **arrow keys** (walls and furniture block) and sit on lounge chairs; the spot is remembered across restarts.
- Type in the **chat bar** at the bottom centre and press **Enter** → a bubble over your character. One per person: a new one replaces it, **×** deletes it. No history. 100 characters, one per 2 seconds.
- Shortcuts: with nothing selected, **Space+Enter** = chat bar; **Esc** in the chat bar = back to the arrow keys.

### Session details (your agents only)

- **Click one of your agent characters** to open that session's whole conversation (prompts, replies, tool calls, results) in a new window. Agents folded into the lounge: click your own character and pick one. A shell shows its command's output. Only on this PC; nothing of it leaves the PC.
- It always opens in its own new window (one per agent; clicking again brings it to the front). The strip under the status line shows the last 30 minutes, one cell per minute (green edit, orange command, blue read/search, purple thinking, red failure). The status line shows how full the session's context is (e.g. `294k / 1M · 29%`, orange from 80%). The header's slider zooms the text, **×** or **Esc** closes it.

### People panel and PC notifications

- **People panel** on the right: everyone in this office (with or without agents). Click a name to jump to their agents. Someone on a different app version gets ` · v1.0.41` after the name (` · old` for 1.0.44 and older).
- **PC notifications** (Windows · Mac; they arrive with the window closed as long as the tray icon runs; each can be turned off in Settings):
  - **Join/leave**: someone enters or leaves the public office.
  - **My agents**: my Claude · Codex is waiting for me or finished. "Finished" comes only **when the main agent itself ends its turn and its subagents and shells are done too** — a subagent or shell finishing alone never notifies. With the session title and project folder, on this PC only.
  - **Chat**: someone in the office on screen posts a new bubble, once per bubble (`name: text`). Bubbles already up and those of someone who just came online are not announced.

### More

- **Profile**: character (6 humans or the pets Claudio · Gitcat), colour, nickname, your character's name tag colours. Your PC account name always comes first and cannot be changed. Nicknames are unique (whoever set it later gets a mark like `· a1b2`).
- **Language · theme**: 한국어/English and dark/light/system, per viewer. The sun/moon button at the top left switches instantly.
- **Layout editor** (the Layout button at the top left; its tools open below it): floors (one click paints a whole room, one zone at a time in the server room), walls, furniture, the background outside. The four rooms and the office size are fixed (default office 83×52, personal 50×31; top: coding room · server room, bottom: library · lounge).
  - Edits stay on this screen until **[Save]**. Buttons: **[Reset]** (the default layout, applied on save) · **[Undo]** (Ctrl+Z) · **[Redo]** (Ctrl+Y) · **[Save]** (save, share and close) · **[Cancel]** (drop every change and close; Esc too).
  - **Public and team offices**: anyone can edit; a save is shared with everyone in that office (public = the LAN plus the internet relay, team = members on the same network, encrypted). Concurrent edits: **the last save wins**. PCs on 1.0.13 or older do not get it, and the per-PC layout saved before (`layout.json`) is no longer used (import it to share it).
  - **🏠 Personal**: saved on this PC only.
  - Back to the default: **[Reset]** in the editor, then **[Save]**. Files: **Settings → Export / Import layout**.
- **Install as an app (PWA)**: in Edge · Chrome, the popup at the top right → a tab-less app window. Opening the app while the server is off shows **[Start]**.
- **Automatic updates**: checked at start and every 6 hours, downloaded silently and restarted into; open windows reload into the new version. They cannot be turned off. A version that fails to start is rolled back. Only releases that change Node need the installer (the **Update** button at the top right).
- **Replay tour**: in Settings.

## Security and privacy

- PCs exchange **status only** (read-only). Nobody can reach your terminal, agents or settings, and the UI opens only in this PC's browser.
- Everything between PCs is **encrypted**: the public office uses a per-pair X25519 key agreement + AES-256-GCM, a team office AES-256-GCM with a key derived from its invite code. Codes never go on the network; a known PC whose key changes is ignored (impersonation).
- The internet relay only **forwards** the encrypted content. It sees peer ids, public keys and recipients, and does not store IPs (it makes only a hashed tag for the same-network badge). Cloudflare, which hosts the relay, does see each PC's connecting IP address. Your avatar's position and walking are visible to everyone in the public office. Team-office and personal PCs never connect to it.
- **Always**: file paths, user names, IPs/host names, URL paths, token-like strings and AI reply text never leave the PC; commands are sent as program names only. Your PC account name is the name tag, so it is always shown.
- The public office gets only your agents' room, kind and waiting (!), never their work. A team office gets the work details within the 'Always' rule above (program names, file names and so on).
- Claude Code and Codex settings are never touched; only their transcript files are read.

## How it works

```
 [My PC]                                         [Colleague's PC]
 Claude / Codex transcripts ─▶ reporter ─┐    ┌─ reporter ◀─ transcripts
  (~/.claude, ~/.codex, WSL)             │ enc │
                                         ├◀───▶┤   UDP status every second (same network)
                                         └◀ wss ▶ Cloudflare relay ▶ public-office PCs on other networks
 browser ◀── WebSocket ── local server ◀─┘    └▶ local server ── WebSocket ──▶ browser
 (app window) http://localhost:47801                 http://localhost:47801 (app window)
```

- The reporter reads sessions changed in the last 30 minutes under `~/.claude/projects` and `~/.codex/sessions` (on Windows also those of running WSL distros). A closed Claude session leaves within seconds (after 30 minutes when its process can't be checked); a finished Codex session after 10 minutes.
- On the same network a PC silent for 5 seconds disappears (via the relay it stays until the relay reports it left; the relay drops a PC that went silent after 90 seconds). The personal layout never leaves the PC; only the public/team shared layout goes to people in that office.
- Data lives only in `~/.pixel-office/` (files with keys and codes are 0600).

| Port      | Purpose                                                         |
| --------- | --------------------------------------------------------------- |
| UDP 47800 | Status between PCs (broadcast + IPs you add)                    |
| TCP 47801 | Browser UI (`127.0.0.1` only)                                   |
| TCP 443   | **Outbound** `wss` to the public-office relay (nothing inbound) |

## Known limits

- Broadcasts stay inside one subnet. Across floors or VLANs, add the other PC's IP under **Settings → My profile → Advanced: when a PC isn't found automatically**.
- The public office can't keep out anyone who installs the app (or who just knows the address). Use a team office (same network only) to choose who joins. The admin can remove someone, but a ban is per peer id, so deleting `profile.json` avoids it.
- If a corporate proxy or firewall blocks outbound `wss` (443), the internet link fails and the chip shows `No internet connection`. Same-network PCs still show. Ask IT for an exception rather than working around it.
- Free-tier limits: 20 people at once, and the relay stops for the day when usage reaches 95 % of the limit (same network unaffected; resets at 00:00 UTC (09:00 KST)).
- A malicious relay operator could swap the public key of a first-time pair and read that pair (operator = the app's admin). There is no key fingerprint screen yet.
- Codex doesn't record approval requests, so ❗ appears for Codex only when it asks you a question.
- The redaction may miss a password typed directly into a command or search.
- Mixed versions hide things from older PCs (0.4.x: PCs with very many agents, pets; ≤ 1.0.0: people's characters and chat; ≤ 1.0.13: the shared layout). Update everyone.
- Mac notifications may appear as "Script Editor". Linux and WSL have no tray or notifications.

## Development

```bash
npm install
npm run build              # dist/ — cli.js bundles its dependencies (runs without node_modules)
node dist/cli.js --open    # http://localhost:47801
npm test                   # server + webview (Vitest)
npm run check-types && npm run lint
```

- Structure and rules: [CLAUDE.md](CLAUDE.md). Design and plan: [docs/superpowers/](docs/superpowers/).
- **Release**: bump `version` in `package.json` and push a `v<version>` tag; GitHub Actions builds the Windows and Mac installers and the auto-update bundle into a Release. A tag with `-` is a prerelease; a full release deletes the older ones.

## Credits

- Original: [pixel-agents](https://github.com/pixel-agents-hq/pixel-agents) (MIT). The office engine, layout editor and furniture assets come from it.
- Characters: [JIK-A-4, Metro City](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack)
- Font: [Pretendard](https://github.com/orioncactus/pretendard) (SIL OFL 1.1)

<p align="center">
  <img src="webview-ui/public/characters.png" alt="Characters" width="320" height="72" style="image-rendering: pixelated;">
</p>

## License

[MIT](LICENSE). The original pixel-agents copyright notice is kept.
