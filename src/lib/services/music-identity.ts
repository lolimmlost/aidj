/**
 * Music Identity Service
 *
 * AI-powered yearly/monthly music summaries similar to Spotify Wrapped.
 * Generates personalized insights, mood classifications, artist affinities,
 * and trend analysis with shareable visual cards.
 *
 * Story: Music Identity System - AI-Powered Yearly/Monthly Summaries
 */

import { db } from '../db';
import {
  musicIdentitySummaries,
  listeningHistory,
  recommendationFeedback,
} from '../db/schema';
import type {
  MusicIdentitySummary,
  MusicIdentitySummaryInsert,
  AIInsights,
  MoodProfile,
  ArtistAffinity,
  TrendAnalysis,
  ListeningStats,
  CardData,
} from '../db/schema/music-identity.schema';
import type { MoodDistribution, TopItem } from '../db/schema/mood-history.schema';
import { eq, and, gte, lte, desc, asc, sql } from 'drizzle-orm';
import { getLLMProvider } from './llm/factory';

// ============================================================================
// Types
// ============================================================================

export type PeriodType = 'month' | 'year';

export interface GenerateSummaryRequest {
  userId: string;
  periodType: PeriodType;
  year: number;
  month?: number; // Required for monthly summaries
  regenerate?: boolean; // Force regeneration even if exists
}

export interface MusicIdentityResponse {
  summary: MusicIdentitySummary;
  isNew: boolean;
}

// ============================================================================
// Caching
// ============================================================================

interface CachedData<T> {
  data: T;
  timestamp: number;
}

const identityCache = new Map<string, CachedData<MusicIdentitySummary>>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getCached(key: string): MusicIdentitySummary | null {
  const cached = identityCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }
  return null;
}

function setCache(key: string, data: MusicIdentitySummary): void {
  identityCache.set(key, { data, timestamp: Date.now() });
}

export function clearMusicIdentityCache(userId?: string): void {
  if (userId) {
    for (const key of identityCache.keys()) {
      if (key.startsWith(userId)) {
        identityCache.delete(key);
      }
    }
  } else {
    identityCache.clear();
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

  if (/ambient|chill|lofi|lo-fi|downtempo|trip-hop|new age|meditation|spa/i.test(lowerGenre)) {
    return 'chill';
  }
  if (/dance|edm|electronic|house|techno|trance|drum and bass|dnb|dubstep|party|club|rave/i.test(lowerGenre)) {
    return 'energetic';
  }
  if (/blues|sad|melanchol|emo|gothic|darkwave|doom/i.test(lowerGenre)) {
    return 'melancholic';
  }
  if (/pop|disco|funk|soul|motown|ska|reggae|happy|sunshine|summer/i.test(lowerGenre)) {
    return 'happy';
  }
  if (/classical|instrumental|piano|acoustic|study|concentration|jazz|bossa/i.test(lowerGenre)) {
    return 'focused';
  }
  if (/r&b|rnb|slow jam|love|ballad|romantic|smooth/i.test(lowerGenre)) {
    return 'romantic';
  }
  if (/metal|hardcore|punk|thrash|death|black metal|grindcore|industrial|hard rock/i.test(lowerGenre)) {
    return 'aggressive';
  }

  return 'neutral';
}

function getPeriodBounds(year: number, month?: number): { start: Date; end: Date } {
  if (month) {
    // Monthly period
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);
    return { start, end };
  } else {
    // Yearly period
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31, 23, 59, 59, 999);
    return { start, end };
  }
}

function getPreviousPeriodBounds(year: number, month?: number): { start: Date; end: Date } {
  if (month) {
    // Previous month
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    return getPeriodBounds(prevYear, prevMonth);
  } else {
    // Previous year
    return getPeriodBounds(year - 1);
  }
}

function getMonthName(month: number): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return months[month - 1] || '';
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

function generateShareToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 16; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

// ============================================================================
// Data Collection Functions
// ============================================================================

