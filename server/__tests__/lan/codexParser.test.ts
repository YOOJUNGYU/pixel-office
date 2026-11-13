import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { Act } from '../../../core/src/lan.js';
import { CODEX_SHELL_IDLE_MS } from '../../src/constants.js';
import { applyCodexLine, codexSessionMeta, parseCodexIndex } from '../../src/lan/codexParser.js';
import {
  classifyShell,
  newSession,
  noteAct,
  shellEdit,
  tick,
  toViews,
} from '../../src/lan/session.js';

const fixture = (name: string) =>
  readFileSync(join(__dirname, 'fixtures', name), 'utf8')
    .split('\n')
    .filter(Boolean);
const mk = () => newSession('codex', 'c1', 'main', 0);
const item = (payload: unknown) => JSON.stringify({ type: 'response_item', payload });
const event = (payload: unknown) => JSON.stringify({ type: 'event_msg', payload });
const exec = (input: string, call_id = 'call_x') =>
  item({ type: 'custom_tool_call', name: 'exec', call_id, input });
const output = (text: string, call_id = 'call_x') =>
  item({ type: 'custom_tool_call_output', call_id, output: [{ type: 'input_text', text }] });

describe('applyCodexLine', () => {
  it('exec_command rg -> library, reason from AgentMessage', () => {
    const s = mk();
    for (const l of fixture('codex-exec.jsonl')) applyCodexLine(s, l, 1_000);
    tick(s, 4_000);
    expect(s.room).toBe('library');
    expect(s).toMatchObject({ act: 'read', target: "rg -n 'refresh' src" });
    expect(s.reason).toBe('검색 배치를 확인해 수정하겠습니다');
    expect(s.pendingTool).toBeNull();
    expect(s.lastLineAt).toBe(1_000);
  });

  it('apply_patch -> coding, basename', () => {
    const s = mk();
    applyCodexLine(
      s,
      exec(
        'const p = "*** Begin Patch\\n*** Update File: /x/y/login.ts\\n@@\\n-a\\n+b\\n*** End Patch";\ntext(await tools.apply_patch(p));',
      ),
      0,
    );
    expect(s.candidate).toBe('coding');
    expect(s).toMatchObject({ act: 'edit', target: 'login.ts' });
  });

  it('exec_command pnpm build -> server', () => {
    const s = mk();
    applyCodexLine(s, exec('text(await tools.exec_command({cmd:"pnpm build"}));'), 0);
    expect(s.candidate).toBe('server');
    expect(s).toMatchObject({ act: 'run', target: 'pnpm build' });
  });

  it('other tools', () => {
    const cases: [string, string | null, Act, string][] = [
      ['text(await tools.web__run({q:"x"}))', 'library', 'web', ''],
      ['text(await tools.view_image({path:"/a.png"}))', 'library', 'image', ''],
      [
        'text(await tools.exec_command({cmd:"cat \\"a b\\".ts | head"}))',
        'library',
        'read',
        'cat "a b".ts | head',
      ],
      ['text(await tools.write_stdin({session_id:1,chars:""}))', null, 'idle', 'keep'],
      ['text(await tools.update_plan({plan:[]}))', 'coding', 'tool', 'update_plan'],
      ['text(await tools.github__get_issue({n:1}))', 'library', 'tool', 'github__get_issue'],
    ];
    for (const [input, room, act, target] of cases) {
      const s = mk();
      s.candidate = 'server';
      s.target = 'keep';
      applyCodexLine(s, exec(input), 0);
      expect(s).toMatchObject({ act, target });
      expect(s.candidate).toBe(room ?? 'server');
      expect(s.pendingTool).toMatchObject({ exempt: true });
    }
  });

  it('running exec becomes a shell view; removed when it exits', () => {
    const s = mk();
    const lines = fixture('codex-shell.jsonl');
    lines.slice(0, 2).forEach((l) => applyCodexLine(s, l, 0));
    expect(s.pendingTool).toBeNull();
    expect(toViews(s)).toContainEqual(
      expect.objectContaining({ id: 'c1/sh/7933', act: 'run', target: 'pnpm build' }),
    );
    lines.slice(2).forEach((l) => applyCodexLine(s, l, 1));
    expect(s.shells.size).toBe(0);
  });

  it('exit output carrying session_id removes the shell', () => {
    const s = mk();
    applyCodexLine(s, exec('tools.exec_command({cmd:"pnpm dev"})'), 0);
    applyCodexLine(s, output('{"session_id":7933,"output":""}'), 0);
    expect(s.shells.get('7933')).toMatchObject({ target: 'pnpm dev', brief: 'pnpm' });
    applyCodexLine(s, output('{"session_id":7933,"exit_code":0}'), 0);
    expect(s.shells.size).toBe(0);
  });

  it('write_stdin error output never creates a phantom shell', () => {
    const s = mk();
    applyCodexLine(s, exec('text(await tools.write_stdin({session_id:42,chars:""}))'), 0);
    applyCodexLine(s, output('write_stdin failed: Unknown process id 42'), 0);
    expect(s.shells.size).toBe(0);
  });

  it('write_stdin exit output removes the shell by its session id', () => {
    const s = mk();
    applyCodexLine(s, exec('tools.exec_command({cmd:"pnpm dev"})'), 0);
    applyCodexLine(s, output('{"session_id":42,"output":""}'), 0);
    applyCodexLine(s, exec('tools.write_stdin({session_id:42,chars:""})', 'call_y'), 0);
    applyCodexLine(s, output('Process exited with code 0\n"exit_code": 0', 'call_y'), 0);
    expect(s.shells.size).toBe(0);
  });

  it('an unpolled shell leaves after CODEX_SHELL_IDLE_MS; a poll keeps it', () => {
    const s = mk();
    applyCodexLine(s, exec('tools.exec_command({cmd:"git log"})'), 0);
    applyCodexLine(s, output('{"session_id":1,"output":""}'), 0);
    applyCodexLine(s, exec('tools.exec_command({cmd:"pnpm dev"})', 'call_y'), 0);
    applyCodexLine(s, output('{"session_id":2,"output":""}', 'call_y'), 0);
    const T = CODEX_SHELL_IDLE_MS;
    // a later poll of 2 only
    applyCodexLine(s, exec('tools.write_stdin({session_id:2,chars:""})', 'call_z'), T - 1);
    applyCodexLine(s, output('{"session_id":2,"output":"ready"}', 'call_z'), T - 1);
    const shells = (now: number) =>
      toViews(s, false, now)
        .filter((v) => v.kind === 'shell')
        .map((v) => v.id);
    expect(shells(T - 1)).toEqual(['c1/sh/1', 'c1/sh/2']);
    expect(shells(T)).toEqual(['c1/sh/2']); // 1 expired in the view, no new line needed
    expect(shells(2 * T)).toEqual([]);
    applyCodexLine(s, output('{"session_id":3,"output":""}'), 2 * T); // any later output prunes
    expect([...s.shells.keys()]).toEqual(['3']);
  });

  it('write_stdin on a gone process removes the shell', () => {
    const s = mk();
    applyCodexLine(s, output('{"session_id":42,"output":""}'), 0);
    applyCodexLine(s, exec('tools.write_stdin({session_id:42,chars:""})', 'call_y'), 0);
    applyCodexLine(s, output('write_stdin failed: Unknown process id 42', 'call_y'), 0);
    expect(s.shells.size).toBe(0);
  });

  it('request_user_input -> lounge, immediate permission', () => {
    const s = mk();
    applyCodexLine(
      s,
      item({
        type: 'function_call',
        name: 'request_user_input_async',
        arguments: '{}',
        call_id: 'f1',
      }),
      0,
    );
    expect(s.permission).toBe(true);
    expect(s.candidate).toBe('lounge');
    expect(s).toMatchObject({ act: 'ask', target: '' });
  });

  it('assistant message sets reason; task_started resets it', () => {
    const s = mk();
    applyCodexLine(
      s,
      item({
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: '끝났습니다' }],
      }),
      0,
    );
    expect(s.reason).toBe('끝났습니다');
    applyCodexLine(s, event({ type: 'task_started' }), 1);
    expect(s.reason).toBe('');
  });

  it('task_started -> 자료실, thinking until the first tool', () => {
    const s = mk();
    applyCodexLine(s, event({ type: 'task_started' }), 0);
    expect(s).toMatchObject({ candidate: 'library', act: 'tool', target: '' });
  });

  it('task_complete -> lounge after 3s', () => {
    const s = mk();
    s.room = s.candidate = 'coding';
    applyCodexLine(s, event({ type: 'task_complete' }), 0);
    tick(s, 3_000);
    expect(s.room).toBe('lounge');
    expect(s).toMatchObject({ act: 'idle', target: '' });
  });

  it('legacy formats', () => {
    const cases: [unknown, string, Act, string][] = [
      [
        {
          type: 'function_call',
          name: 'shell',
          arguments: '{"command":["bash","-lc","cat a.ts"]}',
        },
        'library',
        'read',
        'cat a.ts',
      ],
      [
        { type: 'function_call', name: 'exec_command', arguments: '{"cmd":"make"}' },
        'server',
        'run',
        'make',
      ],
      [
        {
          type: 'custom_tool_call',
          name: 'apply_patch',
          input: '*** Begin Patch\n*** Add File: src/b.ts\n+x\n',
        },
        'coding',
        'edit',
        'b.ts',
      ],
      [{ type: 'web_search_call', action: { query: 'x' } }, 'library', 'web', ''],
    ];
    for (const [payload, room, act, target] of cases) {
      const s = mk();
      applyCodexLine(s, item(payload), 0);
      expect(s.candidate).toBe(room);
      expect(s).toMatchObject({ act, target });
    }
  });

  it('ignores garbage entirely', () => {
    const s = mk();
    expect(() => applyCodexLine(s, '{not json', 5)).not.toThrow();
    expect(() => applyCodexLine(s, 'null', 5)).not.toThrow();
    expect(() => applyCodexLine(s, item(null), 5)).not.toThrow();
    expect(s.act).toBe('idle');
  });

  it.skipIf(!process.env.REAL_CODEX_JSONL)('real transcript smoke', () => {
    const s = mk();
    const lines = readFileSync(process.env.REAL_CODEX_JSONL!, 'utf8').split('\n');
    codexSessionMeta(lines[0]);
    lines.forEach((l, i) => {
      applyCodexLine(s, l, i);
      tick(s, i);
    });
    toViews(s);
  });
});

