/**
 * Tiny haptic feedback helper (#278). Uses the Vibration API, which Android
 * Chrome/PWAs support; iOS Safari and desktop lack it, so this silently no-ops.
 */
const PATTERNS = {
  /** Toggle-style confirmation (like, thumbs). */
  light: 10,
  /** Committed/destructive gesture. */
  medium: 20,
  /** Positive completion. */
  success: [10, 40, 15],
} satisfies Record<string, VibratePattern>;

export type HapticKind = keyof typeof PATTERNS;

export function haptic(kind: HapticKind = 'light'): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(PATTERNS[kind]);
  } catch {
    // Some browsers throw if called before a user gesture; feedback is best-effort.
  }
}
