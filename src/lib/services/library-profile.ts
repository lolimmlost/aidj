import { db } from "@/lib/db";
import { libraryProfiles, type LibraryProfile, type LibraryProfileInsert } from "@/lib/db/schema";
import { getArtistsWithDetails, getSongsGlobal, getAlbums } from "@/lib/services/navidrome";
import { ServiceError } from "@/lib/utils";
import { eq } from "drizzle-orm";

const ANALYSIS_TIMEOUT = 5000; // 5s timeout per architecture spec
const REFRESH_THRESHOLD = 0.1; // 10% library size change triggers refresh
const TOP_KEYWORDS_COUNT = 20;

/**
 * Common music stop words to filter out from keyword extraction
 */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'can', 'vol', 'pt', 'part', 'ep', 'single',
]);

/**
 * Extract genres from comma-separated genre string
 */
function extractGenres(genreString: string | null): string[] {
  if (!genreString) return [];

  return genreString
    .split(',')
    .map(g => g.trim())
    .filter(g => g.length > 0);
}

/**
 * Extract keywords from text with basic text processing
 * Filters out stop words and short words, normalizes to lowercase
 */
function extractKeywords(text: string): string[] {
  if (!text) return [];

  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ') // Remove special chars except hyphens
    .split(/\s+/)
    .map(word => word.trim())
    .filter(word =>
      word.length > 2 &&
      !STOP_WORDS.has(word) &&
      !/^\d+$/.test(word) // Filter out pure numbers
    );
}

/**
 * Calculate genre distribution from artist metadata
 * Returns a map of genre -> percentage (0.0-1.0)
 */
function calculateGenreDistribution(artists: Array<{ genres: string | null }>): Record<string, number> {
  const genreCounts = new Map<string, number>();
  let totalGenres = 0;

  // Count all genre occurrences
  for (const artist of artists) {
    const genres = extractGenres(artist.genres);
    for (const genre of genres) {
      genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1);
      totalGenres++;
    }
  }

  // Convert counts to percentages
  const distribution: Record<string, number> = {};
  if (totalGenres === 0) return distribution;

  for (const [genre, count] of genreCounts.entries()) {
    distribution[genre] = count / totalGenres;
  }

  return distribution;
}

/**
 * Extract top N keywords from library metadata
 * Combines artist names, album names, and song titles
 */
function extractTopKeywords(
  artists: Array<{ name: string }>,
  albums: Array<{ name: string }>,
  songs: Array<{ name: string; title?: string }>,
  topN: number = TOP_KEYWORDS_COUNT
): string[] {
  const keywordCounts = new Map<string, number>();

  // Extract from artist names
  for (const artist of artists) {
    const keywords = extractKeywords(artist.name);
    for (const keyword of keywords) {
      keywordCounts.set(keyword, (keywordCounts.get(keyword) || 0) + 1);
    }
  }

  // Extract from album names
  for (const album of albums) {
    const keywords = extractKeywords(album.name);
    for (const keyword of keywords) {
      keywordCounts.set(keyword, (keywordCounts.get(keyword) || 0) + 1);
    }
  }

  // Extract from song titles
  for (const song of songs) {
    const title = song.title || song.name;
    const keywords = extractKeywords(title);
    for (const keyword of keywords) {
      keywordCounts.set(keyword, (keywordCounts.get(keyword) || 0) + 1);
    }
  }

  // Sort by frequency and return top N
  return Array.from(keywordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([keyword]) => keyword);
}

/**
 * Analyze user's library and build genre/keyword profile
 * Implements 5s timeout and stores results in database
 */
