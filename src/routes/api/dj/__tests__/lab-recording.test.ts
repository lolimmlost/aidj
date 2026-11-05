import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const getSession = vi.fn();
vi.mock('~/lib/auth/auth', () => ({ auth: { api: { getSession: (...a: unknown[]) => getSession(...a) } } }));

let dir = '';
let POST: (a: { request: Request }) => Promise<Response>;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lab-rec-'));
  process.env.LAB_RECORDINGS_DIR = dir;
  ({ POST } = await import('../lab-recording'));
});
afterAll(() => rm(dir, { recursive: true, force: true }));
beforeEach(() => getSession.mockResolvedValue({ user: { role: 'admin' } }));

const chunk = (id: string, seq: number, text: string) =>
  POST({ request: new Request(`http://x/api/dj/lab-recording?id=${id}&seq=${seq}`, { method: 'POST', body: text }) });

describe('lab-recording route (#391)', () => {
  it('joins the chunks in sequence order, whatever order they arrived in, with the tracklist beside', async () => {
    expect((await chunk('2026-11-02-abc123', 1, 'B')).status).toBe(204);
    expect((await chunk('2026-11-02-abc123', 0, 'A')).status).toBe(204);
    expect((await chunk('2026-11-02-abc123', 2, 'C')).status).toBe(204);
    const res = await POST({
      request: new Request('http://x/api/dj/lab-recording?id=2026-11-02-abc123&finish=1', {
        method: 'POST',
        body: JSON.stringify({ mime: 'audio/mp4', tracklist: [{ at: 0, song: 'A – One' }] }),
      }),
    });
    expect(await res.json()).toEqual({ file: '2026-11-02-abc123.m4a', chunks: 3 });
    expect(await readFile(join(dir, '2026-11-02-abc123.m4a'), 'utf8')).toBe('ABC');
    expect(JSON.parse(await readFile(join(dir, '2026-11-02-abc123.json'), 'utf8')).tracklist).toEqual([{ at: 0, song: 'A – One' }]);
    // the chunks are gone once joined
    expect((await readdir(dir)).sort()).toEqual(['2026-11-02-abc123.json', '2026-11-02-abc123.m4a']);
  });

  it('is for admins only, and refuses bad ids and empty chunks', async () => {
    getSession.mockResolvedValueOnce(null);
    expect((await chunk('2026-11-02-abc124', 0, 'A')).status).toBe(401);
    getSession.mockResolvedValueOnce({ user: { role: 'user' } });
    expect((await chunk('2026-11-02-abc124', 0, 'A')).status).toBe(403);
    expect((await chunk('../etc', 0, 'A')).status).toBe(400);
    expect((await chunk('2026-11-02-abc124', -1, 'A')).status).toBe(400);
    expect((await chunk('2026-11-02-abc124', 0, '')).status).toBe(400);
  });
});
