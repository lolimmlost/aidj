/**
 * Saved Lab sets on the server (#392): the browser keeps its sets in localStorage and copies each one here as it's
 * saved, cues and all, so a set can be rendered offline through the Lab's own engine. One JSON per set in
 * LAB_SETS_DIR (default /storage/sets, the app's persistent mount). Admin only, like the Lab.
 */
import { createFileRoute } from '@tanstack/react-router';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { auth } from '~/lib/auth/auth';
import { canonicalNavidromeId } from '~/lib/utils/navidrome-id';
import { scheduleLabSetImport } from '~/lib/services/known-transitions-import';

const DIR = process.env.LAB_SETS_DIR || '/storage/sets';
const MAX_BYTES = 2 * 1024 * 1024;

export async function POST({ request }: { request: Request }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new Response('Unauthorized', { status: 401 });
  if (session.user.role !== 'admin') return new Response('Forbidden', { status: 403 });
  const text = await request.text();
  if (text.length > MAX_BYTES) return new Response('Too big', { status: 413 });
  let set: { id?: unknown; tracks?: unknown[] };
  try {
    set = JSON.parse(text) as typeof set;
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }
  if (typeof set.id !== 'string' || !/^[a-z0-9]{4,20}$/.test(set.id) || !Array.isArray(set.tracks)) return new Response('Not a set', { status: 400 });
  // a set saved on a phone before Navidrome 0.64 re-encoded its ids still names the songs by their old ids
  for (const t of set.tracks) if (t && typeof t === 'object' && 'id' in t && typeof t.id === 'string') t.id = canonicalNavidromeId(t.id);
  await mkdir(DIR, { recursive: true });
  await writeFile(join(DIR, `${set.id}.json`), JSON.stringify(set));
  // keep the known-transitions book current without a manual sync (debounced: the Lab saves per transition)
  scheduleLabSetImport(session.user.id);
  return new Response(null, { status: 204 });
}

/**
 * GET: the saved sets, newest first (the known-transitions page shows them in play order). Only what that page
 * needs per track: id, title, artist, how it came in. ?limit= (default 40). ?id= returns one whole set.
 */
export async function GET({ request }: { request: Request }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new Response('Unauthorized', { status: 401 });
  if (session.user.role !== 'admin') return new Response('Forbidden', { status: 403 });
  const params = new URL(request.url).searchParams;
  // ?id= : one whole set, as saved (recipes and cues included), so the Lab can replay a set that's
  // no longer in this browser's newest 20.
  const one = params.get('id');
  if (one !== null) {
    if (!/^[a-z0-9]{4,20}$/.test(one)) return new Response('Bad id', { status: 400 });
    try {
      const set = JSON.parse(await readFile(join(DIR, `${one}.json`), 'utf8')) as { tracks?: { id?: unknown }[] };
      for (const t of set.tracks ?? []) if (t && typeof t.id === 'string') t.id = canonicalNavidromeId(t.id);
      return Response.json({ data: set });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  }
  const limit = Math.min(200, Math.max(1, Number(params.get('limit')) || 40));
  let files: string[];
  try {
    files = (await readdir(DIR)).filter((f) => f.endsWith('.json'));
  } catch {
    return Response.json({ data: [] });
  }
  type T = { id?: string; title?: string; artist?: string; at?: number; kind?: string; bars?: number; cues?: { entryA?: number; cueB?: number } };
  type S = { id?: string; startedAt?: string; updatedAt?: string; setBpm?: number; mode?: string; tracks?: T[] };
  const sets: S[] = [];
  for (const f of files) {
    try {
      sets.push(JSON.parse(await readFile(join(DIR, f), 'utf8')) as S);
    } catch {
      // half-written or hand-edited: skip it
    }
  }
  const when = (s: S) => Date.parse(s.startedAt ?? s.updatedAt ?? '') || 0;
  const data = sets
    .filter((s) => typeof s.id === 'string' && Array.isArray(s.tracks) && s.tracks.length > 1)
    .sort((a, b) => when(b) - when(a))
    .slice(0, limit)
    .map((s) => ({
      id: s.id,
      startedAt: s.startedAt,
      updatedAt: s.updatedAt,
      setBpm: s.setBpm,
      mode: s.mode,
      tracks: s.tracks!.map((t) => ({
        id: typeof t.id === 'string' ? canonicalNavidromeId(t.id) : '',
        title: t.title ?? '',
        artist: t.artist ?? '',
        at: t.at ?? 0,
        kind: t.kind,
        bars: t.bars,
        cues: t.cues ? { entryA: t.cues.entryA, cueB: t.cues.cueB } : undefined,
      })),
    }));
  return Response.json({ data });
}

export const Route = createFileRoute('/api/dj/lab-sets')({
  server: {
    handlers: { GET, POST },
  },
});
