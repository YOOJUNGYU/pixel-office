// Finds live Claude/Codex transcripts on this PC, tails them into session state.
import type { FileHandle } from 'node:fs/promises';
import { open, readdir, stat } from 'node:fs/promises';
import * as path from 'node:path';
import { StringDecoder } from 'node:string_decoder';

import type {
  AgentHeat,
  AgentUsage,
  AgentView,
  Provider,
  ViewKind,
} from '../../../core/src/lan.js';
import { heatOf } from '../../../core/src/lan.js';
import {
  CHILD_ENDED_HIDE_MS,
  CHILD_IDLE_TTL_MS,
  CODEX_ENDED_TTL_MS,
  CODEX_INDEX_MAX_BYTES,
  CODEX_META_MAX_BYTES,
  DISCOVER_INTERVAL_MS,
  HEAT_BURN_HOLD_MS,
  PERMISSION_MODE_SCAN_BYTES,
  POLL_INTERVAL_MS,
  SESSION_TTL_MS,
  TAIL_BYTES,
  TALK_MS,
  TALK_PENDING_MS,
  VIEW_TITLE_MAX,
} from '../constants.js';
import { applyClaudeLine, hostPath, setPermissionMode } from './claudeParser.js';
import { applyCodexLine, codexSessionMeta, parseCodexIndex } from './codexParser.js';
import type { CheckPids, RegEntry } from './liveness.js';
import { checkPids, domainOf, readRegistry } from './liveness.js';
import type { Roots } from './roots.js';
import type { SessionState } from './session.js';
import { folderOf, newSession, noteAct, tick, toViews } from './session.js';
import type { Parse } from './transcript.js';
import { codexShellParse, rawParse } from './transcript.js';
import type { UsageIndex } from './usage.js';

export { CHILD_IDLE_TTL_MS, SESSION_TTL_MS, TAIL_BYTES };
export type { Roots } from './roots.js';
export { discoverRoots, parseWslList } from './roots.js';

/** What a main session is about, for this PC's own notifications. LOCAL ONLY. */
export interface AgentInfo {
  /** user rename > auto title (Claude) / thread name (Codex) > first prompt; '' unknown */
  title: string;
  /** project folder (basename of the session cwd); '' unknown */
  folder: string;
}

// ── Scanner ────────────────────────────────────────────────

interface Tracked {
  s: SessionState;
  apply: (s: SessionState, line: string, now: number) => void;
  offset: number;
  buf: string;
  decoder: StringDecoder;
  /** first complete line is a fragment (tail started mid-file) */
  dropFirst: boolean;
  mtimeMs: number;
  /** when a subagent's turn ended, null while running */
  endedAt: number | null;
}

interface Candidate {
  file: string;
  provider: Provider;
  /** Claude subagent: parent session id */
  parentId?: string;
}

/** LOCAL ONLY: where an agent's transcript lives, for the transcript panel. Never in views()/packets. */
export interface TranscriptSource {
  file: string;
  provider: Provider;
  /** Not the session's JSONL (a shell's output): a parser factory for it. */
  parse?: () => Parse;
  kind: ViewKind;
  num: number;
  title: string;
  folder: string;
  /** The session's context use now (absent for a shell's own output). */
  context?: () => { used: number; window: number } | undefined;
}

const dirents = (d: string) => readdir(d, { withFileTypes: true }).catch(() => []);
const jsonlBase = (f: string) => path.basename(f, '.jsonl');
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\.jsonl$)/i;
const pad = (n: number) => String(n).padStart(2, '0');

/** Reads [from, to) of an open file. */
async function readRange(fh: FileHandle, from: number, to: number): Promise<Buffer> {
  const buf = Buffer.alloc(to - from);
  const { bytesRead } = await fh.read(buf, 0, buf.length, from);
  return buf.subarray(0, bytesRead);
}

const MODE_RE = /"permissionMode":"(\w+)"/g;

/** The last `permissionMode` value before byte `end` (searched back in TAIL_BYTES chunks, at most
 *  PERMISSION_MODE_SCAN_BYTES), or null. */
