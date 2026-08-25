/**
 * useDebugTapToggle
 *
 * Returns a tap handler that toggles the Eruda debug console + remote logging
 * (see useEruda) after N rapid taps on the element it's attached to.
 *
 * WHY: On an installed iOS PWA there is no address bar to add `?debug=true`,
 * and the PWA runs in its own sandboxed storage container (so flipping
 * `localStorage.debug` in Safari-proper does NOT cross into the PWA). The only
 * reliable way to enable debug logging on-device is to flip it from *inside*
 * the running PWA — this hook does that via a discreet multi-tap gesture on the
 * brand link / mobile title bar.
 *
 * Once enabled, `console.*` streams to /api/debug/logs and shows up in the
 * server logs as `📱 [CLIENT] …`.
 */

import { useCallback, useRef } from 'react';
import { toast } from '@/lib/toast';

const TAPS_REQUIRED = 5;
const WINDOW_MS = 3000;

export function useDebugTapToggle(): () => void {
  const taps = useRef<number[]>([]);

  return useCallback(() => {
    const now = Date.now();
    // Keep only taps within the rolling window
    taps.current = taps.current.filter((t) => now - t < WINDOW_MS).concat(now);

    const remaining = TAPS_REQUIRED - taps.current.length;

    // Give a quiet nudge once the user is clearly mid-gesture (avoids firing
    // on incidental single taps of the brand link / title).
    if (remaining > 0 && taps.current.length >= 3) {
      toast(`Debug: ${remaining} more tap${remaining === 1 ? '' : 's'}…`, { duration: 1200 });
      return;
    }

    if (taps.current.length < TAPS_REQUIRED) return;

    taps.current = [];

    let enabling = true;
    try {
      enabling = localStorage.getItem('debug') !== 'true';
      if (enabling) {
        localStorage.setItem('debug', 'true');
      } else {
        localStorage.removeItem('debug');
      }
    } catch {
      // localStorage blocked (private mode) — nothing we can do
      toast.error('Debug toggle unavailable (storage blocked)');
      return;
    }

    toast.success(
      enabling
        ? '🔧 Debug logging ON — reloading (logs stream to server)'
        : 'Debug logging OFF — reloading',
    );

    // Delay so the toast is visible, then reload so useEruda picks up the change.
    setTimeout(() => window.location.reload(), 500);
  }, []);
}
