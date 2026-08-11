import { getConfig } from '@/lib/config/config';
import { ServiceError } from '../../utils';
import { getAuthToken, buildSubsonicUrl, subsonicToken, subsonicSalt, isBrowser, apiFetch } from './core';
import type { SubsonicCreds, SubsonicSong } from './types';

/**
 * Star a song in Navidrome (mark as "loved")
 * Uses Subsonic API star endpoint
 */
export async function starSong(songId: string, creds?: SubsonicCreds): Promise<void> {
  const config = getConfig();
  if (!config.navidromeUrl) {
    throw new ServiceError('NAVIDROME_CONFIG_ERROR', 'Navidrome URL not configured');
  }

  if (!creds && (!subsonicToken || !subsonicSalt)) {
    await getAuthToken();
  }

  try {
    const url = buildSubsonicUrl('star', creds);
    url.searchParams.append('id', songId);

    const response = await fetch(url.toString(), {
      method: 'GET',
    });

    if (!response?.ok) {
      throw new ServiceError('NAVIDROME_API_ERROR', `Failed to star song: ${response?.statusText ?? 'unknown error'}`);
    }

    const data = await response.json();
    if (data?.['subsonic-response']?.status !== 'ok') {
      throw new ServiceError('NAVIDROME_API_ERROR', `Subsonic API error: ${data?.['subsonic-response']?.error?.message || 'Unknown error'}`);
    }

    console.log(`⭐ Starred song ${songId} in Navidrome`);
  } catch (error) {
    console.error('Failed to star song in Navidrome:', error);
    throw error instanceof ServiceError ? error : new ServiceError('NAVIDROME_API_ERROR', `Failed to star song: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Unstar a song in Navidrome (remove "loved" flag)
 * Uses Subsonic API unstar endpoint
 */
export async function unstarSong(songId: string, creds?: SubsonicCreds): Promise<void> {
  const config = getConfig();
  if (!config.navidromeUrl) {
    throw new ServiceError('NAVIDROME_CONFIG_ERROR', 'Navidrome URL not configured');
  }

  if (!creds && (!subsonicToken || !subsonicSalt)) {
    await getAuthToken();
  }

  try {
    const url = buildSubsonicUrl('unstar', creds);
    url.searchParams.append('id', songId);

    const response = await fetch(url.toString(), {
      method: 'GET',
    });

    if (!response?.ok) {
      throw new ServiceError('NAVIDROME_API_ERROR', `Failed to unstar song: ${response?.statusText ?? 'unknown error'}`);
    }

    const data = await response.json();
    if (data?.['subsonic-response']?.status !== 'ok') {
      throw new ServiceError('NAVIDROME_API_ERROR', `Subsonic API error: ${data?.['subsonic-response']?.error?.message || 'Unknown error'}`);
    }

    console.log(`⭐ Unstarred song ${songId} in Navidrome`);
  } catch (error) {
    console.error('Failed to unstar song in Navidrome:', error);
    throw error instanceof ServiceError ? error : new ServiceError('NAVIDROME_API_ERROR', `Failed to unstar song: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get starred (favorited/loved) songs from Navidrome
 * Uses Subsonic API getStarred2 endpoint
 */
export async function getStarredSongs(creds?: SubsonicCreds): Promise<SubsonicSong[]> {
  const config = getConfig();
  if (!config.navidromeUrl) {
    throw new ServiceError('NAVIDROME_CONFIG_ERROR', 'Navidrome URL not configured');
  }

  // Server-side with admin creds (or no creds): use native API which has no
  // result cap. Navidrome's Subsonic getStarred2 silently truncates at ~334.
  const isAdmin = !creds || creds.username === config.navidromeUsername;
  if (!isBrowser() && isAdmin) {
    try {
      return await fetchStarredSongsNative();
    } catch (error) {
      console.warn('⭐ Native API starred fetch failed, falling back to Subsonic:', error);
    }
  }

  if (!creds && (!subsonicToken || !subsonicSalt)) {
    await getAuthToken();
  }

  try {
    const url = buildSubsonicUrl('getStarred2', creds);

    const response = await fetch(url.toString(), {
      method: 'GET',
    });

    if (!response?.ok) {
      throw new ServiceError('NAVIDROME_API_ERROR', `Failed to fetch starred songs: ${response?.statusText ?? 'unknown error'}`);
    }

    const data = await response.json();
    if (data?.['subsonic-response']?.status !== 'ok') {
      throw new ServiceError('NAVIDROME_API_ERROR', `Subsonic API error: ${data?.['subsonic-response']?.error?.message || 'Unknown error'}`);
    }

    const starredSongs = data['subsonic-response']?.starred2?.song || [];
    console.log(`⭐ Fetched ${starredSongs.length} starred songs from Navidrome (Subsonic)`);

    return starredSongs.map((song: { id: string; title?: string; name?: string; artist?: string; album?: string; albumId?: string; duration?: number; track?: number }) => ({
      id: song.id,
      title: song.title || song.name || '',
      artist: song.artist || '',
      album: song.album || '',
      albumId: song.albumId || '',
      duration: song.duration?.toString() || '0',
      track: song.track?.toString() || '0',
    }));
  } catch (error) {
    console.error('Failed to fetch starred songs from Navidrome:', error);
    throw error instanceof ServiceError ? error : new ServiceError('NAVIDROME_API_ERROR', `Failed to fetch starred songs: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

interface NativeSong {
  id: string;
  title?: string;
  artist?: string;
  album?: string;
  albumId?: string;
  duration?: number;
  trackNumber?: number;
}

/**
 * Fetch starred songs via Navidrome's native REST API (no result cap, unlike
 * Subsonic getStarred2 which truncates at ~334).
 *
 * @param missing - Controls the `missing` file filter:
 *   - `false` (default): exclude songs whose backing file is gone. This matches
 *     Subsonic getStarred2's behavior — it silently hides missing-file songs.
 *     Without this filter the native API returns "ghost stars" (DB rows for
 *     files deleted/moved by a Lidarr/Picard reorg), which the liked-songs sync
 *     would then re-merge into Liked Songs and queue for playback (dead IDs →
 *     skips). See GH #130.
 *   - `true`: return ONLY the ghost stars (missing files) — used by library
 *     reconciliation to find and clean them up.
 *   - `undefined`: no filter (both live and missing).
 */
async function fetchStarredSongsNative(missing: boolean | undefined = false): Promise<SubsonicSong[]> {
  const PAGE_SIZE = 500;
  const all: SubsonicSong[] = [];
  let start = 0;
  const missingParam = missing === undefined ? '' : `&missing=${missing}`;

  while (true) {
    const songs = await apiFetch<NativeSong[]>(
      `/api/song?_start=${start}&_end=${start + PAGE_SIZE}&_order=DESC&_sort=starred_at&starred=true${missingParam}`
    );

    for (const song of songs) {
      all.push({
        id: song.id,
        title: song.title || '',
        artist: song.artist || '',
        album: song.album || '',
        albumId: song.albumId || '',
        duration: song.duration?.toString() || '0',
        track: song.trackNumber?.toString() || '0',
      });
    }

    if (songs.length < PAGE_SIZE) break;
    start += PAGE_SIZE;
  }

  const label = missing === true ? 'ghost/missing ' : '';
  console.log(`⭐ Fetched ${all.length} ${label}starred songs from Navidrome (native API)`);
  return all;
}

/**
 * Fetch "ghost stars" — starred songs whose backing file is missing (deleted or
 * moved by a Lidarr/Picard reorg). These stream an XML error instead of audio
 * and are hidden by Subsonic getStarred2, so the normal star fetch never sees
 * them. Library reconciliation uses this to unstar/remap them. See GH #130.
 *
 * Server-side / admin only — the native API always authenticates as the admin
 * account, so callers must ensure the target account IS the admin account.
 * Returns [] in the browser.
 */
export async function getMissingStarredSongs(): Promise<SubsonicSong[]> {
  if (isBrowser()) return [];
  return fetchStarredSongsNative(true);
}

/**
 * Scrobble a song play in Navidrome (register play count)
 * Uses Subsonic API scrobble endpoint
 */
export async function scrobbleSong(songId: string, submission: boolean = true, time?: Date, creds?: SubsonicCreds): Promise<void> {
  const isClient = typeof window !== 'undefined';

  if (isClient) {
    try {
      const params = new URLSearchParams({
        id: songId,
        submission: submission.toString(),
        v: '1.16.1',
        c: 'aidj',
        f: 'json',
      });

      if (time) {
        params.append('time', time.getTime().toString());
      }

      const response = await fetch(`/api/navidrome/rest/scrobble?${params.toString()}`, {
        method: 'GET',
      });

      if (!response?.ok) {
        const errorText = await response.text();
        console.error('Failed to scrobble song:', errorText);
        return;
      }

      const data = await response.json();
      if (data?.['subsonic-response']?.status !== 'ok') {
        console.error('Subsonic API error:', data?.['subsonic-response']?.error?.message || 'Unknown error');
        return;
      }

      if (submission) {
        console.log(`🎵 Scrobbled song ${songId} in Navidrome (play count updated)`);
      } else {
        console.log(`▶️ Updated now playing status for song ${songId} in Navidrome`);
      }
    } catch (error) {
      console.error('Failed to scrobble song in Navidrome:', error);
    }
    return;
  }

  // Server-side: direct access to Navidrome
  const config = getConfig();
  if (!config.navidromeUrl) {
    throw new ServiceError('NAVIDROME_CONFIG_ERROR', 'Navidrome URL not configured');
  }

  if (!creds && (!subsonicToken || !subsonicSalt)) {
    await getAuthToken();
  }

  try {
    const url = buildSubsonicUrl('scrobble', creds);
    url.searchParams.append('id', songId);
    url.searchParams.append('submission', submission.toString());

    if (time) {
      url.searchParams.append('time', time.getTime().toString());
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
    });

    if (!response?.ok) {
      throw new ServiceError('NAVIDROME_API_ERROR', `Failed to scrobble song: ${response?.statusText ?? 'unknown error'}`);
    }

    const data = await response.json();
    if (data?.['subsonic-response']?.status !== 'ok') {
      throw new ServiceError('NAVIDROME_API_ERROR', `Subsonic API error: ${data?.['subsonic-response']?.error?.message || 'Unknown error'}`);
    }

    if (submission) {
      console.log(`🎵 Scrobbled song ${songId} in Navidrome (play count updated)`);
    } else {
      console.log(`▶️ Updated now playing status for song ${songId} in Navidrome`);
    }
  } catch (error) {
    console.error('Failed to scrobble song in Navidrome:', error);
  }
}
