// One-shot effects over agents, triggered only by changes between two real snapshots
// (never by tour demos): lines added (+N), a finished task list or turn (celebration), a
// fresh failure (smoke + the PC's red flash).
import type { OfficeAgent } from '../../../core/src/lan.js';
import { bigTrigger, tokensText } from './usageSignals.js';

export type EffectKind = 'plus' | 'confetti' | 'smoke' | 'box';
export interface EffectTrigger {
  key: string;
  kind: EffectKind;
  /** plus: "+12"; box: "📦 +82k" (and "−3" when lines went too). */
  text?: string;
}

/** A playing effect: anchored to a character id (the agent, or its PC's avatar when folded). */
export interface LiveEffect extends EffectTrigger {
  id: number;
  anchor: number;
  /** performance.now() when it started. */
  born: number;
}

/** What changed for each agent seen in both snapshots (a newcomer is only the baseline). */
export function effectTriggers(
  prev: ReadonlyMap<string, OfficeAgent>,
  next: readonly OfficeAgent[],
): EffectTrigger[] {
  const out: EffectTrigger[] = [];
  for (const a of next) {
    const p = prev.get(a.key);
    if (!p || a.hidden || p.hidden || a.quiet || p.quiet) continue;
    const add = (a.diff?.add ?? 0) - (p.diff?.add ?? 0);
    const del = (a.diff?.del ?? 0) - (p.diff?.del ?? 0);
    if (add > 0 || del > 0) {
      const parts = [add > 0 ? `+${String(add)}` : '', del > 0 ? `−${String(del)}` : ''];
      out.push({ key: a.key, kind: 'plus', text: parts.filter(Boolean).join(' ') });
    }
    const big = bigTrigger(p.usage, a.usage);
    if (big !== null)
      out.push({ key: a.key, kind: 'box', text: `📦 +${tokensText(big).replace('.0', '')}` });
    if (a.fail && !p.fail) out.push({ key: a.key, kind: 'smoke' });
    const listDone =
      !!a.todo && a.todo.done === a.todo.total && (!p.todo || p.todo.done < p.todo.total);
    // A main agent's turn ending (work → idle) also counts; children end all the time.
    const turnDone = a.kind === 'main' && a.act === 'idle' && p.act !== 'idle' && !a.permission;
    if (listDone || turnDone) out.push({ key: a.key, kind: 'confetti' });
  }
  return out;
}
