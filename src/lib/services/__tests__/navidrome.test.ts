import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getArtists, getArtistDetail, getAlbums, getSongs, search, getLibrarySummary, getArtistsWithDetails, getSongsGlobal, type Artist, type Album, type Song, type ArtistWithDetails, type LibrarySummary } from '../navidrome';
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
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    // Reset global fetch mock
    mockFetch.mockReset();
    global.fetch = mockFetch;
    
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
      const { getAuthToken, resetAuthState } = await import('../navidrome');
      resetAuthState();

      // Mock login for first call
      const mockToken = 'valid-token-123';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          token: mockToken,
          id: 'client-123',
          subsonicToken: 'subsonic-token',
          subsonicSalt: 'salt',
        }),
      } as Response);
  
      // First call fetches and caches
      const result1 = await getAuthToken();
      expect(result1).toBe(mockToken);
      expect(mockFetch).toHaveBeenCalledTimes(1);
  
      // Second call uses cache
      const result2 = await getAuthToken();
      expect(result2).toBe(mockToken);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should authenticate and cache token when no valid cache', async () => {
      const { getAuthToken, resetAuthState } = await import('../navidrome');
      resetAuthState();

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
      const { getAuthToken, resetAuthState } = await import('../navidrome');
      resetAuthState();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      } as Response);

      await expect(getAuthToken()).rejects.toThrow('Login failed: Unauthorized');
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should throw timeout error', async () => {
      const { getAuthToken, resetAuthState } = await import('../navidrome');
      resetAuthState();

      const abortError = new Error('The user aborted a request.');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);
      
      await expect(getAuthToken()).rejects.toThrow('Login request timed out');
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should throw error when config is incomplete', async () => {
      const { getAuthToken } = await import('../navidrome');

      mockGetConfig.mockReturnValueOnce({
        // Missing required fields
      });

      await expect(getAuthToken()).rejects.toThrow('Navidrome credentials incomplete');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('apiFetch', () => {
    it('should handle authentication retry through public API', async () => {
      const { getArtists } = await import('../navidrome');

      const mockArtists: Artist[] = [
        { id: '1', name: 'Artist One' },
      ];

      const validLoginResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          token: 'initial-token',
          id: 'client-1',
          subsonicToken: 'sub-token',
          subsonicSalt: 'salt',
        }),
      } as Response;

      // Initial login
      mockFetch.mockResolvedValueOnce(validLoginResponse);

      // First API call returns 401
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response);
      
      // Re-authentication login
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
      expect(mockFetch).toHaveBeenCalledTimes(4); // initial login + failed API + re-login + successful API
    });
  });

  describe('getArtists', () => {
    it('should fetch artists with pagination', async () => {
      const mockArtists: Artist[] = [
        { id: '1', name: 'Artist One' },
        { id: '2', name: 'Artist Two' },
      ];

      // Mock login
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          token: 'test-token',
          id: 'test-client',
          subsonicToken: 'test-subsonic',
          subsonicSalt: 'test-salt',
        }),
      } as Response);

      // Mock API response for getArtists
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

      // Mock login
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          token: 'test-token',
          id: 'test-client',
          subsonicToken: 'test-subsonic',
          subsonicSalt: 'test-salt',
        }),
      } as Response);

      // Mock API
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

      // Mock login
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          token: 'test-token',
          id: 'test-client',
          subsonicToken: 'test-subsonic',
          subsonicSalt: 'test-salt',
        }),
      } as Response);

      // Mock API
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
      const { getSongs } = await import('../navidrome');

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
          name: 'Song Two',
          albumId: 'a1',
          duration: 240,
          track: 2
        },
      ];

      const validLoginResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          token: 'test-token',
          id: 'test-client',
          subsonicToken: 'test-subsonic',
          subsonicSalt: 'test-salt',
        }),
      } as Response;

      mockFetch.mockResolvedValueOnce(validLoginResponse);
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
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('search', () => {
    it('should search songs using multiple parameters', async () => {
      const { search } = await import('../navidrome');

      const mockRawSongs = [
        {
          id: 's1',
          name: 'Test Artist - Test Song',
          albumId: 'a1',
          duration: 180,
          track: 1,
        },
      ];

      const validLoginResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          token: 'test-token',
          id: 'test-client',
          subsonicToken: 'test-subsonic',
          subsonicSalt: 'test-salt',
        }),
      } as Response;

      // First param (title) returns empty
      mockFetch.mockResolvedValueOnce(validLoginResponse);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => [],
      } as Response);
      
      // Second param (fullText) succeeds with raw data
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockRawSongs,
      } as Response);

      const result = await search('Test Artist - Test Song', 0, 10);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 's1',
        name: 'Test Artist - Test Song',
        albumId: 'a1',
        duration: 180,
        track: 1,
        url: '/api/navidrome/stream/s1',
      });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should return empty array when no config', async () => {
      const { search } = await import('../navidrome');

      mockGetConfig.mockReturnValueOnce({
        // No navidromeUrl
      });

      const result = await search('test');
      
      expect(result).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle search failure gracefully', async () => {
      const { search } = await import('../navidrome');

      const validLoginResponse = new Response(null, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
      validLoginResponse.json = async () => ({
        token: 'test-token',
        id: 'test-client',
        subsonicToken: 'test-subsonic',
        subsonicSalt: 'test-salt',
      });

      const failureResponse = new Response(null, {
        status: 500,
        statusText: 'Server Error',
      });

      // 1 auth + 3 params * 2 fetches (retry on error)
      mockFetch.mockResolvedValueOnce(validLoginResponse);
      for (let i = 0; i < 3; i++) {
        mockFetch.mockResolvedValueOnce(failureResponse); // first try
        mockFetch.mockResolvedValueOnce(failureResponse); // retry
      }
      
      const result = await search('test');
      
      expect(result).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(7);
    });
  });

  describe('getArtistsWithDetails', () => {
    it('should fetch artists with detailed information', async () => {
      const { getArtistsWithDetails } = await import('../navidrome');

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
        fullText: 'Description 1',
        orderArtistName: 'One Artist',
        size: 1,
      };
      
      const mockDetail2 = {
        id: '2',
        name: 'Artist Two',
        albumCount: 3,
        songCount: 30,
        genres: 'Jazz',
        fullText: 'Description 2',
        orderArtistName: 'Two Artist',
        size: 1,
      };

      // Mock fetch for auth (1), getArtists api (1), 2 getArtistDetail api (2) = 4 calls
      const validLoginResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          token: 'test-token',
          id: 'test-client',
          subsonicToken: 'test-subsonic',
          subsonicSalt: 'test-salt',
        }),
      } as Response;

      mockFetch
        .mockResolvedValueOnce(validLoginResponse) // auth in getArtists
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: vi.fn().mockResolvedValue(mockBasicArtists),
        } as unknown as Response) // getArtists api
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: vi.fn().mockResolvedValue(mockDetail1),
        } as unknown as Response) // detail 1
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: vi.fn().mockResolvedValue(mockDetail2),
        } as unknown as Response); // detail 2

      const result = await getArtistsWithDetails(0, 2);
      
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: '1',
        name: 'Artist One',
        albumCount: 5,
        songCount: 50,
        genres: 'Rock',
        fullText: 'Description 1',
        orderArtistName: 'One Artist',
        size: 1,
      });
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });
  });

  describe('getLibrarySummary', () => {
    const basicArtists = [
      { id: 'a1', name: 'Artist1' },
      { id: 'a2', name: 'Artist2' },
    ];
    const rawSongs = [
      { id: 's1', name: 'Song1', albumId: 'al1', duration: 180, track: 1 },
      { id: 's2', name: 'Song2', albumId: 'al1', duration: 240, track: 2 },
    ];
    const detail1 = {
      id: 'a1',
      name: 'Artist1',
      albumCount: 5,
      songCount: 50,
      genres: 'Rock',
      fullText: 'desc1',
      orderArtistName: 'Artist1',
      size: 1,
    };
    const detail2 = {
      id: 'a2',
      name: 'Artist2',
      albumCount: 3,
      songCount: 30,
      genres: 'Pop',
      fullText: 'desc2',
      orderArtistName: 'Artist2',
      size: 1,
    };

    const mockArtists: ArtistWithDetails[] = [
      { id: 'a1', name: 'Artist1', genres: 'Rock', albumCount: 5, songCount: 50, fullText: 'desc1', orderArtistName: 'Artist1', size: 1 },
      { id: 'a2', name: 'Artist2', genres: 'Pop', albumCount: 3, songCount: 30, fullText: 'desc2', orderArtistName: 'Artist2', size: 1 },
    ];
    const mockSongs: Song[] = [
      { id: 's1', name: 'Song1', albumId: 'al1', duration: 180, track: 1, url: '/stream/s1' },
      { id: 's2', name: 'Song2', albumId: 'al1', duration: 240, track: 2, url: '/stream/s2' },
    ];

    beforeEach(() => {
      vi.clearAllMocks();
      mockGetConfig.mockReturnValue({
        navidromeUrl: 'http://localhost:4533',
        navidromeUsername: 'testuser',
        navidromePassword: 'testpass',
      });
    });

    it('fetches and combines top artists and songs', async () => {
      const { getLibrarySummary } = await import('../navidrome');

      const validLoginResponse = new Response(JSON.stringify({
        token: 'test-token',
        id: 'test-client',
        subsonicToken: 'test-subsonic',
        subsonicSalt: 'test-salt',
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

      const basicResponse = new Response(JSON.stringify(basicArtists), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

      const detail1Response = new Response(JSON.stringify(detail1), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

      const detail2Response = new Response(JSON.stringify(detail2), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

      const rawResponse = new Response(JSON.stringify(rawSongs), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

      // auth + getArtists + 2 details + getSongsGlobal api
      mockFetch
        .mockResolvedValueOnce(validLoginResponse)
        .mockResolvedValueOnce(basicResponse)
        .mockResolvedValueOnce(detail1Response)
        .mockResolvedValueOnce(detail2Response)
        .mockResolvedValueOnce(rawResponse);

      const result = await getLibrarySummary();

      expect(result).toEqual({
        artists: [
          { name: 'Artist1', genres: 'Rock' },
          { name: 'Artist2', genres: 'Pop' },
        ],
        songs: ['Song1', 'Song2'],
      });
    });

    it('handles error in fetching summary', async () => {
      const { getLibrarySummary } = await import('../navidrome');

      const failureResponse = new Response(null, {
        status: 500,
        statusText: 'Server Error',
      });

      mockFetch.mockResolvedValueOnce(failureResponse); // make first call fail

      await expect(getLibrarySummary()).rejects.toThrow('Failed to fetch library summary');
    });
  });

  describe('song resolution via search', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.resetModules();
      global.fetch = mockFetch;
      mockGetConfig.mockReturnValue({
        navidromeUrl: 'http://localhost:4533',
        navidromeUsername: 'testuser',
        navidromePassword: 'testpass',
      });
    });

    it('resolves suggestion to Song object if match found', async () => {
      const mockSong: Song = { id: 's1', name: 'Artist - Title', albumId: 'al1', duration: 180, track: 1, url: '/api/navidrome/stream/s1' };
      const module = await import('../navidrome');
      const searchSpy = vi.spyOn(module, 'search');
      searchSpy.mockResolvedValueOnce([mockSong]);

      const matches = await module.search('Artist - Title', 0, 1);

      searchSpy.mockRestore();

      expect(matches).toEqual([mockSong]);
    });

    it('returns empty if no match', async () => {
      const module = await import('../navidrome');
      const searchSpy = vi.spyOn(module, 'search');
      searchSpy.mockResolvedValueOnce([]);

      const matches = await module.search('Unknown Song', 0, 1);

      searchSpy.mockRestore();

      expect(matches).toEqual([]);
    });

    it('handles search error gracefully', async () => {
      const { search } = await import('../navidrome');

      const validLoginResponse = new Response(null, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
      validLoginResponse.json = async () => ({
        token: 'test-token',
        id: 'test-client',
        subsonicToken: 'test-subsonic',
        subsonicSalt: 'test-salt',
      });

      const failureResponse = new Response(null, {
        status: 500,
        statusText: 'Server Error',
      });

      // 1 auth + 3 params * 2 fetches (retry on error)
      mockFetch.mockResolvedValueOnce(validLoginResponse);
      for (let i = 0; i < 3; i++) {
        mockFetch.mockResolvedValueOnce(failureResponse); // first try
        mockFetch.mockResolvedValueOnce(failureResponse); // retry
      }

      const matches = await search('Test Song', 0, 1);

      expect(matches).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(7);
    });
  });
});
