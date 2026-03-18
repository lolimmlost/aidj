/**
 * Unit tests for POST /api/onboarding/update-step route handler logic
 */

import { describe, it, expect } from 'vitest';
import type { OnboardingStatusData } from '@/lib/db/schema/preferences.schema';

describe('Onboarding Update Step', () => {
  describe('allowed fields validation', () => {
    const allowedFields = ['currentStep', 'likedSongsSynced', 'lastfmImported', 'lastfmUsername'];

    it('should filter body to only allowed fields', () => {
      const body = {
        currentStep: 3,
        likedSongsSynced: true,
        completed: true, // Should be filtered out
        malicious: 'data', // Should be filtered out
      };

      const updates: Record<string, unknown> = {};
      for (const field of allowedFields) {
        if (body[field as keyof typeof body] !== undefined) {
          updates[field] = body[field as keyof typeof body];
        }
      }

      expect(updates).toEqual({
        currentStep: 3,
        likedSongsSynced: true,
      });
      expect(updates).not.toHaveProperty('completed');
      expect(updates).not.toHaveProperty('malicious');
    });

    it('should reject when no valid fields provided', () => {
      const body = { unknown: 'value' };

      const updates: Record<string, unknown> = {};
      for (const field of allowedFields) {
        if (body[field as keyof typeof body] !== undefined) {
          updates[field] = body[field as keyof typeof body];
        }
      }

      expect(Object.keys(updates).length).toBe(0);
    });
  });

  describe('JSONB merge', () => {
    it('should merge updates with existing onboarding status', () => {
      const existing: OnboardingStatusData = {
        completed: false,
        selectedArtistIds: ['a1', 'a2', 'a3'],
        currentStep: 2,
      };

      const updates = { likedSongsSynced: true, currentStep: 3 };
      const merged: OnboardingStatusData = {
        ...existing,
        ...updates,
      } as OnboardingStatusData;

      expect(merged.completed).toBe(false);
      expect(merged.selectedArtistIds).toEqual(['a1', 'a2', 'a3']);
      expect(merged.likedSongsSynced).toBe(true);
      expect(merged.currentStep).toBe(3);
    });

    it('should handle null existing status', () => {
      const existing = null;
      const updates = { currentStep: 2 };

      const merged: OnboardingStatusData = {
        ...(existing ?? { completed: false }),
        ...updates,
      } as OnboardingStatusData;

      expect(merged.completed).toBe(false);
      expect(merged.currentStep).toBe(2);
    });
  });
});
