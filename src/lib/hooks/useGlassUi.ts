import { useEffect, useSyncExternalStore } from 'react';
import { GLASS_UI_DEFAULT, getFeatureFlags, setFeatureFlags } from '@/lib/config/features';

const EVENT = 'aidj:glass-ui';

/** Turn the glass design on or off for this device (menu switch, ?glass=). */
export function setGlassUi(enabled: boolean): boolean {
  try {
    setFeatureFlags({ glassUi: { enabled } });
  } catch {
    return false; // storage blocked
  }
  window.dispatchEvent(new Event(EVENT));
  return true;
}

// One read per change, not per render: twenty-odd components ask on every render.
let cached: boolean | null = null;
function readEnabled(): boolean {
  if (cached == null) {
    try {
      cached = getFeatureFlags().glassUi.enabled;
    } catch {
      cached = GLASS_UI_DEFAULT;
    }
  }
  return cached;
}
function subscribe(onChange: () => void) {
  const changed = () => {
    cached = null;
    onChange();
  };
  window.addEventListener(EVENT, changed);
  window.addEventListener('storage', changed);
  return () => {
    window.removeEventListener(EVENT, changed);
    window.removeEventListener('storage', changed);
  };
}

/**
 * Whether the glass design is on for this device. It's the default; a device that switched it
 * off keeps classic.
 *
 * The server and the hydrating client both render the default (the flag lives in localStorage), so
 * hydration always matches and only a device that chose classic swaps once, after hydrating. After
 * that it's read synchronously, so a page opened in the app renders the right layout straight away.
 * `?glass=1` / `?glass=0` on any URL turns it on or off and is remembered.
 */
export function useGlassUi(): boolean {
  useEffect(() => {
    try {
      const param = new URLSearchParams(window.location.search).get('glass');
      if (param === '1' || param === '0') setGlassUi(param === '1');
    } catch {
      // Storage blocked: fall back to the default.
    }
  }, []);
  return useSyncExternalStore(subscribe, readEnabled, () => GLASS_UI_DEFAULT);
}
