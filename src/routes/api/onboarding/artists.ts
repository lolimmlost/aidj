import { createFileRoute } from '@tanstack/react-router';
import {
  getArtists,
  getArtistDetail,
  type ArtistDetail,
} from '@/lib/services/navidrome';
import {
  withAuthAndErrorHandling,
  successResponse,
} from '@/lib/utils/api-response';

const GET = withAuthAndErrorHandling(
  async ({ request }) => {
    const url = new URL(request.url);
    const rawLimit = parseInt(url.searchParams.get('limit') || '20', 10);
    const limit = Number.isNaN(rawLimit) || rawLimit < 1 ? 20 : Math.min(rawLimit, 50);
    const search = url.searchParams.get('search') || '';

    // Use Navidrome's native name filter for search, or fetch top artists
    const endpoint = search
      ? `/api/artist?name=${encodeURIComponent(search)}&_start=0&_end=${limit - 1}&_sort=song_count&_order=DESC`
      : `/api/artist?_start=0&_end=${limit - 1}&_sort=song_count&_order=DESC`;

    // getArtists doesn't support name filter, so we'll import apiFetch pattern
    // Actually, let's use getArtists for no-search and filter for search
    let basicArtists = await getArtists(0, search ? 500 : limit);

    if (search) {
      const searchLower = search.toLowerCase();
      basicArtists = basicArtists.filter((a) =>
        a.name.toLowerCase().includes(searchLower)
      ).slice(0, limit);
    }

    // Fetch details for the small result set (max 50)
    const detailed = await Promise.all(
      basicArtists.map(async (a) => {
        try {
          const detail = await getArtistDetail(a.id);
          return detail;
        } catch {
          return { id: a.id, name: a.name, albumCount: 0, songCount: 0 } as ArtistDetail;
        }
      })
    );

    // Sort by song count descending
    detailed.sort((a, b) => (b.songCount || 0) - (a.songCount || 0));

    const response = detailed.map((a) => ({
      id: a.id,
      name: a.name,
      albumCount: a.albumCount || 0,
      songCount: a.songCount || 0,
    }));

    return successResponse({ artists: response });
  },
  {
    service: 'onboarding',
    operation: 'artists',
    defaultCode: 'ONBOARDING_ARTISTS_ERROR',
    defaultMessage: 'Failed to fetch artists for onboarding',
  }
);

export const Route = createFileRoute('/api/onboarding/artists')({
  server: { handlers: { GET } },
});
