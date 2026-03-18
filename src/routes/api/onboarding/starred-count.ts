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
