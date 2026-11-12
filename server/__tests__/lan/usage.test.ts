import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { USAGE_FILE } from '../../src/constants.js';
import { TranscriptService } from '../../src/lan/transcript.js';
import { UsageIndex, usageTranscriptSource } from '../../src/lan/usage.js';
import { dayRange } from '../../src/lan/usageDays.js';

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

  it("report('all') survives history dated only in the future (clock moved back)", async () => {
    fs.rmSync(path.join(proj, uuid, 'subagents'), { recursive: true });
    let now = NOW + 3 * DAY;
    fs.writeFileSync(main(), line('m9', 100, now));
    const u = new UsageIndex({
      dir,
      roots: () => ({ claude: [path.dirname(proj)], codex: [] }),
      now: () => now,
    });
    await u.scanAll();
    now = NOW;
    expect(() => u.report('all')).not.toThrow();
    expect(u.report('all').days).toHaveLength(1);
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

  it('overlapping scanAll and refresh count once', async () => {
    const u = mk();
    await Promise.all([u.scanAll(), u.refresh([main()])]);
    expect(u.report('all').totals.billable).toBe(170);
    const v = mk();
    await Promise.all([v.scanAll(), v.scanAll(), v.refresh([main()]), v.refresh([main()])]);
    expect(v.report('all').totals.billable).toBe(170);
    expect(v.scanning).toBe(false);
  });

  it('dayRange is calendar dates across a DST fall-back', () => {
    const old = process.env.TZ;
    process.env.TZ = 'America/New_York';
    try {
      const r = dayRange('2026-10-20', '2026-11-12');
      expect(r.length).toBe(24);
      expect(r[23]).toBe('2026-11-12');
    } finally {
      if (old === undefined) delete process.env.TZ;
      else process.env.TZ = old;
    }
  });

  it('keeps a newer or corrupt usage.json as a .bak and starts fresh', async () => {
    fs.mkdirSync(dir, { recursive: true });
    const orig = JSON.stringify({ version: 99, sessions: { x: 1 } });
    fs.writeFileSync(path.join(dir, USAGE_FILE), orig);
    const u = mk();
    u.load();
    const baks = () => fs.readdirSync(dir).filter((f) => f.startsWith(`${USAGE_FILE}.bak-`));
    expect(baks().length).toBe(1);
    expect(baks()[0]).toMatch(/\.bak-99-\d+$/);
    expect(fs.readFileSync(path.join(dir, baks()[0]), 'utf-8')).toBe(orig);
    await u.scanAll();
    u.flush();
    expect(JSON.parse(fs.readFileSync(path.join(dir, USAGE_FILE), 'utf-8')).version).toBe(1);
    fs.writeFileSync(path.join(dir, USAGE_FILE), '{nope');
    mk().load();
    expect(baks().some((f) => f.includes('.bak-corrupt-'))).toBe(true);
  });

  it('onChanged fires after busy clears, also when nothing was folded', async () => {
    const u = mk();
    const seen: boolean[] = [];
    u.onChanged = () => seen.push(u.report('all').scanning);
    await u.scanAll();
    await u.scanAll(); // folds nothing
    expect(seen).toEqual([false, false]);
  });

  it('drops dedupe state of an idle file at flush, totals kept, new lines still fold', async () => {
    let now = NOW;
    const u = new UsageIndex({
      dir,
      roots: () => ({ claude: [path.dirname(proj)], codex: [] }),
      now: () => now,
    });
    await u.scanAll();
    now = NOW + 10 * 60_000;
    u.flush();
    const stored = JSON.parse(fs.readFileSync(path.join(dir, USAGE_FILE), 'utf-8'));
    const f = stored.files[main()].fold;
    expect(f.byMsg).toEqual({});
    expect(f.recent).toEqual([]);
    expect(f.total.output).toBe(100);
    fs.appendFileSync(main(), line('m2', 7, now));
    await u.refresh([main()]);
    expect(u.report('all').totals.billable).toBe(187);
  });

  it('a non-ENOENT read error keeps the file: load does not throw, flush never writes', async () => {
    fs.mkdirSync(path.join(dir, USAGE_FILE), { recursive: true }); // EISDIR on read
    const u = mk();
    expect(() => u.load()).not.toThrow();
    await u.scanAll();
    expect(u.report('all').totals.billable).toBe(170);
    u.flush();
    expect(fs.statSync(path.join(dir, USAGE_FILE)).isDirectory()).toBe(true);
  });

  it('folders named like prototype keys count and survive save and load', async () => {
    for (const [i, name] of ['__proto__', 'constructor'].entries()) {
      const f = path.join(proj, `cccccccc-0000-0000-0000-00000000000${i}.jsonl`);
      fs.writeFileSync(f, line(`p${i}`, 1000 * (i + 1), NOW).replace('/w/proj', `/w/${name}`));
    }
    const u = mk();
    await u.scanAll();
    const check = (x: UsageIndex) => {
      const p = Object.fromEntries(x.report('all').projects.map((q) => [q.name, q.billable]));
      expect(p['__proto__']).toBe(1010);
      expect(p['constructor']).toBe(2010);
    };
    check(u);
    u.flush();
    const v = mk();
    v.load();
    check(v);
    fs.appendFileSync(
      path.join(proj, 'cccccccc-0000-0000-0000-000000000000.jsonl'),
      line('p9', 5, NOW).replace('/w/proj', '/w/__proto__'),
    );
    await v.refresh([path.join(proj, 'cccccccc-0000-0000-0000-000000000000.jsonl')]);
    expect(v.report('all').projects.find((q) => q.name === '__proto__')?.billable).toBe(1025);
  });

  it('a duplicate-root file is tombstoned: not re-read, never counted', async () => {
    const root2 = path.join(tmp, 'projects2');
    fs.cpSync(path.join(tmp, 'projects'), root2, { recursive: true });
    const u = mk(() => ({ claude: [path.join(tmp, 'projects'), root2], codex: [] }));
    await u.scanAll();
    const dup = path.join(root2, 'p', `${uuid}.jsonl`);
    expect(u.fileUsage(dup)).toBeUndefined();
    const open = vi.spyOn(fs.promises, 'open');
    try {
      await u.scanAll();
      expect(open).not.toHaveBeenCalled();
    } finally {
      open.mockRestore();
    }
    expect(u.report('all').totals.billable).toBe(170);
  });

  it('a malformed files entry loads as a tombstone: other entries refresh, no double count', async () => {
    const u = mk();
    await u.scanAll();
    u.flush();
    const fp = path.join(dir, USAGE_FILE);
    const j = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    delete j.files[main()].fold;
    fs.writeFileSync(fp, JSON.stringify(j));
    const v = mk();
    v.load();
    fs.appendFileSync(path.join(proj, uuid, 'subagents', 'agent-a.jsonl'), line('s2', 3, NOW));
    await v.scanAll();
    expect(v.report('all').totals.billable).toBe(183);
    expect(v.fileUsage(main())).toBeUndefined();
  });

  it('chunked read equals a single read (split line, split UTF-8 char)', async () => {
    const big = path.join(proj, 'bbbbbbbb-0000-0000-0000-000000000002.jsonl');
    let text = '';
    for (let i = 0; i < 40; i++)
      text += line(`c${i}`, i + 1, NOW).replace('claude-x', 'claude-é한');
    fs.writeFileSync(big, text);
    const total = (n?: number) => {
      const u = new UsageIndex({
        dir,
        roots: () => ({ claude: [path.dirname(proj)], codex: [] }),
        now: () => NOW,
        chunkBytes: n,
      });
      return u.scanAll().then(() => u.report('all'));
    };
    const whole = await total();
    for (const n of [7, 64, 101]) expect(await total(n)).toEqual(whole);
    // the multi-byte model name straddles a boundary for at least one of the sizes
    expect(Buffer.byteLength(text)).toBeGreaterThan(text.length);
    expect(whole.models.some((m) => m.model === 'claude-é한')).toBe(true);
  });
});

