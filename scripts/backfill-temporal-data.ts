/**
 * Backfill temporal metadata for existing recommendation feedback
 * Story 3.11: Task 1.3
 */

import { db } from '../src/lib/db';
import { recommendationFeedback } from '../src/lib/db/schema';
import { extractTemporalMetadata } from '../src/lib/utils/temporal';
import { eq } from 'drizzle-orm';

async function backfillTemporalData() {
  console.log('🔄 Backfilling temporal metadata for recommendation feedback...');

  try {
    // Fetch all feedback records that don't have temporal data
    const feedbackRecords = await db
      .select()
      .from(recommendationFeedback)
      .where(eq(recommendationFeedback.month, null));

    console.log(`📊 Found ${feedbackRecords.length} records to backfill`);

    let updated = 0;
    for (const record of feedbackRecords) {
      const temporal = extractTemporalMetadata(record.timestamp);

      await db
        .update(recommendationFeedback)
        .set({
          month: temporal.month,
          season: temporal.season,
          dayOfWeek: temporal.dayOfWeek,
          hourOfDay: temporal.hourOfDay,
        })
        .where(eq(recommendationFeedback.id, record.id));

      updated++;
      if (updated % 100 === 0) {
        console.log(`  ✓ Updated ${updated}/${feedbackRecords.length} records`);
      }
    }

    console.log(`✅ Backfill complete! Updated ${updated} records`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Backfill failed:', error);
    process.exit(1);
  }
}

backfillTemporalData();
