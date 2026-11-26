/**
 * Beat grids on the server: the Lab's analysis of a song (tempo, bar0 = the first downbeat, bar length,
 * drops, intro/outro), saved here as the Lab analyses so any device can use it without decoding the
 * audio again. The Lab seeds its own cache from it on another device, and the queue's now-playing card
 * pulses on the real downbeat. One JSON per song in GRIDS_DIR (default /storage/grids).
 *
 * GET ?id=  → { data: { version, hint?, analysis } | null }   any signed-in user (it's song data, not yours)
 * POST { entries: [{ id, version, hint?, analysis }] }        admin only, like the Lab
 */
import { createFileRoute } from '@tanstack/react-router';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { auth } from '~/lib/auth/auth';
import { canonicalNavidromeId } from '~/lib/utils/navidrome-id';

const DIR = process.env.GRIDS_DIR || '/storage/grids';
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_ENTRIES = 100;

const fileFor = (id: string) => {
  const c = canonicalNavidromeId(id);
  return /^[A-Za-z0-9_-]{1,64}$/.test(c) ? join(DIR, `${c}.json`) : null;
};

type Entry = { id?: unknown; version?: unknown; hint?: unknown; analysis?: Record<string, unknown> };

const validGrid = (a: Entry['analysis']) =>
  !!a &&
  typeof a === 'object' &&
  [a.bpm, a.bar0, a.barLen, a.duration].every((n) => typeof n === 'number' && Number.isFinite(n)) &&
  (a.bpm as number) > 0 &&
  (a.barLen as number) > 0;

export async function GET({ request }: { request: Request }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new Response('Unauthorized', { status: 401 });
  const file = fileFor(new URL(request.url).searchParams.get('id') ?? '');
  if (!file) return new Response('Bad id', { status: 400 });
  try {
    return Response.json({ data: JSON.parse(await readFile(file, 'utf8')) });
  } catch {
    return Response.json({ data: null });
  }
}

export async function POST({ request }: { request: Request }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new Response('Unauthorized', { status: 401 });
  if (session.user.role !== 'admin') return new Response('Forbidden', { status: 403 });
  const text = await request.text();
  if (text.length > MAX_BYTES) return new Response('Too big', { status: 413 });
  let body: { entries?: Entry[] };
  try {
    body = JSON.parse(text) as typeof body;
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }
  if (!Array.isArray(body.entries) || body.entries.length > MAX_ENTRIES) return new Response('Not grids', { status: 400 });
  await mkdir(DIR, { recursive: true });
  let saved = 0;
  for (const e of body.entries) {
    if (typeof e.id !== 'string' || typeof e.version !== 'number' || !validGrid(e.analysis)) continue;
    const file = fileFor(e.id);
    if (!file) continue;
    // keep a newer analysis version if one is already there
    try {
      const old = JSON.parse(await readFile(file, 'utf8')) as { version?: number };
      if ((old.version ?? 0) > e.version) continue;
    } catch {
      // none yet
    }
    await writeFile(file, JSON.stringify({ version: e.version, hint: typeof e.hint === 'number' ? e.hint : undefined, analysis: e.analysis, savedAt: new Date().toISOString() }));
    saved++;
  }
  return Response.json({ saved });
}

export const Route = createFileRoute('/api/dj/grids')({
  server: {
    handlers: { GET, POST },
  },
});
