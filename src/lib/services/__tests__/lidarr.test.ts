import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchArtists, searchAlbums, getArtist, getAlbum, search } from '../lidarr';
import { getConfig } from '../../config/config';

// Mock fetch
global.fetch = vi.fn();

describe('Lidarr Service', () => {
  const mockConfig = {
    lidarrUrl: 'http://localhost:8686',
    lidarrApiKey: 'test-api-key',
  };

  beforeEach(() => {
    vi.mocked(getConfig).mockReturnValue(mockConfig as any);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

    it('should throw error when config incomplete', async () => {
      vi.mocked(getConfig).mockReturnValue({ lidarrUrl: '', lidarrApiKey: '' } as any);

      await expect(search('test')).rejects.toThrow('Lidarr configuration incomplete');
    });
  });
});