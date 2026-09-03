/**
 * Duplicate-gate behaviour of `checkDuplicates` against the playlist API.
 *
 * This gate compares for EQUALITY, not for display, so adopting the canonical
 * parser genuinely changed which songs it matches — the reason it was worth
 * exercising against real rows rather than trusting from unit tests. Every
 * `songArtistTitle` below is a verbatim row from prod `playlist_songs` on
 * 2026-09-02.
 *
 * A differential run of the pre-refactor matcher against the post-refactor one
 * over the full corpus (1,176 playlist_songs rows / 691 distinct strings) found
 * 8 distinct divergences, all of them gains: no row that previously matched
 * stopped matching. `scripts/validate-artist-title-corpus.ts` re-runs that
 * differential against live prod on demand; these tests pin the specimens.
 *
 * The exercised path is the playlist branch only — `checkDiscoveryQueue` and
 * `checkAudioQueue` read localStorage and compare `artist`/`title` fields
 * directly, which the refactor did not touch.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkDuplicates } from '../media-flow-manager';

const PLAYLIST_ID = 'pl-1';

/** Stub the one `fetch` that `checkDuplicates` makes for the target playlist. */
function playlistWith(...songArtistTitles: string[]) {
  return vi.fn(async () => ({
    ok: true,
    json: async () => ({
      data: {
        name: 'Test Playlist',
        songs: songArtistTitles.map((songArtistTitle, i) => ({
          id: `row-${i}`,
          songId: `song-${i}`,
          songArtistTitle,
        })),
      },
    }),
  })) as unknown as typeof fetch;
}

function check(artist: string, title: string) {
  return checkDuplicates(artist, title, {
    checkDiscoveryQueue: false,
    checkAudioQueue: false,
    checkPlaylists: true,
    targetPlaylistId: PLAYLIST_ID,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('checkDuplicates — playlist branch', () => {
  it('matches an ordinary stored row', async () => {
    vi.stubGlobal('fetch', playlistWith('Chris Lake - In the Yuma'));
    const result = await check('Chris Lake', 'In the Yuma');
    expect(result).toMatchObject({
      isDuplicate: true,
      location: 'playlist',
      playlistId: PLAYLIST_ID,
    });
  });

  it('is case- and whitespace-insensitive on both sides', async () => {
    vi.stubGlobal('fetch', playlistWith('Chris Lake - In the Yuma'));
    expect((await check('  CHRIS LAKE ', ' in the yuma  ')).isDuplicate).toBe(true);
  });

  // The behaviour change worth having. Before the refactor these rows parsed to
  // title "zvle - 1my", never equalled the query "1MY", and the download went
  // ahead — a duplicate the gate was supposed to stop.
  it.each([
    ['zvle - zvle - 1MY', 'zvle', '1MY'],
    ['kysa - kysa - four', 'kysa', 'four'],
    ['Carter Tomorrow - Carter Tomorrow - Hold Me Close', 'Carter Tomorrow', 'Hold Me Close'],
    ['Conrad. - Conrad. - told you so', 'Conrad.', 'told you so'],
  ])('catches the doubled MeTube row %p that the old matcher missed', async (stored, artist, title) => {
    vi.stubGlobal('fetch', playlistWith(stored));
    expect((await check(artist, title)).isDuplicate).toBe(true);
  });

  it('catches a doubled row under its full collaboration credit', async () => {
    vi.stubGlobal(
      'fetch',
      playlistWith('Wax Motif - Wax Motif & Taiki Nulight - Skank n Flex ft. Scrufizzer')
    );
    expect(
      (await check('Wax Motif & Taiki Nulight', 'Skank n Flex ft. Scrufizzer')).isDuplicate
    ).toBe(true);
  });

  // Guarding the direction that would actually hurt a user: a false positive
  // blocks an add outright, where a false negative only costs a re-download.
  it('does not match a different song by the same artist', async () => {
    vi.stubGlobal('fetch', playlistWith('zvle - zvle - 1MY'));
    expect((await check('zvle', 'some other track')).isDuplicate).toBe(false);
  });

  it('does not match the same title by a different artist', async () => {
    vi.stubGlobal('fetch', playlistWith('zvle - zvle - 1MY'));
    expect((await check('someone else', '1MY')).isDuplicate).toBe(false);
  });

  it('does not let a sub-word prefix collapse two artists together', async () => {
    // "Museum Hours" must not be reachable as a match for artist "Muse" — the
    // word-boundary guard in parseArtistTitle is what keeps these apart.
    vi.stubGlobal('fetch', playlistWith('Muse - Museum Hours - Live'));
    expect((await check('Museum Hours', 'Live')).isDuplicate).toBe(false);
    expect((await check('Muse', 'Museum Hours - Live')).isDuplicate).toBe(true);
  });

  it('reports no duplicate for a row with no usable artist', async () => {
    // Legacy "Unknown - …" rows parse to an empty artist and are skipped rather
    // than matched against a literal artist named Unknown.
    vi.stubGlobal('fetch', playlistWith('Unknown - Divine'));
    expect((await check('Unknown', 'Divine')).isDuplicate).toBe(false);
  });

  it('reports no duplicate for a separator-less row', async () => {
    vi.stubGlobal('fetch', playlistWith('Hank the Dragon'));
    expect((await check('Hank the Dragon', 'Hank the Dragon')).isDuplicate).toBe(false);
  });

  it('survives a failing playlist fetch without reporting a duplicate', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch);
    expect((await check('Chris Lake', 'In the Yuma')).isDuplicate).toBe(false);
  });
});