async function lastPermissionMode(file: string, end: number): Promise<string | null> {
  const fh = await open(file, 'r');
  try {
    const stop = Math.max(0, end - PERMISSION_MODE_SCAN_BYTES);
    for (let to = end; to > stop; to -= TAIL_BYTES) {
      // Overlap a little so a match cut by the chunk edge is still found.
      const chunk = (await readRange(fh, Math.max(stop, to - TAIL_BYTES), to + 64)).toString();
      const all = [...chunk.matchAll(MODE_RE)];
      if (all.length) return all[all.length - 1][1];
    }
    return null;
  } finally {
    await fh.close();
  }
}

async function firstLine(file: string): Promise<string> {
  const fh = await open(file, 'r');
  try {
    const head = await readRange(fh, 0, CODEX_META_MAX_BYTES);
    const nl = head.indexOf(0x0a);
    return nl < 0 ? '' : head.subarray(0, nl).toString('utf8');
  } finally {
    await fh.close();
  }
}

/**
 * Claude session ids shown from each WSL distro, by distro. Only these are
 * checked there, so a distro none of whose sessions is shown is never woken
 * (no wsl.exe at all).
 */
export function wslSessionsToCheck(files: Array<[string, SessionState]>): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const [file, s] of files) {
    const domain = domainOf(file);
    if (domain === 'local' || s.provider !== 'claude') continue;
    const ids = out.get(domain) ?? new Set<string>();
    ids.add(s.kind === 'main' ? s.id : (s.parentId ?? ''));
    out.set(domain, ids);
  }
  return out;
}

/** How long after its last line a transcript stays: a finished Codex turn leaves sooner. */
function ttl(s: SessionState): number {
  if (s.kind !== 'main') return CHILD_IDLE_TTL_MS;
  return s.provider === 'codex' && s.turnEnded ? CODEX_ENDED_TTL_MS : SESSION_TTL_MS;
}

// ponytail: 폴링 기반, WSL 9P 위 수천 파일에서 느리면 루트별 간격 조정
export class Scanner {
  private files = new Map<string, Tracked>();
  /** Per file: the burn tier shown and when the rate last reached it (HEAT_BURN_HOLD_MS). */
  private burnHold = new Map<string, { burn: AgentHeat['burn']; at: number }>();
  private timers: NodeJS.Timeout[] = [];
  private discovering = false;
  private polling = false;
  /** The first discover pass is done: subagents found from then on were just started. */
  private primed = false;

  private roots: Roots = { claude: [], codex: [] };
  /** LOCAL ONLY: token usage for views(false). Never set on the brief/peer path. */
  usage?: Pick<UsageIndex, 'fileUsage' | 'sumOf' | 'keyOf'>;
  /** Resolves when the first discover pass (started by start()) is done. */
  ready: Promise<void> = Promise.resolve();
  /** Claude session ids whose registry pids are all dead (closed): dropped at once, not after the TTL. */
  private closed = new Set<string>();
  /** file → mtime when it was turned away (closed / expired): skipped until it changes. */
  private rejected = new Map<string, number>();
  /** Codex session_index.jsonl per path: `mtime:size` read last + id → thread name. */
  private codexIndex = new Map<string, { key: string; names: Map<string, string> }>();

  /** A function is re-run every discover cycle (running WSL distros come and go). */
  constructor(
    private readonly rootsSource: Roots | (() => Promise<Roots>),
    private now: () => number = Date.now,
    private readonly pids: CheckPids = checkPids,
  ) {
    if (typeof rootsSource !== 'function') this.roots = rootsSource;
  }

