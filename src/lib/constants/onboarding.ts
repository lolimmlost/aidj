/**
 * Onboarding constants and types for new user detection and wizard flow.
 */

// Re-export the DB-level type for convenience
export type { OnboardingStatusData } from '@/lib/db/schema/preferences.schema';

/**
 * Data maturity thresholds — determine what UI to show based on user data volume.
 * - LOW: No data — show onboarding wizard
 * - EMERGING: Some plays — show radio + basics
 * - READY: Enough for recommendations — show full dashboard
 */
export const DATA_MATURITY = {
  LOW: 0,
  EMERGING: 10,
  READY: 30,
} as const;

/**
 * Shape returned by GET /api/onboarding/status
 */
export interface OnboardingStatusResponse {
  onboardingCompleted: boolean;
  onboardingSkipped: boolean;
  currentStep: number;
  dataMaturity: {
    listeningHistoryCount: number;
    artistAffinityCount: number;
    feedbackCount: number;
    hasLikedSongs: boolean;
    hasLastfmImport: boolean;
  };
}
