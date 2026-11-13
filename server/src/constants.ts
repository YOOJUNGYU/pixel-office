/** Valid explicit TCP port range for --port. */
export const MIN_PORT = 1;
export const MAX_PORT = 65_535;

/** Account name when neither the OS login nor the hostname is usable. */
export const ACCOUNT_FALLBACK = 'PC';

/** Default HTTP bind address: the UI is served to this PC's browser only. */
export const LAN_HTTP_HOST = '127.0.0.1';

/** Host-header names a privileged (loopback) browser may use. See httpServer.isLoopback. */
export const LOOPBACK_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]'] as const;
/** Remote addresses that count as this machine. */
export const LOOPBACK_ADDRESSES = ['127.0.0.1', '::1', '::ffff:127.0.0.1'] as const;

/** /ws close code for any connection that is not isLoopback (another PC, a
 *  foreign Host or Origin). WebSocket connects bypass CORS, so this also rejects
 *  drive-by web pages. */
export const WS_CLOSE_FORBIDDEN = 4003;

// ── Layout/Config Persistence ──────────────────────────────
/** Data directory under the user's home (layout.json, config.json). */
export const LAYOUT_FILE_DIR = '.pixel-office';
export const LAYOUT_FILE_NAME = 'layout.json';
/** Personal mode's own layout (editing one office never changes the other). */
export const PERSONAL_LAYOUT_FILE_NAME = 'layout-personal.json';
/** Shared (public + team) office layouts, synced with peers: { channels: { [view]: {rev, by, layout} } }. */
export const SHARED_LAYOUT_FILE_NAME = 'layout-shared.json';
/** Bundled personal default (scripts/generate-lan-layout.mjs --personal). */
export const PERSONAL_DEFAULT_LAYOUT_FILE = 'default-layout-personal.json';
export const LAYOUT_REVISION_KEY = 'layoutRevision';
export const CONFIG_FILE_NAME = 'config.json';

// ── LAN session state ──────────────────────────────────────
/** A room change must hold this long before the agent moves. */
export const ROOM_DEBOUNCE_MS = 3_000;
/** Non-exempt tool pending this long with no new line => waiting for approval. */
export const PERMISSION_DELAY_MS = 7_000;
/** Text-only turn with no tool pending this long => idle. */
export const TEXT_IDLE_DELAY_MS = 5_000;

// ── LAN transcript scanner ─────────────────────────────────
/** Main session hidden once its transcript is unchanged this long. */
export const SESSION_TTL_MS = 30 * 60_000;
/** Subagent transcript unchanged this long => removed. */
export const CHILD_IDLE_TTL_MS = 120_000;
/** Subagent hidden this long after its turn ended. */
export const CHILD_ENDED_HIDE_MS = 10_000;
/** A subagent talks with its parent this long (task handed over, result reported, SendMessage).
 *  Shorter than CHILD_ENDED_HIDE_MS, so a finished child still shows while it reports. */
export const TALK_MS = 5_000;
/** A failed tool result shows on the agent (AgentView.fail) this long. */
export const FAIL_SHOW_MS = 8_000;
/** Claude transcripts don't say the context window: 200k, or the 1M one once more is in use. */
export const CLAUDE_CONTEXT_WINDOW = 200_000;
export const CLAUDE_CONTEXT_WINDOW_LARGE = 1_000_000;
/** A transcript line stamped further ahead than this (a skewed clock) counts as read now. */
export const LINE_CLOCK_SLACK_MS = 60_000;
/** A SendMessage whose recipient's transcript isn't tracked yet waits this long for it (discover cycle). */
export const TALK_PENDING_MS = 15_000;
/** Bytes replayed from the end of a newly found transcript. */
export const TAIL_BYTES = 64 * 1024;
/** How far before the tail a Claude transcript is searched for its last permissionMode (a long
 *  autonomous turn writes none for MBs; without it every long command looks like a prompt). */
