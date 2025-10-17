// Library indexing service for fast song lookup and AI context
import { getArtists, getAlbums, getSongs, type Song, type Artist } from './navidrome';
import { ServiceError } from '../utils';

export interface LibraryIndex {
  songs: Map<string, Song>; // "Artist - Title" → Song object
  artistSongs: Map<string, Song[]>; // Artist name → their songs
  songList: string[]; // All songs as "Artist - Title" strings
  artists: string[]; // All artist names
  lastUpdated: number;
}

// In-memory cache
let libraryIndexCache: LibraryIndex | null = null;
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

/**
 * Get normalized song key for indexing
 */
function getSongKey(artist: string, title: string): string {
  return `${artist.toLowerCase().trim()} - ${title.toLowerCase().trim()}`;
}

/**
 * Build library index from Navidrome data
 * Fetches all artists and their songs, creates searchable index
 * SIMPLIFIED: Focus on getting actual songs quickly
 */
export async function buildLibraryIndex(forceRefresh = false): Promise<LibraryIndex> {
  // Return cached index if valid
  if (!forceRefresh && libraryIndexCache && Date.now() - libraryIndexCache.lastUpdated < CACHE_TTL) {
    console.log('📦 Using cached library index');
    return libraryIndexCache;
  }

  console.log('🔨 Building library index...');
  const startTime = Date.now();

  try {
    const songs = new Map<string, Song>();
    const artistSongs = new Map<string, Song[]>();
    const songList: string[] = [];
    const artists: string[] = [];

    // Fetch all artists - LIMIT TO REASONABLE NUMBER
    const allArtists = await getArtists(0, 50); // Fetch 50 artists max

    console.log(`📚 Indexing ${allArtists.length} artists...`);

    let totalSongsIndexed = 0;

    // Process each artist - limit processing to avoid timeouts
    for (const artist of allArtists) {
      artists.push(artist.name);
      const artistName = artist.name;
      const artistTopSongs: Song[] = [];

      try {
        // Get albums for this artist
        const albums = await getAlbums(artist.id, 0, 3); // Get first 3 albums

        // Get songs from first 3 albums only (most recent/popular)
        for (const album of albums) {
          try {
            const albumSongs = await getSongs(album.id, 0, 15); // Limit to 15 songs per album
            artistTopSongs.push(...albumSongs);

            // Add to song index
            for (const song of albumSongs) {
              const title = song.title || song.name;
              // Use the song's actual artist field, not the album artist
              // This is important for compilations where song artist != album artist
              const songArtist = song.artist || artistName;
              const songKey = getSongKey(songArtist, title);
              const displayKey = `${songArtist} - ${title}`;

              songs.set(songKey, song);
              songList.push(displayKey);
              totalSongsIndexed++;
            }
          } catch (error) {
            console.warn(`⚠️ Failed to fetch songs for album ${album.name}:`, error);
          }

          // Stop if we've indexed enough songs (limit for performance)
          if (totalSongsIndexed >= 200) {
            console.log(`⚠️ Reached song limit (200), stopping indexing`);
            break;
          }
        }

        artistSongs.set(artistName.toLowerCase(), artistTopSongs);
      } catch (error) {
        console.warn(`⚠️ Failed to fetch albums for artist ${artistName}:`, error);
      }

      // Break early if we have enough
      if (totalSongsIndexed >= 200) {
        break;
      }
    }

    const index: LibraryIndex = {
      songs,
      artistSongs,
      songList,
      artists,
      lastUpdated: Date.now(),
    };

    libraryIndexCache = index;

    const duration = Date.now() - startTime;
    console.log(`✅ Library index built: ${songList.length} songs from ${artists.length} artists in ${duration}ms`);
    console.log(`📊 Sample songs: ${songList.slice(0, 5).join(', ')}`);

    return index;
  } catch (error) {
    console.error('💥 Failed to build library index:', error);
    throw new ServiceError('LIBRARY_INDEX_ERROR', `Failed to build library index: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Search for a song in the index by "Artist - Title" format
 */
export async function searchIndexedSong(query: string): Promise<Song | null> {
  const index = await buildLibraryIndex();

  // Try exact match first (case-insensitive)
  const normalizedQuery = query.toLowerCase().trim();
  const song = index.songs.get(normalizedQuery);

  if (song) {
    console.log(`✅ Found indexed song: "${query}"`);
    return song;
  }

  // Try fuzzy match - split on " - " and search
  const parts = query.split(' - ');
  if (parts.length === 2) {
    const [artistPart, titlePart] = parts.map(p => p.toLowerCase().trim());

    // Search for partial matches
    for (const [key, indexedSong] of index.songs.entries()) {
      const [indexedArtist, indexedTitle] = key.split(' - ');

      if (indexedArtist.includes(artistPart) && indexedTitle.includes(titlePart)) {
        console.log(`✅ Found fuzzy match: "${query}" → "${key}"`);
        return indexedSong;
      }
    }
  }

  console.log(`❌ No indexed song found for: "${query}"`);
  return null;
}

/**
 * Get songs by artist from index
 */
export async function getArtistSongsFromIndex(artistName: string): Promise<Song[]> {
  const index = await buildLibraryIndex();
  const songs = index.artistSongs.get(artistName.toLowerCase().trim());
  return songs || [];
}

/**
 * Get a sample of songs for AI context
 * Returns top N songs formatted as "Artist - Title"
 */
export async function getSongSampleForAI(limit: number = 100): Promise<string[]> {
  const index = await buildLibraryIndex();

  // Return random sample for better variety
  const shuffled = [...index.songList].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, limit);
}

/**
 * Get all artists from index
 */
export async function getIndexedArtists(): Promise<string[]> {
  const index = await buildLibraryIndex();
  return index.artists;
}

/**
 * Clear the library index cache (force rebuild on next access)
 */
export function clearLibraryIndexCache(): void {
  libraryIndexCache = null;
  console.log('🗑️ Library index cache cleared');
}

/**
 * Get library index stats
 */
export async function getLibraryIndexStats(): Promise<{
  totalSongs: number;
  totalArtists: number;
  lastUpdated: Date;
  cacheAge: number;
}> {
  const index = await buildLibraryIndex();
  const now = Date.now();

  return {
    totalSongs: index.songList.length,
    totalArtists: index.artists.length,
    lastUpdated: new Date(index.lastUpdated),
    cacheAge: now - index.lastUpdated,
  };
}
