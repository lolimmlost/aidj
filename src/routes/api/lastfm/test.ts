/**
 * Last.fm Test Connection API Route
 * Story 7.2: Last.fm Integration for Discovery Mode
 *
 * POST /api/lastfm/test
 * Tests the Last.fm API connection with the configured API key
 */

import { createFileRoute } from "@tanstack/react-router";
import { getConfig } from '@/lib/config/config';
import { LastFmClient } from '@/lib/services/lastfm';

export const Route = createFileRoute("/api/lastfm/test")({
  server: {
    handlers: {
  POST: async () => {
    try {
      const config = getConfig();
      if (!config.lastfmApiKey) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Last.fm API key not configured',
            code: 'LASTFM_NOT_CONFIGURED',
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const client = new LastFmClient({ apiKey: config.lastfmApiKey });
      const success = await client.testConnection();

      if (success) {
        return new Response(
          JSON.stringify({
            success: true,
            message: 'Last.fm connection successful',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      } else {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Last.fm connection test failed',
            code: 'LASTFM_CONNECTION_FAILED',
          }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    } catch (error) {
      console.error('[Last.fm API] Connection test error:', error);

      const errorResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Connection test failed',
        code: (error as { code?: string }).code || 'LASTFM_ERROR',
      };

      return new Response(JSON.stringify(errorResponse), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },

  GET: async () => {
    // Also allow GET for checking status
    const config = getConfig();
    return new Response(
      JSON.stringify({
        configured: !!config.lastfmApiKey,
        hasApiKey: config.lastfmApiKey.length > 0,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  },
    },
  },
});
