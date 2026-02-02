/**
 * Discovery Generator Service
 *
 * Core algorithm for generating music discovery suggestions based on
 * the user's listening habits, using Last.fm for similarity data.
 *
 * Seed selection:
 * - 40% from top played artists (listening history)
 * - 35% from recently played (last 7 days)
 * - 25% from thumbs-up feedback artists
 */

import { db } from '@/lib/db';
import {
  listeningHistory,
  recommendationFeedback,
  discoverySuggestions,
  discoveryRejectionHistory,
  type DiscoverySuggestionInsert,
} from '@/lib/db/schema';
import { eq, and, gte, desc, sql } from 'drizzle-orm';
import { getLastFmClient } from '../lastfm';
import { getConfigAsync } from '@/lib/config/config';
import type { EnrichedTrack } from '../lastfm/types';
import { search as navidromeSearch, getArtists as getNavidromeArtists } from '../navidrome';
import { batchResolveImages, resolveAlbumImage } from '../image-resolver';

// ============================================================================
// Types
// ============================================================================

export interface DiscoveryConfig {
  maxSuggestionsPerRun: number;  // 10-30
  seedCount: number;              // 5-15 artists to use as seeds
  excludedGenres: string[];
}

export const DEFAULT_DISCOVERY_CONFIG: DiscoveryConfig = {
  maxSuggestionsPerRun: 15,
  seedCount: 10,
  excludedGenres: [],
};

interface Seed {
  artist: string;
  track?: string;
  weight: 'top_played' | 'recent' | 'liked';
  playCount?: number;
}

interface RawSuggestion {
  artistName: string;
  trackName: string;
  albumName?: string;
  source: 'similar_track' | 'artist_top_track' | 'genre_based';
  seedArtist: string;
  seedTrack?: string;
  matchScore: number;
  lastFmUrl?: string;
  imageUrl?: string;
  genres: string[];
  explanation: string;
  inLibrary: boolean;
}

interface RankingContext {
  seedWasRecentlyPlayed: boolean;
  seedWasLiked: boolean;
  libraryGenres: Set<string>;
  playcount?: number;
}

// ============================================================================
// Seed Selection
// ============================================================================

/**
 * Get top played artists from listening history (all-time)
 */
async function getTopPlayedArtists(userId: string, limit: number): Promise<{ artist: string; playCount: number }[]> {
  const results = await db
    .select({
      artist: listeningHistory.artist,
      playCount: sql<number>`count(*)::int`,
    })
    .from(listeningHistory)
    .where(eq(listeningHistory.userId, userId))
    .groupBy(listeningHistory.artist)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);

  return results;
}

/**
 * Get most played track by an artist for a user
 */
async function getMostPlayedTrack(userId: string, artist: string): Promise<{ title: string } | null> {
  const results = await db
    .select({
      title: listeningHistory.title,
    })
    .from(listeningHistory)
    .where(
      and(
        eq(listeningHistory.userId, userId),
        eq(listeningHistory.artist, artist)
      )
    )
    .groupBy(listeningHistory.title)
    .orderBy(desc(sql`count(*)`))
    .limit(1);

  return results[0] || null;
}

/**
 * Get recently played artists (last 7 days)
 */
async function getRecentlyPlayedArtists(userId: string, daysBack: number, limit: number): Promise<{ artist: string }[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);

  const results = await db
    .select({
      artist: listeningHistory.artist,
      lastPlayed: sql<Date>`max(${listeningHistory.playedAt})`,
    })
    .from(listeningHistory)
    .where(
      and(
        eq(listeningHistory.userId, userId),
        gte(listeningHistory.playedAt, cutoffDate)
      )
    )
    .groupBy(listeningHistory.artist)
    .orderBy(desc(sql`max(${listeningHistory.playedAt})`))
    .limit(limit);

  return results.map(r => ({ artist: r.artist }));
}

/**
 * Get most recent track by an artist
 */
async function getMostRecentTrack(userId: string, artist: string): Promise<{ title: string } | null> {
  const results = await db
    .select({
      title: listeningHistory.title,
    })
    .from(listeningHistory)
    .where(
      and(
        eq(listeningHistory.userId, userId),
        eq(listeningHistory.artist, artist)
      )
    )
    .orderBy(desc(listeningHistory.playedAt))
    .limit(1);

  return results[0] || null;
}

