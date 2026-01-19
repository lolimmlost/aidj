/**
 * Mood Timeline API
 *
 * Provides endpoints for mood timeline visualization and historical preference tracking.
 *
 * Story: Mood Timeline Visualization with Historical Music Preference Tracking
 */

import { createFileRoute } from "@tanstack/react-router";
import { auth } from '../../../lib/auth/auth';
import {
  getMoodTimeline,
  getHistoricalRecommendations,
  compareTasteProfiles,
  regenerateHistoricalPlaylist,
  createTasteSnapshot,
  getUserTasteSnapshots,
  exportTasteSnapshot,
  type TimeGranularity,
  type TimelineFilters,
} from '../../../lib/services/mood-timeline-analytics';
import { z } from 'zod';

// ============================================================================
// Request Schemas
// ============================================================================

const TimelineQuerySchema = z.object({
  startDate: z.string().refine((s) => !isNaN(Date.parse(s)), 'Invalid start date'),
  endDate: z.string().refine((s) => !isNaN(Date.parse(s)), 'Invalid end date'),
  granularity: z.enum(['day', 'week', 'month', 'year']).optional().default('week'),
  moods: z.string().optional(), // comma-separated
  genres: z.string().optional(), // comma-separated
  artists: z.string().optional(), // comma-separated
  minAcceptanceRate: z.string().optional(), // 0-1
});

const HistoricalRecsSchema = z.object({
  startDate: z.string().refine((s) => !isNaN(Date.parse(s)), 'Invalid start date'),
  endDate: z.string().refine((s) => !isNaN(Date.parse(s)), 'Invalid end date'),
  limit: z.string().optional().default('50'),
});

const CompareProfilesSchema = z.object({
  pastStartDate: z.string().refine((s) => !isNaN(Date.parse(s)), 'Invalid past start date'),
  pastEndDate: z.string().refine((s) => !isNaN(Date.parse(s)), 'Invalid past end date'),
  currentStartDate: z.string().refine((s) => !isNaN(Date.parse(s)), 'Invalid current start date'),
  currentEndDate: z.string().refine((s) => !isNaN(Date.parse(s)), 'Invalid current end date'),
});

const RegeneratePlaylistSchema = z.object({
  periodStart: z.string().refine((s) => !isNaN(Date.parse(s)), 'Invalid period start'),
  periodEnd: z.string().refine((s) => !isNaN(Date.parse(s)), 'Invalid period end'),
  blendRatio: z.number().min(0).max(100).optional().default(100),
  maxTracks: z.number().min(1).max(100).optional().default(25),
});

const CreateSnapshotSchema = z.object({
  name: z.string().min(1).max(100),
  periodStart: z.string().refine((s) => !isNaN(Date.parse(s)), 'Invalid period start'),
  periodEnd: z.string().refine((s) => !isNaN(Date.parse(s)), 'Invalid period end'),
  description: z.string().max(500).optional(),
});

const ExportSnapshotSchema = z.object({
  snapshotId: z.string().uuid(),
  format: z.enum(['json', 'csv']),
});

// ============================================================================
// Route Handler
// ============================================================================

