import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServiceError } from '../../utils';
import { addArtistToQueue, searchArtist, searchAlbum, getDownloadQueue, getApiKey, apiFetch } from '../lidarr';
import { getConfig } from '@/lib/config/config';
const encoder = new TextEncoder();

// Mock config
vi.mock('@/lib/config/config', () => ({
  getConfig: vi.fn(() => ({
    lidarrUrl: 'http://localhost:8686',
    lidarrApiKey: 'test-api-key',
  })),
}));

// Mock env
vi.mock('@/env/client', () => ({
  clientEnv: {
    VITE_LIDARR_URL: 'http://localhost:8686',
  },
}));

const mockGetConfig = getConfig as unknown as ReturnType<typeof vi.fn>;

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock crypto for Web Crypto
const mockCrypto = {
  subtle: {
    importKey: vi.fn(),
    deriveKey: vi.fn(),
    encrypt: vi.fn(),
    decrypt: vi.fn(),
  },
  getRandomValues: vi.fn(),
};
Object.defineProperty(window, 'crypto', { value: mockCrypto });

// Mock sessionStorage
const mockSessionStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
};
Object.defineProperty(window, 'sessionStorage', { value: mockSessionStorage });

describe('Lidarr Service Unit Tests', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    mockGetConfig.mockReturnValue({
      lidarrUrl: 'http://localhost:8686',
      lidarrApiKey: 'test-api-key',
    });
    mockSessionStorage.getItem.mockReturnValue(null);
    mockSessionStorage.setItem.mockImplementation(() => {});
    mockCrypto.subtle.importKey.mockResolvedValue({} as CryptoKey);
    mockCrypto.subtle.deriveKey.mockResolvedValue({} as CryptoKey);
    mockCrypto.subtle.encrypt.mockResolvedValue(new Uint8Array(32));
    mockCrypto.subtle.decrypt.mockResolvedValue(encoder.encode('test-api-key'));
    mockCrypto.getRandomValues.mockReturnValue(new Uint8Array(12));

    // Reset module state
    const module = await import('../lidarr');
    module.resetCache();
  });

  describe('getApiKey', () => {
    it('returns config key and stores encrypted in sessionStorage on first call', async () => {
      const key = await getApiKey();
      expect(key).toBe('test-api-key');
      expect(mockSessionStorage.setItem).toHaveBeenCalledWith('lidarr_encrypted_key', expect.any(String));
    });

    it('returns cached key from sessionStorage on subsequent calls', async () => {
      // Mock proper base64 encrypted string for decrypt
      const mockEncrypted = btoa(String.fromCharCode(...new Uint8Array([1,2,3,4,5,6,7,8,9,10,11,12, ...encoder.encode('test-api-key')])));
      mockSessionStorage.getItem.mockReturnValue(mockEncrypted);
      mockCrypto.subtle.decrypt.mockResolvedValueOnce(encoder.encode('test-api-key'));
      const key = await getApiKey();
      expect(key).toBe('test-api-key');
      expect(mockSessionStorage.setItem).not.toHaveBeenCalled();
    });

    it('throws CONFIG_ERROR if no key in config', async () => {
      mockGetConfig.mockReturnValueOnce({
        lidarrUrl: 'http://localhost:8686',
        // No API key
      });
      const promise = getApiKey();
      await expect(promise).rejects.toBeInstanceOf(ServiceError);
      const error = await promise.catch(e => e);
      if (error instanceof ServiceError) {
        expect(error.code).toBe('CONFIG_ERROR');
        expect(error.message).toBe('Lidarr API key not configured');
      }
    });
  });

  describe('apiFetch', () => {
    it('uses getApiKey in headers', async () => {
      const mockJson = vi.fn().mockResolvedValue({ data: 'test' });
      const mockResponse = new Response(JSON.stringify({ data: 'test' }), {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
      });
      mockResponse.json = mockJson;
      mockFetch.mockResolvedValueOnce(mockResponse);

      await apiFetch('/test');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8686/test',
        expect.objectContaining({
          headers: { 'X-Api-Key': 'test-api-key', 'Content-Type': 'application/json' },
        }),
      );
    });

    it('times out after 10s and throws TIMEOUT_ERROR', async () => {
      mockFetch.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));

      const promise = apiFetch('/test');
      await expect(promise).rejects.toBeInstanceOf(ServiceError);
      const error = await promise.catch(e => e);
      if (error instanceof ServiceError) {
        expect(error.code).toBe('TIMEOUT_ERROR');
        expect(error.message).toBe('Lidarr request timed out after 10s');
      }
    });

    it('retries on transient error (TypeError) up to 3 attempts', async () => {
      mockFetch.mockReset();
      const mockJsonSuccess = vi.fn().mockResolvedValue({ data: 'success' });
      const mockResponseSuccess = new Response(JSON.stringify({ data: 'success' }), {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
      });
      mockResponseSuccess.json = mockJsonSuccess;
      mockFetch
        .mockRejectedValueOnce(new TypeError('Network error')) // attempt 1
        .mockRejectedValueOnce(new TypeError('Network error')) // attempt 2
        .mockResolvedValueOnce(mockResponseSuccess); // attempt 3
      
      const result = await apiFetch('/test');
      expect(result).toEqual({ data: 'success' });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    }, { timeout: 10000 });

    it('does not retry on non-transient error (API_ERROR)', async () => {
      mockFetch.mockReset();
      const mockResponseError = new Response(null, {
        status: 400,
        statusText: 'Bad Request',
      });
      mockFetch.mockResolvedValueOnce(mockResponseError);
     
      const promise = apiFetch('/test');
      await expect(promise).rejects.toBeInstanceOf(ServiceError);
      const error = await promise.catch(e => e);
      if (error instanceof ServiceError) {
        expect(error.code).toBe('API_ERROR');
        expect(error.message).toBe('Lidarr API error: 400 Bad Request');
      }
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('parses JSON response correctly', async () => {
      mockFetch.mockReset();
      const mockData = { id: 1 };
      const mockJsonData = vi.fn().mockResolvedValue(mockData);
      const mockResponseJson = new Response(JSON.stringify(mockData), {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
      });
      mockResponseJson.json = mockJsonData;
      mockFetch.mockResolvedValueOnce(mockResponseJson);
     
      const result = await apiFetch('/test');
      expect(result).toEqual(mockData);
    });

    it('returns text for non-JSON response', async () => {
      mockFetch.mockReset();
      const mockText = vi.fn().mockResolvedValue('plain text');
      const mockResponseText = new Response('plain text', {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/plain' },
      });
      mockResponseText.text = mockText;
      mockFetch.mockResolvedValueOnce(mockResponseText);
     
      const result = await apiFetch('/test');
      expect(result).toBe('plain text');
    });
  });

  describe('addArtistToQueue', () => {
    it('adds artist successfully and returns success message', async () => {
      const mockResponseCreated = new Response(null, {
        status: 201,
        statusText: 'Created',
      });
      mockFetch.mockResolvedValueOnce(mockResponseCreated);

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
      const mockResponseCreated2 = new Response(null, {
        status: 201,
        statusText: 'Created',
      });
      mockFetch.mockResolvedValueOnce(mockResponseCreated2);

      await addArtistToQueue('123', 'Test Artist');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"qualityProfileId":2'),
        }),
      );
    });

    it('throws ServiceError on API failure', async () => {
      mockFetch.mockReset();
      const mockResponseError = new Response(null, {
        status: 400,
        statusText: 'Bad Request',
      });
      mockFetch.mockResolvedValueOnce(mockResponseError);
     
      const promise = addArtistToQueue('123', 'Test Artist');
      await expect(promise).rejects.toBeInstanceOf(ServiceError);
      const error = await promise.catch(e => e);
      if (error instanceof ServiceError) {
        expect(error.code).toBe('API_ERROR');
        expect(error.message).toBe('Failed to add artist: Lidarr API error: 400 Bad Request');
      }
    });

    it('throws config error if API key missing', async () => {
      mockGetConfig.mockImplementation(() => ({
        lidarrUrl: 'http://localhost:8686',
        // No API key
      }));
     
      const promise = addArtistToQueue('123', 'Test Artist');
      await expect(promise).rejects.toBeInstanceOf(ServiceError);
      const error = await promise.catch(e => e);
      if (error instanceof ServiceError) {
        expect(error.code).toBe('CONFIG_ERROR');
        expect(error.message).toContain('Lidarr API key not configured');
      }
    });
  });

  describe('searchArtist', () => {
    it('searches artist successfully with default limit', async () => {
      const mockResults = [{ id: 1, artistName: 'Test Artist' }];
      const mockJsonResults = vi.fn().mockResolvedValue(mockResults);
      const mockResponseSearch = new Response(JSON.stringify(mockResults), {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
      });
      mockResponseSearch.json = mockJsonResults;
      mockFetch.mockResolvedValueOnce(mockResponseSearch);
  
      const result = await searchArtist('Test Artist');
  
      expect(result).toEqual(mockResults);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8686/api/v1/artist/lookup?term=Test+Artist&limit=20',
        expect.any(Object),
      );
    });

    it('searches with custom limit', async () => {
      const mockResults2 = [{ id: 1, artistName: 'Test Artist' }];
      const mockJsonResults2 = vi.fn().mockResolvedValue(mockResults2);
      const mockResponseSearch2 = new Response(JSON.stringify(mockResults2), {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
      });
      mockResponseSearch2.json = mockJsonResults2;
      mockFetch.mockResolvedValueOnce(mockResponseSearch2);

      await searchArtist('Test Artist', 10);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=10'),
        expect.any(Object),
      );
    });

    it('throws METADATA_ERROR on error response', async () => {
      const mockError = { message: 'Service unavailable' };
      const mockJsonError = vi.fn().mockResolvedValue(mockError);
      const mockResponseError2 = new Response(JSON.stringify(mockError), {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
      });
      mockResponseError2.json = mockJsonError;
      mockFetch.mockResolvedValueOnce(mockResponseError2);
     
      const promise = searchArtist('Test');
      await expect(promise).rejects.toBeInstanceOf(ServiceError);
      const error = await promise.catch(e => e);
      if (error instanceof ServiceError) {
        expect(error.code).toBe('SEARCH_ERROR');
        expect(error.message).toContain('Service unavailable');
      }
    });

    it('throws SEARCH_ERROR on fetch failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const promise = searchArtist('Test');
      await expect(promise).rejects.toBeInstanceOf(ServiceError);
      const error = await promise.catch(e => e);
      if (error instanceof ServiceError) {
        expect(error.code).toBe('SEARCH_ERROR');
        expect(error.message).toContain('Failed to search artist');
      }
    });
  });

  describe('searchAlbum', () => {
    it('searches album successfully without artist', async () => {
      const mockResultsAlbum = [{ id: 1, title: 'Test Album' }];
      const mockJsonAlbum = vi.fn().mockResolvedValue(mockResultsAlbum);
      const mockResponseAlbum = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: mockJsonAlbum,
        redirected: false,
        type: 'basic' as ResponseType,
        url: '',
        body: null,
        bodyUsed: false,
        clone: vi.fn(),
        arrayBuffer: vi.fn(),
        blob: vi.fn(),
        formData: vi.fn(),
        text: vi.fn(),
      } as unknown as Response;
      mockFetch.mockResolvedValueOnce(mockResponseAlbum);
  
      const result = await searchAlbum('Test Album');
  
      expect(result).toEqual(mockResultsAlbum);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8686/api/v1/artist/lookup?term=Test+Album&limit=20',
        expect.any(Object),
      );
    });

    it('searches album with artist name', async () => {
      const mockEmpty = vi.fn().mockResolvedValue([]);
      const mockResponseEmpty = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: mockEmpty,
        redirected: false,
        type: 'basic' as ResponseType,
        url: '',
        body: null,
        bodyUsed: false,
        clone: vi.fn(),
        arrayBuffer: vi.fn(),
        blob: vi.fn(),
        formData: vi.fn(),
        text: vi.fn(),
      } as unknown as Response;
      mockFetch.mockResolvedValueOnce(mockResponseEmpty);
  
      await searchAlbum('Test Album', 'Test Artist');
  
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8686/api/v1/artist/lookup?term=Test+Album+Test+Artist&limit=20',
        expect.any(Object),
      );
    });

    it('throws SEARCH_ERROR on failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const promise = searchAlbum('Test');
      await expect(promise).rejects.toBeInstanceOf(ServiceError);
      const error = await promise.catch(e => e);
      if (error instanceof ServiceError) {
        expect(error.code).toBe('SEARCH_ERROR');
        expect(error.message).toContain('Failed to search album');
      }
    });
  });

  describe('getDownloadQueue', () => {
    it('fetches queue successfully', async () => {
      const mockQueue = [{ id: 1 }];
      const mockJsonQueue = vi.fn().mockResolvedValue(mockQueue);
      const mockResponseQueue = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: mockJsonQueue,
        redirected: false,
        type: 'basic' as ResponseType,
        url: '',
        body: null,
        bodyUsed: false,
        clone: vi.fn(),
        arrayBuffer: vi.fn(),
        blob: vi.fn(),
        formData: vi.fn(),
        text: vi.fn(),
      } as unknown as Response;
      mockFetch.mockResolvedValueOnce(mockResponseQueue);

      const result = await getDownloadQueue();

      expect(result).toEqual(mockQueue);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8686/api/v1/wanted/missing?includeArtist=true&includeAlbum=true',
        expect.any(Object),
      );
    });

    it('throws QUEUE_ERROR on failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const promise = getDownloadQueue();
      await expect(promise).rejects.toBeInstanceOf(ServiceError);
      const error = await promise.catch(e => e);
      if (error instanceof ServiceError) {
        expect(error.code).toBe('QUEUE_ERROR');
        expect(error.message).toContain('Failed to fetch queue');
      }
    });

    it('tests alias resolution', async () => {
      // Import a file using @ alias to test resolution
      const { cn } = await import('@/lib/utils');
      expect(cn).toBeDefined();
    });
  });
});