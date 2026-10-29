import { describe, it, expect } from 'vitest';
import {
  parsePreviewTarget,
  formatPreviewDuration,
  albumDescription,
  artistDescription,
  linkPreviewMeta,
  COVER_ART_ID,
} from '../link-preview';

describe('parsePreviewTarget', () => {
  it('reads album and artist links', () => {
    expect(parsePreviewTarget('/library/artists/6nfzwEMwetgIvSFi0bqnMc/albums/67Zt7ajVobO7wFRvWGriMA')).toEqual({
      kind: 'album',
      id: '67Zt7ajVobO7wFRvWGriMA',
    });
    expect(parsePreviewTarget('/library/artists/6nfzwEMwetgIvSFi0bqnMc')).toEqual({ kind: 'artist', id: '6nfzwEMwetgIvSFi0bqnMc' });
  });

  it('ignores the query string, hash and a trailing slash', () => {
    expect(parsePreviewTarget('/library/artists/a1/albums/b2/?play=1#x')).toEqual({ kind: 'album', id: 'b2' });
  });

  it('has no preview for private or unknown pages', () => {
    for (const path of ['/playlists/123', '/dashboard', '/library/artists', '/library/artists/a1/albums', '/', '']) {
      expect(parsePreviewTarget(path)).toBeNull();
    }
    expect(parsePreviewTarget(undefined)).toBeNull();
  });

  it('rejects absolute, protocol-relative and traversal paths', () => {
    expect(parsePreviewTarget('https://evil.example/library/artists/a1')).toBeNull();
    expect(parsePreviewTarget('//evil.example/library/artists/a1')).toBeNull();
    expect(parsePreviewTarget('/library/artists/../admin')).toBeNull();
    expect(parsePreviewTarget('/library/artists/a1/albums/b2%2F..')).toBeNull();
  });
});

describe('formatPreviewDuration', () => {
  it('formats minutes and hours', () => {
    expect(formatPreviewDuration(37 * 60 + 20)).toBe('37 min');
    expect(formatPreviewDuration(85 * 60 + 6)).toBe('1 h 25 min');
    expect(formatPreviewDuration(120 * 60)).toBe('2 h');
    expect(formatPreviewDuration(0)).toBeNull();
    expect(formatPreviewDuration(undefined)).toBeNull();
  });
});

describe('albumDescription', () => {
  it('describes a regular album', () => {
    expect(albumDescription({ name: 'Settle', artist: 'Disclosure', year: 2013, songCount: 14, duration: 3840 })).toBe(
      'Album by Disclosure · 2013 · 14 tracks · 1 h 4 min',
    );
  });

  it('names the mixes of a DJ mix album, without the album prefix or version notes', () => {
    expect(
      albumDescription({
        name: 'BOO Seattle 2026',
        artist: 'AIDJ',
        year: 2026,
        genre: 'DJ Mix',
        songCount: 4,
        duration: 5106,
        songTitles: [
          'BOO Seattle 26 — Stage Climb',
          'BOO Seattle 26 — Costume Party',
          'BOO Seattle 26 — Graveyard Shift',
          'BOO Seattle 26 — Witching Hour',
        ],
      }),
    ).toBe('DJ mixes by AIDJ · 2026 · 4 mixes · 1 h 25 min — Stage Climb, Costume Party, Graveyard Shift, Witching Hour');
  });

  it('lists at most four mixes and drops duplicate versions', () => {
    const text = albumDescription({
      name: 'Tacoma Bike Party',
      genre: 'DJ Mix',
      songCount: 6,
      songTitles: ['Ride Set v1 (original mix)', 'Ride Set v2 (original mix)', 'Five-Star House Set 2 (pre-bar-fix)', 'Five-Star House Set 2 (energy test, rejected)', 'Jungle Set 1', 'Trance Set 1'],
    });
    expect(text).toBe('DJ mixes · 6 mixes — Ride Set v1, Ride Set v2, Five-Star House Set 2, Jungle Set 1, …');
  });

  it('uses the singular for one track', () => {
    expect(albumDescription({ name: 'Single', artist: 'X', songCount: 1 })).toBe('Album by X · 1 track');
  });
});

describe('artistDescription', () => {
  it('counts albums', () => {
    expect(artistDescription(12)).toBe('Artist · 12 albums');
    expect(artistDescription(1)).toBe('Artist · 1 album');
    expect(artistDescription(undefined)).toBe('Artist');
  });
});

describe('linkPreviewMeta', () => {
  const preview = {
    title: 'BOO Seattle 2026',
    description: 'DJ mixes by AIDJ · 2026',
    image: 'https://aidj.example/api/og/cover/al-67Zt7ajVobO7wFRvWGriMA_6ae2a963',
    url: 'https://aidj.example/library/artists/a/albums/67Zt7ajVobO7wFRvWGriMA',
    type: 'music.album' as const,
  };
  const value = (meta: ReturnType<typeof linkPreviewMeta>, key: string) =>
    meta.find((m) => ('property' in m ? m.property : m.name) === key)?.content;

  it('sets Open Graph and Twitter tags with the cover', () => {
    const meta = linkPreviewMeta(preview);
    expect(value(meta, 'og:title')).toBe('BOO Seattle 2026 · AIDJ');
    expect(value(meta, 'og:description')).toBe('DJ mixes by AIDJ · 2026');
    expect(value(meta, 'og:type')).toBe('music.album');
    expect(value(meta, 'og:url')).toBe(preview.url);
    expect(value(meta, 'og:image')).toBe(preview.image);
    expect(value(meta, 'twitter:image')).toBe(preview.image);
    expect(value(meta, 'twitter:title')).toBe('BOO Seattle 2026 · AIDJ');
  });

  it("doesn't repeat the site name for the AIDJ artist", () => {
    expect(value(linkPreviewMeta({ ...preview, title: 'AIDJ' }), 'og:title')).toBe('AIDJ');
  });

  it('leaves the default image in place when the item has no cover', () => {
    const meta = linkPreviewMeta({ ...preview, image: undefined });
    expect(value(meta, 'og:image')).toBeUndefined();
    expect(value(meta, 'og:image:width')).toBeUndefined();
  });
});

describe('COVER_ART_ID', () => {
  it('accepts Navidrome cover ids only', () => {
    for (const id of ['al-67Zt7ajVobO7wFRvWGriMA_6ae2a963', 'ar-6nfzwEMwetgIvSFi0bqnMc', 'mf-L5jsIP71fq5y556dZl132c_0']) {
      expect(COVER_ART_ID.test(id)).toBe(true);
    }
    for (const id of ['pl-abc', '../etc/passwd', 'al-', 'al-abc?x=1', 'al-abc_zz', '']) {
      expect(COVER_ART_ID.test(id)).toBe(false);
    }
  });
});
