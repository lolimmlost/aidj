/**
 * Mood Timeline Analytics Service
 *
 * Provides comprehensive analytics for mood/preference timeline visualization.
 * Handles aggregation, filtering, and historical data analysis.
 *
 * Story: Mood Timeline Visualization with Historical Music Preference Tracking
 */

import { db } from '../db';
import {
  recommendationFeedback,
  listeningHistory,
  moodSnapshots,
  recommendationHistory,
  tasteSnapshots,
} from '../db/schema';
import type {
  MoodDistribution,
  TopItem,
  TasteProfileExport,
  MoodSnapshot,
  RecommendationHistoryEntry,
  TasteSnapshot,
} from '../db/schema/mood-history.schema';
import { eq, and, gte, lte, desc, asc, sql } from 'drizzle-orm';
import { getSeason, type Season } from '../utils/temporal';

// ============================================================================
// Types
// ============================================================================

export type TimeGranularity = 'day' | 'week' | 'month' | 'year';

export interface TimelineDataPoint {
  periodStart: string; // ISO date
  periodEnd: string;   // ISO date
  periodLabel: string; // Human-readable label
  moodDistribution: MoodDistribution;
  topGenres: TopItem[];
  topArtists: TopItem[];
  topTracks: TopItem[];
  totalListens: number;
  totalFeedback: number;
  acceptanceRate: number;
  diversityScore: number;
  season?: Season;
  isSignificantChange?: boolean;
  changeDescription?: string;
}

export interface MoodTimelineResponse {
  dataPoints: TimelineDataPoint[];
  granularity: TimeGranularity;
  startDate: string;
  endDate: string;
  totalPeriods: number;
  hasMoreData: boolean;
}

export interface TimelineFilters {
  moods?: string[];        // Filter by specific moods (e.g., ['chill', 'energetic'])
  genres?: string[];       // Filter by genres
  artists?: string[];      // Filter by artists
  minAcceptanceRate?: number;
}

export interface HistoricalRecommendation {
  id: string;
  generatedAt: string;
  songs: Array<{
    artist: string;
    title: string;
    status: 'accepted' | 'skipped' | 'saved' | 'pending';
  }>;
  source: string;
  moodContext?: string;
  reasoningFactors?: Array<{
    type: string;
    description: string;
    weight: number;
  }>;
  acceptedCount: number;
  skippedCount: number;
}

export interface TasteComparison {
  past: {
    periodLabel: string;
    topArtists: string[];
    topGenres: string[];
    moodDistribution: MoodDistribution;
    acceptanceRate: number;
  };
  current: {
    periodLabel: string;
    topArtists: string[];
    topGenres: string[];
    moodDistribution: MoodDistribution;
    acceptanceRate: number;
  };
  changes: {
    newArtists: string[];
    droppedArtists: string[];
    newGenres: string[];
    droppedGenres: string[];
    moodShift: string;
    acceptanceRateChange: number;
  };
}

export interface PlaylistRegenerationRequest {
  periodStart: string;
  periodEnd: string;
  blendRatio?: number; // 0-100, percentage of historical preferences vs current
  maxTracks?: number;
}

export interface RegeneratedPlaylist {
  name: string;
  description: string;
  tracks: Array<{
    artist: string;
    title: string;
    songId?: string;
    matchScore: number;
    matchReason: string;
  }>;
  periodLabel: string;
  blendRatio: number;
}

// ============================================================================
// Caching
// ============================================================================

interface CachedData<T> {
  data: T;
  timestamp: number;
}

const timelineCache = new Map<string, CachedData<any>>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getCached<T>(key: string): T | null {
  const cached = timelineCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data as T;
  }
  return null;
}

function setCache<T>(key: string, data: T): void {
  timelineCache.set(key, { data, timestamp: Date.now() });
}

