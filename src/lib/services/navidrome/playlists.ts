import { getConfig } from '@/lib/config/config';
import { ServiceError } from '../../utils';
import { apiFetch, getAuthToken, buildSubsonicUrl } from './core';
import type { SubsonicCreds, SubsonicApiResponse, NavidromePlaylist, NavidromePlaylistWithSongs } from './types';

/**
 * Get all playlists for the authenticated user
 */
export async function getPlaylists(creds?: SubsonicCreds): Promise<NavidromePlaylist[]> {
  try {
    if (creds) {
      const config = getConfig();
      if (!config.navidromeUrl) {
        throw new ServiceError('NAVIDROME_CONFIG_ERROR', 'Navidrome URL not configured');
      }
      const url = buildSubsonicUrl('getPlaylists', creds);
      const response = await fetch(url.toString(), { method: 'GET' });
      if (!response.ok) {
        throw new ServiceError('NAVIDROME_API_ERROR', `Failed to fetch playlists: ${response.statusText}`);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await response.json() as any;
      const playlists = data['subsonic-response']?.playlists?.playlist || data.playlists?.playlist || [];
      console.log(`📋 Fetched ${playlists.length} playlists from Navidrome (per-user)`);
      return playlists as NavidromePlaylist[];
    }

    const endpoint = `/rest/getPlaylists`;
    const data = await apiFetch(endpoint) as SubsonicApiResponse;

    const playlists = data['subsonic-response']?.playlists?.playlist || data.playlists?.playlist || [];
    console.log(`📋 Fetched ${playlists.length} playlists from Navidrome`);
    return playlists as NavidromePlaylist[];
  } catch (error) {
    throw new ServiceError('NAVIDROME_API_ERROR', `Failed to fetch playlists: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get a single playlist with all its songs
 */
export async function getPlaylist(id: string, creds?: SubsonicCreds): Promise<NavidromePlaylistWithSongs> {
  try {
    if (creds) {
      const config = getConfig();
      if (!config.navidromeUrl) {
        throw new ServiceError('NAVIDROME_CONFIG_ERROR', 'Navidrome URL not configured');
      }
      const url = buildSubsonicUrl('getPlaylist', creds);
      url.searchParams.set('id', id);
      const response = await fetch(url.toString(), { method: 'GET' });
      if (!response.ok) {
        throw new ServiceError('NAVIDROME_API_ERROR', `Failed to fetch playlist: ${response.statusText}`);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await response.json() as any;
      const playlist = data['subsonic-response']?.playlist || data.playlist;
      if (!playlist) {
        throw new ServiceError('NAVIDROME_API_ERROR', `Playlist not found: ${id}`);
      }
      console.log(`📋 Fetched playlist "${playlist.name}" with ${playlist.songCount} songs (per-user)`);
      return playlist as NavidromePlaylistWithSongs;
    }

    const endpoint = `/rest/getPlaylist?id=${encodeURIComponent(id)}`;
    const data = await apiFetch(endpoint) as SubsonicApiResponse;

    const playlist = data['subsonic-response']?.playlist || data.playlist;
    if (!playlist) {
      throw new ServiceError('NAVIDROME_API_ERROR', `Playlist not found: ${id}`);
    }

    console.log(`📋 Fetched playlist "${playlist.name}" with ${playlist.songCount} songs`);
    return playlist as NavidromePlaylistWithSongs;
  } catch (error) {
    throw new ServiceError('NAVIDROME_API_ERROR', `Failed to fetch playlist: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Create a new playlist in Navidrome
 */
export async function createPlaylist(name: string, songIds?: string[], creds?: SubsonicCreds): Promise<NavidromePlaylist> {
  try {
    if (creds) {
      const config = getConfig();
      if (!config.navidromeUrl) {
        throw new ServiceError('NAVIDROME_CONFIG_ERROR', 'Navidrome URL not configured');
      }
      const url = buildSubsonicUrl('createPlaylist', creds);
      url.searchParams.set('name', name);
      if (songIds && songIds.length > 0) {
        songIds.forEach(id => url.searchParams.append('songId', id));
      }
      const response = await fetch(url.toString(), { method: 'POST' });
      if (!response.ok) {
        throw new ServiceError('NAVIDROME_API_ERROR', `Failed to create playlist: ${response.statusText}`);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await response.json() as any;
      const playlist = data['subsonic-response']?.playlist || data.playlist;
      if (!playlist) {
        throw new ServiceError('NAVIDROME_API_ERROR', 'Failed to create playlist: no response data');
      }
      console.log(`✅ Created playlist "${name}" with ${songIds?.length || 0} songs (per-user)`);
      return playlist as NavidromePlaylist;
    }

    let endpoint = `/rest/createPlaylist?name=${encodeURIComponent(name)}`;

    if (songIds && songIds.length > 0) {
      songIds.forEach(id => {
        endpoint += `&songId=${encodeURIComponent(id)}`;
      });
    }

    const data = await apiFetch(endpoint, { method: 'POST' }) as SubsonicApiResponse;

    const playlist = data['subsonic-response']?.playlist || data.playlist;
    if (!playlist) {
      throw new ServiceError('NAVIDROME_API_ERROR', 'Failed to create playlist: no response data');
    }

    console.log(`✅ Created playlist "${name}" with ${songIds?.length || 0} songs`);
    return playlist as NavidromePlaylist;
  } catch (error) {
    throw new ServiceError('NAVIDROME_API_ERROR', `Failed to create playlist: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Update an existing playlist (name and/or songs)
 */
export async function updatePlaylist(id: string, name?: string, songIds?: string[], creds?: SubsonicCreds): Promise<void> {
  try {
    if (creds) {
      const config = getConfig();
      if (!config.navidromeUrl) {
        throw new ServiceError('NAVIDROME_CONFIG_ERROR', 'Navidrome URL not configured');
      }
      const url = buildSubsonicUrl('updatePlaylist', creds);
      url.searchParams.set('playlistId', id);
      if (name) url.searchParams.set('name', name);
      if (songIds && songIds.length > 0) {
        songIds.forEach(songId => url.searchParams.append('songIdToAdd', songId));
      }
      const response = await fetch(url.toString(), { method: 'POST' });
      if (!response.ok) {
        throw new ServiceError('NAVIDROME_API_ERROR', `Failed to update playlist: ${response.statusText}`);
      }
      const data = await response.json() as SubsonicApiResponse;
      if (data['subsonic-response']?.status !== 'ok') {
        throw new ServiceError('NAVIDROME_API_ERROR', `Subsonic API error: ${data['subsonic-response']?.error?.message || 'Unknown error'}`);
      }
      console.log(`✅ Updated playlist ${id} (per-user)`);
      return;
    }

    let endpoint = `/rest/updatePlaylist?playlistId=${encodeURIComponent(id)}`;

    if (name) {
      endpoint += `&name=${encodeURIComponent(name)}`;
    }

    if (songIds && songIds.length > 0) {
      songIds.forEach(songId => {
        endpoint += `&songIdToAdd=${encodeURIComponent(songId)}`;
      });
    }

    const data = await apiFetch(endpoint, { method: 'POST' }) as SubsonicApiResponse;

    if (data['subsonic-response']?.status !== 'ok') {
      throw new ServiceError('NAVIDROME_API_ERROR', `Subsonic API error: ${data['subsonic-response']?.error?.message || 'Unknown error'}`);
    }

    console.log(`✅ Updated playlist ${id}`);
  } catch (error) {
    throw new ServiceError('NAVIDROME_API_ERROR', `Failed to update playlist: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Delete a playlist from Navidrome
 */
export async function deletePlaylist(id: string, creds?: SubsonicCreds): Promise<void> {
  try {
    if (creds) {
      const config = getConfig();
      if (!config.navidromeUrl) {
        throw new ServiceError('NAVIDROME_CONFIG_ERROR', 'Navidrome URL not configured');
      }
      const url = buildSubsonicUrl('deletePlaylist', creds);
      url.searchParams.set('id', id);
      const response = await fetch(url.toString(), { method: 'POST' });
      if (!response.ok) {
        throw new ServiceError('NAVIDROME_API_ERROR', `Failed to delete playlist: ${response.statusText}`);
      }
      const data = await response.json() as SubsonicApiResponse;
      if (data['subsonic-response']?.status !== 'ok') {
        throw new ServiceError('NAVIDROME_API_ERROR', `Subsonic API error: ${data['subsonic-response']?.error?.message || 'Unknown error'}`);
      }
      console.log(`🗑️ Deleted playlist ${id} (per-user)`);
      return;
    }

    const endpoint = `/rest/deletePlaylist?id=${encodeURIComponent(id)}`;
    const data = await apiFetch(endpoint, { method: 'POST' }) as SubsonicApiResponse;

    if (data['subsonic-response']?.status !== 'ok') {
      throw new ServiceError('NAVIDROME_API_ERROR', `Subsonic API error: ${data['subsonic-response']?.error?.message || 'Unknown error'}`);
    }

    console.log(`🗑️ Deleted playlist ${id}`);
  } catch (error) {
    throw new ServiceError('NAVIDROME_API_ERROR', `Failed to delete playlist: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Add songs to an existing playlist
 */
export async function addSongsToPlaylist(playlistId: string, songIds: string[], creds?: SubsonicCreds): Promise<void> {
  try {
    if (creds) {
      const config = getConfig();
      if (!config.navidromeUrl) {
        throw new ServiceError('NAVIDROME_CONFIG_ERROR', 'Navidrome URL not configured');
      }
      const url = buildSubsonicUrl('updatePlaylist', creds);
      url.searchParams.set('playlistId', playlistId);
      songIds.forEach(songId => url.searchParams.append('songIdToAdd', songId));
      const response = await fetch(url.toString(), { method: 'POST' });
      if (!response.ok) {
        throw new ServiceError('NAVIDROME_API_ERROR', `Failed to add songs to playlist: ${response.statusText}`);
      }
      const data = await response.json() as SubsonicApiResponse;
      if (data['subsonic-response']?.status !== 'ok') {
        throw new ServiceError('NAVIDROME_API_ERROR', `Subsonic API error: ${data['subsonic-response']?.error?.message || 'Unknown error'}`);
      }
      console.log(`➕ Added ${songIds.length} songs to playlist ${playlistId} (per-user)`);
      return;
    }

    let endpoint = `/rest/updatePlaylist?playlistId=${encodeURIComponent(playlistId)}`;

    songIds.forEach(songId => {
      endpoint += `&songIdToAdd=${encodeURIComponent(songId)}`;
    });

    const data = await apiFetch(endpoint, { method: 'POST' }) as SubsonicApiResponse;

    if (data['subsonic-response']?.status !== 'ok') {
      throw new ServiceError('NAVIDROME_API_ERROR', `Subsonic API error: ${data['subsonic-response']?.error?.message || 'Unknown error'}`);
    }

    console.log(`➕ Added ${songIds.length} songs to playlist ${playlistId}`);
  } catch (error) {
    throw new ServiceError('NAVIDROME_API_ERROR', `Failed to add songs to playlist: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
