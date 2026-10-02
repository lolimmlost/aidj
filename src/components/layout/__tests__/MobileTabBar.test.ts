import { describe, expect, it } from 'vitest';
import { getActiveTab, measureViewportBottomGap } from '../MobileTabBar';

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

describe('measureViewportBottomGap', () => {
  const make = (o: { standalone: boolean; innerWidth: number; innerHeight: number; screen: [number, number] }) => ({
    innerWidth: o.innerWidth,
    innerHeight: o.innerHeight,
    screen: { width: o.screen[0], height: o.screen[1] } as Screen,
    matchMedia: (() => ({ matches: o.standalone })) as unknown as Window['matchMedia'],
    navigator: {},
  });

  it('is 0 in a normal browser tab (toolbars are not a gap)', () => {
    expect(measureViewportBottomGap(make({ standalone: false, innerWidth: 414, innerHeight: 715, screen: [414, 896] }))).toBe(0);
  });

  it('is 0 when the standalone viewport fills the screen', () => {
    expect(measureViewportBottomGap(make({ standalone: true, innerWidth: 414, innerHeight: 896, screen: [414, 896] }))).toBe(0);
  });

  it('reports the shortfall when the standalone viewport stops short (iOS status-bar bug)', () => {
    expect(measureViewportBottomGap(make({ standalone: true, innerWidth: 414, innerHeight: 848, screen: [414, 896] }))).toBe(48);
  });

  it('uses the short screen side in landscape', () => {
    expect(measureViewportBottomGap(make({ standalone: true, innerWidth: 896, innerHeight: 414, screen: [414, 896] }))).toBe(0);
  });
});
