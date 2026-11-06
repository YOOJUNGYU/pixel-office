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

![The whole office](docs/images/office-en.png)

See at a glance who is doing what, with which agent (Claude Code / Codex). Pick one of three offices (switch any time with the buttons at the top):

- 🌐 **Public office** (default): everyone with the app, on any network (same network directly, others through the internet relay).
- 🔒 **Team office**: teammates with the invite code, same network only.
- 🏠 **Personal**: your PC alone; agents and chat never leave it.

> A fork of [pixel-agents](https://github.com/pixel-agents-hq/pixel-agents) (MIT). The original shows the Claude Code agents of your own PC; this fork adds LAN and internet sharing, Codex and installers, and drops agent launching, the terminal and the VS Code extension. It only watches: agents keep running in the CLI or desktop app you already use.

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

| Room           | Activity                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------ |
| 🖥️ Coding Room | Editing files (Claude `Edit`/`Write`, Codex `apply_patch`)                                       |
| 📚 Library     | Reading files, searching code or the web (incl. Codex read commands like `rg`, `cat`, `git log`) |
| 🗄️ Server Room | Running commands (`Bash`, Codex shell), background shells                                        |
| 🛋️ Lounge      | Waiting for input or approval, turn finished — merged into its PC's person character             |

- **Name tags**: one line — a **MAIN** / **SUB** / **SHELL** badge, `#number`, the nickname (else the PC account). People's own characters always show their tag, in the colours each person picks in their profile (yours with a yellow frame).
- **Bubble**: every working agent shows a Claude / Codex badge, the session title (your own agents only) and what it is doing over its head (up to 5 lines in the public and personal offices); hover for the full text. A **red !** overhead = waiting for you (over the person's character when the agent has merged into it in the lounge).
- A working agent's bubble shows an icon for what it does, task progress (3/7) and how long the current step has run (orange when long); a failed tool shows a drop beside its head for a moment. Zoomed out, the bubble is the icon alone (shrinking with the characters). My own agents' name tags end with their context use (`29%`, this PC only). The hover bubble, room cards and the session window also show the lines the session changed (`+120 −30`). Edit/read icons take the file's language colour (ts blue, py yellow, …). An agent's PC screen follows what it does too (edit = green code, run = a black terminal, reading/searching = a white page). Working PCs glow in their screen's colour (server-room PCs, monitor and tower), edits float up as `+12 −3`, a failed tool flashes the PC red with a puff of smoke, and finishing a task list or a turn sets off confetti (all from real changes in the session records). While a command runs in the server room, its PCs' LEDs blink.
- **Subagents and shells** hold their parent's hand in the same room, and work on their own in another.
- **Map**: drag to pan, wheel to zoom (or + / − at the top left).

![Hover bubble](docs/images/hover-en.png)

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
  - **My agents**: my Claude · Codex is waiting for me or finished (once its subagents and background shells are done too; with the session title and project folder, on this PC only).
  - **Chat**: someone in the office on screen posts a new bubble, once per bubble (`name: text`). Bubbles already up and those of someone who just came online are not announced.

### More

- **Profile**: character (6 humans or the pets Claudio · Gitcat), colour, nickname, your character's name tag colours. Your PC account name always comes first and cannot be changed. Nicknames are unique (whoever set it later gets a mark like `· a1b2`).
- **Language · theme**: 한국어/English and dark/light/system, per viewer. The sun/moon button at the top left switches instantly.
- **Layout editor**: floors (one click paints a whole room), walls, furniture, the background outside. The four rooms and the office size are fixed (default office 83×54; top: coding room · server room, bottom: library · lounge).
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
