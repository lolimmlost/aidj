// Library indexing service for fast song lookup and AI context
import { getArtists, getAlbums, getSongs, type Song } from './navidrome';
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

    // Fetch more artists for better diversity
    const allArtists = await getArtists(0, 300); // Increased from 200 to 300 artists

    console.log(`📚 Indexing ${allArtists.length} artists...`);

    let totalSongsIndexed = 0;
    const songsPerArtist = new Map<string, number>(); // Track songs per artist for balance
    const MAX_SONGS_PER_ARTIST = 8; // Limit songs per artist for better diversity
    const MAX_TOTAL_SONGS = 1500; // Increased from 800 to 1500 songs

    // Process each artist - limit processing to avoid timeouts
    for (const artist of allArtists) {
      artists.push(artist.name);
      const artistName = artist.name;
      const artistTopSongs: Song[] = [];

      try {
        // Get albums for this artist
        const albums = await getAlbums(artist.id, 0, 8); // Increased from 5 to 8 albums

        // Get songs from albums with diversity in mind
        for (const album of albums) {
          try {
            // Limit songs per album based on artist's current count
            const artistSongCount = songsPerArtist.get(artistName) || 0;
            const remainingSlots = Math.max(0, MAX_SONGS_PER_ARTIST - artistSongCount);
            
            if (remainingSlots <= 0) break; // Skip if we have enough songs from this artist
            
            const albumSongs = await getSongs(album.id, 0, Math.min(remainingSlots, 12));
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
              
              // Track songs per artist
              const currentCount = songsPerArtist.get(songArtist) || 0;
              songsPerArtist.set(songArtist, currentCount + 1);
            }
          } catch (error) {
            console.warn(`⚠️ Failed to fetch songs for album ${album.name}:`, error);
          }

          // Stop if we've indexed enough songs
          if (totalSongsIndexed >= MAX_TOTAL_SONGS) {
            console.log(`⚠️ Reached song limit (${MAX_TOTAL_SONGS}), stopping indexing`);
            break;
          }
        }

        artistSongs.set(artistName.toLowerCase(), artistTopSongs);
      } catch (error) {
        console.warn(`⚠️ Failed to fetch albums for artist ${artistName}:`, error);
      }

      // Break early if we have enough
      if (totalSongsIndexed >= MAX_TOTAL_SONGS) {
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
 * Search for a song in index by "Artist - Title" format
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
 * Get a diverse sample of songs for AI context
 * Returns songs with maximum artist diversity formatted as "Artist - Title"
 */
export async function getSongSampleForAI(limit: number = 100): Promise<string[]> {
  const index = await buildLibraryIndex();

  // Group songs by artist for diversity
  const songsByArtist = new Map<string, string[]>();
  
  for (const song of index.songList) {
    const artist = song.split(' - ')[0].toLowerCase();
    if (!songsByArtist.has(artist)) {
      songsByArtist.set(artist, []);
    }
    songsByArtist.get(artist)!.push(song);
  }

  // Select songs ensuring maximum diversity
  const diverseSample: string[] = [];
  const artists = Array.from(songsByArtist.keys());
  
  // First pass: get one song from as many different artists as possible
  const shuffledArtists = [...artists].sort(() => Math.random() - 0.5);
  for (const artist of shuffledArtists) {
    if (diverseSample.length >= limit) break;
    
    const artistSongs = songsByArtist.get(artist)!;
    if (artistSongs.length > 0) {
      // Pick a random song from this artist
      const randomSong = artistSongs[Math.floor(Math.random() * artistSongs.length)];
      diverseSample.push(randomSong);
    }
  }
  
  // Second pass: fill remaining slots with additional songs from diverse artists
  if (diverseSample.length < limit) {
    // Sort artists by song count to prioritize underrepresented artists
    const artistsByCount = Array.from(songsByArtist.entries())
      .sort((a, b) => a[1].length - b[1].length);
    
    const underrepresentedArtists = artistsByCount
      .filter(([artist, songs]) => {
        const artistSongCount = diverseSample.filter(s =>
          s.split(' - ')[0].toLowerCase() === artist
        ).length;
        return artistSongCount === 0 && songs.length > 0;
      })
      .map(([artist]) => artist);
    
    // Add songs from underrepresented artists first
    for (const artist of underrepresentedArtists) {
      if (diverseSample.length >= limit) break;
      
      const artistSongs = songsByArtist.get(artist)!;
      const randomSong = artistSongs[Math.floor(Math.random() * artistSongs.length)];
      if (!diverseSample.includes(randomSong)) {
        diverseSample.push(randomSong);
      }
    }
    
    // If still need more songs, add from remaining artists (max 1 per artist for better diversity)
    const allSongsShuffled = [...index.songList].sort(() => Math.random() - 0.5);
    for (const song of allSongsShuffled) {
      if (diverseSample.length >= limit) break;
      
      const artist = song.split(' - ')[0].toLowerCase();
      const artistSongCount = diverseSample.filter(s => s.split(' - ')[0].toLowerCase() === artist).length;
      
      // Reduced from 2 to 1 song per artist in sample for maximum diversity
      if (artistSongCount < 1) {
        if (!diverseSample.includes(song)) {
          diverseSample.push(song);
        }
      }
    }
  }

  // Final shuffle to randomize order
  return diverseSample.sort(() => Math.random() - 0.5);
}

/**
 * Get all artists from index
 */
export async function getIndexedArtists(): Promise<string[]> {
  const index = await buildLibraryIndex();
  return index.artists;
}

/**
 * Clear library index cache (force rebuild on next access)
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
