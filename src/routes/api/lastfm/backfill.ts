/**
 * Last.fm Scrobble Backfill API Endpoint
 *
 * POST /api/lastfm/backfill - Start a scrobble backfill from Last.fm
 *   Returns 202 Accepted with { jobId } to poll via GET.
 *   Returns 409 Conflict if a backfill is already running for this user.
 *
 * GET /api/lastfm/backfill?jobId=xxx - Poll current job status
 *   Returns the latest BackfillEvent for the job, or 404 if not found.
 *
 * @see docs/architecture/analytics-discovery-upgrades-plan.md - Item 3.1
 */

import { createFileRoute } from "@tanstack/react-router";
import { auth } from '../../../lib/auth/auth';
import {
  isBackfillActive,
  getActiveBackfill,
  registerBackfillJob,
  runFullBackfillPipeline,
} from '../../../lib/services/lastfm-backfill';
import type { BackfillJob } from '../../../lib/services/lastfm-backfill';

export const Route = createFileRoute("/api/lastfm/backfill")({
  server: {
    handlers: {
      // Poll job status
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({
            headers: request.headers,
            query: { disableCookieCache: true },
          });

          if (!session?.user?.id) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
              status: 401,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          const url = new URL(request.url);
          const jobId = url.searchParams.get('jobId');

          if (!jobId) {
            return new Response(
              JSON.stringify({ error: 'jobId query parameter is required' }),
              { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
          }

          const job = getActiveBackfill(session.user.id);

          if (!job || job.jobId !== jobId) {
            return new Response(
              JSON.stringify({ error: 'Job not found' }),
              { status: 404, headers: { 'Content-Type': 'application/json' } }
            );
          }

          return new Response(
            JSON.stringify({
              jobId: job.jobId,
              event: job.latestEvent,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        } catch (error) {
          console.error('📥 [BackfillAPI] GET error:', error);
          return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }
      },

      // Start a new backfill
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({
            headers: request.headers,
            query: { disableCookieCache: true },
          });

          if (!session?.user?.id) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
              status: 401,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          const userId = session.user.id;

          // Check for active backfill (concurrency guard)
          if (isBackfillActive(userId)) {
            const existing = getActiveBackfill(userId)!;
            return new Response(
              JSON.stringify({ error: 'Backfill already in progress', jobId: existing.jobId }),
              { status: 409, headers: { 'Content-Type': 'application/json' } }
            );
          }

          let body: { username?: string; fromDate?: string; maxPages?: number } = {};
          try {
            body = await request.json();
          } catch {
            return new Response(
              JSON.stringify({ error: 'Invalid request body' }),
              { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
          }

          if (!body.username || typeof body.username !== 'string') {
            return new Response(
              JSON.stringify({ error: 'Last.fm username is required' }),
              { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
          }

          const fromDate = body.fromDate ? new Date(body.fromDate) : undefined;
          const maxPages = body.maxPages ? Math.min(Math.max(body.maxPages, 1), 100) : 50;
          const jobId = crypto.randomUUID();

          // Create and register the job
          const job: BackfillJob = {
            jobId,
            userId,
            progress: {
              status: 'running',
              totalScrobbles: 0,
              imported: 0,
              skipped: 0,
              currentPage: 0,
              totalPages: 0,
            },
            latestEvent: null,
          };

          registerBackfillJob(userId, job);

          console.log(`📥 [BackfillAPI] Starting pipeline for user ${userId}, Last.fm: ${body.username}, jobId: ${jobId}`);

          // Fire-and-forget: the pipeline runs in the background
          runFullBackfillPipeline(
            { username: body.username, userId, fromDate, maxPages },
            job,
          ).catch(error => {
            console.error('📥 [BackfillAPI] Unhandled pipeline error:', error);
          });

          return new Response(
            JSON.stringify({ jobId }),
            { status: 202, headers: { 'Content-Type': 'application/json' } }
          );
        } catch (error) {
          console.error('📥 [BackfillAPI] Error:', error);
          return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }
      },
    },
  },
});
