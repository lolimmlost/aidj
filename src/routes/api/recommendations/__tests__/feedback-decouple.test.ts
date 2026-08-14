import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as likedSongsSync from '@/lib/services/liked-songs-sync';

// Chainable, thenable db mock: every builder method returns the same proxy, and
// awaiting the proxy (or `.then`) resolves to `resolveValue`. Both selects in the
// POST path (existing feedback, user preferences) resolve to [] → insert branch,
// sync enabled by default.
let resolveValue: unknown[] = [];
function makeDb() {
  const p: Record<string, unknown> = {};
  const methods = [
    'select', 'from', 'where', 'orderBy', 'limit',
    'insert', 'values', 'onConflictDoUpdate', 'returning',
    'update', 'set', 'delete',
  ];
  for (const m of methods) p[m] = vi.fn(() => p);
  (p as { then: unknown }).then = (onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve(resolveValue).then(onFulfilled);
  return p;
}

vi.mock('@/lib/db', () => ({ db: makeDb() }));

vi.mock('@/lib/services/liked-songs-sync', () => ({
  setSongLiked: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/services/navidrome-users', () => ({
  ensureNavidromeUser: vi.fn().mockResolvedValue({ username: 'u', token: 't', salt: 's' }),
}));

vi.mock('@/lib/services/preferences', () => ({ clearPreferenceCache: vi.fn() }));
vi.mock('@/lib/services/recommendation-analytics', () => ({ clearAnalyticsCache: vi.fn() }));

// withAuthAndErrorHandling dynamically imports this and injects the session.
vi.mock('@/lib/auth/auth', () => ({
  auth: { api: { getSession: vi.fn().mockResolvedValue({ user: { id: 'user-1', name: 'U', email: 'u@e.com' } }) } },
}));

import { POST } from '../feedback';

function postReq(body: Record<string, unknown>) {
  return {
    request: new Request('http://localhost/api/recommendations/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  };
}

describe('feedback POST — thumbs decoupled from stars', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveValue = [];
  });

  it('does NOT star recommendation-source thumbs_up (pure rec signal)', async () => {
    const res = await POST(postReq({
      songArtistTitle: 'Artist - Title',
      feedbackType: 'thumbs_up',
      source: 'recommendation',
      songId: 'song-1',
    }));

    expect(res.status).toBe(200);
    expect(likedSongsSync.setSongLiked).not.toHaveBeenCalled();
  });

  it('does NOT unstar on an ai_dj thumbs_down (must not clear a genuine like)', async () => {
    await POST(postReq({
      songArtistTitle: 'Artist - Title',
      feedbackType: 'thumbs_down',
      source: 'ai_dj',
      songId: 'song-1',
    }));

    expect(likedSongsSync.setSongLiked).not.toHaveBeenCalled();
  });

  it('DOES star an explicit library like (the heart, source=library)', async () => {
    await POST(postReq({
      songArtistTitle: 'Artist - Title',
      feedbackType: 'thumbs_up',
      source: 'library',
      songId: 'song-1',
    }));

    expect(likedSongsSync.setSongLiked).toHaveBeenCalledWith(
      'user-1',
      'song-1',
      true,
      expect.objectContaining({ username: 'u' }),
      expect.objectContaining({ artist: 'Artist', title: 'Title' }),
    );
  });

  it('DOES unstar an explicit library unlike (source=library, thumbs_down)', async () => {
    await POST(postReq({
      songArtistTitle: 'Artist - Title',
      feedbackType: 'thumbs_down',
      source: 'library',
      songId: 'song-1',
    }));

    expect(likedSongsSync.setSongLiked).toHaveBeenCalledWith(
      'user-1',
      'song-1',
      false,
      expect.anything(),
      expect.anything(),
    );
  });
});
