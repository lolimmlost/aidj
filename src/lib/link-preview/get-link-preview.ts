import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { getAuthToken, buildSubsonicUrl } from '@/lib/services/navidrome';
import {
  parsePreviewTarget,
  albumDescription,
  artistDescription,
  COVER_ART_ID,
  type LinkPreview,
} from './link-preview';

/** Unfurlers give up after ~3-5 s, and the login page waits on this: keep it short (#341 comment). */
const NAVIDROME_TIMEOUT_MS = 2000;

/** Public origin for absolute og:url / og:image (unfurlers need absolute URLs). */
function publicOrigin(): string {
  const configured = process.env.VITE_BASE_URL;
  if (configured) return configured.replace(/\/+$/, '');
  const request = getRequest();
  const url = new URL(request.url);
  const host = request.headers.get('x-forwarded-host') ?? url.host;
  const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  return `${proto}://${host}`;
}

type SubsonicOk = Record<string, unknown> & { status: 'ok' };

async function subsonic(endpoint: string, params: Record<string, string>): Promise<SubsonicOk | null> {
  await getAuthToken();
  const url = buildSubsonicUrl(endpoint);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { signal: AbortSignal.timeout(NAVIDROME_TIMEOUT_MS) });
  if (!response.ok) return null;
  const body = (await response.json()) as { 'subsonic-response'?: SubsonicOk };
  const result = body['subsonic-response'];
  return result?.status === 'ok' ? result : null;
}

const coverUrl = (origin: string, coverArt?: unknown) =>
  typeof coverArt === 'string' && COVER_ART_ID.test(coverArt)
    ? `${origin}/api/og/cover/${coverArt}`
    : undefined;

/**
 * Preview for the item a login `?redirect=` path points at (album or artist), or null.
 * Never throws: a failed lookup means the generic AIDJ card, not a broken login page.
 */
export const getLinkPreview = createServerFn({ method: 'GET' })
  .validator((path: unknown) => (typeof path === 'string' ? path.slice(0, 512) : ''))
  .handler(async ({ data: path }): Promise<LinkPreview | null> => {
    const target = parsePreviewTarget(path);
    if (!target) return null;
    try {
      const origin = publicOrigin();
      const url = `${origin}${path.split(/[?#]/)[0]}`;
      if (target.kind === 'album') {
        const r = await subsonic('getAlbum', { id: target.id });
        const album = r?.album as
          | { name?: string; artist?: string; year?: number; genre?: string; songCount?: number; duration?: number; coverArt?: string; song?: { title?: string }[] }
          | undefined;
        if (!album?.name) return null;
        return {
          title: album.name,
          description: albumDescription({
            name: album.name,
            artist: album.artist,
            year: album.year,
            genre: album.genre,
            songCount: album.songCount,
            duration: album.duration,
            songTitles: album.song?.map((s) => s.title ?? '').filter(Boolean),
          }),
          image: coverUrl(origin, album.coverArt),
          url,
          type: 'music.album',
        };
      }
      const r = await subsonic('getArtist', { id: target.id });
      const artist = r?.artist as { name?: string; albumCount?: number; coverArt?: string } | undefined;
      if (!artist?.name) return null;
      return {
        title: artist.name,
        description: artistDescription(artist.albumCount),
        image: coverUrl(origin, artist.coverArt),
        url,
        type: 'profile',
      };
    } catch (error) {
      console.warn('[link-preview] lookup failed:', error instanceof Error ? error.message : error);
      return null;
    }
  });
