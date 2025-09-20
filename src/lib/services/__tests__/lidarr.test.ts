import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addArtistToQueue, searchArtist, searchAlbum, getDownloadQueue } from '../lidarr';
import { getConfig } from '@/lib/config/config';

// Mock config
vi.mock('@/lib/config/config', () => ({
  getConfig: vi.fn(() => ({
    lidarrUrl: 'http://localhost:8686',
    lidarrApiKey: 'test-api-key',
    lidarrQualityProfileId: 1,
    lidarrRootFolderPath: '/music',
  })),
}));

const mockGetConfig = getConfig as unknown as ReturnType<typeof vi.fn>;

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock sessionStorage
const mockSessionStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
};
Object.defineProperty(window, 'sessionStorage', { value: mockSessionStorage });

describe('Lidarr Service Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConfig.mockReturnValue({
      lidarrUrl: 'http://localhost:8686',
      lidarrApiKey: 'test-api-key',
      lidarrQualityProfileId: 1,
      lidarrRootFolderPath: '/music',
    });
    mockSessionStorage.getItem.mockReturnValue(null);
    mockSessionStorage.setItem.mockImplementation(() => {});
  });

  describe('getApiKey', () => {
    it('returns config key and stores obfuscated in sessionStorage on first call', () => {
      const key = getApiKey();
      expect(key).toBe('test-api-key');
      expect(mockSessionStorage.setItem).toHaveBeenCalledWith('lidarr_encrypted_key', btoa('test-api-key'));
    });

    it('returns cached key from sessionStorage on subsequent calls', () => {
      mockSessionStorage.getItem.mockReturnValue(btoa('cached-key'));
      const key = getApiKey();
      expect(key).toBe('cached-key');
      expect(mockSessionStorage.setItem).not.toHaveBeenCalled();
    });

    it('throws CONFIG_ERROR if no key in config', () => {
      mockGetConfig.mockReturnValueOnce({
        lidarrUrl: 'http://localhost:8686',
        // No API key
      });
      expect(() => getApiKey()).toThrow('CONFIG_ERROR');
    });
  });

  describe('apiFetch', () => {
    it('uses getApiKey in headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: 'test' }),
      } as Response);

      await apiFetch('/test');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8686/test',
        expect.objectContaining({
          headers: { 'X-Api-Key': 'test-api-key', 'Content-Type': 'application/json' },
        }),
      );
    });

    it('times out after 5s and throws TIMEOUT_ERROR', async () => {
      mockFetch.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));

      await expect(apiFetch('/test')).rejects.toThrow('TIMEOUT_ERROR');
    });

    it('retries on transient error (TypeError) up to 3 attempts', async () => {
      mockFetch
        .mockRejectedValueOnce(new TypeError('Network error')) // attempt 1
        .mockRejectedValueOnce(new TypeError('Network error')) // attempt 2
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: 'success' }),
        } as Response); // attempt 3

      const result = await apiFetch('/test');
      expect(result).toEqual({ data: 'success' });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('does not retry on non-transient error (API_ERROR)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
      } as Response);

      await expect(apiFetch('/test')).rejects.toThrow('API_ERROR');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('parses JSON response correctly', async () => {
      const mockData = { id: 1 };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => mockData,
      } as Response);

      const result = await apiFetch('/test');
      expect(result).toEqual(mockData);
    });

    it('returns text for non-JSON response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'text/plain' },
        text: async () => 'plain text',
      } as Response);

      const result = await apiFetch('/test');
      expect(result).toBe('plain text');
    });
  });

  describe('addArtistToQueue', () => {
    it('adds artist successfully and returns success message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
      } as Response);

      const result = await addArtistToQueue('123', 'Test Artist');

      expect(result).toEqual({ success: true, message: 'Added "Test Artist" to Lidarr download queue.' });
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8686/api/v1/artist',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            artistId: '123',
            monitor: true,
            monitorDiscography: true,
            qualityProfileId: 1,
            rootFolderPath: '/music',
            addAlbums: true,
          }),
        }),
      );
    });

    it('uses qualityProfileId and rootFolderPath from config', async () => {
      mockGetConfig.mockReturnValueOnce({
        lidarrUrl: 'http://localhost:8686',
        lidarrApiKey: 'test-api-key',
        lidarrQualityProfileId: 2,
        lidarrRootFolderPath: '/downloads',
      });
      mockFetch.mockResolvedValueOnce({ ok: true } as Response);

      await addArtistToQueue('123', 'Test Artist');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify(expect.objectContaining({
            qualityProfileId: 2,
            rootFolderPath: '/downloads',
          })),
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
  });

  describe('searchArtist', () => {
    it('searches artist successfully with default limit', async () => {
      const mockResults = [{ id: 1, artistName: 'Test Artist' }];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResults,
      } as Response);

      const result = await searchArtist('Test Artist');

      expect(result).toEqual(mockResults);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8686/api/v1/artist/lookup?term=Test%20Artist&limit=20',
        expect.any(Object),
      );
    });

    it('searches with custom limit', async () => {
      const mockResults = [{ id: 1, artistName: 'Test Artist' }];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResults,
      } as Response);

      await searchArtist('Test Artist', 10);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=10'),
        expect.any(Object),
      );
    });

    it('throws METADATA_ERROR on error response', async () => {
      const mockError = { message: 'Service unavailable' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockError,
      } as Response);

      await expect(searchArtist('Test')).rejects.toThrow('METADATA_ERROR');
    });

    it('throws SEARCH_ERROR on fetch failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(searchArtist('Test')).rejects.toThrow('SEARCH_ERROR');
    });
  });

  describe('searchAlbum', () => {
    it('searches album successfully without artist', async () => {
      const mockResults = [{ id: 1, title: 'Test Album' }];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResults,
      } as Response);

      const result = await searchAlbum('Test Album');

      expect(result).toEqual(mockResults);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('term=Test%20Album&limit=20'),
        expect.any(Object),
      );
    });

    it('searches album with artist name', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ([]),
      } as Response);

      await searchAlbum('Test Album', 'Test Artist');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('term=Test%20Album%20Test%20Artist'),
        expect.any(Object),
      );
    });

    it('throws SEARCH_ERROR on failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(searchAlbum('Test')).rejects.toThrow('SEARCH_ERROR');
    });
  });

  describe('getDownloadQueue', () => {
    it('fetches queue successfully', async () => {
      const mockQueue = [{ id: 1 }];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockQueue,
      } as Response);

      const result = await getDownloadQueue();

      expect(result).toEqual(mockQueue);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8686/api/v1/wanted/missing?includeArtist=true&includeAlbum=true',
        expect.any(Object),
      );
    });

    it('throws QUEUE_ERROR on failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(getDownloadQueue()).rejects.toThrow('QUEUE_ERROR');
    });
  });
});