async function collectListeningData(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<{
  history: Array<typeof listeningHistory.$inferSelect>;
  feedback: Array<typeof recommendationFeedback.$inferSelect>;
}> {
  const [history, feedback] = await Promise.all([
    db
      .select()
      .from(listeningHistory)
      .where(
        and(
          eq(listeningHistory.userId, userId),
          gte(listeningHistory.playedAt, startDate),
          lte(listeningHistory.playedAt, endDate)
        )
      )
      .orderBy(asc(listeningHistory.playedAt)),
    db
      .select()
      .from(recommendationFeedback)
      .where(
        and(
          eq(recommendationFeedback.userId, userId),
          gte(recommendationFeedback.timestamp, startDate),
          lte(recommendationFeedback.timestamp, endDate)
        )
      )
      .orderBy(asc(recommendationFeedback.timestamp)),
  ]);

  return { history, feedback };
}

async function collectPreviousPeriodData(
  userId: string,
  year: number,
  month?: number
): Promise<{
  history: Array<typeof listeningHistory.$inferSelect>;
  feedback: Array<typeof recommendationFeedback.$inferSelect>;
}> {
  const { start, end } = getPreviousPeriodBounds(year, month);
  return collectListeningData(userId, start, end);
}

// ============================================================================
// Analytics Calculation Functions
// ============================================================================

function calculateTopItems(
  items: Map<string, number>,
  limit: number = 10
): TopItem[] {
  const total = Array.from(items.values()).reduce((sum, count) => sum + count, 0);

  return Array.from(items.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([name, count]) => ({
      name,
      count,
      percentage: total > 0 ? Number((count / total * 100).toFixed(1)) : 0,
    }));
}

function calculateMoodProfile(
  history: Array<typeof listeningHistory.$inferSelect>,
  previousHistory: Array<typeof listeningHistory.$inferSelect>
): MoodProfile {
  const moodCounts = getDefaultMoodDistribution();
  const moodByHour: Record<number, Map<string, number>> = {};

  // Calculate mood distribution from genre data
  for (const h of history) {
    if (h.genre) {
      const mood = inferMoodFromGenre(h.genre);
      moodCounts[mood]++;

      // Track mood by hour
      const hour = h.playedAt.getHours();
      if (!moodByHour[hour]) {
        moodByHour[hour] = new Map();
      }
      moodByHour[hour].set(mood, (moodByHour[hour].get(mood) || 0) + 1);
    }
  }

  // Normalize distribution
  const totalMoodCounts = Object.values(moodCounts).reduce((sum, count) => sum + count, 0);
  const distribution = { ...moodCounts };
  if (totalMoodCounts > 0) {
    for (const mood of Object.keys(distribution) as (keyof MoodDistribution)[]) {
      distribution[mood] = Number((distribution[mood] / totalMoodCounts).toFixed(3));
    }
  }

  // Calculate previous period mood distribution for trends
  const prevMoodCounts = getDefaultMoodDistribution();
  for (const h of previousHistory) {
    if (h.genre) {
      const mood = inferMoodFromGenre(h.genre);
      prevMoodCounts[mood]++;
    }
  }
  const prevTotal = Object.values(prevMoodCounts).reduce((sum, count) => sum + count, 0);

  // Get dominant moods with trends
  const dominantMoods = Object.entries(distribution)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([mood, percentage]) => {
      const prevPercentage = prevTotal > 0
        ? prevMoodCounts[mood as keyof MoodDistribution] / prevTotal
        : 0;
      const diff = percentage - prevPercentage;

      return {
        mood: mood as keyof MoodDistribution,
        percentage: Number((percentage * 100).toFixed(1)),
        trend: diff > 0.05 ? 'rising' as const : diff < -0.05 ? 'falling' as const : 'stable' as const,
      };
    });

  // Calculate mood by time of day
  const getTimeOfDayMood = (hourStart: number, hourEnd: number): keyof MoodDistribution => {
    const combinedMoods = new Map<string, number>();
    for (let h = hourStart; h < hourEnd; h++) {
      if (moodByHour[h]) {
        for (const [mood, count] of moodByHour[h]) {
          combinedMoods.set(mood, (combinedMoods.get(mood) || 0) + count);
        }
      }
    }
    if (combinedMoods.size === 0) return 'neutral';
    return Array.from(combinedMoods.entries()).sort(([, a], [, b]) => b - a)[0][0] as keyof MoodDistribution;
  };

  const moodByTimeOfDay = {
    morning: getTimeOfDayMood(6, 12),
    afternoon: getTimeOfDayMood(12, 18),
    evening: getTimeOfDayMood(18, 22),
    night: getTimeOfDayMood(22, 6),
  };

  // Calculate variation score (entropy-based)
  const variationScore = calculateDiversityScore(
    new Map(Object.entries(moodCounts))
  );

  // Generate emotional range description
  const emotionalRanges: Record<string, string> = {
    high: "You embrace the full spectrum of musical emotions",
    medium: "Your taste spans several emotional territories",
    low: "You have a focused emotional palette",
  };
  const emotionalRange = variationScore > 0.7
    ? emotionalRanges.high
    : variationScore > 0.4
      ? emotionalRanges.medium
      : emotionalRanges.low;

  return {
    distribution,
    dominantMoods,
    moodByTimeOfDay,
    variationScore: Number(variationScore.toFixed(3)),
    emotionalRange,
  };
}