describe('classifyShell', () => {
  it('read-ish commands -> library, file edits -> coding, others -> server', () => {
    for (const c of [
      'rg x',
      'ls -la',
      'sed -n 1,5p a',
      'git log -3',
      'git diff',
      'nl a | head',
      'tree',
      'cd a && rg x',
      'cd /r && grep -n "a|b" x.ts | head -40',
      'ls; sed -n 1,9p a 2>/dev/null',
      'cat a 2>&1 | wc -l',
      'command grep -rn x src | head',
      'timeout 5 cat a',
    ])
      expect(classifyShell(c)).toBe('library');
    for (const c of [
      'pnpm build',
      'git commit -m x',
      '',
      'cd a',
      'rg x | node',
      'ls && npm test',
      'npm test > /tmp/out.txt 2>&1',
      'node x.js > run.log',
      'echo "a > b"',
    ])
      expect(classifyShell(c)).toBe('server');
    for (const c of ['sed -i s/a/b/ f', 'cat a > b', 'cd a && echo x >> notes.md'])
      expect(classifyShell(c)).toBe('coding');
  });

  it('shellEdit names the edited file', () => {
    expect(shellEdit("sed -i 's/a/b/' src/app.ts")).toBe('app.ts');
    expect(shellEdit("cat > src/x.ts <<'EOF'\nif (a > b) {}\nEOF")).toBe('x.ts');
    expect(shellEdit('echo hi | tee -a docs/a.md')).toBe('a.md');
    expect(
      shellEdit("python3 - <<'EOF'\np='core/lan.ts'\ns=open(p).read()\nopen(p,'w').write(s)\nEOF"),
    ).toBe('');
    expect(shellEdit("python3 - <<'EOF'\nopen('a/b.py', 'w').write('x')\nEOF")).toBe('b.py');
    expect(shellEdit('git apply fix.patch')).toBe('');
    // no edits: reads, code inside a heredoc, scratch files
    expect(shellEdit("node - <<'EOF'\nif (a > b) console.log(1)\nEOF")).toBeNull();
    expect(shellEdit('rg x > /dev/null')).toBeNull();
    expect(shellEdit('npm test 2>&1 | tee /tmp/t.log')).toBeNull();
    expect(shellEdit('ls -la')).toBeNull();
  });
});