export const PERMISSION_MODE_SCAN_BYTES = 16 * 1024 * 1024;
/** Max bytes read to find a Codex rollout's first (session_meta) line. */
export const CODEX_META_MAX_BYTES = 256 * 1024;
export const DISCOVER_INTERVAL_MS = 10_000;
export const POLL_INTERVAL_MS = 1_000;
export const WSL_LIST_TIMEOUT_MS = 3_000;
/** Claude's live-session registry: `<CLAUDE_CONFIG_DIR>/sessions/<pid>.json` (sibling of `projects`). */
export const CLAUDE_SESSIONS_DIR_NAME = 'sessions';
/** One `wsl.exe` per running distro per discover cycle checks the registry pids in that distro. */
export const WSL_PROC_TIMEOUT_MS = 3_000;
/** A Codex session whose turn ended (task_complete / turn_aborted) leaves after this since its last line. */
export const CODEX_ENDED_TTL_MS = 10 * 60_000;
/** A Codex shell nobody polled for this long leaves: Codex records an exit only when the model
 *  polls the process again (write_stdin), so an unpolled one would otherwise run forever. */
export const CODEX_SHELL_IDLE_MS = 3 * 60_000;

// ── LAN office wiring ──────────────────────────────────────
/** `GET /api/ping` answer that marks a running Pixel Office (single-instance check). */
export const PING_APP = 'pixel-office';
export const PING_TIMEOUT_MS = 1_000;
/** officeSnapshot push interval per WebSocket. */
export const SNAPSHOT_INTERVAL_MS = 1_000;
/** `POST /api/quit`: delay before exit so the reply reaches the caller. */
export const QUIT_DELAY_MS = 100;
/** `--open` at start: wait this long for a "server is off" page's health poll (webview polls every 1 s) before opening a window. */
export const OPEN_WAIT_MS = 1_500;

// ── Updates (GitHub Releases) ──────────────────────────────
/** First automatic update check, this long after the server listens; then every UPDATE_RECHECK_MS. */
export const UPDATE_FIRST_CHECK_MS = 300;
export const UPDATE_RECHECK_MS = 6 * 60 * 60_000;
export const UPDATE_API_TIMEOUT_MS = 15_000;
export const UPDATE_DOWNLOAD_TIMEOUT_MS = 10 * 60_000;
/** After an installer launch, further installUpdate requests are ignored this long (UAC cancel can retry after). */
export const INSTALL_RELAUNCH_GUARD_MS = 60_000;
/** Downloaded installers, under the data directory. */
export const UPDATES_DIR_NAME = 'updates';
/** In UPDATES_DIR_NAME: written on [Update], read (and deleted) by the next start — whether to open a window. */
export const REOPEN_MARKER_NAME = 'reopen';
/** An older marker is stale (the update never ran): ignored. */
export const REOPEN_MARKER_TTL_MS = 30 * 60_000;
/** `PIXEL_OFFICE_NO_PEERS=1`: no UDP peers (tests must never broadcast on the real LAN). */
export const NO_PEERS_ENV = 'PIXEL_OFFICE_NO_PEERS';
/** Test only: two instances on one host. `PIXEL_OFFICE_UDP_PORT=47810` binds that UDP port and
 *  `PIXEL_OFFICE_UDP_TARGETS=127.0.0.1:47811` replaces broadcast + manual peers ("host:port", comma-separated). */
export const UDP_PORT_ENV = 'PIXEL_OFFICE_UDP_PORT';
export const UDP_TARGETS_ENV = 'PIXEL_OFFICE_UDP_TARGETS';
/** Opt in to prereleases (rc testing): `PIXEL_OFFICE_ALLOW_PRERELEASE=1`. */
export const ALLOW_PRERELEASE_ENV = 'PIXEL_OFFICE_ALLOW_PRERELEASE';

