import { describe, it, expect } from 'vitest';
import {
  DELETED_FROM_NAVIDROME_PREFIX,
  hasDeletedFromNavidromeMarker,
  stripDeletedMarker,
} from '../playlist-deleted-marker';

describe('playlist-deleted-marker', () => {
  describe('hasDeletedFromNavidromeMarker', () => {
    it('detects a soft-deleted description', () => {
      expect(hasDeletedFromNavidromeMarker(`${DELETED_FROM_NAVIDROME_PREFIX} my list`)).toBe(true);
      expect(hasDeletedFromNavidromeMarker(`${DELETED_FROM_NAVIDROME_PREFIX} `)).toBe(true);
      expect(hasDeletedFromNavidromeMarker(DELETED_FROM_NAVIDROME_PREFIX)).toBe(true);
    });

    it('is false for a normal / empty description', () => {
      expect(hasDeletedFromNavidromeMarker('road trip mix')).toBe(false);
      expect(hasDeletedFromNavidromeMarker('')).toBe(false);
      expect(hasDeletedFromNavidromeMarker(null)).toBe(false);
      expect(hasDeletedFromNavidromeMarker(undefined)).toBe(false);
    });

    it('only matches the marker as a prefix, not mid-string', () => {
      expect(hasDeletedFromNavidromeMarker(`note: ${DELETED_FROM_NAVIDROME_PREFIX}`)).toBe(false);
    });
  });

  describe('stripDeletedMarker', () => {
    it('removes the prefix and surrounding space', () => {
      expect(stripDeletedMarker(`${DELETED_FROM_NAVIDROME_PREFIX} road trip`)).toBe('road trip');
    });

    it('returns null when only the marker remains', () => {
      expect(stripDeletedMarker(`${DELETED_FROM_NAVIDROME_PREFIX} `)).toBeNull();
      expect(stripDeletedMarker(DELETED_FROM_NAVIDROME_PREFIX)).toBeNull();
    });

    it('leaves an unmarked description untouched', () => {
      expect(stripDeletedMarker('road trip')).toBe('road trip');
      expect(stripDeletedMarker(null)).toBeNull();
    });

    it('round-trips with the sync soft-delete write shape', () => {
      // Mirrors playlist-sync.ts: `${PREFIX} ${existing || ''}`
      const original = 'chill evening';
      const marked = `${DELETED_FROM_NAVIDROME_PREFIX} ${original}`;
      expect(hasDeletedFromNavidromeMarker(marked)).toBe(true);
      expect(stripDeletedMarker(marked)).toBe(original);
    });
  });
});
