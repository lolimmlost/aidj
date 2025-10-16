import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  searchArtists,
  searchAlbums,
  getArtist,
  getAlbum,
  search,
  getArtists,
  isArtistAdded,
  getDownloadQueue,
  getDownloadHistory,
  cancelDownload,
  getDownloadStats,
  monitorDownloads,
  exportDownloadHistory,
  clearDownloadHistory,
  addArtist,
  type LidarrArtist,
} from '../lidarr';
import { getConfig } from '../../config/config';
import { ServiceError } from '../../utils';

// Mock fetch
global.fetch = vi.fn();

describe('Lidarr Service', () => {
  const mockConfig = {
    lidarrUrl: 'http://localhost:8686',
    lidarrApiKey: 'test-api-key',
  } as const;

  beforeEach(() => {
    vi.mocked(getConfig).mockReturnValue(mockConfig);
    vi.clearAllMocks();
    // Reset token info by accessing the module
    vi.doMock('../lidarr', async () => {
      const actual = await vi.importActual('../lidarr');
      return {
        ...actual,
        tokenInfo: null,
      };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Authentication and Token Management', () => {
    it('should get auth token successfully', async () => {
      // We'll test this indirectly through the API calls
      const mockResponse = { data: 'test' };
      
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      await searchArtists('test');
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/artist/lookup'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Api-Key': 'test-api-key',
          }),
        })
      );
    });

    it('should handle authentication failures', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      } as Response);

      const result = await searchArtists('test');
      expect(result).toEqual([]);
    });
  });

  describe('API Fetch with Retry Logic', () => {
    it('should handle successful API request', async () => {
      const mockResponse = { data: 'test' };
      
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      await searchArtists('test');
      
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/artist/lookup'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Api-Key': 'test-api-key',
          }),
        })
      );
    });

    it('should retry on retryable status codes', async () => {
      const mockResponse = [
        { id: 1, artistName: 'Test Artist', genres: ['Rock'], status: 'active' }
      ];
      
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        } as Response);

      const result = await searchArtists('test');
      
      expect(result).toHaveLength(1);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('should handle network errors gracefully', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

      const result = await searchArtists('test');
      expect(result).toEqual([]);
    });
  });

  describe('searchArtists', () => {
    it('should return artists for valid query', async () => {
      const mockResponse = [
        {
          id: 1,
          artistName: 'Test Artist',
          genres: ['Rock'],
          status: 'active',
        },
      ];

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const result = await searchArtists('test');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:8686/api/v1/artist/lookup?term=test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Api-Key': 'test-api-key',
          }),
        })
      );

      expect(result).toEqual([
        {
          id: '1',
          name: 'Test Artist',
          genres: ['Rock'],
          status: 'active',
        },
      ]);
    });

    it('should return empty array on error', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

      const result = await searchArtists('test');

      expect(result).toEqual([]);
    });
  });

  describe('searchAlbums', () => {
    it('should return albums for valid query', async () => {
      const mockResponse = [
        {
          id: 1,
          title: 'Test Album',
          artistId: 1,
          releaseDate: '2023-01-01',
          images: [{ coverType: 'cover', url: 'http://example.com/cover.jpg' }],
        },
      ];

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const result = await searchAlbums('test');

      expect(result).toEqual([
        {
          id: '1',
          title: 'Test Album',
          artistId: '1',
          releaseDate: '2023-01-01',
          images: [{ coverType: 'cover', url: 'http://example.com/cover.jpg' }],
        },
      ]);
    });
  });

  describe('getArtist', () => {
    it('should return artist details', async () => {
      const mockResponse = {
        id: 1,
        artistName: 'Test Artist',
        overview: 'Test overview',
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const result = await getArtist('1');

      expect(result).toEqual(mockResponse);
    });

    it('should return null on error', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

      const result = await getArtist('1');

      expect(result).toBeNull();
    });
  });

  describe('getAlbum', () => {
    it('should return album details', async () => {
      const mockResponse = {
        id: 1,
        title: 'Test Album',
        artistId: 1,
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const result = await getAlbum('1');

      expect(result).toEqual(mockResponse);
    });
  });

  describe('search', () => {
    it('should return combined search results', async () => {
      const mockArtists = [{ id: 1, artistName: 'Artist' }];
      const mockAlbums = [{ id: 1, title: 'Album', artistId: 1 }];

      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockArtists),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockAlbums),
        } as Response);

      const result = await search('test');

      expect(result).toEqual({
        artists: [{ id: '1', name: 'Artist', genres: undefined, status: undefined }],
        albums: [{ id: '1', title: 'Album', artistId: '1', releaseDate: undefined, images: undefined }],
      });
    });

    it('should handle missing configuration', async () => {
      vi.mocked(getConfig).mockReturnValue({ lidarrUrl: '', lidarrApiKey: '' });

      const result = await search('test');
      expect(result).toEqual({ artists: [], albums: [] });
    });
  });

  describe('Artist Management', () => {
    describe('getArtists', () => {
      it('should return all artists', async () => {
        const mockResponse = [
          { id: 1, artistName: 'Artist 1' },
          { id: 2, artistName: 'Artist 2' },
        ];

        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        } as Response);

        const result = await getArtists();

        expect(result).toEqual(mockResponse);
      });

      it('should return empty array on error', async () => {
        vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

        const result = await getArtists();

        expect(result).toEqual([]);
      });
    });

    describe('isArtistAdded', () => {
      it('should return true if artist is added', async () => {
        const mockArtists = [
          { id: 1, artistName: 'Test Artist', foreignArtistId: 'test-id-123' },
        ];

        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockArtists),
        } as Response);

        const result = await isArtistAdded('test-id-123');

        expect(result).toBe(true);
      });

      it('should return false if artist is not added', async () => {
        const mockArtists = [
          { id: 1, artistName: 'Test Artist', foreignArtistId: 'test-id-456' },
        ];

        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockArtists),
        } as Response);

        const result = await isArtistAdded('test-id-123');

        expect(result).toBe(false);
      });

      it('should return false on error', async () => {
        vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

        const result = await isArtistAdded('test-id-123');

        expect(result).toBe(false);
      });
    });

    describe('addArtist', () => {
      it('should add artist successfully', async () => {
        const mockArtist: LidarrArtist = {
          id: 1,
          artistName: 'Test Artist',
          foreignArtistId: 'test-id-123',
          images: [],
          links: [],
          genres: [],
          status: 'active',
        };

        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        } as Response);

        await expect(addArtist(mockArtist)).resolves.not.toThrow();
      });

      it('should throw error on failure', async () => {
        const mockArtist: LidarrArtist = {
          id: 1,
          artistName: 'Test Artist',
          foreignArtistId: 'test-id-123',
          images: [],
          links: [],
          genres: [],
          status: 'active',
        };

        vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

        await expect(addArtist(mockArtist)).rejects.toThrow('Failed to add artist');
      });
    });
  });

  describe('Download Management', () => {
    describe('getDownloadQueue', () => {
      it('should return download queue', async () => {
        const mockResponse = [
          {
            id: 1,
            artistName: 'Test Artist',
            foreignArtistId: 'test-id-123',
            status: 'queued',
            progress: 0,
            addedAt: '2023-01-01T00:00:00Z',
          },
        ];

        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        } as Response);

        const result = await getDownloadQueue();

        expect(result).toEqual([
          {
            id: '1',
            artistName: 'Test Artist',
            foreignArtistId: 'test-id-123',
            status: 'queued',
            progress: 0,
            addedAt: '2023-01-01T00:00:00Z',
          },
        ]);
      });

      it('should return empty array on error', async () => {
        vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

        const result = await getDownloadQueue();

        expect(result).toEqual([]);
      });
    });

    describe('getDownloadHistory', () => {
      it('should return download history', async () => {
        const mockResponse = [
          {
            id: 1,
            artistName: 'Test Artist',
            foreignArtistId: 'test-id-123',
            status: 'completed',
            addedAt: '2023-01-01T00:00:00Z',
            completedAt: '2023-01-01T01:00:00Z',
            size: 1024000000,
          },
        ];

        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        } as Response);

        const result = await getDownloadHistory();

        expect(result).toEqual([
          {
            id: '1',
            artistName: 'Test Artist',
            foreignArtistId: 'test-id-123',
            status: 'completed',
            addedAt: '2023-01-01T00:00:00Z',
            completedAt: '2023-01-01T01:00:00Z',
            size: 1024000000,
          },
        ]);
      });

      it('should return empty array on error', async () => {
        vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

        const result = await getDownloadHistory();

        expect(result).toEqual([]);
      });
    });

    describe('cancelDownload', () => {
      it('should cancel download successfully', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        } as Response);

        const result = await cancelDownload('1');

        expect(result).toBe(true);
        expect(fetch).toHaveBeenCalledWith(
          'http://localhost:8686/api/v1/queue/1',
          expect.objectContaining({ method: 'DELETE' })
        );
      });

      it('should return false on error', async () => {
        vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

        const result = await cancelDownload('1');

        expect(result).toBe(false);
      });
    });

    describe('getDownloadStats', () => {
      it('should return download statistics', async () => {
        vi.mocked(fetch)
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve([
              { id: 1, status: 'queued' },
              { id: 2, status: 'downloading' },
            ]),
          } as Response)
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve([
              { id: 1, status: 'completed', size: 1024000000 },
              { id: 2, status: 'failed' },
            ]),
          } as Response);

        const result = await getDownloadStats();

        expect(result).toEqual({
          totalQueued: 1,
          totalDownloading: 1,
          totalCompleted: 1,
          totalFailed: 1,
          totalSize: 1024000000,
        });
      });

      it('should return zero stats on error', async () => {
        vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

        const result = await getDownloadStats();

        expect(result).toEqual({
          totalQueued: 0,
          totalDownloading: 0,
          totalCompleted: 0,
          totalFailed: 0,
          totalSize: 0,
        });
      });
    });

    describe('monitorDownloads', () => {
      it('should monitor downloads successfully', async () => {
        const mockQueue = [{ id: 1, status: 'queued' }];
        const mockHistory = [{ id: 1, status: 'completed' }];
        const mockStats = { totalQueued: 1, totalCompleted: 1 };

        vi.mocked(fetch)
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(mockQueue),
          } as Response)
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(mockHistory),
          } as Response)
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(mockStats),
          } as Response);

        const result = await monitorDownloads();

        expect(result).toEqual({
          queue: mockQueue,
          history: mockHistory,
          stats: mockStats,
        });
      });

      it('should handle errors gracefully', async () => {
        vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

        const result = await monitorDownloads();

        expect(result).toEqual({
          queue: [],
          history: [],
          stats: {
            totalQueued: 0,
            totalDownloading: 0,
            totalCompleted: 0,
            totalFailed: 0,
            totalSize: 0,
          },
        });
      });
    });

    describe('exportDownloadHistory', () => {
      it('should export download history as CSV', async () => {
        const mockHistory = [
          {
            id: '1',
            artistName: 'Test Artist',
            status: 'completed',
            addedAt: '2023-01-01T00:00:00Z',
            completedAt: '2023-01-01T01:00:00Z',
            size: 1024000000,
          },
        ];

        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockHistory),
        } as Response);

        const result = await exportDownloadHistory();

        expect(result).toContain('ID,Artist Name,Status,Added At,Completed At,Size (MB),Error Message');
        expect(result).toContain('"Test Artist"');
        expect(result).toContain('completed');
      });

      it('should throw error on export failure', async () => {
        vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

        await expect(exportDownloadHistory()).rejects.toThrow('Failed to export download history');
      });
    });

    describe('clearDownloadHistory', () => {
      it('should clear download history successfully', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        } as Response);

        const result = await clearDownloadHistory();

        expect(result).toBe(true);
        expect(fetch).toHaveBeenCalledWith(
          'http://localhost:8686/api/v1/history/clear',
          expect.objectContaining({ method: 'POST' })
        );
      });

      it('should return false on error', async () => {
        vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

        const result = await clearDownloadHistory();

        expect(result).toBe(false);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle ServiceError properly', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

      await expect(searchArtists('test')).resolves.toEqual([]);
    });

    it('should handle different error types', async () => {
      vi.mocked(fetch).mockImplementation(() => {
        throw new ServiceError('TEST_ERROR', 'Test error message');
      });

      await expect(searchArtists('test')).resolves.toEqual([]);
    });
  });
});