export function clearTimelineCache(userId?: string): void {
  if (userId) {
    for (const key of timelineCache.keys()) {
      if (key.startsWith(userId)) {
        timelineCache.delete(key);
      }
    }
  } else {
    timelineCache.clear();
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function getDefaultMoodDistribution(): MoodDistribution {
  return {
    chill: 0,
    energetic: 0,
    melancholic: 0,
    happy: 0,
    focused: 0,
    romantic: 0,
    aggressive: 0,
    neutral: 0,
  };
}

function inferMoodFromGenre(genre: string): keyof MoodDistribution {
  const lowerGenre = genre.toLowerCase();

  // Chill/Relaxed
  if (/ambient|chill|lofi|lo-fi|downtempo|trip-hop|new age|meditation|spa/i.test(lowerGenre)) {
    return 'chill';
  }

  // Energetic
  if (/dance|edm|electronic|house|techno|trance|drum and bass|dnb|dubstep|party|club|rave/i.test(lowerGenre)) {
    return 'energetic';
  }

  // Melancholic
  if (/blues|sad|melanchol|emo|gothic|darkwave|doom/i.test(lowerGenre)) {
    return 'melancholic';
  }

  // Happy/Upbeat
  if (/pop|disco|funk|soul|motown|ska|reggae|happy|sunshine|summer/i.test(lowerGenre)) {
    return 'happy';
  }

  // Focused
  if (/classical|instrumental|piano|acoustic|study|concentration|jazz|bossa/i.test(lowerGenre)) {
    return 'focused';
  }

  // Romantic
  if (/r&b|rnb|slow jam|love|ballad|romantic|smooth/i.test(lowerGenre)) {
    return 'romantic';
  }

  // Aggressive
  if (/metal|hardcore|punk|thrash|death|black metal|grindcore|industrial|hard rock/i.test(lowerGenre)) {
    return 'aggressive';
  }

  return 'neutral';
}

function getPeriodLabel(date: Date, granularity: TimeGranularity): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  switch (granularity) {
    case 'day':
      return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    case 'week':
      return `Week of ${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    case 'month':
      return `${months[date.getMonth()]} ${date.getFullYear()}`;
    case 'year':
      return `${date.getFullYear()}`;
  }
}

function getPeriodBounds(date: Date, granularity: TimeGranularity): { start: Date; end: Date } {
  const start = new Date(date);
  const end = new Date(date);

  switch (granularity) {
    case 'day':
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case 'week':
      const dayOfWeek = start.getDay();
      start.setDate(start.getDate() - dayOfWeek);
      start.setHours(0, 0, 0, 0);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      break;
    case 'month':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(end.getMonth() + 1);
      end.setDate(0);
      end.setHours(23, 59, 59, 999);
      break;
    case 'year':
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(11, 31);
      end.setHours(23, 59, 59, 999);
      break;
  }

  return { start, end };
}

function extractArtist(songArtistTitle: string): string {
  const parts = songArtistTitle.split(' - ');
  return parts[0]?.trim() || songArtistTitle;
}

function extractTitle(songArtistTitle: string): string {
  const parts = songArtistTitle.split(' - ');
  return parts[1]?.trim() || '';
}

function calculateDiversityScore(items: Map<string, number>): number {
  if (items.size === 0) return 0;

  const total = Array.from(items.values()).reduce((sum, count) => sum + count, 0);
  if (total === 0) return 0;

  // Shannon entropy
  let entropy = 0;
  for (const count of items.values()) {
    const probability = count / total;
    if (probability > 0) {
      entropy -= probability * Math.log2(probability);
    }
  }

  // Normalize to 0-1
  const maxEntropy = Math.log2(items.size);
  return maxEntropy > 0 ? entropy / maxEntropy : 0;
}

function detectSignificantChanges(
  current: TimelineDataPoint,
  previous: TimelineDataPoint | null
): { isSignificant: boolean; description: string } {
  if (!previous) {
    return { isSignificant: false, description: '' };
  }

  const changes: string[] = [];

  // Check for acceptance rate changes (>20% change)
  const acceptanceChange = Math.abs(current.acceptanceRate - previous.acceptanceRate);
  if (acceptanceChange > 0.2) {
    changes.push(
      current.acceptanceRate > previous.acceptanceRate
        ? 'Recommendation quality improved significantly'
        : 'Recommendation quality decreased'
    );
  }

  // Check for new dominant moods
  const currentDominantMood = Object.entries(current.moodDistribution)
    .sort(([, a], [, b]) => b - a)[0]?.[0];
  const previousDominantMood = Object.entries(previous.moodDistribution)
    .sort(([, a], [, b]) => b - a)[0]?.[0];

  if (currentDominantMood !== previousDominantMood) {
    changes.push(`Mood shifted from ${previousDominantMood} to ${currentDominantMood}`);
  }

  // Check for new top artist
  const currentTopArtist = current.topArtists[0]?.name;
  const previousTopArtist = previous.topArtists[0]?.name;

  if (currentTopArtist && currentTopArtist !== previousTopArtist) {
    changes.push(`New favorite artist: ${currentTopArtist}`);
  }

  // Check for diversity changes
  const diversityChange = Math.abs(current.diversityScore - previous.diversityScore);
  if (diversityChange > 0.15) {
    changes.push(
      current.diversityScore > previous.diversityScore
        ? 'Music taste expanding'
        : 'Focusing on specific artists/genres'
    );
  }

  return {
    isSignificant: changes.length > 0,
    description: changes.join('. '),
  };
}

// ============================================================================
// Main Analytics Functions
// ============================================================================

/**
 * Get mood timeline data for visualization
 */
export async function getMoodTimeline(
  userId: string,
  startDate: Date,
  endDate: Date,
  granularity: TimeGranularity = 'week',
  filters?: TimelineFilters
): Promise<MoodTimelineResponse> {
  const cacheKey = `${userId}:timeline:${startDate.toISOString()}:${endDate.toISOString()}:${granularity}:${JSON.stringify(filters || {})}`;
  const cached = getCached<MoodTimelineResponse>(cacheKey);
  if (cached) return cached;

  // Fetch all feedback in the date range
  const feedback = await db
    .select()
    .from(recommendationFeedback)
    .where(
      and(
        eq(recommendationFeedback.userId, userId),
        gte(recommendationFeedback.timestamp, startDate),
        lte(recommendationFeedback.timestamp, endDate)
      )
    )
    .orderBy(asc(recommendationFeedback.timestamp));

  // Fetch listening history in the date range
  const history = await db
    .select()
    .from(listeningHistory)
    .where(
      and(
        eq(listeningHistory.userId, userId),
        gte(listeningHistory.playedAt, startDate),
        lte(listeningHistory.playedAt, endDate)
      )
    )
    .orderBy(asc(listeningHistory.playedAt));

  // Group data by periods
  const periodMap = new Map<string, {
    periodStart: Date;
    periodEnd: Date;
    feedback: typeof feedback;
    history: typeof history;
  }>();

  // Process feedback
  for (const fb of feedback) {
    const bounds = getPeriodBounds(fb.timestamp, granularity);
    const key = bounds.start.toISOString();

    if (!periodMap.has(key)) {
      periodMap.set(key, {
        periodStart: bounds.start,
        periodEnd: bounds.end,
        feedback: [],
        history: [],
      });
    }
    periodMap.get(key)!.feedback.push(fb);
  }

  // Process listening history
  for (const h of history) {
    const bounds = getPeriodBounds(h.playedAt, granularity);
    const key = bounds.start.toISOString();

    if (!periodMap.has(key)) {
      periodMap.set(key, {
        periodStart: bounds.start,
        periodEnd: bounds.end,
        feedback: [],
        history: [],
      });
    }
    periodMap.get(key)!.history.push(h);
  }

  // Convert to timeline data points
  const dataPoints: TimelineDataPoint[] = [];
  let previousPoint: TimelineDataPoint | null = null;

  const sortedPeriods = Array.from(periodMap.entries())
    .sort(([a], [b]) => a.localeCompare(b));

  for (const [, periodData] of sortedPeriods) {
    const { periodStart, periodEnd, feedback: periodFeedback, history: periodHistory } = periodData;

    // Calculate mood distribution
    const moodCounts: MoodDistribution = getDefaultMoodDistribution();
    const genreCounts = new Map<string, number>();
    const artistCounts = new Map<string, number>();
    const trackCounts = new Map<string, number>();

    // Process listening history for genre-based mood inference
    for (const h of periodHistory) {
      if (h.genre) {
        genreCounts.set(h.genre, (genreCounts.get(h.genre) || 0) + 1);
        const mood = inferMoodFromGenre(h.genre);
        moodCounts[mood]++;
      }

      artistCounts.set(h.artist, (artistCounts.get(h.artist) || 0) + 1);
      trackCounts.set(`${h.artist} - ${h.title}`, (trackCounts.get(`${h.artist} - ${h.title}`) || 0) + 1);
    }

    // Process feedback for artist/track counts
    for (const fb of periodFeedback) {
      const artist = extractArtist(fb.songArtistTitle);
      const weight = fb.feedbackType === 'thumbs_up' ? 2 : -1;
      artistCounts.set(artist, (artistCounts.get(artist) || 0) + weight);
      trackCounts.set(fb.songArtistTitle, (trackCounts.get(fb.songArtistTitle) || 0) + weight);
    }

    // Normalize mood distribution
    const totalMoodCounts = Object.values(moodCounts).reduce((sum, count) => sum + count, 0);
    if (totalMoodCounts > 0) {
      for (const mood of Object.keys(moodCounts) as (keyof MoodDistribution)[]) {
        moodCounts[mood] = Number((moodCounts[mood] / totalMoodCounts).toFixed(3));
      }
    }

    // Calculate top items
    const topGenres: TopItem[] = Array.from(genreCounts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, count]) => ({
        name,
        count,
        percentage: totalMoodCounts > 0 ? Number((count / totalMoodCounts * 100).toFixed(1)) : 0,
      }));

    const topArtists: TopItem[] = Array.from(artistCounts.entries())
      .filter(([, count]) => count > 0)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, count]) => {
        const total = Array.from(artistCounts.values()).filter(c => c > 0).reduce((s, c) => s + c, 0);
        return {
          name,
          count,
          percentage: total > 0 ? Number((count / total * 100).toFixed(1)) : 0,
        };
      });

    const topTracks: TopItem[] = Array.from(trackCounts.entries())
      .filter(([, count]) => count > 0)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, count]) => {
        const total = Array.from(trackCounts.values()).filter(c => c > 0).reduce((s, c) => s + c, 0);
        return {
          name,
          count,
          percentage: total > 0 ? Number((count / total * 100).toFixed(1)) : 0,
        };
      });

    // Calculate statistics
    const thumbsUp = periodFeedback.filter(f => f.feedbackType === 'thumbs_up').length;
    const thumbsDown = periodFeedback.filter(f => f.feedbackType === 'thumbs_down').length;
    const totalFeedback = thumbsUp + thumbsDown;
    const acceptanceRate = totalFeedback > 0 ? thumbsUp / totalFeedback : 0;
    const diversityScore = calculateDiversityScore(artistCounts);

    const dataPoint: TimelineDataPoint = {
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      periodLabel: getPeriodLabel(periodStart, granularity),
      moodDistribution: moodCounts,
      topGenres,
      topArtists,
      topTracks,
      totalListens: periodHistory.length,
      totalFeedback,
      acceptanceRate: Number(acceptanceRate.toFixed(3)),
      diversityScore: Number(diversityScore.toFixed(3)),
      season: getSeason(periodStart.getMonth() + 1),
    };

    // Detect significant changes
    const changes = detectSignificantChanges(dataPoint, previousPoint);
    if (changes.isSignificant) {
      dataPoint.isSignificantChange = true;
      dataPoint.changeDescription = changes.description;
    }

    // Apply filters
    let includePoint = true;
    if (filters) {
      if (filters.moods?.length) {
        const dominantMood = Object.entries(moodCounts)
          .sort(([, a], [, b]) => b - a)[0]?.[0];
        includePoint = filters.moods.includes(dominantMood);
      }
      if (filters.genres?.length && includePoint) {
        includePoint = topGenres.some(g =>
          filters.genres!.some(fg => g.name.toLowerCase().includes(fg.toLowerCase()))
        );
      }
      if (filters.artists?.length && includePoint) {
        includePoint = topArtists.some(a =>
          filters.artists!.some(fa => a.name.toLowerCase().includes(fa.toLowerCase()))
        );
      }
      if (filters.minAcceptanceRate !== undefined && includePoint) {
        includePoint = acceptanceRate >= filters.minAcceptanceRate;
      }
    }

    if (includePoint) {
      dataPoints.push(dataPoint);
    }

    previousPoint = dataPoint;
  }

  const response: MoodTimelineResponse = {
    dataPoints,
    granularity,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    totalPeriods: dataPoints.length,
    hasMoreData: false, // Could implement pagination later
  };

  setCache(cacheKey, response);
  return response;
}

/**
 * Get historical recommendations for replay functionality
 */
export async function getHistoricalRecommendations(
  userId: string,
  startDate: Date,
  endDate: Date,
  limit: number = 50
): Promise<HistoricalRecommendation[]> {
  const cacheKey = `${userId}:historical-recs:${startDate.toISOString()}:${endDate.toISOString()}:${limit}`;
  const cached = getCached<HistoricalRecommendation[]>(cacheKey);
  if (cached) return cached;

  const history = await db
    .select()
    .from(recommendationHistory)
    .where(
      and(
        eq(recommendationHistory.userId, userId),
        gte(recommendationHistory.generatedAt, startDate),
        lte(recommendationHistory.generatedAt, endDate)
      )
    )
    .orderBy(desc(recommendationHistory.generatedAt))
    .limit(limit);

  const results: HistoricalRecommendation[] = history.map(h => {
    const songs = h.recommendedSongs || [];
    return {
      id: h.id,
      generatedAt: h.generatedAt.toISOString(),
      songs: songs.map(s => ({
        artist: s.artist,
        title: s.title,
        status: s.status,
      })),
      source: h.source,
      moodContext: h.moodContext || undefined,
      reasoningFactors: h.reasoningFactors || undefined,
      acceptedCount: songs.filter(s => s.status === 'accepted').length,
      skippedCount: songs.filter(s => s.status === 'skipped').length,
    };
  });

  setCache(cacheKey, results);
  return results;
}

/**
 * Compare taste profiles between two time periods
 */
export async function compareTasteProfiles(
  userId: string,
  pastPeriod: { start: Date; end: Date },
  currentPeriod: { start: Date; end: Date }
): Promise<TasteComparison> {
  // Get timeline data for both periods
  const [pastData, currentData] = await Promise.all([
    getMoodTimeline(userId, pastPeriod.start, pastPeriod.end, 'month'),
    getMoodTimeline(userId, currentPeriod.start, currentPeriod.end, 'month'),
  ]);

  // Aggregate past period data
  const pastArtists = new Map<string, number>();
  const pastGenres = new Map<string, number>();
  const pastMoods = getDefaultMoodDistribution();
  let pastTotalFeedback = 0;
  let pastThumbsUp = 0;

  for (const dp of pastData.dataPoints) {
    for (const a of dp.topArtists) {
      pastArtists.set(a.name, (pastArtists.get(a.name) || 0) + a.count);
    }
    for (const g of dp.topGenres) {
      pastGenres.set(g.name, (pastGenres.get(g.name) || 0) + g.count);
    }
    for (const mood of Object.keys(pastMoods) as (keyof MoodDistribution)[]) {
      pastMoods[mood] += dp.moodDistribution[mood];
    }
    pastTotalFeedback += dp.totalFeedback;
    pastThumbsUp += Math.round(dp.acceptanceRate * dp.totalFeedback);
  }

  // Aggregate current period data
  const currentArtists = new Map<string, number>();
  const currentGenres = new Map<string, number>();
  const currentMoods = getDefaultMoodDistribution();
  let currentTotalFeedback = 0;
  let currentThumbsUp = 0;

  for (const dp of currentData.dataPoints) {
    for (const a of dp.topArtists) {
      currentArtists.set(a.name, (currentArtists.get(a.name) || 0) + a.count);
    }
    for (const g of dp.topGenres) {
      currentGenres.set(g.name, (currentGenres.get(g.name) || 0) + g.count);
    }
    for (const mood of Object.keys(currentMoods) as (keyof MoodDistribution)[]) {
      currentMoods[mood] += dp.moodDistribution[mood];
    }
    currentTotalFeedback += dp.totalFeedback;
    currentThumbsUp += Math.round(dp.acceptanceRate * dp.totalFeedback);
  }

  // Normalize mood distributions
  const pastMoodTotal = Object.values(pastMoods).reduce((s, v) => s + v, 0);
  const currentMoodTotal = Object.values(currentMoods).reduce((s, v) => s + v, 0);

  if (pastMoodTotal > 0) {
    for (const mood of Object.keys(pastMoods) as (keyof MoodDistribution)[]) {
      pastMoods[mood] = Number((pastMoods[mood] / pastMoodTotal).toFixed(3));
    }
  }
  if (currentMoodTotal > 0) {
    for (const mood of Object.keys(currentMoods) as (keyof MoodDistribution)[]) {
      currentMoods[mood] = Number((currentMoods[mood] / currentMoodTotal).toFixed(3));
    }
  }

  // Get top items
  const pastTopArtists = Array.from(pastArtists.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([name]) => name);
  const currentTopArtists = Array.from(currentArtists.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([name]) => name);

  const pastTopGenres = Array.from(pastGenres.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name]) => name);
  const currentTopGenres = Array.from(currentGenres.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name]) => name);

  // Calculate changes
  const newArtists = currentTopArtists.filter(a => !pastTopArtists.includes(a));
  const droppedArtists = pastTopArtists.filter(a => !currentTopArtists.includes(a));
  const newGenres = currentTopGenres.filter(g => !pastTopGenres.includes(g));
  const droppedGenres = pastTopGenres.filter(g => !currentTopGenres.includes(g));

  const pastDominantMood = Object.entries(pastMoods)
    .sort(([, a], [, b]) => b - a)[0]?.[0] || 'neutral';
  const currentDominantMood = Object.entries(currentMoods)
    .sort(([, a], [, b]) => b - a)[0]?.[0] || 'neutral';

  const moodShift = pastDominantMood !== currentDominantMood
    ? `${pastDominantMood} → ${currentDominantMood}`
    : 'Stable';

  const pastAcceptanceRate = pastTotalFeedback > 0 ? pastThumbsUp / pastTotalFeedback : 0;
  const currentAcceptanceRate = currentTotalFeedback > 0 ? currentThumbsUp / currentTotalFeedback : 0;

  return {
    past: {
      periodLabel: pastData.dataPoints[0]?.periodLabel || 'Past Period',
      topArtists: pastTopArtists,
      topGenres: pastTopGenres,
      moodDistribution: pastMoods,
      acceptanceRate: Number(pastAcceptanceRate.toFixed(3)),
    },
    current: {
      periodLabel: currentData.dataPoints[0]?.periodLabel || 'Current Period',
      topArtists: currentTopArtists,
      topGenres: currentTopGenres,
      moodDistribution: currentMoods,
      acceptanceRate: Number(currentAcceptanceRate.toFixed(3)),
    },
    changes: {
      newArtists,
      droppedArtists,
      newGenres,
      droppedGenres,
      moodShift,
      acceptanceRateChange: Number((currentAcceptanceRate - pastAcceptanceRate).toFixed(3)),
    },
  };
}

/**
 * Generate a playlist based on historical preferences
 */
export async function regenerateHistoricalPlaylist(
  userId: string,
  request: PlaylistRegenerationRequest
): Promise<RegeneratedPlaylist> {
  const { periodStart, periodEnd, blendRatio = 100, maxTracks = 25 } = request;

  const startDate = new Date(periodStart);
  const endDate = new Date(periodEnd);

  // Get historical preferences
  const feedback = await db
    .select()
    .from(recommendationFeedback)
    .where(
      and(
        eq(recommendationFeedback.userId, userId),
        eq(recommendationFeedback.feedbackType, 'thumbs_up'),
        gte(recommendationFeedback.timestamp, startDate),
        lte(recommendationFeedback.timestamp, endDate)
      )
    )
    .orderBy(desc(recommendationFeedback.timestamp));

  // Extract unique songs and artists
  const historicalTracks = new Set<string>();
  const historicalArtists = new Map<string, number>();

  for (const fb of feedback) {
    historicalTracks.add(fb.songArtistTitle);
    const artist = extractArtist(fb.songArtistTitle);
    historicalArtists.set(artist, (historicalArtists.get(artist) || 0) + 1);
  }

  // Build playlist tracks
  const tracks: RegeneratedPlaylist['tracks'] = [];

  // Add historical tracks (based on blend ratio)
  const historicalCount = Math.floor(maxTracks * (blendRatio / 100));
  const historicalArray = Array.from(historicalTracks).slice(0, historicalCount);

  for (const track of historicalArray) {
    const artist = extractArtist(track);
    const title = extractTitle(track);
    const artistCount = historicalArtists.get(artist) || 1;

    tracks.push({
      artist,
      title,
      songId: undefined, // Would need to look up in library
      matchScore: Math.min(1, artistCount / 5),
      matchReason: `Liked during ${getPeriodLabel(startDate, 'month')}`,
    });
  }

  // Generate period label
  const periodLabel = startDate.getMonth() === endDate.getMonth()
    ? getPeriodLabel(startDate, 'month')
    : `${getPeriodLabel(startDate, 'month')} - ${getPeriodLabel(endDate, 'month')}`;

  return {
    name: `${periodLabel} Nostalgia Mix`,
    description: `Revisit your favorites from ${periodLabel}`,
    tracks,
    periodLabel,
    blendRatio,
  };
}

/**
 * Create and store a taste snapshot for export
 */
export async function createTasteSnapshot(
  userId: string,
  name: string,
  periodStart: Date,
  periodEnd: Date,
  description?: string
): Promise<TasteSnapshot> {
  // Get timeline data
  const timeline = await getMoodTimeline(userId, periodStart, periodEnd, 'month');

  // Check if we have any data to snapshot
  if (!timeline.dataPoints || timeline.dataPoints.length === 0) {
    throw new Error('No data available for the selected time period. Please select a period with listening history.');
  }

  // Aggregate data
  let totalListens = 0;
  let totalFeedback = 0;
  let thumbsUpCount = 0;
  const allGenres = new Map<string, number>();
  const allArtists = new Map<string, number>();
  const allTracks = new Map<string, number>();
  const aggregatedMoods = getDefaultMoodDistribution();

  for (const dp of timeline.dataPoints) {
    totalListens += dp.totalListens || 0;
    totalFeedback += dp.totalFeedback || 0;
    thumbsUpCount += Math.round((dp.acceptanceRate || 0) * (dp.totalFeedback || 0));

    // Safely iterate over top genres
    if (dp.topGenres && Array.isArray(dp.topGenres)) {
      for (const g of dp.topGenres) {
        if (g && g.name) {
          allGenres.set(g.name, (allGenres.get(g.name) || 0) + (g.count || 0));
        }
      }
    }

    // Safely iterate over top artists
    if (dp.topArtists && Array.isArray(dp.topArtists)) {
      for (const a of dp.topArtists) {
        if (a && a.name) {
          allArtists.set(a.name, (allArtists.get(a.name) || 0) + (a.count || 0));
        }
      }
    }

    // Safely iterate over top tracks
    if (dp.topTracks && Array.isArray(dp.topTracks)) {
      for (const t of dp.topTracks) {
        if (t && t.name) {
          allTracks.set(t.name, (allTracks.get(t.name) || 0) + (t.count || 0));
        }
      }
    }

    // Safely aggregate mood distribution
    if (dp.moodDistribution && typeof dp.moodDistribution === 'object') {
      for (const mood of Object.keys(aggregatedMoods) as (keyof MoodDistribution)[]) {
        const moodValue = dp.moodDistribution[mood];
        if (typeof moodValue === 'number') {
          aggregatedMoods[mood] += moodValue;
        }
      }
    }
  }

  // Normalize moods
  const moodTotal = Object.values(aggregatedMoods).reduce((s, v) => s + v, 0);
  if (moodTotal > 0) {
    for (const mood of Object.keys(aggregatedMoods) as (keyof MoodDistribution)[]) {
      aggregatedMoods[mood] = Number((aggregatedMoods[mood] / moodTotal).toFixed(3));
    }
  }

  const acceptanceRate = totalFeedback > 0 ? thumbsUpCount / totalFeedback : 0;
  const diversityScore = calculateDiversityScore(allArtists);

  const profileData: TasteProfileExport = {
    summary: {
      totalListens,
      totalFeedback,
      thumbsUpCount,
      thumbsDownCount: totalFeedback - thumbsUpCount,
      acceptanceRate: Number(acceptanceRate.toFixed(3)),
      diversityScore: Number(diversityScore.toFixed(3)),
    },
    moodDistribution: aggregatedMoods,
    topGenres: Array.from(allGenres.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, count]) => {
        const total = Array.from(allGenres.values()).reduce((s, c) => s + c, 0);
        return { name, count, percentage: total > 0 ? Number((count / total * 100).toFixed(1)) : 0 };
      }),
    topArtists: Array.from(allArtists.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([name, count]) => {
        const total = Array.from(allArtists.values()).reduce((s, c) => s + c, 0);
        return { name, count, percentage: total > 0 ? Number((count / total * 100).toFixed(1)) : 0 };
      }),
    topTracks: Array.from(allTracks.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 50)
      .map(([name, count]) => {
        const total = Array.from(allTracks.values()).reduce((s, c) => s + c, 0);
        return { name, count, percentage: total > 0 ? Number((count / total * 100).toFixed(1)) : 0 };
      }),
  };

  // Store snapshot
  try {
    const [snapshot] = await db
      .insert(tasteSnapshots)
      .values({
        userId,
        name,
        capturedAt: new Date(),
        periodStart,
        periodEnd,
        profileData,
        description,
        isAutoGenerated: 0,
      })
      .returning();

    if (!snapshot) {
      throw new Error('Failed to create snapshot: No data returned from database');
    }

    return snapshot;
  } catch (dbError) {
    console.error('Database error creating taste snapshot:', dbError);
    throw new Error(`Failed to save snapshot to database: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`);
  }
}

/**
 * Get all taste snapshots for a user
 */
export async function getUserTasteSnapshots(userId: string): Promise<TasteSnapshot[]> {
  return db
    .select()
    .from(tasteSnapshots)
    .where(eq(tasteSnapshots.userId, userId))
    .orderBy(desc(tasteSnapshots.capturedAt));
}

/**
 * Export a taste snapshot in various formats
 */
export function exportTasteSnapshot(
  snapshot: TasteSnapshot,
  format: 'json' | 'csv'
): string {
  const profile = snapshot.profileData;

  if (format === 'json') {
    return JSON.stringify({
      name: snapshot.name,
      description: snapshot.description,
      periodStart: snapshot.periodStart,
      periodEnd: snapshot.periodEnd,
      capturedAt: snapshot.capturedAt,
      ...profile,
    }, null, 2);
  }

  // CSV format
  const lines: string[] = [];

  // Header info
  lines.push('# Taste Profile Snapshot');
  lines.push(`# Name: ${snapshot.name}`);
  lines.push(`# Period: ${snapshot.periodStart} to ${snapshot.periodEnd}`);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push('Metric,Value');
  lines.push(`Total Listens,${profile.summary.totalListens}`);
  lines.push(`Total Feedback,${profile.summary.totalFeedback}`);
  lines.push(`Thumbs Up,${profile.summary.thumbsUpCount}`);
  lines.push(`Thumbs Down,${profile.summary.thumbsDownCount}`);
  lines.push(`Acceptance Rate,${(profile.summary.acceptanceRate * 100).toFixed(1)}%`);
  lines.push(`Diversity Score,${(profile.summary.diversityScore * 100).toFixed(1)}%`);
  lines.push('');

  // Mood Distribution
  lines.push('## Mood Distribution');
  lines.push('Mood,Percentage');
  for (const [mood, value] of Object.entries(profile.moodDistribution)) {
    lines.push(`${mood},${(value * 100).toFixed(1)}%`);
  }
  lines.push('');

  // Top Artists
  lines.push('## Top Artists');
  lines.push('Rank,Artist,Count,Percentage');
  profile.topArtists.forEach((a, i) => {
    lines.push(`${i + 1},${a.name.replace(/,/g, ';')},${a.count},${a.percentage}%`);
  });
  lines.push('');

  // Top Genres
  lines.push('## Top Genres');
  lines.push('Rank,Genre,Count,Percentage');
  profile.topGenres.forEach((g, i) => {
    lines.push(`${i + 1},${g.name.replace(/,/g, ';')},${g.count},${g.percentage}%`);
  });
  lines.push('');

  // Top Tracks
  lines.push('## Top Tracks');
  lines.push('Rank,Track,Count,Percentage');
  profile.topTracks.forEach((t, i) => {
    lines.push(`${i + 1},"${t.name.replace(/"/g, '""')}",${t.count},${t.percentage}%`);
  });

  return lines.join('\n');
}
