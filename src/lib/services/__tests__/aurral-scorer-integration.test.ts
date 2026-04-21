/**
 * Tests for Aurral Integration in Blended Recommendation Scorer
 *
 * Verifies that:
 * - Aurral similar artists are gathered as candidates
 * - Genre enrichment from Aurral cache works
 * - Scoring boosts apply when both Last.fm and Aurral agree
 * - Feature flag disables Aurral integration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all external dependencies
vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: vi.fn().mockImplementation((cb) => cb([])),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockResolvedValue(undefined),
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/lib/config/config', () => ({
  getConfigAsync: vi.fn().mockResolvedValue({
    lastfmApiKey: 'test-key',
    aurralUrl: 'http://localhost:3005',
    aurralUsername: 'test',
    aurralPassword: 'test',
  }),
}));

vi.mock('../navidrome', () => ({
  search: vi.fn().mockResolvedValue([]),
  getRandomSongs: vi.fn().mockResolvedValue([]),
}));

vi.mock('../lastfm', () => ({
  getLastFmClient: vi.fn().mockReturnValue({
    getSimilarTracksRaw: vi.fn().mockResolvedValue([]),
    getSimilarArtistsRaw: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock('../compound-scoring', () => ({
  getCompoundScoreBoosts: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock('../skip-scoring', () => ({
  calculateSkipScores: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock('../dj-match-scorer', () => ({
  calculateDJScore: vi.fn().mockReturnValue({ totalScore: 0.5 }),
  enrichSongsWithDJMetadata: vi.fn().mockImplementation((songs) => songs),
}));

vi.mock('../time-based-discovery', () => ({
  getCurrentTimeContext: vi.fn().mockReturnValue({
    hour: 14,
    dayOfWeek: 3,
    isWeekend: false,
    timeSlot: 'afternoon',
  }),
}));

vi.mock('../seasonal-patterns', () => ({
  getCurrentSeasonalPattern: vi.fn().mockResolvedValue(null),
}));

vi.mock('../genre-hierarchy', () => ({
  normalizeGenre: vi.fn().mockImplementation((g: string) => g?.toLowerCase() || ''),
  getGenreSimilarity: vi.fn().mockReturnValue(0.5),
}));

// Mock Aurral with controllable behavior
const mockGetCachedSimilarArtistNames = vi.fn().mockResolvedValue([]);
const mockGetCachedArtistGenresAndTags = vi.fn().mockResolvedValue({ genres: [], tags: [] });

vi.mock('../aurral', () => ({
  getCachedSimilarArtistNames: (...args: unknown[]) => mockGetCachedSimilarArtistNames(...args),
  getCachedArtistGenresAndTags: (...args: unknown[]) => mockGetCachedArtistGenresAndTags(...args),
}));

// Mock feature flags
const mockFeatureFlags = {
  hlsStreaming: { enabled: false, fallbackOnError: true },
  serverPlaybackState: { enabled: false, syncInterval: 5000 },
  jukeboxMode: { enabled: false, allowMultipleDevices: true, showDeviceSelector: false },
  aurralRecommendations: { enabled: true, similarArtistWeight: 0.9, genreBoostWeight: 0.15 },
};

vi.mock('@/lib/config/features', () => ({
  getFeatureFlags: () => mockFeatureFlags,
}));

import { gatherCandidates, SCORE_WEIGHTS } from '../blended-recommendation-scorer';
import { search } from '../navidrome';
import type { Song } from '@/lib/types/song';

function makeSong(overrides: Partial<Song> = {}): Song {
  return {
    id: `song-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Test Song',
    title: 'Test Song',
    artist: 'Test Artist',
    album: 'Test Album',
    albumId: 'album-1',
    duration: 240,
    genre: 'rock',
    url: '/api/navidrome/stream/test',
    track: 1,
    year: 2020,
    ...overrides,
  } as Song;
}

describe('Aurral Integration in Blended Scorer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFeatureFlags.aurralRecommendations.enabled = true;
  });

  describe('gatherCandidates with Aurral', () => {
    it('should gather candidates from Aurral similar artists', async () => {
      // Aurral returns similar artists
      mockGetCachedSimilarArtistNames.mockResolvedValue([
        { name: 'Similar Band A', score: 0.9 },
        { name: 'Similar Band B', score: 0.8 },
      ]);

      // Navidrome search finds songs for those artists
      const songA = makeSong({ id: 'aurral-1', artist: 'Similar Band A', title: 'Song A' });
      const songB = makeSong({ id: 'aurral-2', artist: 'Similar Band B', title: 'Song B' });

      (search as ReturnType<typeof vi.fn>).mockImplementation(async (query: string) => {
        if (query.toLowerCase().includes('similar band a')) return [songA];
        if (query.toLowerCase().includes('similar band b')) return [songB];
        return [];
      });

      const candidates = await gatherCandidates(
        { artist: 'Radiohead', title: 'Creep', genre: 'rock' },
        {}
      );

      // Should have found songs from Aurral similar artists
      expect(candidates.size).toBeGreaterThanOrEqual(1);

      // Check that at least one candidate has aurral_similar source
      const hasAurralSource = [...candidates.values()].some(
        (c) => c.sources.some((s) => s.source === 'aurral_similar')
      );
      expect(hasAurralSource).toBe(true);
    });

    it('should not gather Aurral candidates when feature flag is disabled', async () => {
      mockFeatureFlags.aurralRecommendations.enabled = false;

      mockGetCachedSimilarArtistNames.mockResolvedValue([
        { name: 'Similar Band A', score: 0.9 },
      ]);

      await gatherCandidates(
        { artist: 'Radiohead', title: 'Creep', genre: 'rock' },
        {}
      );

      // Should not have called Aurral cache
      expect(mockGetCachedSimilarArtistNames).not.toHaveBeenCalled();
    });

    it('should enrich target genres with Aurral cached genres', async () => {
      mockGetCachedArtistGenresAndTags.mockResolvedValue({
        genres: ['art rock', 'electronic', 'experimental'],
        tags: [
          { name: 'alternative', count: 100 },
          { name: 'british', count: 30 }, // below threshold
        ],
      });

      await gatherCandidates(
        { artist: 'Radiohead', title: 'Creep', genre: 'rock' },
        {}
      );

      // Should have called Aurral for genre enrichment
      expect(mockGetCachedArtistGenresAndTags).toHaveBeenCalledWith('Radiohead');
    });

    it('should exclude artists from Aurral candidates', async () => {
      mockGetCachedSimilarArtistNames.mockResolvedValue([
        { name: 'Excluded Artist', score: 0.95 },
        { name: 'Included Artist', score: 0.80 },
      ]);

      const includedSong = makeSong({ id: 'inc-1', artist: 'Included Artist' });
      (search as ReturnType<typeof vi.fn>).mockImplementation(async (query: string) => {
        if (query.toLowerCase().includes('included artist')) return [includedSong];
        if (query.toLowerCase().includes('excluded artist')) {
          return [makeSong({ id: 'exc-1', artist: 'Excluded Artist' })];
        }
        return [];
      });

      const candidates = await gatherCandidates(
        { artist: 'Radiohead', title: 'Creep', genre: 'rock' },
        { excludeArtists: ['Excluded Artist'] }
      );

      // The excluded artist's songs should not appear
      const hasExcluded = [...candidates.values()].some(
        (c) => c.song.artist === 'Excluded Artist'
      );
      expect(hasExcluded).toBe(false);
    });

    it('should handle empty Aurral cache gracefully', async () => {
      mockGetCachedSimilarArtistNames.mockResolvedValue([]);
      mockGetCachedArtistGenresAndTags.mockResolvedValue({ genres: [], tags: [] });

      // Should not throw
      const candidates = await gatherCandidates(
        { artist: 'Unknown Artist', title: 'Unknown Song', genre: 'rock' },
        {}
      );

      expect(candidates).toBeDefined();
    });

    it('should handle Aurral cache errors gracefully', async () => {
      mockGetCachedSimilarArtistNames.mockRejectedValue(new Error('DB error'));
      mockGetCachedArtistGenresAndTags.mockRejectedValue(new Error('DB error'));

      // Should not throw — errors caught internally
      const candidates = await gatherCandidates(
        { artist: 'Radiohead', title: 'Creep', genre: 'rock' },
        {}
      );

      expect(candidates).toBeDefined();
    });
  });

  describe('Score weights', () => {
    it('should have weights summing to 1.0', () => {
      const total = Object.values(SCORE_WEIGHTS).reduce((sum, w) => sum + w, 0);
      expect(total).toBeCloseTo(1.0, 5);
    });

    it('should include aurral_similar in candidate source types', () => {
      // Type check — this is a compile-time test that aurral_similar is valid
      const source: import('../blended-recommendation-scorer').CandidateSourceType = 'aurral_similar';
      expect(source).toBe('aurral_similar');
    });
  });
});
