/**
 * Navidrome Native Smart Playlist Service
 *
 * Creates and manages smart playlists using Navidrome's native REST API.
 * Smart playlists are evaluated server-side by Navidrome using its rule engine,
 * supporting 60+ fields, date operators, per-user annotations, and true random sorting.
 *
 * This replaces the broken client-side evaluator (smart-playlist-evaluator.ts)
 * which fetched all 10k songs and filtered in JavaScript with stub date operators.
 */

import { getAuthToken, type Song } from './navidrome';
import { getConfig } from '../config/config';
import { ServiceError } from '../utils';

// ============================================================================
// Types — Navidrome .nsp rule format
// ============================================================================

export type SmartPlaylistOperator =
  | 'is' | 'isNot'
  | 'gt' | 'lt'
  | 'contains' | 'notContains'
  | 'startsWith' | 'endsWith'
  | 'inTheRange'
  | 'before' | 'after'
  | 'inTheLast' | 'notInTheLast'
  | 'inPlaylist' | 'notInPlaylist';

export type RuleCondition =
  | Record<string, Record<string, string | number | boolean | [number, number]>>
  | { all: RuleCondition[] }
  | { any: RuleCondition[] };

export interface SmartPlaylistRules {
  name?: string;
  comment?: string;
  all?: RuleCondition[];
  any?: RuleCondition[];
  sort?: string;
  order?: 'asc' | 'desc';
  limit?: number;
}

interface NavidromePlaylistResponse {
  id: string;
  name: string;
  comment?: string;
  songCount: number;
  duration: number;
  public: boolean;
  owner: string;
  rules?: SmartPlaylistRules;
  createdAt?: string;
  updatedAt?: string;
}

interface NavidromeSongResponse {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumId: string;
  artistId?: string;
  duration: number;
  trackNumber?: number;
  genre?: string;
  year?: number;
  playCount?: number;
  rating?: number;
  starred?: boolean;
  path?: string;
}

// ============================================================================
// Core API functions
// ============================================================================

/**
 * Sanitize rules before sending to Navidrome.
 * Removes empty arrays and undefined values that Navidrome rejects as invalid.
 */
function sanitizeRules(rules: SmartPlaylistRules): SmartPlaylistRules {
  const clean: SmartPlaylistRules = {};
  if (rules.all && rules.all.length > 0) clean.all = rules.all;
  if (rules.any && rules.any.length > 0) clean.any = rules.any;
  if (rules.sort) clean.sort = rules.sort;
  if (rules.order) clean.order = rules.order;
  if (rules.limit) clean.limit = rules.limit;
  if (rules.name) clean.name = rules.name;
  if (rules.comment) clean.comment = rules.comment;
  return clean;
}

/**
 * Create a smart playlist in Navidrome using native REST API.
 * Navidrome evaluates the rules server-side — no client-side filtering needed.
 */
export async function createSmartPlaylist(
  name: string,
  rules: SmartPlaylistRules,
  isPublic: boolean = false,
): Promise<NavidromePlaylistResponse> {
  const config = getConfig();
  if (!config.navidromeUrl) {
    throw new ServiceError('NAVIDROME_CONFIG_ERROR', 'Navidrome URL not configured');
  }

  const adminToken = await getAuthToken();
  const cleanRules = sanitizeRules(rules);

  const response = await fetch(`${config.navidromeUrl}/api/playlist`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-nd-authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      name,
      comment: rules.comment || '',
      public: isPublic,
      rules: cleanRules,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new ServiceError(
      'NAVIDROME_API_ERROR',
      `Failed to create smart playlist: ${response.status} ${errorText}`,
    );
  }

  return await response.json();
}

/**
 * Update an existing smart playlist's rules in Navidrome.
 */