export const Route = createFileRoute("/api/recommendations/mood-timeline")({
  server: {
    handlers: {
      /**
       * GET /api/recommendations/mood-timeline
       * Get mood timeline data for visualization
       */
      GET: async ({ request }) => {
        const session = await auth.api.getSession({
          headers: request.headers,
          query: { disableCookieCache: true },
        });

        if (!session) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        try {
          const url = new URL(request.url);
          const params = Object.fromEntries(url.searchParams);
          const validated = TimelineQuerySchema.parse(params);

          // Parse filters
          const filters: TimelineFilters = {};
          if (validated.moods) {
            filters.moods = validated.moods.split(',').map(s => s.trim());
          }
          if (validated.genres) {
            filters.genres = validated.genres.split(',').map(s => s.trim());
          }
          if (validated.artists) {
            filters.artists = validated.artists.split(',').map(s => s.trim());
          }
          if (validated.minAcceptanceRate) {
            filters.minAcceptanceRate = parseFloat(validated.minAcceptanceRate);
          }

          const timeline = await getMoodTimeline(
            session.user.id,
            new Date(validated.startDate),
            new Date(validated.endDate),
            validated.granularity as TimeGranularity,
            Object.keys(filters).length > 0 ? filters : undefined
          );

          return new Response(JSON.stringify(timeline), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (error) {
          console.error('Failed to get mood timeline:', error);

          if (error instanceof z.ZodError) {
            return new Response(JSON.stringify({
              code: 'VALIDATION_ERROR',
              message: 'Invalid request parameters',
              errors: error.errors,
            }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }

          const message = error instanceof Error ? error.message : 'Failed to get mood timeline';
          return new Response(JSON.stringify({
            code: 'TIMELINE_ERROR',
            message
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      },

      /**
       * POST /api/recommendations/mood-timeline
       * Various actions: historical-recs, compare, regenerate, snapshot, export
       */
      POST: async ({ request }) => {
        const session = await auth.api.getSession({
          headers: request.headers,
          query: { disableCookieCache: true },
        });

        if (!session) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        try {
          const body = await request.json();
          const action = body.action as string;

          switch (action) {
            case 'historical-recommendations': {
              const validated = HistoricalRecsSchema.parse(body);
              const recommendations = await getHistoricalRecommendations(
                session.user.id,
                new Date(validated.startDate),
                new Date(validated.endDate),
                parseInt(validated.limit, 10)
              );
              return new Response(JSON.stringify({ recommendations }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            }

            case 'compare-profiles': {
              const validated = CompareProfilesSchema.parse(body);
              const comparison = await compareTasteProfiles(
                session.user.id,
                {
                  start: new Date(validated.pastStartDate),
                  end: new Date(validated.pastEndDate),
                },
                {
                  start: new Date(validated.currentStartDate),
                  end: new Date(validated.currentEndDate),
                }
              );
              return new Response(JSON.stringify(comparison), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            }

            case 'regenerate-playlist': {
              const validated = RegeneratePlaylistSchema.parse(body);
              const playlist = await regenerateHistoricalPlaylist(
                session.user.id,
                {
                  periodStart: validated.periodStart,
                  periodEnd: validated.periodEnd,
                  blendRatio: validated.blendRatio,
                  maxTracks: validated.maxTracks,
                }
              );
              return new Response(JSON.stringify(playlist), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            }

            case 'create-snapshot': {
              try {
                const validated = CreateSnapshotSchema.parse(body);
                console.log('Creating taste snapshot:', {
                  userId: session.user.id,
                  name: validated.name,
                  periodStart: validated.periodStart,
                  periodEnd: validated.periodEnd,
                });

                const snapshot = await createTasteSnapshot(
                  session.user.id,
                  validated.name,
                  new Date(validated.periodStart),
                  new Date(validated.periodEnd),
                  validated.description
                );

                console.log('Snapshot created successfully:', snapshot.id);
                return new Response(JSON.stringify(snapshot), {
                  status: 201,
                  headers: { 'Content-Type': 'application/json' }
                });
              } catch (snapshotError) {
                console.error('Error creating snapshot:', snapshotError);
                const errorMessage = snapshotError instanceof Error
                  ? snapshotError.message
                  : 'Failed to create snapshot';

                return new Response(JSON.stringify({
                  code: 'SNAPSHOT_ERROR',
                  message: errorMessage,
                  details: snapshotError instanceof Error ? snapshotError.stack : undefined,
                }), {
                  status: 400,
                  headers: { 'Content-Type': 'application/json' }
                });
              }
            }

            case 'list-snapshots': {
              const snapshots = await getUserTasteSnapshots(session.user.id);
              return new Response(JSON.stringify({ snapshots }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            }

            case 'export-snapshot': {
              const validated = ExportSnapshotSchema.parse(body);
              const snapshots = await getUserTasteSnapshots(session.user.id);
              const snapshot = snapshots.find(s => s.id === validated.snapshotId);

              if (!snapshot) {
                return new Response(JSON.stringify({
                  code: 'NOT_FOUND',
                  message: 'Snapshot not found',
                }), {
                  status: 404,
                  headers: { 'Content-Type': 'application/json' }
                });
              }

              const exportData = exportTasteSnapshot(snapshot, validated.format);
              const contentType = validated.format === 'json'
                ? 'application/json'
                : 'text/csv';
              const fileName = `taste-snapshot-${snapshot.name.replace(/\s+/g, '-').toLowerCase()}.${validated.format}`;

              return new Response(exportData, {
                status: 200,
                headers: {
                  'Content-Type': contentType,
                  'Content-Disposition': `attachment; filename="${fileName}"`,
                }
              });
            }

            default:
              return new Response(JSON.stringify({
                code: 'INVALID_ACTION',
                message: `Unknown action: ${action}`,
              }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
              });
          }
        } catch (error) {
          console.error('Failed to process mood timeline action:', error);

          if (error instanceof z.ZodError) {
            return new Response(JSON.stringify({
              code: 'VALIDATION_ERROR',
              message: 'Invalid request data',
              errors: error.errors,
            }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }

          const message = error instanceof Error ? error.message : 'Failed to process request';
          return new Response(JSON.stringify({
            code: 'TIMELINE_ACTION_ERROR',
            message
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      },
    },
  },
});
