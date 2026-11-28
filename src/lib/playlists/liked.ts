/**
 * The app-managed Liked Songs playlist (the mirror of Navidrome stars). Safe on client and server.
 *
 * The server marks it with `isLikedSongs`; the name is the fallback for responses or rows that
 * don't carry the flag.
 */
export const LIKED_SONGS_NAME = '❤️ Liked Songs';

export function isLikedSongsPlaylist(p: { name: string; isLikedSongs?: boolean | null }): boolean {
  return p.isLikedSongs === true || p.name === LIKED_SONGS_NAME;
}
