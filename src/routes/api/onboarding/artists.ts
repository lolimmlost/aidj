import { createFileRoute } from '@tanstack/react-router';
import {
  getArtistsWithDetails,
  type ArtistWithDetails,
} from '@/lib/services/navidrome';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
} from '@/lib/utils/api-response';

const GET = withAuthAndErrorHandling(
  async ({ request }) => {
    const url = new URL(request.url);
    const start = parseInt(url.searchParams.get('start') || '0', 10);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const search = url.searchParams.get('search') || '';

    if (limit > 100) {
      return errorResponse('VALIDATION_ERROR', 'Limit must be 100 or less', { status: 400 });
    }

    // Fetch artists from Navidrome via admin service
    // Fetch extra to account for search filtering
    const fetchLimit = search ? Math.max(limit * 4, 200) : limit;
    let artists = await getArtistsWithDetails(0, search ? 500 : start + limit);

    // Filter by search if provided (case-insensitive)
    if (search) {
      const searchLower = search.toLowerCase();
      artists = artists.filter((a) =>
        a.name.toLowerCase().includes(searchLower)
      );
    }

    // Sort by album count descending (popular artists first)
    artists.sort((a, b) => (b.albumCount || 0) - (a.albumCount || 0));

    // Get total before pagination
    const total = artists.length;

    // Apply pagination
    const paginated = artists.slice(start, start + limit);

    // Map to response shape
    const response = paginated.map((a: ArtistWithDetails) => ({
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
