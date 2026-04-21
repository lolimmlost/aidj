/**
 * Tests for Aurral Recommendations Feature Flag
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Must re-import after each reset to test singleton behavior
let getFeatureFlags: typeof import('../features').getFeatureFlags;
let isFeatureEnabled: typeof import('../features').isFeatureEnabled;
let resetFeatureFlags: typeof import('../features').resetFeatureFlags;

describe('Aurral Recommendations Feature Flag', () => {
  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../features');
    getFeatureFlags = mod.getFeatureFlags;
    isFeatureEnabled = mod.isFeatureEnabled;
    resetFeatureFlags = mod.resetFeatureFlags;
  });

  it('should be enabled by default', () => {
    const flags = getFeatureFlags();
    expect(flags.aurralRecommendations.enabled).toBe(true);
  });

  it('should have default weight values', () => {
    const flags = getFeatureFlags();
    expect(flags.aurralRecommendations.similarArtistWeight).toBe(0.9);
    expect(flags.aurralRecommendations.genreBoostWeight).toBe(0.15);
  });

  it('should be queryable via isFeatureEnabled', () => {
    expect(isFeatureEnabled('aurralRecommendations')).toBe(true);
  });

  it('should reset to defaults', () => {
    resetFeatureFlags();
    const flags = getFeatureFlags();
    expect(flags.aurralRecommendations.enabled).toBe(true);
    expect(flags.aurralRecommendations.similarArtistWeight).toBe(0.9);
  });
});
