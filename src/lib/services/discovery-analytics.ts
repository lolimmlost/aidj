/**
 * Discovery Feed Analytics Service
 *
 * Tracks and aggregates analytics for:
 * - Recommendation quality metrics (CTR, play rate, save rate)
 * - Time-based engagement patterns
 * - Notification effectiveness
 * - A/B test results
 */

import { db } from '@/lib/db';
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm';
import {
  discoveryFeedAnalytics,
  discoveryFeedItems,
  scheduledNotifications,
  type DiscoveryFeedAnalytics,
  type DiscoveryFeedAnalyticsInsert,
} from '@/lib/db/schema/discovery-feed.schema';

// ============================================================================
// Types
// ============================================================================

export interface AnalyticsPeriod {
  start: Date;
  end: Date;
  level: 'daily' | 'weekly' | 'monthly';
}

export interface FeedMetrics {
  totalItemsShown: number;
  totalClicks: number;
  totalPlays: number;
  totalPlayDuration: number;
  totalSaves: number;
  totalSkips: number;
  totalDismissals: number;
  totalLikes: number;
  totalDislikes: number;
  totalNotInterested: number;
  clickThroughRate: number;
  playRate: number;
  saveRate: number;
  skipRate: number;
  dismissalRate: number;
}

export interface NotificationMetrics {
  sent: number;
  opened: number;
  openRate: number;
}

export interface SourceBreakdown {
  source: string;
  count: number;
  clickRate: number;
  playRate: number;
}

export interface TimeSlotBreakdown {
  timeSlot: string;
  count: number;
  clickRate: number;
  playRate: number;
}

// ============================================================================
// Analytics Calculation
// ============================================================================

/**
 * Calculate feed metrics for a specific period and user
 */
export async function calculateFeedMetrics(
  period: AnalyticsPeriod,
  userId?: string
): Promise<FeedMetrics> {
  const whereConditions = [
    gte(discoveryFeedItems.createdAt, period.start),
    lte(discoveryFeedItems.createdAt, period.end),
  ];

  if (userId) {
    whereConditions.push(eq(discoveryFeedItems.userId, userId));
  }

  const items = await db
    .select()
    .from(discoveryFeedItems)
    .where(and(...whereConditions));

  const totalItemsShown = items.filter((i) => i.shown).length;
  const totalClicks = items.filter((i) => i.clicked).length;
  const totalPlays = items.filter((i) => i.played).length;
  const totalPlayDuration = items.reduce((sum, i) => sum + (i.playDuration || 0), 0);
  const totalSaves = items.filter((i) => i.saved).length;
  const totalSkips = items.filter((i) => i.skipped).length;
  const totalDismissals = items.filter((i) => i.dismissed).length;
  const totalLikes = items.filter((i) => i.feedback === 'liked').length;
  const totalDislikes = items.filter((i) => i.feedback === 'disliked').length;
  const totalNotInterested = items.filter((i) => i.feedback === 'not_interested').length;

  const clickThroughRate = totalItemsShown > 0 ? totalClicks / totalItemsShown : 0;
  const playRate = totalItemsShown > 0 ? totalPlays / totalItemsShown : 0;
  const saveRate = totalItemsShown > 0 ? totalSaves / totalItemsShown : 0;
  const skipRate = totalItemsShown > 0 ? totalSkips / totalItemsShown : 0;
  const dismissalRate = totalItemsShown > 0 ? totalDismissals / totalItemsShown : 0;

  return {
    totalItemsShown,
    totalClicks,
    totalPlays,
    totalPlayDuration,
    totalSaves,
    totalSkips,
    totalDismissals,
    totalLikes,
    totalDislikes,
    totalNotInterested,
    clickThroughRate,
    playRate,
    saveRate,
    skipRate,
    dismissalRate,
  };
}

/**
 * Calculate notification metrics for a specific period
 */
export async function calculateNotificationMetrics(
  period: AnalyticsPeriod,
  userId?: string
): Promise<NotificationMetrics> {
  const whereConditions = [
    gte(scheduledNotifications.scheduledFor, period.start),
    lte(scheduledNotifications.scheduledFor, period.end),
  ];

  if (userId) {
    whereConditions.push(eq(scheduledNotifications.userId, userId));
  }

  const notifications = await db
    .select()
    .from(scheduledNotifications)
    .where(and(...whereConditions));

  const sent = notifications.filter((n) => n.status !== 'pending' && n.status !== 'failed').length;
  const opened = notifications.filter((n) => n.status === 'clicked' || n.status === 'delivered').length;
  const openRate = sent > 0 ? opened / sent : 0;

  return {
    sent,
    opened,
    openRate,
  };
}

