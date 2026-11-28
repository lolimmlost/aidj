import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db', () => ({ db: {} }));

import { isRejected, rejectionsFromRows } from '../recommendation-rejections';

describe('rejectionsFromRows', () => {
  // Juan's 2026-11-27: Arcade Fire skipped twice (Owl, Ocean of Noise), never finished.
  const r = rejectionsFromRows(
    [{ songId: 'ocean-of-noise' }, { songId: null }],
    [
      { artist: 'Arcade Fire', skips: 2, completes: 0 },
      { artist: 'Westend', skips: 1, completes: 4 }, // one quick skip of a favourite
      { artist: 'Prospa', skips: 2, completes: 3 }, // skipped twice but finished more
      { artist: 'MGMT', skips: 1, completes: 0 }, // one skip isn't a pattern yet
    ],
  );

  it('keeps out thumbed-down songs and artists skipped more than finished', () => {
    expect([...r.songIds]).toEqual(['ocean-of-noise']);
    expect([...r.artists]).toEqual(['arcade fire']);
  });

  it('matches songs by id or artist, case-insensitively', () => {
    expect(isRejected({ id: 'owl', artist: 'ARCADE FIRE' }, r)).toBe(true);
    expect(isRejected({ id: 'ocean-of-noise', artist: 'Someone' }, r)).toBe(true);
    expect(isRejected({ id: 'feels-better', artist: 'Westend' }, r)).toBe(false);
    expect(isRejected({ id: 'baby', artist: 'Prospa' }, r)).toBe(false);
  });
});
