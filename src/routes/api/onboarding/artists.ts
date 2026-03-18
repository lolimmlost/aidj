import { createFileRoute } from '@tanstack/react-router';
import {
  getArtists,
  getArtistDetail,
  type ArtistDetail,
} from '@/lib/services/navidrome';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
} from '@/lib/utils/api-response';

const GET = withAuthAndErrorHandling(
  async ({ request }) => {
    const url = new URL(request.url);
    // P-13: Validate and clamp numeric params
    const rawStart = parseInt(url.searchParams.get('start') || '0', 10);
    const rawLimit = parseInt(url.searchParams.get('limit') || '50', 10);
    const start = Number.isNaN(rawStart) || rawStart < 0 ? 0 : rawStart;
    const limit = Number.isNaN(rawLimit) || rawLimit < 1 ? 50 : Math.min(rawLimit, 100);
    const search = url.searchParams.get('search') || '';

    // P-7: Use basic getArtists() for listing (no N+1 getArtistDetail calls).
    // For search, fetch a larger window of basic artists and filter by name,
    // then only fetch details for the paginated slice.
    const fetchSize = search ? 1000 : start + limit;
    let basicArtists = await getArtists(0, fetchSize);

    // Filter by search if provided (case-insensitive)
    if (search) {
      const searchLower = search.toLowerCase();
      basicArtists = basicArtists.filter((a) =>
        a.name.toLowerCase().includes(searchLower)
      );
    }

    const total = basicArtists.length;

    // Apply pagination before fetching details (only detail-fetch the page we need)
    const paginated = basicArtists.slice(start, start + limit);

    // Fetch details only for the paginated slice
    const detailed = await Promise.all(
      paginated.map(async (a) => {
        try {
          const detail = await getArtistDetail(a.id);
          return detail;
        } catch {
          return { id: a.id, name: a.name, albumCount: 0, songCount: 0 } as ArtistDetail;
        }
      })
    );

    // Sort by album count descending (popular artists first)
    detailed.sort((a, b) => (b.albumCount || 0) - (a.albumCount || 0));

    const response = detailed.map((a) => ({
      id: a.id,
      name: a.name,
      albumCount: a.albumCount || 0,
      songCount: a.songCount || 0,
    }));

    return successResponse({ artists: response, total });
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