function calculateArtistAffinities(
  history: Array<typeof listeningHistory.$inferSelect>,
  previousHistory: Array<typeof listeningHistory.$inferSelect>
): ArtistAffinity[] {
  const artistData = new Map<string, {
    count: number;
    firstListened: Date;
    genres: Set<string>;
  }>();

  const prevArtistCounts = new Map<string, number>();

  // Process current period
  for (const h of history) {
    const existing = artistData.get(h.artist);
    if (existing) {
      existing.count++;
      if (h.playedAt < existing.firstListened) {
        existing.firstListened = h.playedAt;
      }
      if (h.genre) existing.genres.add(h.genre);
    } else {
      artistData.set(h.artist, {
        count: 1,
        firstListened: h.playedAt,
        genres: h.genre ? new Set([h.genre]) : new Set(),
      });
    }
  }

  // Process previous period
  for (const h of previousHistory) {
    prevArtistCounts.set(h.artist, (prevArtistCounts.get(h.artist) || 0) + 1);
  }

  // Calculate total plays for normalization
  const totalPlays = history.length;
  const prevTotalPlays = previousHistory.length;

  // Generate affinities
  return Array.from(artistData.entries())
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 20)
    .map(([artist, data]) => {
      const currentShare = totalPlays > 0 ? data.count / totalPlays : 0;
      const prevCount = prevArtistCounts.get(artist) || 0;
      const prevShare = prevTotalPlays > 0 ? prevCount / prevTotalPlays : 0;

      let status: 'top' | 'rising' | 'consistent' | 'fading';
      const shareDiff = currentShare - prevShare;

      if (data.count === Array.from(artistData.values()).sort((a, b) => b.count - a.count)[0].count) {
        status = 'top';
      } else if (shareDiff > 0.03) {
        status = 'rising';
      } else if (shareDiff < -0.03) {
        status = 'fading';
      } else {
        status = 'consistent';
      }

      return {
        artist,
        affinityScore: Math.min(100, Math.round((data.count / Math.max(1, totalPlays)) * 1000)),
        playCount: data.count,
        firstListened: data.firstListened.toISOString(),
        relatedGenres: Array.from(data.genres).slice(0, 5),
        status,
      };
    });
}

