import { useSyncExternalStore } from 'react';

/** Phone widths: below Tailwind's md, where the glass design swaps dialogs for bottom sheets. */
const PHONE_QUERY = '(max-width: 767px)';

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

/** True on phone widths (the glass UI's max-md), tracked live. False on the server. */
export function useIsPhone(): boolean {
  return usePhoneWidth() ?? false;
}

/**
 * Like useIsPhone, but undefined on the server and while hydrating, when the width isn't known
 * yet. For a page that renders both its phone and wider layouts (CSS picks one) until then, and
 * only the one that fits after.
 */
export function usePhoneWidth(): boolean | undefined {
  return useSyncExternalStore(subscribe, () => window.matchMedia(PHONE_QUERY).matches, () => undefined);
}
