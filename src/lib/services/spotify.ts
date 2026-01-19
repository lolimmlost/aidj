import { getConfig } from '@/lib/config/config';
import { ServiceError } from '../utils';
import type { PlaylistPlatform } from '../db/schema/playlist-export.schema';
import type { ExportablePlaylist, ExportableSong } from './playlist-export';
import type { PlatformSearcher, PlatformSearchResult } from './song-matcher';

/**
 * Spotify API configuration
 */
interface SpotifyConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Spotify OAuth tokens
 */
interface SpotifyTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/**
 * Spotify API response types
 */
interface SpotifyTrack {
  id: string;
  name: string;
  artists: Array<{ id: string; name: string }>;
  album: {
    id: string;
    name: string;
    images: Array<{ url: string; width: number; height: number }>;
  };
  duration_ms: number;
  external_ids?: {
    isrc?: string;
  };
  uri: string;
  external_urls: {
    spotify: string;
  };
}

interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string | null;
  owner: { id: string; display_name: string };
  tracks: {
    total: number;
    items?: Array<{ track: SpotifyTrack }>;
  };
  images: Array<{ url: string }>;
  external_urls: { spotify: string };
}

interface SpotifySearchResponse {
  tracks?: {
    items: SpotifyTrack[];
    total: number;
  };
}

interface SpotifyPlaylistsResponse {
  items: SpotifyPlaylist[];
  total: number;
  next: string | null;
}

// Token storage (in-memory for simplicity, should use DB in production)
const tokenCache = new Map<string, SpotifyTokens>();

/**
 * Get Spotify configuration from app config
 */
function getSpotifyConfig(): SpotifyConfig {
  const config = getConfig();

  // These would be stored in the config system
  const spotifyConfig = {
    clientId: (config as Record<string, string>).spotifyClientId || '',
    clientSecret: (config as Record<string, string>).spotifyClientSecret || '',
    redirectUri: (config as Record<string, string>).spotifyRedirectUri || 'http://localhost:3000/api/auth/spotify/callback',
  };

  return spotifyConfig;
}

/**
 * Check if Spotify is configured
 */
export function isSpotifyConfigured(): boolean {
  const config = getSpotifyConfig();
  return !!(config.clientId && config.clientSecret);
}

/**
 * Generate Spotify OAuth authorization URL
 */
export function getAuthorizationUrl(userId: string, state?: string): string {
  const config = getSpotifyConfig();

  if (!config.clientId) {
    throw new ServiceError('SPOTIFY_NOT_CONFIGURED', 'Spotify client ID not configured');
  }

  const scopes = [
    'playlist-read-private',
    'playlist-read-collaborative',
    'playlist-modify-public',
    'playlist-modify-private',
    'user-library-read',
  ].join(' ');

  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: config.redirectUri,
    scope: scopes,
    state: state || userId,
    show_dialog: 'true',
  });

  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  userId: string
): Promise<SpotifyTokens> {
  const config = getSpotifyConfig();

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new ServiceError(
      'SPOTIFY_AUTH_ERROR',
      `Failed to exchange code: ${error.error_description || error.error}`
    );
  }

  const data = await response.json();
  const tokens: SpotifyTokens = {
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
export async function refreshAccessToken(userId: string): Promise<SpotifyTokens> {
  const config = getSpotifyConfig();
  const tokens = tokenCache.get(userId);

  if (!tokens?.refreshToken) {
    throw new ServiceError('SPOTIFY_NOT_AUTHENTICATED', 'User not authenticated with Spotify');
  }

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
    }),
  });

  if (!response.ok) {
    tokenCache.delete(userId);
    throw new ServiceError('SPOTIFY_AUTH_ERROR', 'Failed to refresh token');
  }

  const data = await response.json();
  const newTokens: SpotifyTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || tokens.refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  tokenCache.set(userId, newTokens);
  return newTokens;
}

/**
 * Get valid access token (refreshing if needed)
 */
async function getAccessToken(userId: string): Promise<string> {
  let tokens = tokenCache.get(userId);

  if (!tokens) {
    throw new ServiceError('SPOTIFY_NOT_AUTHENTICATED', 'User not authenticated with Spotify');
  }

  // Refresh if token expires in less than 5 minutes
  if (tokens.expiresAt < Date.now() + 5 * 60 * 1000) {
    tokens = await refreshAccessToken(userId);
  }

  return tokens.accessToken;
}

/**
 * Make authenticated Spotify API request
 */
async function spotifyFetch<T>(
  userId: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const accessToken = await getAccessToken(userId);

  const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (response.status === 429) {
    // Rate limited
    const retryAfter = parseInt(response.headers.get('Retry-After') || '1', 10);
    throw new ServiceError(
      'SPOTIFY_RATE_LIMIT',
      `Rate limited. Retry after ${retryAfter} seconds`,
      { retryAfter }
    );
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw new ServiceError(
      'SPOTIFY_API_ERROR',
      `Spotify API error: ${error.error?.message || response.statusText}`
    );
  }

  return response.json();
}

/**
 * Get user's playlists
 */
