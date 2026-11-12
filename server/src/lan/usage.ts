// Local token usage history: incremental scan of every transcript, day/project/model buckets,
// persisted to ~/.pixel-office/usage.json. LOCAL ONLY — never on the wire.
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { Provider } from '../../../core/src/lan.js';
import type { UsageLoaded } from '../../../core/src/messages.js';
import {
  USAGE_FILE,
  USAGE_READ_CHUNK_BYTES,
  USAGE_SAVE_DELAY_MS,
  USAGE_VERSION,
  VIEW_TITLE_MAX,
} from '../constants.js';
import { codexSessionMeta } from './codexParser.js';
import type { Roots } from './roots.js';
import { folderOf } from './session.js';
import { addDays, dayKey, dayRange, dayStart } from './usageDays.js';
import { billable, type FileFold, foldLine, newFold, rateOf, type Tally } from './usageLine.js';

export type UsageRange = '7d' | '30d' | 'all';
export interface FileUsage {
  tokens: number;
  rate: number;
  model: string;
  big: { n: number; last: number };
}

interface FileEntry {
  size: number;
  mtimeMs: number;
  offset: number;
  key: string;
  sub?: true;
  fold: FileFold;
}
interface SessionEntry {
  provider: Provider;
  folder: string;
  title: string;
  model: string;
  firstTs: number;
  lastTs: number;
  tally: Tally;
  mainFile?: string;
}
type Days = Record<string, Record<string, Record<string, Record<string, Tally>>>>;
interface Candidate {
  file: string;
  provider: Provider;
  key?: string; // Claude: known from the path; Codex: read from the first line
  sub?: true;
}

const TOP_SESSIONS = 10;
const TOP_PROJECTS = 8;
const zero = (): Tally => ({ input: 0, output: 0, cacheCreate: 0, cacheRead: 0 });
const addTo = (a: Tally, d: Tally) => {
  a.input += d.input;
  a.output += d.output;
  a.cacheCreate += d.cacheCreate;
  a.cacheRead += d.cacheRead;
};
const dirents = (d: string) =>
  fs.promises.readdir(d, { withFileTypes: true }).catch(() => [] as fs.Dirent[]);
const yieldLoop = () => new Promise<void>((r) => setImmediate(r));

export class UsageIndex {
  onChanged?: () => void;
  private files: Record<string, FileEntry> = {};
  private sessions: Record<string, SessionEntry> = {};
  private days: Days = {};
  private busy = false;
  private scan?: Promise<void>;
  private readonly inFlight = new Set<string>();
  private readonly chunk: number;
  private dirty = false;
  private timer: NodeJS.Timeout | null = null;
  private readonly file: string;
  private readonly roots: () => Roots;
  private readonly now: () => number;

  constructor(opts: { dir: string; roots: () => Roots; now?: () => number; chunkBytes?: number }) {
    this.chunk = opts.chunkBytes ?? USAGE_READ_CHUNK_BYTES;
    this.file = path.join(opts.dir, USAGE_FILE);
    this.roots = opts.roots;
    this.now = opts.now ?? Date.now;
  }

  get scanning(): boolean {
    return this.busy;
  }

  load(): void {
    let text: string;
    try {
      text = fs.readFileSync(this.file, 'utf-8');
    } catch {
      return; // none yet
    }
    let tag = 'corrupt';
    try {
      const j = JSON.parse(text);
      tag = String(j?.version);
      // v0 never held history (no sessions): rescan. Add a migration here when v2 exists.
      if (j?.version === USAGE_VERSION && j.sessions) {
        this.files = j.files ?? {};
        this.sessions = j.sessions;
        this.days = j.days ?? {};
        return;
      }
    } catch {
      // fall through: keep the unreadable file, start empty
    }
    try {
      // the history may be unrecoverable (Claude deletes old transcripts): never overwrite it
      fs.renameSync(this.file, `${this.file}.bak-${tag}-${Date.now()}`);
    } catch {
      // read-only dir: the next flush fails too
    }
  }

