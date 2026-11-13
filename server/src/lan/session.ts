import type {
  Act,
  AgentDiff,
  AgentTodo,
  AgentView,
  Provider,
  Room,
  ServerZone,
} from '../../../core/src/lan.js';
import { AGE_MAX_SEC, DIFF_MAX, TODO_MAX } from '../../../core/src/lan.js';
import {
  CODEX_SHELL_IDLE_MS,
  LINE_CLOCK_SLACK_MS,
  PERMISSION_DELAY_MS,
  ROOM_DEBOUNCE_MS,
  SESSION_PROMPT_MAX,
  TEXT_IDLE_DELAY_MS,
} from '../constants.js';

export { PERMISSION_DELAY_MS, ROOM_DEBOUNCE_MS, TEXT_IDLE_DELAY_MS };

export interface SessionState {
  provider: Provider;
  id: string;
  kind: 'main' | 'subagent';
  num: number;
  parentId?: string;
  /** displayed room */
  room: Room;
  /** 서버실 zone of the latest shell command (sent while the room is 서버실). */
  zone: ServerZone;
  candidate: Room;
  candidateSince: number;
  act: Act;
  target: string;
  /** target to share with peers (always): a command becomes its program name or description */
  brief: string;
  reason: string;
  permission: boolean;
  /** Claude permission mode never prompts (bypassPermissions, auto, dontAsk): no approval guess */
  bypass: boolean;
  lastLineAt: number;
  /** The current line's own timestamp (ms epoch; read time when it has none or a bad one). */
  lineAt: number;
  /** When (act, target, permission) last changed, in line time: AgentView.ageSec. */
  actSince: number;
  actSig: string;
  /** A tool result failed: AgentView.fail until then (ms epoch, read time); 0 = none. */
  failUntil: number;
  /** Task list progress (counts only, never the items); null = no list. */
  todo: AgentTodo | null;
  /** Lines added / removed by this session's edits (from what was read of the transcript). */
  diff: AgentDiff;
  pendingTool: { name: string; since: number; exempt: boolean } | null;
  textOnlyAt: number | null;
  turnEnded: boolean;
  /** Subagent: talking with its parent until then (ms epoch); 0 = not talking. */
  talkUntil: number;
  /** Claude main: SendMessage sent to this agent id at `at`, not yet matched to a tracked subagent. */
  talkTo: { to: string; at: number } | null;
  /** shellId -> target (command or its description) and its brief */
  /** Running background shells. `command` / `output` (Claude's output file) are LOCAL ONLY:
   *  only the transcript panel reads them, never views()/packets. */
  shells: Map<
    string,
    {
      target: string;
      brief: string;
      since: number;
      zone: ServerZone;
      command?: string;
      output?: string;
      /** Codex: last line naming this process (start or poll); see CODEX_SHELL_IDLE_MS. */
      seen?: number;
    }
  >;
  /** LOCAL ONLY (notifications on this PC): never copied into an AgentView, so never sent. */
  local: LocalInfo;
}

/** What a session is about, picked up from the tailed lines. */
export interface LocalInfo {
  /** Claude: renamed by the user (wins over aiTitle) */
  customTitle: string;
  /** Claude: latest auto title */
  aiTitle: string;
  /** first real user prompt seen (clipped) */
  prompt: string;
  cwd: string;
  /** Context window use of the last model call (session window only, never sent). */
  context?: { used: number; window: number };
}

export function newSession(
  provider: Provider,
  id: string,
  kind: 'main' | 'subagent',
  now: number,
  parentId?: string,
): SessionState {
  return {
    provider,
    id,
    kind,
    num: 0,
    parentId,
    room: 'lounge',
    zone: 'run',
    candidate: 'lounge',
    candidateSince: now,
    act: 'idle',
    target: '',
    brief: '',
    reason: '',
    permission: false,
    bypass: false,
    lastLineAt: now,
    lineAt: now,
    actSince: now,
    actSig: 'idle',
    failUntil: 0,
    todo: null,
    diff: { add: 0, del: 0 },
    pendingTool: null,
    textOnlyAt: null,
    turnEnded: false,
    talkUntil: 0,
    talkTo: null,
    shells: new Map(),
    local: { customTitle: '', aiTitle: '', prompt: '', cwd: '' },
  };
}