export async function analyzeLibraryGenres(userId: string): Promise<LibraryProfile> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT);

  try {
    // Fetch library data with timeout
    const analysisPromise = (async () => {
      console.log(`📊 Starting library analysis for user ${userId}`);

      // Fetch artists with genre metadata (limited to reasonable number for performance)
      const artists = await getArtistsWithDetails(0, 100);
      console.log(`✓ Fetched ${artists.length} artists`);

      // Fetch sample of albums for keyword extraction
      const albumPromises = artists.slice(0, 20).map(artist =>
        getAlbums(artist.id, 0, 10).catch(() => [])
      );
      const albumArrays = await Promise.all(albumPromises);
      const albums = albumArrays.flat();
      console.log(`✓ Fetched ${albums.length} albums`);

      // Fetch sample of songs for keyword extraction
      const songs = await getSongsGlobal(0, 100);
      console.log(`✓ Fetched ${songs.length} songs`);

      return { artists, albums, songs };
    })();

    const { artists, albums, songs } = await Promise.race([
      analysisPromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Analysis timeout')), ANALYSIS_TIMEOUT)
      ),
    ]);

    clearTimeout(timeoutId);

    // Calculate genre distribution
    const genreDistribution = calculateGenreDistribution(artists);
    console.log(`✓ Calculated genre distribution:`, Object.keys(genreDistribution).slice(0, 5));

    // Extract top keywords
    const topKeywords = extractTopKeywords(artists, albums, songs, TOP_KEYWORDS_COUNT);
    console.log(`✓ Extracted top keywords:`, topKeywords.slice(0, 5));

    // Count total songs (use actual count if available, otherwise use sample size)
    const totalSongs = songs.length;

    // Check if profile exists
    const existingProfile = await db.query.libraryProfiles.findFirst({
      where: eq(libraryProfiles.userId, userId),
    });

    const profileData: LibraryProfileInsert = {
      userId,
      genreDistribution,
      topKeywords,
      totalSongs,
      lastAnalyzed: new Date(),
      refreshNeeded: false,
    };

    let profile: LibraryProfile;

    if (existingProfile) {
      // Update existing profile
      const [updated] = await db
        .update(libraryProfiles)
        .set(profileData)
        .where(eq(libraryProfiles.userId, userId))
        .returning();
      profile = updated;
      console.log(`✓ Updated library profile for user ${userId}`);
    } else {
      // Create new profile
      const [created] = await db
        .insert(libraryProfiles)
        .values(profileData)
        .returning();
      profile = created;
      console.log(`✓ Created library profile for user ${userId}`);
    }

    return profile;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.message === 'Analysis timeout') {
      throw new ServiceError('LIBRARY_ANALYSIS_TIMEOUT', 'Library analysis timed out (5s limit)');
    }

    throw new ServiceError(
      'LIBRARY_ANALYSIS_ERROR',
      `Failed to analyze library: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get cached library profile for user
 * Returns null if profile doesn't exist or needs refresh
 */
export async function getLibraryProfile(userId: string): Promise<LibraryProfile | null> {
  try {
    const profile = await db.query.libraryProfiles.findFirst({
      where: eq(libraryProfiles.userId, userId),
    });

    if (!profile) {
      return null;
    }

    // Check if profile needs refresh (stale > 30 minutes)
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    if (profile.lastAnalyzed < thirtyMinutesAgo || profile.refreshNeeded) {
      return null;
    }

    return profile;
  } catch (error) {
    console.error('Failed to get library profile:', error);
    return null;
  }
}

/**
 * Mark library profile as needing refresh
 * Called when library size changes significantly
 */
export async function markProfileForRefresh(userId: string, newSongCount: number): Promise<void> {
  try {
    const profile = await db.query.libraryProfiles.findFirst({
      where: eq(libraryProfiles.userId, userId),
    });

    if (!profile) {
      return;
    }

    // Check if library size changed by more than 10%
    const sizeDifference = Math.abs(newSongCount - profile.totalSongs) / profile.totalSongs;
    if (sizeDifference > REFRESH_THRESHOLD) {
      await db
        .update(libraryProfiles)
        .set({ refreshNeeded: true })
        .where(eq(libraryProfiles.userId, userId));

      console.log(`🔄 Marked library profile for refresh (size changed by ${(sizeDifference * 100).toFixed(1)}%)`);
    }
  } catch (error) {
    console.error('Failed to mark profile for refresh:', error);
  }
}

/**
 * Get or create library profile
 * Returns cached profile if available, otherwise analyzes library
 */
export async function getOrCreateLibraryProfile(userId: string, forceRefresh: boolean = false): Promise<LibraryProfile> {
  if (!forceRefresh) {
    const cachedProfile = await getLibraryProfile(userId);
    if (cachedProfile) {
      console.log(`📦 Using cached library profile for user ${userId}`);
      return cachedProfile;
    }
  }

  console.log(`🔄 ${forceRefresh ? 'Force refreshing' : 'Creating new'} library profile for user ${userId}`);
  return analyzeLibraryGenres(userId);
}
