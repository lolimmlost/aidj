import { getConfig } from '@/lib/config/config';
import { ServiceError } from '../utils';

// MeTube API types based on https://github.com/alexta69/metube

export type MeTubeQuality = 'best' | 'worst' | '1080' | '720' | '480' | '360';
export type MeTubeFormat = 'mp4' | 'mp3' | 'any';

export interface MeTubeAddRequest {
  url: string;
  quality?: MeTubeQuality;
  format?: MeTubeFormat;
  folder?: string;
  custom_name_prefix?: string;
  playlist_strict_mode?: boolean;
  playlist_item_limit?: number;
  auto_start?: boolean;
}

export interface MeTubeDownload {
  id: string;
  title: string;
  url: string;
  status: 'pending' | 'downloading' | 'finished' | 'error';
  msg?: string;
  percent?: number;
  speed?: string;
  eta?: string;
  filename?: string;
  folder?: string;
}

export interface MeTubeQueueResponse {
  done: Record<string, MeTubeDownload>;
  queue: Record<string, MeTubeDownload>;
}

interface MeTubeHistoryResponse {
  done: MeTubeHistoryItem[];
  queue: MeTubeHistoryItem[];
  pending: MeTubeHistoryItem[];
}

export interface MeTubeHistoryItem {
  id: string;
  title: string;
  url: string;
  status: 'finished' | 'error';
  filename?: string;
  folder?: string;
  timestamp?: string;
}

