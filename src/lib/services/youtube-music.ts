import { getConfig } from '@/lib/config/config';
import { ServiceError } from '../utils';
import type { PlaylistPlatform } from '../db/schema/playlist-export.schema';
import type { ExportablePlaylist, ExportableSong } from './playlist-export';
import type { PlatformSearcher, PlatformSearchResult } from './song-matcher';

/**
 * YouTube Music API configuration
 */
interface YouTubeMusicConfig {
  apiKey: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * YouTube OAuth tokens
 */
interface YouTubeTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/**
 * YouTube API response types
 */
interface YouTubePlaylistItem {
  id: string;
  snippet: {
    title: string;
    description: string;
    channelTitle: string;
    playlistId: string;
    position: number;
    resourceId: {
      kind: string;
      videoId: string;
    };
    thumbnails: {
      default?: { url: string };
      medium?: { url: string };
      high?: { url: string };
    };
  };
  contentDetails?: {
    videoId: string;
    duration?: string; // ISO 8601 duration
  };
}

interface YouTubePlaylist {
  id: string;
  snippet: {
    title: string;
    description: string;
    channelTitle: string;
    publishedAt: string;
    thumbnails: {
      default?: { url: string };
      medium?: { url: string };
      high?: { url: string };
    };
  };
  contentDetails: {
    itemCount: number;
  };
}

interface YouTubeSearchResult {
  id: {
    kind: string;
    videoId?: string;
    playlistId?: string;
  };
  snippet: {
    title: string;
    description: string;
    channelTitle: string;
    publishedAt: string;
    thumbnails: {
      default?: { url: string };
      medium?: { url: string };
    };
  };
}

interface YouTubeVideoDetails {
  id: string;
  snippet: {
    title: string;
    description: string;
    channelTitle: string;
    tags?: string[];
  };
  contentDetails: {
    duration: string; // ISO 8601 duration
  };
}

// Token storage
const tokenCache = new Map<string, YouTubeTokens>();

/**
 * Get YouTube Music configuration
 */
function getYouTubeMusicConfig(): YouTubeMusicConfig {
  const config = getConfig();

  return {
    apiKey: (config as Record<string, string>).youtubeApiKey || '',
    clientId: (config as Record<string, string>).youtubeClientId || '',
    clientSecret: (config as Record<string, string>).youtubeClientSecret || '',
    redirectUri: (config as Record<string, string>).youtubeRedirectUri || 'http://localhost:3000/api/auth/youtube/callback',
  };
}

/**
 * Check if YouTube Music is configured
 */
export function isYouTubeMusicConfigured(): boolean {
  const config = getYouTubeMusicConfig();
  return !!(config.apiKey || (config.clientId && config.clientSecret));
}

/**
 * Generate OAuth authorization URL
 */
export function getAuthorizationUrl(userId: string, state?: string): string {
  const config = getYouTubeMusicConfig();

  if (!config.clientId) {
    throw new ServiceError('YOUTUBE_NOT_CONFIGURED', 'YouTube client ID not configured');
  }

  const scopes = [
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/youtube',
  ].join(' ');

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: scopes,
    access_type: 'offline',
    prompt: 'consent',
    state: state || userId,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  userId: string
): Promise<YouTubeTokens> {
  const config = getYouTubeMusicConfig();

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: config.redirectUri,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new ServiceError(
      'YOUTUBE_AUTH_ERROR',
      `Failed to exchange code: ${error.error_description || error.error}`
    );
  }

  const data = await response.json();
  const tokens: YouTubeTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  tokenCache.set(userId, tokens);
  return tokens;
}

/**
 * Refresh access token
 */