function setCandidate(s: SessionState, room: Room, now: number): void {
  if (room !== s.candidate) {
    s.candidate = room;
    s.candidateSince = now;
  }
}

const LIBRARY_CMD =
  /^(?:(?:rg|grep|egrep|cat|head|tail|ls|find|fd|wc|nl|tree|less|sort|uniq|cut|pwd|echo|stat|file|du|which)\b|sed\s+-n\b|git\s+(?:log|show|diff|status|grep|blame)\b)/;
/** Redirects that write nothing: `2>/dev/null`, `2>&1`. */
const HARMLESS_REDIRECT = /\d*>>?\s*\/dev\/null|\d*>&\d/g;

/** Splits a shell command at unquoted `|`, `||`, `&&`, `;` and newlines. */
function shellSegments(cmd: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote = '';
  for (let k = 0; k < cmd.length; k++) {
    const c = cmd[k];
    if (quote) {
      if (c === '\\' && quote === '"') cur += c + (cmd[++k] ?? '');
      else cur += c;
      if (c === quote) quote = '';
    } else if (c === '"' || c === "'") {
      quote = c;
      cur += c;
    } else if (c === '|' || c === ';' || c === '\n' || (c === '&' && cmd[k + 1] === '&')) {
      if (c === '&' || (c === '|' && cmd[k + 1] === '|')) k++;
      out.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  out.push(cur.trim());
  return out.map(bare).filter(Boolean);
}

/** Wrappers that only run the real command: `command grep` = `grep`, `timeout 60 npm test` =
 *  `npm test`, `FOO=1 node x` = `node x`. */
const WRAPPER =
  /^(?:(?:command|builtin|exec|time|nice|nohup|sudo|env)\s+|timeout\s+(?:-\S+\s+)*\d\S*\s+|\w+=\S*\s+)/;
function bare(seg: string): string {
  let s = seg;
  for (let t = s.replace(WRAPPER, ''); t !== s; t = s.replace(WRAPPER, '')) s = t;
  return s;
}

/**
 * 자료실 for a command that only reads (every segment a reader, `cd` skipped, no write
 * redirect), else 서버실.
 */
export function classifyShell(cmd: string): Room {
  const segs = shellSegments(cmd).filter((s) => !/^cd\b/.test(s));
  const reads = segs.every(
    (s) => LIBRARY_CMD.test(s) && !s.replace(HARMLESS_REDIRECT, '').includes('>'),
  );
  return segs.length && reads ? 'library' : 'server';
}

const PKG = String.raw`(?:npm|pnpm|yarn|bun|deno)\s+(?:run\s+)?`;
// Ambiguous commands are spread on purpose (so 실행 is not where nearly everything lands):
// checks against a running thing (verify/e2e/smoke, curl, browser drivers) count as tests;
// installs, code generation, migrations and file shuffling as building; worktrees and PRs
// as git.
const TEST_CMD = new RegExp(
  String.raw`\b(?:vitest|jest|pytest|mocha|rspec|phpunit|playwright|unittest|agent-browser|curl|wget|httpie?)\b|` +
    String.raw`\b(?:verify|e2e|smoke|gate)\b|\bnode\s+--test\b|` +
    String.raw`\b(?:cargo|go|dotnet|mvn|gradle|bun|deno)\s+test\b|${PKG}test(?::[\w:-]+)?\b`,
);
const BUILD_CMD = new RegExp(
  String.raw`\b(?:tsc|esbuild|webpack|rollup|make|cmake|eslint|prettier|ruff|biome|gradle|mvn|prisma|docker)\b|` +
    String.raw`\b(?:vite|cargo|go|dotnet)\s+build\b|` +
    String.raw`${PKG}(?:build|lint|format|compile|typecheck|check-types|generate|codegen|migrate)(?::[\w:-]+)?\b|` +
    String.raw`\b(?:npm|pnpm|yarn|bun|pip3?|uv|cargo)\s+(?:install|i|ci|add|sync)\b|` +
    String.raw`^(?:mkdir|rm|cp|mv|touch|chmod|ln|tar|unzip|zip|rsync)\b`,
);
const GIT_CMD = /(?:^|\s)(?:git|gh)\s|\b(?:wt|worktree)\s|\bpr\b/;

/**
 * 서버실 zone of a command: the last segment (`cd` and plain readers skipped) that is a test,
 * build or git command decides (`npm run build && npm test` = test, `pnpm lint && git commit`
 * = git); none = run.
 */
export function shellZone(cmd: string): ServerZone {
  const segs = shellSegments(cmd).filter((s) => !/^cd\b/.test(s) && !LIBRARY_CMD.test(s));
  for (const s of segs.reverse()) {
    if (TEST_CMD.test(s)) return 'test';
    if (BUILD_CMD.test(s)) return 'build';
    if (GIT_CMD.test(` ${s}`)) return 'git';
  }
  return 'run';
}

/** Program name of a shell command: first token after `KEY=value` assignments, basename. */
export function programName(cmd: string): string {
  const tok = cmd
    .trim()
    .split(/\s+/)
    .find((t) => !/^\w+=/.test(t));
  return (
    (tok ?? '')
      .replace(/^["'`(]+|["'`;)&|]+$/g, '')
      .split(/[\\/]/)
      .pop() ?? ''
  );
}

/** room=null keeps the current room. brief defaults to target. */
export function setActivity(
  s: SessionState,
  room: Room | null,
  act: Act,
  target: string,
  now: number,
  brief: string = target,
): void {
  if (room) setCandidate(s, room, now);
  s.act = act;
  s.target = target;
  s.brief = brief;
  s.permission = false;
  s.turnEnded = false;
  s.textOnlyAt = null;
}

/**
 * A turn started and no tool runs yet (thinking, writing a reply): 자료실. Sent as the
 * existing act `tool` with no target (viewers show "생각 중"): ≤ 1.0.7 peers drop a
 * whole packet on an act they don't know.
 */
export function setThinking(s: SessionState, now: number): void {
  setActivity(s, 'library', 'tool', '', now);
}

/** A real user prompt (not a command wrapper, environment/AGENTS.md preamble or interrupt). */
export const isPrompt = (text: string): boolean => {
  const t = text.trim();
  return !!t && !/^(<|\[Request interrupted|Caveat:|# AGENTS\.md)/.test(t);
};

export function setIdle(s: SessionState, now: number): void {
  setCandidate(s, 'lounge', now);
  s.act = 'idle';
  s.target = '';
  s.brief = '';
  s.pendingTool = null;
  s.permission = false;
  s.turnEnded = true;
  // A finished list is not left hanging over the next turn.
  if (s.todo && s.todo.done >= s.todo.total) s.todo = null;
}

/** A line's own `timestamp` (ISO) in ms; missing, bad or ahead of the clock → `now`. */
export function lineTime(raw: unknown, now: number): number {
  const t = typeof raw === 'string' ? Date.parse(raw) : NaN;
  return Number.isFinite(t) && t <= now + LINE_CLOCK_SLACK_MS ? t : now;
}

/** Restarts the act clock when what the agent shows changed (after a line or a tick). */
export function noteAct(s: SessionState): void {
  const sig = `${s.act}\0${s.target}\0${String(s.permission)}`;
  if (sig === s.actSig) return;
  s.actSig = sig;
  s.actSince = s.lineAt;
}

/** Task list progress from statuses (one per item): null when the list is empty. */
export function todoOf(statuses: string[]): AgentTodo | null {
  const total = Math.min(statuses.length, TODO_MAX);
  if (!total) return null;
  return { done: Math.min(statuses.filter((x) => x === 'completed').length, total), total };
}

const linesOf = (t: string): string[] => (t ? t.replace(/\n$/, '').split('\n') : []);

/** Lines removed / added going from `before` to `after`, as multisets (moved lines are free). */
export function lineDiff(before: string, after: string): AgentDiff {
  const left = new Map<string, number>();
  for (const l of linesOf(before)) left.set(l, (left.get(l) ?? 0) + 1);
  let add = 0;
  for (const l of linesOf(after)) {
    const n = left.get(l) ?? 0;
    if (n > 0) left.set(l, n - 1);
    else add++;
  }
  let del = 0;
  for (const n of left.values()) del += n;
  return { add, del };
}

/** `+` / `-` body lines of an apply_patch text (headers `***`, `+++`, `---` not counted). */
export function patchDiff(patch: string): AgentDiff {
  let add = 0;
  let del = 0;
  for (const l of patch.split('\n')) {
    if (l.startsWith('+') && !l.startsWith('+++')) add++;
    else if (l.startsWith('-') && !l.startsWith('---')) del++;
  }
  return { add, del };
}

export function addDiff(s: SessionState, d: AgentDiff): void {
  s.diff = {
    add: Math.min(DIFF_MAX, s.diff.add + d.add),
    del: Math.min(DIFF_MAX, s.diff.del + d.del),
  };
}

const ageOf = (since: number, now: number): number =>
  Math.min(AGE_MAX_SEC, Math.max(0, Math.floor((now - since) / 1000)));

export function tick(s: SessionState, now: number): void {
  const p = s.pendingTool;
  // A silent tool is only a guess at an approval prompt (a long command looks the same):
  // show ❗ in place, never under bypassPermissions.
  if (p && !p.exempt && !s.bypass && now - s.lastLineAt >= PERMISSION_DELAY_MS) {
    s.permission = true;
  }
  if (s.textOnlyAt !== null && !s.pendingTool && now - s.textOnlyAt >= TEXT_IDLE_DELAY_MS) {
    setIdle(s, now);
    s.textOnlyAt = null;
  }
  if (s.candidate !== s.room && now - s.candidateSince >= ROOM_DEBOUNCE_MS) s.room = s.candidate;
}

/** A user prompt kept as the session's fallback title (the first one seen). */
export function notePrompt(s: SessionState, text: string): void {
  if (s.local.prompt || !isPrompt(text)) return;
  s.local.prompt = text.trim().replace(/\s+/g, ' ').slice(0, SESSION_PROMPT_MAX);
}

/** Project folder name of a cwd (POSIX or Windows path). */
export const folderOf = (cwd: string): string => cwd.split(/[\\/]/).filter(Boolean).pop() ?? '';

/** brief=true (what peers get) shares commands as program name / description only. */
export function toViews(s: SessionState, brief = false, now = 0): AgentView[] {
  const self: AgentView = {
    id: s.id,
    provider: s.provider,
    kind: s.kind,
    num: s.kind === 'main' ? s.num : 0,
    room: s.room,
    permission: s.permission,
    act: s.act,
    target: brief ? s.brief : s.target,
    reason: s.reason,
  };
  if (s.room === 'server') self.zone = s.zone;
  if (s.kind === 'subagent') self.parentId = s.parentId;
  if (s.kind === 'subagent' && now < s.talkUntil) self.talk = true;
  if (s.act !== 'idle') self.ageSec = ageOf(s.actSince, now);
  if (s.todo) self.todo = { ...s.todo };
  if (now < s.failUntil) self.fail = true;
  if (s.diff.add || s.diff.del) self.diff = { ...s.diff };
  // Local only: this PC's own snapshot (brief = what peers get never carries it).
  if (!brief && s.local.context) self.ctx = { ...s.local.context };
  const live = [...s.shells].filter(
    ([, sh]) => sh.seen === undefined || now - sh.seen < CODEX_SHELL_IDLE_MS,
  );
  const shells = live.map(([shellId, sh]): AgentView => ({
    id: `${s.id}/sh/${shellId}`,
    provider: s.provider,
    kind: 'shell',
    num: 0,
    parentId: s.id,
    room: 'server',
    zone: sh.zone,
    permission: false,
    act: 'run',
    target: brief ? sh.brief : sh.target,
    reason: '',
    ageSec: ageOf(sh.since, now),
  }));
  return [self, ...shells];
}
