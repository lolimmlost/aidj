/**
 * Save Cover Art API
 * POST /api/cover-art/save — persist user-approved artwork
 * GET /api/cover-art/save?entityId={id} — check if art is saved for an entity
 */

import { createFileRoute } from '@tanstack/react-router';
import { eq } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { savedCoverArt } from '../../../lib/db/schema/saved-cover-art.schema';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
} from '../../../lib/utils/api-response';

const POST = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const body = await request.json();
    const { entityId, entityType, artist, album, imageUrl, source } = body;

    if (!entityId || !entityType || !artist || !imageUrl || !source) {
      return errorResponse('MISSING_REQUIRED_FIELD', 'entityId, entityType, artist, imageUrl, and source are required', { status: 400 });
    }

    if (!['album', 'artist'].includes(entityType)) {
      return errorResponse('INVALID_FIELD', 'entityType must be album or artist', { status: 400 });
    }

    const userId = session.user.id;

    // Upsert — update if already saved, insert otherwise
    await db
      .insert(savedCoverArt)
      .values({
        entityId,
        entityType,
        artist,
        album: album || null,
        imageUrl,
        source,
        userId,
      })
      .onConflictDoUpdate({
        target: savedCoverArt.entityId,
        set: {
          imageUrl,
          source,
          userId,
          savedAt: new Date(),
        },
      });

    return successResponse({ saved: true, entityId });
  },
  {
    service: 'cover-art',
    operation: 'save',
    defaultCode: 'SAVE_ERROR',
    defaultMessage: 'Failed to save cover art',
  }
);

const GET = withAuthAndErrorHandling(
  async ({ request }) => {
    const url = new URL(request.url);
    const entityId = url.searchParams.get('entityId');

    if (!entityId) {
      return errorResponse('MISSING_REQUIRED_FIELD', 'entityId required', { status: 400 });
    }

    const saved = await db
      .select()
      .from(savedCoverArt)
      .where(eq(savedCoverArt.entityId, entityId))
      .limit(1);

    if (saved.length > 0) {
      return successResponse({ saved: true, imageUrl: saved[0].imageUrl, source: saved[0].source });
    }

    return successResponse({ saved: false });
  },
  {
    service: 'cover-art',
    operation: 'check',
    defaultCode: 'CHECK_ERROR',
    defaultMessage: 'Failed to check cover art',
  }
);

export const Route = createFileRoute('/api/cover-art/save')({
  server: {
    handlers: {
      POST,
      GET,
    },
  },
});