describe('usageTranscriptSource', () => {
  const run = async (
    id: string,
    scanner: { transcriptOf: (id: string) => undefined },
    u: UsageIndex,
  ) => {
    const svc = new TranscriptService(usageTranscriptSource(scanner, u));
    const got: Record<string, unknown>[] = [];
    await svc.open({}, id, (m) => got.push(m));
    svc.stop();
    return got.map((m) => m.type);
  };
  const none = { transcriptOf: () => undefined };

  it('known key loads; unknown key, path-like key and a deleted file are errors', async () => {
    const u = mk();
    await u.scanAll();
    expect(await run(`usage:${uuid}`, none, u)).toContain('transcriptLoaded');
    expect(await run('usage:nope', none, u)).toEqual(['transcriptError']);
    expect(await run('usage:../../etc/passwd', none, u)).toEqual(['transcriptError']);
    fs.rmSync(main());
    expect(await run(`usage:${uuid}`, none, u)).toEqual(['transcriptError']);
  });

  it('a non-usage id goes to the scanner', async () => {
    const seen: string[] = [];
    const scanner = {
      transcriptOf: (id: string) => {
        seen.push(id);
        return undefined;
      },
    };
    const u = mk();
    await run('live-1', scanner, u);
    expect(seen).toEqual(['live-1']);
  });
});
