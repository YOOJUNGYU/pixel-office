import { describe, expect, it } from 'vitest';

import {
  newSession,
  programName,
  setActivity,
  setIdle,
  shellZone,
  tick,
  toViews,
} from '../../src/lan/session.js';

const mk = () => newSession('claude', 's1', 'main', 0);

describe('session state', () => {
  it('debounces room change by 3s', () => {
    const s = mk();
    setActivity(s, 'coding', 'edit', 'x', 0);
    tick(s, 2_999);
    expect(s.room).toBe('lounge');
    tick(s, 3_000);
    expect(s.room).toBe('coding');
  });

  it('flapping rooms every 1s never moves within 3s', () => {
    const s = mk();
    setActivity(s, 'coding', 'edit', 'x', 0);
    setActivity(s, 'library', 'read', 'x', 1_000);
    setActivity(s, 'coding', 'edit', 'x', 2_000);
    tick(s, 4_999);
    expect(s.room).toBe('lounge');
    tick(s, 5_000);
    expect(s.room).toBe('coding');
  });

  it('silent non-exempt tool => permission in place (no room change)', () => {
    const s = mk();
    s.room = s.candidate = 'server';
    s.pendingTool = { name: 'Bash', since: 0, exempt: false };
    tick(s, 6_999);
    expect(s.permission).toBe(false);
    tick(s, 7_000);
    expect(s.permission).toBe(true);
    tick(s, 30_000);
    expect(s.room).toBe('server');
    setActivity(s, 'coding', 'edit', 'y', 30_500);
    expect(s.permission).toBe(false);
  });

  it('bypassPermissions never guesses a permission prompt', () => {
    const s = mk();
    s.bypass = true;
    s.pendingTool = { name: 'Bash', since: 0, exempt: false };
    tick(s, 60_000);
    expect(s.permission).toBe(false);
  });

  it('programName: first token after env assignments, basename', () => {
    expect(programName('OPENAI_API_KEY=sk-x /usr/bin/npm test')).toBe('npm');
    expect(programName('"C:\\tools\\git.exe" status')).toBe('git.exe');
    expect(programName('ssh dev@db01.acme.local')).toBe('ssh');
    expect(programName('')).toBe('');
  });

  it('exempt tool never sets permission', () => {
    const s = mk();
    s.pendingTool = { name: 'Task', since: 0, exempt: true };
    tick(s, 60_000);
    expect(s.permission).toBe(false);
  });

  it('text-only idles after 5s, lounge after 3 more', () => {
    const s = mk();
    s.room = s.candidate = 'coding';
    s.act = 'edit';
    s.target = 'a.ts';
    s.textOnlyAt = 0;
    tick(s, 5_000);
    expect(s).toMatchObject({ act: 'idle', target: '' });
    expect(s.turnEnded).toBe(true);
    expect(s.room).toBe('coding');
    tick(s, 8_000);
    expect(s.room).toBe('lounge');
  });

  it('setIdle clears pending state', () => {
    const s = mk();
    s.pendingTool = { name: 'Edit', since: 0, exempt: false };
    s.permission = true;
    setIdle(s, 1);
    expect(s.pendingTool).toBeNull();
    expect(s.permission).toBe(false);
  });

  it('toViews appends shell views in server room', () => {
    const s = mk();
    s.shells.set('b1', { target: 'npm run dev', brief: 'npm', since: 0, zone: 'run' });
    s.target = 'ssh dev@db01';
    s.brief = 'ssh';
    expect(toViews(s, true).map((x) => x.target)).toEqual(['ssh', 'npm']);
    const v = toViews(s);
    expect(v).toHaveLength(2);
    expect(v[1]).toMatchObject({
      kind: 'shell',
      room: 'server',
      parentId: 's1',
      id: 's1/sh/b1',
      act: 'run',
      target: 'npm run dev',
    });
  });
});

describe('changed lines', () => {
  it('lineDiff counts lines as multisets; patchDiff skips headers', async () => {
    const { lineDiff, patchDiff } = await import('../../src/lan/session.js');
    expect(lineDiff('a\nb\nc', 'a\nB\nc\nd')).toEqual({ add: 2, del: 1 });
    expect(lineDiff('', 'x\ny\n')).toEqual({ add: 2, del: 0 });
    expect(lineDiff('same', 'same')).toEqual({ add: 0, del: 0 });
    expect(
      patchDiff(
        '*** Begin Patch\n*** Update File: a.ts\n@@\n-old\n+new\n+more\n--- a\n+++ b\n*** End Patch',
      ),
    ).toEqual({ add: 2, del: 1 });
  });
});

describe('shellZone', () => {
  it.each([
    ['npx vitest run', 'test'],
    ['cd web && pnpm test:server 2>&1 | tail -20', 'test'],
    ['python3 -m pytest -q', 'test'],
    ['npm run build && npm test', 'test'],
    ['timeout 300 npm run check-types', 'build'],
    ['pnpm lint', 'build'],
    ['tsc --noEmit', 'build'],
    ['git add -A && git commit -m x', 'git'],
    ['pnpm lint && git commit -m x', 'git'],
    ['gh pr create --fill', 'git'],
    ['npm test && git push', 'git'],
    ['python3 scripts/gen.py', 'run'],
    ['node dist/cli.js --port 1', 'run'],
    ['pnpm install', 'run'],
    ['echo vitest', 'run'],
  ])('%s → %s', (cmd, zone) => {
    expect(shellZone(cmd)).toBe(zone);
  });

  it('toViews sends the zone only while in 서버실; shells carry their own', () => {
    const s = mk();
    s.zone = 'test';
    expect(toViews(s)[0].zone).toBeUndefined();
    s.room = 'server';
    s.shells.set('b1', { target: 'git push', brief: 'git', since: 0, zone: 'git' });
    const [main, shell] = toViews(s, true);
    expect(main.zone).toBe('test');
    expect(shell.zone).toBe('git');
  });
});