/**
 * Calculate breakdown by recommendation source
 */
export async function calculateSourceBreakdown(
  period: AnalyticsPeriod,
  userId?: string
): Promise<SourceBreakdown[]> {
  const whereConditions = [
    gte(discoveryFeedItems.createdAt, period.start),
    lte(discoveryFeedItems.createdAt, period.end),
  ];

  if (userId) {
    whereConditions.push(eq(discoveryFeedItems.userId, userId));
  }

  const items = await db
    .select()
    .from(discoveryFeedItems)
    .where(and(...whereConditions));

  const sourceGroups = new Map<string, { total: number; clicked: number; played: number }>();

  for (const item of items) {
    const source = item.recommendationSource;
    const group = sourceGroups.get(source) || { total: 0, clicked: 0, played: 0 };
    group.total++;
    if (item.clicked) group.clicked++;
    if (item.played) group.played++;
    sourceGroups.set(source, group);
  }

  return Array.from(sourceGroups.entries()).map(([source, group]) => ({
    source,
    count: group.total,
    clickRate: group.total > 0 ? group.clicked / group.total : 0,
    playRate: group.total > 0 ? group.played / group.total : 0,
  }));
}

/**
 * Calculate breakdown by time slot
 */
export async function calculateTimeSlotBreakdown(
  period: AnalyticsPeriod,
  userId?: string
): Promise<TimeSlotBreakdown[]> {
  const whereConditions = [
    gte(discoveryFeedItems.createdAt, period.start),
    lte(discoveryFeedItems.createdAt, period.end),
  ];

  if (userId) {
    whereConditions.push(eq(discoveryFeedItems.userId, userId));
  }

  const items = await db
    .select()
    .from(discoveryFeedItems)
    .where(and(...whereConditions));

  const timeSlotGroups = new Map<string, { total: number; clicked: number; played: number }>();

  for (const item of items) {
    const timeSlot = item.targetTimeSlot || 'any';
    const group = timeSlotGroups.get(timeSlot) || { total: 0, clicked: 0, played: 0 };
    group.total++;
    if (item.clicked) group.clicked++;
    if (item.played) group.played++;
    timeSlotGroups.set(timeSlot, group);
  }

  return Array.from(timeSlotGroups.entries()).map(([timeSlot, group]) => ({
    timeSlot,
    count: group.total,
    clickRate: group.total > 0 ? group.clicked / group.total : 0,
    playRate: group.total > 0 ? group.played / group.total : 0,
  }));
}

// ============================================================================
// Analytics Storage
// ============================================================================

/**
 * Generate and store analytics for a period
 */
export async function generateAnalytics(
  period: AnalyticsPeriod,
  userId?: string
): Promise<DiscoveryFeedAnalytics> {
  // Calculate all metrics
  const feedMetrics = await calculateFeedMetrics(period, userId);
  const notificationMetrics = await calculateNotificationMetrics(period, userId);
  const sourceBreakdown = await calculateSourceBreakdown(period, userId);
  const timeSlotBreakdown = await calculateTimeSlotBreakdown(period, userId);

  // Create analytics record
  const analyticsId = crypto.randomUUID();
  const analyticsData: DiscoveryFeedAnalyticsInsert = {
    id: analyticsId,
    periodStart: period.start,
    periodEnd: period.end,
    aggregationLevel: period.level,
    userId: userId || null,
    ...feedMetrics,
    sourceBreakdown,
    timeSlotBreakdown,
    notificationsSent: notificationMetrics.sent,
    notificationsOpened: notificationMetrics.opened,
    notificationOpenRate: notificationMetrics.openRate,
  };

  await db.insert(discoveryFeedAnalytics).values(analyticsData);

  const analytics = await db
    .select()
    .from(discoveryFeedAnalytics)
    .where(eq(discoveryFeedAnalytics.id, analyticsId))
    .then((rows) => rows[0]);

  return analytics;
}

