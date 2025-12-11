import type { Song } from '@/lib/types/song';

interface PlaylistSong {
  id: string;
  songId: string;
  songArtistTitle: string;
  position: number;
  addedAt: Date;
}

/**
 * Convert playlist songs to the format expected by the audio player
 * Fetches full song metadata from Navidrome for proper playback
 */
export async function loadPlaylistIntoQueue(
  playlistId: string
): Promise<Song[]> {
  // Fetch playlist details
  const response = await fetch(`/api/playlists/${playlistId}`);
  if (!response.ok) {
    throw new Error('Failed to fetch playlist');
  }

  const json = await response.json();
  const playlist = json.data;

  if (!playlist.songs || playlist.songs.length === 0) {
    return [];
  }

  // Fetch full metadata for all songs in one batch using Navidrome's getSong endpoint
  const songIds = playlist.songs.map((s: PlaylistSong) => s.songId).join(',');
  let songsMap = new Map<string, any>();

  try {
    // Use Navidrome Subsonic API to get song metadata
    const metadataResponse = await fetch(`/api/navidrome/rest/getSong?id=${songIds}`);
    if (metadataResponse.ok) {
      const metadataJson = await metadataResponse.json();
      // Subsonic returns song array in subsonic-response.song
      const subsonicResponse = metadataJson['subsonic-response'];
      if (subsonicResponse && subsonicResponse.song) {
        const songsArray = Array.isArray(subsonicResponse.song)
          ? subsonicResponse.song
          : [subsonicResponse.song];
        songsArray.forEach((song: any) => {
          songsMap.set(song.id, song);
        });
      }
    }
  } catch (error) {
    console.error('Failed to fetch song metadata from Navidrome:', error);
  }

  // Map playlist songs to audio player format
  const songs: Song[] = playlist.songs.map((playlistSong: PlaylistSong) => {
    const metadata = songsMap.get(playlistSong.songId);

    if (metadata) {
      return {
        id: metadata.id,
        name: metadata.title || metadata.name,
        title: metadata.title,
        artist: metadata.artist,
        album: metadata.album,
        albumId: metadata.albumId || '',
        duration: parseInt(metadata.duration || '0'),
        track: parseInt(metadata.track || '0'),
        url: `/api/navidrome/stream/${metadata.id}`,
      };
    }

    // Fallback to parsed data if metadata not found
    const parts = playlistSong.songArtistTitle.split(' - ');
    const artist = parts[0] || 'Unknown Artist';
    const title = parts.slice(1).join(' - ') || playlistSong.songArtistTitle;

    return {
      id: playlistSong.songId,
      name: title,
      title: title,
      artist: artist,
      albumId: '',
      duration: 0,
      track: playlistSong.position,
      url: `/api/navidrome/stream/${playlistSong.songId}`,
    };
  });

  return songs;
}

/**
 * Helper to play a playlist immediately
 */
export async function playPlaylist(
  playlistId: string,
  setPlaylist: (songs: Song[]) => void,
  playSong: (songId: string, playlist: Song[]) => void
): Promise<void> {
  const songs = await loadPlaylistIntoQueue(playlistId);

  if (songs.length === 0) {
    throw new Error('Playlist is empty');
  }

  // Load playlist into audio store
  setPlaylist(songs);

  // Start playing first song
  playSong(songs[0].id, songs);
}
