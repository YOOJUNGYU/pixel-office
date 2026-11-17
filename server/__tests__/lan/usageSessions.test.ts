import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { USAGE_FILE } from '../../src/constants.js';
import { UsageIndex } from '../../src/lan/usage.js';

const NOW = new Date(2026, 10, 12, 12, 0, 0).getTime();
const MIN = 60_000;
const at = (ms: number) => new Date(ms).toISOString();
const prompt = (text: string, ts: number) =>
  JSON.stringify({ type: 'user', timestamp: at(ts), cwd: '/w/proj', message: { content: text } });
const call = (id: string, name: string, ts: number) =>
  JSON.stringify({
    type: 'assistant',
    timestamp: at(ts),
    cwd: '/w/proj',
    message: {
      id,
      model: 'claude-x',
      content: [{ type: 'tool_use', id: `t-${id}`, name, input: {} }],
      usage: { input_tokens: 1, output_tokens: 1 },
    },
  });
const reply = (id: string, text: string, ts: number) =>
  JSON.stringify({
    type: 'assistant',
    timestamp: at(ts),
    cwd: '/w/proj',
    message: {
      id,
      model: 'claude-x',
      content: [{ type: 'text', text }],
      usage: { input_tokens: 1 },
    },
  });

let tmp: string;
let proj: string;
let dir: string;
const file = (uuid: string) => path.join(proj, `${uuid}.jsonl`);
const write = (uuid: string, lines: string[]) =>
  fs.writeFileSync(file(uuid), lines.join('\n') + '\n');
const mk = () =>
  new UsageIndex({
    dir,
    roots: () => ({ claude: [path.dirname(proj)], codex: [] }),
    now: () => NOW,
  });
const A = 'aaaaaaaa-0000-0000-0000-000000000001';
const B = 'bbbbbbbb-0000-0000-0000-000000000002';

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-s-'));
  proj = path.join(tmp, 'projects', 'p');
  dir = path.join(tmp, 'data');
  fs.mkdirSync(proj, { recursive: true });
  write(A, [
    prompt('fix the login bug', NOW - 60 * MIN),
    JSON.stringify({ type: 'file-history-snapshot', snapshot: {} }), // undated
    call('a1', 'Read', NOW - 59 * MIN),
    call('a2', 'Edit', NOW - 58 * MIN),
    reply('a3', 'Patched the token expiry check in auth middleware.', NOW - 57 * MIN),
    // 20 min gap: not active time
    prompt('now the docs', NOW - 37 * MIN),
  ]);
  write(B, [prompt('add dark theme', NOW - 10 * MIN), call('b1', 'Write', NOW - 9 * MIN)]);
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('UsageIndex sessions', () => {
  it('counts activity: tools, edits, active minutes (gaps over 5 min skipped)', async () => {
    const u = mk();
    await u.scanAll();
    const a = u.find('').sessions.find((s) => s.key === A)!;
    expect(a).toMatchObject({ tools: 2, edits: 1, activeMin: 3 });
  });

  it('lists newest first and filters by title/folder', async () => {
    const u = mk();
    await u.scanAll();
    expect(u.find('').sessions.map((s) => s.key)).toEqual([B, A]);
    expect(u.find('LOGIN').sessions.map((s) => s.key)).toEqual([A]);
    expect(u.find('proj').sessions).toHaveLength(2);
    expect(u.find('nothing').sessions).toEqual([]);
  });

  it('searches transcript bodies with a snippet of the match', async () => {
    const u = mk();
    await u.scanAll();
    const r = await u.search('expiry', () => false);
    expect(r.sessions.map((s) => s.key)).toEqual([A]);
    expect(r.sessions[0].snippet).toContain('token expiry check');
    expect((await u.search('expiry', () => true)).sessions).toEqual([]);
  });

  it('backfills activity for files folded before it existed', async () => {
    const u = mk();
    await u.scanAll();
    u.flush();
    // an older index: no act on folds or sessions
    const j = JSON.parse(fs.readFileSync(path.join(dir, USAGE_FILE), 'utf8'));
    for (const e of Object.values<{ fold: { act?: unknown } }>(j.files)) delete e.fold.act;
    for (const s of Object.values<{ act?: unknown; lastTs: number }>(j.sessions)) {
      delete s.act;
      s.lastTs = NOW + 1; // polluted by an undated line (≤ 1.0.64)
    }
    fs.writeFileSync(path.join(dir, USAGE_FILE), JSON.stringify(j));
    const v = mk();
    v.load();
    await v.scanAll();
    expect(v.find('login').sessions[0]).toMatchObject({ tools: 2, edits: 1, activeMin: 3 });
    expect(v.find('login').sessions[0].lastTs).toBe(NOW - 37 * MIN);
  });
});

describe('UsageIndex sessions: edge cases', () => {
  it('a rewritten transcript does not count its activity twice', async () => {
    const u = mk();
    await u.scanAll();
    write(A, [prompt('fix the login bug', NOW - 10 * MIN), call('z1', 'Edit', NOW - 9 * MIN)]);
    await u.refresh([file(A)]);
    expect(u.find('login').sessions[0]).toMatchObject({ tools: 1, edits: 1, activeMin: 1 });
  });

  it('finds text with quotes (escaped in the raw JSON)', async () => {
    write(B, [reply('q1', 'set "strict": true in tsconfig', NOW - MIN)]);
    const u = mk();
    await u.scanAll();
    const r = await u.search('"strict"', () => false);
    expect(r.sessions.map((s) => s.key)).toEqual([B]);
  });
});
