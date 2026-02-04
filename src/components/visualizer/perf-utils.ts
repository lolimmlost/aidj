/**
 * Visualizer Performance Utilities
 *
 * Provides adaptive quality controls for canvas visualizers:
 * - Frame skipping for 30fps target
 * - Device quality detection (mobile/low-end)
 * - Adaptive particle/segment counts
 * - FPS monitoring with auto-reduction
 */

// ============================================================================
// Quality Levels
// ============================================================================

export type QualityLevel = 'high' | 'medium' | 'low';

/**
 * Detect device quality level based on hardware capabilities
 */
export function getQualityLevel(): QualityLevel {
  if (typeof navigator === 'undefined') return 'high';

  const cores = navigator.hardwareConcurrency || 2;
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const screenPixels = (typeof screen !== 'undefined')
    ? screen.width * screen.height * (window.devicePixelRatio || 1)
    : 1920 * 1080;

  // Mobile with low cores → low
  if (isMobile && cores <= 4) return 'low';
  // Mobile with decent cores or desktop with low cores → medium
  if (isMobile || cores <= 4 || screenPixels > 3840 * 2160) return 'medium';
  // Desktop with good specs → high
  return 'high';
}

// ============================================================================
// Adaptive Counts
// ============================================================================

/**
 * Scale a base particle/segment count by quality level
 */
export function getAdaptiveCount(base: number, quality: QualityLevel): number {
  switch (quality) {
    case 'high': return base;
    case 'medium': return Math.round(base * 0.6);
    case 'low': return Math.round(base * 0.3);
  }
}

/**
 * Get adaptive canvas resolution scale (for devicePixelRatio management)
 */
export function getAdaptiveResolutionScale(quality: QualityLevel): number {
  const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
  switch (quality) {
    case 'high': return Math.min(dpr, 2);
    case 'medium': return Math.min(dpr, 1.5);
    case 'low': return 1;
  }
}

// ============================================================================
// Frame Skipping
// ============================================================================

/**
 * Create a frame skipper for limiting FPS.
 * Returns a function that returns true when a frame should be rendered.
 */
export function createFrameSkipper(targetFps: number) {
  const interval = 1000 / targetFps;
  let lastFrameTime = 0;

  return function shouldRender(currentTime: number): boolean {
    const elapsed = currentTime - lastFrameTime;
    if (elapsed >= interval) {
      lastFrameTime = currentTime - (elapsed % interval);
      return true;
    }
    return false;
  };
}

// ============================================================================
// FPS Monitor
// ============================================================================

/**
 * Create an FPS monitor that detects sustained low FPS
 * and can trigger quality reduction.
 */
export function createFPSMonitor(options?: {
  /** FPS threshold below which quality should reduce (default: 24) */
  lowFpsThreshold?: number;
  /** Seconds of sustained low FPS before reducing (default: 3) */
  sustainedSeconds?: number;
  /** Callback when quality should be reduced */
  onQualityReduce?: (currentQuality: QualityLevel) => void;
}) {
  const {
    lowFpsThreshold = 24,
    sustainedSeconds = 3,
    onQualityReduce,
  } = options || {};

  let frameCount = 0;
  let lastSecondTime = 0;
  let currentFps = 60;
  let lowFpsSeconds = 0;
  let currentQuality: QualityLevel = 'high';

  return {
    /** Call every frame with current timestamp */
    tick(currentTime: number) {
      frameCount++;

      if (currentTime - lastSecondTime >= 1000) {
        currentFps = frameCount;
        frameCount = 0;
        lastSecondTime = currentTime;

        // Track sustained low FPS
        if (currentFps < lowFpsThreshold && currentQuality !== 'low') {
          lowFpsSeconds++;
          if (lowFpsSeconds >= sustainedSeconds) {
            lowFpsSeconds = 0;
            const newQuality: QualityLevel = currentQuality === 'high' ? 'medium' : 'low';
            currentQuality = newQuality;
            onQualityReduce?.(newQuality);
            console.log(`📉 [Visualizer] Auto-reducing quality to ${newQuality} (${currentFps} FPS sustained)`);
          }
        } else {
          lowFpsSeconds = 0;
        }
      }
    },

    /** Get current measured FPS */
    getFps(): number {
      return currentFps;
    },

    /** Get current quality level */
    getQuality(): QualityLevel {
      return currentQuality;
    },

    /** Manually set quality level */
    setQuality(quality: QualityLevel) {
      currentQuality = quality;
      lowFpsSeconds = 0;
    },

    /** Reset the monitor */
    reset() {
      frameCount = 0;
      lastSecondTime = 0;
      currentFps = 60;
      lowFpsSeconds = 0;
    },
  };
}
