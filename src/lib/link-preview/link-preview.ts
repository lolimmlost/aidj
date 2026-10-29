/**
 * Link previews (#361): what a shared AIDJ link unfurls as in iMessage, Discord and Slack.
 *
 * Protected pages bounce logged-out visitors (preview bots included) to `/login?redirect=<path>`
 * (#341), so the login page's head describes the item at `<path>` instead of the generic AIDJ card.
 * Only albums and artists: a name and a cover, never anything user-scoped (playlists, history).
 */

export type PreviewTarget = { kind: 'album'; id: string } | { kind: 'artist'; id: string };

export interface LinkPreview {
  title: string;
  description: string;
  /** Absolute URL of the cover (served by /api/og/cover/$id) */
  image?: string;
  /** Absolute URL of the shared page */
  url: string;
  type: 'music.album' | 'profile';
}

const ID = '[A-Za-z0-9]{1,64}';
const ALBUM_PATH = new RegExp(`^/library/artists/${ID}/albums/(${ID})/?$`);
const ARTIST_PATH = new RegExp(`^/library/artists/(${ID})/?$`);
/** Navidrome cover art ids: al-/ar-/mf- + id, optionally _<updated-at hex> */
export const COVER_ART_ID = /^(al|ar|mf)-[A-Za-z0-9]{1,64}(_[0-9a-f]{1,16})?$/;

/** The item a `?redirect=` path points at, or null for anything without a public preview. */
export function parsePreviewTarget(path?: string | null): PreviewTarget | null {
  if (!path || !path.startsWith('/') || path.startsWith('//')) return null;
  const pathname = path.split(/[?#]/)[0];
  const album = ALBUM_PATH.exec(pathname);
  if (album) return { kind: 'album', id: album[1] };
  const artist = ARTIST_PATH.exec(pathname);
  if (artist) return { kind: 'artist', id: artist[1] };
  return null;
}

/** "37 min", "1 h 25 min" */
export function formatPreviewDuration(seconds?: number): string | null {
  if (!seconds || seconds < 60) return null;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 60)} h`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** A mix title without the album prefix ("BOO Seattle 26 — Stage Climb") or a trailing "(…)" note. */
function shortMixTitle(title: string): string {
  return title.replace(/^.*?\s[—–]\s/, '').replace(/\s*\([^)]*\)\s*$/, '').trim();
}

export interface PreviewAlbum {
  name: string;
  artist?: string;
  year?: number;
  genre?: string;
  songCount?: number;
  duration?: number;
  songTitles?: string[];
}

/**
 * "Album by Disclosure · 2013 · 14 tracks · 1 h 4 min"
 * DJ mix albums also name their mixes: "DJ mixes by AIDJ · 2026 · 4 mixes · 1 h 25 min — Stage Climb, Costume Party, …"
 */
export function albumDescription(a: PreviewAlbum): string {
  const isMix = a.genre === 'DJ Mix';
  const parts = [
    a.artist ? `${isMix ? 'DJ mixes' : 'Album'} by ${a.artist}` : isMix ? 'DJ mixes' : 'Album',
    a.year ? String(a.year) : null,
    a.songCount ? plural(a.songCount, isMix ? 'mix' : 'track', isMix ? 'mixes' : 'tracks') : null,
    formatPreviewDuration(a.duration),
  ].filter(Boolean);
  let text = parts.join(' · ');
  if (isMix && a.songTitles?.length) {
    const names = [...new Set(a.songTitles.map(shortMixTitle).filter(Boolean))];
    const shown = names.slice(0, 4).join(', ') + (names.length > 4 ? ', …' : '');
    text += ` — ${shown}`;
  }
  return text;
}

export function artistDescription(albumCount?: number): string {
  return albumCount ? `Artist · ${plural(albumCount, 'album', 'albums')}` : 'Artist';
}

/** Open Graph + Twitter meta for a preview. Route heads override the root's generic tags by name/property. */
export function linkPreviewMeta(p: LinkPreview) {
  const title = p.title === 'AIDJ' ? p.title : `${p.title} · AIDJ`;
  return [
    { property: 'og:title', content: title },
    { property: 'og:description', content: p.description },
    { property: 'og:type', content: p.type },
    { property: 'og:url', content: p.url },
    ...(p.image
      ? [
          { property: 'og:image', content: p.image },
          { property: 'og:image:width', content: '600' },
          { property: 'og:image:height', content: '600' },
          { property: 'og:image:alt', content: `Cover of ${p.title}` },
          { name: 'twitter:image', content: p.image },
        ]
      : []),
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: p.description },
  ];
}