export async function refreshAccessToken(userId: string): Promise<YouTubeTokens> {
  const config = getYouTubeMusicConfig();
  const tokens = tokenCache.get(userId);

  if (!tokens?.refreshToken) {
    throw new ServiceError('YOUTUBE_NOT_AUTHENTICATED', 'User not authenticated with YouTube');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: tokens.refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    tokenCache.delete(userId);
    throw new ServiceError('YOUTUBE_AUTH_ERROR', 'Failed to refresh token');
  }

  const data = await response.json();
  const newTokens: YouTubeTokens = {
    accessToken: data.access_token,
    refreshToken: tokens.refreshToken, // Google doesn't return new refresh token
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  tokenCache.set(userId, newTokens);
  return newTokens;
}

/**
 * Get valid access token
 */
async function getAccessToken(userId: string): Promise<string> {
  let tokens = tokenCache.get(userId);

  if (!tokens) {
    throw new ServiceError('YOUTUBE_NOT_AUTHENTICATED', 'User not authenticated with YouTube');
  }

  if (tokens.expiresAt < Date.now() + 5 * 60 * 1000) {
    tokens = await refreshAccessToken(userId);
  }

  return tokens.accessToken;
}

/**
 * Make authenticated YouTube API request
 */
async function youtubeFetch<T>(
  userId: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const accessToken = await getAccessToken(userId);

  const url = endpoint.startsWith('http')
    ? endpoint
    : `https://www.googleapis.com/youtube/v3${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (response.status === 403) {
    const error = await response.json();
    if (error.error?.errors?.[0]?.reason === 'quotaExceeded') {
      throw new ServiceError('YOUTUBE_QUOTA_EXCEEDED', 'YouTube API quota exceeded');
    }
    throw new ServiceError('YOUTUBE_API_ERROR', error.error?.message || 'Access denied');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw new ServiceError(
      'YOUTUBE_API_ERROR',
      `YouTube API error: ${error.error?.message || response.statusText}`
    );
  }

  return response.json();
}

/**
 * Get user's playlists
 */
export async function getUserPlaylists(userId: string): Promise<ExportablePlaylist[]> {
  const playlists: ExportablePlaylist[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      part: 'snippet,contentDetails',
      mine: 'true',
      maxResults: '50',
    });
    if (pageToken) {
      params.set('pageToken', pageToken);
    }

    const response = await youtubeFetch<{
      items: YouTubePlaylist[];
      nextPageToken?: string;
    }>(userId, `/playlists?${params.toString()}`);

    for (const playlist of response.items) {
      playlists.push({
        name: playlist.snippet.title,
        description: playlist.snippet.description || undefined,
        creator: playlist.snippet.channelTitle,
        platform: 'youtube_music',
        songs: [],
      });
    }

    pageToken = response.nextPageToken;
  } while (pageToken);

  return playlists;
}

/**
 * Get full playlist with tracks
 */
export async function getPlaylist(userId: string, playlistId: string): Promise<ExportablePlaylist> {
  // Get playlist metadata
  const playlistResponse = await youtubeFetch<{
    items: YouTubePlaylist[];
  }>(userId, `/playlists?part=snippet,contentDetails&id=${playlistId}`);

  const playlist = playlistResponse.items[0];
  if (!playlist) {
    throw new ServiceError('YOUTUBE_NOT_FOUND', 'Playlist not found');
  }

  // Get playlist items
  const songs: ExportableSong[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      part: 'snippet,contentDetails',
      playlistId,
      maxResults: '50',
    });
    if (pageToken) {
      params.set('pageToken', pageToken);
    }

    const response = await youtubeFetch<{
      items: YouTubePlaylistItem[];
      nextPageToken?: string;
    }>(userId, `/playlistItems?${params.toString()}`);

    // Get video details for duration
    const videoIds = response.items
      .map(item => item.snippet.resourceId.videoId)
      .filter(Boolean);

    const videoDetails = await getVideoDetails(userId, videoIds);

    for (const item of response.items) {
      const videoId = item.snippet.resourceId.videoId;
      const details = videoDetails.get(videoId);
      const song = parseYouTubeMusicTitle(item.snippet.title);

      songs.push({
        title: song.title,
        artist: song.artist || item.snippet.channelTitle,
        duration: details?.duration ? parseDuration(details.duration) : undefined,
        platform: 'youtube_music',
        platformId: videoId,
        url: `https://music.youtube.com/watch?v=${videoId}`,
      });
    }

    pageToken = response.nextPageToken;
  } while (pageToken);

  return {
    name: playlist.snippet.title,
    description: playlist.snippet.description || undefined,
    creator: playlist.snippet.channelTitle,
    platform: 'youtube_music',
    songs,
  };
}

/**
 * Get video details (for duration)
 */
async function getVideoDetails(
  userId: string,
  videoIds: string[]
): Promise<Map<string, YouTubeVideoDetails>> {
  const details = new Map<string, YouTubeVideoDetails>();

  // YouTube limits to 50 videos per request
  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    const response = await youtubeFetch<{
      items: YouTubeVideoDetails[];
    }>(userId, `/videos?part=snippet,contentDetails&id=${chunk.join(',')}`);

    for (const video of response.items) {
      details.set(video.id, video);
    }
  }

  return details;
}

/**
 * Search for videos/music
 */
