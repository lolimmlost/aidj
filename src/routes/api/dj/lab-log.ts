/**
 * Transition Lab flight recorder sink: the Lab ships its event log here (batched, and by
 * sendBeacon as a page goes away) and it lands in the server log as `🎛️ [LAB <page>] …`, so a set
 * that dies on a phone can be read back from `docker logs`. Admin only, like the Lab.
 */
import { createFileRoute } from '@tanstack/react-router';
import { auth } from '~/lib/auth/auth';

const MAX_ENTRIES = 200;
const MAX_LINE = 2000;
const ICON: Record<string, string> = { info: '', warn: ' ⚠️', error: ' ❌' };

interface Entry {
  seq?: unknown;
  t?: unknown;
  sid?: unknown;
  ev?: unknown;
  level?: unknown;
  data?: unknown;
}

export async function POST({ request }: { request: Request }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new Response('Unauthorized', { status: 401 });
  if (session.user.role !== 'admin') return new Response('Forbidden', { status: 403 });
  let body: { entries?: Entry[]; ua?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }
  const entries = Array.isArray(body.entries) ? body.entries.slice(0, MAX_ENTRIES) : [];
  for (const e of entries) {
    const t = typeof e.t === 'number' ? new Date(e.t).toISOString().slice(11, 23) : '?';
    const sid = String(e.sid ?? '?').slice(0, 12);
    const level = typeof e.level === 'string' ? e.level : 'info';
    const data = e.data && typeof e.data === 'object' ? ' ' + JSON.stringify(e.data) : '';
    console.log(`🎛️ [LAB ${sid}] ${t}${ICON[level] ?? ''} #${Number(e.seq) || 0} ${String(e.ev ?? '').slice(0, 80)}${data}`.slice(0, MAX_LINE));
  }
  return new Response(null, { status: 204 });
}

export const Route = createFileRoute('/api/dj/lab-log')({
  server: {
    handlers: { POST },
  },
});
