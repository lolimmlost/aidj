import { createFileRoute } from '@tanstack/react-router';
import { ServiceError } from '../../../lib/utils';
import { addDownload, downloadMusic, downloadPlaylist } from '../../../lib/services/metube';

export const Route = createFileRoute('/api/metube/add')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Auth check (protected route)
        const { auth } = await import('../../../lib/auth/server');
        const session = await auth.api.getSession({
          headers: request.headers,
          query: {
            disableCookieCache: true,
          },
        });

        if (!session) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        try {
          const body = (await request.json()) as {
            url: string;
            format?: 'mp3' | 'mp4' | 'any';
            quality?: 'best' | 'worst' | '1080' | '720' | '480' | '360';
            folder?: string;
            isPlaylist?: boolean;
            playlistLimit?: number;
          };

          if (!body.url) {
            return new Response(JSON.stringify({ error: 'URL is required' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          // Validate URL is from YouTube or other supported sites
          const supportedPatterns = [
            /youtube\.com/,
            /youtu\.be/,
            /soundcloud\.com/,
            /bandcamp\.com/,
            /vimeo\.com/,
            /dailymotion\.com/,
          ];

          const isSupported = supportedPatterns.some((pattern) => pattern.test(body.url));
          if (!isSupported) {
            return new Response(
              JSON.stringify({
                error: 'Unsupported URL. Supported sites: YouTube, SoundCloud, Bandcamp, Vimeo, Dailymotion',
              }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              }
            );
          }

          let result;

          if (body.isPlaylist) {
            result = await downloadPlaylist(body.url, {
              format: body.format,
              folder: body.folder,
              limit: body.playlistLimit,
            });
          } else if (body.format === 'mp4') {
            result = await addDownload({
              url: body.url,
              quality: body.quality || 'best',
              format: 'mp4',
              folder: body.folder,
              auto_start: true,
            });
          } else {
            // Default to music (mp3)
            result = await downloadMusic(body.url, {
              folder: body.folder,
            });
          }

          return new Response(
            JSON.stringify({
              success: true,
              message: 'Download added to queue',
              ...result,
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        } catch (error: unknown) {
          console.error('MeTube add failed:', error);
          let code = 'METUBE_ERROR';
          let message = 'Failed to add download';
          if (error instanceof ServiceError) {
            code = error.code;
            message = error.message;
          } else if (error instanceof Error) {
            message = error.message;
          }
          return new Response(JSON.stringify({ code, message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      },
    },
  },
});
