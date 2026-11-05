/**
 * Saved Lab sets on the server (#392): the browser keeps its sets in localStorage and copies each one here as it's
 * saved, cues and all, so a set can be rendered offline through the Lab's own engine. One JSON per set in
 * LAB_SETS_DIR (default /storage/sets, the app's persistent mount). Admin only, like the Lab.
 */
import { createFileRoute } from '@tanstack/react-router';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { auth } from '~/lib/auth/auth';
import { canonicalNavidromeId } from '~/lib/utils/navidrome-id';

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
  return new Response(null, { status: 204 });
}

export const Route = createFileRoute('/api/dj/lab-sets')({
  server: {
    handlers: { POST },
  },
});
