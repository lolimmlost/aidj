import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MobileOptimization } from '../mobile-optimization';

// Mock navigator
const mockNavigator = {
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
  connection: {
    effectiveType: '4g',
    downlink: 10,
    rtt: 100,
  },
};

Object.defineProperty(global, 'navigator', {
  value: mockNavigator,
  writable: true,
});

describe('MobileOptimization', () => {
  let optimization: MobileOptimization;

  beforeEach(() => {
    optimization = MobileOptimization.getInstance();
    vi.clearAllMocks();
  });

  afterEach(() => {
    optimization.cleanup();
  });

  describe('Mobile Detection', () => {
    it('should detect mobile devices correctly', () => {
      expect(optimization['isMobile']).toBe(true);
    });

    it('should detect network type', () => {
      const networkConditions = optimization.getNetworkConditions();
      expect(networkConditions.networkType).toBe('wifi');
      expect(networkConditions.isMobile).toBe(true);
    });
  });

  describe('Adaptive Timeout', () => {
    it('should return shorter timeout for WiFi', () => {
      const timeout = optimization.getAdaptiveTimeout();
      expect(timeout).toBe(3000); // WiFi timeout
    });

    it('should return longer timeout for cellular', () => {
      // Change network type to cellular
      optimization['networkType'] = 'cellular';
      const timeout = optimization.getAdaptiveTimeout();
      expect(timeout).toBe(8000); // Cellular timeout
    });

    it('should return quick fail for offline', () => {
      // Change network type to offline
      optimization['networkType'] = 'offline';
      const timeout = optimization.getAdaptiveTimeout();
      expect(timeout).toBe(1000); // Offline timeout
    });
  });

  describe('Caching', () => {
    it('should cache data for mobile devices', () => {
      optimization['isMobile'] = true;
      optimization.setCache('test-key', { data: 'test-value' }, 60000);

      const cached = optimization.getCache('test-key');
      expect(cached).toEqual({ data: 'test-value' });
    });

    it('should not cache data for desktop devices', () => {
      optimization['isMobile'] = false;
      optimization.setCache('test-key', { data: 'test-value' }, 60000);

      const cached = optimization.getCache('test-key');
      expect(cached).toBeNull();
    });

    it('should expire cached data', async () => {
      optimization['isMobile'] = true;
      optimization.setCache('test-key', { data: 'test-value' }, 1); // 1ms TTL

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10));

      const cached = optimization.getCache('test-key');
      expect(cached).toBeNull();
    });

    it('should clear expired cache entries', () => {
      optimization['isMobile'] = true;
      
      // Add expired entry
      optimization['cache'].set('expired-key', {
        data: 'expired-value',
        timestamp: Date.now() - 100000, // 100 seconds ago
        ttl: 50000, // 50 seconds TTL
      });

      // Add valid entry
      optimization.setCache('valid-key', { data: 'valid-value' }, 60000);

      optimization.clearExpiredCache();

      expect(optimization['cache'].has('expired-key')).toBe(false);
      expect(optimization['cache'].has('valid-key')).toBe(true);
    });
  });

  describe('Request Batching', () => {
    it('should batch requests for mobile devices', async () => {
      optimization['isMobile'] = true;
      
      const requests = [
        () => Promise.resolve('result1'),
        () => Promise.resolve('result2'),
        () => Promise.resolve('result3'),
      ];

      const results = await optimization.batchRequests(requests, 2, 10);

      expect(results).toEqual(['result1', 'result2', 'result3']);
    });

    it('should execute all requests immediately for desktop', async () => {
      optimization['isMobile'] = false;
      
      const requests = [
        () => Promise.resolve('result1'),
        () => Promise.resolve('result2'),
        () => Promise.resolve('result3'),
      ];

      const results = await optimization.batchRequests(requests, 2, 10);

      expect(results).toEqual(['result1', 'result2', 'result3']);
    });
  });

  describe('Quality Settings', () => {
    it('should return high quality settings for desktop', () => {
      optimization['isMobile'] = false;
      
      const settings = optimization.getQualitySettings();

      expect(settings.imageQuality).toBe('high');
      expect(settings.audioQuality).toBe('high');
      expect(settings.preloadCount).toBe(5);
      expect(settings.concurrentRequests).toBe(3);
    });

    it('should return medium quality settings for WiFi', () => {
      optimization['isMobile'] = true;
      optimization['networkType'] = 'wifi';
      
      const settings = optimization.getQualitySettings();

      expect(settings.imageQuality).toBe('medium');
      expect(settings.audioQuality).toBe('high');
      expect(settings.preloadCount).toBe(3);
      expect(settings.concurrentRequests).toBe(2);
    });

    it('should return low quality settings for cellular', () => {
      optimization['isMobile'] = true;
      optimization['networkType'] = 'cellular';
      
      const settings = optimization.getQualitySettings();

      expect(settings.imageQuality).toBe('low');
      expect(settings.audioQuality).toBe('medium');
      expect(settings.preloadCount).toBe(1);
      expect(settings.concurrentRequests).toBe(1);
    });

    it('should return minimal settings for offline', () => {
      optimization['isMobile'] = true;
      optimization['networkType'] = 'offline';
      
      const settings = optimization.getQualitySettings();

      expect(settings.imageQuality).toBe('none');
      expect(settings.audioQuality).toBe('none');
      expect(settings.preloadCount).toBe(0);
      expect(settings.concurrentRequests).toBe(0);
    });
  });

  describe('Debounce and Throttle', () => {
    it('should debounce function calls', async () => {
      const mockFn = vi.fn();
      const debouncedFn = optimization.debounce(mockFn, 100);

      debouncedFn();
      debouncedFn();
      debouncedFn();

      // Should not have been called yet
      expect(mockFn).not.toHaveBeenCalled();

      // Wait for debounce delay
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should have been called once
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should throttle function calls', () => {
      const mockFn = vi.fn();
      const throttledFn = optimization.throttle(mockFn, 100);

      throttledFn();
      throttledFn();
      throttledFn();

      // Should have been called once
      expect(mockFn).toHaveBeenCalledTimes(1);

      // Wait for throttle delay
      setTimeout(() => {
        throttledFn();
        expect(mockFn).toHaveBeenCalledTimes(2);
      }, 150);
    });
  });

  describe('Intersection Observer', () => {
    it('should create intersection observer when available', () => {
      const mockCallback = vi.fn();
      const observer = optimization.createIntersectionObserver(mockCallback);

      expect(observer).toBeInstanceOf(IntersectionObserver);
    });

    it('should return null when IntersectionObserver is not available', () => {
      // Delete IntersectionObserver from global scope
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      global.IntersectionObserver = undefined as unknown as any;

      const mockCallback = vi.fn();
      const observer = optimization.createIntersectionObserver(mockCallback);

      expect(observer).toBeNull();

      // Restore IntersectionObserver
      global.IntersectionObserver = window.IntersectionObserver;
    });
  });

  describe('Retry Strategy', () => {
    it('should retry failed requests with exponential backoff', async () => {
      const mockFn = vi.fn()
        .mockRejectedValueOnce(new Error('First attempt'))
        .mockResolvedValue('Success');

      const result = await optimization.withRetry(mockFn, 3, 100);

      expect(result).toBe('Success');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should throw error after max retries', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('Failed'));

      await expect(optimization.withRetry(mockFn, 2, 100)).rejects.toThrow('Failed');
      expect(mockFn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should use adaptive delays for mobile', async () => {
      optimization['isMobile'] = true;
      optimization['networkType'] = 'cellular';

      const mockFn = vi.fn()
        .mockRejectedValueOnce(new Error('First attempt'))
        .mockResolvedValue('Success');

      const startTime = Date.now();
      await optimization.withRetry(mockFn, 1, 100);
      const endTime = Date.now();

      // Should take longer due to cellular multiplier
      expect(endTime - startTime).toBeGreaterThan(100);
    });
  });

  describe('Prefetching', () => {
    it('should predict next paths based on current path', () => {
      const patterns = [
        'artists/:id/albums',
        'artists/:id/songs',
        'albums/:id/songs',
      ];

      const nextPaths = optimization['predictNextPaths']('artists/123', patterns);

      expect(nextPaths).toContain('artists/next/albums');
      expect(nextPaths).toContain('artists/next/songs');
    });

    it('should not prefetch on desktop', async () => {
      optimization['isMobile'] = false;
      
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await optimization.prefetchData(['artists/:id/albums'], 'current/path');

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('Network Conditions', () => {
    it('should return current network conditions', () => {
      const conditions = optimization.getNetworkConditions();

      expect(conditions).toHaveProperty('isMobile');
      expect(conditions).toHaveProperty('networkType');
      expect(conditions).toHaveProperty('effectiveType');
      expect(conditions).toHaveProperty('downlink');
      expect(conditions).toHaveProperty('rtt');
    });

    it('should handle missing connection API', () => {
      // Remove connection property
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (navigator as unknown as { connection?: unknown }).connection;

      const conditions = optimization.getNetworkConditions();

      expect(conditions.networkType).toBe('unknown');
      expect(conditions.effectiveType).toBe('unknown');
      expect(conditions.downlink).toBe(0);
      expect(conditions.rtt).toBe(0);
    });
  });
});