describe('codexSessionMeta', () => {
  it('reads id and subagent parent', () => {
    expect(
      codexSessionMeta(
        '{"type":"session_meta","payload":{"id":"c1","source":{"subagent":{"thread_spawn":{"parent_thread_id":"p1","depth":1}}}}}',
      ),
    ).toEqual({ id: 'c1', parentId: 'p1' });
    expect(
      codexSessionMeta('{"type":"session_meta","payload":{"id":"c1","source":"cli"}}'),
    ).toEqual({
      id: 'c1',
    });
    expect(codexSessionMeta('{"type":"event_msg","payload":{}}')).toBeNull();
    expect(codexSessionMeta('nope')).toBeNull();
  });
});

describe('local title (notifications only)', () => {
  it('session_index: the last line per id wins; torn lines skipped', () => {
    const idx = [
      '{"id":"a","thread_name":"first","updated_at":"1"}',
      '{"id":"b","thread_name":"bee","updated_at":"2"}',
      '{"id":"a","thread_name":"renamed","updated_at":"3"}',
      '{"id":"c","thread_na',
    ].join('\n');
    expect([...parseCodexIndex(idx)]).toEqual([
      ['a', 'renamed'],
      ['b', 'bee'],
    ]);
  });

  it('first real user message is the fallback; cwd from turn_context / session_meta', () => {
    const s = mk();
    const user = (text: string) =>
      item({ type: 'message', role: 'user', content: [{ type: 'input_text', text }] });
    applyCodexLine(s, user('# AGENTS.md instructions for /x'), 0);
    applyCodexLine(s, user('<environment_context>…</environment_context>'), 0);
    applyCodexLine(s, user('내원현황 정렬 개선'), 0);
    applyCodexLine(s, user('later'), 0);
    applyCodexLine(s, JSON.stringify({ type: 'turn_context', payload: { cwd: 'C:\\w\\fe' } }), 0);
    expect(s.local).toMatchObject({ prompt: '내원현황 정렬 개선', cwd: 'C:\\w\\fe' });
    expect(codexSessionMeta('{"type":"session_meta","payload":{"id":"c1","cwd":"/w/fe"}}')).toEqual(
      {
        id: 'c1',
        cwd: '/w/fe',
      },
    );
  });
});