function calculateTrendAnalysis(
  history: Array<typeof listeningHistory.$inferSelect>,
  previousHistory: Array<typeof listeningHistory.$inferSelect>
): TrendAnalysis {
  const currentArtists = new Map<string, number>();
  const currentGenres = new Map<string, number>();
  const prevArtists = new Map<string, number>();
  const prevGenres = new Map<string, number>();

  // Collect current period data
  for (const h of history) {
    currentArtists.set(h.artist, (currentArtists.get(h.artist) || 0) + 1);
    if (h.genre) {
      currentGenres.set(h.genre, (currentGenres.get(h.genre) || 0) + 1);
    }
  }

  // Collect previous period data
  for (const h of previousHistory) {
    prevArtists.set(h.artist, (prevArtists.get(h.artist) || 0) + 1);
    if (h.genre) {
      prevGenres.set(h.genre, (prevGenres.get(h.genre) || 0) + 1);
    }
  }

  const totalCurrent = history.length;
  const totalPrev = previousHistory.length;

  // Find artists/genres you're getting into (high growth or new)
  const gettingInto: TrendAnalysis['gettingInto'] = [];

  for (const [artist, count] of currentArtists) {
    const prevCount = prevArtists.get(artist) || 0;
    const currentShare = totalCurrent > 0 ? count / totalCurrent : 0;
    const prevShare = totalPrev > 0 ? prevCount / totalPrev : 0;

    if (prevCount === 0 && count >= 3) {
      // New discovery
      gettingInto.push({
        type: 'artist',
        name: artist,
        growthRate: 100,
      });
    } else if (prevShare > 0) {
      const growthRate = ((currentShare - prevShare) / prevShare) * 100;
      if (growthRate > 50) {
        gettingInto.push({
          type: 'artist',
          name: artist,
          growthRate: Math.round(growthRate),
        });
      }
    }
  }

  for (const [genre, count] of currentGenres) {
    const prevCount = prevGenres.get(genre) || 0;
    const currentShare = totalCurrent > 0 ? count / totalCurrent : 0;
    const prevShare = totalPrev > 0 ? prevCount / totalPrev : 0;

    if (prevCount === 0 && count >= 5) {
      gettingInto.push({
        type: 'genre',
        name: genre,
        growthRate: 100,
      });
    } else if (prevShare > 0) {
      const growthRate = ((currentShare - prevShare) / prevShare) * 100;
      if (growthRate > 30) {
        gettingInto.push({
          type: 'genre',
          name: genre,
          growthRate: Math.round(growthRate),
        });
      }
    }
  }

  // Find artists/genres you're moving away from
  const movingAwayFrom: TrendAnalysis['movingAwayFrom'] = [];

  for (const [artist, prevCount] of prevArtists) {
    const currentCount = currentArtists.get(artist) || 0;
    const currentShare = totalCurrent > 0 ? currentCount / totalCurrent : 0;
    const prevShare = totalPrev > 0 ? prevCount / totalPrev : 0;

    if (currentCount === 0 && prevCount >= 3) {
      // Completely stopped listening
      movingAwayFrom.push({
        type: 'artist',
        name: artist,
        declineRate: 100,
      });
    } else if (prevShare > 0.02) {
      const declineRate = ((prevShare - currentShare) / prevShare) * 100;
      if (declineRate > 50) {
        movingAwayFrom.push({
          type: 'artist',
          name: artist,
          declineRate: Math.round(declineRate),
        });
      }
    }
  }

  for (const [genre, prevCount] of prevGenres) {
    const currentCount = currentGenres.get(genre) || 0;
    const currentShare = totalCurrent > 0 ? currentCount / totalCurrent : 0;
    const prevShare = totalPrev > 0 ? prevCount / totalPrev : 0;

    if (prevShare > 0.05) {
      const declineRate = ((prevShare - currentShare) / prevShare) * 100;
      if (declineRate > 30) {
        movingAwayFrom.push({
          type: 'genre',
          name: genre,
          declineRate: Math.round(declineRate),
        });
      }
    }
  }

  // Calculate diversity
  const currentDiversity = calculateDiversityScore(currentArtists);
  const prevDiversity = calculateDiversityScore(prevArtists);
  const diversityDiff = currentDiversity - prevDiversity;

  let diversityTrend: 'expanding' | 'narrowing' | 'stable';
  if (diversityDiff > 0.1) {
    diversityTrend = 'expanding';
  } else if (diversityDiff < -0.1) {
    diversityTrend = 'narrowing';
  } else {
    diversityTrend = 'stable';
  }

  // Count new discoveries
  let newDiscoveriesCount = 0;
  for (const artist of currentArtists.keys()) {
    if (!prevArtists.has(artist)) {
      newDiscoveriesCount++;
    }
  }

  // Generate evolution summary
  let evolutionSummary: string;
  if (gettingInto.length > movingAwayFrom.length && diversityTrend === 'expanding') {
    evolutionSummary = "Your taste is expanding with exciting new discoveries";
  } else if (movingAwayFrom.length > gettingInto.length && diversityTrend === 'narrowing') {
    evolutionSummary = "You're refining your taste and focusing on your favorites";
  } else if (gettingInto.length === 0 && movingAwayFrom.length === 0) {
    evolutionSummary = "Your musical preferences have remained consistent";
  } else {
    evolutionSummary = "Your taste is evolving with a healthy mix of new and familiar sounds";
  }

  return {
    gettingInto: gettingInto.sort((a, b) => b.growthRate - a.growthRate).slice(0, 5),
    movingAwayFrom: movingAwayFrom.sort((a, b) => b.declineRate - a.declineRate).slice(0, 5),
    evolutionSummary,
    diversityTrend,
    diversityScore: Number(currentDiversity.toFixed(3)),
    newDiscoveriesCount,
  };
}

