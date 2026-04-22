/**
 * Tests for the seeded-radio store actions on the audio store:
 *   - startRadio
 *   - saveRadioAsPlaylist
 *
 * Verifies request shape, state transitions on success/failure, and the
 * edge case where the server returns an empty song list.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAudioStore } from '../audio';
import type { SeededRadioSeed } from '@/lib/services/seeded-radio';

vi.mock('@/lib/toast', () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('audio store — seeded radio actions', () => {
  beforeEach(() => {
    useAudioStore.setState({
      playlist: [],
      currentSongIndex: -1,
      isPlaying: false,
      isRadioSession: false,
      radioSeed: null,
      radioVariety: 'medium',
      radioSessionPlayCount: 0,
      aiDJUserActionInProgress: false,
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('startRadio', () => {
    it('populates the queue and sets radio-session flags on success', async () => {
      const seed: SeededRadioSeed = { kind: 'song', songId: 'abc' };
      const songs = [
        { id: 'abc', title: 'Seed', artist: 'X', duration: 100, url: '/s/abc' },
        { id: 'def', title: 'Two', artist: 'Y', duration: 100, url: '/s/def' },
      ];
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse({ data: { songs, seedInfo: { label: 'Seed Radio' } } }),
      );
      vi.stubGlobal('fetch', fetchMock);

      await useAudioStore.getState().startRadio(seed, 'medium');

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/radio/seeded',
        expect.objectContaining({ method: 'POST' }),
      );
      const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
      expect(body).toEqual({ seed, variety: 'medium' });

      const state = useAudioStore.getState();
      expect(state.playlist).toHaveLength(2);
      expect(state.isPlaying).toBe(true);
      expect(state.isRadioSession).toBe(true);
      expect(state.radioSeed).toEqual(seed);
      expect(state.radioVariety).toBe('medium');
      expect(state.radioSessionPlayCount).toBe(0);
    });

    it('warns and does not mutate state when the server returns no songs', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(jsonResponse({ data: { songs: [], seedInfo: {} } })),
      );

      const before = useAudioStore.getState();
      await useAudioStore.getState().startRadio({ kind: 'song', songId: 'x' });

      const after = useAudioStore.getState();
      expect(after.playlist).toEqual(before.playlist);
      expect(after.isRadioSession).toBe(false);
      expect(after.radioSeed).toBeNull();
    });

    it('surfaces an error and leaves state untouched on non-2xx', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(jsonResponse({ message: 'boom' }, { status: 500 })),
      );

      const before = useAudioStore.getState();
      await useAudioStore.getState().startRadio({ kind: 'song', songId: 'x' });

      const after = useAudioStore.getState();
      expect(after.isRadioSession).toBe(false);
      expect(after.playlist).toEqual(before.playlist);
    });
  });

  describe('saveRadioAsPlaylist', () => {
    it('returns null when the queue is empty', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const result = await useAudioStore.getState().saveRadioAsPlaylist('Test');

      expect(result).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('POSTs to /api/playlists/create-from-ids and returns playlist info', async () => {
      useAudioStore.setState({
        playlist: [
          { id: '1', title: 'a', artist: 'A', duration: 60, url: '/1' },
          { id: '2', title: 'b', artist: 'B', duration: 60, url: '/2' },
        ],
      });
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse({ data: { playlistId: 'pl-42', name: 'My Radio' } }, { status: 201 }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const result = await useAudioStore.getState().saveRadioAsPlaylist('My Radio');

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/playlists/create-from-ids',
        expect.objectContaining({ method: 'POST' }),
      );
      const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
      expect(body).toEqual({ name: 'My Radio', songIds: ['1', '2'] });
      expect(result).toEqual({ playlistId: 'pl-42', name: 'My Radio' });
    });

    it('returns null on non-2xx without throwing', async () => {
      useAudioStore.setState({
        playlist: [{ id: '1', title: 'a', artist: 'A', duration: 60, url: '/1' }],
      });
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(jsonResponse({ message: 'denied' }, { status: 403 })),
      );

      const result = await useAudioStore.getState().saveRadioAsPlaylist('x');
      expect(result).toBeNull();
    });
  });
});
