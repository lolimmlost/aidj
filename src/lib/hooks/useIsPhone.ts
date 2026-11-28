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
  return useSyncExternalStore(subscribe, () => window.matchMedia(PHONE_QUERY).matches, () => false);
}
