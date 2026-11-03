// Pure text shaping for the transcript panel: fenced code in replies, inline marks,
// and tool inputs as readable fields instead of escaped JSON.

export type Block = { kind: 'text'; text: string } | { kind: 'code'; text: string; lang: string };

/** A reply split at ``` fences (an unclosed fence runs to the end, as while streaming). */
export function splitFences(text: string): Block[] {
  const out: Block[] = [];
  const re = /^[ \t]*```([\w+#.-]*)[^\n]*\n([\s\S]*?)(?:^[ \t]*```[ \t]*$|(?![\s\S]))/gm;
  let at = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > at) out.push({ kind: 'text', text: trimBreaks(text.slice(at, m.index)) });
    out.push({ kind: 'code', lang: m[1], text: m[2].replace(/\n$/, '') });
    at = re.lastIndex;
  }
  if (at < text.length) out.push({ kind: 'text', text: trimBreaks(text.slice(at)) });
  return out.filter((b) => b.kind === 'code' || b.text !== '');
}

function trimBreaks(s: string): string {
  return s.replace(/^\n+|\n+$/g, '');
}

export type Inline =
  { kind: 'plain'; text: string } | { kind: 'code'; text: string } | { kind: 'bold'; text: string };

/** `code` and **bold** inside one text run; everything else stays as written. */
export function splitInline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /`([^`\n]+)`|\*\*([^*\n]+)\*\*/g;
  let at = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > at) out.push({ kind: 'plain', text: text.slice(at, m.index) });
    out.push(m[1] !== undefined ? { kind: 'code', text: m[1] } : { kind: 'bold', text: m[2] });
    at = re.lastIndex;
  }
  if (at < text.length) out.push({ kind: 'plain', text: text.slice(at) });
  return out;
}

/** A markdown heading line (`# …` to `###### …`) → its text, else undefined. */
export function headingText(line: string): string | undefined {
  return /^#{1,6}\s+(.+)$/.exec(line)?.[1];
}

export interface ToolField {
  key: string;
  /** Strings as written (real line breaks); anything else pretty JSON. */
  value: string;
  /** Multi-line or long: shown as its own code block, not inline after the key. */
  block: boolean;
  /** Edit-style fields tinted as removed / added. */
  tone?: 'old' | 'new';
}

const BLOCK_CHARS = 80;

/** A tool input that is a JSON object → one field per key; anything else → undefined (raw). */
export function toolFields(text: string): ToolField[] | undefined {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const fields = Object.entries(v as Record<string, unknown>).map(([key, x]): ToolField => {
    const value = typeof x === 'string' ? x : (JSON.stringify(x, null, 2) ?? String(x));
    const tone = /^old/.test(key) ? 'old' : /^new/.test(key) ? 'new' : undefined;
    return {
      key,
      value,
      block: value.includes('\n') || value.length > BLOCK_CHARS || tone !== undefined,
      tone,
    };
  });
  return fields.length ? fields : undefined;
}

/** A tool result that is JSON → pretty-printed; anything else unchanged. */
export function prettyResult(text: string): string {
  const t = text.trim();
  if (!/^[[{]/.test(t)) return text;
  try {
    return JSON.stringify(JSON.parse(t), null, 2);
  } catch {
    return text;
  }
}
