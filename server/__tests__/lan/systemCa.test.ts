import type * as tls from 'tls';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { trustSystemCa } from '../../src/lan/systemCa.js';

const fake = (o: object) => o as unknown as typeof tls;

afterEach(() => vi.restoreAllMocks());

describe('trustSystemCa', () => {
  it('sets default + system certs', () => {
    const set = vi.fn();
    const get = vi.fn((t: string) => (t === 'default' ? ['a', 'b'] : ['b', 'c']));
    expect(trustSystemCa(fake({ getCACertificates: get, setDefaultCACertificates: set }))).toBe(
      true,
    );
    expect(set).toHaveBeenCalledWith(['a', 'b', 'c']);
  });

  it('missing functions -> false', () => {
    expect(trustSystemCa(fake({}))).toBe(false);
  });

  it('throwing store -> false, one log line', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const get = () => {
      throw new Error('boom');
    };
    expect(trustSystemCa(fake({ getCACertificates: get, setDefaultCACertificates: vi.fn() }))).toBe(
      false,
    );
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toContain('boom');
  });
});
