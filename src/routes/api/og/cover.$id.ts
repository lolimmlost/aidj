/**
 * Cover art for link previews (#361)
 * GET /api/og/cover/:coverArtId — public on purpose: preview bots (iMessage, Discord, Slack) have no session.
 *
 * Serves only Navidrome cover art (album/artist/song covers, by the ids getAlbum/getArtist return),
 * at one fixed size, nothing else. The id carries Navidrome's updated-at suffix, so a new cover gets
 * a new URL and the response can be cached for a long time.
 */
import { createFileRoute } from '@tanstack/react-router';
import { getConfig } from '@/lib/config/config';
import { getAuthToken, buildSubsonicUrl } from '@/lib/services/navidrome';
import { COVER_ART_ID } from '@/lib/link-preview/link-preview';

const SIZE = '600';
const PLACEHOLDER_MAX_BYTES = 2048;

export const Route = createFileRoute('/api/og/cover/$id')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { id } = params;
        if (!id || !COVER_ART_ID.test(id)) {
          return new Response('Not found', { status: 404 });
        }
        if (!getConfig().navidromeUrl) {
          return new Response('Navidrome not configured', { status: 503 });
        }
        try {
          await getAuthToken();
          const url = buildSubsonicUrl('getCoverArt');
          url.searchParams.delete('f');
          url.searchParams.set('id', id);
          url.searchParams.set('size', SIZE);
          const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
          const contentType = response.headers.get('content-type') ?? '';
          if (!response.ok || !contentType.startsWith('image/')) {
            return new Response('Not found', { status: 404 });
          }
          const image = await response.arrayBuffer();
          // Navidrome's stand-in for an artist with no image is a tiny blank WebP: show the AIDJ card instead
          if (image.byteLength < PLACEHOLDER_MAX_BYTES) {
            return new Response(null, { status: 302, headers: { Location: '/og-image.png', 'Cache-Control': 'public, max-age=3600' } });
          }
          return new Response(image, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
            },
          });
        } catch (error) {
          console.warn('[og/cover] fetch failed:', error instanceof Error ? error.message : error);
          return new Response('Not found', { status: 404 });
        }
      },
    },
  },
});
