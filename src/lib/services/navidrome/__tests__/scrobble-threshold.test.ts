import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scrobbleSong, scrobbleAtThreshold } from '../user-features';

const ok = () => new Response(JSON.stringify({ 'subsonic-response': { status: 'ok' } }), { status: 200 });
const submissions = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.filter(([url]) => String(url).includes('submission=true')).length;

describe('scrobbleAtThreshold', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useRealTimers();
    fetchMock = vi.fn(async () => ok());
    vi.stubGlobal('fetch', fetchMock);
  });

  it('submits once: the end-of-song scrobble for the same play is dropped', async () => {
    await scrobbleAtThreshold('song-a', 120);
    await scrobbleSong('song-a', true);
    expect(submissions(fetchMock)).toBe(1);
  });

  it('still sends now-playing updates and other songs', async () => {
    await scrobbleAtThreshold('song-b', 120);
    await scrobbleSong('song-b', false);
    await scrobbleSong('song-c', true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('counts the song again once the play is over (repeat)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    await scrobbleAtThreshold('song-d', 60);
    vi.setSystemTime(Date.now() + 91_000);
    await scrobbleSong('song-d', true);
    expect(submissions(fetchMock)).toBe(2);
  });

  it('a failed threshold submit leaves the end-of-song fallback in place', async () => {
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await scrobbleAtThreshold('song-e', 120);
    await scrobbleSong('song-e', true);
    expect(submissions(fetchMock)).toBe(2);
  });
});
