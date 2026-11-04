// The session window's activity strip: the last minutes of its transcript, one cell per
// minute, coloured by the most telling thing that happened in it.
import type { TranscriptEntry } from '../../../core/src/messages.js';

export type StripCat = 'fail' | 'edit' | 'run' | 'read' | 'tool' | 'think' | 'user';
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

export function stripCat(e: TranscriptEntry): StripCat | null {
  if (e.kind === 'result') return e.error ? 'fail' : null;
  if (e.kind === 'tool') {
    const tool = e.tool ?? '';
    return EDIT.test(tool) ? 'edit' : RUN.test(tool) ? 'run' : READ.test(tool) ? 'read' : 'tool';
  }
  if (e.kind === 'assistant' || e.kind === 'thinking') return 'think';
  return e.kind === 'user' ? 'user' : null;
}

/** `minutes` cells, oldest first, ending at the minute of `now`; null = nothing happened. */
export function stripCells(
  entries: readonly TranscriptEntry[],
  now: number,
  minutes: number,
): (StripCat | null)[] {
  const cells: (StripCat | null)[] = Array.from({ length: minutes }, () => null);
  const end = Math.floor(now / 60_000);
  for (const e of entries) {
    const t = e.ts ? Date.parse(e.ts) : NaN;
    if (!Number.isFinite(t)) continue;
    const i = minutes - 1 - (end - Math.floor(t / 60_000));
    if (i < 0 || i >= minutes) continue;
    const cat = stripCat(e);
    const cur = cells[i];
    if (cat && (cur === null || STRIP_ORDER.indexOf(cat) < STRIP_ORDER.indexOf(cur)))
      cells[i] = cat;
  }
  return cells;
}
