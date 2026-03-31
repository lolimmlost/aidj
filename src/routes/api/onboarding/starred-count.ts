import { createFileRoute } from '@tanstack/react-router';
import { getStarredSongs } from '@/lib/services/navidrome';
import { ensureNavidromeUser } from '@/lib/services/navidrome-users';
import {
  withAuthAndErrorHandling,
  successResponse,
} from '@/lib/utils/api-response';

const GET = withAuthAndErrorHandling(
  async ({ session }) => {
    const creds = await ensureNavidromeUser(
      session.user.id,
      session.user.name,
      session.user.email
    );
    // P-8: getStarredSongs fetches full song objects. Navidrome's Subsonic API
    // (getStarred2) doesn't support count-only queries, so this is the best we can do.
    // The response is cached client-side (staleTime: 30s) so it's called at most once per wizard load.
    const starred = await getStarredSongs(creds);
    return successResponse({ count: starred.length });
  },
  {
    service: 'onboarding',
    operation: 'starred-count',
    defaultCode: 'ONBOARDING_STARRED_COUNT_ERROR',
    defaultMessage: 'Failed to fetch starred song count',
  }
);

export const Route = createFileRoute('/api/onboarding/starred-count')({
  server: { handlers: { GET } },
});
