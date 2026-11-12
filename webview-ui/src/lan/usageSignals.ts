// Pure helpers for the token usage signals (size, burn rate, model, big results) of my agents.
import type { AgentUsage } from '../../../core/src/lan.js';
import { USAGE_BURN_TIERS, USAGE_SIZE_TIERS } from '../constants.js';

export type SizeTier = 1 | 1.5 | 2;
export type BurnTier = 0 | 1 | 2 | 3; // none / blue / yellow / red
export type ModelFamily = 'opus' | 'sonnet' | 'haiku' | null;

export function sizeTier(u?: AgentUsage): SizeTier {
  const n = u?.tokens ?? 0;
  return n >= USAGE_SIZE_TIERS[1] ? 2 : n >= USAGE_SIZE_TIERS[0] ? 1.5 : 1;
}

export function burnTier(u?: AgentUsage): BurnTier {
  const r = u?.rate ?? 0;
  return r >= USAGE_BURN_TIERS[2]
    ? 3
    : r >= USAGE_BURN_TIERS[1]
      ? 2
      : r >= USAGE_BURN_TIERS[0]
        ? 1
        : 0;
}

/** "999", "1.2k", "1.3M" — one decimal, rounded. */
export function tokensText(n: number): string {
  if (n < 1_000) return String(n);
  const k = Math.round(n / 100) / 10; // thousands, 1 decimal; unit chosen after rounding
  if (k < 1_000) return `${k.toFixed(1)}k`;
  return `${(Math.round(n / 100_000) / 10).toFixed(1)}M`;
}

/** Name-tag chip: "3.4M", or "3.4M · Σ4.1M" for a main whose children add up to more. */
export function usageChipText(u: AgentUsage): string {
  return u.sum === undefined
    ? tokensText(u.tokens)
    : `${tokensText(u.tokens)} · Σ${tokensText(u.sum)}`;
}

export function modelFamily(model?: string): ModelFamily {
  const m = model?.toLowerCase() ?? '';
  return m.includes('opus')
    ? 'opus'
    : m.includes('sonnet')
      ? 'sonnet'
      : m.includes('haiku')
        ? 'haiku'
        : null;
}

export function modelLabel(model?: string): string {
  const f = modelFamily(model);
  return f ? f[0].toUpperCase() + f.slice(1) : '';
}

/** Tokens of a new big result between two snapshots; null at the baseline or when none arrived. */
export function bigTrigger(prev?: AgentUsage, next?: AgentUsage): number | null {
  if (!prev || !next?.big) return null;
  return next.big.n > (prev.big?.n ?? 0) ? next.big.last : null;
}
