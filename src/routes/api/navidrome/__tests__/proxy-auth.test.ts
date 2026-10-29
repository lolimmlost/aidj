/**
 * The Navidrome proxies sign every upstream request with Navidrome credentials,
 * so each one must refuse callers without an AIDJ session.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSession = vi.fn();
vi.mock('@/lib/auth/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('@/lib/config/config', () => ({
  getConfig: () => ({ navidromeUrl: 'http://nd', navidromeUsername: 'admin', navidromePassword: 'pw' }),
}));
vi.mock('@/lib/services/navidrome', () => ({
  getAuthToken: vi.fn().mockResolvedValue('jwt'),
  subsonicToken: 'admin-token',
  subsonicSalt: 'admin-salt',
  token: 'jwt',
  clientId: 'client',
}));
const ensureNavidromeUser = vi.fn();
vi.mock('@/lib/services/navidrome-users', () => ({ ensureNavidromeUser }));

const { Route: restRoute } = await import('../rest/$');
const { Route: scrobbleRoute } = await import('../rest/scrobble');
const { Route: streamRoute } = await import('../stream/$id');
const { Route: albumRoute } = await import('../api/album');
const { Route: songRoute } = await import('../api/song');
const { Route: albumIdRoute } = await import('../api/album/$id');
const { Route: loginRoute } = await import('../auth/login');

type Handler = (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
const handler = (route: unknown) =>
  (route as { options: { server: { handlers: { GET: Handler } } } }).options.server.handlers.GET;

const req = (path: string, headers: Record<string, string> = {}) =>
  new Request(`https://aidj.test${path}`, { headers });

const fetchMock = vi.fn();
const SESSION = { user: { id: 'u1', name: 'Friend', email: 'friend@example.com', role: 'user' }, session: { id: 's1' } };
const ADMIN = { ...SESSION, user: { ...SESSION.user, role: 'admin' } };

beforeEach(() => {
  getSession.mockReset();
  ensureNavidromeUser.mockReset();
  ensureNavidromeUser.mockResolvedValue({ username: 'juan', token: 'user-token', salt: 'user-salt' });
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) =>
    String(url).includes('getCoverArt')
      ? new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } })
      : String(url).includes('/rest/stream')
        ? new Response(new Uint8Array([1]), { headers: { 'content-type': 'audio/mpeg' } })
        : new Response(JSON.stringify({ 'subsonic-response': { status: 'ok' } }), {
            headers: { 'content-type': 'application/json' },
          }),
  );
  vi.stubGlobal('fetch', fetchMock);
});

describe('Navidrome proxies without a session', () => {
  beforeEach(() => getSession.mockResolvedValue(null));

  it.each([
    ['rest getPlaylists', restRoute, '/api/navidrome/rest/getPlaylists', { _splat: 'getPlaylists' }],
    ['rest deletePlaylist', restRoute, '/api/navidrome/rest/deletePlaylist?id=p1', { _splat: 'deletePlaylist' }],
    ['rest getCoverArt', restRoute, '/api/navidrome/rest/getCoverArt?id=al-1', { _splat: 'getCoverArt' }],
    ['scrobble', scrobbleRoute, '/api/navidrome/rest/scrobble?id=s1', {}],
    ['stream', streamRoute, '/api/navidrome/stream/0123456789ab', { id: '0123456789ab' }],
    ['native album list', albumRoute, '/api/navidrome/api/album', {}],
    ['native song list', songRoute, '/api/navidrome/api/song', {}],
  ])('%s returns 401 and never reaches Navidrome', async (_name, route, path, params) => {
    const res = await handler(route)({ request: req(path), params });
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Navidrome proxies with a session', () => {
  beforeEach(() => getSession.mockResolvedValue(SESSION));

  it('serves cover art', async () => {
    const res = await handler(restRoute)({
      request: req('/api/navidrome/rest/getCoverArt?id=al-1'),
      params: { _splat: 'getCoverArt' },
    });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('streams audio', async () => {
    const res = await handler(streamRoute)({
      request: req('/api/navidrome/stream/0123456789ab'),
      params: { id: '0123456789ab' },
    });
    expect(res.status).toBe(200);
  });

  it("signs user-scoped calls with the user's own Navidrome account", async () => {
    await handler(restRoute)({ request: req('/api/navidrome/rest/getPlaylists'), params: { _splat: 'getPlaylists' } });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get('u')).toBe('juan');
    expect(url.searchParams.get('t')).toBe('user-token');
  });

  it('refuses writes fired from another site (the session cookie is SameSite=None)', async () => {
    const crossSite = { 'sec-fetch-site': 'cross-site' };
    const del = await handler(restRoute)({
      request: req('/api/navidrome/rest/deletePlaylist?id=p1', crossSite),
      params: { _splat: 'deletePlaylist' },
    });
    const scrobble = await handler(scrobbleRoute)({ request: req('/api/navidrome/rest/scrobble?id=s1', crossSite), params: {} });
    expect(del.status).toBe(401);
    expect(scrobble.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows writes from AIDJ itself and reads from anywhere', async () => {
    const del = await handler(restRoute)({
      request: req('/api/navidrome/rest/deletePlaylist?id=p1', { 'sec-fetch-site': 'same-origin' }),
      params: { _splat: 'deletePlaylist' },
    });
    const cover = await handler(restRoute)({
      request: req('/api/navidrome/rest/getCoverArt?id=al-1', { 'sec-fetch-site': 'cross-site' }),
      params: { _splat: 'getCoverArt' },
    });
    expect(del.status).toBe(200);
    expect(cover.status).toBe(200);
  });

  it('refuses endpoint names that climb out of /rest (the splat is URL-decoded)', async () => {
    // e.g. /api/navidrome/rest/getX%2F..%2FdeletePlaylist: looks like a read, resolves to deletePlaylist
    const res = await handler(restRoute)({
      request: req('/api/navidrome/rest/getX%2F..%2FdeletePlaylist?id=p1', { 'sec-fetch-site': 'cross-site' }),
      params: { _splat: 'getX/../deletePlaylist' },
    });
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts the .view form of an endpoint', async () => {
    const res = await handler(restRoute)({
      request: req('/api/navidrome/rest/getPlaylists.view'),
      params: { _splat: 'getPlaylists.view' },
    });
    expect(res.status).toBe(200);
  });

  it('refuses an album id that climbs into other Navidrome APIs', async () => {
    const res = await handler(albumIdRoute)({
      request: req('/api/navidrome/api/album/..%2F..%2Fapi%2Fuser'),
      params: { id: '../../api/user' },
    });
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('admin rights stay on the server', () => {
  it('login hands the browser placeholders, never the Navidrome admin token', async () => {
    getSession.mockResolvedValue(SESSION);
    const post = (loginRoute as unknown as { options: { server: { handlers: { POST: Handler } } } }).options.server.handlers.POST;
    const res = await post({ request: new Request('https://aidj.test/api/navidrome/auth/login', { method: 'POST' }), params: {} });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ token: 'aidj-proxy', id: 'aidj-proxy', subsonicToken: 'aidj-proxy', subsonicSalt: 'aidj-proxy' });
    expect(JSON.stringify(body)).not.toMatch(/jwt|admin-token|admin-salt/);
  });

  it('refuses a non-admin a write the proxy would sign as the Navidrome admin', async () => {
    getSession.mockResolvedValue(SESSION);
    const res = await handler(restRoute)({ request: req('/api/navidrome/rest/startScan'), params: { _splat: 'startScan' } });
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lets the admin run it', async () => {
    getSession.mockResolvedValue(ADMIN);
    const res = await handler(restRoute)({ request: req('/api/navidrome/rest/startScan'), params: { _splat: 'startScan' } });
    expect(res.status).toBe(200);
  });

  it("does not fall back to the admin's account when a user's own Navidrome account fails", async () => {
    getSession.mockResolvedValue(SESSION);
    ensureNavidromeUser.mockRejectedValue(new Error('navidrome user create failed'));
    const playlists = await handler(restRoute)({
      request: req('/api/navidrome/rest/deletePlaylist?id=p1'),
      params: { _splat: 'deletePlaylist' },
    });
    const scrobble = await handler(scrobbleRoute)({ request: req('/api/navidrome/rest/scrobble?id=s1'), params: {} });
    expect(playlists.status).toBe(503);
    expect(scrobble.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still falls back for the admin', async () => {
    getSession.mockResolvedValue(ADMIN);
    ensureNavidromeUser.mockRejectedValue(new Error('navidrome user create failed'));
    const res = await handler(restRoute)({ request: req('/api/navidrome/rest/getPlaylists'), params: { _splat: 'getPlaylists' } });
    expect(res.status).toBe(200);
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get('u')).toBe('admin');
  });
});
