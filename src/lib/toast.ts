/**
 * Centralized toast wrapper with standardized durations by type.
 *
 * Import `toast` from this module instead of from 'sonner' directly.
 * Type-specific defaults:
 *   success  – 3 000 ms
 *   error    – 6 000 ms
 *   info     – 4 000 ms
 *   warning  – 5 000 ms
 *   loading  – ∞ (until dismissed or replaced)
 */
import { toast as sonnerToast, type ExternalToast } from 'sonner';

const DURATIONS = {
  success: 3_000,
  error: 6_000,
  info: 4_000,
  warning: 5_000,
} as const;

function withDefault<T extends keyof typeof DURATIONS>(
  type: T,
  original: (typeof sonnerToast)[T],
) {
  return (message: Parameters<typeof original>[0], data?: ExternalToast) =>
    original(message, { duration: DURATIONS[type], ...data });
}

/** Re-export with per-type duration defaults applied. */
export const toast = Object.assign(
  // The base `toast()` call (no type) keeps sonner's default
  (...args: Parameters<typeof sonnerToast>) => sonnerToast(...args),
  {
    ...sonnerToast,
    success: withDefault('success', sonnerToast.success),
    error: withDefault('error', sonnerToast.error),
    info: withDefault('info', sonnerToast.info),
    warning: withDefault('warning', sonnerToast.warning),
    // loading keeps sonner's default (infinite until dismissed)
  },
);