export async function searchVideos(
  userId: string,
  query: string,
  limit: number = 10
): Promise<ExportableSong[]> {
  const params = new URLSearchParams({
    part: 'snippet',
    q: query,
    type: 'video',
    videoCategoryId: '10', // Music category
    maxResults: limit.toString(),
  });

  const response = await youtubeFetch<{
    items: YouTubeSearchResult[];
  }>(userId, `/search?${params.toString()}`);

  const videoIds = response.items
    .filter(item => item.id.videoId)
    .map(item => item.id.videoId!);

  const details = await getVideoDetails(userId, videoIds);

  return response.items
    .filter(item => item.id.videoId)
    .map(item => {
      const videoId = item.id.videoId!;
      const videoDetail = details.get(videoId);
      const parsed = parseYouTubeMusicTitle(item.snippet.title);

      return {
        title: parsed.title,
        artist: parsed.artist || item.snippet.channelTitle,
        duration: videoDetail?.contentDetails?.duration
          ? parseDuration(videoDetail.contentDetails.duration)
          : undefined,
        platform: 'youtube_music' as PlaylistPlatform,
        platformId: videoId,
        url: `https://music.youtube.com/watch?v=${videoId}`,
      };
    });
}

/**
 * Create a new playlist
 */
export async function createPlaylist(
  userId: string,
  title: string,
  description?: string,
  privacyStatus: 'private' | 'public' | 'unlisted' = 'private'
): Promise<string> {
  const response = await youtubeFetch<{ id: string }>(userId, '/playlists?part=snippet,status', {
    method: 'POST',
    body: JSON.stringify({
      snippet: {
        title,
        description: description || '',
      },
      status: {
        privacyStatus,
      },
    }),
  });

  return response.id;
}

/**
 * Add videos to a playlist
 */
export async function addVideosToPlaylist(
  userId: string,
  playlistId: string,
  videoIds: string[]
): Promise<void> {
  for (const videoId of videoIds) {
    await youtubeFetch(userId, '/playlistItems?part=snippet', {
      method: 'POST',
      body: JSON.stringify({
        snippet: {
          playlistId,
          resourceId: {
            kind: 'youtube#video',
            videoId,
          },
        },
      }),
    });

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

/**
 * Parse YouTube Music video title to extract artist and song
 * Common formats:
 * - "Artist - Song Title"
 * - "Artist - Song Title (Official Video)"
 * - "Song Title by Artist"
 */
function parseYouTubeMusicTitle(title: string): { title: string; artist?: string } {
  // Remove common suffixes
  const cleaned = title
    .replace(/\s*\(official\s*(music\s*)?video\)/gi, '')
    .replace(/\s*\(lyric\s*video\)/gi, '')
    .replace(/\s*\(audio\)/gi, '')
    .replace(/\s*\[official\s*(music\s*)?video\]/gi, '')
    .replace(/\s*\[lyric\s*video\]/gi, '')
    .replace(/\s*\[audio\]/gi, '')
    .replace(/\s*\(visualizer\)/gi, '')
    .replace(/\s*\(lyrics\)/gi, '')
    .trim();

  // Try "Artist - Title" format
  const dashMatch = cleaned.match(/^(.+?)\s*-\s*(.+)$/);
  if (dashMatch) {
    return {
      artist: dashMatch[1].trim(),
      title: dashMatch[2].trim(),
    };
  }

  // Try "Title by Artist" format
  const byMatch = cleaned.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch) {
    return {
      title: byMatch[1].trim(),
      artist: byMatch[2].trim(),
    };
  }

  // No artist found, return full title
  return { title: cleaned };
}

/**
 * Parse ISO 8601 duration to seconds
 */
function parseDuration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);

  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Create YouTube Music platform searcher
 */
export function createYouTubeMusicSearcher(userId: string): PlatformSearcher {
  return {
    platform: 'youtube_music' as PlaylistPlatform,

    async searchByIsrc(_isrc: string): Promise<PlatformSearchResult[]> {
      // YouTube doesn't support ISRC search directly
      // We could try searching by ISRC but it rarely works
      return [];
    },

    async searchByTitleArtist(
      title: string,
      artist: string,
      _album?: string
    ): Promise<PlatformSearchResult[]> {
      const query = `${artist} ${title}`;
      const results = await searchVideos(userId, query, 10);

      return results.map(song => ({
        platform: 'youtube_music' as PlaylistPlatform,
        platformId: song.platformId!,
        title: song.title,
        artist: song.artist,
        duration: song.duration,
        url: song.url,
      }));
    },
  };
}

/**
 * Get YouTube video URL for MeTube download
 */
export function getVideoUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(userId: string): boolean {
  const tokens = tokenCache.get(userId);
  return !!tokens?.accessToken;
}

/**
 * Logout (clear tokens)
 */
export function logout(userId: string): void {
  tokenCache.delete(userId);
}

/**
 * Store tokens
 */
export function setTokens(userId: string, tokens: YouTubeTokens): void {
  tokenCache.set(userId, tokens);
}

/**
 * Get tokens
 */
export function getTokens(userId: string): YouTubeTokens | undefined {
  return tokenCache.get(userId);
}
