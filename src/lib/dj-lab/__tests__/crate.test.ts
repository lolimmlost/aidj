import { describe, expect, it } from 'vitest';
import { genreFamily, OTHER_GENRE, type LabSong } from '../crate';

const song = (genre?: string, genres?: string[]): LabSong => ({ id: 'x', title: 't', artist: 'a', duration: 300, genre, genres });

describe('genreFamily', () => {
  it('maps fine-grained tags to a family', () => {
    expect(genreFamily(song(undefined, ['Tech House', 'Electronic']))).toBe('House & techno');
    expect(genreFamily(song(undefined, ['Dance', 'House', 'Edm']))).toBe('House & techno');
    expect(genreFamily(song(undefined, ['Trap', 'Cloud Rap']))).toBe('Hip hop');
    expect(genreFamily(song(undefined, ['Drum And Bass']))).toBe('Bass & EDM');
    expect(genreFamily(song(undefined, ['Boogie', 'Contemporary R&B', 'Electro-Funk']))).toBe('Soul, funk & R&B');
    expect(genreFamily(song('Electronic'))).toBe('Electronic');
  });

  it('reads Last.fm and Beatport spellings', () => {
    expect(genreFamily(song(undefined, ['india', 'hip-hop']))).toBe('Hip hop');
    expect(genreFamily(song('phonk'))).toBe('Hip hop');
    expect(genreFamily(song('Mainstage'))).toBe('Bass & EDM');
    expect(genreFamily(song('Hard Dance / Hardcore / Neo Rave'))).toBe('Bass & EDM');
    expect(genreFamily(song('Indie Dance'))).toBe('House & techno');
    expect(genreFamily(song('Trap / Future Bass'))).toBe('Bass & EDM');
    expect(genreFamily(song('Hardcore Punk'))).toBe('Rock & indie');
    expect(genreFamily(song('Darkwave'))).toBe('Rock & indie');
    expect(genreFamily(song('Synthwave'))).toBe('Electronic');
  });

  it('skips tags that are not genres, then falls back to Other', () => {
    expect(genreFamily(song(undefined, ['Music', 'Indie Rock']))).toBe('Rock & indie');
    expect(genreFamily(song('People & Blogs'))).toBe(OTHER_GENRE);
    expect(genreFamily(song())).toBe(OTHER_GENRE);
  });
});