/**
 * Get artists the user has thumbs-up'd
 */
async function getThumbsUpArtists(userId: string, limit: number): Promise<{ artist: string }[]> {
  const results = await db
    .select({
      artist: sql<string>`split_part(${recommendationFeedback.songArtistTitle}, ' - ', 1)`,
      lastLiked: sql<Date>`max(${recommendationFeedback.timestamp})`,
    })
    .from(recommendationFeedback)
    .where(
      and(
        eq(recommendationFeedback.userId, userId),
        eq(recommendationFeedback.feedbackType, 'thumbs_up')
      )
    )
    .groupBy(sql`split_part(${recommendationFeedback.songArtistTitle}, ' - ', 1)`)
    .orderBy(desc(sql`max(${recommendationFeedback.timestamp})`))
    .limit(limit);

  return results.filter(r => r.artist && r.artist.trim() !== '').map(r => ({ artist: r.artist }));
}

/**
 * Get a liked track for an artist
 */
async function getLikedTrack(userId: string, artist: string): Promise<{ title: string } | null> {
  const results = await db
    .select({
      songArtistTitle: recommendationFeedback.songArtistTitle,
    })
    .from(recommendationFeedback)
    .where(
      and(
        eq(recommendationFeedback.userId, userId),
        eq(recommendationFeedback.feedbackType, 'thumbs_up'),
        sql`${recommendationFeedback.songArtistTitle} ILIKE ${artist + ' - %'}`
      )
    )
    .limit(1);

  if (results[0]) {
    const parts = results[0].songArtistTitle.split(' - ');
    if (parts.length >= 2) {
      return { title: parts.slice(1).join(' - ') };
    }
  }

  return null;
}

/**
 * Deduplicate seeds by artist, preferring higher-weight sources
 */
function deduplicateSeeds(seeds: Seed[], maxCount: number): Seed[] {
  const artistMap = new Map<string, Seed>();
  const weightOrder: Record<Seed['weight'], number> = {
    liked: 3,
    recent: 2,
    top_played: 1,
  };

  for (const seed of seeds) {
    const key = seed.artist.toLowerCase();
    const existing = artistMap.get(key);

    if (!existing || weightOrder[seed.weight] > weightOrder[existing.weight]) {
      artistMap.set(key, seed);
    }
  }

  return Array.from(artistMap.values()).slice(0, maxCount);
}

/**
 * Select seeds based on user listening patterns
 */
export async function selectSeeds(userId: string, count: number): Promise<Seed[]> {
  const seeds: Seed[] = [];

  // 40% from top played (all-time)
  const topPlayedCount = Math.ceil(count * 0.4);
  const topPlayed = await getTopPlayedArtists(userId, topPlayedCount);
  for (const artist of topPlayed) {
    const recentTrack = await getMostPlayedTrack(userId, artist.artist);
    seeds.push({
      artist: artist.artist,
      track: recentTrack?.title,
      weight: 'top_played',
      playCount: artist.playCount,
    });
  }

  // 35% from recently played (last 7 days)
  const recentCount = Math.ceil(count * 0.35);
  const recent = await getRecentlyPlayedArtists(userId, 7, recentCount);
  for (const artist of recent) {
    const track = await getMostRecentTrack(userId, artist.artist);
    seeds.push({
      artist: artist.artist,
      track: track?.title,
      weight: 'recent',
    });
  }

  // 25% from thumbs-up feedback
  const likedCount = Math.ceil(count * 0.25);
  const liked = await getThumbsUpArtists(userId, likedCount);
  for (const artist of liked) {
    const track = await getLikedTrack(userId, artist.artist);
    seeds.push({
      artist: artist.artist,
      track: track?.title,
      weight: 'liked',
    });
  }

  // Dedupe by artist, prefer liked > recent > top_played
  return deduplicateSeeds(seeds, count);
}

// ============================================================================
// Suggestion Generation
// ============================================================================

/**
 * Get library genres for ranking context
 */
async function getLibraryGenres(userId: string): Promise<Set<string>> {
  const results = await db
    .selectDistinct({
      genre: listeningHistory.genre,
    })
    .from(listeningHistory)
    .where(
      and(
        eq(listeningHistory.userId, userId),
        sql`${listeningHistory.genre} IS NOT NULL`
      )
    );

  return new Set(results.map(r => r.genre?.toLowerCase() || '').filter(Boolean));
}

