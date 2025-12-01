/**
 * Last.fm Client Tests
 * Story 7.2: Last.fm Integration for Discovery Mode
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LastFmClient } from '../client';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock navidrome search
vi.mock('../../navidrome', () => ({
  search: vi.fn().mockResolvedValue([]),
}));

describe('LastFmClient', () => {
  let client: LastFmClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new LastFmClient({ apiKey: 'test-api-key' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create client with API key', () => {
      expect(client).toBeDefined();
    });

    it('should use default cache TTL', () => {
      const stats = client.getCacheStats();
      expect(stats.entries).toBe(0);
    });
  });

  describe('getSimilarTracks', () => {
    it('should fetch similar tracks from Last.fm API', async () => {
      const mockResponse = {
        similartracks: {
          track: [
            {
              name: 'Similar Song',
              artist: { name: 'Similar Artist', url: 'http://last.fm/artist' },
              url: 'http://last.fm/track',
              match: 0.95,
            },
          ],
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.getSimilarTracks('Test Artist', 'Test Track');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('method=track.getsimilar')
      );
      // URLSearchParams uses + for spaces
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('artist=Test+Artist')
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('track=Test+Track')
      );
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Similar Song');
      expect(result[0].artist).toBe('Similar Artist');
    });

    it('should cache results', async () => {
      const mockResponse = {
        similartracks: {
          track: [
            {
              name: 'Cached Song',
              artist: { name: 'Cached Artist', url: 'http://last.fm/artist' },
              url: 'http://last.fm/track',
            },
          ],
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      // First call
      await client.getSimilarTracks('Artist', 'Track');
      // Second call should use cache
      await client.getSimilarTracks('Artist', 'Track');

      // Should only call fetch once due to caching
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should handle empty results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ similartracks: { track: [] } }),
      });

      const result = await client.getSimilarTracks('Unknown', 'Track');
      expect(result).toHaveLength(0);
    });
  });

  describe('getSimilarArtists', () => {
    it('should fetch similar artists from Last.fm API', async () => {
      const mockResponse = {
        similarartists: {
          artist: [
            {
              name: 'Similar Artist',
              url: 'http://last.fm/artist',
              match: 0.85,
            },
          ],
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.getSimilarArtists('Test Artist');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('method=artist.getsimilar')
      );
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Similar Artist');
      expect(result[0].match).toBe(0.85);
    });
  });

  describe('getTopTracks', () => {
    it('should fetch top tracks for an artist', async () => {
      const mockResponse = {
        toptracks: {
          track: [
            {
              name: 'Top Song',
              artist: { name: 'Artist', url: 'http://last.fm/artist' },
              url: 'http://last.fm/track',
              playcount: 1000000,
            },
          ],
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.getTopTracks('Test Artist', 5);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('method=artist.gettoptracks')
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=5')
      );
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Top Song');
    });
  });

  describe('searchTracks', () => {
    it('should search for tracks by query', async () => {
      const mockResponse = {
        results: {
          trackmatches: {
            track: [
              {
                name: 'Found Song',
                artist: 'Found Artist',
                url: 'http://last.fm/track',
              },
            ],
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.searchTracks('test query');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('method=track.search')
      );
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Found Song');
    });
  });

  describe('error handling', () => {
    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ error: 10, message: 'Invalid API key' }),
      });

      await expect(client.getSimilarTracks('Artist', 'Track')).rejects.toMatchObject({
        code: 'INVALID_API_KEY',
      });
    });

    it('should handle rate limiting', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Map([['Retry-After', '60']]),
      });

      await expect(client.getSimilarTracks('Artist', 'Track')).rejects.toMatchObject({
        code: 'RATE_LIMITED',
      });
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(client.getSimilarTracks('Artist', 'Track')).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
      });
    });

    it('should handle server errors and mark service unavailable', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: new Map(),
      });

      await expect(client.getSimilarTracks('Artist', 'Track')).rejects.toMatchObject({
        code: 'SERVICE_UNAVAILABLE',
      });

      // Service should be marked unavailable
      expect(client.isServiceAvailable()).toBe(false);
    });
  });

  describe('testConnection', () => {
    it('should return true on successful connection', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            toptracks: { track: [{ name: 'Test', artist: { name: 'Artist' } }] },
          }),
      });

      const result = await client.testConnection();
      expect(result).toBe(true);
    });

    it('should return false on failed connection', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection failed'));

      const result = await client.testConnection();
      expect(result).toBe(false);
    });
  });

  describe('cache management', () => {
    it('should clear cache when requested', async () => {
      const mockResponse = {
        similartracks: {
          track: [{ name: 'Song', artist: { name: 'Artist' }, url: 'http://test' }],
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await client.getSimilarTracks('Artist', 'Track');
      expect(client.getCacheStats().entries).toBe(1);

      client.clearCache();
      expect(client.getCacheStats().entries).toBe(0);
    });

    it('should return cache statistics', async () => {
      const stats = client.getCacheStats();
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('entries');
    });
  });

  describe('rate limiting', () => {
    it('should respect rate limits with multiple requests', async () => {
      const mockResponse = {
        similartracks: { track: [] },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      // Make multiple rapid requests
      const promises = [];
      for (let i = 0; i < 3; i++) {
        promises.push(client.getSimilarTracks(`Artist${i}`, `Track${i}`));
      }

      const results = await Promise.all(promises);
      expect(results).toHaveLength(3);
      // All requests should complete without errors
    });
  });
});

describe('artist name extraction', () => {
  let client: LastFmClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new LastFmClient({ apiKey: 'test-api-key' });
  });

  it('should handle artist as object', async () => {
    const mockResponse = {
      similartracks: {
        track: [
          {
            name: 'Song',
            artist: { name: 'Object Artist', url: 'http://last.fm' },
            url: 'http://last.fm/track',
          },
        ],
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await client.getSimilarTracks('Artist', 'Track');
    expect(result[0].artist).toBe('Object Artist');
  });

  it('should handle artist as string', async () => {
    const mockResponse = {
      results: {
        trackmatches: {
          track: [
            {
              name: 'Song',
              artist: 'String Artist',
              url: 'http://last.fm/track',
            },
          ],
        },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await client.searchTracks('query');
    expect(result[0].artist).toBe('String Artist');
  });
});
