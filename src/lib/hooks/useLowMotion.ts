import { useEffect, useState } from 'react';

const KEY = 'aidj:low-motion';
const EVENT = 'aidj:low-motion';

/** This device's choice: 'on' / 'off', or null to follow the system's Reduce Motion. */
function readPref(): 'on' | 'off' | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'on' || v === 'off' ? v : null;
  } catch {
    return null;
  }
}

const systemReduce = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function isLow(): boolean {
  const pref = readPref();
  return pref ? pref === 'on' : systemReduce();
}

/** html[data-low-motion] lets plain CSS (the queue's rainbow and ● pulse) stand still too. */
function applyAttr(low: boolean) {
  if (typeof document === 'undefined') return;
  if (low) document.documentElement.dataset.lowMotion = '';
  else delete document.documentElement.dataset.lowMotion;
}

export function setLowMotion(low: boolean) {
  try {
    localStorage.setItem(KEY, low ? 'on' : 'off');
  } catch {
    // storage blocked: still applies for this page
  }
  applyAttr(low);
  window.dispatchEvent(new Event(EVENT));
}

/**
 * Low motion: the player's spinning record and beat pump (and the queue's beat animations) stand still.
 * Follows the system's Reduce Motion until you flip the toggle in the full player. False on the server
 * and the first render, read after mount so hydration matches.
 */
export function useLowMotion(): boolean {
  const [low, setLow] = useState(false);
  useEffect(() => {
    const read = () => {
      const v = isLow();
      applyAttr(v);
      setLow(v);
    };
    read();
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    window.addEventListener(EVENT, read);
    mq?.addEventListener?.('change', read);
    return () => {
      window.removeEventListener(EVENT, read);
      mq?.removeEventListener?.('change', read);
    };
  }, []);
  return low;
}
