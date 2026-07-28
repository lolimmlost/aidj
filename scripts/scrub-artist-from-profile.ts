/**
 * One-off: scrub a single artist from a user's listening profile.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/scrub-artist-from-profile.ts <email> <artist-substring>
 *
 * Matches the artist column with ILIKE %substring% so common casing/whitespace
 * variations are caught. Use a precise substring to avoid false positives.
 *
 * Effects:
 *   - DELETE listening_history rows for the user matching the substring
 *   - DELETE music_identity_summaries rows for the user (next view regenerates
 *     them from the now-cleaned history)
 *
 * Not touched: compound_scores, recommendation_feedback, affinity tables. AI DJ
 * still uses whatever it learned; this script only affects the profile rollup.
 */
import postgres from 'postgres';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const positional = args.filter((a) => !a.startsWith('--'));
  const [email, substring] = positional;
  if (!email || !substring) {
    console.error('Usage: scrub-artist-from-profile.ts <email> <artist-substring> [--dry-run]');
    process.exit(1);
  }

  const sql = postgres(process.env.DATABASE_URL!);

  const users = await sql`SELECT id, email FROM "user" WHERE email = ${email}`;
  if (users.length === 0) {
    console.error(`No user with email ${email}`);
    await sql.end();
    process.exit(1);
  }
  const userId = users[0].id as string;
  console.log(`User: ${users[0].email} (${userId})`);

  const pattern = `%${substring}%`;
  const counts = await sql`
    SELECT artist, COUNT(*)::int AS plays
    FROM listening_history
    WHERE user_id = ${userId} AND artist ILIKE ${pattern}
    GROUP BY artist
    ORDER BY plays DESC
  `;

  if (counts.length === 0) {
    console.log(`No listening_history rows match "${substring}". Nothing to do.`);
    await sql.end();
    return;
  }

  console.log(`\nMatching artist variants (will be deleted):`);
  let total = 0;
  for (const r of counts) {
    console.log(`  ${r.artist}: ${r.plays}`);
    total += r.plays as number;
  }
  console.log(`Total rows: ${total}\n`);

  if (dryRun) {
    console.log('--dry-run set, no changes made.');
    await sql.end();
    return;
  }

  const deletedHistory = await sql`
    DELETE FROM listening_history
    WHERE user_id = ${userId} AND artist ILIKE ${pattern}
  `;
  console.log(`Deleted ${deletedHistory.count} listening_history rows`);

  const deletedSummaries = await sql`
    DELETE FROM music_identity_summaries WHERE user_id = ${userId}
  `;
  console.log(`Cleared ${deletedSummaries.count} music_identity_summaries rows (will be recomputed on next view)`);

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
