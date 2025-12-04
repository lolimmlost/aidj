import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getRecommendations,
  applyDiversity,
  enrichedTrackToSong,
  enrichedTrackToDiscoverySong,
  subsonicSongToSong,
} from '../recommendations';
import * as lastfm from '../lastfm';
import * as smartPlaylistEvaluator from '../smart-playlist-evaluator';
import * as navidrome from '../navidrome';
import * as moodTranslator from '../mood-translator';
import type { EnrichedTrack } from '../lastfm/types';
import type { SubsonicSong } from '../navidrome';

// Mock dependencies
vi.mock('../lastfm');
vi.mock('../smart-playlist-evaluator');
vi.mock('../navidrome');
vi.mock('../mood-translator');

describe('Unified Recommendation Service', () => {
  // Mock data
  const mockEnrichedTracks: EnrichedTrack[] = [
    {
      name: 'Street Spirit',
      artist: 'Radiohead',
      url: 'https://lastfm.com/track/1',
      match: 0.95,
      inLibrary: true,
      navidromeId: 'nd-1',
      navidromeAlbum: 'The Bends',
      duration: 300,
    },
    {
      name: 'Exit Music',
      artist: 'Radiohead',
      url: 'https://lastfm.com/track/2',
      match: 0.90,
      inLibrary: true,
      navidromeId: 'nd-2',
      navidromeAlbum: 'OK Computer',
      duration: 270,
    },
    {
      name: 'Fake Plastic Trees',
      artist: 'Radiohead',
      url: 'https://lastfm.com/track/3',
      match: 0.85,
      inLibrary: true,
      navidromeId: 'nd-3',
      navidromeAlbum: 'The Bends',
      duration: 290,
    },
    {
      name: 'Bitter Sweet Symphony',
      artist: 'The Verve',
      url: 'https://lastfm.com/track/4',
      match: 0.80,
      inLibrary: true,
      navidromeId: 'nd-4',
      navidromeAlbum: 'Urban Hymns',
      duration: 360,
    },
    {
      name: 'Wonderwall',
      artist: 'Oasis',
      url: 'https://lastfm.com/track/5',
      match: 0.75,
      inLibrary: false, // Not in library
      duration: 260,
    },
    {
      name: "Don't Look Back in Anger",
      artist: 'Oasis',
      url: 'https://lastfm.com/track/6',
      match: 0.70,
      inLibrary: false, // Not in library
      duration: 280,
    },
  ];

  const mockSubsonicSongs: SubsonicSong[] = [
    {
      id: 's-1',
      title: 'Ambient Dream',
      artist: 'Artist A',
      albumId: 'album-1',
      album: 'Chill Vibes',
      duration: '240',
      track: '1',
    },
    {
      id: 's-2',
      title: 'Jazz Night',
      artist: 'Artist B',
      albumId: 'album-2',
      album: 'Evening Sessions',
      duration: '180',
      track: '2',
    },
    {
      id: 's-3',
      title: 'Rock Anthem',
      artist: 'Artist C',
      albumId: 'album-3',
      album: 'Power Up',
      duration: '300',
      track: '1',
    },
  ];

  let mockLastFmClient: {
    getSimilarTracks: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.resetAllMocks();

    // Setup Last.fm mock
    mockLastFmClient = {
      getSimilarTracks: vi.fn().mockResolvedValue(mockEnrichedTracks),
    };

    vi.spyOn(lastfm, 'getLastFmClient').mockReturnValue(mockLastFmClient as unknown as ReturnType<typeof lastfm.getLastFmClient>);

    // Setup smart playlist evaluator mock
    vi.spyOn(smartPlaylistEvaluator, 'evaluateSmartPlaylistRules').mockResolvedValue(mockSubsonicSongs);

    // Setup navidrome mock for fallback
    vi.spyOn(navidrome, 'getSongsGlobal').mockResolvedValue(
      mockSubsonicSongs.map(s => ({ ...s, name: s.title }))
    );

    // Setup mood translator mock
    vi.spyOn(moodTranslator, 'translateMoodToQuery').mockResolvedValue({
      any: [{ field: 'genre', operator: 'contains', value: 'ambient' }],
      limit: 25,
      sort: 'random',
    });

    vi.spyOn(moodTranslator, 'toEvaluatorFormat').mockReturnValue({
      any: [{ contains: { genre: 'ambient' } }],
      limit: 25,
      sort: 'random',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // Similar Mode Tests
  // ============================================================================

  describe('Similar Mode (Library)', () => {
    it('should return similar songs from library via Last.fm', async () => {
      const result = await getRecommendations({
        mode: 'similar',
        currentSong: { artist: 'Radiohead', title: 'Karma Police' },
        limit: 5,
      });

      expect(result.mode).toBe('similar');
      expect(result.source).toBe('lastfm');
      expect(result.songs.length).toBeGreaterThan(0);
      expect(mockLastFmClient.getSimilarTracks).toHaveBeenCalledWith(
        'Radiohead',
        'Karma Police',
        15 // limit * 3
      );
    });

    it('should filter out songs not in library', async () => {
      const result = await getRecommendations({
        mode: 'similar',
        currentSong: { artist: 'Radiohead', title: 'Karma Police' },
        limit: 10,
      });

      // All returned songs should have navidromeId (meaning they're in library)
      result.songs.forEach(song => {
        expect(song.id).toMatch(/^nd-/);
      });
    });

    it('should exclude specified song IDs', async () => {
      const result = await getRecommendations({
        mode: 'similar',
        currentSong: { artist: 'Radiohead', title: 'Karma Police' },
        excludeSongIds: ['nd-1', 'nd-2'],
        limit: 10,
      });

      const songIds = result.songs.map(s => s.id);
      expect(songIds).not.toContain('nd-1');
      expect(songIds).not.toContain('nd-2');
    });

    it('should exclude specified artists', async () => {
      const result = await getRecommendations({
        mode: 'similar',
        currentSong: { artist: 'Radiohead', title: 'Karma Police' },
        excludeArtists: ['Radiohead'],
        limit: 10,
      });

      result.songs.forEach(song => {
        expect(song.artist?.toLowerCase()).not.toContain('radiohead');
      });
    });

    it('should require currentSong for similar mode', async () => {
      await expect(
        getRecommendations({
          mode: 'similar',
          limit: 10,
        })
      ).rejects.toThrow('currentSong required for similar mode');
    });

    it('should fallback when Last.fm is not configured', async () => {
      vi.spyOn(lastfm, 'getLastFmClient').mockReturnValue(null);

      const result = await getRecommendations({
        mode: 'similar',
        currentSong: { artist: 'Radiohead', title: 'Karma Police' },
        limit: 5,
      });

      expect(result.source).toBe('fallback');
      expect(result.metadata?.fallbackReason).toBe('lastfm_not_configured');
    });

    it('should fallback when Last.fm returns no library matches', async () => {
      // Return only tracks not in library
      mockLastFmClient.getSimilarTracks.mockResolvedValue([
        { ...mockEnrichedTracks[4], inLibrary: false },
        { ...mockEnrichedTracks[5], inLibrary: false },
      ]);

      const result = await getRecommendations({
        mode: 'similar',
        currentSong: { artist: 'Radiohead', title: 'Karma Police' },
        limit: 5,
      });

      expect(result.source).toBe('fallback');
      expect(result.metadata?.fallbackReason).toBe('no_library_matches');
    });

    it('should fallback when Last.fm throws an error', async () => {
      mockLastFmClient.getSimilarTracks.mockRejectedValue(new Error('API Error'));

      const result = await getRecommendations({
        mode: 'similar',
        currentSong: { artist: 'Radiohead', title: 'Karma Police' },
        limit: 5,
      });

      expect(result.source).toBe('fallback');
      expect(result.metadata?.fallbackReason).toBe('lastfm_error');
    });

    it('should include metadata about candidates and filtered count', async () => {
      const result = await getRecommendations({
        mode: 'similar',
        currentSong: { artist: 'Radiohead', title: 'Karma Police' },
        limit: 5,
      });

      expect(result.metadata?.totalCandidates).toBe(6);
      expect(result.metadata?.filteredCount).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Discovery Mode Tests
  // ============================================================================

  describe('Discovery Mode (Not in Library)', () => {
    it('should return songs NOT in library', async () => {
      const result = await getRecommendations({
        mode: 'discovery',
        currentSong: { artist: 'Radiohead', title: 'Karma Police' },
        limit: 5,
      });

      expect(result.mode).toBe('discovery');
      expect(result.source).toBe('lastfm');

      // All returned songs should NOT have navidromeId
      result.songs.forEach(song => {
        expect(song.id).toMatch(/^discovery-/);
      });
    });

    it('should sort discovery results by match score', async () => {
      const result = await getRecommendations({
        mode: 'discovery',
        currentSong: { artist: 'Radiohead', title: 'Karma Police' },
        limit: 2,
      });

      // Wonderwall (0.75) should come before Don't Look Back in Anger (0.70)
      expect(result.songs[0].name).toBe('Wonderwall');
    });

    it('should require currentSong for discovery mode', async () => {
      await expect(
        getRecommendations({
          mode: 'discovery',
          limit: 10,
        })
      ).rejects.toThrow('currentSong required for discovery mode');
    });

    it('should require Last.fm for discovery mode', async () => {
      vi.spyOn(lastfm, 'getLastFmClient').mockReturnValue(null);

      await expect(
        getRecommendations({
          mode: 'discovery',
          currentSong: { artist: 'Radiohead', title: 'Karma Police' },
          limit: 5,
        })
      ).rejects.toThrow('Last.fm required for discovery mode');
    });

    it('should throw error when Last.fm fails in discovery mode', async () => {
      mockLastFmClient.getSimilarTracks.mockRejectedValue(new Error('API Error'));

      await expect(
        getRecommendations({
          mode: 'discovery',
          currentSong: { artist: 'Radiohead', title: 'Karma Police' },
          limit: 5,
        })
      ).rejects.toThrow('API Error');
    });
  });

  // ============================================================================
  // Mood Mode Tests
  // ============================================================================

  describe('Mood Mode (Smart Playlist)', () => {
    it('should return songs based on mood description', async () => {
      const result = await getRecommendations({
        mode: 'mood',
        moodDescription: 'chill evening vibes',
        limit: 20,
      });

      expect(result.mode).toBe('mood');
      expect(result.source).toBe('smart-playlist');
      expect(result.songs.length).toBe(3);
    });

    it('should require moodDescription for mood mode', async () => {
      await expect(
        getRecommendations({
          mode: 'mood',
          limit: 10,
        })
      ).rejects.toThrow('moodDescription required for mood mode');
    });

    it('should call mood translator and smart playlist evaluator', async () => {
      await getRecommendations({
        mode: 'mood',
        moodDescription: 'chill vibes',
        limit: 15,
      });

      // Verify mood translator was called
      expect(moodTranslator.translateMoodToQuery).toHaveBeenCalledWith('chill vibes');
      expect(moodTranslator.toEvaluatorFormat).toHaveBeenCalled();

      // Verify smart playlist evaluator was called with the translated query
      expect(smartPlaylistEvaluator.evaluateSmartPlaylistRules).toHaveBeenCalled();
      const callArgs = vi.mocked(smartPlaylistEvaluator.evaluateSmartPlaylistRules).mock.calls[0][0];
      expect(callArgs.sort).toBe('random');
    });

    it('should fallback when smart playlist evaluator fails', async () => {
      vi.spyOn(smartPlaylistEvaluator, 'evaluateSmartPlaylistRules').mockRejectedValue(
        new Error('Evaluator error')
      );

      const result = await getRecommendations({
        mode: 'mood',
        moodDescription: 'party music',
        limit: 10,
      });

      expect(result.source).toBe('fallback');
      expect(result.metadata?.fallbackReason).toBe('smart_playlist_error');
    });
  });

  // ============================================================================
  // Helper Function Tests
  // ============================================================================

  describe('applyDiversity', () => {
    it('should limit to 2 songs per artist', () => {
      const tracks: EnrichedTrack[] = [
        { name: 'Song 1', artist: 'Artist A', url: '', inLibrary: true, navidromeId: '1' },
        { name: 'Song 2', artist: 'Artist A', url: '', inLibrary: true, navidromeId: '2' },
        { name: 'Song 3', artist: 'Artist A', url: '', inLibrary: true, navidromeId: '3' },
        { name: 'Song 4', artist: 'Artist B', url: '', inLibrary: true, navidromeId: '4' },
      ];

      const result = applyDiversity(tracks);

      expect(result).toHaveLength(3); // 2 from Artist A + 1 from Artist B
      expect(result.filter(t => t.artist === 'Artist A')).toHaveLength(2);
    });

    it('should be case-insensitive for artist names', () => {
      const tracks: EnrichedTrack[] = [
        { name: 'Song 1', artist: 'The Beatles', url: '', inLibrary: true, navidromeId: '1' },
        { name: 'Song 2', artist: 'THE BEATLES', url: '', inLibrary: true, navidromeId: '2' },
        { name: 'Song 3', artist: 'the beatles', url: '', inLibrary: true, navidromeId: '3' },
      ];

      const result = applyDiversity(tracks);

      expect(result).toHaveLength(2);
    });
  });

  describe('enrichedTrackToSong', () => {
    it('should convert EnrichedTrack to Song format', () => {
      const track: EnrichedTrack = {
        name: 'Test Song',
        artist: 'Test Artist',
        url: 'https://lastfm.com/track',
        duration: 240,
        inLibrary: true,
        navidromeId: 'nd-123',
        navidromeAlbum: 'Test Album',
      };

      const song = enrichedTrackToSong(track);

      expect(song.id).toBe('nd-123');
      expect(song.name).toBe('Test Song');
      expect(song.title).toBe('Test Song');
      expect(song.artist).toBe('Test Artist');
      expect(song.album).toBe('Test Album');
      expect(song.duration).toBe(240);
      expect(song.url).toBe('/api/navidrome/stream/nd-123');
    });
  });

  describe('enrichedTrackToDiscoverySong', () => {
    it('should convert EnrichedTrack to discovery Song format', () => {
      const track: EnrichedTrack = {
        name: 'Test Song',
        artist: 'Test Artist',
        url: 'https://lastfm.com/track',
        duration: 240,
        inLibrary: false,
      };

      const song = enrichedTrackToDiscoverySong(track);

      expect(song.id).toMatch(/^discovery-/);
      expect(song.name).toBe('Test Song');
      expect(song.url).toBe('https://lastfm.com/track');
    });

    it('should sanitize spaces in discovery IDs', () => {
      const track: EnrichedTrack = {
        name: 'Test Song Name',
        artist: 'Test Artist Name',
        url: '',
        inLibrary: false,
      };

      const song = enrichedTrackToDiscoverySong(track);

      expect(song.id).not.toContain(' ');
    });
  });

  describe('subsonicSongToSong', () => {
    it('should convert SubsonicSong to Song format', () => {
      const subsonicSong: SubsonicSong = {
        id: 'sub-123',
        title: 'Test Title',
        artist: 'Test Artist',
        albumId: 'album-456',
        album: 'Test Album',
        duration: '180',
        track: '3',
      };

      const song = subsonicSongToSong(subsonicSong);

      expect(song.id).toBe('sub-123');
      expect(song.name).toBe('Test Title');
      expect(song.title).toBe('Test Title');
      expect(song.artist).toBe('Test Artist');
      expect(song.albumId).toBe('album-456');
      expect(song.album).toBe('Test Album');
      expect(song.duration).toBe(180);
      expect(song.track).toBe(3);
      expect(song.url).toBe('/api/navidrome/stream/sub-123');
    });
  });

  // Note: buildSimpleMoodQuery tests have been moved to mood-translator.test.ts
  // The mood translation is now handled by the mood-translator service

  // ============================================================================
  // Edge Cases and Error Handling
  // ============================================================================

  describe('Edge Cases', () => {
    it('should throw error for unknown mode', async () => {
      await expect(
        getRecommendations({
          // @ts-expect-error Testing invalid mode
          mode: 'invalid-mode',
          limit: 10,
        })
      ).rejects.toThrow('Unknown recommendation mode');
    });

    it('should use default limit of 10 for similar mode', async () => {
      await getRecommendations({
        mode: 'similar',
        currentSong: { artist: 'Radiohead', title: 'Karma Police' },
      });

      expect(mockLastFmClient.getSimilarTracks).toHaveBeenCalledWith(
        'Radiohead',
        'Karma Police',
        30 // default 10 * 3
      );
    });

    it('should use limit from mood translator for mood mode', async () => {
      await getRecommendations({
        mode: 'mood',
        moodDescription: 'chill vibes',
      });

      // The mood translator mock returns limit: 25
      const callArgs = vi.mocked(smartPlaylistEvaluator.evaluateSmartPlaylistRules).mock.calls[0][0];
      expect(callArgs.limit).toBe(25);
    });

    it('should handle empty exclude arrays', async () => {
      const result = await getRecommendations({
        mode: 'similar',
        currentSong: { artist: 'Radiohead', title: 'Karma Police' },
        excludeSongIds: [],
        excludeArtists: [],
        limit: 5,
      });

      expect(result.songs.length).toBeGreaterThan(0);
    });

    it('should handle fallback error gracefully', async () => {
      vi.spyOn(lastfm, 'getLastFmClient').mockReturnValue(null);
      vi.spyOn(navidrome, 'getSongsGlobal').mockRejectedValue(new Error('DB Error'));

      const result = await getRecommendations({
        mode: 'similar',
        currentSong: { artist: 'Radiohead', title: 'Karma Police' },
        limit: 5,
      });

      expect(result.songs).toHaveLength(0);
      expect(result.source).toBe('fallback');
      expect(result.metadata?.fallbackReason).toContain('fallback_failed');
    });
  });
});
