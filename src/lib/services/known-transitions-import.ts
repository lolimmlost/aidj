/**
 * Server side of the known-transitions book: fold every saved Lab set (LAB_SETS_DIR) into a user's
 * known_transitions. Shared by the manual "Sync Lab sets" route and the automatic import that follows
 * each Lab set save. Idempotent: plays / techniques / tempo / titles are recomputed from all sets; the
 * DJ's pick, role, status and note are never touched.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '~/lib/db';
import { knownTransitions } from '~/lib/db/schema';
import { aggregateLabSets, type SavedLabSet } from '~/lib/dj-lab/known-transitions';

const DIR = process.env.LAB_SETS_DIR || '/storage/sets';
const CHUNK = 200;

export async function importLabSetsFor(userId: string): Promise<{ sets: number; pairs: number }> {
  let files: string[];
  try {
    files = (await readdir(DIR)).filter((f) => f.endsWith('.json'));
  } catch {
    return { sets: 0, pairs: 0 };
  }
  const sets: SavedLabSet[] = [];
  for (const f of files) {
    try {
      sets.push(JSON.parse(await readFile(join(DIR, f), 'utf8')) as SavedLabSet);
    } catch {
      // a half-written or hand-edited file: skip it, keep the rest
    }
  }
  const pairs = aggregateLabSets(sets);
  const now = new Date();
  for (let i = 0; i < pairs.length; i += CHUNK) {
    const rows = pairs.slice(i, i + CHUNK).map((p) => ({ ...p, userId, source: 'lab' as const, updatedAt: now }));
    await db
      .insert(knownTransitions)
      .values(rows)
      .onConflictDoUpdate({
        target: [knownTransitions.userId, knownTransitions.fromSongId, knownTransitions.toSongId],
        set: {
          fromTitle: sql`excluded.from_title`,
          fromArtist: sql`excluded.from_artist`,
          toTitle: sql`excluded.to_title`,
          toArtist: sql`excluded.to_artist`,
          plays: sql`excluded.plays`,
          techniques: sql`excluded.techniques`,
          setBpm: sql`excluded.set_bpm`,
          lastPlayedAt: sql`excluded.last_played_at`,
          updatedAt: now,
        },
      });
  }
  console.log(`[known-transitions] imported ${pairs.length} pairs from ${sets.length} Lab sets for ${userId}`);
  return { sets: sets.length, pairs: pairs.length };
}

// The Lab saves its set on every transition: import once things go quiet, not on each save.
const pending = new Map<string, ReturnType<typeof setTimeout>>();
export function scheduleLabSetImport(userId: string, delayMs = 15_000) {
  const prev = pending.get(userId);
  if (prev) clearTimeout(prev);
  pending.set(
    userId,
    setTimeout(() => {
      pending.delete(userId);
      importLabSetsFor(userId).catch((e) => console.warn('[known-transitions] auto import failed:', (e as Error).message));
    }, delayMs),
  );
}
