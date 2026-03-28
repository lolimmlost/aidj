import { ServiceError } from '../../utils';
import { apiFetch } from './core';
import { getSongsByIds } from './library';
import type { SubsonicApiResponse, ExtendedSongMetadata } from './types';

/**
 * Get extended metadata for a single song
 * Uses Subsonic API getSong to fetch detailed song info including BPM/key from ID3 tags
 */
export async function getSongWithExtendedMetadata(songId: string): Promise<ExtendedSongMetadata> {
  try {
    const endpoint = `/rest/getSong?id=${encodeURIComponent(songId)}`;
    const data = await apiFetch(endpoint) as SubsonicApiResponse;

    const song = data['subsonic-response']?.song || data.song;

    if (!song) {
      throw new ServiceError('NAVIDROME_API_ERROR', `Song not found: ${songId}`);
    }

    const bpm = song.bpm ? parseInt(song.bpm) : undefined;
    const _key = song.musicBrainzId ? undefined : undefined; // Key is not standard in Subsonic API

    return {
      id: songId,
      bpm: bpm && !isNaN(bpm) ? bpm : undefined,
      key: undefined, // Key detection will be handled separately
      energy: undefined, // Energy estimation will be handled separately
      fetchedAt: Date.now(),
      source: bpm ? 'navidrome' : 'estimated',
    };
  } catch (error) {
    console.warn(`Failed to get extended metadata for song ${songId}:`, error);
    return {
      id: songId,
      bpm: undefined,
      key: undefined,
      energy: undefined,
      fetchedAt: Date.now(),
      source: 'estimated',
    };
  }
}

/**
 * Get extended metadata for multiple songs in batch
 */
export async function getSongsWithExtendedMetadata(songIds: string[]): Promise<Map<string, ExtendedSongMetadata>> {
  const results = new Map<string, ExtendedSongMetadata>();

  if (songIds.length === 0) return results;

  try {
    const songs = await getSongsByIds(songIds);

    for (const song of songs) {
      results.set(song.id, {
        id: song.id,
        bpm: undefined,
        key: undefined,
        energy: undefined,
        fetchedAt: Date.now(),
        source: 'estimated',
      });
    }

    const missingSongIds = songIds.filter(id => !results.has(id));
    for (const songId of missingSongIds.slice(0, 10)) {
      try {
        const metadata = await getSongWithExtendedMetadata(songId);
        results.set(songId, metadata);
      } catch {
        // Skip failed songs
      }
    }
  } catch (error) {
    console.warn('Failed to get batch extended metadata:', error);
  }

  return results;
}
