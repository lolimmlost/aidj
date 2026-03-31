/**
 * Migration: Add unique constraint on (user_id, song_id) in recommendation_feedback.
 *
 * Steps:
 * 1. Check for and remove duplicate (user_id, song_id) rows, keeping the newest.
 * 2. Add the UNIQUE constraint.
 *
 * Run: npx tsx scripts/migrate-feedback-unique.ts
 */

import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:password@10.0.0.4:5432/ai_dj';
const sql = postgres(DATABASE_URL);

async function main() {
  console.log('Checking for duplicate (user_id, song_id) rows...');

  const dupes = await sql`
    SELECT user_id, song_id, COUNT(*) as cnt
    FROM recommendation_feedback
    WHERE song_id IS NOT NULL
    GROUP BY user_id, song_id
    HAVING COUNT(*) > 1
  `;

  console.log(`Found ${dupes.length} duplicate groups`);

  if (dupes.length > 0) {
    console.log('Removing duplicates (keeping most recent by timestamp, then by id)...');

    // Delete older duplicates
    const r1 = await sql`
      DELETE FROM recommendation_feedback a
      USING recommendation_feedback b
      WHERE a.user_id = b.user_id
        AND a.song_id = b.song_id
        AND a.song_id IS NOT NULL
        AND a."timestamp" < b."timestamp"
    `;
    console.log(`Removed ${r1.count} rows with older timestamps`);

    // Delete remaining duplicates with same timestamp (keep higher id)
    const r2 = await sql`
      DELETE FROM recommendation_feedback a
      USING recommendation_feedback b
      WHERE a.user_id = b.user_id
        AND a.song_id = b.song_id
        AND a.song_id IS NOT NULL
        AND a."timestamp" = b."timestamp"
        AND a.id < b.id
    `;
    console.log(`Removed ${r2.count} rows with same timestamp (kept latest id)`);
  }

  // Check if constraint already exists
  const existing = await sql`
    SELECT 1 FROM pg_constraint
    WHERE conname = 'recommendation_feedback_user_song_unique'
  `;

  if (existing.length > 0) {
    console.log('Unique constraint already exists, skipping.');
  } else {
    console.log('Adding unique constraint...');
    await sql`
      ALTER TABLE recommendation_feedback
      ADD CONSTRAINT recommendation_feedback_user_song_unique
      UNIQUE(user_id, song_id)
    `;
    console.log('Unique constraint added successfully.');
  }

  // Verify
  const count = await sql`SELECT COUNT(*) as cnt FROM recommendation_feedback`;
  console.log(`Total feedback rows: ${count[0].cnt}`);

  await sql.end();
  console.log('Done!');
}

main().catch(async (err) => {
  console.error('Migration failed:', err);
  await sql.end();
  process.exit(1);
});
