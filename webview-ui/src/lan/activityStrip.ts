// The session window's activity strip: the last minutes of its transcript, one cell per
// minute, coloured by the most telling thing that happened in it.
import { exitCodeOf, isFailure } from '../../../core/src/lan.js';
import type { TranscriptEntry } from '../../../core/src/messages.js';

export type StripCat = 'fail' | 'edit' | 'run' | 'read' | 'tool' | 'think' | 'user';
/** A cell before the earliest loaded entry while earlier pages exist: not known yet. */
export type StripCell = StripCat | 'unknown' | null;
/** Earlier = shown over later ones in the same minute. */
export const STRIP_ORDER: readonly StripCat[] = [
  'fail',
  'edit',
  'run',
  'read',
  'tool',
  'think',
  'user',
];

const EDIT = /^(Edit|MultiEdit|Write|NotebookEdit|apply_patch)$/;
const RUN = /^(Bash|BashOutput|exec_command|local_shell_call|shell|write_stdin|KillShell)$/;
const READ = /^(Read|Grep|Glob|LS|WebFetch|WebSearch|web_search|web__run|view_image|mcp__.*)$/;

/** A shell call's command in its tool entry text (Claude JSON `command`, Codex `cmd`). */
function commandIn(text: string): string {
  const m = /\b(?:command|cmd)"?\s*:\s*"((?:\\.|[^"\\])*)"/.exec(text);
  if (!m) return '';
  try {
    return JSON.parse(`"${m[1]}"`) as string;
  } catch {
    return m[1];
  }
}

/** `command` = the call's command, to tell probes (grep finding nothing) from failures. The
 *  rule is the one the bubble's failure drop uses (`isFailure`). */
export function stripCat(e: TranscriptEntry, command = ''): StripCat | null {
  if (e.kind === 'result') {
    const flagged = e.error === true || (exitCodeOf(e.text) ?? 0) !== 0;
    return flagged && isFailure(e.text, command) ? 'fail' : null;
  }
  if (e.kind === 'tool') {
    const tool = e.tool ?? '';
    return EDIT.test(tool) ? 'edit' : RUN.test(tool) ? 'run' : READ.test(tool) ? 'read' : 'tool';
  }
  if (e.kind === 'assistant' || e.kind === 'thinking') return 'think';
  return e.kind === 'user' ? 'user' : null;
}

/** `minutes` cells, oldest first, ending at the minute of `now`; null = nothing happened.
 *  `more` (earlier pages not loaded): minutes before the first loaded entry are 'unknown'. */
export function stripCells(
  entries: readonly TranscriptEntry[],
  now: number,
  minutes: number,
  more = false,
): StripCell[] {
  const cells: StripCell[] = Array.from({ length: minutes }, () => null);
  const end = Math.floor(now / 60_000);
  const commands = new Map<string, string>();
  for (const e of entries)
    if (e.kind === 'tool' && e.callId) commands.set(e.callId, commandIn(e.text));
  let first = Infinity;
  for (const e of entries) {
    const t = e.ts ? Date.parse(e.ts) : NaN;
    if (!Number.isFinite(t)) continue;
    first = Math.min(first, t);
    const i = minutes - 1 - (end - Math.floor(t / 60_000));
    if (i < 0 || i >= minutes) continue;
    const cat = stripCat(e, (e.callId && commands.get(e.callId)) || '');
    const cur = cells[i];
    if (cat && (cur === null || STRIP_ORDER.indexOf(cat) < STRIP_ORDER.indexOf(cur as StripCat)))
      cells[i] = cat;
  }
  if (more) {
    const known = Number.isFinite(first) ? Math.floor(first / 60_000) : end + 1;
    for (let i = 0; i < minutes; i++) if (end - (minutes - 1 - i) < known) cells[i] = 'unknown';
  }
  return cells;
}