// ── Silent app updates (~/.pixel-office/app/<version>/ = a release's dist/) ──
/** Tests only: releases API URL on 127.0.0.1/localhost; downloads then come from that origin. */
export const UPDATE_API_ENV = 'PIXEL_OFFICE_UPDATE_API';
/** Dev/tests: restart into a staged update on Linux too (default there: next start). */
export const UPDATE_RESPAWN_ENV = 'PIXEL_OFFICE_UPDATE_RESPAWN';
export const APP_DIR_NAME = 'app';
/** In APP_DIR_NAME: `bad-<version>` = failed to start once, never booted again. */
export const APP_BAD_PREFIX = 'bad-';
/** Inside each bundle: {version, node} (node = the exact runtime it was built for). */
export const APP_MANIFEST_NAME = 'app.json';
/** Newest versions kept in APP_DIR_NAME (the running one is never removed). */
export const APP_KEEP_VERSIONS = 2;
export const APP_BUNDLE_MAX_BYTES = 100 * 1024 * 1024;
export const APP_BUNDLE_MAX_UNPACKED_BYTES = 400 * 1024 * 1024;
/** An updated bundle not listening this long after boot gets a strike (generous: AV scans at login). */
export const APP_BOOT_TIMEOUT_MS = 180_000;
/** In APP_DIR_NAME: `strikes-<version>` = failures the bundle itself caused since it last proved healthy. */
export const APP_STRIKES_PREFIX = 'strikes-';
/** This many strikes in a row → `bad-<version>`. */
export const APP_MAX_STRIKES = 2;
/** Running this long after listening without a crash proves a version healthy (strikes cleared). */
export const APP_HEALTHY_MS = 3 * 60_000;
/** A failed stage (download, checksum, rename…) of a version is not retried for this long. */
export const UPDATE_STAGE_BACKOFF_MS = 24 * 60 * 60_000;
/** Renaming the unpacked bundle into place: tries (Windows AV may hold a handle) and the delay between. */
export const APP_RENAME_TRIES = 5;
export const APP_RENAME_RETRY_MS = 500;
/** Exit code of a restart into an update / a failed boot: non-zero so launchd's KeepAlive respawns us. */
export const UPDATE_RESTART_EXIT_CODE = 75;
/** launchd sets XPC_SERVICE_NAME to the job label in the jobs it starts. */
export const MAC_AGENT_LABEL = 'com.pixeloffice.agent';

// ── Start at login (lan/autostart.ts) ──────────────────────
/** Installed Windows layout: `<install dir>\PixelOffice.exe` (scripts/package/launcher) next to node.exe. */
export const WIN_LAUNCHER_NAME = 'PixelOffice.exe';
/** The launcher of installs up to 1.0.3 (wscript + VBS), kept for those still on that installer. */
export const WIN_LEGACY_LAUNCHER_NAME = 'launch.vbs';
/** Per-user Startup folder under %APPDATA%, and the shortcut placed there. */
export const WIN_STARTUP_SUBDIR = ['Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'];
export const WIN_STARTUP_LINK_NAME = 'Pixel Office.lnk';
export const WIN_DEFAULT_SYSTEM_ROOT = 'C:\\Windows';
export const AUTOSTART_EXEC_TIMEOUT_MS = 15_000;
/** Installed macOS layout: the LaunchAgent template sits next to node in Contents/Resources. */
export const MAC_AGENT_PLIST_NAME = 'com.pixeloffice.agent.plist';
export const MAC_LAUNCH_AGENTS_SUBDIR = ['Library', 'LaunchAgents'];
/** Marker in the data dir: the user turned start-at-login off; a silent update must not undo it. */
export const AUTOSTART_OFF_MARKER = 'autostart-off';

// ── Tray icon (lan/tray.ts) ────────────────────────────────
/** `PIXEL_OFFICE_NO_TRAY=1`: no tray helper (tests, CI smoke runs). */
export const NO_TRAY_ENV = 'PIXEL_OFFICE_NO_TRAY';
/** Set for the helper by `--tray-check`: build the icon, print `ready`, exit. */
export const TRAY_SMOKE_ENV = 'PO_TRAY_SMOKE';
/** Windows tray helper (scripts/package/tray/PixelOfficeTray.cs), installed next to node.exe. */
export const WIN_TRAY_EXE_NAME = 'PixelOfficeTray.exe';
/** macOS: the icon the installer puts next to node. */
export const MAC_TRAY_ICON_NAME = 'AppIcon.icns';
export const MAC_OSASCRIPT = '/usr/bin/osascript';
/** `--tray-check`: a cold first start (AV scan, .NET JIT) can be slow. */
export const TRAY_CHECK_TIMEOUT_MS = 60_000;