export async function updateSmartPlaylist(
  playlistId: string,
  updates: { name?: string; rules?: SmartPlaylistRules; comment?: string; public?: boolean },
): Promise<NavidromePlaylistResponse> {
  const config = getConfig();
  if (!config.navidromeUrl) {
    throw new ServiceError('NAVIDROME_CONFIG_ERROR', 'Navidrome URL not configured');
  }

  const adminToken = await getAuthToken();

  const response = await fetch(`${config.navidromeUrl}/api/playlist/${playlistId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-nd-authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new ServiceError(
      'NAVIDROME_API_ERROR',
      `Failed to update smart playlist: ${response.status} ${errorText}`,
    );
  }

  return await response.json();
}

/**
 * Get songs from a Navidrome playlist (works for both smart and regular playlists).
 * For smart playlists, Navidrome evaluates the rules server-side and returns matching songs.
 */
export async function getSmartPlaylistSongs(
  playlistId: string,
  start: number = 0,
  limit: number = 500,
): Promise<Song[]> {
  const config = getConfig();
  if (!config.navidromeUrl) {
    throw new ServiceError('NAVIDROME_CONFIG_ERROR', 'Navidrome URL not configured');
  }

  const adminToken = await getAuthToken();

  const response = await fetch(
    `${config.navidromeUrl}/api/playlist/${playlistId}/tracks?_start=${start}&_end=${start + limit}`,
    {
      headers: {
        'x-nd-authorization': `Bearer ${adminToken}`,
      },
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new ServiceError(
      'NAVIDROME_API_ERROR',
      `Failed to get smart playlist songs: ${response.status} ${errorText}`,
    );
  }

  const tracks: NavidromeSongResponse[] = await response.json();
  return tracks.map(songFromNavidrome);
}

/**
 * Delete a smart playlist from Navidrome.
 */
export async function deleteSmartPlaylist(playlistId: string): Promise<void> {
  const config = getConfig();
  if (!config.navidromeUrl) {
    throw new ServiceError('NAVIDROME_CONFIG_ERROR', 'Navidrome URL not configured');
  }

  const adminToken = await getAuthToken();

  const response = await fetch(`${config.navidromeUrl}/api/playlist/${playlistId}`, {
    method: 'DELETE',
    headers: {
      'x-nd-authorization': `Bearer ${adminToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new ServiceError(
      'NAVIDROME_API_ERROR',
      `Failed to delete smart playlist: ${response.status} ${errorText}`,
    );
  }
}

/**
 * List all playlists from Navidrome (both smart and regular).
 * Smart playlists have a non-null `rules` field.
 */
export async function listSmartPlaylists(): Promise<NavidromePlaylistResponse[]> {
  const config = getConfig();
  if (!config.navidromeUrl) {
    throw new ServiceError('NAVIDROME_CONFIG_ERROR', 'Navidrome URL not configured');
  }

  const adminToken = await getAuthToken();

  const response = await fetch(
    `${config.navidromeUrl}/api/playlist?_start=0&_end=500&_sort=name&_order=ASC`,
    {
      headers: {
        'x-nd-authorization': `Bearer ${adminToken}`,
      },
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new ServiceError(
      'NAVIDROME_API_ERROR',
      `Failed to list playlists: ${response.status} ${errorText}`,
    );
  }

  const playlists: NavidromePlaylistResponse[] = await response.json();
  // Filter to only smart playlists (those with rules)
  return playlists.filter(p => p.rules != null);
}

// ============================================================================
// Preview — create temporary smart playlist, get songs, delete it
// ============================================================================

/**
 * Preview songs that match smart playlist rules without permanently saving.
 * Creates a temporary playlist, fetches matching songs, then deletes it.
 */
export async function previewSmartPlaylistRules(
  rules: SmartPlaylistRules,
  limit: number = 50,
): Promise<Song[]> {
  const tempName = `__aidj_preview_${Date.now()}`;

  let tempPlaylist: NavidromePlaylistResponse | null = null;
  try {
    // Create temporary smart playlist
    tempPlaylist = await createSmartPlaylist(tempName, rules);
    console.log(`🔍 Created temp smart playlist ${tempPlaylist.id} with ${tempPlaylist.songCount} matches`);

    // Fetch songs from it
    const songs = await getSmartPlaylistSongs(tempPlaylist.id, 0, limit);

    return songs;
  } finally {
    // Always clean up the temporary playlist
    if (tempPlaylist) {
      try {
        await deleteSmartPlaylist(tempPlaylist.id);
      } catch (cleanupError) {
        console.warn('Failed to clean up temp preview playlist:', cleanupError);
      }
    }
  }
}

// ============================================================================
// Queue integration — get random songs matching rules for queue generation
// ============================================================================

/**
 * Get random songs from Navidrome matching smart playlist rules.
 * Uses `sort: 'random'` to get truly random results evaluated server-side.
 * Ideal for queue panel song generation.
 */
export async function getRandomSongsFromRules(
  rules: SmartPlaylistRules,
  count: number = 50,
): Promise<Song[]> {
  // Force random sort and limit
  const randomRules: SmartPlaylistRules = {
    ...rules,
    sort: 'random',
    limit: count,
  };

  return previewSmartPlaylistRules(randomRules, count);
}

/**
 * Get random songs matching a simple filter (genre, year range, etc).
 * Convenience wrapper for queue generation without full rule building.
 */
export async function getRandomSongsFiltered(options: {
  genre?: string;
  yearFrom?: number;
  yearTo?: number;
  lovedOnly?: boolean;
  minPlayCount?: number;
  maxPlayCount?: number;
  minRating?: number;
  count?: number;
} = {}): Promise<Song[]> {
  const conditions: RuleCondition[] = [];

  if (options.genre) {
    conditions.push({ is: { genre: options.genre } });
  }
  if (options.yearFrom && options.yearTo) {
    conditions.push({ inTheRange: { year: [options.yearFrom, options.yearTo] } });
  } else if (options.yearFrom) {
    conditions.push({ gt: { year: options.yearFrom - 1 } });
  } else if (options.yearTo) {
    conditions.push({ lt: { year: options.yearTo + 1 } });
  }
  if (options.lovedOnly) {
    conditions.push({ is: { loved: true } });
  }
  if (options.minPlayCount !== undefined) {
    conditions.push({ gt: { playcount: options.minPlayCount - 1 } });
  }
  if (options.maxPlayCount !== undefined) {
    conditions.push({ lt: { playcount: options.maxPlayCount + 1 } });
  }
  if (options.minRating !== undefined) {
    conditions.push({ gt: { rating: options.minRating - 1 } });
  }

  const rules: SmartPlaylistRules = {
    all: conditions.length > 0 ? conditions : undefined,
    sort: 'random',
    limit: options.count || 50,
  };

  return getRandomSongsFromRules(rules, options.count || 50);
}

// ============================================================================
// Helpers
// ============================================================================

function songFromNavidrome(track: NavidromeSongResponse): Song {
  return {
    id: track.id,
    name: track.title,
    title: track.title,
    artist: track.artist,
    album: track.album,
    albumId: track.albumId,
    artistId: track.artistId,
    duration: track.duration,
    track: track.trackNumber || 0,
    url: `/api/navidrome/stream/${track.id}`,
    genre: track.genre,
    year: track.year,
    playCount: track.playCount,
    rating: track.rating,
    loved: track.starred,
  };
}