function calculateListeningStats(
  history: Array<typeof listeningHistory.$inferSelect>,
  feedback: Array<typeof recommendationFeedback.$inferSelect>
): ListeningStats {
  const uniqueArtists = new Set(history.map(h => h.artist));
  const uniqueTracks = new Set(history.map(h => `${h.artist} - ${h.title}`));
  const uniqueGenres = new Set(history.filter(h => h.genre).map(h => h.genre!));

  // Calculate total minutes
  let totalMinutes = 0;
  for (const h of history) {
    if (h.playDuration) {
      totalMinutes += h.playDuration / 60;
    } else if (h.songDuration) {
      totalMinutes += h.songDuration / 60;
    }
  }

  // Calculate completion rate
  let completedCount = 0;
  for (const h of history) {
    if (h.completed === 1) {
      completedCount++;
    }
  }
  const completionRate = history.length > 0 ? (completedCount / history.length) * 100 : 0;

  // Calculate most active day
  const dayOfWeekCounts = new Map<number, number>();
  for (const h of history) {
    const day = h.playedAt.getDay();
    dayOfWeekCounts.set(day, (dayOfWeekCounts.get(day) || 0) + 1);
  }
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  let mostActiveDay = 'Saturday';
  let maxDayCount = 0;
  for (const [day, count] of dayOfWeekCounts) {
    if (count > maxDayCount) {
      maxDayCount = count;
      mostActiveDay = dayNames[day];
    }
  }

  // Calculate most active hour
  const hourCounts = new Map<number, number>();
  for (const h of history) {
    const hour = h.playedAt.getHours();
    hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
  }
  let mostActiveHour = 20;
  let maxHourCount = 0;
  for (const [hour, count] of hourCounts) {
    if (count > maxHourCount) {
      maxHourCount = count;
      mostActiveHour = hour;
    }
  }

  // Calculate feedback stats
  const thumbsUpCount = feedback.filter(f => f.feedbackType === 'thumbs_up').length;
  const acceptanceRate = feedback.length > 0 ? (thumbsUpCount / feedback.length) * 100 : 0;

  return {
    totalListens: history.length,
    totalMinutesListened: Math.round(totalMinutes),
    uniqueArtists: uniqueArtists.size,
    uniqueTracks: uniqueTracks.size,
    uniqueGenres: uniqueGenres.size,
    averageSessionLength: history.length > 0 ? Math.round(totalMinutes / Math.max(1, history.length / 5)) : 0,
    longestListeningStreak: 0, // TODO: Calculate actual streak
    mostActiveDay,
    mostActiveHour,
    completionRate: Number(completionRate.toFixed(1)),
    feedbackCount: feedback.length,
    acceptanceRate: Number(acceptanceRate.toFixed(1)),
  };
}

// ============================================================================
// AI Insights Generation
// ============================================================================