// ── v2 wire crypto (lan/crypto.ts) ─────────────────────────
/** HKDF salts/infos: public-office pair keys and team-office keys. */
export const PUB_KEY_SALT = 'pixel-office/v2/pub';
export const TEAM_KEY_SALT = 'pixel-office/v2/team';
export const TEAM_KEY_INFO = 'key';
/** HMAC message whose first TEAM_TAG_BYTES identify a team on the wire. */
export const TEAM_TAG_INFO = 'tag';
export const TEAM_TAG_BYTES = 8;
export const KEY_BYTES = 32;
export const X25519_PUBLIC_KEY_BYTES = 32;
/** SPKI DER header that wraps a raw 32-byte X25519 public key. */
export const X25519_SPKI_PREFIX = '302a300506032b656e032100';
export const GCM_NONCE_BYTES = 12;
export const GCM_TAG_BYTES = 16;
/** Invite secret: 13 bytes = 104 bits = 21 Crockford base32 chars, shown as PO2-XXXX-…. */
export const INVITE_SECRET_BYTES = 13;
export const INVITE_PREFIX = 'PO2';
export const INVITE_GROUP_LEN = 4;
export const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

// ── v2 peer protocol / offices (lan/peerNet.ts, lan/profile.ts) ──
/** Every PeerNet datagram fits this on the wire: below 1472 (1500 MTU − IP/UDP) and
 *  typical VPN MTUs, so nothing relies on IP fragments (some networks drop them). */
export const MAX_DATAGRAM_BYTES = 1_200;
/** Deflated presence bytes per `pub`/`team` part (a pub with 64-char ids still fits MAX_DATAGRAM_BYTES). */
export const PRESENCE_PART_BYTES = 420;
/** Parts per presence; fitPacket trims trailing views until it fits (with room for seq/office). */
export const MAX_PRESENCE_PARTS = 48;
export const PRESENCE_MAX_COMPRESSED = MAX_PRESENCE_PARTS * PRESENCE_PART_BYTES - 512;
/** Presence JSON cap before deflate (the receiver inflates at most MAX_PACKET_BYTES). */
export const PRESENCE_MAX_JSON = 58_000;
/** A split presence must complete within this; otherwise the last complete one stays. */
export const PRESENCE_ASSEMBLY_MS = 2_000;
/** Split presences being assembled at once (one per channel + sender). */
export const MAX_PRESENCE_ASSEMBLIES = 256;
// Shared layouts (lan/peerNet.ts): a PC with a newer layout pushes it to lagging peers.
/** Deflated layout bytes per `pub`/`team` layout part (same budget as a presence part). */
export const LAYOUT_PART_BYTES = PRESENCE_PART_BYTES;
/** Parts per layout (~200 KB deflated; a 128×128 office is far less). */
export const MAX_LAYOUT_PARTS = 512;
/** Inflated layout JSON cap. */
export const MAX_LAYOUT_JSON = 8_000_000;
/** A lagging peer (or a team channel) gets the layout again at most this often. */
export const LAYOUT_PUSH_MS = 5_000;
/** An unfinished layout assembly is dropped after this (a later push starts over). */
export const LAYOUT_ASSEMBLY_MS = 30_000;
/** TOFU pins: peer id → public key (0600), oldest dropped past MAX_KNOWN_PEERS. */
export const KNOWN_PEERS_FILE_NAME = 'known-peers.json';
export const MAX_KNOWN_PEERS = 1_000;
/** New pins are written at most this often (a hello flood must not hammer the disk). */
export const PIN_SAVE_DELAY_MS = 1_000;
/** Public-office peers tracked at once; hellos from further new ids are ignored. */
export const MAX_HELLO_PEERS = 256;
/** A received hello is answered with a unicast hello at most this often per peer (< PEER_TTL_MS). */
export const HELLO_REPLY_MS = 2_000;
/** Distinct once-only UDP warnings (ids/addresses come from the network); then logging stops. */
export const MAX_WARN_KEYS = 256;
/** Replay guard: last seq per (channel, sender) is remembered this long. */
export const SEQ_MEMORY_MS = 10 * 60_000;
export const MAX_OFFICES = 1;
export const MAX_OFFICE_NAME = 20;
/** Avatar moves: presence to peers (and snapshots of peers' moves to the UI) coalesce to ≤ 5 per second. */
export const AVATAR_SEND_DELAY_MS = 200;
/** Avatar moves are written to profile.json at most this often. */
export const AVATAR_SAVE_DELAY_MS = 2_000;

// ── App window (lan/appWindow.ts) ──────────────────────────
/** Chromium web app id length: first 16 bytes of the (double) SHA-256, as letters a-p. */
export const WEB_APP_ID_BYTES = 16;

