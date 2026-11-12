import { describe, expect, it } from 'vitest';

import { billable, foldLine, newFold, rateOf } from '../../src/lan/usageLine.js';

const NOW = Date.parse('2026-11-12T10:00:00Z');
const asst = (id: string, u: object, model = 'claude-x') =>
  JSON.stringify({ type: 'assistant', cwd: '/w/p', message: { id, model, usage: u, content: [] } });
const tokenCount = (input: number, cached: number, output: number) =>
  JSON.stringify({
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: {
        total_token_usage: {
          input_tokens: input,
          cached_input_tokens: cached,
          output_tokens: output,
        },
      },
    },
  });

describe('usageLine', () => {
  it('same message.id replaces its prior tally', () => {
    const f = newFold('claude');
    foldLine(f, asst('m1', { input_tokens: 100, output_tokens: 10 }), NOW);
    const r = foldLine(f, asst('m1', { input_tokens: 100, output_tokens: 50 }), NOW);
    expect(f.total.output).toBe(50);
    expect(r?.d.output).toBe(40);
    expect(f.total.input).toBe(100);
  });
  it('maps cache fields; billable excludes cacheRead', () => {
    const f = newFold('claude');
    foldLine(
      f,
      asst('m', {
        input_tokens: 1,
        output_tokens: 2,
        cache_creation_input_tokens: 3,
        cache_read_input_tokens: 4,
      }),
      NOW,
    );
    expect(f.total).toEqual({ input: 1, output: 2, cacheCreate: 3, cacheRead: 4 });
    expect(billable(f.total)).toBe(6);
  });
  it('codex deltas, reset on shrink', () => {
    const f = newFold('codex');
    expect(foldLine(f, tokenCount(1000, 200, 10), NOW)?.d.input).toBe(800);
    const d = foldLine(f, tokenCount(1500, 300, 20), NOW)?.d;
    expect(d?.input).toBe(400);
    expect(d?.cacheRead).toBe(100);
    expect(foldLine(f, tokenCount(100, 0, 0), NOW)?.d.input).toBe(100);
  });
  it('model: claude from message, codex from turn_context', () => {
    const f = newFold('claude');
    foldLine(f, asst('a', { input_tokens: 1 }, 'm-1'), NOW);
    foldLine(f, asst('b', { input_tokens: 1 }, 'm-2'), NOW);
    expect(f.model).toBe('m-2');
    const c = newFold('codex');
    foldLine(
      c,
      JSON.stringify({ type: 'turn_context', payload: { model: 'gpt-z', cwd: '/c/q' } }),
      NOW,
    );
    expect(c.model).toBe('gpt-z');
    expect(c.cwd).toBe('/c/q');
  });
  it('big tool_result', () => {
    const f = newFold('claude');
    const res = (n: number) =>
      JSON.stringify({
        type: 'user',
        message: { content: [{ type: 'tool_result', content: 'x'.repeat(n) }] },
      });
    foldLine(f, res(100), NOW);
    expect(f.big).toEqual({ n: 0, last: 0 });
    foldLine(f, res(200_004), NOW);
    expect(f.big).toEqual({ n: 1, last: 50_001 });
  });
  it('rateOf averages over the window', () => {
    const f = newFold('claude');
    const at = (s: number) => new Date(NOW - s * 1000).toISOString();
    for (const [id, s] of [
      ['a', 30],
      ['b', 150],
    ] as const)
      foldLine(
        f,
        JSON.stringify({
          type: 'assistant',
          timestamp: at(s),
          message: { id, usage: { input_tokens: 30_000 } },
        }),
        NOW,
      );
    expect(rateOf(f, NOW)).toBe(15_000);
  });
  it('non-JSON line is ignored', () => {
    const f = newFold('claude');
    const before = JSON.stringify(f);
    expect(foldLine(f, 'not json {', NOW)).toBeNull();
    expect(JSON.stringify(f)).toBe(before);
  });
  it('title: custom > ai > prompt, clipped to 60', () => {
    const f = newFold('claude');
    foldLine(f, JSON.stringify({ type: 'user', message: { content: 'first prompt' } }), NOW);
    expect(f.title).toBe('first prompt');
    foldLine(f, JSON.stringify({ type: 'ai-title', aiTitle: 'auto' }), NOW);
    expect(f.title).toBe('auto');
    foldLine(f, JSON.stringify({ type: 'custom-title', customTitle: '가'.repeat(80) }), NOW);
    foldLine(f, JSON.stringify({ type: 'ai-title', aiTitle: 'later auto' }), NOW);
    expect(Array.from(f.title)).toHaveLength(60);
    expect(f.title.startsWith('가')).toBe(true);
  });
});
