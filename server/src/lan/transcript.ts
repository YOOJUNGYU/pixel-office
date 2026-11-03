import type { Provider } from '../../../core/src/lan.js';
import { TRANSCRIPT_ENTRY_MAX_CHARS, TRANSCRIPT_META_MAX_CHARS } from '../constants.js';

export type TranscriptKind = 'user' | 'assistant' | 'thinking' | 'tool' | 'result' | 'meta';
export interface TranscriptEntry {
  kind: TranscriptKind;
  text: string;
  ts?: string;
  tool?: string;
  callId?: string;
  error?: true;
  clipped?: number;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** Concatenate the `text` of a block array. */
function blocksText(v: unknown, image = false): string {
  if (!Array.isArray(v)) return '';
  return v
    .map((b) => (isObj(b) ? (image && b.type === 'image' ? '[image]' : (str(b.text) ?? '')) : ''))
    .join('');
}

function make(
  kind: TranscriptKind,
  text: string,
  ts: string | undefined,
  extra: Partial<TranscriptEntry> = {},
): TranscriptEntry {
  const max = kind === 'meta' ? TRANSCRIPT_META_MAX_CHARS : TRANSCRIPT_ENTRY_MAX_CHARS;
  const e: TranscriptEntry = { kind, text: text.slice(0, max), ...extra };
  if (ts) e.ts = ts;
  if (text.length > max) e.clipped = text.length - max;
  return e;
}

function claude(o: Obj, ts: string | undefined, out: TranscriptEntry[]): void {
  const msg = isObj(o.message) ? o.message : {};
  const c = msg.content;
  switch (o.type) {
    case 'user':
      if (typeof c === 'string') out.push(make(o.isMeta === true ? 'meta' : 'user', c, ts));
      else if (Array.isArray(c))
        for (const b of c) {
          if (!isObj(b)) continue;
          if (b.type === 'text' && typeof b.text === 'string') out.push(make('user', b.text, ts));
          else if (b.type === 'tool_result') {
            const text = typeof b.content === 'string' ? b.content : blocksText(b.content, true);
            out.push(
              make('result', text, ts, {
                callId: str(b.tool_use_id),
                ...(b.is_error === true ? { error: true as const } : {}),
              }),
            );
          }
        }
      break;
    case 'assistant':
      if (!Array.isArray(c)) break;
      for (const b of c) {
        if (!isObj(b)) continue;
        if (b.type === 'text' && typeof b.text === 'string')
          out.push(make('assistant', b.text, ts));
        else if (b.type === 'thinking') {
          const t = str(b.thinking);
          if (t) out.push(make('thinking', t, ts));
        } else if (b.type === 'tool_use')
          out.push(
            make('tool', JSON.stringify(b.input, null, 2) ?? '', ts, {
              tool: str(b.name),
              callId: str(b.id),
            }),
          );
      }
      break;
    case 'system':
      if (typeof o.content === 'string') out.push(make('meta', o.content, ts));
      break;
    case 'summary':
      if (typeof o.summary === 'string') out.push(make('meta', o.summary, ts));
      break;
    case 'attachment': {
      const a = isObj(o.attachment) ? o.attachment : {};
      const t = str(a.content) ?? str(o.content);
      if (t !== undefined) out.push(make('meta', t, ts));
      break;
    }
  }
}

const CODEX_META = ['<environment_context>', '<user_instructions>', '# AGENTS.md instructions'];

function codex(o: Obj, ts: string | undefined, out: TranscriptEntry[]): void {
  if (o.type !== 'response_item' || !isObj(o.payload)) return;
  const p = o.payload;
  const callId = str(p.call_id);
  switch (p.type) {
    case 'message': {
      const text = blocksText(p.content);
      if (p.role === 'assistant') out.push(make('assistant', text, ts));
      else if (p.role === 'user')
        out.push(make(CODEX_META.some((m) => text.startsWith(m)) ? 'meta' : 'user', text, ts));
      break;
    }
    case 'reasoning': {
      const t = blocksText(p.summary);
      if (t) out.push(make('thinking', t, ts));
      break;
    }
    case 'function_call':
    case 'custom_tool_call':
    case 'local_shell_call':
    case 'web_search_call': {
      const text =
        str(p.arguments) ?? str(p.input) ?? (JSON.stringify(p.action ?? {}, null, 2) as string);
      out.push(make('tool', text, ts, { tool: str(p.name) || String(p.type), callId }));
      break;
    }
    case 'function_call_output':
    case 'custom_tool_call_output': {
      const out_ = p.output;
      const text =
        typeof out_ === 'string'
          ? out_
          : Array.isArray(out_)
            ? blocksText(out_)
            : isObj(out_)
              ? (str(out_.content) ?? '')
              : '';
      out.push(make('result', text, ts, { callId }));
      break;
    }
  }
}

/** Normalize raw transcript JSONL lines into display entries. Bad lines are skipped. */
export function parseLines(provider: Provider, lines: string[]): TranscriptEntry[] {
  const out: TranscriptEntry[] = [];
  for (const line of lines) {
    let o: unknown;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isObj(o)) continue;
    const ts = str(o.timestamp);
    (provider === 'claude' ? claude : codex)(o, ts, out);
  }
  return out;
}
