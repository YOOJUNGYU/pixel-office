import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type ClientMessageContext,
  handleClientMessage,
  relayStateMessage,
} from '../src/clientMessageHandler.js';
import { readConfig } from '../src/configPersistence.js';
import { FileStateAdapter } from '../src/fileStateAdapter.js';

describe('clientMessageHandler relay', () => {
  let tempHome: string;
  let originalHome: string | undefined;
  let sent: Array<Record<string, unknown>>;
  const kick = vi.fn(async () => ({ ok: true }));

  function ctx(privileged = true): ClientMessageContext {
    return {
      adapter: new FileStateAdapter(),
      cache: null,
      privileged,
      relay: { status: () => ({ state: 'connected' }), kick },
    };
  }
  const send = (msg: Record<string, unknown>, c = ctx()): void =>
    handleClientMessage(msg, (m) => sent.push(m), c);
  const flush = () => new Promise((r) => setTimeout(r, 0));

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-cmh-relay-'));
    originalHome = process.env.HOME;
    process.env.HOME = tempHome;
    sent = [];
    kick.mockClear();
  });
  afterEach(() => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it('stores the admin token and answers settingsLoaded without it', () => {
    send({ type: 'setRelayAdminToken', token: 'abc' });
    expect(readConfig().standalone.relayAdminToken).toBe('abc');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: 'settingsLoaded', relayAdmin: true });
    expect(JSON.stringify(sent)).not.toContain('abc');
    send({ type: 'setRelayAdminToken', token: '' });
    expect(readConfig().standalone.relayAdminToken).toBe('');
    expect(sent[1]).toMatchObject({ type: 'settingsLoaded', relayAdmin: false });
  });

  it('refuses a non-string or too long token', () => {
    send({ type: 'setRelayAdminToken', token: 'x'.repeat(257) });
    send({ type: 'setRelayAdminToken', token: 5 });
    expect(readConfig().standalone.relayAdminToken).toBe('');
  });

  it('relayKick without a token answers noToken', async () => {
    send({ type: 'relayKick', peerId: 'peer-1' });
    await flush();
    expect(kick).not.toHaveBeenCalled();
    expect(sent).toEqual([{ type: 'relayKickResult', ok: false, reason: 'noToken' }]);
  });

  it('relayKick with a token calls relay.kick and relays the result', async () => {
    send({ type: 'setRelayAdminToken', token: 'abc' });
    sent = [];
    kick.mockResolvedValueOnce({ ok: false, reason: 'auth' } as never);
    send({ type: 'relayKick', peerId: 'peer-1' });
    await flush();
    expect(kick).toHaveBeenCalledWith('peer-1');
    expect(sent).toEqual([{ type: 'relayKickResult', ok: false, reason: 'auth' }]);
  });

  it('relayKick with a bad peer id is refused', async () => {
    send({ type: 'setRelayAdminToken', token: 'abc' });
    sent = [];
    send({ type: 'relayKick', peerId: 'a b' });
    await flush();
    expect(kick).not.toHaveBeenCalled();
    expect(sent).toEqual([{ type: 'relayKickResult', ok: false, reason: 'bad' }]);
  });

  it('a read-only client can do neither', async () => {
    send({ type: 'setRelayAdminToken', token: 'abc' }, ctx(false));
    send({ type: 'relayKick', peerId: 'peer-1' }, ctx(false));
    await flush();
    expect(readConfig().standalone.relayAdminToken).toBe('');
    expect(kick).not.toHaveBeenCalled();
    expect(JSON.stringify(sent)).not.toContain('abc');
  });

  it('the handshake carries relayState after autostartState', () => {
    send(
      { type: 'webviewReady' },
      { ...ctx(), autostart: { get: () => ({ enabled: false, supported: false }), set: vi.fn() } },
    );
    const types = sent.map((m) => m.type);
    expect(types).toContain('relayState');
    expect(types.indexOf('relayState')).toBeGreaterThan(types.indexOf('autostartState'));
    expect(sent.find((m) => m.type === 'relayState')).toEqual({
      type: 'relayState',
      state: 'connected',
    });
    expect(sent.find((m) => m.type === 'settingsLoaded')).toMatchObject({ relayAdmin: false });
  });

  it('relayState rounds retryInMs (schema: integer)', () => {
    expect(relayStateMessage({ state: 'budget', retryInMs: 1234.6 })).toEqual({
      type: 'relayState',
      state: 'budget',
      retryInMs: 1235,
    });
  });

  it('the handshake says off without a relay', () => {
    send({ type: 'webviewReady' }, { ...ctx(), relay: undefined });
    expect(sent.find((m) => m.type === 'relayState')).toEqual({ type: 'relayState', state: 'off' });
  });
});
