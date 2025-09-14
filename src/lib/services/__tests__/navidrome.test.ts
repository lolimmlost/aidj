import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getArtists, getArtistDetail, getAlbums, getSongs, search, getAuthToken, getArtistsWithDetails, type Artist, type Album } from '../navidrome';
import { getConfig } from '@/lib/config/config';

// Mock the config module
vi.mock('@/lib/config/config', () => ({
  getConfig: vi.fn(),
}));

const mockGetConfig = getConfig as unknown as ReturnType<typeof vi.fn>;

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Navidrome Service Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset global fetch mock
    mockFetch.mockReset();
    
    // Mock config with valid Navidrome settings
    mockGetConfig.mockReturnValue({
      navidromeUrl: 'http://localhost:4533',
      navidromeUsername: 'testuser',
      navidromePassword: 'testpass',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getAuthToken', () => {
    it('should return cached token when valid', async () => {
      const mockToken = 'valid-token-123';
      // Set up cached token state (in real tests, we'd need to mock the module state)
      vi.doMock('../navidrome', () => {
        const original = vi.importActual('../navidrome');
        return {
          ...original,
          token: mockToken,
          clientId: 'client-123',
          subsonicToken: 'subsonic-token',
          subsonicSalt: 'salt',
          tokenExpiry: Date.now() + 10 * 60 * 1000, // Valid for 10 minutes
        };
      });

      const result = await getAuthToken();
      
      expect(result).toBe(mockToken);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should authenticate and cache token when no valid cache', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          token: 'new-token-456',
          id: 'client-456',
          subsonicToken: 'new-subsonic-token',
          subsonicSalt: 'new-salt',
        }),
      } as Response);

      const result = await getAuthToken();
      
      expect(result).toBe('new-token-456');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4533/auth/login',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: 'testuser',
            password: 'testpass',
          }),
        }),
      );
    });

    it('should throw error on login failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      } as Response);

      await expect(getAuthToken()).rejects.toThrow('Login failed: Unauthorized');
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should throw timeout error', async () => {
      mockFetch.mockRejectedValueOnce(new DOMException('The user aborted a request.', 'AbortError'));
      
      await expect(getAuthToken()).rejects.toThrow('Login request timed out');
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should throw error when config is incomplete', async () => {
      mockGetConfig.mockReturnValueOnce({
        // Missing required fields
      });

      await expect(getAuthToken()).rejects.toThrow('Navidrome credentials incomplete');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('apiFetch', () => {
    it('should handle authentication retry through public API', async () => {
      const mockArtists: Artist[] = [
        { id: '1', name: 'Artist One' },
      ];
      
      // First getAuthToken call (for initial request)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          token: 'initial-token',
          id: 'client-1',
          subsonicToken: 'sub-token',
          subsonicSalt: 'salt',
        }),
      } as Response);
      
      // First API call returns 401
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response);
      
      // Re-authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          token: 'refreshed-token',
          id: 'client-1',
          subsonicToken: 'sub-token',
          subsonicSalt: 'salt',
        }),
      } as Response);
      
      // Second API call succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockArtists,
      } as Response);

      const result = await getArtists(0, 10);
      
      expect(result).toEqual(mockArtists);
      expect(mockFetch).toHaveBeenCalledTimes(4); // login + failed API + re-login + successful API
    });
  });

  describe('getArtists', () => {
    it('should fetch artists with pagination', async () => {
      const mockArtists: Artist[] = [
        { id: '1', name: 'Artist One' },
        { id: '2', name: 'Artist Two' },
      ];
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockArtists,
      } as Response);

      const result = await getArtists(10, 5);
      
      expect(result).toEqual(mockArtists);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4533/api/artist?_start=10&_end=14',
        expect.any(Object),
      );
    });

    it('should return empty array on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      
      const result = await getArtists();
      
      expect(result).toEqual([]);
    });
  });

  describe('getArtistDetail', () => {
    it('should fetch artist detail successfully', async () => {
      const mockDetail = {
        id: '1',
        name: 'Test Artist',
        albumCount: 10,
        songCount: 100,
        genres: 'Rock',
        fullText: 'Test Artist description',
      };
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockDetail,
      } as Response);

      const result = await getArtistDetail('1');
      
      expect(result).toEqual(mockDetail);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4533/api/artist/1',
        expect.any(Object),
      );
    });
  });

  describe('getAlbums', () => {
    it('should fetch albums for artist', async () => {
      const mockAlbums: Album[] = [
        { id: 'a1', name: 'Album One', artistId: '1', year: 2020 },
        { id: 'a2', name: 'Album Two', artistId: '1' },
      ];
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockAlbums,
      } as Response);

      const result = await getAlbums('1', 0, 10);
      
      expect(result).toEqual(mockAlbums);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4533/api/album?artist_id=1&_start=0&_end=9',
        expect.any(Object),
      );
    });
  });

  describe('getSongs', () => {
    it('should fetch songs for album with streaming URLs', async () => {
      const mockRawSongs = [
        { 
          id: 's1', 
          name: 'Song One', 
          albumId: 'a1', 
          duration: 180, 
          track: 1 
        },
        { 
          id: 's2', 
          title: 'Song Two', 
          albumId: 'a1', 
          duration: 240, 
          trackNumber: 2 
        },
      ];
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockRawSongs,
      } as Response);

      const result = await getSongs('a1');
      
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 's1',
        name: 'Song One',
        albumId: 'a1',
        duration: 180,
        track: 1,
        url: '/api/navidrome/stream/s1',
      });
      expect(result[1]).toEqual({
        id: 's2',
        name: 'Song Two',
        albumId: 'a1',
        duration: 240,
        track: 2,
        url: '/api/navidrome/stream/s2',
      });
    });
  });

  describe('search', () => {
    it('should search songs using multiple parameters', async () => {
      const mockSongs = [
        { 
          id: 's1', 
          name: 'Test Song', 
          albumId: 'a1', 
          duration: 180, 
          track: 1 
        },
      ];
      
      // First param (title) fails
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => [],
      } as Response);
      
      // Second param (fullText) succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockSongs,
      } as Response);

      const result = await search('test query', 0, 10);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 's1',
        name: 'Test Song',
        albumId: 'a1',
        duration: 180,
        track: 1,
        url: '/api/navidrome/stream/s1',
      });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should return empty array when no config', async () => {
      mockGetConfig.mockReturnValueOnce({
        // No navidromeUrl
      });

      const result = await search('test');
      
      expect(result).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle search failure gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Search failed'));
      
      const result = await search('test');
      
      expect(result).toEqual([]);
    });
  });

  describe('getArtistsWithDetails', () => {
    it('should fetch artists with detailed information', async () => {
      const mockBasicArtists: Artist[] = [
        { id: '1', name: 'Artist One' },
        { id: '2', name: 'Artist Two' },
      ];
      
      const mockDetail1 = {
        id: '1',
        name: 'Artist One',
        albumCount: 5,
        songCount: 50,
        genres: 'Rock',
      };
      
      const mockDetail2 = {
        id: '2',
        name: 'Artist Two',
        albumCount: 3,
        songCount: 30,
        genres: 'Jazz',
      };
      
      // Mock getArtists
      // Mock getArtists call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockBasicArtists,
      } as Response);
      
      // Mock getArtistDetail calls (these use apiFetch internally)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockDetail1,
      } as Response);
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockDetail2,
      } as Response);

      const result = await getArtistsWithDetails(0, 2);
      
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: '1',
        name: 'Artist One',
        albumCount: 5,
        songCount: 50,
        genres: 'Rock',
        fullText: expect.any(String),
        orderArtistName: expect.any(String),
        size: expect.any(Number),
      });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });
});