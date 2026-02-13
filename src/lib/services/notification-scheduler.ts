/**
 * Notification Scheduler Service
 *
 * Schedules and manages discovery feed notifications based on:
 * - User notification preferences
 * - Optimal engagement times
 * - A/B testing for timing optimization
 * - Quiet hours respecting
 */

import { db } from '@/lib/db';
import { eq, and, lte, gte, desc, sql } from 'drizzle-orm';
import {
  scheduledNotifications,
  discoveryNotificationPreferences,
  discoveryFeedItems,
  type ScheduledNotification,
  type DiscoveryNotificationPreferences,
} from '@/lib/db/schema/discovery-feed.schema';
// user import removed - unused

// ============================================================================
// Types
// ============================================================================

export interface NotificationContent {
  title: string;
  body: string;
  actionUrl?: string;
  feedItemId?: string;
  type: 'time_based' | 'new_release' | 'personalized' | 'trending' | 'reminder';
}

export interface ScheduleResult {
  scheduled: boolean;
  scheduledFor?: Date;
  reason?: string;
}

// ============================================================================
// Time Utilities
// ============================================================================

/**
 * Parse time string (HH:MM) to hours and minutes
 */
function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return { hours, minutes };
}

/**
 * Check if current time is within quiet hours
 */
function isQuietHours(
  now: Date,
  quietStart: string,
  quietEnd: string
): boolean {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startTime = parseTime(quietStart);
  const endTime = parseTime(quietEnd);

  const startMinutes = startTime.hours * 60 + startTime.minutes;
  const endMinutes = endTime.hours * 60 + endTime.minutes;

  // Handle overnight quiet hours (e.g., 22:00 - 08:00)
  if (startMinutes > endMinutes) {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

/**
 * Get next available notification time respecting preferences
 */
function getNextNotificationTime(
  prefs: DiscoveryNotificationPreferences,
  now: Date = new Date()
): Date | null {
  const preferredTimes = prefs.preferredTimes || ['09:00', '17:00'];
  const activeDays = prefs.activeDays || [0, 1, 2, 3, 4, 5, 6];

  // Look ahead up to 7 days to find a valid slot
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const checkDate = new Date(now);
    checkDate.setDate(checkDate.getDate() + dayOffset);
    const dayOfWeek = checkDate.getDay();

    // Skip inactive days
    if (!activeDays.includes(dayOfWeek)) continue;

    for (const timeStr of preferredTimes) {
      const { hours, minutes } = parseTime(timeStr);
      const candidateTime = new Date(checkDate);
      candidateTime.setHours(hours, minutes, 0, 0);

      // Skip if in the past
      if (candidateTime <= now) continue;

      // Check quiet hours
      if (
        prefs.quietHoursStart &&
        prefs.quietHoursEnd &&
        isQuietHours(candidateTime, prefs.quietHoursStart, prefs.quietHoursEnd)
      ) {
        continue;
      }

      return candidateTime;
    }
  }

  return null;
}

// ============================================================================
// Notification Scheduling
// ============================================================================

/**
 * Schedule a notification for a user
 */
export async function scheduleNotification(
  userId: string,
  content: NotificationContent
): Promise<ScheduleResult> {
  // Get user's notification preferences
  const prefs = await db
    .select()
    .from(discoveryNotificationPreferences)
    .where(eq(discoveryNotificationPreferences.userId, userId))
    .limit(1)
    .then(rows => rows[0]);

  // Check if notifications are enabled
  if (!prefs || !prefs.enabled) {
    return {
      scheduled: false,
      reason: 'Notifications disabled',
    };
  }

  // Check notification type preferences
  const typePrefs: Record<string, boolean> = {
    new_release: prefs.includeNewReleases,
    personalized: prefs.includePersonalized,
    time_based: prefs.includeTimeBasedSuggestions,
    trending: prefs.includeTrending,
    reminder: true, // Always allow reminders
  };

  if (!typePrefs[content.type]) {
    return {
      scheduled: false,
      reason: `Notification type "${content.type}" disabled`,
    };
  }

  // Check daily notification limit
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayNotificationCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(scheduledNotifications)
    .where(
      and(
        eq(scheduledNotifications.userId, userId),
        gte(scheduledNotifications.scheduledFor, today),
        lte(scheduledNotifications.scheduledFor, tomorrow)
      )
    )
    .then(rows => Number(rows[0]?.count || 0));

  if (todayNotificationCount >= prefs.maxNotificationsPerDay) {
    return {
      scheduled: false,
      reason: 'Daily notification limit reached',
    };
  }

  // Calculate next notification time based on frequency
  let scheduledFor: Date | null = null;

  switch (prefs.frequency) {
    case 'realtime':
      scheduledFor = new Date();
      break;
    case 'hourly':
      scheduledFor = new Date();
      scheduledFor.setMinutes(0, 0, 0);
      scheduledFor.setHours(scheduledFor.getHours() + 1);
      break;
    case 'daily':
    case 'weekly':
      scheduledFor = getNextNotificationTime(prefs);
      break;
  }

  if (!scheduledFor) {
    return {
      scheduled: false,
      reason: 'No available notification time',
    };
  }

  // Create the scheduled notification
  const notificationId = crypto.randomUUID();
  await db.insert(scheduledNotifications).values({
    id: notificationId,
    userId,
    title: content.title,
    body: content.body,
    actionUrl: content.actionUrl,
    feedItemId: content.feedItemId,
    notificationType: content.type,
    scheduledFor,
    status: 'pending',
    abTestVariant: prefs.abTestGroup,
  });

  console.log(`📬 [NotificationScheduler] Scheduled notification for ${userId} at ${scheduledFor}`);

  return {
    scheduled: true,
    scheduledFor,
  };
}

/**
 * Get pending notifications ready to be sent
 */
export async function getPendingNotifications(
  limit: number = 100
): Promise<ScheduledNotification[]> {
  const now = new Date();

  const notifications = await db
    .select()
    .from(scheduledNotifications)
    .where(
      and(
        eq(scheduledNotifications.status, 'pending'),
        lte(scheduledNotifications.scheduledFor, now)
      )
    )
    .orderBy(scheduledNotifications.scheduledFor)
    .limit(limit);

  return notifications;
}

/**
 * Mark a notification as sent
 */
export async function markNotificationSent(notificationId: string): Promise<void> {
  await db
    .update(scheduledNotifications)
    .set({
      status: 'sent',
      sentAt: new Date(),
    })
    .where(eq(scheduledNotifications.id, notificationId));
}

/**
 * Mark a notification as delivered
 */
export async function markNotificationDelivered(notificationId: string): Promise<void> {
  await db
    .update(scheduledNotifications)
    .set({
      status: 'delivered',
      deliveredAt: new Date(),
    })
    .where(eq(scheduledNotifications.id, notificationId));
}

/**
 * Mark a notification as clicked
 */
export async function markNotificationClicked(notificationId: string): Promise<void> {
  await db
    .update(scheduledNotifications)
    .set({
      status: 'clicked',
      clickedAt: new Date(),
    })
    .where(eq(scheduledNotifications.id, notificationId));
}

/**
 * Mark a notification as failed
 */
export async function markNotificationFailed(
  notificationId: string,
  errorMessage: string
): Promise<void> {
  const notification = await db
    .select()
    .from(scheduledNotifications)
    .where(eq(scheduledNotifications.id, notificationId))
    .then(rows => rows[0]);

  if (!notification) return;

  const newRetryCount = notification.retryCount + 1;

  await db
    .update(scheduledNotifications)
    .set({
      status: newRetryCount >= 3 ? 'failed' : 'pending',
      errorMessage,
      retryCount: newRetryCount,
      // Retry after exponential backoff
      scheduledFor: new Date(Date.now() + Math.pow(2, newRetryCount) * 60 * 1000),
    })
    .where(eq(scheduledNotifications.id, notificationId));
}

// ============================================================================
// Batch Notification Generation
// ============================================================================

/**
 * Generate daily notifications for all users
 * Should be called by a scheduled job
 */
export async function generateDailyNotifications(): Promise<{
  processed: number;
  scheduled: number;
}> {
  console.log('📬 [NotificationScheduler] Generating daily notifications...');

  // Get all users with notifications enabled
  const usersWithPrefs = await db
    .select({
      userId: discoveryNotificationPreferences.userId,
      prefs: discoveryNotificationPreferences,
    })
    .from(discoveryNotificationPreferences)
    .where(eq(discoveryNotificationPreferences.enabled, true));

  let processed = 0;
  let scheduled = 0;

  for (const { userId, prefs: _prefs } of usersWithPrefs) {
    processed++;

    try {
      // Get a high-scoring unshown feed item for this user
      const feedItem = await db
        .select()
        .from(discoveryFeedItems)
        .where(
          and(
            eq(discoveryFeedItems.userId, userId),
            eq(discoveryFeedItems.shown, false),
            gte(discoveryFeedItems.expiresAt, new Date())
          )
        )
        .orderBy(desc(discoveryFeedItems.score))
        .limit(1)
        .then(rows => rows[0]);

      if (!feedItem) continue;

      // Create notification content based on time context
      const now = new Date();
      const hour = now.getHours();
      let timeContext = 'today';
      if (hour >= 5 && hour < 12) timeContext = 'this morning';
      else if (hour >= 12 && hour < 17) timeContext = 'this afternoon';
      else if (hour >= 17 && hour < 21) timeContext = 'this evening';
      else timeContext = 'tonight';

      const content: NotificationContent = {
        title: `Perfect for ${timeContext}`,
        body: `${feedItem.title} - ${feedItem.explanation || 'Recommended for you'}`,
        actionUrl: `/dashboard/discover?highlight=${feedItem.id}`,
        feedItemId: feedItem.id,
        type: 'time_based',
      };

      const result = await scheduleNotification(userId, content);

      if (result.scheduled) {
        scheduled++;
      }
    } catch (error) {
      console.error(`❌ [NotificationScheduler] Error for user ${userId}:`, error);
    }
  }

  console.log(`📬 [NotificationScheduler] Processed ${processed} users, scheduled ${scheduled} notifications`);

  return { processed, scheduled };
}

/**
 * Calculate optimal notification time based on user engagement patterns
 * Updates the computedOptimalTime field for A/B testing
 */
export async function calculateOptimalNotificationTime(
  userId: string
): Promise<string | null> {
  // Get user's notification click patterns
  const clickedNotifications = await db
    .select()
    .from(scheduledNotifications)
    .where(
      and(
        eq(scheduledNotifications.userId, userId),
        eq(scheduledNotifications.status, 'clicked')
      )
    )
    .orderBy(desc(scheduledNotifications.clickedAt))
    .limit(50);

  if (clickedNotifications.length < 5) {
    return null; // Not enough data
  }

  // Analyze click times
  const hourCounts = new Map<number, number>();

  for (const notification of clickedNotifications) {
    if (notification.clickedAt) {
      const hour = notification.clickedAt.getHours();
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
    }
  }

  // Find the hour with most clicks
  let optimalHour = 9;
  let maxClicks = 0;

  for (const [hour, count] of hourCounts) {
    if (count > maxClicks) {
      maxClicks = count;
      optimalHour = hour;
    }
  }

  const optimalTime = `${optimalHour.toString().padStart(2, '0')}:00`;

  // Update user preferences
  await db
    .update(discoveryNotificationPreferences)
    .set({
      computedOptimalTime: optimalTime,
      updatedAt: new Date(),
    })
    .where(eq(discoveryNotificationPreferences.userId, userId));

  return optimalTime;
}

// ============================================================================
// Exports
// ============================================================================

export {
  type NotificationContent,
  type ScheduleResult,
};
