import { appendFileSync, mkdtempSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { TRANSCRIPT_ENTRY_MAX_CHARS, TRANSCRIPT_PAGE_BYTES } from '../../src/constants.js';
import { shellOutput } from '../../src/lan/claudeParser.js';
import type { TranscriptSource } from '../../src/lan/scanner.js';
import type { TranscriptEntry } from '../../src/lan/transcript.js';
import {
  codexShellParse,
  parseLines,
  rawParse,
  readPage,
  TranscriptService,
} from '../../src/lan/transcript.js';

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

  it('claude: array-content isMeta prompt is meta', () => {
    const e = parseLines('claude', [
      j({
        type: 'user',
        isMeta: true,
        message: { content: [{ type: 'text', text: 'Base directory for this skill: /x' }] },
      }),
    ]);
    expect(e).toEqual([{ kind: 'meta', text: 'Base directory for this skill: /x' }]);
  });

  it('claude: non-text blocks become placeholders, never dropped', () => {
    const e = parseLines('claude', [
      j({
        type: 'user',
        message: {
          content: [
            { type: 'text', text: 'look' },
            { type: 'image', source: {} },
          ],
        },
      }),
      j({
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 't',
              content: [{ type: 'text', text: 'found' }, { type: 'tool_reference' }],
            },
          ],
        },
      }),
    ]);
    expect(e.map((x) => [x.kind, x.text])).toEqual([
      ['user', 'look\n[image]'],
      ['result', 'found\n[tool_reference]'],
    ]);
  });

  it('codex: input_image and an object output without content', () => {
    const ri = (payload: unknown) => j({ type: 'response_item', payload });
    const output = { stdout: 'o', code: 0 };
    const e = parseLines('codex', [
      ri({
        type: 'message',
        role: 'user',
        content: [
          { type: 'input_text', text: 'see' },
          { type: 'input_image', image_url: 'data:' },
        ],
      }),
      ri({ type: 'function_call_output', call_id: 'c', output }),
    ]);
    expect(e[0]).toMatchObject({ kind: 'user', text: 'see\n[image]' });
    expect(e[1]).toMatchObject({ kind: 'result', text: JSON.stringify(output, null, 2) });
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

describe('readPage', () => {
  const dir = mkdtempSync(join(tmpdir(), 'po-transcript-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const user = (text: string) => j({ type: 'user', message: { content: text } }) + '\n';
  const write = (name: string, body: string) => {
    const f = join(dir, name);
    writeFileSync(f, body);
    return f;
  };

  it('small file: everything, no more', async () => {
    const f = write('small.jsonl', user('a') + user('b') + user('c'));
    const p = await readPage(f, 'claude', statSync(f).size);
    expect(p.entries.length).toBe(3);
    expect(p.start).toBe(0);
    expect(p.more).toBe(false);
  });

  it('big file: tail page then the page before it, no line lost or doubled', async () => {
    const pad = 'x'.repeat(1000);
    const n = Math.ceil((TRANSCRIPT_PAGE_BYTES * 2.5) / 1050);
    let body = '';
    for (let i = 0; i < n; i++) body += user(`${i} ${pad}`);
    const f = write('big.jsonl', body);
    let end = statSync(f).size;
    const seen: number[] = [];
    let pages = 0;
    for (;;) {
      const p = await readPage(f, 'claude', end);
      pages++;
      seen.unshift(...p.entries.map((e) => parseInt(e.text, 10)));
      if (!p.more) break;
      end = p.start;
    }
    expect(pages).toBeGreaterThan(2);
    expect(seen).toEqual(Array.from({ length: n }, (_, i) => i));
  });

  it('one line larger than a page', async () => {
    const f = write(
      'huge.jsonl',
      user('first') + user('y'.repeat(TRANSCRIPT_PAGE_BYTES * 2)) + user('last'),
    );
    let end = statSync(f).size;
    const all: TranscriptEntry[] = [];
    for (;;) {
      const p = await readPage(f, 'claude', end);
      all.push(...p.entries);
      if (!p.more) break;
      end = p.start;
    }
    expect(all.length).toBe(3);
    expect(all.some((e) => (e.clipped ?? 0) > 0)).toBe(true);
  });

  it('unfinished last line is left for the live tail', async () => {
    const head = user('a') + user('b');
    const f = write('tail.jsonl', head + '{"type":"user","mess');
    const p = await readPage(f, 'claude', statSync(f).size);
    expect(p.entries.length).toBe(2);
    expect(p.end).toBe(Buffer.byteLength(head));
  });

  it('multibyte text across a page boundary', async () => {
    const n = Math.ceil((TRANSCRIPT_PAGE_BYTES * 2.2) / 300);
    let body = '';
    for (let i = 0; i < n; i++) body += user('한글'.repeat(50) + i);
    const f = write('ko.jsonl', body);
    let end = statSync(f).size;
    for (;;) {
      const p = await readPage(f, 'claude', end);
      for (const e of p.entries) expect(e.text).not.toContain('�');
      if (!p.more) break;
      end = p.start;
    }
  });
});

describe('TranscriptService', () => {
  const dir = mkdtempSync(join(tmpdir(), 'po-transcript-svc-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const POLL = 20;
  const user = (text: string) => j({ type: 'user', message: { content: text } }) + '\n';
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let svc: TranscriptService | undefined;
  afterEach(() => svc?.stop());

  /** A service whose source knows `ids` → files in `dir`; returns the messages sent. */
  function setup(files: Record<string, string>) {
    const srcs = new Map<string, TranscriptSource>();
    for (const [id, body] of Object.entries(files)) {
      const file = join(dir, `${id}-${Math.random().toString(36).slice(2)}.jsonl`);
      writeFileSync(file, body);
      srcs.set(id, {
        file,
        provider: 'claude',
        kind: 'main',
        num: 1,
        title: `T-${id}`,
        folder: 'f',
      });
    }
    svc = new TranscriptService({ transcriptOf: (id) => srcs.get(id) }, POLL);
    const sent: Array<Record<string, unknown>> = [];
    const send = (m: Record<string, unknown>) => sent.push(m);
    const file = (id: string) => srcs.get(id)!.file;
    return { svc, sent, send, file, client: {} };
  }
  const ofType = (sent: Array<Record<string, unknown>>, type: string) =>
    sent.filter((m) => m.type === type) as Array<
      Record<string, unknown> & { entries: TranscriptEntry[] }
    >;

  it('open sends the tail page with info', async () => {
    const t = setup({ a: user('one') + user('two') });
    await t.svc.open(t.client, 'a', t.send);
    expect(t.sent[0].type).toBe('transcriptLoaded');
    const info = t.sent[0].info as Record<string, unknown>;
    // Exactly the info fields: nothing else from the source (no file path).
    expect(info).toEqual({ kind: 'main', provider: 'claude', num: 1, title: 'T-a', folder: 'f' });
    expect((t.sent[0].entries as TranscriptEntry[]).length).toBe(2);
  });

  it('unknown id → notFound, nothing read', async () => {
    const t = setup({});
    await t.svc.open(t.client, 'nope', t.send);
    expect(t.sent).toEqual([{ type: 'transcriptError', id: 'nope', reason: 'notFound' }]);
  });

  it('missing file → unreadable', async () => {
    const t = setup({ a: user('x') });
    unlinkSync(t.file('a'));
    await t.svc.open(t.client, 'a', t.send);
    expect(t.sent).toEqual([{ type: 'transcriptError', id: 'a', reason: 'unreadable' }]);
  });

  it('appended lines arrive as transcriptAppend', async () => {
    const t = setup({ a: user('one') });
    await t.svc.open(t.client, 'a', t.send);
    appendFileSync(t.file('a'), user('new'));
    await vi.waitFor(() => expect(ofType(t.sent, 'transcriptAppend')).toHaveLength(1));
    expect(ofType(t.sent, 'transcriptAppend')[0].entries[0].text).toBe('new');
  });

  it('a line split across polls (multibyte) arrives once, whole', async () => {
    const t = setup({ a: user('one') });
    await t.svc.open(t.client, 'a', t.send);
    const bytes = Buffer.from(user('한글 문장입니다'));
    const cut = bytes.indexOf(Buffer.from('글')) + 1; // inside a multibyte char
    appendFileSync(t.file('a'), bytes.subarray(0, cut));
    await sleep(POLL * 4);
    appendFileSync(t.file('a'), bytes.subarray(cut));
    await vi.waitFor(() => expect(ofType(t.sent, 'transcriptAppend')).toHaveLength(1));
    await sleep(POLL * 3);
    const appends = ofType(t.sent, 'transcriptAppend');
    expect(appends).toHaveLength(1);
    expect(appends[0].entries).toHaveLength(1);
    expect(appends[0].entries[0].text).toBe('한글 문장입니다');
  });

  it('truncated file → transcriptLoaded again', async () => {
    const t = setup({ a: user('one') + user('two') + user('three') });
    await t.svc.open(t.client, 'a', t.send);
    writeFileSync(t.file('a'), user('z'));
    await vi.waitFor(() => expect(ofType(t.sent, 'transcriptLoaded')).toHaveLength(2));
    expect(ofType(t.sent, 'transcriptLoaded')[1].entries.map((e) => e.text)).toEqual(['z']);
    appendFileSync(t.file('a'), user('after'));
    await vi.waitFor(() => expect(ofType(t.sent, 'transcriptAppend')).toHaveLength(1));
    expect(ofType(t.sent, 'transcriptAppend')[0].entries[0].text).toBe('after');
  });

  it('deleted file → ended once, polling stops', async () => {
    const t = setup({ a: user('one') });
    await t.svc.open(t.client, 'a', t.send);
    unlinkSync(t.file('a'));
    await vi.waitFor(() => expect(ofType(t.sent, 'transcriptError')).toHaveLength(1));
    expect(ofType(t.sent, 'transcriptError')[0]).toMatchObject({ id: 'a', reason: 'ended' });
    writeFileSync(t.file('a'), user('one') + user('two'));
    await sleep(POLL * 4);
    expect(t.sent).toHaveLength(2);
  });

  it('close(client) stops polling; a second open replaces the first', async () => {
    const t = setup({ a: user('one'), b: user('bee') });
    await t.svc.open(t.client, 'a', t.send);
    t.svc.close(t.client);
    appendFileSync(t.file('a'), user('x'));
    await sleep(POLL * 4);
    expect(t.sent).toHaveLength(1);

    await t.svc.open(t.client, 'a', t.send);
    await t.svc.open(t.client, 'b', t.send);
    appendFileSync(t.file('a'), user('y'));
    appendFileSync(t.file('b'), user('bee2'));
    await vi.waitFor(() => expect(ofType(t.sent, 'transcriptAppend')).toHaveLength(1));
    await sleep(POLL * 3);
    const appends = ofType(t.sent, 'transcriptAppend');
    expect(appends).toHaveLength(1);
    expect(appends[0]).toMatchObject({ id: 'b' });
  });

  it('two clients follow independently', async () => {
    const t = setup({ a: user('one') });
    const other: Array<Record<string, unknown>> = [];
    await t.svc.open(t.client, 'a', t.send);
    await t.svc.open({}, 'a', (m) => other.push(m));
    t.svc.close(t.client);
    appendFileSync(t.file('a'), user('x'));
    await vi.waitFor(() => expect(ofType(other, 'transcriptAppend')).toHaveLength(1));
    expect(ofType(t.sent, 'transcriptAppend')).toHaveLength(0);
  });

  it('before returns the earlier page', async () => {
    const n = Math.ceil((TRANSCRIPT_PAGE_BYTES * 1.5) / 300);
    let body = '';
    for (let i = 0; i < n; i++) body += user('x'.repeat(280) + i);
    const t = setup({ a: body });
    await t.svc.open(t.client, 'a', t.send);
    const loaded = t.sent[0] as { start: number; more: boolean };
    expect(loaded.more).toBe(true);
    await t.svc.before(t.client, 'a', loaded.start, t.send);
    const earlier = ofType(t.sent, 'transcriptEarlier');
    expect(earlier).toHaveLength(1);
    expect(earlier[0].entries.length).toBeGreaterThan(0);
    expect(earlier[0].start).toBeLessThan(loaded.start);
  });

  it('before: other id or a non-integer is ignored; past the end is clamped', async () => {
    const t = setup({ a: user('one') + user('two') });
    await t.svc.open(t.client, 'a', t.send);
    await t.svc.before(t.client, 'b', 10, t.send);
    await t.svc.before(t.client, 'a', 1.5, t.send);
    await t.svc.before(t.client, 'a', -1, t.send);
    await t.svc.before(t.client, 'a', Number.NaN, t.send);
    await t.svc.before({}, 'a', 10, t.send);
    expect(t.sent).toHaveLength(1);
    await t.svc.before(t.client, 'a', 1e15, t.send);
    expect(ofType(t.sent, 'transcriptEarlier')[0].entries).toHaveLength(2);
  });
});

describe('shell output', () => {
  it('shellOutput accepts only an absolute tasks/<id>.output path', () => {
    const ok = join(tmpdir(), 'claude-1', 'tasks', 'abc.output');
    expect(shellOutput(ok, 'abc')).toBe(ok);
    expect(shellOutput(ok, 'other')).toBeUndefined();
    expect(shellOutput('tasks/abc.output', 'abc')).toBeUndefined();
    expect(shellOutput(join(tmpdir(), 'x', 'abc.output'), 'abc')).toBeUndefined();
    expect(shellOutput(undefined, 'abc')).toBeUndefined();
  });

  it('rawParse keeps blank lines and splits at the entry cap', () => {
    expect(rawParse()(['x', '', 'y'])).toEqual([{ kind: 'result', text: 'x\n\ny' }]);
    const big = 'z'.repeat(TRANSCRIPT_ENTRY_MAX_CHARS - 10);
    expect(rawParse()([big, big]).map((e) => e.text.length)).toEqual([big.length, big.length]);
  });

  it('codexShellParse keeps only the calls and outputs of that process', () => {
    const call = (id: string, input: string) =>
      j({
        type: 'response_item',
        payload: { type: 'custom_tool_call', call_id: id, name: 'exec', input },
      });
    const out = (id: string, output: string) =>
      j({
        type: 'response_item',
        payload: { type: 'custom_tool_call_output', call_id: id, output },
      });
    const parse = codexShellParse('42');
    const first = parse([
      call('c1', 'exec_command({cmd:"npm run dev"})'),
      out('c1', 'Process running with session ID 42'),
      call('c2', 'exec_command({cmd:"ls"})'),
      out('c2', 'a.ts'),
    ]);
    expect(first.map((e) => `${e.kind}:${e.callId}`)).toEqual(['tool:c1', 'result:c1']);
    // Later polls: a write_stdin naming the process, its output (no id in it), another process.
    const next = parse([
      call('c3', 'write_stdin({session_id:42,chars:""})'),
      out('c3', 'ready on :3000'),
      call('c4', 'write_stdin({session_id:420,chars:""})'),
      out('c4', 'other'),
    ]);
    expect(next.map((e) => e.text)).toEqual([
      'write_stdin({session_id:42,chars:""})',
      'ready on :3000',
    ]);
  });
});