/**
 * Get analytics for a specific period
 */
export async function getAnalytics(
  period: AnalyticsPeriod,
  userId?: string
): Promise<DiscoveryFeedAnalytics | null> {
  const whereConditions = [
    eq(discoveryFeedAnalytics.periodStart, period.start),
    eq(discoveryFeedAnalytics.aggregationLevel, period.level),
  ];

  if (userId) {
    whereConditions.push(eq(discoveryFeedAnalytics.userId, userId));
  }

  const analytics = await db
    .select()
    .from(discoveryFeedAnalytics)
    .where(and(...whereConditions))
    .limit(1)
    .then((rows) => rows[0] || null);

  return analytics;
}

/**
 * Get analytics trend over multiple periods
 */
export async function getAnalyticsTrend(
  periods: number,
  level: 'daily' | 'weekly' | 'monthly',
  userId?: string
): Promise<DiscoveryFeedAnalytics[]> {
  const whereConditions = [eq(discoveryFeedAnalytics.aggregationLevel, level)];

  if (userId) {
    whereConditions.push(eq(discoveryFeedAnalytics.userId, userId));
  }

  const analytics = await db
    .select()
    .from(discoveryFeedAnalytics)
    .where(and(...whereConditions))
    .orderBy(desc(discoveryFeedAnalytics.periodStart))
    .limit(periods);

  return analytics.reverse(); // Oldest first
}

// ============================================================================
// Daily Analytics Job
// ============================================================================

/**
 * Generate daily analytics for all users
 * Should be called by a scheduled job at end of day
 */
export async function generateDailyAnalytics(): Promise<{
  processed: number;
  global: DiscoveryFeedAnalytics | null;
}> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const period: AnalyticsPeriod = {
    start: yesterday,
    end: today,
    level: 'daily',
  };

  console.log(`📊 [DiscoveryAnalytics] Generating daily analytics for ${yesterday.toDateString()}`);

  // Generate global analytics
  const globalAnalytics = await generateAnalytics(period);

  // Get unique user IDs from feed items in this period
  const userItems = await db
    .select({ userId: discoveryFeedItems.userId })
    .from(discoveryFeedItems)
    .where(
      and(
        gte(discoveryFeedItems.createdAt, period.start),
        lte(discoveryFeedItems.createdAt, period.end)
      )
    )
    .groupBy(discoveryFeedItems.userId);

  let processed = 0;

  for (const { userId } of userItems) {
    try {
      await generateAnalytics(period, userId);
      processed++;
    } catch (error) {
      console.error(`❌ [DiscoveryAnalytics] Error for user ${userId}:`, error);
    }
  }

  console.log(`📊 [DiscoveryAnalytics] Generated analytics for ${processed} users`);

  return {
    processed,
    global: globalAnalytics,
  };
}

// ============================================================================
// Real-time Metrics
// ============================================================================

/**
 * Get real-time metrics for the current day
 */
export async function getRealTimeMetrics(userId?: string): Promise<FeedMetrics> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const now = new Date();

  const period: AnalyticsPeriod = {
    start: today,
    end: now,
    level: 'daily',
  };

  return calculateFeedMetrics(period, userId);
}

/**
 * Get recommendation quality score (0-100)
 * Based on weighted metrics
 */
export async function getQualityScore(userId?: string): Promise<number> {
  const metrics = await getRealTimeMetrics(userId);

  // Weight factors
  const weights = {
    clickThroughRate: 0.2,
    playRate: 0.35,
    saveRate: 0.25,
    likeRatio: 0.2,
  };

  // Calculate like ratio
  const totalFeedback = metrics.totalLikes + metrics.totalDislikes;
  const likeRatio = totalFeedback > 0 ? metrics.totalLikes / totalFeedback : 0.5;

  // Calculate weighted score
  const score =
    metrics.clickThroughRate * weights.clickThroughRate * 100 +
    metrics.playRate * weights.playRate * 100 +
    metrics.saveRate * weights.saveRate * 100 +
    likeRatio * weights.likeRatio * 100;

  return Math.min(100, Math.round(score));
}

// ============================================================================
// Exports
// ============================================================================

export {
  type AnalyticsPeriod,
  type FeedMetrics,
  type NotificationMetrics,
  type SourceBreakdown,
  type TimeSlotBreakdown,
};
