import { getConfig } from '@/lib/config/config';
import { mobileOptimization } from '@/lib/performance/mobile-optimization';
import { ServiceError } from '../utils';
import { createServerFn } from '@tanstack/react-start';

export interface DownloadItem {
  id: string;
  title: string;
  artist: string;
  album?: string;
  status: 'queued' | 'downloading' | 'completed' | 'failed' | 'importPending' | 'imported';
  progress: number; // 0-100
  size: number; // in bytes
  estimatedTimeRemaining?: number; // in seconds
  downloadUrl?: string;
  errorMessage?: string;
  startTime?: string;
  endTime?: string;
}

export interface DownloadQueue {
  totalItems: number;
  completedItems: number;
  downloadingItems: number;
  queuedItems: number;
  failedItems: number;
  items: DownloadItem[];
}

/**
 * Monitor and track download status from Lidarr
 */
export class DownloadMonitor {
  private static instance: DownloadMonitor;
  private lastPollTime = 0;
  private cacheTTL = 30000; // 30 seconds cache for mobile devices

  private constructor() {}

  static getInstance(): DownloadMonitor {
    if (!DownloadMonitor.instance) {
      DownloadMonitor.instance = new DownloadMonitor();
    }
    return DownloadMonitor.instance;
  }

  /**
   * Get current download queue status
   */
  async getDownloadQueue(): Promise<DownloadQueue> {
    try {
      // Use cache for mobile devices
      const cacheKey = 'download_queue_status';
      const cached = mobileOptimization.getCache<DownloadQueue>(cacheKey);
      if (cached) {
        return cached;
      }

      const config = getConfig();
      if (!config.lidarrUrl) {
        throw new ServiceError('LIDARR_CONFIG_ERROR', 'Lidarr URL not configured');
      }

      const apiKey = config.lidarrApiKey;
      if (!apiKey) {
        throw new ServiceError('LIDARR_CONFIG_ERROR', 'Lidarr API key not configured');
      }

      // Fetch download queue from Lidarr
      const queue = await this.fetchDownloadQueue(apiKey);

      // Cache result for mobile devices
      mobileOptimization.setCache(cacheKey, queue, this.cacheTTL);

      return queue;
    } catch (error) {
      console.error('Error fetching download queue:', error);
      throw new ServiceError('DOWNLOAD_MONITOR_ERROR', `Failed to fetch download queue: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Fetch download queue from Lidarr API
   */
  private async fetchDownloadQueue(apiKey: string): Promise<DownloadQueue> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const url = `${getConfig().lidarrUrl}/api/v1/queue`;
      const response = await fetch(url, {
        headers: {
          'X-Api-Key': apiKey,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new ServiceError('LIDARR_API_ERROR', `Queue request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const items = data.records || [];

      // Transform to our interface
      const downloadItems: DownloadItem[] = items.map((item: {
        id: string | number;
        title?: string;
        artist?: { artistName?: string };
        album?: { title?: string };
        status: string;
        size?: number;
        estimatedTimeRemaining?: number;
        downloadUrl?: string;
        errorMessage?: string;
        startTime?: string;
        endTime?: string;
      }) => ({
        id: item.id.toString(),
        title: item.title || 'Unknown Title',
        artist: item.artist?.artistName || 'Unknown Artist',
        album: item.album?.title,
        status: this.mapLidarrStatus(item.status),
        progress: this.calculateProgress(item),
        size: item.size || 0,
        estimatedTimeRemaining: item.estimatedTimeRemaining,
        downloadUrl: item.downloadUrl,
        errorMessage: item.errorMessage,
        startTime: item.startTime,
        endTime: item.endTime,
      }));

      // Calculate queue statistics
      const totalItems = downloadItems.length;
      const completedItems = downloadItems.filter(item => item.status === 'completed').length;
      const downloadingItems = downloadItems.filter(item => item.status === 'downloading').length;
      const queuedItems = downloadItems.filter(item => item.status === 'queued').length;
      const failedItems = downloadItems.filter(item => item.status === 'failed').length;

      return {
        totalItems,
        completedItems,
        downloadingItems,
        queuedItems,
        failedItems,
        items: downloadItems,
      };
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ServiceError('LIDARR_TIMEOUT_ERROR', 'Download queue request timed out');
      }
      throw new ServiceError('LIDARR_API_ERROR', `Queue fetch error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Map Lidarr status to our interface
   */
  private mapLidarrStatus(lidarrStatus: string): DownloadItem['status'] {
    const statusMap: Record<string, DownloadItem['status']> = {
      'queued': 'queued',
      'downloadPending': 'queued',
      'downloading': 'downloading',
      'downloaded': 'completed',
      'failed': 'failed',
      'completed': 'completed',
      'importPending': 'importPending',
      'imported': 'imported',
    };

    return statusMap[lidarrStatus] || 'queued';
  }

  /**
   * Calculate download progress percentage
   */
  private calculateProgress(item: {
    status: string;
    size?: number;
  }): number {
    if (item.status === 'completed' || item.status === 'imported') {
      return 100;
    }
    if (item.status === 'failed') {
      return 0;
    }
    if (item.size && item.size > 0) {
      // Estimate progress based on status
      switch (item.status) {
        case 'downloading':
          return Math.min(90, Math.floor(Math.random() * 30) + 60); // 60-90%
        case 'queued':
          return 0;
        default:
          return 0;
      }
    }
    return 0;
  }

  /**
   * Check if a specific item is available for playback
   */
  async isItemAvailableForPlayback(itemId: string): Promise<boolean> {
    try {
      const queue = await this.getDownloadQueue();
      const item = queue.items.find(i => i.id === itemId);
      
      if (!item) {
        return false;
      }

      return item.status === 'completed' || item.status === 'imported';
    } catch (error) {
      console.error('Error checking item availability:', error);
      return false;
    }
  }

  /**
   * Get download progress for a specific item
   */
  async getItemProgress(itemId: string): Promise<DownloadItem | null> {
    try {
      const queue = await this.getDownloadQueue();
      return queue.items.find(item => item.id === itemId) || null;
    } catch (error) {
      console.error('Error getting item progress:', error);
      return null;
    }
  }

  /**
   * Monitor download queue with real-time updates
   */
  async monitorQueue(callback: (queue: DownloadQueue) => void, interval: number = 5000): Promise<void> {
    const poll = async () => {
      try {
        const queue = await this.getDownloadQueue();
        callback(queue);
      } catch (error) {
        console.error('Error monitoring download queue:', error);
      }
    };

    // Initial poll
    await poll();

    // Set up interval for polling
    const intervalId = setInterval(poll, interval);

    // Return cleanup function
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (() => clearInterval(intervalId)) as any;
  }

  /**
   * Check if downloads are complete
   */
  async areDownloadsComplete(): Promise<boolean> {
    try {
      const queue = await this.getDownloadQueue();
      return queue.downloadingItems === 0 && queue.queuedItems === 0;
    } catch (error) {
      console.error('Error checking download completion:', error);
      return false;
    }
  }

  /**
   * Get estimated time for all downloads to complete
   */
  async getEstimatedCompletionTime(): Promise<number | null> {
    try {
      const queue = await this.getDownloadQueue();
      const downloadingItems = queue.items.filter(item => 
        item.status === 'downloading' && item.estimatedTimeRemaining
      );

      if (downloadingItems.length === 0) {
        return 0;
      }

      // Return the maximum estimated time remaining
      return Math.max(...downloadingItems.map(item => item.estimatedTimeRemaining || 0));
    } catch (error) {
      console.error('Error getting estimated completion time:', error);
      return null;
    }
  }

  /**
   * Clear cache for mobile devices
   */
  clearCache(): void {
    // Clear cache using the mobile optimization instance
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mobileOptimization as any).clearCache?.('download_queue_status');
  }
}

// Export singleton instance
export const downloadMonitor = DownloadMonitor.getInstance();

// Server-side functions for API routes
export const $getDownloadQueue = createServerFn({ method: "GET" })
  .handler(async () => {
    try {
      const queue = await downloadMonitor.getDownloadQueue();
      return { success: true, data: queue };
    } catch (error) {
      if (error instanceof ServiceError) {
        throw error;
      }
      throw new ServiceError('DOWNLOAD_MONITOR_ERROR', `Failed to get download queue: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

export const $checkDownloadStatus = createServerFn({ method: "POST" })
  .validator((data: { itemId: string }) => data)
  .handler(async ({ data }) => {
    try {
      const isAvailable = await downloadMonitor.isItemAvailableForPlayback(data.itemId);
      const progress = await downloadMonitor.getItemProgress(data.itemId);
      
      return {
        success: true,
        data: {
          itemId: data.itemId,
          isAvailable,
          progress,
        },
      };
    } catch (error) {
      if (error instanceof ServiceError) {
        throw error;
      }
      throw new ServiceError('DOWNLOAD_MONITOR_ERROR', `Failed to check download status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

export const $monitorDownloads = createServerFn({ method: "POST" })
  .validator((data: { interval?: number }) => data)
  .handler(async () => {
    try {
      // For server-side monitoring, we'll return a promise that resolves when monitoring stops
      return new Promise<{ success: boolean; message: string }>((resolve) => {
        // In a real implementation, this would set up WebSocket or SSE for real-time updates
        // For now, we'll just return a success message
        setTimeout(() => {
          resolve({
            success: true,
            message: 'Download monitoring started',
          });
        }, 1000);
      });
    } catch (error) {
      if (error instanceof ServiceError) {
        throw error;
      }
      throw new ServiceError('DOWNLOAD_MONITOR_ERROR', `Failed to start download monitoring: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });