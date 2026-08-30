/**
 * One-off / idempotent: back-fill basic (non-smart) playlists that only ever
 * existed locally (navidromeId = null) into real Navidrome playlists.
 *
 * Historically `POST /api/playlists` created a local-only row and never called
 * Navidrome, so custom playlists never became real/syncable playlists. This
 * pushes each such playlist (with its songs, in local order) to Navidrome using
 * the owning user's creds and persists the returned navidromeId. Safe to re-run:
 * anything already carrying a navidromeId is skipped.
 *
 * Excluded: smart playlists and the canonical Liked Songs list (both handled by
 * `ensurePlaylistOnNavidrome`, which self-guards).
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/backfill-playlists-to-navidrome.ts [--dry-run] [--user <email>]
 */
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../src/lib/db';
import { userPlaylists, playlistSongs } from '../src/lib/db/schema/playlists.schema';
import { user } from '../src/lib/db/schema';
import { ensurePlaylistOnNavidrome } from '../src/lib/services/playlist-navidrome-mirror';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const userIdx = args.indexOf('--user');
  const email = userIdx >= 0 ? args[userIdx + 1] : undefined;

  let userIdFilter: string | undefined;
  if (email) {
    const u = await db.select().from(user).where(eq(user.email, email)).limit(1).then((r) => r[0]);
    if (!u) {
      console.error(`No user with email ${email}`);
      process.exit(1);
    }
    userIdFilter = u.id;
    console.log(`Filtering to user ${email} (${u.id})`);
  }

  const rows = await db
    .select()
    .from(userPlaylists)
    .where(
      userIdFilter
        ? and(isNull(userPlaylists.navidromeId), eq(userPlaylists.userId, userIdFilter))
        : isNull(userPlaylists.navidromeId),
    );

  // ensurePlaylistOnNavidrome self-skips smart + canonical-liked playlists; we
  // filter smart here only to keep the console summary honest.
  const candidates = rows.filter((p) => !p.smartPlaylistCriteria);
  console.log(`Found ${candidates.length} local-only playlist(s) to consider${dryRun ? ' (dry run)' : ''}\n`);

  let created = 0;
  let notCreated = 0;

  for (const pl of candidates) {
    const count = await db
      .select({ id: playlistSongs.id })
      .from(playlistSongs)
      .where(eq(playlistSongs.playlistId, pl.id))
      .then((r) => r.length);

    if (dryRun) {
      console.log(`  [dry] "${pl.name}" (${count} songs) — user ${pl.userId}`);
      continue;
    }

    const navId = await ensurePlaylistOnNavidrome(pl.id, pl.userId);
    if (navId) {
      console.log(`  ✅ "${pl.name}" → ${navId} (${count} songs)`);
      created++;
    } else {
      // null = skipped (canonical-liked / no creds) or a Navidrome error; the
      // helper already logged the reason above.
      console.log(`  ⏭️  "${pl.name}" not created (skipped or failed — see log above)`);
      notCreated++;
    }
  }

  if (!dryRun) console.log(`\nDone. created=${created} not-created=${notCreated}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Back-fill failed:', err);
  process.exit(1);
});
