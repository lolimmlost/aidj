/**
 * Repair song-id references after a retag (#221) — replaces hand-written SQL.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/repoint-song.ts <email> <oldId> <newId> [--dry-run] [--db-only]
 *   npx tsx --env-file=.env scripts/repoint-song.ts <email> --reconcile [--dry-run]
 *
 * Single repoint: moves every reference to <oldId> onto <newId> for the user
 * (liked_songs_sync, recommendation_feedback, playlist_songs, listening_history,
 * compound_scores — one transaction, collisions merge), then moves the Navidrome
 * star and rewrites mirrored Navidrome playlists. <newId> must be a live song;
 * its artist/title come from Navidrome.
 *
 * --reconcile: find every dead id the user references (ALL playlists, not just
 * the liked mirror) and repoint each one that has a live match. With --dry-run it
 * is a drift check: it reports what it would fix and what is missing, writes nothing.
 *
 *   --dry-run  run the real transaction, print what it would touch, roll back;
 *              no Navidrome writes
 *   --db-only  write the DB but leave Navidrome stars/playlists alone
 *
 * Needs the admin Navidrome password from the deployed container env (the local
 * .env copy is stale): NAVIDROME_PASSWORD=$(docker exec <app> printenv NAVIDROME_PASSWORD).
 */
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getSongsByIds } from '@/lib/services/navidrome';
import { getNavidromeUserCreds } from '@/lib/services/navidrome-users';
import { repointSongId, describeRepoint } from '@/lib/services/song-repoint';
import { reconcileLibrary } from '@/lib/services/library-reconciliation';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const dbOnly = args.includes('--db-only');
  const reconcile = args.includes('--reconcile');
  const [email, oldId, newId] = args.filter((a) => !a.startsWith('--'));
  if (!email || (!reconcile && (!oldId || !newId))) {
    console.error('Usage: repoint-song.ts <email> <oldId> <newId> [--dry-run] [--db-only]');
    console.error('       repoint-song.ts <email> --reconcile [--dry-run]');
    process.exit(1);
  }

  const users = (await db.execute(sql`select id, email from "user" where email = ${email}`)) as unknown as {
    id: string;
    email: string;
  }[];
  if (users.length === 0) {
    console.error(`No user with email ${email}`);
    process.exit(1);
  }
  const userId = users[0].id;
  console.log(`User: ${users[0].email} (${userId})${dryRun ? '  [DRY RUN — nothing is written]' : ''}`);

  if (reconcile) {
    const r = await reconcileLibrary(userId, { dryRun });
    console.log(
      `Checked ${r.checkedIds} ids: ${r.deadIds} dead, ${r.remapped} ${dryRun ? 'would be ' : ''}remapped, ` +
        `${r.notFound} not found in the library (${Math.round(r.durationMs / 1000)}s)`,
    );
    for (const d of r.details) console.log(`  ${d.oldId} → ${d.newId}  "${d.artist} - ${d.title}"  [${d.tables.join(', ')}]`);
    for (const m of r.missingFromLibrary) console.log(`  missing: "${m.artist} - ${m.title}" (${m.oldId}; ${m.source})`);
    process.exit(0);
  }

  const [song] = await getSongsByIds([newId]);
  if (!song) {
    console.error(`New id ${newId} is not a live Navidrome song — refusing to repoint onto it.`);
    process.exit(1);
  }
  console.log(`Repointing ${oldId} → ${newId} "${song.artist} - ${song.title}"`);

  const creds = await getNavidromeUserCreds(userId).catch(() => null);
  const result = await repointSongId({
    userId,
    oldId,
    newId,
    artist: song.artist || 'Unknown Artist',
    title: song.title,
    creds,
    dryRun,
    navidrome: !dbOnly,
  });
  const touched = describeRepoint(result);
  console.log(touched.length ? `${dryRun ? 'Would touch' : 'Touched'}: ${touched.join(', ')}` : 'Nothing references the old id — no change.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