/**
 * Check if a track has been rejected (and not expired)
 */
async function isRejected(userId: string, artist: string, track: string): Promise<boolean> {
  const results = await db
    .select({ id: discoveryRejectionHistory.id })
    .from(discoveryRejectionHistory)
    .where(
      and(
        eq(discoveryRejectionHistory.userId, userId),
        eq(sql`lower(${discoveryRejectionHistory.artistName})`, artist.toLowerCase()),
        eq(sql`lower(${discoveryRejectionHistory.trackName})`, track.toLowerCase()),
        gte(discoveryRejectionHistory.expiresAt, new Date())
      )
    )
    .limit(1);

  return results.length > 0;
}

/**
 * Check if a track is already suggested (pending or approved/downloading)
 * This prevents re-suggesting tracks that are:
 * - Still pending review
 * - Already approved and queued for download
 */
async function isAlreadySuggested(userId: string, artist: string, track: string): Promise<boolean> {
  const results = await db
    .select({ id: discoverySuggestions.id, status: discoverySuggestions.status })
    .from(discoverySuggestions)
    .where(
      and(
        eq(discoverySuggestions.userId, userId),
        eq(sql`lower(${discoverySuggestions.artistName})`, artist.toLowerCase()),
        eq(sql`lower(${discoverySuggestions.trackName})`, track.toLowerCase()),
        // Check for pending OR approved status (approved = queued for download)
        sql`${discoverySuggestions.status} IN ('pending', 'approved')`
      )
    )
    .limit(1);

  if (results.length > 0) {
    console.log(`[DiscoveryGenerator] Skipping already suggested: ${artist} - ${track} (status: ${results[0].status})`);
  }

  return results.length > 0;
}

// Cache for library artists during a discovery run
let cachedLibraryArtists: Set<string> | null = null;
let cachedLibraryArtistsTimestamp: number = 0;
const ARTIST_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get all artist names from Navidrome library (cached)
 */
async function getLibraryArtistNames(): Promise<Set<string>> {
  const now = Date.now();
  if (cachedLibraryArtists && (now - cachedLibraryArtistsTimestamp) < ARTIST_CACHE_TTL) {
    return cachedLibraryArtists;
  }

  try {
    const artists = await getNavidromeArtists(0, 10000);
    cachedLibraryArtists = new Set(artists.map(a => a.name.toLowerCase()));
    cachedLibraryArtistsTimestamp = now;
    console.log(`[DiscoveryGenerator] Cached ${cachedLibraryArtists.size} library artists`);
    return cachedLibraryArtists;
  } catch (error) {
    console.error('[DiscoveryGenerator] Failed to fetch library artists:', error);
    return new Set();
  }
}

/**
 * Check if a track is in the user's library by querying Navidrome directly
 * This ensures we always have up-to-date information about what's in the library
 */
