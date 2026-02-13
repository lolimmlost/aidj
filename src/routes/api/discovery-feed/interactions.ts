/**
 * Discovery Feed Interactions API
 *
 * POST /api/discovery-feed/interactions - Record user interactions with feed items
 *
 * Tracks user engagement with recommendations for analytics and personalization.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from 'zod';
import {
  withAuthAndErrorHandling,
  successResponse,
} from '../../../lib/utils/api-response';
import {
  recordFeedItemShown,
  recordFeedItemClicked,
  recordFeedItemPlayed,
  recordFeedItemSaved,
  recordFeedItemSkipped,
  dismissFeedItem,
  recordFeedItemFeedback,
} from '../../../lib/services/time-based-discovery';

// Request validation schema
const InteractionSchema = z.object({
  itemId: z.string(),
  action: z.enum(['shown', 'clicked', 'played', 'saved', 'skipped', 'dismissed', 'feedback']),
  data: z.object({
    duration: z.number().optional(),
    feedback: z.enum(['liked', 'disliked', 'not_interested']).optional(),
  }).optional(),
  timestamp: z.number(),
});

const InteractionsRequestSchema = z.object({
  interactions: z.array(InteractionSchema),
});

// POST /api/discovery-feed/interactions
const POST = withAuthAndErrorHandling(
  async ({ request, session: _session }) => {
    const body = await request.json();
    const { interactions } = InteractionsRequestSchema.parse(body);

    console.log(`📊 [DiscoveryFeed API] Recording ${interactions.length} interactions`);

    const results = {
      processed: 0,
      errors: 0,
    };

    for (const interaction of interactions) {
      try {
        switch (interaction.action) {
          case 'shown':
            await recordFeedItemShown(interaction.itemId);
            break;
          case 'clicked':
            await recordFeedItemClicked(interaction.itemId);
            break;
          case 'played':
            await recordFeedItemPlayed(
              interaction.itemId,
              interaction.data?.duration
            );
            break;
          case 'saved':
            await recordFeedItemSaved(interaction.itemId);
            break;
          case 'skipped':
            await recordFeedItemSkipped(interaction.itemId);
            break;
          case 'dismissed':
            await dismissFeedItem(interaction.itemId);
            break;
          case 'feedback':
            if (interaction.data?.feedback) {
              await recordFeedItemFeedback(
                interaction.itemId,
                interaction.data.feedback
              );
            }
            break;
        }
        results.processed++;
      } catch (error) {
        console.error(`❌ Failed to record interaction for ${interaction.itemId}:`, error);
        results.errors++;
      }
    }

    return successResponse({
      processed: results.processed,
      errors: results.errors,
    });
  },
  {
    service: 'discovery-feed',
    operation: 'record-interactions',
    defaultCode: 'INTERACTION_ERROR',
    defaultMessage: 'Failed to record interactions',
  }
);

export const Route = createFileRoute("/api/discovery-feed/interactions")({
  server: {
    handlers: {
      POST,
    },
  },
});