  /**
   * Claude's `sessions/<pid>.json` registry: a session with a live pid is open,
   * one whose pids are all dead is closed. No entry, or a check that failed
   * (WSL unreachable): unknown, the transcript TTL decides as before.
   */
  private async refreshClosed(): Promise<void> {
    const trackedWsl = wslSessionsToCheck(
      [...this.files].map(([file, t]) => [file, t.s] as [string, SessionState]),
    );
    const byDomain = new Map<string, RegEntry[]>();
    /** projects root → session ids with a registry entry (roots whose registry was read). */
    const registered = new Map<string, Set<string>>();
    for (const root of this.roots.claude) {
      const domain = domainOf(root);
      if (domain !== 'local' && !trackedWsl.has(domain)) continue;
      const wanted = trackedWsl.get(domain);
      const all = await readRegistry(root);
      if (all) registered.set(root, new Set(all.map((e) => e.sessionId)));
      const entries = (all ?? []).filter((e) => !wanted || wanted.has(e.sessionId));
      byDomain.set(domain, [...(byDomain.get(domain) ?? []), ...entries]);
    }
    const alive = new Set<string>();
    const dead = new Set<string>();
    for (const [domain, entries] of byDomain) {
      if (entries.length === 0) continue;
      const state = await this.pids(domain, entries).catch(() => new Map());
      for (const e of entries) {
        const st = state.get(e.pid) ?? 'unknown';
        if (st === 'alive') alive.add(e.sessionId);
        else if (st === 'dead') dead.add(e.sessionId);
        else alive.add(e.sessionId); // unknown: never close on a failed check
      }
    }
    // A clean exit removes the entry: a finished session without one is closed. Not a busy
    // one (an older Claude, or a `-p` run, may never write one) — the TTL decides there.
    for (const [file, { s }] of this.files) {
      if (s.provider !== 'claude' || s.kind !== 'main' || s.act !== 'idle') continue;
      const root = this.roots.claude.find((r) => file.startsWith(r));
      const ids = root === undefined ? undefined : registered.get(root);
      if (ids && !ids.has(s.id)) dead.add(s.id);
    }
    // WSL sessions not checked this cycle keep their last verdict.
    const kept = [...this.closed].filter((id) => !dead.has(id) && !alive.has(id));
    this.closed = new Set([...kept, ...[...dead].filter((id) => !alive.has(id))]);
  }

  /** A Claude main session, or a child of one, that the registry says is closed. */
  private isClosed(s: SessionState): boolean {
    if (s.provider !== 'claude') return false;
    return this.closed.has(s.kind === 'main' ? s.id : (s.parentId ?? ''));
  }

  async discover(): Promise<void> {
    if (typeof this.rootsSource === 'function') {
      this.roots = await this.rootsSource();
      // stop touching roots that went away (a stopped WSL distro would boot again)
      const all = [...this.roots.claude, ...this.roots.codex];
      for (const file of this.files.keys()) {
        if (!all.some((r) => file.startsWith(r))) this.files.delete(file);
      }
    }
    await this.refreshClosed();
    await this.refreshCodexIndex();
    const candidates = await this.candidates();
    const present = new Set(candidates.map((c) => c.file));
    for (const f of this.rejected.keys()) if (!present.has(f)) this.rejected.delete(f);
    for (const c of candidates) {
      if (this.files.has(c.file)) continue;
      try {
        await this.register(c);
      } catch {
        // vanished / unreadable: retry next cycle
      }
    }
    this.primed = true;
  }

  async poll(): Promise<void> {
    const now = this.now();
    // Claude subagent transcripts carry no permission mode: inherit the parent's
    const bypass = new Map([...this.files.values()].map((t) => [t.s.id, t.s.bypass]));
    for (const [file, t] of this.files) {
      if (t.s.kind === 'subagent' && t.s.parentId !== undefined) {
        t.s.bypass = bypass.get(t.s.parentId) ?? t.s.bypass;
      }
      try {
        const st = await stat(file);
        t.mtimeMs = st.mtimeMs;
        if (st.size < t.offset) {
          t.offset = 0;
          t.buf = '';
          t.decoder = new StringDecoder('utf8');
        }
        if (st.size > t.offset) await this.readNew(file, t, st.size, now);
      } catch {
        // ENOENT/EACCES/UNC hiccup: keep last mtime, TTL removes it eventually
      }
      tick(t.s, now);
      noteAct(t.s); // a tick-raised ❗ dates from the last line (the tool call)
      if (t.s.kind === 'subagent') {
        if (!t.s.turnEnded) t.endedAt = null;
        else if (t.endedAt === null) {
          t.endedAt = now;
          t.s.talkUntil = now + TALK_MS; // reports back to its parent
        }
      }
      if (now - t.mtimeMs > ttl(t.s) || this.isClosed(t.s)) {
        this.files.delete(file);
        this.rejected.set(file, t.mtimeMs);
      }
    }
    this.matchMessages(now);
  }

  /** A main session's SendMessage to one of its Claude subagents (`agent-<to>.jsonl`): that child talks. */
  private matchMessages(now: number): void {
    const byId = new Map([...this.files.values()].map((t) => [t.s.id, t.s]));
    for (const { s } of this.files.values()) {
      if (!s.talkTo) continue;
      const child = byId.get(`${s.id}/sub/agent-${s.talkTo.to}`);
      if (child) child.talkUntil = now + TALK_MS;
      if (child || now - s.talkTo.at > TALK_PENDING_MS) s.talkTo = null;
    }
  }

