/**
 * Shared plumbing for the /api/speakers routes: session gate, JSON responses,
 * and mapping Music Assistant failures to a 502 the client can show.
 */

import { auth } from '@/lib/auth/auth';
import { isMusicAssistantConfigured, MusicAssistantError } from './music-assistant';

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Runs `handler` for a signed-in user with Music Assistant configured.
 * Any logged-in household member can drive the house speakers.
 */
export async function withSpeakerAccess(
  request: Request,
  handler: () => Promise<Response>,
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) return json({ error: 'Unauthorized' }, 401);
  if (!isMusicAssistantConfigured()) return json({ error: 'Music Assistant is not configured' }, 503);
  try {
    return await handler();
  } catch (err) {
    if (err instanceof MusicAssistantError) {
      console.warn(`[Speakers] ${err.message}`);
      return json({ error: err.message }, 502);
    }
    throw err;
  }
}

const ID_RE = /^[\w.:-]{1,200}$/;

export function isValidId(value: unknown): value is string {
  return typeof value === 'string' && ID_RE.test(value);
}

export function parseSongIds(value: unknown, max = 50): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) return null;
  return value.every(isValidId) ? (value as string[]) : null;
}
