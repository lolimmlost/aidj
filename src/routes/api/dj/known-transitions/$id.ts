/**
 * PATCH /api/dj/known-transitions/:id — the DJ's judgement on a pair: preferred technique, role, status, note.
 * DELETE removes it (it comes back on the next import if a Lab set still has it).
 */
import { createFileRoute } from '@tanstack/react-router';
import { and, eq } from 'drizzle-orm';
import { auth } from '~/lib/auth/auth';
import { db } from '~/lib/db';
import { knownTransitions, TRANSITION_ROLES, TRANSITION_STATUSES, type KnownTechniquePick, type TransitionRole, type TransitionStatus } from '~/lib/db/schema';

export const Route = createFileRoute('/api/dj/known-transitions/$id')({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return new Response('Unauthorized', { status: 401 });
        let body: { role?: unknown; status?: unknown; note?: unknown; preferred?: unknown };
        try {
          body = await request.json();
        } catch {
          return new Response('Bad JSON', { status: 400 });
        }
        const set: { role?: TransitionRole | null; status?: TransitionStatus; note?: string | null; preferred?: KnownTechniquePick | null; updatedAt: Date } = { updatedAt: new Date() };
        if ('role' in body) {
          if (body.role !== null && !TRANSITION_ROLES.includes(body.role as TransitionRole)) return new Response('Bad role', { status: 400 });
          set.role = body.role as TransitionRole | null;
        }
        if ('status' in body) {
          if (!TRANSITION_STATUSES.includes(body.status as TransitionStatus)) return new Response('Bad status', { status: 400 });
          set.status = body.status as TransitionStatus;
        }
        if ('note' in body) {
          if (body.note !== null && typeof body.note !== 'string') return new Response('Bad note', { status: 400 });
          set.note = typeof body.note === 'string' ? body.note.slice(0, 500) : null;
        }
        if ('preferred' in body) {
          const p = body.preferred as Record<string, unknown> | null;
          const intOrNull = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v));
          if (p !== null && (typeof p !== 'object' || typeof p.kind !== 'string' || typeof p.bars !== 'number' || !intOrNull(p.entryA) || !intOrNull(p.cueB))) {
            return new Response('Bad preferred', { status: 400 });
          }
          set.preferred = p === null ? null : { kind: String(p.kind).slice(0, 20), bars: p.bars as number, entryA: p.entryA as number | null, cueB: p.cueB as number | null };
        }
        const [row] = await db
          .update(knownTransitions)
          .set(set)
          .where(and(eq(knownTransitions.id, params.id), eq(knownTransitions.userId, session.user.id)))
          .returning();
        if (!row) return new Response('Not found', { status: 404 });
        return Response.json({ data: row });
      },
      DELETE: async ({ request, params }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return new Response('Unauthorized', { status: 401 });
        await db.delete(knownTransitions).where(and(eq(knownTransitions.id, params.id), eq(knownTransitions.userId, session.user.id)));
        return new Response(null, { status: 204 });
      },
    },
  },
});
