/**
 * Feature Flags Configuration
 *
 * Controls feature rollout for new functionality.
 * Flags can be set via environment variables or localStorage.
 */

export interface FeatureFlags {
  // Phase 1: HLS Streaming for network resilience
  hlsStreaming: {
    enabled: boolean;
    fallbackOnError: boolean; // Fall back to direct stream on HLS errors
  };

  // Phase 2: Server-side playback state
  serverPlaybackState: {
    enabled: boolean;
    syncInterval: number; // ms between syncs
  };

  // Phase 3: Device management / jukebox mode
  jukeboxMode: {
    enabled: boolean;
    allowMultipleDevices: boolean;
    showDeviceSelector: boolean;
  };
}

const defaultFlags: FeatureFlags = {
  hlsStreaming: {
    enabled: false, // Disabled by default until fully tested
    fallbackOnError: true,
  },
  serverPlaybackState: {
    enabled: false,
    syncInterval: 5000,
  },
  jukeboxMode: {
    enabled: false,
    allowMultipleDevices: true,
    showDeviceSelector: false,
  },
};

/**
 * Get feature flags from environment or localStorage
 */
function loadFeatureFlags(): FeatureFlags {
  const flags = { ...defaultFlags };

  if (typeof window !== 'undefined') {
    // Client-side: check localStorage for overrides
    const stored = localStorage.getItem('featureFlags');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        return mergeFlags(flags, parsed);
      } catch {
        // Ignore invalid stored flags
      }
    }
  } else {
    // Server-side: check environment variables
    if (process.env.FEATURE_HLS_STREAMING === 'true') {
      flags.hlsStreaming.enabled = true;
    }
    if (process.env.FEATURE_SERVER_PLAYBACK === 'true') {
      flags.serverPlaybackState.enabled = true;
    }
    if (process.env.FEATURE_JUKEBOX === 'true') {
      flags.jukeboxMode.enabled = true;
      flags.jukeboxMode.showDeviceSelector = true;
    }
  }

  return flags;
}

/**
 * Deep merge feature flags
 */
function mergeFlags(
  base: FeatureFlags,
  overrides: Partial<FeatureFlags>
): FeatureFlags {
  const result = { ...base };

  for (const key of Object.keys(overrides) as (keyof FeatureFlags)[]) {
    if (overrides[key] && typeof overrides[key] === 'object') {
      result[key] = { ...base[key], ...overrides[key] };
    }
  }

  return result;
}

// Singleton instance
let features: FeatureFlags | null = null;

/**
 * Get current feature flags
 */
export function getFeatureFlags(): FeatureFlags {
  if (!features) {
    features = loadFeatureFlags();
  }
  return features;
}

/**
 * Check if a specific feature is enabled
 */
export function isFeatureEnabled(
  feature: 'hlsStreaming' | 'serverPlaybackState' | 'jukeboxMode'
): boolean {
  return getFeatureFlags()[feature].enabled;
}

/**
 * Update feature flags (client-side only)
 * Persists to localStorage
 */
export function setFeatureFlags(updates: Partial<FeatureFlags>): void {
  if (typeof window === 'undefined') {
    console.warn('[Features] Cannot update flags server-side');
    return;
  }

  const current = getFeatureFlags();
  const updated = mergeFlags(current, updates);
  features = updated;

  localStorage.setItem('featureFlags', JSON.stringify(updated));
  console.log('[Features] Updated flags:', updated);
}

/**
 * Reset feature flags to defaults
 */
export function resetFeatureFlags(): void {
  features = { ...defaultFlags };

  if (typeof window !== 'undefined') {
    localStorage.removeItem('featureFlags');
  }
}
