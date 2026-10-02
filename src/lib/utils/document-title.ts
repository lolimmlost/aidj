/**
 * Browser-tab titles (#287). Every route used to share the root `title: "AIDJ"`,
 * so tabs, history entries and screen-reader route announcements were all
 * indistinguishable.
 */
import type { Song } from '@/lib/types/song';

export const APP_NAME = 'AIDJ';

// First match wins, so more specific paths come before their parents.
const ROUTE_TITLES: ReadonlyArray<[RegExp, string]> = [
  [/^\/dashboard\/?$/, 'Home'],
  [/^\/dashboard\/discovery-analytics/, 'Discovery Analytics'],
  [/^\/dashboard\/discover/, 'Discover'],
  [/^\/dashboard\/analytics/, 'Analytics'],
  [/^\/dashboard\/history/, 'History'],
  [/^\/dashboard\/generate/, 'Generate Playlist'],
  [/^\/dashboard\/library-growth/, 'Library Growth'],
  [/^\/dashboard\/mood-timeline/, 'Mood Timeline'],
  [/^\/dashboard\/recommendations/, 'Recommendation'],
  [/^\/library\/artists\/[^/]+\/albums\/[^/]+/, 'Album'],
  [/^\/library\/artists\/[^/]+/, 'Artist'],
  [/^\/library\/artists/, 'Artists'],
  [/^\/library\/search/, 'Search'],
  [/^\/playlists\/join/, 'Join Playlist'],
  [/^\/playlists\/liked-songs/, 'Liked Songs'],
  [/^\/playlists\/[^/]+/, 'Playlist'],
  [/^\/playlists/, 'Playlists'],
  [/^\/dj\/set-builder/, 'Set Builder'],
  [/^\/dj\/settings/, 'DJ Settings'],
  [/^\/dj/, 'DJ'],
  [/^\/downloads\/history/, 'Download History'],
  [/^\/downloads\/status/, 'Download Status'],
  [/^\/downloads\/youtube/, 'YouTube Downloads'],
  [/^\/downloads/, 'Downloads'],
  [/^\/music-identity\/share/, 'Shared Music Identity'],
  [/^\/music-identity/, 'Music Identity'],
  [/^\/settings\/?$/, 'Settings'],
  [/^\/settings\/album-art/, 'Album Art · Settings'],
  [/^\/settings\/notifications/, 'Notifications · Settings'],
  [/^\/settings\/playback/, 'Playback · Settings'],
  [/^\/settings\/profile/, 'Profile · Settings'],
  [/^\/settings\/recommendations/, 'Recommendations · Settings'],
  [/^\/settings\/security/, 'Security · Settings'],
  [/^\/settings\/services/, 'Services · Settings'],
  [/^\/settings\/layout/, 'Layout · Settings'],
  [/^\/settings/, 'Settings'],
  [/^\/admin/, 'Admin'],
  [/^\/tasks/, 'Tasks'],
  [/^\/login/, 'Sign in'],
  [/^\/signup/, 'Sign up'],
  [/^\/forgot-password/, 'Forgot password'],
  [/^\/reset-password/, 'Reset password'],
  [/^\/invite/, 'Invite'],
];

/** Page label for a pathname, or null for the landing page / unknown routes. */
export function getRouteTitle(pathname: string): string | null {
  for (const [pattern, title] of ROUTE_TITLES) {
    if (pattern.test(pathname)) return title;
  }
  return null;
}

/**
 * Full document title. While a song is playing the tab shows the track (the
 * Spotify convention); otherwise "<Page> · AIDJ".
 */
export function buildDocumentTitle(
  pathname: string,
  nowPlaying?: Pick<Song, 'name' | 'title' | 'artist'> | null,
  /** Page-supplied name (playlist / artist / album) that beats the route label. */
  pageTitle?: string | null,
): string {
  if (nowPlaying) {
    const track = nowPlaying.title || nowPlaying.name;
    if (track) {
      return nowPlaying.artist ? `▶ ${track} · ${nowPlaying.artist}` : `▶ ${track}`;
    }
  }
  const page = pageTitle?.trim() || getRouteTitle(pathname);
  return page ? `${page} · ${APP_NAME}` : APP_NAME;
}
