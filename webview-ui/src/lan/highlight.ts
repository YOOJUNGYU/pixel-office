// Small regex syntax highlighter for the transcript panel (no runtime dependency, per
// CLAUDE.md). One pass over the text: comments, strings, numbers, words → token kinds.
// ponytail: a lexer per family, not a parser; nested templates / heredocs colour as plain.

export type TokenKind = 'plain' | 'kw' | 'str' | 'num' | 'com' | 'fn' | 'type' | 'prop';
export interface Token {
  kind: TokenKind;
  text: string;
}

export type Family =
  'js' | 'py' | 'sh' | 'json' | 'css' | 'c' | 'go' | 'rust' | 'sql' | 'yaml' | 'xml';

const ALIASES: Record<string, Family> = {
  js: 'js',
  jsx: 'js',
  mjs: 'js',
  cjs: 'js',
  ts: 'js',
  tsx: 'js',
  mts: 'js',
  cts: 'js',
  javascript: 'js',
  typescript: 'js',
  vue: 'js',
  svelte: 'js',
  py: 'py',
  python: 'py',
  pyi: 'py',
  sh: 'sh',
  bash: 'sh',
  zsh: 'sh',
  shell: 'sh',
  console: 'sh',
  ps1: 'sh',
  powershell: 'sh',
  json: 'json',
  jsonc: 'json',
  jsonl: 'json',
  css: 'css',
  scss: 'css',
  less: 'css',
  c: 'c',
  h: 'c',
  cpp: 'c',
  cc: 'c',
  hpp: 'c',
  cs: 'c',
  csharp: 'c',
  java: 'c',
  kt: 'c',
  kotlin: 'c',
  swift: 'c',
  dart: 'c',
  php: 'c',
  scala: 'c',
  go: 'go',
  golang: 'go',
  rs: 'rust',
  rust: 'rust',
  sql: 'sql',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'yaml',
  ini: 'yaml',
  env: 'yaml',
  html: 'xml',
  htm: 'xml',
  xml: 'xml',
  svg: 'xml',
  plist: 'xml',
};

/** A fence tag (`ts`, `bash`…) or a file path's extension → a highlight family, else undefined. */
export function languageOf(tagOrPath: string | undefined): Family | undefined {
  if (!tagOrPath) return undefined;
  const s = tagOrPath.trim().toLowerCase();
  const ext = /\.([a-z0-9]+)$/.exec(s)?.[1];
  return ALIASES[s] ?? (ext ? ALIASES[ext] : undefined);
}

const words = (s: string) => new Set(s.split(' '));
const KEYWORDS: Record<Family, Set<string>> = {
  js: words(
    'const let var function return if else for while do switch case default break continue new delete typeof instanceof in of class extends super this import export from as async await yield try catch finally throw void null undefined true false interface type enum implements private public protected readonly static abstract declare namespace keyof satisfies',
  ),
  py: words(
    'def return if elif else for while break continue pass class import from as with try except finally raise lambda yield global nonlocal assert del in is not and or None True False async await self',
  ),
  sh: words(
    'if then else elif fi for while until do done case esac in function return local export readonly set unset exit break continue true false',
  ),
  json: words('true false null'),
  css: words('important inherit initial unset none auto'),
  c: words(
    'int long short char float double void bool boolean unsigned signed const static struct union enum typedef sizeof return if else for while do switch case default break continue goto new delete class public private protected virtual override final abstract interface extends implements import package namespace using try catch finally throw throws this super null nullptr true false var val fun let func guard async await',
  ),
  go: words(
    'package import func return if else for range switch case default break continue go defer select chan map struct interface type var const nil true false fallthrough goto',
  ),
  rust: words(
    'fn let mut pub use mod crate self super struct enum impl trait for in if else match loop while break continue return as ref move where async await dyn const static unsafe extern type true false Some None Ok Err',
  ),
  sql: words(
    'select from where and or not insert into values update set delete create table drop alter index join left right inner outer on as group by order having limit offset distinct union all null is in like between case when then else end primary key foreign references default exists',
  ),
  yaml: words('true false null yes no on off'),
  xml: words(''),
};

const HASH_COMMENT = new Set<Family>(['py', 'sh', 'yaml']);
const SLASH_COMMENT = new Set<Family>(['js', 'c', 'go', 'rust', 'css', 'json']);
/** Capitalised words read as types / classes in these. */
const TYPE_CASE = new Set<Family>(['js', 'py', 'c', 'go', 'rust']);
/** Beyond this, a block is shown plain (keeps a huge paste cheap). */
export const HIGHLIGHT_MAX_CHARS = 20000;

