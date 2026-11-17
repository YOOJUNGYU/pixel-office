import type { Provider } from '../../../core/src/lan.js';
import {
  CLAUDE_CACHE_TTL_LONG_MS,
  CLAUDE_CACHE_TTL_MS,
  USAGE_ACTIVE_GAP_MS,
  USAGE_BIG_RESULT_TOKENS,
  USAGE_CHARS_PER_TOKEN,
  USAGE_MSG_KEEP,
  USAGE_RATE_WINDOW_MS,
  VIEW_TITLE_MAX,
} from '../constants.js';
import { isPrompt, lineTime } from './session.js';

export interface Tally {
  input: number;
  output: number;
  cacheCreate: number;
  cacheRead: number;
}
export const billable = (t: Tally) => t.input + t.output + t.cacheCreate;

export interface FileFold {
  provider: Provider;
  byMsg: Record<string, { ts: number; model: string; t: Tally }>;
  total: Tally;
  codexLast?: Tally;
  model: string;
  cwd: string;
  title: string;
  /** 0 prompt, 1 ai-title, 2 custom-title: a lower source never replaces a higher one */
  titleRank?: number;
  firstTs: number;
  lastTs: number;
  big: { n: number; last: number };
  recent: Array<[ts: number, billable: number]>;
  /** Claude: when the prompt cache was last read or written, and whether it was the 1 h kind. */
  cacheAt?: number;
  cache1h?: boolean;
  /** Codex: the latest `rate_limits` windows (resetsAt in ms). */
  limits?: { ts: number; windows: LimitWindow[] };
  /** Activity (absent in files folded before 1.0.65 until `UsageIndex` backfills it). */
  act?: Activity;
}
/** Work done in a file: active ms (gaps between lines ≤ USAGE_ACTIVE_GAP_MS), tool calls, edits;
 *  `at` = the last line's time. */
export interface Activity {
  ms: number;
  at: number;
  tools: number;
  edits: number;
}
export const newActivity = (): Activity => ({ ms: 0, at: 0, tools: 0, edits: 0 });

/** Tools that change files (Claude names, Codex `apply_patch`). */
const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit', 'apply_patch']);

/** Folds one parsed line into `a`. */
export function foldActivity(a: Activity, provider: Provider, r: Obj): void {
  // Only a line's own time: undated lines (snapshots, titles) would read as "now".
  const ts = typeof r.timestamp === 'string' ? Date.parse(r.timestamp) : NaN;
  if (Number.isFinite(ts)) {
    if (a.at && ts > a.at && ts - a.at <= USAGE_ACTIVE_GAP_MS) a.ms += ts - a.at;
    if (ts > a.at) a.at = ts;
  }
  const call = (name: string) => {
    a.tools++;
    if (EDIT_TOOLS.has(name)) a.edits++;
  };
  if (provider === 'claude') {
    const content = obj(r.message).content;
    if (r.type === 'assistant' && Array.isArray(content))
      for (const b of content) if (obj(b).type === 'tool_use') call(str(obj(b).name));
  } else if (r.type === 'response_item') {
    const p = obj(r.payload);
    if (p.type === 'function_call' || p.type === 'custom_tool_call') call(str(p.name));
  }
}
export interface LimitWindow {
  pct: number;
  min: number;
  resetsAt: number;
}