async function generateAIInsights(
  userId: string,
  periodType: PeriodType,
  year: number,
  month: number | undefined,
  topArtists: TopItem[],
  topGenres: TopItem[],
  moodProfile: MoodProfile,
  trendAnalysis: TrendAnalysis,
  stats: ListeningStats
): Promise<AIInsights> {
  const periodLabel = month ? `${getMonthName(month)} ${year}` : `${year}`;

  const prompt = `You are a music analyst creating a personalized music summary for a listener's ${periodType === 'year' ? 'yearly' : 'monthly'} music identity report (similar to Spotify Wrapped).

Based on the following listening data for ${periodLabel}, create a personalized, engaging, and insightful summary:

## Listening Stats
- Total plays: ${stats.totalListens}
- Total minutes: ${stats.totalMinutesListened}
- Unique artists: ${stats.uniqueArtists}
- Unique tracks: ${stats.uniqueTracks}
- Most active day: ${stats.mostActiveDay}
- Peak listening hour: ${stats.mostActiveHour}:00

## Top Artists
${topArtists.slice(0, 5).map((a, i) => `${i + 1}. ${a.name} (${a.percentage}%)`).join('\n')}

## Top Genres
${topGenres.slice(0, 5).map((g, i) => `${i + 1}. ${g.name} (${g.percentage}%)`).join('\n')}

## Mood Profile
- Dominant moods: ${moodProfile.dominantMoods.map(m => `${m.mood} (${m.percentage}%, ${m.trend})`).join(', ')}
- Emotional range: ${moodProfile.emotionalRange}
- Variation score: ${(moodProfile.variationScore * 100).toFixed(0)}%

## Trends
- Getting into: ${trendAnalysis.gettingInto.map(t => `${t.name} (+${t.growthRate}%)`).join(', ') || 'None significant'}
- Moving away from: ${trendAnalysis.movingAwayFrom.map(t => `${t.name} (-${t.declineRate}%)`).join(', ') || 'None significant'}
- Diversity trend: ${trendAnalysis.diversityTrend}
- New discoveries: ${trendAnalysis.newDiscoveriesCount}

Generate a JSON response with:
1. narrative: A 2-3 sentence engaging story about their music journey this ${periodType}
2. highlights: Array of 4-5 key highlights/achievements (brief bullet points)
3. musicPersonality: Object with type (creative name like "The Explorer", "The Deep Diver", "The Mood Rider"), description (1 sentence), and traits (3-4 traits)
4. funFacts: Array of 3-4 fun/interesting observations
5. prediction: One sentence prediction or suggestion for next ${periodType}

Be creative, fun, and positive. Use music-related metaphors. Make it feel personal and celebratory.

Respond ONLY with valid JSON, no markdown:`;

  try {
    const provider = getLLMProvider();

    const response = await provider.generate({
      model: provider.getDefaultModel(),
      prompt,
      temperature: 0.8,
      maxTokens: 1500,
      systemPrompt: 'You are a creative music analyst. Respond only with valid JSON.',
    });

    // Parse the response
    const cleanedResponse = response.content.replace(/```json\n?|\n?```/g, '').trim();
    const insights = JSON.parse(cleanedResponse) as AIInsights;

    return insights;
  } catch (error) {
    console.error('Failed to generate AI insights:', error);

    // Fallback insights
    return {
      narrative: `Your ${periodLabel} was filled with great music! You explored ${stats.uniqueArtists} artists and ${stats.uniqueTracks} tracks, showing a diverse musical appetite.`,
      highlights: [
        `Listened to ${stats.totalListens} tracks`,
        `${stats.uniqueArtists} different artists in your rotation`,
        `${topArtists[0]?.name || 'Your favorite artist'} was your top artist`,
        `${trendAnalysis.newDiscoveriesCount} new discoveries this period`,
      ],
      musicPersonality: {
        type: 'The Music Lover',
        description: 'You have a genuine appreciation for a variety of musical styles.',
        traits: ['Curious', 'Open-minded', 'Consistent'],
      },
      funFacts: [
        `Your favorite day to listen was ${stats.mostActiveDay}`,
        `Peak listening time: ${stats.mostActiveHour}:00`,
        `You completed ${stats.completionRate.toFixed(0)}% of songs you started`,
      ],
      prediction: `Keep exploring! There's more great music waiting for you.`,
    };
  }
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Generate or retrieve a music identity summary for a user
 */
export async function generateMusicIdentitySummary(
  request: GenerateSummaryRequest
): Promise<MusicIdentityResponse> {
  const { userId, periodType, year, month, regenerate } = request;

  // Validate month for monthly summaries
  if (periodType === 'month' && (!month || month < 1 || month > 12)) {
    throw new Error('Month is required for monthly summaries (1-12)');
  }

  // Check cache first (unless regenerating)
  const cacheKey = `${userId}:${periodType}:${year}:${month || ''}`;
  if (!regenerate) {
    const cached = getCached(cacheKey);
    if (cached) {
      return { summary: cached, isNew: false };
    }

    // Check database for existing summary
    const existing = await db
      .select()
      .from(musicIdentitySummaries)
      .where(
        and(
          eq(musicIdentitySummaries.userId, userId),
          eq(musicIdentitySummaries.periodType, periodType),
          eq(musicIdentitySummaries.year, year),
          month ? eq(musicIdentitySummaries.month, month) : sql`${musicIdentitySummaries.month} IS NULL`
        )
      )
      .limit(1);

    if (existing.length > 0) {
      setCache(cacheKey, existing[0]);
      return { summary: existing[0], isNew: false };
    }
  }

  // Collect data for the period
  const { start, end } = getPeriodBounds(year, month);
  const { history, feedback } = await collectListeningData(userId, start, end);

  // Check if we have enough data
  if (history.length < 10) {
    throw new Error(`Not enough listening data for ${periodType === 'month' ? getMonthName(month!) : year}. Need at least 10 listens.`);
  }

  // Collect previous period data for comparisons
  const previousData = await collectPreviousPeriodData(userId, year, month);

  // Calculate all analytics
  const artistCounts = new Map<string, number>();
  const trackCounts = new Map<string, number>();
  const genreCounts = new Map<string, number>();

  for (const h of history) {
    artistCounts.set(h.artist, (artistCounts.get(h.artist) || 0) + 1);
    trackCounts.set(`${h.artist} - ${h.title}`, (trackCounts.get(`${h.artist} - ${h.title}`) || 0) + 1);
    if (h.genre) {
      genreCounts.set(h.genre, (genreCounts.get(h.genre) || 0) + 1);
    }
  }

  const topArtists = calculateTopItems(artistCounts, 20);
  const topTracks = calculateTopItems(trackCounts, 50);
  const topGenres = calculateTopItems(genreCounts, 10);

  const moodProfile = calculateMoodProfile(history, previousData.history);
  const artistAffinities = calculateArtistAffinities(history, previousData.history);
  const trendAnalysis = calculateTrendAnalysis(history, previousData.history);
  const stats = calculateListeningStats(history, feedback);

  // Generate AI insights
  const aiInsights = await generateAIInsights(
    userId,
    periodType,
    year,
    month,
    topArtists,
    topGenres,
    moodProfile,
    trendAnalysis,
    stats
  );

  // Generate title
  const _periodLabel = month ? `${getMonthName(month)} ${year}` : `${year}`;
  const title = periodType === 'year'
    ? `Your ${year} Music Journey`
    : `${getMonthName(month!)} ${year} Wrapped`;

  // Create default card data
  const cardData: CardData = {
    primaryColor: '#8b5cf6',
    secondaryColor: '#ec4899',
    layout: 'vibrant',
    showStats: true,
    showTopArtists: true,
    showMoodProfile: true,
    showTrends: true,
  };

  // Create the summary
  const summaryData: MusicIdentitySummaryInsert = {
    userId,
    periodType,
    year,
    month: month || null,
    title,
    aiInsights,
    moodProfile,
    artistAffinities,
    trendAnalysis,
    topArtists,
    topTracks,
    topGenres,
    stats,
    cardData,
    cardTheme: 'default',
    shareToken: generateShareToken(),
    isPublic: 0,
  };

  // If regenerating, delete existing
  if (regenerate) {
    await db
      .delete(musicIdentitySummaries)
      .where(
        and(
          eq(musicIdentitySummaries.userId, userId),
          eq(musicIdentitySummaries.periodType, periodType),
          eq(musicIdentitySummaries.year, year),
          month ? eq(musicIdentitySummaries.month, month) : sql`${musicIdentitySummaries.month} IS NULL`
        )
      );
  }

  // Insert new summary
  const [summary] = await db
    .insert(musicIdentitySummaries)
    .values(summaryData)
    .returning();

  setCache(cacheKey, summary);

  return { summary, isNew: true };
}

/**
 * Get all summaries for a user
 */
export async function getUserMusicIdentitySummaries(
  userId: string,
  periodType?: PeriodType
): Promise<MusicIdentitySummary[]> {
  const conditions = [eq(musicIdentitySummaries.userId, userId)];

  if (periodType) {
    conditions.push(eq(musicIdentitySummaries.periodType, periodType));
  }

  return db
    .select()
    .from(musicIdentitySummaries)
    .where(and(...conditions))
    .orderBy(desc(musicIdentitySummaries.year), desc(musicIdentitySummaries.month));
}

/**
 * Get a specific summary by ID
 */
export async function getMusicIdentitySummary(
  summaryId: string,
  userId?: string
): Promise<MusicIdentitySummary | null> {
  const conditions = [eq(musicIdentitySummaries.id, summaryId)];

  if (userId) {
    conditions.push(eq(musicIdentitySummaries.userId, userId));
  }

  const result = await db
    .select()
    .from(musicIdentitySummaries)
    .where(and(...conditions))
    .limit(1);

  return result[0] || null;
}

/**
 * Get a summary by share token (for public sharing)
 */
export async function getMusicIdentityByShareToken(
  shareToken: string
): Promise<MusicIdentitySummary | null> {
  const result = await db
    .select()
    .from(musicIdentitySummaries)
    .where(
      and(
        eq(musicIdentitySummaries.shareToken, shareToken),
        eq(musicIdentitySummaries.isPublic, 1)
      )
    )
    .limit(1);

  return result[0] || null;
}

/**
 * Update sharing settings for a summary
 */
export async function updateSharingSettings(
  summaryId: string,
  userId: string,
  isPublic: boolean
): Promise<MusicIdentitySummary | null> {
  const result = await db
    .update(musicIdentitySummaries)
    .set({
      isPublic: isPublic ? 1 : 0,
      shareToken: isPublic ? generateShareToken() : null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(musicIdentitySummaries.id, summaryId),
        eq(musicIdentitySummaries.userId, userId)
      )
    )
    .returning();

  return result[0] || null;
}

/**
 * Update card customization
 */
export async function updateCardCustomization(
  summaryId: string,
  userId: string,
  cardData: Partial<CardData>,
  cardTheme?: string
): Promise<MusicIdentitySummary | null> {
  const existing = await getMusicIdentitySummary(summaryId, userId);
  if (!existing) return null;

  const result = await db
    .update(musicIdentitySummaries)
    .set({
      cardData: { ...existing.cardData, ...cardData },
      cardTheme: cardTheme || existing.cardTheme,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(musicIdentitySummaries.id, summaryId),
        eq(musicIdentitySummaries.userId, userId)
      )
    )
    .returning();

  return result[0] || null;
}

/**
 * Delete a summary
 */
export async function deleteMusicIdentitySummary(
  summaryId: string,
  userId: string
): Promise<boolean> {
  const result = await db
    .delete(musicIdentitySummaries)
    .where(
      and(
        eq(musicIdentitySummaries.id, summaryId),
        eq(musicIdentitySummaries.userId, userId)
      )
    )
    .returning();

  return result.length > 0;
}

/**
 * Get available periods for a user (years and months with enough data)
 */
export async function getAvailablePeriods(
  userId: string
): Promise<{ years: number[]; months: Array<{ year: number; month: number }> }> {
  // Get all listening history to determine available periods
  const history = await db
    .select({
      year: sql<number>`EXTRACT(YEAR FROM ${listeningHistory.playedAt})`.as('year'),
      month: sql<number>`EXTRACT(MONTH FROM ${listeningHistory.playedAt})`.as('month'),
      count: sql<number>`COUNT(*)`.as('count'),
    })
    .from(listeningHistory)
    .where(eq(listeningHistory.userId, userId))
    .groupBy(
      sql`EXTRACT(YEAR FROM ${listeningHistory.playedAt})`,
      sql`EXTRACT(MONTH FROM ${listeningHistory.playedAt})`
    )
    .orderBy(
      sql`EXTRACT(YEAR FROM ${listeningHistory.playedAt}) DESC`,
      sql`EXTRACT(MONTH FROM ${listeningHistory.playedAt}) DESC`
    );

  const yearCounts = new Map<number, number>();
  const months: Array<{ year: number; month: number }> = [];

  for (const row of history) {
    const year = Number(row.year);
    const month = Number(row.month);
    const count = Number(row.count);

    yearCounts.set(year, (yearCounts.get(year) || 0) + count);

    if (count >= 10) {
      months.push({ year, month });
    }
  }

  // Years with at least 50 listens
  const years = Array.from(yearCounts.entries())
    .filter(([, count]) => count >= 50)
    .map(([year]) => year)
    .sort((a, b) => b - a);

  return { years, months };
}