async function isInLibrary(userId: string, artist: string, track: string): Promise<boolean> {
  const artistLower = artist.toLowerCase();
  const trackLower = track.toLowerCase();

  // First, quick check: is this artist even in our library?
  const libraryArtists = await getLibraryArtistNames();
  if (!libraryArtists.has(artistLower)) {
    // Artist not in library at all, so track definitely isn't
    return false;
  }

  // Artist exists in library, now search for the specific track
  try {
    const searchQuery = `${artist} ${track}`;
    const results = await navidromeSearch(searchQuery, 0, 20);

    // Check if any result matches this artist and track
    for (const song of results) {
      const resultArtist = (song.artist || '').toLowerCase();
      const resultTitle = (song.name || song.title || '').toLowerCase();

      // Check for exact or close match
      if (resultArtist.includes(artistLower) || artistLower.includes(resultArtist)) {
        if (resultTitle.includes(trackLower) || trackLower.includes(resultTitle)) {
          console.log(`[DiscoveryGenerator] Found in library: ${artist} - ${track}`);
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.warn(`[DiscoveryGenerator] Error searching Navidrome for ${artist} - ${track}:`, error);
    // On error, assume not in library to avoid false positives
    return false;
  }
}

/**
 * Calculate genre overlap between suggestion and library
 */
function calculateGenreOverlap(genres: string[], libraryGenres: Set<string>): number {
  if (genres.length === 0 || libraryGenres.size === 0) return 0;

  let matchCount = 0;
  for (const genre of genres) {
    if (libraryGenres.has(genre.toLowerCase())) {
      matchCount++;
    }
  }

  return matchCount / genres.length;
}

/**
 * Rank a suggestion based on multiple factors
 */
function rankSuggestion(suggestion: RawSuggestion, context: RankingContext): number {
  let score = suggestion.matchScore * 0.5;  // Base Last.fm match (0-0.5)

  // Seed recency bonus (0-0.2)
  if (context.seedWasRecentlyPlayed) score += 0.2;

  // Liked seed bonus (0-0.15)
  if (context.seedWasLiked) score += 0.15;

  // Genre alignment (0-0.1)
  const genreMatch = calculateGenreOverlap(suggestion.genres, context.libraryGenres);
  score += genreMatch * 0.1;

  // Popularity tiebreaker (0-0.05)
  if (context.playcount) {
    score += Math.min(context.playcount / 10000000, 0.05);
  }

  return Math.min(1, score);  // Cap at 1
}

/**
 * Generate suggestions from seeds using Last.fm
 */
export async function generateSuggestions(
  userId: string,
  config: DiscoveryConfig = DEFAULT_DISCOVERY_CONFIG
): Promise<DiscoverySuggestionInsert[]> {
  console.log(`[DiscoveryGenerator] Starting suggestion generation for user ${userId}`);

  // Get Last.fm client
  const appConfig = await getConfigAsync();
  if (!appConfig.lastfmApiKey) {
    console.warn('[DiscoveryGenerator] Last.fm API key not configured');
    return [];
  }

  const lastFm = getLastFmClient(appConfig.lastfmApiKey);
  if (!lastFm) {
    console.warn('[DiscoveryGenerator] Failed to get Last.fm client');
    return [];
  }

  // Select seeds
  const seeds = await selectSeeds(userId, config.seedCount);
  console.log(`[DiscoveryGenerator] Selected ${seeds.length} seeds`);

  if (seeds.length === 0) {
    console.log('[DiscoveryGenerator] No seeds available, user needs more listening history');
    return [];
  }

  // Get library genres for ranking
  const libraryGenres = await getLibraryGenres(userId);

  // Get recently played artist names for context
  const recentArtists = new Set(
    seeds.filter(s => s.weight === 'recent').map(s => s.artist.toLowerCase())
  );
  const likedArtists = new Set(
    seeds.filter(s => s.weight === 'liked').map(s => s.artist.toLowerCase())
  );

  const allSuggestions: RawSuggestion[] = [];
  const seenTracks = new Set<string>();

  // For each seed, get similar tracks
  for (const seed of seeds) {
    if (!seed.track) continue;

    try {
      const similarTracks = await lastFm.getSimilarTracks(seed.artist, seed.track, 20);

      for (const track of similarTracks) {
        const trackKey = `${track.artist.toLowerCase()}|${track.name.toLowerCase()}`;

        // Skip duplicates within this run
        if (seenTracks.has(trackKey)) continue;
        seenTracks.add(trackKey);

        // Skip tracks in library (Last.fm enrichment check)
        if (track.inLibrary) continue;

        // Double-check against our indexed songs table
        if (await isInLibrary(userId, track.artist, track.name)) continue;

        // Skip previously rejected
        if (await isRejected(userId, track.artist, track.name)) continue;

        // Skip already suggested
        if (await isAlreadySuggested(userId, track.artist, track.name)) continue;

        allSuggestions.push({
          artistName: track.artist,
          trackName: track.name,
          albumName: track.navidromeAlbum,
          source: 'similar_track',
          seedArtist: seed.artist,
          seedTrack: seed.track,
          matchScore: track.match || 0,
          lastFmUrl: track.url,
          imageUrl: track.image,
          genres: [],  // Last.fm similar tracks don't include genres
          explanation: `Similar to "${seed.track}" by ${seed.artist}`,
          inLibrary: false,
        });
      }
    } catch (error) {
      console.warn(`[DiscoveryGenerator] Failed to get similar tracks for ${seed.artist} - ${seed.track}:`, error);
    }
  }

  // Also get top tracks from similar artists not in library
  const artistsProcessed = new Set<string>();
  for (const seed of seeds.slice(0, 5)) {  // Limit to first 5 seeds for artist exploration
    try {
      const similarArtists = await lastFm.getSimilarArtists(seed.artist, 10);

      for (const artist of similarArtists) {
        // Skip artists in library
        if (artist.inLibrary) continue;

        // Skip artists we've already processed
        if (artistsProcessed.has(artist.name.toLowerCase())) continue;
        artistsProcessed.add(artist.name.toLowerCase());

        // Get top tracks from this artist
        const topTracks = await lastFm.getTopTracks(artist.name, 5);

        for (const track of topTracks) {
          const trackKey = `${track.artist.toLowerCase()}|${track.name.toLowerCase()}`;

          if (seenTracks.has(trackKey)) continue;
          seenTracks.add(trackKey);

          if (track.inLibrary) continue;
          if (await isInLibrary(userId, track.artist, track.name)) continue;
          if (await isRejected(userId, track.artist, track.name)) continue;
          if (await isAlreadySuggested(userId, track.artist, track.name)) continue;

          allSuggestions.push({
            artistName: track.artist,
            trackName: track.name,
            albumName: track.navidromeAlbum,
            source: 'artist_top_track',
            seedArtist: seed.artist,
            seedTrack: seed.track,
            matchScore: artist.match || 0.5,
            lastFmUrl: track.url,
            imageUrl: track.image,
            genres: [],
            explanation: `Top track from ${track.artist}, similar to ${seed.artist}`,
            inLibrary: false,
          });
        }
      }
    } catch (error) {
      console.warn(`[DiscoveryGenerator] Failed to get similar artists for ${seed.artist}:`, error);
    }
  }

  console.log(`[DiscoveryGenerator] Generated ${allSuggestions.length} raw suggestions`);

  // Rank all suggestions
  const rankedSuggestions = allSuggestions.map(suggestion => {
    const context: RankingContext = {
      seedWasRecentlyPlayed: recentArtists.has(suggestion.seedArtist.toLowerCase()),
      seedWasLiked: likedArtists.has(suggestion.seedArtist.toLowerCase()),
      libraryGenres,
    };

    return {
      ...suggestion,
      matchScore: rankSuggestion(suggestion, context),
    };
  });

  // Sort by score and limit
  rankedSuggestions.sort((a, b) => b.matchScore - a.matchScore);
  const limited = rankedSuggestions.slice(0, config.maxSuggestionsPerRun);

  console.log(`[DiscoveryGenerator] Returning ${limited.length} ranked suggestions`);

  // Resolve missing images via Deezer fallback with concurrency limit (Item 2.1)
  // Step 1: Batch resolve artist images for items without artwork
  const resolvedArtistImages = await batchResolveImages(
    limited.map(s => ({ artistName: s.artistName, imageUrl: s.imageUrl }))
  );

  // Step 2: Try album-specific images for suggestions that have album names but still no image
  const needsAlbumImage = limited.filter(
    s => s.albumName && !s.imageUrl && !resolvedArtistImages.has(s.artistName.toLowerCase())
  );
  const albumImageResults = await Promise.allSettled(
    needsAlbumImage.slice(0, 5).map(async s => {
      const url = await resolveAlbumImage(s.artistName, s.albumName!);
      return { key: s.artistName.toLowerCase(), url };
    })
  );
  const resolvedAlbumImages = new Map<string, string>();
  for (const r of albumImageResults) {
    if (r.status === 'fulfilled' && r.value.url) {
      resolvedAlbumImages.set(r.value.key, r.value.url);
    }
  }

  // Convert to database insert format
  return limited.map(s => ({
    userId,
    artistName: s.artistName,
    trackName: s.trackName,
    albumName: s.albumName,
    source: s.source,
    seedArtist: s.seedArtist,
    seedTrack: s.seedTrack,
    matchScore: s.matchScore,
    status: 'pending' as const,
    lastFmUrl: s.lastFmUrl,
    imageUrl: resolvedArtistImages.get(s.artistName.toLowerCase())
      || resolvedAlbumImages.get(s.artistName.toLowerCase())
      || s.imageUrl,
    genres: s.genres,
    explanation: s.explanation,
  }));
}

/**
 * Store suggestions in the database
 */
export async function storeSuggestions(suggestions: DiscoverySuggestionInsert[]): Promise<number> {
  if (suggestions.length === 0) return 0;

  const result = await db.insert(discoverySuggestions).values(suggestions);
  return suggestions.length;
}
