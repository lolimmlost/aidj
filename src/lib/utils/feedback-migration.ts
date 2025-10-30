/**
 * localStorage Feedback Migration Utility
 * Migrates legacy localStorage feedback data to database via API
 *
 * Legacy format: base64-encoded song keys with base64-encoded feedback values
 * Format: { up: boolean, down: boolean }
 */

export interface LegacyFeedback {
  up: boolean;
  down: boolean;
}

export interface MigrationResult {
  success: boolean;
  migratedCount: number;
  failedCount: number;
  errors: string[];
}

/**
 * Check if legacy feedback data exists in localStorage
 */
export function hasLegacyFeedback(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      // Try to decode as base64 and check if it's feedback data
      try {
        const value = localStorage.getItem(key);
        if (!value) continue;

        const decoded = JSON.parse(atob(value));
        if (typeof decoded === 'object' && ('up' in decoded || 'down' in decoded)) {
          return true;
        }
      } catch {
        // Not feedback data, skip
        continue;
      }
    }
  } catch (error) {
    console.error('Error checking for legacy feedback:', error);
  }
  return false;
}

/**
 * Migrate all legacy localStorage feedback to database
 */
export async function migrateLegacyFeedback(): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: true,
    migratedCount: 0,
    failedCount: 0,
    errors: [],
  };

  const feedbackKeys: string[] = [];

  // Collect all feedback keys
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      try {
        const value = localStorage.getItem(key);
        if (!value) continue;

        const decoded = JSON.parse(atob(value));
        if (typeof decoded === 'object' && ('up' in decoded || 'down' in decoded)) {
          feedbackKeys.push(key);
        }
      } catch {
        // Not feedback data, skip
        continue;
      }
    }
  } catch (error) {
    console.error('Error collecting feedback keys:', error);
    result.success = false;
    result.errors.push('Failed to read localStorage');
    return result;
  }

  // Migrate each feedback item
  for (const key of feedbackKeys) {
    try {
      const value = localStorage.getItem(key);
      if (!value) continue;

      const feedback: LegacyFeedback = JSON.parse(atob(value));
      const songArtistTitle = atob(key);

      // Determine feedback type
      let feedbackType: 'thumbs_up' | 'thumbs_down' | null = null;
      if (feedback.up) {
        feedbackType = 'thumbs_up';
      } else if (feedback.down) {
        feedbackType = 'thumbs_down';
      }

      // Skip if no feedback was actually given
      if (!feedbackType) {
        continue;
      }

      // Submit to API
      const response = await fetch('/api/recommendations/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songArtistTitle,
          feedbackType,
          source: 'recommendation',
        }),
      });

      if (!response.ok) {
        // Handle 409 Conflict (duplicate feedback) gracefully
        if (response.status === 409) {
          await response.json(); // Consume response body
          console.log('✓ Feedback already exists during migration, skipping');
          return result; // Skip this item during migration
        }
        throw new Error(`API returned ${response.status}`);
      }

      result.migratedCount++;

      // Remove from localStorage after successful migration
      localStorage.removeItem(key);
    } catch (error) {
      console.error(`Failed to migrate feedback for key ${key}:`, error);
      result.failedCount++;
      result.errors.push(`Failed to migrate: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Set migration completed flag
  if (result.migratedCount > 0 || feedbackKeys.length === 0) {
    localStorage.setItem('feedback-migration-completed', new Date().toISOString());
  }

  return result;
}

/**
 * Check if migration has been completed
 */
export function isMigrationCompleted(): boolean {
  return localStorage.getItem('feedback-migration-completed') !== null;
}

/**
 * Clear migration completion flag (for testing)
 */
export function resetMigrationFlag(): void {
  localStorage.removeItem('feedback-migration-completed');
}