  save(): void {
    if (!this.dirty || this.timer) return;
    this.timer = setTimeout(() => this.flush(), USAGE_SAVE_DELAY_MS);
    this.timer.unref();
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.dirty) return;
    this.dirty = false;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(
        tmp,
        JSON.stringify({
          version: USAGE_VERSION,
          files: this.files,
          sessions: this.sessions,
          days: this.days,
        }),
        'utf-8',
      );
      fs.renameSync(tmp, this.file);
    } catch (err) {
      this.dirty = true;
      console.error('[Pixel Office] Failed to write usage:', err);
    }
  }

  /** One scan at a time: an overlapping caller gets the running one. */
  scanAll(): Promise<void> {
    if (this.scan) return this.scan;
    this.busy = true;
    return (this.scan = this.doScan().finally(() => {
      this.busy = false;
      this.scan = undefined;
    }));
  }

  private async doScan(): Promise<void> {
    let folded = false;
    try {
      const { claude, codex } = this.roots();
      const seen = new Set<string>();
      const listed: string[] = [];
      const take = async (c: Candidate) => {
        seen.add(c.file);
        if (await this.ingest(c)) folded = true;
        await yieldLoop();
      };
      for (const root of claude) {
        const projs = await dirents(root);
        if (projs.length) listed.push(root);
        for (const proj of projs) {
          if (!proj.isDirectory()) continue;
          const projDir = path.join(root, proj.name);
          for (const e of await dirents(projDir)) {
            if (e.isFile() && e.name.endsWith('.jsonl'))
              await take({
                file: path.join(projDir, e.name),
                provider: 'claude',
                key: path.basename(e.name, '.jsonl'),
              });
            else if (e.isDirectory()) {
              const subDir = path.join(projDir, e.name, 'subagents');
              for (const s of await dirents(subDir))
                if (s.isFile() && s.name.endsWith('.jsonl'))
                  await take({
                    file: path.join(subDir, s.name),
                    provider: 'claude',
                    key: e.name,
                    sub: true,
                  });
            }
          }
        }
      }
      for (const root of codex) {
        const years = await dirents(root);
        if (years.length) listed.push(root);
        for (const y of years)
          for (const m of y.isDirectory() ? await dirents(path.join(root, y.name)) : [])
            for (const d of m.isDirectory() ? await dirents(path.join(root, y.name, m.name)) : []) {
              const dir = path.join(root, y.name, m.name, d.name);
              for (const e of d.isDirectory() ? await dirents(dir) : [])
                if (e.isFile() && e.name.endsWith('.jsonl'))
                  await take({ file: path.join(dir, e.name), provider: 'codex' });
            }
      }
      // Forget offsets of vanished files, but only under roots that listed: an unreachable root
      // (stopped WSL distro) must not make its files count twice when it comes back.
      for (const f of Object.keys(this.files))
        if (!seen.has(f) && listed.some((r) => f.startsWith(r + path.sep))) {
          delete this.files[f];
          this.dirty = true;
        }
    } finally {
      // (busy is cleared by scanAll)
    }
    if (folded) this.onChanged?.();
  }

  async refresh(files: string[]): Promise<void> {
    for (const file of files) {
      const c = this.files[file] ? undefined : this.classify(file);
      const e = this.files[file];
      const cand: Candidate | undefined = e
        ? { file, provider: e.fold.provider, key: e.key, sub: e.sub }
        : c;
      if (cand) await this.ingest(cand);
    }
  }

  fileUsage(file: string): FileUsage | undefined {
    const e = this.files[file];
    if (!e) return undefined;
    return {
      tokens: billable(e.fold.total),
      rate: Math.max(0, rateOf(e.fold, this.now())),
      model: e.fold.model,
      big: e.fold.big,
    };
  }

  sumOf(key: string): number {
    const s = this.sessions[key];
    return s ? billable(s.tally) : 0;
  }

  keyOf(file: string): string | undefined {
    return this.files[file]?.key;
  }

  fileOf(key: string): { file: string; provider: Provider } | undefined {
    const s = this.sessions[key];
    return s?.mainFile && fs.existsSync(s.mainFile)
      ? { file: s.mainFile, provider: s.provider }
      : undefined;
  }

  today(): number {
    const day = this.days[dayKey(this.now())] ?? {};
    let sum = 0;
    for (const f of Object.values(day))
      for (const m of Object.values(f)) for (const t of Object.values(m)) sum += billable(t);
    return sum;
  }

  report(range: UsageRange): Omit<UsageLoaded, 'type'> {
    const today = dayKey(this.now());
    const first = range === 'all' ? ([...Object.keys(this.days), today].sort()[0] as string) : '';
    const span = range === '7d' ? 7 : range === '30d' ? 30 : 0;
    const dates = dayRange(span ? addDays(today, -(span - 1)) : first, today);
    const startMs = dayStart(dates[0] ?? today);
    const totals = { billable: 0, ...zero(), sessions: 0 };
    const projects = new Map<string, number>();
    const models = new Map<string, number>();
    const providers = new Map<string, number>();
    const days: UsageLoaded['days'] = [];
    const bump = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);
    for (const day of dates) {
      const sum = zero();
      for (const [folder, fm] of Object.entries(this.days[day] ?? {}))
        for (const [model, mm] of Object.entries(fm))
          for (const [provider, tally] of Object.entries(mm)) {
            addTo(sum, tally);
            const b = billable(tally);
            bump(projects, folder, b);
            bump(models, model, b);
            bump(providers, provider, b);
          }
      addTo(totals, sum);
      days.push({ day, ...sum });
    }
    totals.billable = billable(totals);
    const inRange = Object.entries(this.sessions).filter(([, s]) => s.lastTs >= startMs);
    totals.sessions = inRange.length;
    const ranked = (m: Map<string, number>) =>
      [...m].filter(([, b]) => b > 0).sort((a, b) => b[1] - a[1]);
    return {
      range,
      scanning: this.busy,
      totals,
      days,
      projects: ranked(projects)
        .slice(0, TOP_PROJECTS)
        .map(([name, billable]) => ({ name, billable })),
      models: ranked(models).map(([model, billable]) => ({ model, billable })),
      providers: ranked(providers).map(([provider, billable]) => ({ provider, billable })),
      top: inRange
        .sort((a, b) => billable(b[1].tally) - billable(a[1].tally))
        .slice(0, TOP_SESSIONS)
        .map(([key, s]) => ({
          key,
          provider: s.provider,
          title: s.title,
          folder: s.folder,
          lastTs: s.lastTs,
          billable: billable(s.tally),
          exists: !!s.mainFile && fs.existsSync(s.mainFile),
        })),
    };
  }

  /** A path under one of the roots → how to read it; undefined = outside the roots (never read). */
  private classify(file: string): Candidate | undefined {
    const { claude, codex } = this.roots();
    const rel = (root: string) => {
      const r = path.relative(root, file);
      return r && !r.startsWith('..') && !path.isAbsolute(r) && r.endsWith('.jsonl')
        ? r.split(path.sep)
        : undefined;
    };
    for (const root of claude) {
      const p = rel(root);
      if (p?.length === 2) return { file, provider: 'claude', key: path.basename(p[1], '.jsonl') };
      if (p?.length === 4 && p[2] === 'subagents')
        return { file, provider: 'claude', key: p[1], sub: true };
    }
    for (const root of codex) if (rel(root)) return { file, provider: 'codex' };
    return undefined;
  }

  private bucket(ts: number, fold: FileFold, model: string): Tally {
    const m = (this.days[dayKey(ts)] ??= {});
    const f = (m[folderOf(fold.cwd) || '?'] ??= {});
    const mm = (f[model || 'unknown'] ??= {});
    return (mm[fold.provider] ??= zero());
  }

  /** Reads the appended whole lines of one file. True when it folded anything. */
  private async ingest(c: Candidate): Promise<boolean> {
    if (this.inFlight.has(c.file)) return false; // another caller is reading it right now
    this.inFlight.add(c.file);
    try {
      return await this.ingestFile(c);
    } finally {
      this.inFlight.delete(c.file);
    }
  }

  private async ingestFile(c: Candidate): Promise<boolean> {
    let st: fs.Stats;
    try {
      st = await fs.promises.stat(c.file);
    } catch {
      return false;
    }
    let e = this.files[c.file];
    if (e && st.size === e.size) return false;
    if (e && st.size < e.offset) {
      // rewritten: take the old fold back out (ponytail: all of it from the day of its last line)
      const s = this.sessions[e.key];
      const neg = {
        input: -e.fold.total.input,
        output: -e.fold.total.output,
        cacheCreate: -e.fold.total.cacheCreate,
        cacheRead: -e.fold.total.cacheRead,
      };
      addTo(this.bucket(e.fold.lastTs || this.now(), e.fold, e.fold.model), neg);
      if (s) addTo(s.tally, neg);
      e.fold = newFold(e.fold.provider);
      e.offset = 0;
    }
    let any = false;
    let fh: fs.promises.FileHandle;
    try {
      fh = await fs.promises.open(c.file, 'r');
    } catch {
      return false;
    }
    try {
      let pos = e?.offset ?? 0;
      let pending: Buffer = Buffer.alloc(0); // bytes after the last newline (whole bytes: no split UTF-8)
      while (pos < st.size) {
        const buf = Buffer.alloc(Math.min(this.chunk, st.size - pos));
        const { bytesRead } = await fh.read(buf, 0, buf.length, pos);
        if (!bytesRead) break;
        pos += bytesRead;
        const data = Buffer.concat([pending, buf.subarray(0, bytesRead)]);
        const end = data.lastIndexOf(10) + 1;
        pending = data.subarray(end);
        if (!end) continue;
        if (!e) {
          const made = this.register(c, data.subarray(0, data.indexOf(10)).toString('utf8'));
          if (!made) return false;
          e = made;
        }
        if (this.fold(e, c.file, data.subarray(0, end))) any = true;
        e.offset += end;
        await yieldLoop(); // a huge transcript must not block the event loop
      }
    } catch {
      // vanished mid-read: what was folded is kept (offset only moved past whole lines)
    } finally {
      await fh.close();
    }
    if (e) {
      e.size = st.size;
      e.mtimeMs = st.mtimeMs;
      this.dirty = true;
    }
    return any;
  }

  /** New file: pick its session key and take its entry, unless the same file is tracked via another root. */
  private register(c: Candidate, firstLine: string): FileEntry | undefined {
    let key = c.key;
    let sub = c.sub;
    if (!key) {
      const meta = codexSessionMeta(firstLine);
      key = meta ? (meta.parentId ?? meta.id) : path.basename(c.file, '.jsonl');
      if (meta?.parentId) sub = true;
    }
    const base = path.basename(c.file);
    for (const [f, o] of Object.entries(this.files))
      if (o.key === key && path.basename(f) === base) return undefined;
    return (this.files[c.file] = {
      size: 0,
      mtimeMs: 0,
      offset: 0,
      key,
      ...(sub ? { sub: true as const } : {}),
      fold: newFold(c.provider),
    });
  }

  private fold(e: FileEntry, file: string, whole: Buffer): boolean {
    const now = this.now();
    const s = (this.sessions[e.key] ??= {
      provider: e.fold.provider,
      folder: '',
      title: '',
      model: '',
      firstTs: 0,
      lastTs: 0,
      tally: zero(),
    });
    let any = false;
    for (const line of whole.toString('utf8').split('\n')) {
      if (!line) continue;
      const r = foldLine(e.fold, line, now);
      if (!r) continue;
      any = true;
      addTo(this.bucket(r.ts, e.fold, r.model || e.fold.model), r.d);
      addTo(s.tally, r.d);
    }
    const f = e.fold;
    if (f.firstTs && (!s.firstTs || f.firstTs < s.firstTs)) s.firstTs = f.firstTs;
    s.lastTs = Math.max(s.lastTs, f.lastTs);
    if (f.model) s.model = f.model;
    if (!e.sub) {
      s.mainFile = file;
      s.title = Array.from(f.title).slice(0, VIEW_TITLE_MAX).join('');
      if (f.cwd) s.folder = folderOf(f.cwd);
    } else if (!s.folder && f.cwd) s.folder = folderOf(f.cwd);
    return any;
  }
}