/**
 * Execute MeTube API request
 */
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
  timeout: number = 10000
): Promise<T> {
  const config = getConfig();
  if (!config.metubeUrl) {
    throw new ServiceError('METUBE_CONFIG_ERROR', 'MeTube URL not configured');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const url = `${config.metubeUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...((options.headers as Record<string, string>) || {}),
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new ServiceError(
        'METUBE_API_ERROR',
        `API request failed: ${response.status} ${response.statusText}`
      );
    }

    const text = await response.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  } catch (error: unknown) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      throw new ServiceError('METUBE_TIMEOUT_ERROR', `API request timed out (${timeout}ms limit)`);
    }

    if (error instanceof ServiceError) {
      throw error;
    }

    throw new ServiceError(
      'METUBE_API_ERROR',
      `API fetch error: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Add a URL to MeTube download queue
 */
export async function addDownload(request: MeTubeAddRequest): Promise<{ status: string }> {
  try {
    const payload = {
      url: request.url,
      quality: request.quality || 'best',
      format: request.format || 'mp3', // Default to mp3 for music
      folder: request.folder,
      custom_name_prefix: request.custom_name_prefix,
      playlist_strict_mode: request.playlist_strict_mode ?? true,
      playlist_item_limit: request.playlist_item_limit,
      auto_start: request.auto_start ?? true,
    };

    const result = await apiFetch<{ status: string }>('/add', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    return result;
  } catch (error) {
    console.error('Error adding download:', error);
    throw error;
  }
}

/**
 * Get download history from MeTube.
 * The /history endpoint returns { done: [...], queue: [...], pending: [...] }.
 */
async function fetchHistoryResponse(): Promise<MeTubeHistoryResponse> {
  try {
    const result = await apiFetch<MeTubeHistoryResponse | MeTubeHistoryItem[] | Record<string, MeTubeHistoryItem>>('/history');
    if (!result) return { done: [], queue: [], pending: [] };

    // Current MeTube returns { done: [], queue: [], pending: [] }
    if (typeof result === 'object' && !Array.isArray(result) && 'done' in result) {
      return result as MeTubeHistoryResponse;
    }

    // Legacy: plain array — treat all as done
    if (Array.isArray(result)) {
      return { done: result, queue: [], pending: [] };
    }

    // Legacy: flat object keyed by ID
    if (typeof result === 'object') {
      const items = Object.entries(result).map(([id, item]) => ({
        ...(item as MeTubeHistoryItem),
        id: (item as MeTubeHistoryItem).id || id,
      }));
      return { done: items, queue: [], pending: [] };
    }

    return { done: [], queue: [], pending: [] };
  } catch (error) {
    console.error('Error getting history:', error);
    return { done: [], queue: [], pending: [] };
  }
}

/**
 * Get current download queue and completed downloads
 */
export async function getQueue(): Promise<MeTubeQueueResponse> {
  try {
    const history = await fetchHistoryResponse();

    const done: Record<string, MeTubeDownload> = {};
    const queue: Record<string, MeTubeDownload> = {};

    const toDownload = (item: MeTubeHistoryItem, status: MeTubeDownload['status']): MeTubeDownload => ({
      id: item.id,
      title: item.title,
      url: item.url,
      status,
      filename: item.filename,
      folder: item.folder,
    });

    for (const item of history.done) {
      done[item.id] = toDownload(item, item.status === 'error' ? 'error' : 'finished');
    }
    for (const item of history.queue) {
      queue[item.id] = toDownload(item, 'downloading');
    }
    for (const item of history.pending) {
      queue[item.id] = toDownload(item, 'pending');
    }

    return { done, queue };
  } catch (error) {
    console.error('Error getting queue:', error);
    return { done: {}, queue: {} };
  }
}

/**
 * Get completed/failed download history from MeTube as a flat array.
 */
export async function getHistory(): Promise<MeTubeHistoryItem[]> {
  const resp = await fetchHistoryResponse();
  return resp.done;
}

/**
 * Delete downloads from queue or history
 */
export async function deleteDownloads(
  ids: string[],
  where: 'queue' | 'done' = 'done'
): Promise<{ status: string }> {
  try {
    const result = await apiFetch<{ status: string }>('/delete', {
      method: 'POST',
      body: JSON.stringify({ ids, where }),
    });
    return result;
  } catch (error) {
    console.error('Error deleting downloads:', error);
    throw error;
  }
}

/**
 * Start paused downloads
 */
export async function startDownloads(ids: string[]): Promise<{ status: string }> {
  try {
    const result = await apiFetch<{ status: string }>('/start', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
    return result;
  } catch (error) {
    console.error('Error starting downloads:', error);
    throw error;
  }
}

/**
 * Get MeTube version info
 */
export async function getVersion(): Promise<{ version: string }> {
  try {
    const result = await apiFetch<{ version: string }>('/version');
    return result;
  } catch (error) {
    console.error('Error getting version:', error);
    return { version: 'unknown' };
  }
}

/**
 * Check if MeTube is configured and reachable
 */
export async function checkConnection(): Promise<{
  connected: boolean;
  version?: string;
  error?: string;
}> {
  try {
    const config = getConfig();
    if (!config.metubeUrl) {
      return { connected: false, error: 'MeTube URL not configured' };
    }

    const versionInfo = await getVersion();
    return { connected: true, version: versionInfo.version };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

/**
 * Download a YouTube video/audio by URL
 * Convenience function that adds a download with sensible defaults for music
 */
export async function downloadMusic(
  url: string,
  options?: {
    title?: string;
    folder?: string;
  }
): Promise<{ status: string }> {
  return addDownload({
    url,
    quality: 'best',
    format: 'mp3',
    folder: options?.folder,
    custom_name_prefix: options?.title,
    auto_start: true,
  });
}

/**
 * Download a YouTube video
 * Convenience function that adds a video download
 */
export async function downloadVideo(
  url: string,
  options?: {
    quality?: MeTubeQuality;
    folder?: string;
  }
): Promise<{ status: string }> {
  return addDownload({
    url,
    quality: options?.quality || 'best',
    format: 'mp4',
    folder: options?.folder,
    auto_start: true,
  });
}

/**
 * Download an entire playlist
 */
export async function downloadPlaylist(
  url: string,
  options?: {
    format?: MeTubeFormat;
    folder?: string;
    limit?: number;
  }
): Promise<{ status: string }> {
  return addDownload({
    url,
    quality: 'best',
    format: options?.format || 'mp3',
    folder: options?.folder,
    playlist_strict_mode: false,
    playlist_item_limit: options?.limit,
    auto_start: true,
  });
}
