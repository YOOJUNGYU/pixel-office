import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { USAGE_FILE } from '../../src/constants.js';
import { UsageIndex } from '../../src/lan/usage.js';

const NOW = new Date(2026, 10, 12, 12, 0, 0).getTime();
const DAY = 86_400_000;
const line = (id: string, out: number, ts: number) =>
  JSON.stringify({
    type: 'assistant',
    timestamp: new Date(ts).toISOString(),
    cwd: '/w/proj',
    message: { id, model: 'claude-x', usage: { input_tokens: 10, output_tokens: out } },
  }) + '\n';

let tmp: string;
let proj: string;
let dir: string;
const uuid = 'aaaaaaaa-0000-0000-0000-000000000001';
const main = () => path.join(proj, `${uuid}.jsonl`);
const mk = (roots?: () => { claude: string[]; codex: string[] }) =>
  new UsageIndex({
    dir,
    roots: roots ?? (() => ({ claude: [path.dirname(proj)], codex: [] })),
    now: () => NOW,
  });

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-'));
  proj = path.join(tmp, 'projects', 'p');
  dir = path.join(tmp, 'data');
  fs.mkdirSync(path.join(proj, uuid, 'subagents'), { recursive: true });
  fs.writeFileSync(main(), line('m1', 100, NOW));
  fs.writeFileSync(path.join(proj, uuid, 'subagents', 'agent-a.jsonl'), line('s1', 50, NOW));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('UsageIndex', () => {
  it('sums main + subagent into one session', async () => {
    const u = mk();
    await u.scanAll();
    const r = u.report('all');
    expect(r.totals.billable).toBe(170);
    expect(r.totals.sessions).toBe(1);
    expect(r.top[0].key).toBe(uuid);
    expect(u.sumOf(uuid)).toBe(170);
    expect(u.today()).toBe(170);
    expect(u.fileUsage(main())?.tokens).toBe(110);
  });

  it('keeps a half line until it is complete', async () => {
    const u = mk();
    await u.scanAll();
    const l = line('m2', 7, NOW);
    fs.appendFileSync(main(), l.slice(0, 20));
    await u.refresh([main()]);
    expect(u.report('all').totals.billable).toBe(170);
    fs.appendFileSync(main(), l.slice(20));
    await u.refresh([main()]);
    expect(u.report('all').totals.billable).toBe(187);
  });

  it('zero-fills days; 7d is exactly seven local dates', async () => {
    fs.appendFileSync(main(), line('m0', 5, NOW - 3 * DAY));
    const u = mk();
    await u.scanAll();
    const all = u.report('all').days;
    expect(all.length).toBe(4);
    expect(all[1].output).toBe(0);
    const d7 = u.report('7d').days;
    expect(d7.length).toBe(7);
    expect(d7[6].day).toBe('2026-11-12');
    expect(d7[0].day).toBe('2026-11-06');
  });

  it('counts a file seen through two roots once', async () => {
    const root2 = path.join(tmp, 'projects2');
    fs.cpSync(path.join(tmp, 'projects'), root2, { recursive: true });
    const u = mk(() => ({ claude: [path.join(tmp, 'projects'), root2], codex: [] }));
    await u.scanAll();
    expect(u.report('all').totals.billable).toBe(170);
  });

  it('survives a restart and reads nothing more', async () => {
    const u = mk();
    await u.scanAll();
    u.flush();
    const v = mk();
    v.load();
    expect(v.report('all')).toEqual(u.report('all'));
    await v.scanAll();
    expect(v.report('all').totals.billable).toBe(170);
  });

  it('keeps history after the file is deleted', async () => {
    const u = mk();
    await u.scanAll();
    fs.rmSync(main());
    await u.scanAll();
    expect(u.report('all').totals.billable).toBe(170);
    expect(u.fileOf(uuid)).toBeUndefined();
    expect(u.report('all').top[0].exists).toBe(false);
  });

  it('migrates a version-0 file', async () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, USAGE_FILE), JSON.stringify({ version: 0, files: {} }));
    const u = mk();
    u.load();
    await u.scanAll();
    expect(u.report('all').totals.billable).toBe(170);
  });

  it('reads Codex session key and parent from the first line', async () => {
    const day = path.join(tmp, 'codex', '2026', '11', '12');
    fs.mkdirSync(day, { recursive: true });
    const meta = (id: string, parent?: string) =>
      JSON.stringify({
        type: 'session_meta',
        payload: {
          id,
          cwd: '/w/cx',
          ...(parent
            ? { source: { subagent: { thread_spawn: { parent_thread_id: parent } } } }
            : {}),
        },
      }) + '\n';
    const tok =
      JSON.stringify({
        type: 'event_msg',
        timestamp: new Date(NOW).toISOString(),
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: { input_tokens: 30, cached_input_tokens: 10, output_tokens: 5 },
          },
        },
      }) + '\n';
    fs.writeFileSync(path.join(day, 'rollout-a.jsonl'), meta('P1') + tok);
    fs.writeFileSync(path.join(day, 'rollout-b.jsonl'), meta('C1', 'P1') + tok);
    const u = new UsageIndex({
      dir,
      roots: () => ({ claude: [], codex: [path.join(tmp, 'codex')] }),
      now: () => NOW,
    });
    await u.scanAll();
    const r = u.report('all');
    expect(r.totals.sessions).toBe(1);
    expect(r.top[0].key).toBe('P1');
    expect(r.totals.billable).toBe(50);
  });

  it('scanning is true while scanAll runs', async () => {
    let during = false;
    const u: UsageIndex = mk(() => {
      during = u.scanning;
      return { claude: [path.dirname(proj)], codex: [] };
    });
    await u.scanAll();
    expect(during).toBe(true);
    expect(u.scanning).toBe(false);
  });
});
