/**
 * Discovery Feed API
 *
 * POST /api/discovery-feed - Get personalized discovery feed
 *
 * Returns time-based music recommendations tailored to user preferences
 * and current listening context.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from 'zod';
import {
  withAuthAndErrorHandling,
  successResponse,
} from '../../../lib/utils/api-response';
import {
  generateDiscoveryFeed,
  generateNewUserFeed,
  hasEnoughHistory,
  getCurrentTimeContext,
} from '../../../lib/services/time-based-discovery';
import type { TimeSlot, ListeningContext } from '../../../lib/db/schema/discovery-feed.schema';

// Request validation schema
const DiscoveryFeedRequestSchema = z.object({
  limit: z.number().min(1).max(50).optional().default(20),
  offset: z.number().min(0).optional().default(0),
  includeExisting: z.boolean().optional().default(true),
  timeSlot: z.enum(['morning', 'afternoon', 'evening', 'night']).optional(),
  dayOfWeek: z.number().min(0).max(6).optional(),
  context: z.enum(['workout', 'focus', 'relaxation', 'commute', 'social', 'general']).optional(),
});

// POST /api/discovery-feed
const POST = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const body = await request.json();
    const validated = DiscoveryFeedRequestSchema.parse(body);

    const userId = session.user.id;

    // Get current time context or use provided values
    const currentContext = getCurrentTimeContext();
    const timeContext = {
      ...currentContext,
      timeSlot: (validated.timeSlot as TimeSlot) || currentContext.timeSlot,
      dayOfWeek: validated.dayOfWeek ?? currentContext.dayOfWeek,
    };

    console.log(`📱 [DiscoveryFeed API] Request for user ${userId}`);
    console.log(`⏰ Time context: ${timeContext.timeSlot}, day ${timeContext.dayOfWeek}`);

    // Check if user has enough history for personalized recommendations
    let hasHistory = false;
    try {
      hasHistory = await hasEnoughHistory(userId);
    } catch (error) {
      console.error('❌ [DiscoveryFeed API] Error checking history:', error);
      // Continue with new user flow as fallback
    }

    if (!hasHistory) {
      console.log(`👋 [DiscoveryFeed API] New user, generating starter feed`);
      try {
        const items = await generateNewUserFeed(userId, validated.limit);

        return successResponse({
          items,
          timeContext,
          pattern: null,
          hasMore: false,
          isNewUser: true,
        });
      } catch (error) {
        console.error('❌ [DiscoveryFeed API] Error generating new user feed:', error);
        // Return empty feed as last resort
        return successResponse({
          items: [],
          timeContext,
          pattern: null,
          hasMore: false,
          isNewUser: true,
        });
      }
    }

    // Generate personalized feed
    try {
      const feedResponse = await generateDiscoveryFeed({
        userId,
        limit: validated.limit,
        includeExisting: validated.includeExisting,
        timeContext,
        context: validated.context as ListeningContext,
      });

      return successResponse({
        items: feedResponse.items,
        timeContext: feedResponse.timeContext,
        pattern: feedResponse.pattern,
        hasMore: feedResponse.hasMore,
        isNewUser: false,
      });
    } catch (error) {
      console.error('❌ [DiscoveryFeed API] Error generating personalized feed:', error);
      // Return empty feed as fallback
      return successResponse({
        items: [],
        timeContext,
        pattern: null,
        hasMore: false,
        isNewUser: false,
      });
    }
  },
  {
    service: 'discovery-feed',
    operation: 'get-feed',
    defaultCode: 'DISCOVERY_FEED_ERROR',
    defaultMessage: 'Failed to get discovery feed',
  }
);

export const Route = createFileRoute("/api/discovery-feed/")({
  server: {
    handlers: {
      POST,
    },
  },
});