export async function getUserPlaylists(userId: string): Promise<ExportablePlaylist[]> {
  const playlists: ExportablePlaylist[] = [];
  let next: string | null = '/me/playlists?limit=50';

  while (next) {
    const endpoint = next.startsWith('/') ? next : next.replace('https://api.spotify.com/v1', '');
    const response = await spotifyFetch<SpotifyPlaylistsResponse>(userId, endpoint);

    for (const playlist of response.items) {
      playlists.push({
        name: playlist.name,
        description: playlist.description || undefined,
        creator: playlist.owner.display_name,
        platform: 'spotify',
        songs: [], // Will be populated when fetching full playlist
      });
    }

    next = response.next;
  }

  return playlists;
}

/**
 * Get full playlist with tracks
 */
export async function getPlaylist(userId: string, playlistId: string): Promise<ExportablePlaylist> {
  const playlist = await spotifyFetch<SpotifyPlaylist>(
    userId,
    `/playlists/${playlistId}`
  );

  const songs: ExportableSong[] = [];
  let next: string | null = `/playlists/${playlistId}/tracks?limit=100`;

  while (next) {
    const endpoint = next.startsWith('/') ? next : next.replace('https://api.spotify.com/v1', '');
    const response = await spotifyFetch<{
      items: Array<{ track: SpotifyTrack }>;
      next: string | null;
    }>(userId, endpoint);

    for (const item of response.items) {
      if (item.track) {
        songs.push(convertSpotifyTrack(item.track));
      }
    }

    next = response.next;
  }

  return {
    name: playlist.name,
    description: playlist.description || undefined,
    creator: playlist.owner.display_name,
    platform: 'spotify',
    songs,
  };
}

/**
 * Search for tracks
 */
export async function searchTracks(
  userId: string,
  query: string,
  limit: number = 10
): Promise<ExportableSong[]> {
  const response = await spotifyFetch<SpotifySearchResponse>(
    userId,
    `/search?type=track&q=${encodeURIComponent(query)}&limit=${limit}`
  );

  return (response.tracks?.items || []).map(convertSpotifyTrack);
}

/**
 * Search by ISRC
 */
export async function searchByIsrc(userId: string, isrc: string): Promise<ExportableSong[]> {
  const response = await spotifyFetch<SpotifySearchResponse>(
    userId,
    `/search?type=track&q=isrc:${encodeURIComponent(isrc)}&limit=5`
  );

  return (response.tracks?.items || []).map(convertSpotifyTrack);
}

/**
 * Create a new playlist
 */
export async function createPlaylist(
  userId: string,
  name: string,
  description?: string,
  isPublic: boolean = false
): Promise<string> {
  // First get the Spotify user ID
  const user = await spotifyFetch<{ id: string }>(userId, '/me');

  const playlist = await spotifyFetch<SpotifyPlaylist>(userId, `/users/${user.id}/playlists`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      description: description || '',
      public: isPublic,
    }),
  });

  return playlist.id;
}

/**
 * Add tracks to a playlist
 */
export async function addTracksToPlaylist(
  userId: string,
  playlistId: string,
  trackUris: string[]
): Promise<void> {
  // Spotify limits to 100 tracks per request
  const chunks = [];
  for (let i = 0; i < trackUris.length; i += 100) {
    chunks.push(trackUris.slice(i, i + 100));
  }

  for (const chunk of chunks) {
    await spotifyFetch(userId, `/playlists/${playlistId}/tracks`, {
      method: 'POST',
      body: JSON.stringify({ uris: chunk }),
    });
  }
}

/**
 * Convert Spotify track to ExportableSong
 */
function convertSpotifyTrack(track: SpotifyTrack): ExportableSong {
  return {
    id: track.id,
    title: track.name,
    artist: track.artists.map(a => a.name).join(', '),
    album: track.album.name,
    duration: Math.floor(track.duration_ms / 1000),
    isrc: track.external_ids?.isrc,
    platform: 'spotify',
    platformId: track.id,
    url: track.external_urls.spotify,
  };
}

/**
 * Create Spotify platform searcher
 */
export function createSpotifySearcher(userId: string): PlatformSearcher {
  return {
    platform: 'spotify' as PlaylistPlatform,

    async searchByIsrc(isrc: string): Promise<PlatformSearchResult[]> {
      const results = await searchByIsrc(userId, isrc);
      return results.map(song => ({
        platform: 'spotify' as PlaylistPlatform,
        platformId: song.platformId!,
        title: song.title,
        artist: song.artist,
        album: song.album,
        duration: song.duration,
        isrc: song.isrc,
        url: song.url,
      }));
    },

    async searchByTitleArtist(
      title: string,
      artist: string,
      album?: string
    ): Promise<PlatformSearchResult[]> {
      let query = `track:${title} artist:${artist}`;
      if (album) {
        query += ` album:${album}`;
      }

      const results = await searchTracks(userId, query, 10);
      return results.map(song => ({
        platform: 'spotify' as PlaylistPlatform,
        platformId: song.platformId!,
        title: song.title,
        artist: song.artist,
        album: song.album,
        duration: song.duration,
        isrc: song.isrc,
        url: song.url,
      }));
    },
  };
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
 * Store tokens (for loading from DB)
 */
export function setTokens(userId: string, tokens: SpotifyTokens): void {
  tokenCache.set(userId, tokens);
}

/**
 * Get tokens (for saving to DB)
 */
export function getTokens(userId: string): SpotifyTokens | undefined {
  return tokenCache.get(userId);
}
