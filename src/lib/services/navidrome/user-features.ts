import { getConfig } from '@/lib/config/config';
import { ServiceError } from '../../utils';
import { getAuthToken, buildSubsonicUrl, subsonicToken, subsonicSalt } from './core';
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
    console.log(`⭐ Fetched ${starredSongs.length} starred songs from Navidrome`);

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
