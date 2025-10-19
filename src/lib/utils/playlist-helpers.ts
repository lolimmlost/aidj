import type { Song } from '@/components/ui/audio-player';

interface PlaylistSong {
  id: string;
  songId: string;
  songArtistTitle: string;
  position: number;
  addedAt: Date;
}

/**
 * Convert playlist songs to the format expected by the audio player
 * Note: This is a simplified implementation. In a production app, you would
 * fetch full song metadata from Navidrome for each song ID.
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

  // Convert playlist songs to Song[] format
  // For now, we'll create song objects from the stored data
  // In a real implementation, you'd fetch full metadata from Navidrome
  const songs: Song[] = playlist.songs.map((playlistSong: PlaylistSong) => {
    // Parse "Artist - Title" format
    const parts = playlistSong.songArtistTitle.split(' - ');
    const artist = parts[0] || 'Unknown Artist';
    const title = parts.slice(1).join(' - ') || playlistSong.songArtistTitle;

    return {
      id: playlistSong.songId,
      name: title,
      artist: artist,
      // These fields would ideally come from Navidrome metadata
      albumId: '', // Not available in playlist data
      duration: 0, // Not available in playlist data
      track: playlistSong.position,
      url: `/api/navidrome/stream/${playlistSong.songId}`, // Stream URL
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
