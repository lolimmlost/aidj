import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const getSession = vi.fn();
vi.mock('~/lib/auth/auth', () => ({ auth: { api: { getSession: (...a: unknown[]) => getSession(...a) } } }));

let dir = '';
let POST: (a: { request: Request }) => Promise<Response>;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lab-sets-'));
  process.env.LAB_SETS_DIR = dir;
  ({ POST } = await import('../lab-sets'));
});
afterAll(() => rm(dir, { recursive: true, force: true }));
beforeEach(() => getSession.mockResolvedValue({ user: { role: 'admin' } }));

const post = (body: unknown) => POST({ request: new Request('http://x/api/dj/lab-sets', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }) });

describe('lab-sets route (#392)', () => {
  it('keeps a copy of a saved set, overwritten as it grows', async () => {
    const set = { id: 'mh2abc1', startedAt: '2026-11-02T18:10:42Z', setBpm: 126, mode: 'dropchain', tracks: [{ id: 'a', at: 0 }] };
    expect((await post(set)).status).toBe(204);
    expect((await post({ ...set, tracks: [...set.tracks, { id: 'b', at: 130, cues: { entryA: 56, cueB: 8 } }] })).status).toBe(204);
    expect(JSON.parse(await readFile(join(dir, 'mh2abc1.json'), 'utf8')).tracks).toHaveLength(2);
  });

  it('is for admins only and refuses what is not a set', async () => {
    getSession.mockResolvedValueOnce({ user: { role: 'user' } });
    expect((await post({ id: 'mh2abc1', tracks: [] })).status).toBe(403);
    expect((await post({ id: '../x', tracks: [] })).status).toBe(400);
    expect((await post({ id: 'mh2abc2' })).status).toBe(400);
    expect((await post('not json')).status).toBe(400);
  });
});