// ── OS notifications (lan/notify.ts, through the tray helper) ──
/** A peer gone this long is reported as left; back sooner = nothing (presence TTL is ~5 s). */
export const PRESENCE_LEAVE_GRACE_MS = 10_000;
/** After a view switch / start, people seen this soon after the first tick count as already there. */
export const PRESENCE_SETTLE_MS = 5_000;
/** Peer names (untrusted) are clipped to this many code points in a notification. */
export const NOTIFY_NAME_MAX = 40;
/** An agent's waiting context (command, file…) is clipped to this many code points. */
export const NOTIFY_CONTEXT_MAX = 60;
/** Whole notification body; Windows balloon text is capped at 255 chars. */
export const NOTIFY_BODY_MAX = 250;
/** A session's title (or prompt) in a single-agent notification. */
export const NOTIFY_TITLE_MAX = 60;
/** …and per line when several agents are merged into one notification. */
export const NOTIFY_TITLE_SHORT_MAX = 24;
/** A session's first prompt is kept (local only) up to this many chars as its fallback title. */
export const SESSION_PROMPT_MAX = 200;
/** A session title in this PC's own bubble header (AgentView.title, local only), code points. */
export const VIEW_TITLE_MAX = 60;
/** Codex `session_index.jsonl` (thread names): only its last this-many bytes are read. */
export const CODEX_INDEX_MAX_BYTES = 256 * 1024;
/** Transcript panel: one entry's text is clipped to this many chars (meta lines: the second). */
export const TRANSCRIPT_ENTRY_MAX_CHARS = 200_000;
export const TRANSCRIPT_META_MAX_CHARS = 500;
export const TRANSCRIPT_PAGE_BYTES = 512 * 1024;
/** An open transcript is re-checked for new lines this often. */
/** Transcripts one UI socket may follow at once (dialogs / popout windows); past it the oldest closes. */
export const TRANSCRIPT_MAX_OPEN = 8;
export const TRANSCRIPT_POLL_MS = 1000;

/** Internet public-office relay (Cloudflare Worker). '' = off. */
export const RELAY_URL = 'wss://pixel-office-relay.pixel-office-relay.workers.dev/ws';
export const RELAY_URL_ENV = 'PIXEL_OFFICE_RELAY_URL';
/** setRelayAdminToken: longest token accepted (asyncapi maxLength). */
export const RELAY_ADMIN_TOKEN_MAX = 256;
export const RELAY_MIN_SEND_MS = 1_000;
/** Frames sent to the relay in one tick at most (each is one billed message); the rest wait. */
export const RELAY_MAX_FRAMES_PER_TICK = 2;
export const RELAY_RETRY_MIN_MS = 5_000;
export const RELAY_RETRY_MAX_MS = 5 * 60_000;
export const RELAY_RETRY_FULL_MS = 5 * 60_000;
/** Spread for `full` retries, so a crowd turned away together does not return together. */
export const RELAY_RETRY_FULL_JITTER_MS = 60_000;
/** Spread of budget-reset reconnects (0..this) so every PC does not return at once. */
export const RELAY_RETRY_JITTER_MS = 10 * 60_000;
/** Text 'ping' (the relay answers 'pong' without waking). */
export const RELAY_PING_MS = 30_000;
/** No message (pong included) for this long on an open relay socket = half-open: drop it. */
export const RELAY_PONG_TIMEOUT_MS = 2 * RELAY_PING_MS;
/** A socket not open after this long is abandoned (blackholed host). */
export const RELAY_CONNECT_TIMEOUT_MS = 15_000;

/** Token usage: burn rate is averaged over this window. */
export const USAGE_RATE_WINDOW_MS = 120_000;
/** Token usage: a tool result of at least this many tokens (chars / USAGE_CHARS_PER_TOKEN) is "big". */
export const USAGE_BIG_RESULT_TOKENS = 50_000;
export const USAGE_CHARS_PER_TOKEN = 4;
/** Token usage: Claude message ids kept per file whatever their age (snapshots of one message). */
export const USAGE_MSG_KEEP = 64;
/** Token usage index: file name in the data dir, full rescan period, stored format, write coalescing. */
export const USAGE_FILE = 'usage.json';
export const USAGE_RESCAN_MS = 600_000;
export const USAGE_VERSION = 1;
export const USAGE_SAVE_DELAY_MS = 5_000;
/** Token usage: bytes read per step while folding a transcript (the loop yields between steps). */
export const USAGE_READ_CHUNK_BYTES = 8 * 1024 * 1024;
