import { describe, expect, it } from 'vitest';
import { getActiveTab } from '../MobileTabBar';

describe('getActiveTab', () => {
  it.each([
    ['/dashboard', 'home'],
    ['/dashboard/discover', 'home'],
    ['/library/search', 'search'],
    ['/library/artists/a1/albums/b2', 'library'],
    ['/playlists', 'library'],
    ['/playlists/p1', 'library'],
    ['/downloads/status', 'library'],
    ['/dj', 'dj'],
    ['/dj/set-builder', 'dj'],
  ])('%s → %s', (path, tab) => {
    expect(getActiveTab(path)).toBe(tab);
  });

  it('returns null outside the four roots', () => {
    expect(getActiveTab('/settings')).toBeNull();
    expect(getActiveTab('/music-identity')).toBeNull();
  });
});
