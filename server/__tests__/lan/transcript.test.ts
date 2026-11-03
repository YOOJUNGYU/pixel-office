import { describe, expect, it } from 'vitest';

import { TRANSCRIPT_ENTRY_MAX_CHARS } from '../../src/constants.js';
import { parseLines } from '../../src/lan/transcript.js';

const j = (o: unknown) => JSON.stringify(o);
const userLine = j({ type: 'user', timestamp: 'T1', message: { content: 'hello' } });

describe('parseLines', () => {
  it('claude: prompt, answer, thinking, tool and result in order', () => {
    const lines = [
      userLine,
      j({
        type: 'assistant',
        message: {
          content: [
            { type: 'thinking', thinking: 'hmm' },
            { type: 'text', text: 'ok' },
            { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } },
          ],
        },
      }),
      j({
        type: 'user',
        message: {
          content: [{ type: 'tool_result', tool_use_id: 't1', content: 'a\nb', is_error: true }],
        },
      }),
    ];
    const e = parseLines('claude', lines);
    expect(e.map((x) => x.kind)).toEqual(['user', 'thinking', 'assistant', 'tool', 'result']);
    expect(e[0].ts).toBe('T1');
    expect(e[3]).toMatchObject({
      tool: 'Bash',
      callId: 't1',
      text: JSON.stringify({ command: 'ls' }, null, 2),
    });
    expect(e[4]).toMatchObject({ callId: 't1', text: 'a\nb', error: true });
  });

  it('claude: meta, system, summary', () => {
    const e = parseLines('claude', [
      j({ type: 'user', isMeta: true, message: { content: 'm' } }),
      j({ type: 'system', content: 's' }),
      j({ type: 'summary', summary: 'sum' }),
      j({ type: 'attachment', attachment: { content: 'x' }, content: 'att' }),
    ]);
    expect(e.map((x) => x.kind)).toEqual(['meta', 'meta', 'meta', 'meta']);
  });

  it('claude: noise lines are dropped', () => {
    const e = parseLines('claude', [
      j({ type: 'api-request', x: 1 }),
      j({ type: 'last-prompt', lastPrompt: 'x' }),
      j({ type: 'permission-mode', permissionMode: 'x' }),
    ]);
    expect(e).toEqual([]);
  });

  it('claude: image result becomes a placeholder', () => {
    const e = parseLines('claude', [
      j({
        type: 'user',
        message: {
          content: [
            { type: 'tool_result', tool_use_id: 't', content: [{ type: 'image', source: {} }] },
          ],
        },
      }),
    ]);
    expect(e[0].text).toBe('[image]');
  });

  it('codex: message, reasoning, call and output', () => {
    const ri = (payload: unknown) => j({ timestamp: 'T', type: 'response_item', payload });
    const e = parseLines('codex', [
      ri({ type: 'message', role: 'developer', content: [{ type: 'input_text', text: 'sys' }] }),
      ri({
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: '<environment_context>x' }],
      }),
      ri({
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: '# AGENTS.md instructions for /x' }],
      }),
      ri({ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'do it' }] }),
      ri({ type: 'reasoning', summary: [{ text: 'think' }] }),
      ri({ type: 'reasoning', summary: [] }),
      ri({ type: 'function_call', name: 'shell', call_id: 'c1', arguments: '{"cmd":"ls"}' }),
      ri({ type: 'function_call_output', call_id: 'c1', output: 'out' }),
      j({ type: 'event_msg', payload: { type: 'user_message', message: 'do it' } }),
    ]);
    expect(e.map((x) => x.kind)).toEqual(['meta', 'meta', 'user', 'thinking', 'tool', 'result']);
    expect(e[4]).toMatchObject({ tool: 'shell', callId: 'c1', text: '{"cmd":"ls"}' });
    expect(e[5]).toMatchObject({ callId: 'c1', text: 'out' });
  });

  it('clips a long text and reports how much', () => {
    const long = 'x'.repeat(TRANSCRIPT_ENTRY_MAX_CHARS + 10);
    const [e] = parseLines('claude', [j({ type: 'user', message: { content: long } })]);
    expect(e.text.length).toBe(TRANSCRIPT_ENTRY_MAX_CHARS);
    expect(e.clipped).toBe(10);
  });

  it('bad json is skipped', () => {
    expect(parseLines('claude', ['{oops', userLine])).toHaveLength(1);
  });
});
