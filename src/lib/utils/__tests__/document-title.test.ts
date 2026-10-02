import { describe, expect, it } from 'vitest';
import { buildDocumentTitle, getRouteTitle } from '../document-title';

describe('getRouteTitle', () => {
  it.each([
    ['/dashboard', 'Home'],
    ['/dashboard/', 'Home'],
    ['/dashboard/discover', 'Discover'],
    ['/dashboard/discovery-analytics', 'Discovery Analytics'],
    ['/dashboard/analytics', 'Analytics'],
    ['/library/artists', 'Artists'],
    ['/library/artists/ar1', 'Artist'],
    ['/library/artists/ar1/albums/al1', 'Album'],
    ['/playlists', 'Playlists'],
    ['/playlists/pl1', 'Playlist'],
    ['/playlists/join/abc', 'Join Playlist'],
    ['/playlists/liked-songs', 'Liked Songs'],
    ['/settings', 'Settings'],
    ['/settings/playback', 'Playback · Settings'],
    ['/tasks', 'Tasks'],
  ])('%s → %s', (path, title) => {
    expect(getRouteTitle(path)).toBe(title);
  });

  it('returns null for the landing page and unknown routes', () => {
    expect(getRouteTitle('/')).toBeNull();
    expect(getRouteTitle('/nope')).toBeNull();
  });
});

describe('buildDocumentTitle', () => {
  it('uses "<Page> · AIDJ" when nothing is playing', () => {
    expect(buildDocumentTitle('/playlists')).toBe('Playlists · AIDJ');
    expect(buildDocumentTitle('/', null)).toBe('AIDJ');
  });

  it('shows the playing track and artist', () => {
    expect(buildDocumentTitle('/playlists', { name: 'Song', artist: 'Band' })).toBe('▶ Song · Band');
  });

  it('prefers title over name and tolerates a missing artist', () => {
    expect(buildDocumentTitle('/x', { name: 'file-name', title: 'Real Title' })).toBe('▶ Real Title');
  });

  it('prefers a page-supplied name over the route label', () => {
    expect(buildDocumentTitle('/playlists/p1', null, 'Road Trip')).toBe('Road Trip · AIDJ');
    expect(buildDocumentTitle('/playlists/p1', null, '  ')).toBe('Playlist · AIDJ');
  });

  it('still shows the playing track over a page name', () => {
    expect(buildDocumentTitle('/playlists/p1', { name: 'Song', artist: 'Band' }, 'Road Trip')).toBe('▶ Song · Band');
  });

  it('falls back to the page title when the track has no name', () => {
    expect(buildDocumentTitle('/tasks', { name: '' })).toBe('Tasks · AIDJ');
  });
});
