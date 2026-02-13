/**
 * Script to create the missing mood-timeline tables
 * Run with: npx tsx scripts/run-migration.ts
 */
import { db } from '../src/lib/db';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('Checking and creating missing tables...');

  // Check if taste_snapshots table exists
  const tableCheck = await db.execute(sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('taste_snapshots', 'mood_snapshots', 'recommendation_history')
  `);

  const existingTables = tableCheck.rows.map((r: Record<string, unknown>) => r.table_name);
  console.log('Existing tables:', existingTables);

  // Create taste_snapshots if not exists
  if (!existingTables.includes('taste_snapshots')) {
    console.log('Creating taste_snapshots table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "taste_snapshots" (
        "id" text PRIMARY KEY NOT NULL,
        "user_id" text NOT NULL,
        "name" text NOT NULL,
        "captured_at" timestamp NOT NULL,
        "period_start" timestamp NOT NULL,
        "period_end" timestamp NOT NULL,
        "profile_data" jsonb NOT NULL,
        "export_formats" jsonb DEFAULT '[]'::jsonb,
        "description" text,
        "is_auto_generated" integer DEFAULT 0,
        CONSTRAINT "taste_snapshots_user_id_user_id_fk"
          FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade
      )
    `);
    console.log('taste_snapshots table created!');

    // Create indexes
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "taste_snapshots_user_id_idx"
        ON "taste_snapshots" USING btree ("user_id")
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "taste_snapshots_captured_at_idx"
        ON "taste_snapshots" USING btree ("captured_at")
    `);
  } else {
    console.log('taste_snapshots table already exists');
  }

  // Create mood_snapshots if not exists
  if (!existingTables.includes('mood_snapshots')) {
    console.log('Creating mood_snapshots table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "mood_snapshots" (
        "id" text PRIMARY KEY NOT NULL,
        "user_id" text NOT NULL,
        "period_start" timestamp NOT NULL,
        "period_end" timestamp NOT NULL,
        "period_type" text NOT NULL,
        "mood_distribution" jsonb NOT NULL,
        "top_genres" jsonb NOT NULL,
        "top_artists" jsonb NOT NULL,
        "top_tracks" jsonb NOT NULL,
        "total_listens" integer DEFAULT 0 NOT NULL,
        "total_feedback" integer DEFAULT 0 NOT NULL,
        "thumbs_up_count" integer DEFAULT 0 NOT NULL,
        "thumbs_down_count" integer DEFAULT 0 NOT NULL,
        "acceptance_rate" real DEFAULT 0 NOT NULL,
        "diversity_score" real DEFAULT 0 NOT NULL,
        "season" text,
        "month" integer,
        "created_at" timestamp NOT NULL,
        CONSTRAINT "mood_snapshots_user_id_user_id_fk"
          FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade
      )
    `);
    console.log('mood_snapshots table created!');

    // Create indexes
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "mood_snapshots_user_id_idx"
        ON "mood_snapshots" USING btree ("user_id")
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "mood_snapshots_period_start_idx"
        ON "mood_snapshots" USING btree ("period_start")
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "mood_snapshots_user_period_idx"
        ON "mood_snapshots" USING btree ("user_id", "period_start")
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "mood_snapshots_period_type_idx"
        ON "mood_snapshots" USING btree ("period_type")
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "mood_snapshots_user_period_type_idx"
        ON "mood_snapshots" USING btree ("user_id", "period_type")
    `);
  } else {
    console.log('mood_snapshots table already exists');
  }

  // Create recommendation_history if not exists
  if (!existingTables.includes('recommendation_history')) {
    console.log('Creating recommendation_history table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "recommendation_history" (
        "id" text PRIMARY KEY NOT NULL,
        "user_id" text NOT NULL,
        "generated_at" timestamp NOT NULL,
        "recommended_songs" jsonb NOT NULL,
        "source" text NOT NULL,
        "mood_context" text,
        "reasoning_factors" jsonb,
        "taste_profile_snapshot" jsonb,
        CONSTRAINT "recommendation_history_user_id_user_id_fk"
          FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade
      )
    `);
    console.log('recommendation_history table created!');

    // Create indexes
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "recommendation_history_user_id_idx"
        ON "recommendation_history" USING btree ("user_id")
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "recommendation_history_generated_at_idx"
        ON "recommendation_history" USING btree ("generated_at")
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "recommendation_history_user_generated_at_idx"
        ON "recommendation_history" USING btree ("user_id", "generated_at")
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "recommendation_history_source_idx"
        ON "recommendation_history" USING btree ("source")
    `);
  } else {
    console.log('recommendation_history table already exists');
  }

  console.log('Migration complete!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