  /** Codex thread names: re-read (its last CODEX_INDEX_MAX_BYTES) only when it changed. */
  private async refreshCodexIndex(): Promise<void> {
    const seen = new Set<string>();
    for (const root of this.roots.codex) {
      const file = path.join(path.dirname(root), 'session_index.jsonl');
      seen.add(file);
      try {
        const st = await stat(file);
        const key = `${st.mtimeMs.toString()}:${st.size.toString()}`;
        if (this.codexIndex.get(file)?.key === key) continue;
        const fh = await open(file, 'r');
        let text: string;
        try {
          text = (
            await readRange(fh, Math.max(0, st.size - CODEX_INDEX_MAX_BYTES), st.size)
          ).toString('utf8');
        } finally {
          await fh.close();
        }
        this.codexIndex.set(file, { key, names: parseCodexIndex(text) });
      } catch {
        this.codexIndex.delete(file); // no index (older Codex) / unreadable
      }
    }
    for (const f of this.codexIndex.keys()) if (!seen.has(f)) this.codexIndex.delete(f);
  }

  /** This PC's main session `id`: title + folder for its notifications. LOCAL ONLY —
   *  never put into views()/packets. */
  info(id: string): AgentInfo | undefined {
    for (const { s } of this.files.values()) {
      if (s.id !== id || s.kind !== 'main') continue;
      const l = s.local;
      let named = l.customTitle || l.aiTitle;
      if (s.provider === 'codex') {
        for (const idx of this.codexIndex.values()) named ||= idx.names.get(id) ?? '';
      }
      return { title: named || l.prompt, folder: folderOf(l.cwd) };
    }
    return undefined;
  }

  /** AgentView.id of this PC (main / `<p>/sub/<n>` / `<s>/sh/<n>`) → its transcript file. A shell
   *  → its own output (Claude: the task's output file; Codex: its calls in the rollout); one
   *  without (gone, or an older Claude line) → the session that started it. LOCAL ONLY — never put into views()/packets. */
  transcriptOf(id: string): TranscriptSource | undefined {
    const shellAt = id.lastIndexOf('/sh/');
    const sid = shellAt >= 0 ? id.slice(0, shellAt) : id;
    for (const [file, { s }] of this.files) {
      if (s.id !== sid) continue;
      const kind: ViewKind = shellAt >= 0 ? 'shell' : s.kind;
      const sh = shellAt >= 0 ? s.shells.get(id.slice(shellAt + 4)) : undefined;
      if (sh) {
        // The shell's own output: Claude's output file, or its calls out of the Codex rollout.
        const own = s.provider === 'claude' ? sh.output && hostPath(file, sh.output) : file;
        if (own) {
          const shellId = id.slice(shellAt + 4);
          return {
            file: own,
            provider: s.provider,
            parse: s.provider === 'claude' ? rawParse : () => codexShellParse(shellId),
            kind,
            num: s.kind === 'main' ? s.num : this.mainNum(s.parentId ?? ''),
            title: sh.command ?? sh.target,
            folder: this.info(s.kind === 'main' ? sid : (s.parentId ?? ''))?.folder ?? '',
          };
        }
      }
      if (s.kind === 'main') {
        const i = this.info(sid);
        return {
          file,
          provider: s.provider,
          kind,
          num: s.num,
          title: i?.title ?? '',
          folder: i?.folder ?? '',
          context: () => s.local.context,
        };
      }
      const parent = s.parentId ? this.info(s.parentId) : undefined;
      const num = s.parentId ? this.mainNum(s.parentId) : s.num;
      return {
        file,
        provider: s.provider,
        kind,
        num,
        title: s.local.prompt || parent?.title || '',
        folder: s.local.cwd ? folderOf(s.local.cwd) : (parent?.folder ?? ''),
        context: () => s.local.context,
      };
    }
    return undefined;
  }

  private mainNum(id: string): number {
    for (const { s } of this.files.values()) if (s.id === id && s.kind === 'main') return s.num;
    return 0;
  }

  rootsNow(): Roots {
    return this.roots;
  }

  liveFiles(): string[] {
    return [...this.files.keys()];
  }

