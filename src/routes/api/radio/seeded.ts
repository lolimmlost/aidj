import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
} from '@/lib/utils/api-response';
import { generateSeededRadio } from '@/lib/services/seeded-radio';

const SeededRadioSchema = z.object({
  seed: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('song'), songId: z.string().min(1) }),
    z.object({ kind: z.literal('album'), albumId: z.string().min(1) }),
    z.object({ kind: z.literal('playlist'), playlistId: z.string().min(1) }),
    z.object({ kind: z.literal('artist'), artistId: z.string().min(1) }),
  ]),
  variety: z.enum(['low', 'medium', 'high']).optional(),
  size: z.number().int().min(10).max(80).optional(),
  targetMinutes: z.number().int().min(10).max(300).optional(),
});

const POST = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const body = await request.json();
    const parsed = SeededRadioSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse('VALIDATION_ERROR', 'Invalid seeded-radio request', {
        status: 400,
        details: { issues: parsed.error.issues },
      });
    }

    const { seed, variety, size, targetMinutes } = parsed.data;
    const result = await generateSeededRadio(session.user.id, seed, {
      variety,
      size,
      targetMinutes,
    });

    return successResponse({
      songs: result.songs,
      seedInfo: result.seedInfo,
    });
  },
  {
    service: 'radio',
    operation: 'seeded',
    defaultCode: 'RADIO_SEEDED_ERROR',
    defaultMessage: 'Failed to generate seeded radio',
  },
);

export const Route = createFileRoute('/api/radio/seeded')({
  server: { handlers: { POST } },
});
