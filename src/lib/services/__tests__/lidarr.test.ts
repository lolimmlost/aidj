import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addArtistToQueue, searchArtist } from '../lidarr';
import { getConfig } from '@/lib/config/config';

// Mock config
vi.mock('@/lib/config/config', () => ({
  getConfig: vi.fn(),
}));

const mockGetConfig = getConfig as unknown as ReturnType<typeof vi.fn>;

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Lidarr Service Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConfig.mockReturnValue({
      lidarrUrl: 'http://localhost:8686',
      lidarrApiKey: 'test-api-key',
    });
  });

  describe('addArtistToQueue', () => {
    it('adds artist successfully and returns success message', async () => {
      const mockResponse = { success: true };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockResponse,
      } as Response);

      const result = await addArtistToQueue('123', 'Test Artist');

      expect(result).toEqual({ success: true, message: 'Added "Test Artist" to Lidarr download queue.' });
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8686/api/v1/artist',
        expect.objectContaining({
          method: 'POST',
          headers: { 'X-Api-Key': 'test-api-key', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            artistId: 123,
            monitor: true,
            monitorDiscography: true,
            qualityProfileId: 1,
            rootFolderPath: '/music',
            addAlbums: true,
          }),
        }),
      );
    });

    it('throws LidarrError on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
      } as Response);

      await expect(addArtistToQueue('123', 'Test Artist')).rejects.toThrow('API_ERROR');
    });

    it('throws config error if API key missing', async () => {
      mockGetConfig.mockReturnValueOnce({
        lidarrUrl: 'http://localhost:8686',
        // No API key
      });

      await expect(addArtistToQueue('123', 'Test Artist')).rejects.toThrow('CONFIG_ERROR');
    });

    it('throws timeout error', async () => {
      mockFetch.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));

      await expect(addArtistToQueue('123', 'Test Artist')).rejects.toThrow('TIMEOUT_ERROR');
    });
  });

  describe('searchArtist', () => {
    it('searches artist successfully', async () => {
      const mockResults = [{ id: 1, artistName: 'Test Artist' }];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResults,
      } as Response);

      const result = await searchArtist('Test Artist');

      expect(result).toEqual(mockResults);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8686/api/v1/artist/lookup?term=Test%20Artist',
        expect.any(Object),
      );
    });

    it('throws config error if API key missing', async () => {
      mockGetConfig.mockReturnValueOnce({
        lidarrUrl: 'http://localhost:8686',
        // No API key
      });

      await expect(searchArtist('Test')).rejects.toThrow('CONFIG_ERROR');
    });

    it('throws search error on failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(searchArtist('Test')).rejects.toThrow('SEARCH_ERROR');
    });
  });
});