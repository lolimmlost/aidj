import { createFileRoute } from '@tanstack/react-router';
import { withAuthAndErrorHandling, successResponse } from '@/lib/utils/api-response';
import { db } from '@/lib/db';
import { artistAffinities } from '@/lib/db/schema/profile.schema';
import { userPreferences } from '@/lib/db/schema/preferences.schema';
import { eq, desc } from 'drizzle-orm';
import { getSongsByArtist, getRandomSongs, search } from '@/lib/services/navidrome';

/** Fisher-Yates in-place shuffle */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Pick N random items from an array without replacement */
function sample<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  shuffle(copy);
  return copy.slice(0, n);
}

/**
 * GET /api/radio/shuffle
 *
 * Returns a shuffled list of songs for radio playback.
 * Strategy:
 * - Pull from a wider pool of affinity artists (top 30), randomly pick 10-15
 * - Fetch more songs per artist than needed, then randomly sample
 * - Deduplicate by song ID
 * - Mix in ~20% random library songs for discovery variety
 * - Final shuffle for a fresh mix every time
 */
const GET = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const userId = session.user.id;
    const url = new URL(request.url);
    const artistIdsParam = url.searchParams.get('artistIds');
    const count = Math.min(parseInt(url.searchParams.get('count') || '50', 10) || 50, 100);

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
      const songsPerArtist = Math.ceil((count * 2) / Math.max(artistIds.length, 1));

      const results = await Promise.all(
        artistIds.map((id) => getSongsByArtist(id, 0, songsPerArtist).catch(() => []))
      );

      // Randomly sample from each artist's catalog
      const allSongs = results.flatMap((artistSongs) => sample(artistSongs, Math.ceil(count / artistIds.length)));
      songs = allSongs.map(mapSong);
    } else {
      // Check user's artist affinities — pull wider pool, randomly select subset
      const allAffinities = await db
        .select()
        .from(artistAffinities)
        .where(eq(artistAffinities.userId, userId))
        .orderBy(desc(artistAffinities.affinityScore))
        .limit(30);

      if (allAffinities.length > 0) {
        // Randomly pick 10-15 artists from top 30 affinities (weighted toward top)
        // Split: top 5 always included, randomly sample 5-10 from remaining
        const guaranteed = allAffinities.slice(0, Math.min(5, allAffinities.length));
        const candidates = allAffinities.slice(5);
        const randomPicks = sample(candidates, Math.min(10, candidates.length));
        const selectedArtists = shuffle([...guaranteed, ...randomPicks]);

        // Fetch more songs per artist than needed so we can randomly sample
        const fetchPerArtist = Math.max(15, Math.ceil((count * 2) / selectedArtists.length));

        const results = await Promise.all(
          selectedArtists.map(async (affinity) => {
            try {
              // Search Navidrome for songs by this artist
              const found = await search(affinity.artist, 0, fetchPerArtist);
              return found;
            } catch {
              return [];
            }
          })
        );

        // Randomly sample from each artist's full catalog
        const affinitySongs = results.flatMap((artistSongs) => {
          const pickCount = Math.max(2, Math.ceil(count / selectedArtists.length));
          return sample(artistSongs, pickCount);
        });

        songs = affinitySongs.map(mapSong);

        // Mix in ~20% random library songs for discovery/variety
        const discoveryCount = Math.ceil(count * 0.2);
        try {
          const randomSongs = await getRandomSongs(discoveryCount);
          songs.push(...randomSongs.map(mapSong));
        } catch {
          // Non-critical, continue without discovery songs
        }
      } else {
        // No affinities — fully random from library
        const randomSongs = await getRandomSongs(count);
        songs = randomSongs.map(mapSong);
      }
    }

    // Deduplicate by song ID
    const seen = new Set<string>();
    songs = songs.filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });

    // Safe Mode: filter explicit songs if user has safeMode enabled
    try {
      const prefs = await db.select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, userId))
        .limit(1);

      const safeMode = prefs[0]?.playbackSettings?.safeMode ?? false;

      if (safeMode && songs.length > 0) {
        const { filterExplicitSongs } = await import('@/lib/services/explicit-content');
        const filtered = await filterExplicitSongs(songs);
        const removedCount = songs.length - filtered.length;
        if (removedCount > 0) {
          console.log(`🔒 Safe Mode: Filtered ${removedCount} explicit song(s) from radio shuffle`);
        }
        songs = filtered;
      }
    } catch (err) {
      console.warn('Safe Mode filter failed, continuing unfiltered:', err);
    }

    // Final shuffle
    shuffle(songs);

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