describe('status signals (todo, fail, age)', () => {
  it('update_plan counts completed items (custom exec and JSON arguments)', () => {
    const s = mk();
    applyCodexLine(
      s,
      exec(
        'text(await tools.update_plan({plan:[{step:"a",status:"completed"},{step:"b",status:"in_progress"}]}));',
      ),
      0,
    );
    expect(toViews(s)[0].todo).toEqual({ done: 1, total: 2 });
    applyCodexLine(
      s,
      item({
        type: 'function_call',
        name: 'update_plan',
        call_id: 'c2',
        arguments: JSON.stringify({ plan: [{ step: 'a', status: 'completed' }] }),
      }),
      0,
    );
    expect(s.todo).toEqual({ done: 1, total: 1 });
    expect(JSON.stringify(toViews(s, true))).not.toMatch(/"step"|"a"/);
  });

  it('a non-zero exit_code fails, zero does not', () => {
    const s = mk();
    applyCodexLine(s, output('{"exit_code":0,"output":"ok"}'), 1_000);
    expect(s.failUntil).toBe(0);
    applyCodexLine(s, output('{"exit_code":1,"output":"boom"}'), 1_000);
    expect(toViews(s, false, 1_000)[0].fail).toBe(true);
  });

  it('the line timestamp dates the act', () => {
    const s = mk();
    const now = Date.parse('2026-11-04T10:10:00Z');
    applyCodexLine(
      s,
      JSON.stringify({
        ...JSON.parse(event({ type: 'task_started' })),
        timestamp: '2026-11-04T10:00:00Z',
      }),
      now,
    );
    noteAct(s);
    expect(toViews(s, false, now)[0].ageSec).toBe(600);
  });
});

describe('context use (local only)', () => {
  it('token_count: the last call against the model window', () => {
    const s = mk();
    applyCodexLine(
      s,
      event({
        type: 'token_count',
        info: {
          total_token_usage: { total_tokens: 5_000_000 },
          last_token_usage: { input_tokens: 175_025, total_tokens: 175_556 },
          model_context_window: 258_400,
        },
      }),
      0,
    );
    expect(s.local.context).toEqual({ used: 175_556, window: 258_400 });
    applyCodexLine(s, event({ type: 'token_count', info: null }), 0);
    expect(s.local.context).toEqual({ used: 175_556, window: 258_400 });
  });
});

describe('changed lines', () => {
  it('apply_patch (custom exec, escaped) counts its +/- lines', () => {
    const s = mk();
    applyCodexLine(
      s,
      exec(
        'const p = "*** Begin Patch\\n*** Update File: /x/a.ts\\n@@\\n-a\\n+b\\n+c\\n*** End Patch";\ntext(await tools.apply_patch(p));',
      ),
      0,
    );
    expect(toViews(s)[0].diff).toEqual({ add: 2, del: 1 });
  });
});
