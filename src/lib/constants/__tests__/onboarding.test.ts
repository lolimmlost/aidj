import { describe, it, expect } from 'vitest';
import { DATA_MATURITY } from '../onboarding';
import type { OnboardingStatusResponse } from '../onboarding';

describe('Onboarding Constants', () => {
  describe('DATA_MATURITY', () => {
    it('should have LOW threshold at 0', () => {
      expect(DATA_MATURITY.LOW).toBe(0);
    });

    it('should have EMERGING threshold at 10', () => {
      expect(DATA_MATURITY.EMERGING).toBe(10);
    });

    it('should have READY threshold at 30', () => {
      expect(DATA_MATURITY.READY).toBe(30);
    });

    it('should have ascending thresholds', () => {
      expect(DATA_MATURITY.LOW).toBeLessThan(DATA_MATURITY.EMERGING);
      expect(DATA_MATURITY.EMERGING).toBeLessThan(DATA_MATURITY.READY);
    });
  });

  describe('OnboardingStatusResponse type', () => {
    it('should accept a valid response shape', () => {
      const response: OnboardingStatusResponse = {
        onboardingCompleted: false,
        onboardingSkipped: false,
        currentStep: 1,
        dataMaturity: {
          listeningHistoryCount: 0,
          artistAffinityCount: 0,
          feedbackCount: 0,
          hasLikedSongs: false,
          hasLastfmImport: false,
        },
      };

      expect(response.onboardingCompleted).toBe(false);
      expect(response.dataMaturity.listeningHistoryCount).toBe(0);
    });
  });
});
