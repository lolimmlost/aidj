// import { getConfig } from '../config/config';

/**
 * Mobile-specific performance optimization utilities
 */
export class MobileOptimization {
  private static instance: MobileOptimization;
  private cache = new Map<string, { data: unknown; timestamp: number; ttl: number }>();
  private requestQueue: Array<{ fn: () => Promise<unknown>; priority: number }> = [];
  private isProcessingQueue = false;

  private constructor() {
    // Initialize mobile detection - only in browser environment
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
      this.isMobile = this.detectMobile();
      this.networkType = this.detectNetworkType();
    } else {
      this.isMobile = false;
      this.networkType = 'unknown';
    }
  }

  static getInstance(): MobileOptimization {
    if (!MobileOptimization.instance) {
      MobileOptimization.instance = new MobileOptimization();
    }
    return MobileOptimization.instance;
  }

  // Mobile detection
  private isMobile: boolean;
  private networkType: 'wifi' | 'cellular' | 'unknown' | 'offline';

  /**
   * Detect if device is mobile
   */
  private detectMobile(): boolean {
    // Check if we're in a browser environment
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return false; // Default to false on server side
    }
    
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  /**
   * Detect network type
   */
  private detectNetworkType(): 'wifi' | 'cellular' | 'unknown' | 'offline' {
    // Check if we're in a browser environment
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return 'unknown'; // Default to unknown on server side
    }
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(navigator as any).connection) return 'unknown';
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const connection = (navigator as any).connection;
    if (connection.effectiveType) {
      if (connection.effectiveType.includes('2g') || connection.effectiveType.includes('3g')) {
        return 'cellular';
      } else if (connection.effectiveType.includes('4g') || connection.effectiveType.includes('wifi')) {
        return 'wifi';
      }
    }
    
    return connection.downlink > 0 ? 'wifi' : 'offline';
  }

  /**
   * Get current network conditions
   */
  getNetworkConditions() {
    // Check if we're in a browser environment
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return {
        isMobile: false,
        networkType: 'unknown' as const,
        effectiveType: 'unknown',
        downlink: 0,
        rtt: 0,
      };
    }
    
    try {
      return {
        isMobile: this.isMobile,
        networkType: this.networkType,
        effectiveType: (navigator as unknown as { connection?: { effectiveType?: string } }).connection?.effectiveType || 'unknown',
        downlink: (navigator as unknown as { connection?: { downlink?: number } }).connection?.downlink || 0,
        rtt: (navigator as unknown as { connection?: { rtt?: number } }).connection?.rtt || 0,
      };
    } catch {
      // If accessing navigator fails (e.g., during SSR), return safe defaults
      return {
        isMobile: false,
        networkType: 'unknown' as const,
        effectiveType: 'unknown',
        downlink: 0,
        rtt: 0,
      };
    }
  }

  /**
   * Adaptive timeout based on network conditions
   */
  getAdaptiveTimeout(): number {
    // Check if we're in a browser environment
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return 5000; // Default timeout for server side
    }
    
    if (!this.isMobile) return 5000; // Default 5s for desktop
    
    switch (this.networkType) {
      case 'wifi':
        return 3000; // 3s for WiFi
      case 'cellular':
        return 8000; // 8s for cellular (slower but acceptable)
      case 'offline':
        return 1000; // Quick fail for offline
      default:
        return 5000; // Default fallback
    }
  }

  /**
   * Request batching for mobile networks
   */
  async batchRequests<T>(
    requests: Array<() => Promise<T>>,
    batchSize: number = 3,
    delay: number = 100
  ): Promise<T[]> {
    if (!this.isMobile) {
      // Execute all requests immediately for desktop
      return Promise.all(requests.map(fn => fn()));
    }

    const results: T[] = [];
    
    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(fn => fn()));
      results.push(...batchResults);
      
      // Add delay between batches for mobile
      if (i + batchSize < requests.length) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    return results;
  }

  /**
   * Cache with TTL for mobile devices
   */
  setCache<T>(key: string, data: T, ttl: number = 300000): void {
    // Check if we're in a browser environment
    if (typeof window === 'undefined') return;
    
    if (!this.isMobile) return; // Don't cache on desktop
    
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  /**
   * Get cached data if available and not expired
   */
  getCache<T>(key: string): T | null {
    // Check if we're in a browser environment
    if (typeof window === 'undefined') return null;
    
    if (!this.isMobile) return null; // Don't use cache on desktop
    
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > cached.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data as T;
  }

  /**
   * Clear expired cache entries
   */
  clearExpiredCache(): void {
    const now = Date.now();
    for (const [key, cached] of this.cache.entries()) {
      if (now - cached.timestamp > cached.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Adaptive quality settings based on network conditions
   */
  getQualitySettings() {
    if (!this.isMobile) {
      return {
        imageQuality: 'high',
        audioQuality: 'high',
        preloadCount: 5,
        concurrentRequests: 3,
      };
    }

    switch (this.networkType) {
      case 'wifi':
        return {
          imageQuality: 'medium',
          audioQuality: 'high',
          preloadCount: 3,
          concurrentRequests: 2,
        };
      case 'cellular':
        return {
          imageQuality: 'low',
          audioQuality: 'medium',
          preloadCount: 1,
          concurrentRequests: 1,
        };
      case 'offline':
        return {
          imageQuality: 'none',
          audioQuality: 'none',
          preloadCount: 0,
          concurrentRequests: 0,
        };
      default:
        return {
          imageQuality: 'medium',
          audioQuality: 'medium',
          preloadCount: 2,
          concurrentRequests: 1,
        };
    }
  }

  /**
   * Debounce function for mobile input handling
   */
  debounce<T extends (...args: unknown[]) => unknown>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout;
    
    return (...args: Parameters<T>) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  }

  /**
   * Throttle function for mobile scroll events
   */
  throttle<T extends (...args: unknown[]) => unknown>(
    func: T,
    limit: number
  ): (...args: Parameters<T>) => void {
    let inThrottle: boolean;
    
    return (...args: Parameters<T>) => {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  }

  /**
   * Lazy loading utility for images and components
   */
  createIntersectionObserver(
    callback: (entries: IntersectionObserverEntry[]) => void,
    options?: IntersectionObserverInit
  ): IntersectionObserver {
    if (typeof IntersectionObserver === 'undefined') {
      return null as unknown as IntersectionObserver;
    }

    return new IntersectionObserver(callback, {
      root: null,
      rootMargin: '50px',
      threshold: 0.1,
      ...options,
    });
  }

  /**
   * Prefetch data based on user behavior patterns
   */
  async prefetchData(patterns: string[], currentPath: string): Promise<void> {
    if (!this.isMobile) return;

    // Simple pattern matching for prefetching
    const nextLikelyPaths = this.predictNextPaths(currentPath, patterns);
    
    // Prefetch in background with low priority
    nextLikelyPaths.forEach(path => {
      if (!this.getCache(path)) {
        // In a real implementation, you'd make a low-priority fetch here
        console.log(`Prefetching: ${path}`);
      }
    });
  }

  /**
   * Simple path prediction based on current path
   */
  private predictNextPaths(currentPath: string, patterns: string[]): string[] {
    // Simple heuristic - in real app, this would be more sophisticated
    const pathParts = currentPath.split('/');
    const lastPart = pathParts[pathParts.length - 1];
    
    // Return predicted next paths based on patterns
    return patterns
      .filter(pattern => pattern.includes(lastPart))
      .map(pattern => pattern.replace(`:${lastPart}`, 'next'));
  }

  /**
   * Network-aware retry strategy
   */
  async withRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === maxRetries) break;
        
        // Adaptive delay based on network conditions
        const delay = this.isMobile 
          ? baseDelay * Math.pow(2, attempt) * (this.networkType === 'cellular' ? 1.5 : 1)
          : baseDelay * Math.pow(2, attempt);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError!;
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.cache.clear();
    this.requestQueue = [];
    this.isProcessingQueue = false;
  }
}

// Export singleton instance
export const mobileOptimization = MobileOptimization.getInstance();

// Utility functions for easy access
export const getMobileOptimizations = () => mobileOptimization;
export const getNetworkConditions = () => mobileOptimization.getNetworkConditions();
export const getAdaptiveTimeout = () => mobileOptimization.getAdaptiveTimeout();
export const getQualitySettings = () => mobileOptimization.getQualitySettings();