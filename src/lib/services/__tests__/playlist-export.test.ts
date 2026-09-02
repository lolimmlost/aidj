import { describe, it, expect } from 'vitest';
import { parsePlaylist, parseCSV, detectCsvSource } from '../playlist-export';

const CHOSIC_CSV = `Title,Artist,Album,Spotify URL
"The Impostor","AiramFM","The Impostor",https://open.spotify.com/track/4giXujhQsXo9f41u7MPIhI
"Нормальная музыка","UBEL","Нормальная музыка",https://open.spotify.com/track/5q6mJIesSR9mEzOeDFRGdt
"rumination","Study Sloane","rumination",https://open.spotify.com/track/0gPWRUedBRHCch1mmKSkPs`;

const EXPORTIFY_CSV = `Track URI,Track Name,Album Name,Artist Name(s),Release Date,Duration (ms),Popularity,Explicit,Added By,Added At,Genres,Record Label,Danceability,Energy,Key,Loudness,Mode,Speechiness,Acousticness,Instrumentalness,Liveness,Valence,Tempo,Time Signature
spotify:track:5IlRYF58hRv5E0D2fykZXX,"August Dub","August Dub","Sharam",2015-09-18,219047,0,false,juenr,2026-07-13T05:39:30Z,"","Spinnin' Remixes",0.668,0.759,3,-6.61,1,0.0341,0.0518,0.894,0.1,0.672,125.97,4`;

describe('detectCsvSource', () => {
  it('recognizes the Chosic minimal header', () => {
    expect(detectCsvSource(['title', 'artist', 'album', 'spotify url'])).toBe('chosic');
  });

  it('recognizes the Exportify header', () => {
    expect(detectCsvSource(['track uri', 'track name', 'album name', 'artist name(s)'])).toBe('spotify_exportify');
  });
});

describe('parsePlaylist auto-detection with a Chosic export', () => {
  it('detects CSV format without an explicit format hint', () => {
    // Chosic's header has no "track" substring anywhere, which previously
    // caused looksLikeCSV() to reject it and throw IMPORT_FORMAT_ERROR.
    const result = parsePlaylist(CHOSIC_CSV);
    expect(result.format).toBe('csv');
    expect(result.playlist.songs).toHaveLength(3);
  });
});

describe('parseCSV', () => {
  it('parses Chosic playlist export rows (Title,Artist,Album,Spotify URL)', () => {
    const result = parseCSV(CHOSIC_CSV);

    expect(result.playlist.songs).toHaveLength(3);
    expect(result.playlist.description).toContain('Chosic');

    const [first] = result.playlist.songs;
    expect(first.title).toBe('The Impostor');
    expect(first.artist).toBe('AiramFM');
    expect(first.album).toBe('The Impostor');
    expect(first.platform).toBe('spotify');
    expect(first.platformId).toBe('4giXujhQsXo9f41u7MPIhI');
    expect(first.url).toBe('https://open.spotify.com/track/4giXujhQsXo9f41u7MPIhI');
  });

  it('still labels Exportify CSVs as Spotify', () => {
    const result = parseCSV(EXPORTIFY_CSV);
    expect(result.playlist.description).toContain('Spotify');
    expect(result.playlist.songs[0].platformId).toBe('5IlRYF58hRv5E0D2fykZXX');
  });
});
