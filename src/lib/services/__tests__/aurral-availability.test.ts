/**
 * Aurral availability (#336): a wedged/timing-out Aurral must fail fast and must never be
 * cached as "no such artist" — that hid real artists from search for 24 h after every wedge.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const insertValues = vi.fn().mockReturnThis();

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    // cache lookup: always a miss
    then: vi.fn((cb: (rows: unknown[]) => unknown) => Promise.resolve(cb([]))),
    insert: vi.fn().mockReturnThis(),
    values: (...args: unknown[]) => insertValues(...args),
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/lib/config/config', () => ({
  getConfigAsync: vi.fn().mockResolvedValue({
    aurralUrl: 'http://aurral.test',
    aurralUsername: 'u',
    aurralPassword: 'p',
  }),
}));

import {
  assertAurralResponsive,
  getAurralHealth,
  getEnrichedArtist,
  resetAurralHealthCache,
  AurralUnavailableError,
} from '../aurral';

type Route = (url: string) => Promise<Response>;
function stubFetch(route: Route) {
  const fn = vi.fn((input: RequestInfo | URL) => route(String(input)));
  vi.stubGlobal('fetch', fn);
  return fn;
}
const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
const authOk = () => json({ token: 't', expiresAt: new Date(Date.now() + 3600_000).toISOString() });

describe('Aurral availability', () => {
  beforeEach(() => {
    resetAurralHealthCache();
    insertValues.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('assertAurralResponsive throws AurralUnavailableError when health hangs or errors', async () => {
    stubFetch(() => Promise.reject(new DOMException('timed out', 'TimeoutError')));
    await expect(assertAurralResponsive()).rejects.toBeInstanceOf(AurralUnavailableError);
  });

  it('caches the health verdict so a wedged Aurral is probed once, not per request', async () => {
    const f = stubFetch(() => Promise.reject(new Error('ECONNRESET')));
    await expect(assertAurralResponsive()).rejects.toBeInstanceOf(AurralUnavailableError);
    await expect(assertAurralResponsive()).rejects.toBeInstanceOf(AurralUnavailableError);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('getAurralHealth reports unreachable instead of hanging', async () => {
    stubFetch(() => Promise.reject(new DOMException('timed out', 'TimeoutError')));
    await expect(getAurralHealth()).resolves.toEqual({ status: 'unreachable', configured: true });
  });

  it('getEnrichedArtist throws (and caches nothing) when Aurral health fails', async () => {
    stubFetch(() => Promise.reject(new Error('down')));
    await expect(getEnrichedArtist('glaive')).rejects.toBeInstanceOf(AurralUnavailableError);
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('getEnrichedArtist throws (and caches nothing) when the search request itself fails', async () => {
    stubFetch((url) => {
      if (url.endsWith('/api/health/live')) return json({ status: 'ok' });
      if (url.endsWith('/api/auth/login')) return authOk();
      return Promise.reject(new Error('socket hang up'));
    });
    await expect(getEnrichedArtist('glaive')).rejects.toBeInstanceOf(AurralUnavailableError);
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('an answered search with no hits is a real miss: returns null and caches it', async () => {
    stubFetch((url) => {
      if (url.endsWith('/api/health/live')) return json({ status: 'ok' });
      if (url.endsWith('/api/auth/login')) return authOk();
      if (url.includes('/api/artists/search')) return json({ artists: [], count: 0 });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    await expect(getEnrichedArtist('zzzz no such artist')).resolves.toBeNull();
    expect(insertValues).toHaveBeenCalledTimes(1);
    expect(insertValues.mock.calls[0][0]).toMatchObject({ artistNameNormalized: 'zzzz no such artist' });
  });
});