  /** brief=true: commands as program name / description only (always, for peers) */
  views(brief = false): AgentView[] {
    const now = this.now();
    return [...this.files]
      .filter(([, t]) => t.endedAt === null || now - t.endedAt < CHILD_ENDED_HIDE_MS)
      .flatMap(([file, t]) => {
        const views = toViews(t.s, brief, now);
        const heat = this.heatOf(file, now);
        if (heat) views[0].heat = heat;
        if (brief) return views;
        this.attachUsage(file, t.s, views[0]);
        // Local only: this PC's own snapshot shows each agent's session title in its bubble.
        const title = this.titleOf(t.s);
        if (title) for (const v of views) v.title = title;
        return views;
      });
  }

  /** Size and burn tiers of a file (shared with peers); the burn tier is held for
   *  HEAT_BURN_HOLD_MS after the rate drops below it. */
  private heatOf(file: string, now: number): AgentHeat | undefined {
    for (const k of this.burnHold.keys()) if (!this.files.has(k)) this.burnHold.delete(k);
    const fu = this.usage?.fileUsage(file);
    if (!fu) return undefined;
    const h = heatOf(fu.tokens, fu.rate);
    const held = this.burnHold.get(file);
    if (held && h.burn < held.burn && now - held.at < HEAT_BURN_HOLD_MS) h.burn = held.burn;
    else this.burnHold.set(file, { burn: h.burn, at: now });
    return h.size + h.burn > 0 ? h : undefined;
  }

  private attachUsage(file: string, s: SessionState, v: AgentView): void {
    const fu = this.usage?.fileUsage(file);
    if (!fu) return;
    const u: AgentUsage = { tokens: fu.tokens, rate: fu.rate };
    if (fu.model) u.model = fu.model;
    if (fu.big.n > 0) u.big = fu.big;
    if (s.kind === 'main') {
      const kids = [...this.files.values()].some(
        (o) => o.s.kind === 'subagent' && o.s.parentId === s.id,
      );
      if (kids) u.sum = this.usage?.sumOf(this.usage.keyOf(file) ?? s.id);
    }
    v.usage = u;
  }

  /** The bubble title of a session (its shells share it): main → info().title; a subagent →
   *  its own task prompt, else its parent's. LOCAL ONLY (views(brief=false) only). */
  private titleOf(s: SessionState): string {
    const raw =
      s.kind === 'main'
        ? (this.info(s.id)?.title ?? '')
        : s.local.prompt || (this.info(s.parentId ?? '')?.title ?? '');
    const cps = Array.from(raw);
    return cps.length > VIEW_TITLE_MAX ? `${cps.slice(0, VIEW_TITLE_MAX - 1).join('')}…` : raw;
  }

  start(): void {
    if (this.timers.length) return;
    const guard = (key: 'discovering' | 'polling', fn: () => Promise<void>) => async () => {
      if (this[key]) return;
      this[key] = true;
      try {
        await fn();
      } finally {
        this[key] = false;
      }
    };
    const disc = guard('discovering', () => this.discover());
    this.ready = disc();
    this.timers = [
      setInterval(disc, DISCOVER_INTERVAL_MS),
      setInterval(
        guard('polling', () => this.poll()),
        POLL_INTERVAL_MS,
      ),
    ];
    for (const t of this.timers) t.unref();
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }

  private async candidates(): Promise<Candidate[]> {
    const out: Candidate[] = [];
    for (const root of this.roots.claude) {
      for (const proj of await dirents(root)) {
        if (!proj.isDirectory()) continue;
        const projDir = path.join(root, proj.name);
        for (const e of await dirents(projDir)) {
          if (e.isFile() && e.name.endsWith('.jsonl')) {
            out.push({ file: path.join(projDir, e.name), provider: 'claude' });
          } else if (e.isDirectory()) {
            const subDir = path.join(projDir, e.name, 'subagents');
            for (const s of await dirents(subDir)) {
              if (s.isFile() && s.name.endsWith('.jsonl')) {
                out.push({ file: path.join(subDir, s.name), provider: 'claude', parentId: e.name });
              }
            }
          }
        }
      }
    }
    const d = new Date(this.now());
    const days = [0, 1].map((back) => {
      const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
      return [String(x.getFullYear()), pad(x.getMonth() + 1), pad(x.getDate())];
    });
    for (const root of this.roots.codex) {
      for (const day of days) {
        const dayDir = path.join(root, ...day);
        for (const e of await dirents(dayDir)) {
          if (e.isFile() && e.name.endsWith('.jsonl')) {
            out.push({ file: path.join(dayDir, e.name), provider: 'codex' });
          }
        }
      }
    }
    return out;
  }