const zero = (): Tally => ({ input: 0, output: 0, cacheCreate: 0, cacheRead: 0 });
export function newFold(provider: Provider): FileFold {
  return {
    provider,
    byMsg: {},
    total: zero(),
    model: '',
    cwd: '',
    title: '',
    firstTs: 0,
    lastTs: 0,
    big: { n: 0, last: 0 },
    recent: [],
    act: newActivity(),
  };
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
const sub = (a: Tally, b: Tally): Tally => ({
  input: a.input - b.input,
  output: a.output - b.output,
  cacheCreate: a.cacheCreate - b.cacheCreate,
  cacheRead: a.cacheRead - b.cacheRead,
});
const add = (a: Tally, d: Tally): void => {
  a.input += d.input;
  a.output += d.output;
  a.cacheCreate += d.cacheCreate;
  a.cacheRead += d.cacheRead;
};
const isZero = (t: Tally) => !t.input && !t.output && !t.cacheCreate && !t.cacheRead;
const textOf = (c: unknown): string =>
  typeof c === 'string' ? c : Array.isArray(c) ? c.map((b) => str(obj(b).text)).join('\n') : '';

function setTitle(f: FileFold, text: string, rank: number): void {
  const t = text.trim().replace(/\s+/g, ' ');
  if (!t || (f.titleRank ?? -1) >= rank) return;
  const cps = Array.from(t);
  f.title = cps.length > VIEW_TITLE_MAX ? `${cps.slice(0, VIEW_TITLE_MAX - 1).join('')}…` : t;
  f.titleRank = rank;
}

function noteBig(f: FileFold, chars: number): void {
  const tok = Math.floor(chars / USAGE_CHARS_PER_TOKEN);
  if (tok >= USAGE_BIG_RESULT_TOKENS) f.big = { n: f.big.n + 1, last: tok };
}

function prune(f: FileFold, now: number): void {
  const cut = now - USAGE_RATE_WINDOW_MS;
  f.recent = f.recent.filter(([ts]) => ts >= cut);
  const ids = Object.keys(f.byMsg);
  for (const id of ids.slice(0, Math.max(0, ids.length - USAGE_MSG_KEEP)))
    if (f.byMsg[id].ts < cut) delete f.byMsg[id];
}

function record(f: FileFold, ts: number, model: string, d: Tally, now: number) {
  if (isZero(d)) return null;
  add(f.total, d);
  const b = billable(d);
  if (b) f.recent.push([ts, b]);
  prune(f, now);
  return { ts, model, d };
}

function claude(f: FileFold, rec: Obj, ts: number, now: number) {
  const msg = obj(rec.message);
  if (rec.type === 'assistant') {
    const model = str(msg.model);
    if (model) f.model = model;
    const u = obj(msg.usage);
    if (!Object.keys(u).length) return null;
    const t: Tally = {
      input: num(u.input_tokens),
      output: num(u.output_tokens),
      cacheCreate: num(u.cache_creation_input_tokens),
      cacheRead: num(u.cache_read_input_tokens),
    };
    if (t.cacheCreate || t.cacheRead) {
      const c = obj(u.cache_creation);
      if (num(c.ephemeral_1h_input_tokens)) f.cache1h = true;
      else if (num(c.ephemeral_5m_input_tokens)) f.cache1h = false;
      f.cacheAt = Math.max(f.cacheAt ?? 0, ts);
    }
    const id = str(msg.id);
    const old = id ? f.byMsg[id] : undefined;
    if (id) {
      delete f.byMsg[id]; // re-insert last: insertion order = age
      f.byMsg[id] = { ts: old?.ts ?? ts, model: f.model, t };
    }
    return record(f, ts, f.model, old ? sub(t, old.t) : t, now);
  }
  if (rec.type === 'user') {
    const content = msg.content;
    if (Array.isArray(content)) {
      const results = content.filter((b) => obj(b).type === 'tool_result');
      for (const r of results) noteBig(f, textOf(obj(r).content).length);
      if (results.length) return null;
    }
    if (rec.isMeta !== true) {
      const text = textOf(content);
      if (isPrompt(text)) setTitle(f, text, 0);
    }
  }
  return null;
}

function codex(f: FileFold, rec: Obj, ts: number, now: number) {
  const p = obj(rec.payload);
  if (rec.type === 'turn_context' && str(p.model)) f.model = str(p.model);
  if (rec.type === 'response_item') {
    if (p.type === 'function_call_output') {
      const out = textOf(p.output);
      noteBig(f, out.length);
    } else if (p.type === 'message' && p.role === 'user') {
      const text = textOf(p.content);
      if (isPrompt(text)) setTitle(f, text, 0);
    }
  } else if (rec.type === 'event_msg' && p.type === 'token_count') {
    noteLimits(f, obj(p.rate_limits), ts);
    const u = obj(obj(p.info).total_token_usage);
    if (!Object.keys(u).length) return null;
    const cached = num(u.cached_input_tokens);
    const cur: Tally = {
      input: Math.max(0, num(u.input_tokens) - cached),
      output: num(u.output_tokens),
      cacheCreate: 0,
      cacheRead: cached,
    };
    const prev = f.codexLast;
    f.codexLast = cur;
    const sum = (t: Tally) => t.input + t.output + t.cacheRead;
    return record(f, ts, f.model, prev && sum(cur) >= sum(prev) ? sub(cur, prev) : cur, now);
  }
  return null;
}

/** Codex `rate_limits.primary/secondary` → the file's latest windows. */
function noteLimits(f: FileFold, rl: Obj, ts: number): void {
  const windows: LimitWindow[] = [];
  for (const w of [obj(rl.primary), obj(rl.secondary)]) {
    const pct = w.used_percent;
    const min = num(w.window_minutes);
    const resetsAt = num(w.resets_at) * 1000;
    if (typeof pct === 'number' && Number.isFinite(pct) && pct >= 0 && min && resetsAt)
      windows.push({ pct, min, resetsAt });
  }
  if (windows.length && ts >= (f.limits?.ts ?? 0)) f.limits = { ts, windows };
}

/** Seconds the file's prompt cache has left (Claude), 0 when expired or unknown. */
export function cacheLeft(f: FileFold, now: number): number {
  if (!f.cacheAt) return 0;
  const ttl = f.cache1h ? CLAUDE_CACHE_TTL_LONG_MS : CLAUDE_CACHE_TTL_MS;
  return Math.max(0, Math.ceil((f.cacheAt + ttl - now) / 1000));
}

/** Applies one JSONL line; returns the per-day delta it produced (for buckets), or null. */
export function foldLine(
  f: FileFold,
  line: string,
  now: number,
): { ts: number; model: string; d: Tally } | null {
  let rec: unknown;
  try {
    rec = JSON.parse(line);
  } catch {
    return null;
  }
  if (!rec || typeof rec !== 'object') return null;
  const r = rec as Obj;
  const ts = lineTime(r.timestamp, now);
  if (f.act) foldActivity(f.act, f.provider, r);
  // Session span from dated lines only (an undated snapshot would read as the scan time).
  if (typeof r.timestamp === 'string') {
    if (!f.firstTs || ts < f.firstTs) f.firstTs = ts;
    if (ts > f.lastTs) f.lastTs = ts;
  }
  const cwd = f.provider === 'claude' ? r.cwd : obj(r.payload).cwd;
  if (
    typeof cwd === 'string' &&
    cwd &&
    (f.provider === 'claude' || r.type === 'turn_context' || r.type === 'session_meta')
  )
    f.cwd = cwd;
  if (f.provider === 'claude') {
    if (r.type === 'custom-title') setTitle(f, str(r.customTitle), 2);
    else if (r.type === 'ai-title') setTitle(f, str(r.aiTitle), 1);
  }
  return f.provider === 'claude' ? claude(f, r, ts, now) : codex(f, r, ts, now);
}

/** Billable tokens per minute over USAGE_RATE_WINDOW_MS. */
export function rateOf(f: FileFold, now: number): number {
  prune(f, now);
  const sum = f.recent.reduce((a, [, b]) => a + b, 0);
  return sum / (USAGE_RATE_WINDOW_MS / 60_000);
}
