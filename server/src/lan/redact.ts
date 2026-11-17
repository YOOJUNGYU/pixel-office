import type { AgentUsage, AgentView } from '../../../core/src/lan.js';

// Placeholders are language-neutral: every viewer shows them as-is.
const DIR = '…';
const SECRET = '***';

/** File -> basename; home dir -> "~" (username); other directory (trailing separator) -> "…". */
const base = (p: string): string => {
  if (/(?:^|[\\/])(?:home|Users)[\\/][^\\/]+[\\/]?$/.test(p)) return '~';
  if (/[\\/]$/.test(p)) return DIR;
  return (
    p
      .split(/[\\/]+/)
      .filter(Boolean)
      .pop() ?? p
  );
};
const SEG = String.raw`[^\s\\/"'<>|]`;

// ponytail: bare hosts only by suffix (a.b.local); add suffixes as they show up
const HOST_SUFFIX =
  'com|net|org|io|co|kr|jp|cn|local|internal|lan|corp|intra|intranet|localdomain|home';

/** Applied in order. Paths collapse to basename, URL hosts stay, other hosts, IPs and secrets become placeholders. */
const RULES: Array<[RegExp, string | ((m: string, ...g: string[]) => string)]> = [
  // JWT
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]*/g, SECRET],
  // KEY=value env assignment whose name looks secret
  [
    /\b([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASS|PWD)[A-Z0-9_]*)=(?:"[^"]*"|'[^']*'|\S+)/gi,
    `$1=${SECRET}`,
  ],
  // mysql -pPassword (psql/mariadb alike)
  [/\b((?:mysql\w*|mariadb\w*|psql|pg_\w+)\b[^|;&\n]*?\s)-p(?!\s)\S+/gi, `$1-p${SECRET}`],
  // bare dotted hostname (URL hosts, scheme-less "host/path" included, are kept below)
  [
    new RegExp(
      String.raw`(?<![\w.@/:-])(?:[a-z0-9-]+\.)+(?:${HOST_SUFFIX})\b(?![\w.-]|(?::\d+)?/)`,
      'gi',
    ),
    SECRET,
  ],
  // URL (any scheme) -> host only; userinfo, port, path, query dropped
  [/\b[a-z][a-z0-9+.-]*:\/\/(?:[^\s/@]*@)?([^\s/:?#'"<>)]+)(?::\d+)?[^\s'"<>)]*/gi, '$1'],
  // scheme-less URL (localhost / dotted host with TLD / IPv4, optional port, then "/") -> host only
  [
    /(?<![\w.@/-])(localhost|(?:[a-z0-9-]+\.)+[a-z]{2,}|\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?\/[^\s'"<>)]*/gi,
    '$1',
  ],
  // quoted Windows/UNC path (may contain spaces)
  [/(["'])(?:[A-Za-z]:|\\\\)[^"'\n]*\1/g, (m) => base(m.slice(1, -1))],
  // UNC, drive, ~ (unquoted)
  // segments may contain spaces if followed by a separator; last segment is space-free
  [/\\\\(?:[^\\/\n"'<>|:]*[\\/])*[^\s\\/"'<>|]*/g, base],
  [/\b[A-Za-z]:[\\/](?:[^\\/\n"'<>|:]*[\\/])*[^\s\\/"'<>|]*/g, base],
  [/(?<![\w.~])~[\\/][^\s"'<>|]*/g, base],
  // absolute posix, >=2 segments (a lone "/clear" is left alone)
  [new RegExp(String.raw`(?<![\w.:/\\-])(?:/${SEG}+){2,}/?`, 'g'), base],
  // relative: 3+ segments, or ./ ../, or ending in a file with extension (a/b prose like and/or stays)
  [
    new RegExp(
      String.raw`(?<![\w.:/\\-])(?:(?:${SEG}+/){2,}${SEG}*|\.\.?/(?:${SEG}+/)*${SEG}*|(?:${SEG}+/)+${SEG}*\.\w+)`,
      'g',
    ),
    base,
  ],
  // user@host (after URLs, so URL userinfo is already gone)
  [/[\w.+-]+@(?:[A-Za-z][\w-]*(?:\.[\w-]+)*|\d{1,3}(?:\.\d{1,3}){3})/g, SECRET],
  // IPv4 with optional port (ponytail: no IPv6)
  [/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?\b/g, SECRET],
  // secrets
  [/\bBearer\s+[\w.~+/=-]{16,}/gi, `Bearer ${SECRET}`],
  [/\bsk-[\w-]{10,}/g, SECRET],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, SECRET],
  [/\bxox[abprs]-[\w-]{10,}/g, SECRET],
  [/\bAKIA[0-9A-Z]{16}\b/g, SECRET],
  // 32+ char base64/hex blob; must contain a digit so long snake_case names survive
  [/(?<![\w+/=-])(?=[A-Za-z+/_-]*\d)[A-Za-z0-9+/_-]{32,}={0,2}/g, SECRET],
];

export function redactText(s: string): string {
  let out = s;
  for (const [re, rep] of RULES) out = out.replace(re, rep as string);
  return out;
}

const TOOL_NAME = /^[\w.:-]{1,40}$/;

/** Token usage as peers get it: totals, rate and model (no cache clock, no big results). */
const sharedUsage = (u: AgentUsage | undefined): AgentUsage | undefined =>
  u && {
    tokens: u.tokens,
    rate: Math.round(u.rate),
    ...(u.model && { model: u.model }),
    ...(u.sum !== undefined && { sum: u.sum }),
  };

/** A team office: the target redacted, the reason (the agent's own reply text: free prose)
 *  never sent. Title, usage and context are shared (LAN only since 1.0.65). */
export function redactView(v: AgentView): AgentView {
  const { usage, title, ...rest } = v;
  const u = sharedUsage(usage);
  // A title can be the first prompt itself: paths, hosts and secrets go as for targets.
  const t = title && redactText(title);
  return {
    ...rest,
    ...(u && { usage: u }),
    ...(t && { title: t }),
    target: redactText(v.target),
    reason: '',
  };
}

/** Public office (LAN only since 1.0.65): everything but the work itself — no target, no
 *  reason; the session title, model, tokens, context and the work signals (counts) go. */
export function quietView(v: AgentView): AgentView {
  const { usage, ...rest } = v;
  const u = sharedUsage(usage);
  // A tool's bare name (act tool/mcp) says what kind of work, not what it works on.
  const tool = (v.act === 'tool' || v.act === 'mcp') && TOOL_NAME.test(v.target) ? v.target : '';
  return { ...rest, ...(u && { usage: u }), target: tool, reason: '', quiet: true };
}
