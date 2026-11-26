import { useEffect, useState } from 'react';
import { getFeatureFlags, setFeatureFlags } from '@/lib/config/features';

const EVENT = 'aidj:glass-ui';

/** Turn the glass UI prototype on or off for this device (menu switch, ?glass=). */
export function setGlassUi(enabled: boolean): boolean {
  try {
    setFeatureFlags({ glassUi: { enabled } });
  } catch {
    return false; // storage blocked
  }
  window.dispatchEvent(new Event(EVENT));
  return true;
}

/**
 * Whether the glass UI prototype is on for this device.
 *
 * Off on the server and on the first client render (the flag lives in
 * localStorage), then read after mount, so hydration always matches.
 * `?glass=1` / `?glass=0` on any URL turns it on or off and is remembered.
 */
export function useGlassUi(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    try {
      const param = new URLSearchParams(window.location.search).get('glass');
      if (param === '1' || param === '0') setGlassUi(param === '1');
    } catch {
      // Storage blocked: fall back to the default.
    }
    const read = () => setEnabled(getFeatureFlags().glassUi.enabled);
    read();
    window.addEventListener(EVENT, read);
    return () => window.removeEventListener(EVENT, read);
  }, []);

  return enabled;
}
