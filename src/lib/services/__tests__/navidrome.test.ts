import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getArtists, getArtistDetail, getAlbums, getSongs, search, getTopSongs, getLibrarySummary, getArtistsWithDetails, getSongsGlobal, type Artist, type Album, type Song, type ArtistWithDetails, type LibrarySummary, type SubsonicSong, type RawSong } from '../navidrome';
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
        navidromeUrl: 'http://localhost:4533', // URL provided, but credentials missing
        // Missing navidromeUsername and navidromePassword
      });

      await expect(getAuthToken()).rejects.toThrow('Navidrome credentials incomplete');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('apiFetch', () => {
    it('should handle authentication retry through public API', async () => {
      const { getArtists, resetAuthState } = await import('../navidrome');
      resetAuthState();

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
    it('should search songs using Subsonic endpoint', async () => {
      const { search } = await import('../navidrome');

      const mockSubsonicResponse = {
        searchResult: {
          song: [
            {
              id: 's1',
              title: 'Test Artist - Test Song',
              artist: 'Test Artist',
              albumId: 'a1',
              artistId: 'art1',
              album: 'Test Album',
              duration: '180',
              track: '1',
            },
          ],
        },
      };

      const validLoginResponse = new Response(JSON.stringify({
        token: 'test-token',
        id: 'test-client',
        subsonicToken: 'test-subsonic',
        subsonicSalt: 'test-salt',
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

      const emptyArtistResponse = new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

      const subsonicResponse = new Response(JSON.stringify(mockSubsonicResponse), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

      const emptyAlbumResponse = new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

      mockFetch
        .mockResolvedValueOnce(validLoginResponse) // auth
        .mockResolvedValueOnce(subsonicResponse); // subsonic (called FIRST, not last!)

      const result = await search('Test Artist - Test Song', 0, 10);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 's1',
        name: 'Test Artist - Test Song',
        title: 'Test Artist - Test Song',
        artist: 'Test Artist',
        albumId: 'a1',
        artistId: 'art1',
        album: 'Test Album',
        duration: 180,
        track: 1,
        trackNumber: 1,
        url: '/api/navidrome/stream/s1',
      });
      expect(mockFetch).toHaveBeenNthCalledWith(2,
        'http://localhost:4533/rest/search.view?query=Test%20Artist%20-%20Test%20Song&songCount=10&artistCount=0&albumCount=0&offset=0&u=test-client&t=test-subsonic&s=test-salt&f=json&c=MusicApp',
        expect.any(Object),
      );
      expect(mockFetch).toHaveBeenCalledTimes(2); // auth + subsonic
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

    it('should handle Subsonic search failure gracefully', async () => {
      const { search } = await import('../navidrome');

      const validLoginResponse = new Response(JSON.stringify({
        token: 'test-token',
        id: 'test-client',
        subsonicToken: 'test-subsonic',
        subsonicSalt: 'test-salt',
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

      const emptyArtistResponse = new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

      const failureResponse = new Response(null, {
        status: 500,
        statusText: 'Server Error',
      });

      const emptyAlbumResponse = new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

      mockFetch
        .mockResolvedValueOnce(validLoginResponse) // auth
        .mockResolvedValueOnce(failureResponse) // subsonic failure (called FIRST!)
        .mockResolvedValueOnce(emptyAlbumResponse) // empty albums (fallback)
        .mockResolvedValueOnce(emptyArtistResponse); // empty artists (fallback)

      const result = await search('test', 0, 50);

      expect(result).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(4); // auth + subsonic + album + artist
    });

    describe('Subsonic search endpoint', () => {
      beforeEach(() => {
        vi.clearAllMocks();
        mockGetConfig.mockReturnValue({
          navidromeUrl: 'http://localhost:4533',
          navidromeUsername: 'testuser',
          navidromePassword: 'testpass',
        });
      });

      it('should search songs using Subsonic /rest/search.view endpoint successfully', async () => {
        const { search } = await import('../navidrome');

        const mockSubsonicResponse = {
          searchResult: {
            song: [
              {
                id: 's1',
                title: 'Test Song',
                artist: 'Test Artist',
                albumId: 'a1',
                artistId: 'art1',
                album: 'Test Album',
                duration: '180',
                track: '1',
              },
            ],
          },
        };

        const validLoginResponse = new Response(JSON.stringify({
          token: 'test-token',
          id: 'test-client',
          subsonicToken: 'test-subsonic',
          subsonicSalt: 'test-salt',
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });

        const emptyArtistResponse = new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });

        const subsonicResponse = new Response(JSON.stringify(mockSubsonicResponse), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });

        const emptyAlbumResponse = new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });

        mockFetch
          .mockResolvedValueOnce(validLoginResponse) // auth
          .mockResolvedValueOnce(subsonicResponse); // search.view (called FIRST!)

        const result = await search('Test Song', 0, 1);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          id: 's1',
          name: 'Test Song',
          title: 'Test Song',
          artist: 'Test Artist',
          albumId: 'a1',
          artistId: 'art1',
          album: 'Test Album',
          duration: 180,
          track: 1,
          trackNumber: 1,
          url: '/api/navidrome/stream/s1',
        });
        expect(mockFetch).toHaveBeenNthCalledWith(2,
          'http://localhost:4533/rest/search.view?query=Test%20Song&songCount=1&artistCount=0&albumCount=0&offset=0&u=test-client&t=test-subsonic&s=test-salt&f=json&c=MusicApp',
          expect.any(Object),
        );
        expect(mockFetch).toHaveBeenCalledTimes(2); // auth + subsonic
      });

      it('should return empty array for no search results with Subsonic endpoint', async () => {
        const { search } = await import('../navidrome');

        const mockEmptyResponse = {
          searchResult: {
            song: [],
          },
        };

        const validLoginResponse = new Response(JSON.stringify({
          token: 'test-token',
          id: 'test-client',
          subsonicToken: 'test-subsonic',
          subsonicSalt: 'test-salt',
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });

        const emptyResponse = new Response(JSON.stringify(mockEmptyResponse), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });

        const emptyAlbumResponse = new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });

        mockFetch
          .mockResolvedValueOnce(validLoginResponse)
          .mockResolvedValueOnce(emptyAlbumResponse)
          .mockResolvedValueOnce(emptyResponse);

        const result = await search('No Match', 0, 1);

        expect(result).toEqual([]);
      });

      it('should handle Subsonic search API error', async () => {
        const { search } = await import('../navidrome');

        const validLoginResponse = new Response(JSON.stringify({
          token: 'test-token',
          id: 'test-client',
          subsonicToken: 'test-subsonic',
          subsonicSalt: 'test-salt',
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });

        const emptyArtistResponse = new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });

        const errorResponse = new Response(null, {
          status: 500,
          statusText: 'Internal Server Error',
        });

        const emptyAlbumResponse = new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
  
        mockFetch
          .mockResolvedValueOnce(validLoginResponse) // auth
          .mockResolvedValueOnce(errorResponse) // subsonic error (called FIRST!)
          .mockResolvedValueOnce(emptyAlbumResponse) // empty albums (fallback)
          .mockResolvedValueOnce(emptyArtistResponse); // empty artists (fallback)

        const result = await search('Error Test', 0, 1);

        expect(result).toEqual([]);
        expect(mockFetch).toHaveBeenNthCalledWith(2, 'http://localhost:4533/rest/search.view?query=Error%20Test&songCount=1&artistCount=0&albumCount=0&offset=0&u=test-client&t=test-subsonic&s=test-salt&f=json&c=MusicApp', expect.any(Object));
      });
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
      const mockSong: Song = { id: 's1', name: 'Artist - Title', artist: 'Test Artist', albumId: 'al1', duration: 180, track: 1, url: '/api/navidrome/stream/s1' };
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

      const validLoginResponse = new Response(JSON.stringify({
        token: 'test-token',
        id: 'test-client',
        subsonicToken: 'test-subsonic',
        subsonicSalt: 'test-salt',
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

      const emptyArtistResponse = new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

      const failureResponse = new Response(null, {
        status: 500,
        statusText: 'Server Error',
      });

      mockFetch
        .mockResolvedValueOnce(validLoginResponse) // auth
        .mockResolvedValueOnce(failureResponse) // subsonic failure (called FIRST!)
        .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } })) // empty albums (fallback)
        .mockResolvedValueOnce(emptyArtistResponse); // empty artists (fallback)

      const matches = await search('Test Song', 0, 1);

      expect(matches).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(4); // auth + subsonic + album + artist
    });
  });
  
  describe('Enhanced Search with Album and Artist Prioritization', () => {
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

    it('should prioritize album search and fetch songs from albums', async () => {
      const { search } = await import('../navidrome');

      const mockAlbums: Album[] = [
        { id: 'al1', name: 'Uzi Album', artistId: 'art1', year: 2020 },
      ];

      const mockSongs: RawSong[] = [
        { id: 's1', name: 'Song1', albumId: 'al1', duration: 180, track: 1 },
        { id: 's2', name: 'Song2', albumId: 'al1', duration: 200, track: 2 },
      ];

      const validLoginResponse = new Response(JSON.stringify({
        token: 'test-token',
        id: 'test-client',
        subsonicToken: 'test-subsonic',
        subsonicSalt: 'test-salt',
      }), { status: 200, headers: { 'content-type': 'application/json' } });

      const emptySubsonicResponse = new Response(JSON.stringify({ searchResult: { song: [] } }), { status: 200, headers: { 'content-type': 'application/json' } });
      const albumResponse = new Response(JSON.stringify(mockAlbums), { status: 200, headers: { 'content-type': 'application/json' } });
      const songsResponse = new Response(JSON.stringify(mockSongs), { status: 200, headers: { 'content-type': 'application/json' } });

      mockFetch
        .mockResolvedValueOnce(validLoginResponse) // auth
        .mockResolvedValueOnce(emptySubsonicResponse) // subsonic search (called FIRST, returns empty)
        .mockResolvedValueOnce(albumResponse) // album search (fallback)
        .mockResolvedValueOnce(songsResponse); // songs from album

      const result = await search('uzi', 0, 50);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Song1');
      expect(result[1].name).toBe('Song2');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4533/api/album?name=uzi&_start=0&_end=10',
        expect.any(Object)
      );
    });

    it('should prioritize artist search when no albums found and fetch top songs', async () => {
      const module = await import('../navidrome');
      const { search } = module;

      const mockEmptyAlbums: Album[] = [];
      const mockArtists: Artist[] = [
        { id: 'art1', name: 'Lil Uzi Vert' },
        { id: 'art2', name: 'Uzi Artist' },
      ];

      const mockTopSongs1: SubsonicSong[] = [
        { id: 's1', title: 'Song1', artist: 'Lil Uzi Vert', albumId: 'a1', duration: '180', track: '1' },
      ];

      const mockTopSongs2: SubsonicSong[] = [
        { id: 's2', title: 'Song2', artist: 'Uzi Artist', albumId: 'a2', duration: '200', track: '1' },
      ];

      const validLoginResponse = new Response(JSON.stringify({
        token: 'test-token',
        id: 'test-client',
        subsonicToken: 'test-subsonic',
        subsonicSalt: 'test-salt',
      }), { status: 200, headers: { 'content-type': 'application/json' } });

      const emptySubsonicResponse = new Response(JSON.stringify({ searchResult: { song: [] } }), { status: 200, headers: { 'content-type': 'application/json' } });
      const emptyAlbumResponse = new Response(JSON.stringify(mockEmptyAlbums), { status: 200, headers: { 'content-type': 'application/json' } });
      const artistResponse = new Response(JSON.stringify(mockArtists), { status: 200, headers: { 'content-type': 'application/json' } });
      const topSongsResponse1 = new Response(JSON.stringify({ topSongs: { song: mockTopSongs1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
      const topSongsResponse2 = new Response(JSON.stringify({ topSongs: { song: mockTopSongs2 } }), { status: 200, headers: { 'content-type': 'application/json' } });

      mockFetch
        .mockResolvedValueOnce(validLoginResponse) // auth
        .mockResolvedValueOnce(emptySubsonicResponse) // subsonic search (called FIRST, returns empty)
        .mockResolvedValueOnce(emptyAlbumResponse) // empty albums (fallback)
        .mockResolvedValueOnce(artistResponse) // artist search (fallback)
        .mockResolvedValueOnce(topSongsResponse1) // top songs art1
        .mockResolvedValueOnce(topSongsResponse2); // top songs art2

      const result = await search('uzi', 0, 50);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Song1');
      expect(result[1].name).toBe('Song2');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4533/api/artist?name=uzi&_start=0&_end=4',
        expect.any(Object)
      );
    });
  
    it('should fallback to song search when no albums or artists found', async () => {
      const { search } = await import('../navidrome');

      const mockEmptyAlbums: Album[] = [];
      const mockEmptyArtists: Artist[] = [];
      const mockSongs: SubsonicSong[] = [{ id: 's1', title: 'Fallback Song', artist: 'Fallback', albumId: 'a1', duration: '180', track: '1' }];

      const validLoginResponse = new Response(JSON.stringify({
        token: 'test-token',
        id: 'test-client',
        subsonicToken: 'test-subsonic',
        subsonicSalt: 'test-salt',
      }), { status: 200, headers: { 'content-type': 'application/json' } });

      const subsonicResponse = new Response(JSON.stringify({ searchResult: { song: mockSongs } }), { status: 200, headers: { 'content-type': 'application/json' } });

      mockFetch
        .mockResolvedValueOnce(validLoginResponse) // auth
        .mockResolvedValueOnce(subsonicResponse); // subsonic songs (called FIRST, succeeds!)

      const result = await search('noalbumorartist', 0, 50);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Fallback Song');
      expect(mockFetch).toHaveBeenNthCalledWith(2, expect.stringContaining('/rest/search.view?query=noalbumorartist'), expect.any(Object));
    });
  
    it('should handle getTopSongs error gracefully', async () => {
      const module = await import('../navidrome');
      const { search } = module;

      const mockEmptyAlbums: Album[] = [];
      const mockArtists: Artist[] = [{ id: 'art1', name: 'Error Artist' }];

      const validLoginResponse = new Response(JSON.stringify({
        token: 'test-token',
        id: 'test-client',
        subsonicToken: 'test-subsonic',
        subsonicSalt: 'test-salt',
      }), { status: 200, headers: { 'content-type': 'application/json' } });

      const emptyAlbumResponse = new Response(JSON.stringify(mockEmptyAlbums), { status: 200, headers: { 'content-type': 'application/json' } });
      const artistResponse = new Response(JSON.stringify(mockArtists), { status: 200, headers: { 'content-type': 'application/json' } });

      // No top songs response needed since spy rejects

      mockFetch
        .mockResolvedValueOnce(validLoginResponse) // auth
        .mockResolvedValueOnce(emptyAlbumResponse) // empty albums
        .mockResolvedValueOnce(artistResponse) // artists
        .mockResolvedValueOnce(new Response(null, { status: 500, statusText: 'Server Error' })); // getTopSongs fails

      const result = await search('error', 0, 50);

      expect(result).toEqual([]); // No songs due to error
    });
  });

  describe('Playlist API methods', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockGetConfig.mockReturnValue({
        navidromeUrl: 'http://localhost:4533',
        navidromeUsername: 'testuser',
        navidromePassword: 'testpass',
      });
    });

    describe('getPlaylists', () => {
      it('should fetch all playlists successfully', async () => {
        const { getPlaylists } = await import('../navidrome');

        const mockPlaylists = [
          { id: 'pl1', name: 'Rock Classics', songCount: 42, duration: 9840, owner: 'testuser', public: false, created: '2024-01-01T00:00:00Z', changed: '2024-01-01T00:00:00Z' },
          { id: 'pl2', name: '2020s Mix', songCount: 30, duration: 7200, owner: 'testuser', public: false, created: '2024-01-02T00:00:00Z', changed: '2024-01-02T00:00:00Z' },
        ];

        const validLoginResponse = new Response(JSON.stringify({
          token: 'test-token',
          id: 'test-client',
          subsonicToken: 'test-subsonic',
          subsonicSalt: 'test-salt',
        }), { status: 200, headers: { 'content-type': 'application/json' } });

        const playlistsResponse = new Response(JSON.stringify({
          'subsonic-response': {
            playlists: {
              playlist: mockPlaylists
            }
          }
        }), { status: 200, headers: { 'content-type': 'application/json' } });

        mockFetch
          .mockResolvedValueOnce(validLoginResponse)
          .mockResolvedValueOnce(playlistsResponse);

        const result = await getPlaylists();

        expect(result).toEqual(mockPlaylists);
        expect(mockFetch).toHaveBeenNthCalledWith(2, expect.stringContaining('/rest/getPlaylists'), expect.any(Object));
      });

      it('should return empty array when no playlists exist', async () => {
        const { getPlaylists } = await import('../navidrome');

        const validLoginResponse = new Response(JSON.stringify({
          token: 'test-token',
          id: 'test-client',
          subsonicToken: 'test-subsonic',
          subsonicSalt: 'test-salt',
        }), { status: 200, headers: { 'content-type': 'application/json' } });

        const emptyResponse = new Response(JSON.stringify({
          'subsonic-response': {
            playlists: {
              playlist: []
            }
          }
        }), { status: 200, headers: { 'content-type': 'application/json' } });

        mockFetch
          .mockResolvedValueOnce(validLoginResponse)
          .mockResolvedValueOnce(emptyResponse);

        const result = await getPlaylists();

        expect(result).toEqual([]);
      });

      it('should throw error on API failure', async () => {
        const { getPlaylists } = await import('../navidrome');

        const validLoginResponse = new Response(JSON.stringify({
          token: 'test-token',
          id: 'test-client',
          subsonicToken: 'test-subsonic',
          subsonicSalt: 'test-salt',
        }), { status: 200, headers: { 'content-type': 'application/json' } });

        const errorResponse = new Response(null, { status: 500, statusText: 'Server Error' });

        mockFetch
          .mockResolvedValueOnce(validLoginResponse)
          .mockResolvedValueOnce(errorResponse);

        await expect(getPlaylists()).rejects.toThrow();
      });
    });

    describe('getPlaylist', () => {
      it('should fetch single playlist with songs', async () => {
        const { getPlaylist } = await import('../navidrome');

        const mockPlaylist = {
          id: 'pl1',
          name: 'Rock Classics',
          songCount: 2,
          duration: 420,
          owner: 'testuser',
          public: false,
          created: '2024-01-01T00:00:00Z',
          changed: '2024-01-01T00:00:00Z',
          entry: [
            { id: 's1', title: 'Song 1', artist: 'Artist 1', albumId: 'a1', duration: '180', track: '1' },
            { id: 's2', title: 'Song 2', artist: 'Artist 2', albumId: 'a2', duration: '240', track: '2' },
          ]
        };

        const validLoginResponse = new Response(JSON.stringify({
          token: 'test-token',
          id: 'test-client',
          subsonicToken: 'test-subsonic',
          subsonicSalt: 'test-salt',
        }), { status: 200, headers: { 'content-type': 'application/json' } });

        const playlistResponse = new Response(JSON.stringify({
          'subsonic-response': {
            playlist: mockPlaylist
          }
        }), { status: 200, headers: { 'content-type': 'application/json' } });

        mockFetch
          .mockResolvedValueOnce(validLoginResponse)
          .mockResolvedValueOnce(playlistResponse);

        const result = await getPlaylist('pl1');

        expect(result).toEqual(mockPlaylist);
        expect(result.entry).toHaveLength(2);
        expect(mockFetch).toHaveBeenNthCalledWith(2, expect.stringContaining('/rest/getPlaylist?id=pl1'), expect.any(Object));
      });

      it('should throw error for non-existent playlist', async () => {
        const { getPlaylist } = await import('../navidrome');

        const validLoginResponse = new Response(JSON.stringify({
          token: 'test-token',
          id: 'test-client',
          subsonicToken: 'test-subsonic',
          subsonicSalt: 'test-salt',
        }), { status: 200, headers: { 'content-type': 'application/json' } });

        const emptyResponse = new Response(JSON.stringify({
          'subsonic-response': {}
        }), { status: 200, headers: { 'content-type': 'application/json' } });

        mockFetch
          .mockResolvedValueOnce(validLoginResponse)
          .mockResolvedValueOnce(emptyResponse);

        await expect(getPlaylist('invalid')).rejects.toThrow('Playlist not found');
      });
    });

    describe('createPlaylist', () => {
      it('should create playlist without songs', async () => {
        const { createPlaylist } = await import('../navidrome');

        const mockCreatedPlaylist = {
          id: 'pl-new',
          name: 'New Playlist',
          songCount: 0,
          duration: 0,
          owner: 'testuser',
          public: false,
          created: '2024-01-01T00:00:00Z',
          changed: '2024-01-01T00:00:00Z',
        };

        const validLoginResponse = new Response(JSON.stringify({
          token: 'test-token',
          id: 'test-client',
          subsonicToken: 'test-subsonic',
          subsonicSalt: 'test-salt',
        }), { status: 200, headers: { 'content-type': 'application/json' } });

        const createResponse = new Response(JSON.stringify({
          'subsonic-response': {
            playlist: mockCreatedPlaylist
          }
        }), { status: 200, headers: { 'content-type': 'application/json' } });

        mockFetch
          .mockResolvedValueOnce(validLoginResponse)
          .mockResolvedValueOnce(createResponse);

        const result = await createPlaylist('New Playlist');

        expect(result).toEqual(mockCreatedPlaylist);
        expect(mockFetch).toHaveBeenNthCalledWith(2, expect.stringContaining('/rest/createPlaylist?name=New%20Playlist'), expect.objectContaining({ method: 'POST' }));
      });

      it('should create playlist with initial songs', async () => {
        const { createPlaylist } = await import('../navidrome');

        const mockCreatedPlaylist = {
          id: 'pl-new',
          name: 'New Playlist',
          songCount: 2,
          duration: 420,
          owner: 'testuser',
          public: false,
          created: '2024-01-01T00:00:00Z',
          changed: '2024-01-01T00:00:00Z',
        };

        const validLoginResponse = new Response(JSON.stringify({
          token: 'test-token',
          id: 'test-client',
          subsonicToken: 'test-subsonic',
          subsonicSalt: 'test-salt',
        }), { status: 200, headers: { 'content-type': 'application/json' } });

        const createResponse = new Response(JSON.stringify({
          'subsonic-response': {
            playlist: mockCreatedPlaylist
          }
        }), { status: 200, headers: { 'content-type': 'application/json' } });

        mockFetch
          .mockResolvedValueOnce(validLoginResponse)
          .mockResolvedValueOnce(createResponse);

        const result = await createPlaylist('New Playlist', ['s1', 's2']);

        expect(result).toEqual(mockCreatedPlaylist);
        expect(mockFetch).toHaveBeenNthCalledWith(2, expect.stringContaining('songId=s1'), expect.objectContaining({ method: 'POST' }));
        expect(mockFetch).toHaveBeenNthCalledWith(2, expect.stringContaining('songId=s2'), expect.objectContaining({ method: 'POST' }));
      });
    });

    describe('updatePlaylist', () => {
      it('should update playlist name', async () => {
        const { updatePlaylist } = await import('../navidrome');

        const validLoginResponse = new Response(JSON.stringify({
          token: 'test-token',
          id: 'test-client',
          subsonicToken: 'test-subsonic',
          subsonicSalt: 'test-salt',
        }), { status: 200, headers: { 'content-type': 'application/json' } });

        const updateResponse = new Response(JSON.stringify({
          'subsonic-response': {
            status: 'ok'
          }
        }), { status: 200, headers: { 'content-type': 'application/json' } });

        mockFetch
          .mockResolvedValueOnce(validLoginResponse)
          .mockResolvedValueOnce(updateResponse);

        await updatePlaylist('pl1', 'Updated Name');

        expect(mockFetch).toHaveBeenNthCalledWith(2, expect.stringContaining('/rest/updatePlaylist?playlistId=pl1'), expect.objectContaining({ method: 'POST' }));
        expect(mockFetch).toHaveBeenNthCalledWith(2, expect.stringContaining('name=Updated%20Name'), expect.objectContaining({ method: 'POST' }));
      });

      it('should update playlist songs', async () => {
        const { updatePlaylist } = await import('../navidrome');

        const validLoginResponse = new Response(JSON.stringify({
          token: 'test-token',
          id: 'test-client',
          subsonicToken: 'test-subsonic',
          subsonicSalt: 'test-salt',
        }), { status: 200, headers: { 'content-type': 'application/json' } });

        const updateResponse = new Response(JSON.stringify({
          'subsonic-response': {
            status: 'ok'
          }
        }), { status: 200, headers: { 'content-type': 'application/json' } });

        mockFetch
          .mockResolvedValueOnce(validLoginResponse)
          .mockResolvedValueOnce(updateResponse);

        await updatePlaylist('pl1', undefined, ['s1', 's2', 's3']);

        expect(mockFetch).toHaveBeenNthCalledWith(2, expect.stringContaining('songIdToAdd=s1'), expect.objectContaining({ method: 'POST' }));
        expect(mockFetch).toHaveBeenNthCalledWith(2, expect.stringContaining('songIdToAdd=s2'), expect.objectContaining({ method: 'POST' }));
        expect(mockFetch).toHaveBeenNthCalledWith(2, expect.stringContaining('songIdToAdd=s3'), expect.objectContaining({ method: 'POST' }));
      });
    });

    describe('deletePlaylist', () => {
      it('should delete playlist successfully', async () => {
        const { deletePlaylist } = await import('../navidrome');

        const validLoginResponse = new Response(JSON.stringify({
          token: 'test-token',
          id: 'test-client',
          subsonicToken: 'test-subsonic',
          subsonicSalt: 'test-salt',
        }), { status: 200, headers: { 'content-type': 'application/json' } });

        const deleteResponse = new Response(JSON.stringify({
          'subsonic-response': {
            status: 'ok'
          }
        }), { status: 200, headers: { 'content-type': 'application/json' } });

        mockFetch
          .mockResolvedValueOnce(validLoginResponse)
          .mockResolvedValueOnce(deleteResponse);

        await deletePlaylist('pl1');

        expect(mockFetch).toHaveBeenNthCalledWith(2, expect.stringContaining('/rest/deletePlaylist?id=pl1'), expect.objectContaining({ method: 'POST' }));
      });

      it('should throw error on delete failure', async () => {
        const { deletePlaylist } = await import('../navidrome');

        const validLoginResponse = new Response(JSON.stringify({
          token: 'test-token',
          id: 'test-client',
          subsonicToken: 'test-subsonic',
          subsonicSalt: 'test-salt',
        }), { status: 200, headers: { 'content-type': 'application/json' } });

        const errorResponse = new Response(JSON.stringify({
          'subsonic-response': {
            status: 'failed',
            error: {
              message: 'Playlist not found'
            }
          }
        }), { status: 200, headers: { 'content-type': 'application/json' } });

        mockFetch
          .mockResolvedValueOnce(validLoginResponse)
          .mockResolvedValueOnce(errorResponse);

        await expect(deletePlaylist('invalid')).rejects.toThrow();
      });
    });

    describe('checkNavidromeConnectivity', () => {
      it('should return true when Navidrome is available', async () => {
        const { checkNavidromeConnectivity } = await import('../navidrome');

        const pingResponse = new Response(JSON.stringify({
          'subsonic-response': {
            status: 'ok'
          }
        }), { status: 200, headers: { 'content-type': 'application/json' } });

        mockFetch.mockResolvedValueOnce(pingResponse);

        const result = await checkNavidromeConnectivity();

        expect(result).toBe(true);
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/rest/ping'), expect.any(Object));
      });

      it('should return false when Navidrome is unavailable', async () => {
        const { checkNavidromeConnectivity } = await import('../navidrome');

        mockFetch.mockRejectedValueOnce(new Error('Network error'));

        const result = await checkNavidromeConnectivity();

        expect(result).toBe(false);
      });

      it('should return false on timeout', async () => {
        const { checkNavidromeConnectivity } = await import('../navidrome');

        const abortError = new Error('The user aborted a request.');
        abortError.name = 'AbortError';
        mockFetch.mockRejectedValueOnce(abortError);

        const result = await checkNavidromeConnectivity();

        expect(result).toBe(false);
      });
    });
  });

  describe('Star/Unstar Song Functions (Story 3.9)', () => {
    beforeEach(async () => {
      vi.clearAllMocks();
      vi.resetModules();
      global.fetch = mockFetch;
      mockGetConfig.mockReturnValue({
        navidromeUrl: 'http://localhost:4533',
        navidromeUsername: 'testuser',
        navidromePassword: 'testpass',
      });
    });

    describe('starSong', () => {
      it('should star a song successfully', async () => {
        const { starSong, resetAuthState } = await import('../navidrome');
        resetAuthState();

        const validLoginResponse = new Response(JSON.stringify({
          token: 'test-token',
          id: 'test-client',
          subsonicToken: 'test-subsonic',
          subsonicSalt: 'test-salt',
        }), { status: 200, headers: { 'content-type': 'application/json' } });

        const starResponse = new Response(JSON.stringify({
          'subsonic-response': {
            status: 'ok'
          }
        }), { status: 200, headers: { 'content-type': 'application/json' } });

        mockFetch
          .mockResolvedValueOnce(validLoginResponse)
          .mockResolvedValueOnce(starResponse);

        await starSong('song-123');

        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(mockFetch).toHaveBeenNthCalledWith(2, expect.stringContaining('/rest/star'), expect.any(Object));
        expect(mockFetch).toHaveBeenNthCalledWith(2, expect.stringContaining('id=song-123'), expect.any(Object));
      });

      it('should throw error when Navidrome URL not configured', async () => {
        const { starSong } = await import('../navidrome');

        mockGetConfig.mockReturnValueOnce({
          // No navidromeUrl
          navidromeUsername: 'testuser',
          navidromePassword: 'testpass',
        });

        await expect(starSong('song-123')).rejects.toThrow('Navidrome URL not configured');
        expect(mockFetch).not.toHaveBeenCalled();
      });

      it('should throw error on API failure', async () => {
        const { starSong, resetAuthState } = await import('../navidrome');
        resetAuthState();

        const validLoginResponse = new Response(JSON.stringify({
          token: 'test-token',
          id: 'test-client',
          subsonicToken: 'test-subsonic',
          subsonicSalt: 'test-salt',
        }), { status: 200, headers: { 'content-type': 'application/json' } });

        const errorResponse = new Response(null, { status: 500, statusText: 'Server Error' });

        mockFetch
          .mockResolvedValueOnce(validLoginResponse)
          .mockResolvedValueOnce(errorResponse);

        await expect(starSong('song-123')).rejects.toThrow('Failed to star song');
      });

      it('should throw error on Subsonic API error response', async () => {
        const { starSong, resetAuthState } = await import('../navidrome');
        resetAuthState();

        const validLoginResponse = new Response(JSON.stringify({
          token: 'test-token',
          id: 'test-client',
          subsonicToken: 'test-subsonic',
          subsonicSalt: 'test-salt',
        }), { status: 200, headers: { 'content-type': 'application/json' } });

        const errorResponse = new Response(JSON.stringify({
          'subsonic-response': {
            status: 'failed',
            error: {
              message: 'Song not found'
            }
          }
        }), { status: 200, headers: { 'content-type': 'application/json' } });

        mockFetch
          .mockResolvedValueOnce(validLoginResponse)
          .mockResolvedValueOnce(errorResponse);

        await expect(starSong('invalid-song')).rejects.toThrow('Subsonic API error');
      });
    });

    describe('unstarSong', () => {
      it('should unstar a song successfully', async () => {
        const { unstarSong, resetAuthState } = await import('../navidrome');
        resetAuthState();

        const validLoginResponse = new Response(JSON.stringify({
          token: 'test-token',
          id: 'test-client',
          subsonicToken: 'test-subsonic',
          subsonicSalt: 'test-salt',
        }), { status: 200, headers: { 'content-type': 'application/json' } });

        const unstarResponse = new Response(JSON.stringify({
          'subsonic-response': {
            status: 'ok'
          }
        }), { status: 200, headers: { 'content-type': 'application/json' } });

        mockFetch
          .mockResolvedValueOnce(validLoginResponse)
          .mockResolvedValueOnce(unstarResponse);

        await unstarSong('song-123');

        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(mockFetch).toHaveBeenNthCalledWith(2, expect.stringContaining('/rest/unstar'), expect.any(Object));
        expect(mockFetch).toHaveBeenNthCalledWith(2, expect.stringContaining('id=song-123'), expect.any(Object));
      });

      it('should throw error when Navidrome URL not configured', async () => {
        const { unstarSong } = await import('../navidrome');

        mockGetConfig.mockReturnValueOnce({
          // No navidromeUrl
          navidromeUsername: 'testuser',
          navidromePassword: 'testpass',
        });

        await expect(unstarSong('song-123')).rejects.toThrow('Navidrome URL not configured');
        expect(mockFetch).not.toHaveBeenCalled();
      });

      it('should throw error on API failure', async () => {
        const { unstarSong, resetAuthState } = await import('../navidrome');
        resetAuthState();

        const validLoginResponse = new Response(JSON.stringify({
          token: 'test-token',
          id: 'test-client',
          subsonicToken: 'test-subsonic',
          subsonicSalt: 'test-salt',
        }), { status: 200, headers: { 'content-type': 'application/json' } });

        const errorResponse = new Response(null, { status: 500, statusText: 'Server Error' });

        mockFetch
          .mockResolvedValueOnce(validLoginResponse)
          .mockResolvedValueOnce(errorResponse);

        await expect(unstarSong('song-123')).rejects.toThrow('Failed to unstar song');
      });

      it('should throw error on Subsonic API error response', async () => {
        const { unstarSong, resetAuthState } = await import('../navidrome');
        resetAuthState();

        const validLoginResponse = new Response(JSON.stringify({
          token: 'test-token',
          id: 'test-client',
          subsonicToken: 'test-subsonic',
          subsonicSalt: 'test-salt',
        }), { status: 200, headers: { 'content-type': 'application/json' } });

        const errorResponse = new Response(JSON.stringify({
          'subsonic-response': {
            status: 'failed',
            error: {
              message: 'Song not found'
            }
          }
        }), { status: 200, headers: { 'content-type': 'application/json' } });

        mockFetch
          .mockResolvedValueOnce(validLoginResponse)
          .mockResolvedValueOnce(errorResponse);

        await expect(unstarSong('invalid-song')).rejects.toThrow('Subsonic API error');
      });
    });
  });
});
