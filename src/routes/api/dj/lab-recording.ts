/**
 * Live-set recordings (#391): the Lab records its own master output and uploads it here in ~10 s chunks, so a phone
 * never holds a whole set (a 2-hour set at 192 kbps is ~170 MB). A `finish` call joins the chunks into one file
 * next to a JSON with the tracklist. Admin only, like the Lab.
 *
 * Files go to LAB_RECORDINGS_DIR, default /storage/recordings: /storage is the app's persistent Coolify mount
 * (/data/coolify/applications/aidj on .227). Anywhere else in the container, a redeploy loses them.
 */
import { createFileRoute } from '@tanstack/react-router';
import { mkdir, readdir, readFile, rm, writeFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { auth } from '~/lib/auth/auth';

const DIR = process.env.LAB_RECORDINGS_DIR || '/storage/recordings';
/** a chunk is ~240 KB at 192 kbps; anything far bigger isn't one */
const MAX_CHUNK = 8 * 1024 * 1024;
const EXT: Record<string, string> = { 'audio/mp4': 'm4a', 'audio/webm': 'webm', 'audio/ogg': 'ogg' };

const validId = (id: string | null): id is string => !!id && /^[a-z0-9-]{6,40}$/.test(id);

async function admin(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new Response('Unauthorized', { status: 401 });
  if (session.user.role !== 'admin') return new Response('Forbidden', { status: 403 });
  return null;
}

export async function POST({ request }: { request: Request }) {
  const denied = await admin(request);
  if (denied) return denied;
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!validId(id)) return new Response('Bad id', { status: 400 });
  const parts = join(DIR, `${id}.parts`);

  if (url.searchParams.get('finish') === null) {
    // a chunk: stored by sequence number, so a retried or late chunk still lands in order
    const seq = Number(url.searchParams.get('seq'));
    if (!Number.isInteger(seq) || seq < 0 || seq > 100_000) return new Response('Bad seq', { status: 400 });
    const body = Buffer.from(await request.arrayBuffer());
    if (!body.length || body.length > MAX_CHUNK) return new Response('Bad chunk', { status: 400 });
    await mkdir(parts, { recursive: true });
    await writeFile(join(parts, String(seq).padStart(6, '0')), body);
    return new Response(null, { status: 204 });
  }

  // finish: join the chunks in order, keep the tracklist next to the file
  let meta: { mime?: string; [k: string]: unknown };
  try {
    meta = (await request.json()) as typeof meta;
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }
  const ext = EXT[String(meta.mime ?? '').split(';')[0]] ?? 'bin';
  let names: string[];
  try {
    names = (await readdir(parts)).sort();
  } catch {
    return new Response('No chunks', { status: 404 });
  }
  const file = join(DIR, `${id}.${ext}`);
  await writeFile(file, Buffer.alloc(0));
  for (const n of names) await appendFile(file, await readFile(join(parts, n)));
  await writeFile(join(DIR, `${id}.json`), JSON.stringify({ ...meta, id, file: `${id}.${ext}`, chunks: names.length, finishedAt: new Date().toISOString() }, null, 2));
  await rm(parts, { recursive: true, force: true });
  console.log(`🎛️ [LAB rec] ${id}: ${names.length} chunks -> ${file}`);
  return Response.json({ file: `${id}.${ext}`, chunks: names.length });
}

export const Route = createFileRoute('/api/dj/lab-recording')({
  server: {
    handlers: { POST },
  },
});
