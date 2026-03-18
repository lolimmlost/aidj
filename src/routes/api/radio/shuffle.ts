import { createFileRoute } from '@tanstack/react-router';
import { withAuthAndErrorHandling, successResponse } from '@/lib/utils/api-response';
import { db } from '@/lib/db';
import { artistAffinities } from '@/lib/db/schema/profile.schema';
import { eq, desc } from 'drizzle-orm';
import { getSongsByArtist, getRandomSongs, search } from '@/lib/services/navidrome';

/**
 * GET /api/radio/shuffle
 *
 * Returns a shuffled list of songs for radio playback.
 * - If artistIds provided: fetch songs from those artists
 * - If no artistIds but user has affinities: use top 10 affinity artists
 * - If no data: random songs from library
 */
const GET = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const userId = session.user.id;
    const url = new URL(request.url);
    const artistIdsParam = url.searchParams.get('artistIds');
    const count = Math.min(parseInt(url.searchParams.get('count') || '30', 10) || 30, 100);

    let songs: Array<{
      id: string;
      title: string;
      artist: string;
      album: string;
      albumArt?: string;
      duration: number;
    }> = [];

    if (artistIdsParam) {
      // Seed artists provided (e.g., from onboarding selections)
      const artistIds = artistIdsParam.split(',').filter(Boolean);
      const songsPerArtist = Math.ceil(count / Math.max(artistIds.length, 1));

      const artistSongPromises = artistIds.map((id) =>
        getSongsByArtist(id, 0, songsPerArtist).catch(() => [])
      );
      const results = await Promise.all(artistSongPromises);
      const allSongs = results.flat();

      songs = allSongs.map(mapSong);
    } else {
      // Check user's artist affinities
      const topArtists = await db
        .select()
        .from(artistAffinities)
        .where(eq(artistAffinities.userId, userId))
        .orderBy(desc(artistAffinities.affinityScore))
        .limit(10);

      if (topArtists.length > 0) {
        // Search Navidrome for each affinity artist by name, get their songs
        const songsPerArtist = Math.ceil(count / topArtists.length);

        const artistSongPromises = topArtists.map(async (affinity) => {
          try {
            // Search by artist name to find songs
            const found = await search(affinity.artist, 0, songsPerArtist);
            return found;
          } catch {
            return [];
          }
        });

        const results = await Promise.all(artistSongPromises);
        songs = results.flat().map(mapSong);
      } else {
        // No data at all — random songs from library
        const randomSongs = await getRandomSongs(count);
        songs = randomSongs.map(mapSong);
      }
    }

    // Fisher-Yates shuffle
    for (let i = songs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [songs[i], songs[j]] = [songs[j], songs[i]];
    }

    // Limit to requested count
    songs = songs.slice(0, count);

    return successResponse({ songs });
  },
  {
    service: 'radio',
    operation: 'shuffle',
    defaultCode: 'RADIO_SHUFFLE_ERROR',
    defaultMessage: 'Failed to generate radio shuffle',
  }
);

function mapSong(song: {
  id: string;
  title?: string;
  name?: string;
  artist?: string;
  album?: string;
  albumArt?: string;
  duration?: number;
  url?: string;
  albumId?: string;
  track?: number;
  genre?: string;
}) {
  return {
    id: song.id,
    title: song.title || song.name || 'Unknown',
    name: song.title || song.name || 'Unknown',
    artist: song.artist || 'Unknown Artist',
    album: song.album || 'Unknown Album',
    albumArt: song.albumArt || '',
    albumId: song.albumId || '',
    duration: song.duration || 0,
    url: song.url || '',
    track: song.track || 0,
    genre: song.genre || '',
  };
}

export const Route = createFileRoute('/api/radio/shuffle')({
  server: { handlers: { GET } },
});
