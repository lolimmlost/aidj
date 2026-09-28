import { createFileRoute } from '@tanstack/react-router';
import { withAuthAndErrorHandling, successResponse } from '@/lib/utils/api-response';
import { db } from '@/lib/db';
import { artistAffinities } from '@/lib/db/schema/profile.schema';
import { userPreferences } from '@/lib/db/schema/preferences.schema';
import { eq, desc } from 'drizzle-orm';
import { getSongsByArtist, getRandomSongs, resolveArtistIdByName } from '@/lib/services/navidrome';
import { getRecentlyPlayedSongIds } from '@/lib/services/listening-history';
import { shuffleSongs } from '@/lib/utils/shuffle-scoring';
import type { Song } from '@/lib/types/song';

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
 * Pick N random songs, taking ones not heard recently first. Drawing from an
 * artist's whole catalogue (not the first page of a search) is what keeps
 * deep cuts in rotation.
 */
function sampleSongs<T extends { id: string }>(songs: T[], n: number, recent: ReadonlySet<string>): T[] {
  const fresh = shuffle(songs.filter((s) => !recent.has(s.id)));
  const heard = shuffle(songs.filter((s) => recent.has(s.id)));
  return [...fresh, ...heard].slice(0, n);
}

/** Most songs fetched per artist — effectively the whole catalogue. */
const ARTIST_CATALOG_LIMIT = 1000;

function artistCatalog(artistId: string): Promise<Song[]> {
  return getSongsByArtist(artistId, 0, ARTIST_CATALOG_LIMIT).catch(() => []);
}

/**
 * GET /api/radio/shuffle
 *
 * Returns a shuffled list of songs for radio playback.
 * Strategy:
 * - Pull from a wider pool of affinity artists (top 50), randomly pick 10-15
 * - Only guarantee top 2 artists (not 5) to reduce repetition
 * - Sample each artist from their full catalogue, preferring songs not heard
 *   in the last 14 days
 * - Deduplicate by song ID
 * - Mix in ~30% random library songs for discovery variety
 * - Order with the shared spread shuffle (artists evenly spaced, recently
 *   heard songs last)
 */
const GET = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const userId = session.user.id;
    const url = new URL(request.url);
    const artistIdsParam = url.searchParams.get('artistIds');
    const count = Math.min(parseInt(url.searchParams.get('count') || '50', 10) || 50, 100);

    let songs: ReturnType<typeof mapSong>[];
    const recent = new Set(await getRecentlyPlayedSongIds(userId).catch(() => [] as string[]));

    if (artistIdsParam) {
      // Seed artists provided (e.g., from onboarding selections)
      const artistIds = artistIdsParam.split(',').filter(Boolean);
      const results = await Promise.all(artistIds.map(artistCatalog));

      // Randomly sample from each artist's catalog
      const allSongs = results.flatMap((artistSongs) => sampleSongs(artistSongs, Math.ceil(count / artistIds.length), recent));
      songs = allSongs.map(mapSong);
    } else {
      // Check user's artist affinities — pull wider pool, randomly select subset
      const allAffinities = await db
        .select()
        .from(artistAffinities)
        .where(eq(artistAffinities.userId, userId))
        .orderBy(desc(artistAffinities.affinityScore))
        .limit(50);

      if (allAffinities.length > 0) {
        // Only guarantee top 2 to avoid every shuffle feeling the same
        const guaranteed = allAffinities.slice(0, Math.min(2, allAffinities.length));
        const candidates = allAffinities.slice(2);
        const randomPicks = sample(candidates, Math.min(12, candidates.length));
        const selectedArtists = shuffle([...guaranteed, ...randomPicks]);

        // Each artist's whole catalogue. A name search only ever returned the
        // same top-ranked handful, so radio kept replaying the same songs.
        const results = await Promise.all(
          selectedArtists.map(async (affinity) => {
            const artistId = await resolveArtistIdByName(affinity.artist);
            return artistId ? artistCatalog(artistId) : [];
          })
        );

        // Randomly sample from each artist's full catalog
        const affinitySongs = results.flatMap((artistSongs) => {
          const pickCount = Math.max(2, Math.ceil(count / selectedArtists.length));
          return sampleSongs(artistSongs, pickCount, recent);
        });

        songs = affinitySongs.map(mapSong);

        // Mix in ~30% random library songs for discovery/variety
        const discoveryCount = Math.ceil(count * 0.3);
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

    // Spread artists evenly with recently heard songs last, then trim from the
    // end so those are the ones dropped.
    songs = (shuffleSongs(songs as Song[], { recentlyPlayedIds: recent }) as typeof songs).slice(0, count);

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