  private async register(c: Candidate): Promise<void> {
    const now = this.now();
    const st = await stat(c.file);
    // Turned away before (closed, or a finished Codex turn past its TTL) and unchanged
    // since: don't read its tail again every cycle.
    if (this.rejected.get(c.file) === st.mtimeMs) return;
    let parentId = c.parentId;
    let id = parentId ? `${parentId}/sub/${jsonlBase(c.file)}` : jsonlBase(c.file);
    let codexCwd = '';
    if (now - st.mtimeMs > (parentId ? CHILD_IDLE_TTL_MS : SESSION_TTL_MS)) return;
    if (c.provider === 'claude' && this.closed.has(parentId ?? id)) {
      if (domainOf(c.file) === 'local') {
        this.rejected.set(c.file, st.mtimeMs); // checked this cycle: really closed
        return;
      }
      // A WSL verdict may be stale (only shown sessions are checked there): the file
      // changed, so show it and let the next cycle check it (resumed session).
      this.closed.delete(parentId ?? id);
    }
    // Claude relocates a session's transcript to another project dir (entering/leaving a
    // worktree): the tracker follows the file instead of freezing on the old path.
    if (c.provider === 'claude') {
      for (const [old, t] of this.files) {
        if (old === c.file || t.s.id !== id) continue;
        if (
          await stat(old).then(
            () => false,
            () => true,
          )
        ) {
          this.files.delete(old);
          this.files.set(c.file, t);
          return;
        }
      }
    }
    if (c.provider === 'codex') {
      const meta = codexSessionMeta(await firstLine(c.file));
      parentId = meta?.parentId;
      codexCwd = meta?.cwd ?? '';
      const metaId = meta?.id ?? UUID_RE.exec(c.file)?.[0] ?? jsonlBase(c.file);
      id = parentId ? `${parentId}/sub/${metaId}` : metaId;
      if (parentId && now - st.mtimeMs > CHILD_IDLE_TTL_MS) return;
    }
    const s = newSession(c.provider, id, parentId ? 'subagent' : 'main', now, parentId);
    if (c.provider === 'codex') s.local.cwd = codexCwd;
    if (s.kind === 'main') s.num = this.freeNum();
    const start = Math.max(0, st.size - TAIL_BYTES);
    // The mode line may be far before the tail: the approval guess needs it (applyClaudeLine).
    if (c.provider === 'claude' && start > 0) {
      const mode = await lastPermissionMode(c.file, start);
      if (mode) setPermissionMode(s, mode);
    }
    const t: Tracked = {
      s,
      apply: c.provider === 'claude' ? applyClaudeLine : applyCodexLine,
      offset: start,
      buf: '',
      decoder: new StringDecoder('utf8'),
      dropFirst: start > 0,
      mtimeMs: st.mtimeMs,
      endedAt: null,
    };
    await this.readNew(c.file, t, st.size, now);
    if (this.isClosed(s) || now - st.mtimeMs > ttl(s)) {
      this.rejected.set(c.file, st.mtimeMs);
      return;
    }
    // already-finished subagent: count from its last write, not from now
    if (s.kind === 'subagent' && s.turnEnded) t.endedAt = st.mtimeMs;
    // A subagent just handed its task (found whole, after the first scan): it talks with its parent.
    else if (s.kind === 'subagent' && this.primed && start === 0) s.talkUntil = now + TALK_MS;
    this.files.set(c.file, t);
  }

  private async readNew(file: string, t: Tracked, size: number, now: number): Promise<void> {
    const fh = await open(file, 'r');
    let chunk: Buffer;
    try {
      chunk = await readRange(fh, t.offset, size);
    } finally {
      await fh.close();
    }
    t.offset += chunk.length;
    const lines = (t.buf + t.decoder.write(chunk)).split('\n');
    t.buf = lines.pop() ?? '';
    for (const line of lines) {
      if (t.dropFirst) {
        t.dropFirst = false;
        continue;
      }
      if (line.trim()) {
        t.apply(t.s, line, now);
        noteAct(t.s);
      }
    }
  }

  private freeNum(): number {
    const used = new Set([...this.files.values()].map((t) => t.s.num));
    let n = 1;
    while (used.has(n)) n++;
    return n;
  }
}