type Part = 'com' | 'str' | 'num' | 'var' | 'tag' | 'word';

/** One alternation, each part one capture group (inner groups are non-capturing). */
function lexer(f: Family): { re: RegExp; kinds: Part[] } {
  const parts: Array<[Part, string]> = [];
  const end = '$(?![\\s\\S])'; // end of the whole text (an unclosed comment / string runs to it)
  if (SLASH_COMMENT.has(f)) parts.push(['com', `\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|${end})`]);
  if (HASH_COMMENT.has(f)) parts.push(['com', '(?:^|(?<=\\s))#[^\\n]*']);
  if (f === 'sql') parts.push(['com', '--[^\\n]*']);
  if (f === 'xml') {
    parts.push(['com', `<!--[\\s\\S]*?(?:-->|${end})`]);
    parts.push(['tag', '<\\/?[A-Za-z][\\w:.-]*|\\/?>']);
  }
  if (f === 'py') parts.push(['str', `"""[\\s\\S]*?(?:"""|${end})|'''[\\s\\S]*?(?:'''|${end})`]);
  parts.push(['str', `"(?:\\\\.|[^"\\\\\\n])*"?|'(?:\\\\.|[^'\\\\\\n])*'?`]);
  if (f === 'js' || f === 'sh' || f === 'go') parts.push(['str', '`(?:\\\\.|[^`\\\\])*`?']);
  if (f === 'sh') parts.push(['var', '\\$\\{[^}\\n]*\\}?|\\$[\\w@*#?$!-]+']);
  parts.push(['num', '\\b(?:0x[\\da-fA-F]+|\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)\\b']);
  parts.push([
    'word',
    f === 'css' || f === 'sh' || f === 'yaml' ? '[A-Za-z_][\\w-]*' : '[A-Za-z_$][\\w$]*',
  ]);
  return {
    re: new RegExp(parts.map(([, x]) => `(${x})`).join('|'), 'gm'),
    kinds: parts.map(([k]) => k),
  };
}

const LEXERS = new Map<Family, ReturnType<typeof lexer>>();

/** `text` as coloured tokens for `family` (adjacent plain text merged). */
export function highlight(text: string, family: Family | undefined): Token[] {
  if (!family || text.length > HIGHLIGHT_MAX_CHARS) return [{ kind: 'plain', text }];
  let lx = LEXERS.get(family);
  if (!lx) LEXERS.set(family, (lx = lexer(family)));
  const { re, kinds } = lx;
  re.lastIndex = 0;
  const kw = KEYWORDS[family];
  const out: Token[] = [];
  const push = (kind: TokenKind, s: string) => {
    if (!s) return;
    const last = out[out.length - 1];
    if (last && last.kind === kind && kind === 'plain') last.text += s;
    else out.push({ kind, text: s });
  };
  let at = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m[0] === '') {
      re.lastIndex++;
      continue;
    }
    push('plain', text.slice(at, m.index));
    at = m.index + m[0].length;
    const part = kinds[m.findIndex((g, n) => n > 0 && g !== undefined) - 1];
    const after = text.slice(at, at + 40);
    if (part === 'str')
      push((family === 'json' || family === 'yaml') && /^\s*:/.test(after) ? 'prop' : 'str', m[0]);
    else if (part === 'word')
      push(wordKind(m[0], family, kw, text.slice(Math.max(0, m.index - 40), m.index), after), m[0]);
    else push(part === 'var' ? 'type' : part === 'tag' ? 'kw' : part, m[0]);
  }
  push('plain', text.slice(at));
  return out;
}

function wordKind(w: string, f: Family, kw: Set<string>, before: string, after: string): TokenKind {
  const lower = f === 'sql' ? w.toLowerCase() : w;
  if (kw.has(lower)) return 'kw';
  if (f === 'yaml') return /^\s*:/.test(after) && /(^|\n)\s*(- )?$/.test(before) ? 'prop' : 'plain';
  if (f === 'css') return /^\s*:/.test(after) && !/[:]\s*$/.test(before) ? 'prop' : 'plain';
  if (f === 'xml') return /^\s*=/.test(after) ? 'prop' : 'plain';
  // A shell command: first word of a line or after | && || ; ( $(
  if (f === 'sh') return /(^|\n|[|;&(]|\$\()\s*$/.test(before) ? 'fn' : 'plain';
  if (/^\s*\(/.test(after)) return 'fn';
  if (TYPE_CASE.has(f) && /^[A-Z][a-z0-9]/.test(w)) return 'type';
  return 'plain';
}
