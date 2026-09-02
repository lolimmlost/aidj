/**
 * Tests for the YouTube per-song fallback (issue #145) pure helpers:
 * query normalization, the yt-dlp search URL, and download verification.
 * No network / MeTube interaction is exercised here.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  normalizeSearchQuery,
  buildYouTubeSearchUrl,
  verifyDownload,
  itemLikelyMatchesTrack,
  libraryMatch,
  qualifierAmbiguity,
  startYouTubeFallbackJob,
  getYouTubeFallbackJob,
  summarizeJob,
} from '../youtube-fallback';

// The batch-runner tests below drive real MeTube interaction, so stub the client.
vi.mock('../metube', () => ({
  getQueue: vi.fn(),
  addDownload: vi.fn().mockResolvedValue({ status: 'ok' }),
  deleteDownloads: vi.fn().mockResolvedValue({ status: 'ok' }),
}));
import * as metube from '../metube';

// findInLibrary dynamic-imports the Navidrome service; only `search` is used.
vi.mock('../navidrome', () => ({ search: vi.fn().mockResolvedValue([]) }));
import * as navidrome from '../navidrome';

describe('normalizeSearchQuery', () => {
  it('uses the primary artist and drops collaborators', () => {
    const q = normalizeSearchQuery({ artist: 'Flume;SOPHIE;Eprom', title: 'Spring' });
    expect(q).toBe('Flume Spring');
  });

  it('strips feat./with qualifiers from the title', () => {
    const q = normalizeSearchQuery({ artist: 'matt proxy', title: '5 (with fakemink)' });
    expect(q).toBe('matt proxy 5');
  });

  it('strips remaster tags', () => {
    const q = normalizeSearchQuery({ artist: 'Some Artist', title: 'A Song (2011 Remaster)' });
    expect(q).toBe('Some Artist A Song');
  });

  it('collapses whitespace and trims', () => {
    const q = normalizeSearchQuery({ artist: '  Sun Room ', title: '  Insincere  ' });
    expect(q).toBe('Sun Room Insincere');
  });
});

describe('buildYouTubeSearchUrl', () => {
  it('produces a yt-dlp ytsearch1 pseudo-URL', () => {
    expect(buildYouTubeSearchUrl('Sun Room Insincere')).toBe('ytsearch1:Sun Room Insincere');
  });
});

describe('verifyDownload', () => {
  const track = { artist: 'Sun Room', title: 'Insincere' };

  it('accepts a clean official-video match', () => {
    const v = verifyDownload(track, { title: 'Sun Room - Insincere (Official Video)' });
    expect(v.matched).toBe(true);
    expect(v.score).toBeGreaterThanOrEqual(0.6);
  });

  it('accepts a title-only match when artist is present elsewhere', () => {
    const v = verifyDownload(track, { title: 'Insincere by Sun Room' });
    expect(v.matched).toBe(true);
  });

  it('rejects an unrelated video', () => {
    const v = verifyDownload(track, { title: 'Top 50 Summer House Mix 2024' });
    expect(v.matched).toBe(false);
  });

  it('flags a wrong-title result from the same artist', () => {
    const v = verifyDownload(track, { title: 'Sun Room - Cadillac (Live)' });
    expect(v.matched).toBe(false);
  });

  it('rejects a same-title result by the WRONG artist (Phil Collins regression)', () => {
    // Real #145 miss: "Phil Odd - ur lovin" ytsearch1-resolved to Phil Collins,
    // which shares only the "phil" token (artist 50%). A perfect title must not
    // drag that over the line.
    const v = verifyDownload(
      { artist: 'Phil Odd', title: 'ur lovin' },
      { title: "Phil Collins - Some Of Your Lovin' (Official Audio)" }
    );
    expect(v.matched).toBe(false);
  });

  it('accepts a correct download whose title ABBREVIATES a multi-word artist', () => {
    // Real chosic-pass regression: a legitimate top result often carries only part
    // of a stylized multi-word artist ("bad tuner" → "tuner - all my feelings").
    // Field-level containment must treat a dropped word as corroboration, not a
    // mismatch — otherwise ~44% of indie downloads get wrongly flagged.
    const v = verifyDownload(
      { artist: 'bad tuner', title: 'all my feelings' },
      { title: 'tuner - all my feelings' }
    );
    expect(v.matched).toBe(true);
  });

  it('accepts a correct download when a leading artist word is dropped (Cream Soda)', () => {
    const v = verifyDownload(
      { artist: 'CREAM SODA', title: 'VIBY' },
      { title: 'soda - VIBY (Official Video)' }
    );
    expect(v.matched).toBe(true);
  });

  it('still rejects a same-title result whose artist merely OVERLAPS one token', () => {
    // The containment fix must not reopen the Phil Collins hole: "phil odd" vs
    // "phil collins" share a token but neither is a subset of the other.
    const v = verifyDownload(
      { artist: 'Phil Odd', title: 'ur lovin' },
      { title: 'Phil Collins - ur lovin' }
    );
    expect(v.matched).toBe(false);
  });

  it('still rejects a same-title result by a completely different artist', () => {
    const v = verifyDownload(
      { artist: 'Nick Howe', title: 'Touch' },
      { title: 'Little Mix - Touch' }
    );
    expect(v.matched).toBe(false);
  });

  it('falls back to filename when title is missing', () => {
    const v = verifyDownload(track, { filename: 'Sun Room - Insincere.mp3' });
    expect(v.matched).toBe(true);
  });

  it('returns unmatched with no result title', () => {
    const v = verifyDownload(track, {});
    expect(v.matched).toBe(false);
    expect(v.score).toBe(0);
  });

  it('accepts an exact cross-script title match with no artist field at all (#206 regression)', () => {
    // Real #206 miss: "UBEL - Нормальная музыка" resolved to a YouTube upload
    // titled just "Нормальная музыка (Single Version)" — no "Artist - Title"
    // separator, and a Latin artist name can never token-overlap a Cyrillic
    // title. The artist check must not veto a title that matches exactly.
    const v = verifyDownload(
      { artist: 'UBEL', title: 'Нормальная музыка' },
      { title: 'Нормальная музыка (Single Version)' }
    );
    expect(v.matched).toBe(true);
  });

  it('still rejects an unrelated video with no artist field (no free pass on a weak title)', () => {
    const v = verifyDownload(
      { artist: 'UBEL', title: 'Нормальная музыка' },
      { title: 'Совершенно другая песня' }
    );
    expect(v.matched).toBe(false);
  });

  it('requires an EXACT (not just high-overlap) title match when there is no artist field', () => {
    // Partial title overlap with no artist signal at all is too weak to accept —
    // unlike the dash-separated path, there's nothing else corroborating it.
    const v = verifyDownload(
      { artist: 'UBEL', title: 'Нормальная музыка целиком' },
      { title: 'Нормальная музыка' }
    );
    expect(v.matched).toBe(false);
  });

  // The artist-less escape hatch must key off the title being EXACTLY ours — not
  // off the absence of a spaced "-–—:|" separator. YouTube asserts the artist with
  // all sorts of other punctuation, or with none at all, and every one of those is
  // a contradicting artist claim that still has to be checked (#145 regression).
  it.each([
    'Little Mix • Touch',
    'Little Mix / Touch',
    'Little Mix ~ Touch',
    'Little Mix Touch',
    'Little Mix "Touch" (Official Video)',
  ])('rejects a wrong artist asserted without a dash separator: %s', (resolved) => {
    const v = verifyDownload({ artist: 'Nick Howe', title: 'Touch' }, { title: resolved });
    expect(v.matched).toBe(false);
  });

  it('rejects the #145 Phil Collins case when the separator is a bullet, not a dash', () => {
    const v = verifyDownload(
      { artist: 'Phil Odd', title: 'ur lovin' },
      { title: "Phil Collins • Some Of Your Lovin' (Official Audio)" }
    );
    expect(v.matched).toBe(false);
  });

  it('rejects a compilation title that merely CONTAINS the wanted title', () => {
    // `got.includes(wantTitle)` scores 1, so containment is not "exact" — a mix
    // upload would otherwise pass with the artist never checked at all.
    const v = verifyDownload(
      { artist: 'Britney Spears', title: 'Toxic' },
      { title: 'Top 100 Pop Hits Toxic Umbrella Believe' }
    );
    expect(v.matched).toBe(false);
  });

  // The bare-title escape hatch must ALSO require that the artist is unverifiable
  // across scripts, not merely absent from the title. `normalizeForCompare` drops
  // bracketed qualifiers and the words official/music/video/audio/lyrics/hd/4k, so
  // every one of these collapses to exactly "touch" — the most common YouTube
  // title shape there is. Accepting them on the title alone is the #145 hole, and
  // worse than a plain false accept: a `matched` result is KEPT rather than
  // deleted, so the wrong rip lands in the library on the next Picard pass.
  it.each([
    'Touch (Official Video)',
    'Touch - Official Music Video',
    'Touch [Official Audio]',
    'Touch (Lyrics)',
    'Touch',
  ])('rejects a same-script bare title by the wrong artist: %s', (resolved) => {
    const v = verifyDownload({ artist: 'Nick Howe', title: 'Touch' }, { title: resolved });
    expect(v.matched).toBe(false);
  });

  it('still accepts a same-script bare title when the artist IS corroborated', () => {
    // Sanity check that the script gate didn't cost us the ordinary good case:
    // the artist is present in the title, so the strict path passes on its own.
    const v = verifyDownload(
      { artist: 'Little Mix', title: 'Touch' },
      { title: 'Little Mix - Touch (Official Video)' }
    );
    expect(v.matched).toBe(true);
  });

  it('does not take the cross-script hatch when the title mixes in the artist script', () => {
    // A Latin artist name CAN appear in a title that carries Latin tokens, so the
    // artist is verifiable and must actually be verified.
    const v = verifyDownload(
      { artist: 'UBEL', title: 'Нормальная музыка' },
      { title: 'Нормальная музыка feat Someone Else' }
    );
    expect(v.matched).toBe(false);
  });
});

describe('itemLikelyMatchesTrack (detection)', () => {
  // Real cases that the strict id-based detection got wrong: MeTube's resolved
  // title differs from the request but is clearly the same track.
  it('matches a multi-artist request against MeTube’s resolved title', () => {
    expect(
      itemLikelyMatchesTrack(
        { artist: 'Wax Motif;Taiki Nulight;Scrufizzer', title: 'Skank N Flex (with Scrufizzer)' },
        { title: 'Wax Motif & Taiki Nulight - Skank n Flex ft. Scrufizzer' }
      )
    ).toBe(true);
  });

  it('matches "Got Bounce" by primary artist + title tokens', () => {
    expect(
      itemLikelyMatchesTrack(
        { artist: 'Kumarion;STUCA', title: 'Got Bounce' },
        { title: 'Kumarion & STUCA - Got Bounce' }
      )
    ).toBe(true);
  });

  it('does not match an unrelated download in a large history', () => {
    expect(
      itemLikelyMatchesTrack(
        { artist: 'Kumarion', title: 'Got Bounce' },
        { title: 'Some Other Artist - A Totally Different Song' }
      )
    ).toBe(false);
  });

  it('falls back to filename', () => {
    expect(
      itemLikelyMatchesTrack(
        { artist: 'Sun Room', title: 'Insincere' },
        { filename: 'Sun Room - Insincere [Official Audio].mp3' }
      )
    ).toBe(true);
  });

  it('returns false with no title or filename', () => {
    expect(itemLikelyMatchesTrack({ artist: 'A', title: 'B' }, {})).toBe(false);
  });

  it('detects an exact cross-script title match with no artist field (#206 regression)', () => {
    expect(
      itemLikelyMatchesTrack(
        { artist: 'UBEL', title: 'Нормальная музыка' },
        { title: 'Нормальная музыка (Single Version)' }
      )
    ).toBe(true);
  });

  it('does not detect a merely-similar title with no artist field to corroborate', () => {
    expect(
      itemLikelyMatchesTrack(
        { artist: 'UBEL', title: 'Нормальная музыка целиком' },
        { title: 'Нормальная музыка' }
      )
    ).toBe(false);
  });

  // Detection must not take the artist-less shortcut for a title that asserts a
  // (wrong) artist without a dash separator — otherwise a worker claims, and under
  // concurrency steals, another track's item. See the verifyDownload cases above.
  it('does not detect a wrong artist asserted without a dash separator', () => {
    expect(
      itemLikelyMatchesTrack({ artist: 'Nick Howe', title: 'Touch' }, { title: 'Little Mix • Touch' })
    ).toBe(false);
  });

  // Detection takes the same hatch as verification, so it needs the same script
  // gate — otherwise a worker claims another track's item on a bare same-script
  // title, and under concurrency that item is stolen for good.
  it('does not detect a same-script bare title by the wrong artist', () => {
    expect(
      itemLikelyMatchesTrack({ artist: 'Nick Howe', title: 'Touch' }, { title: 'Touch (Official Video)' })
    ).toBe(false);
  });
});

describe('libraryMatch (dedup guard vs Navidrome songs)', () => {
  it('matches a CLEANLY-stored track (artist in a separate field)', () => {
    // The bug case: Navidrome title="Calling You", artist="Valexus" (not in title).
    expect(
      libraryMatch({ artist: 'Valexus', title: 'Calling You' }, { title: 'Calling You', artist: 'Valexus' })
    ).toBe(true);
    expect(
      libraryMatch({ artist: 'Valexus;Beehav3', title: 'Calling You' }, { title: 'Calling You', artist: 'Valexus & Beehav3' })
    ).toBe(true);
  });

  it('matches a JUNK-titled copy (whole video title in the title field)', () => {
    expect(
      libraryMatch(
        { artist: 'Wax Motif;Taiki Nulight;Scrufizzer', title: 'Skank N Flex (with Scrufizzer)' },
        { title: 'Wax Motif & Taiki Nulight - Skank n Flex ft. Scrufizzer', artist: 'Wax Motif' }
      )
    ).toBe(true);
  });

  it('does NOT match a same-title track by a different artist', () => {
    expect(
      libraryMatch({ artist: 'Valexus', title: 'Calling You' }, { title: 'Calling for You', artist: 'Drake' })
    ).toBe(false);
  });

  it('does NOT match an unrelated song', () => {
    expect(
      libraryMatch({ artist: 'Valexus', title: 'Calling You' }, { title: 'When Did Your Heart Go Missing?', artist: 'Rooney' })
    ).toBe(false);
  });

  it('does NOT false-skip a genuinely-missing track sharing a title (eric404 regression)', () => {
    // Real #145 bug: "eric404 - Wasting Time" (no_match, not in library) was
    // SKIPPED as "already in library" because some OTHER "Wasting Time" exists.
    // A same title with a different artist must never count as in-library.
    expect(
      libraryMatch({ artist: 'eric404', title: 'Wasting Time' }, { title: 'Wasting Time', artist: 'Some Other Artist' })
    ).toBe(false);
  });

  it('does NOT skip when the library song has no corroborating artist field', () => {
    expect(
      libraryMatch({ artist: 'eric404', title: 'Wasting Time' }, { title: 'Wasting Time' })
    ).toBe(false);
  });

  it('still dedups a SHORT artist name on an exact artist-field match', () => {
    // Regression: a blanket `wantArtist.length < 3 → false` disabled the dedup
    // guard outright for U2/AJ-style names, so every one of their tracks
    // re-downloaded as a duplicate even when plainly present.
    expect(libraryMatch({ artist: 'U2', title: 'One' }, { title: 'One', artist: 'U2' })).toBe(true);
    expect(
      libraryMatch({ artist: 'U2', title: 'One' }, { title: 'One', artist: 'U2, Green Day' })
    ).toBe(true);
  });

  it('does NOT let a short artist name match loosely', () => {
    // The name must stand as a whole token in the artist FIELD — no substring
    // accidents, no title containment, no junk-copy path.
    expect(libraryMatch({ artist: 'U2', title: 'One' }, { title: 'One', artist: 'U2000' })).toBe(false);
    expect(libraryMatch({ artist: 'U2', title: 'One' }, { title: 'One', artist: 'Metallica' })).toBe(false);
    expect(libraryMatch({ artist: 'U2', title: 'U2 - One' }, { title: 'U2 - One' })).toBe(false);
    expect(
      libraryMatch({ artist: 'U2', title: 'One' }, { title: 'One', artist: 'Unknown Artist' })
    ).toBe(false);
  });

  it('matches an UNTAGGED rip whose artist field is Navidrome’s placeholder', () => {
    // Navidrome never returns an empty artist — library.ts substitutes
    // 'Unknown Artist'. MeTube writes no tags, so a rip that Picard hasn't
    // retagged yet is indexed as title="<Artist> - <Title>", artist=placeholder.
    // Treating the placeholder as a real artist made the junk path unreachable
    // and re-downloaded a track already on disk.
    expect(
      libraryMatch(
        { artist: 'eric404', title: 'Wasting Time' },
        { title: 'eric404 - Wasting Time', artist: 'Unknown Artist' }
      )
    ).toBe(true);
  });

  it('matches a MIS-TAGGED junk copy when the artist is in full in the title', () => {
    expect(
      libraryMatch(
        { artist: 'eric404', title: 'Wasting Time' },
        { title: 'eric404 - Wasting Time (Official Audio)', artist: 'Various Artists' }
      )
    ).toBe(true);
  });

  it('still does NOT match when the placeholder artist comes with a foreign title', () => {
    // The placeholder must not become a free pass: with no artist anywhere, a
    // same-title-different-track song stays a non-match.
    expect(
      libraryMatch(
        { artist: 'eric404', title: 'Wasting Time' },
        { title: 'Wasting Time', artist: 'Unknown Artist' }
      )
    ).toBe(false);
  });
});

describe('qualifierAmbiguity (hand the call back to the user)', () => {
  // Real false skip caught by the 100-track dry run: the library holds
  // "I Choose You (Night)" by Small Town Kid and no "(Day)". Both titles
  // normalize to "i choose you" and the artist corroborates, so the dedup guard
  // skips a track that genuinely isn't there. No heuristic can settle it.
  it('flags a differing meaningful qualifier (Day vs Night)', () => {
    const a = qualifierAmbiguity(
      { artist: 'Small Town Kid', title: 'I Choose You (Day)' },
      { title: 'I Choose You (Night)', artist: 'Small Town Kid' }
    );
    expect(a).toEqual({ wanted: 'day', found: 'night' });
  });

  it('flags Live vs studio', () => {
    expect(
      qualifierAmbiguity(
        { artist: 'DEVORA', title: 'What Doesn’t Kill Me (Live from Numbers)' },
        { title: 'What Doesn’t Kill Me (Radio Edit)', artist: 'DEVORA' }
      )
    ).not.toBeNull();
  });

  it('does NOT flag the same qualifier on both sides', () => {
    expect(
      qualifierAmbiguity(
        { artist: 'Bloom Phase', title: "I'll Dance With You (Feel Safe)" },
        { title: "I'll Dance With You (Feel Safe)", artist: 'Bloom Phase' }
      )
    ).toBeNull();
  });

  it('does NOT flag packaging noise on one side only', () => {
    // The overwhelmingly common junk-title shape — flagging it would bury the
    // real cases in false alarms.
    expect(
      qualifierAmbiguity(
        { artist: 'Small Town Kid', title: 'Something Good' },
        { title: 'Small Town Kid - Something Good (Lyrics)', artist: 'House Muse' }
      )
    ).toBeNull();
    expect(
      qualifierAmbiguity(
        { artist: 'GW Harrison', title: 'Big Bad City' },
        { title: 'GW Harrison - Big Bad City (Official Audio)', artist: 'Sink Or Swim' }
      )
    ).toBeNull();
  });

  it('does NOT flag collaborator or reissue qualifiers', () => {
    expect(
      qualifierAmbiguity(
        { artist: 'Wax Motif', title: 'Skank N Flex (with Scrufizzer)' },
        { title: 'Skank n Flex (feat. Scrufizzer)', artist: 'Wax Motif' }
      )
    ).toBeNull();
    expect(
      qualifierAmbiguity(
        { artist: 'Some Artist', title: 'A Song (2011 Remaster)' },
        { title: 'A Song (Deluxe Edition)', artist: 'Some Artist' }
      )
    ).toBeNull();
  });
});

describe('batch runner attribution + retry policy', () => {
  const finishedItem = {
    id: 'vid1',
    title: 'Cloonee - Good Girl',
    url: 'ytsearch1:Cloonee Good Girl',
    status: 'finished' as const,
    filename: 'Cloonee - Good Girl.mp3',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Every poll sees exactly the one finished item.
    (metube.getQueue as ReturnType<typeof vi.fn>).mockResolvedValue({
      done: { vid1: finishedItem },
      queue: {},
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // #2: a single MeTube item that loosely matches two near-identical tracks must be
  // attributed to only the first — the second must not be re-counted as the same file.
  it('does not attribute one MeTube item to two tracks in a batch', async () => {
    const track = { artist: 'Cloonee', title: 'Good Girl' };
    const job = startYouTubeFallbackJob('user-1', [track, { ...track }], {
      skipInLibrary: false, // don't touch Navidrome in this test
    });

    await vi.runAllTimersAsync();

    const finished = getYouTubeFallbackJob(job.id, 'user-1');
    expect(finished?.status).toBe('completed');
    // First track claims vid1; the second can't reuse it, so it never resolves.
    expect(finished?.results[0].status).toBe('downloaded');
    expect(finished?.results[0].metubeId).toBe('vid1');
    expect(finished?.results[1].status).toBe('failed');
    expect(finished?.results[1].metubeId).toBeUndefined();
  });

  // Concurrency (#132/#207): with DEFAULT_CONCURRENCY workers all racing on the
  // same shared claimedIds Set, exactly one of three identical tracks may claim
  // the one available item — claiming happens synchronously at detection time
  // inside queueAndAwaitDownload, so two concurrent workers can't both grab it.
  it('lets exactly one of three CONCURRENT identical tracks claim the one available item', async () => {
    const track = { artist: 'Cloonee', title: 'Good Girl' };
    const job = startYouTubeFallbackJob('user-1', [track, { ...track }, { ...track }], {
      skipInLibrary: false,
    });

    expect(job.concurrency).toBeGreaterThan(1); // this test only proves anything if they overlap

    await vi.runAllTimersAsync();

    const finished = getYouTubeFallbackJob(job.id, 'user-1');
    expect(finished?.status).toBe('completed');
    const statuses = finished!.results.map((r) => r.status).sort();
    expect(statuses).toEqual(['downloaded', 'failed', 'failed']);
    expect(finished!.results.filter((r) => r.metubeId === 'vid1')).toHaveLength(1);
  });

  // MeTube keys entries by resolved video id, so re-queuing the same `ytsearch1:`
  // query re-creates the entry under the SAME id. If the id claimed when the error
  // was detected is not released after the entry is deleted, `matches()` goes blind
  // to our own retry: it polls out the full DOWNLOAD_TIMEOUT_MS and reports a false
  // `failed` while the successfully-downloaded file is orphaned in MeTube's folder,
  // defeating `maxAttempts` entirely.
  it('retries a confirmed error and accepts the re-queued download under the SAME id', async () => {
    const erroredItem = {
      id: 'vid1',
      title: 'Cloonee - Good Girl',
      url: 'ytsearch1:Cloonee Good Girl',
      status: 'error' as const,
      msg: 'HTTP Error 403: Forbidden',
      filename: 'Cloonee - Good Girl.mp3',
    };
    // 1 = attempt-1 "before" snapshot (empty, so the error isn't treated as stale)
    // 2 = attempt-1 poll (errored) → deleted + retried
    // 3 = attempt-2 "before" snapshot (empty again), 4+ = attempt-2 poll (finished)
    let call = 0;
    (metube.getQueue as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      call++;
      if (call === 2) return { done: { vid1: erroredItem }, queue: {} };
      if (call >= 4) return { done: { vid1: finishedItem }, queue: {} };
      return { done: {}, queue: {} };
    });

    const job = startYouTubeFallbackJob('user-1', [{ artist: 'Cloonee', title: 'Good Girl' }], {
      skipInLibrary: false,
    });

    await vi.runAllTimersAsync();

    const finished = getYouTubeFallbackJob(job.id, 'user-1');
    expect(finished?.results[0].status).toBe('downloaded');
    expect(finished?.results[0].attempts).toBe(2);
    expect(finished?.results[0].metubeId).toBe('vid1');
  });

  // #3: a bare timeout (nothing matching ever appeared) must NOT be retried — the
  // same query would just re-resolve to the same undetectable video.
  it('does not retry a track that merely timed out', async () => {
    const track = { artist: 'Cloonee', title: 'Good Girl' };
    // Two identical tracks: the first claims vid1, the second times out with nothing
    // left to match. addDownload is only reachable on the second (the first is served
    // from the pre-finished item) and must be called exactly once — no retries.
    const job = startYouTubeFallbackJob('user-1', [track, { ...track }], {
      skipInLibrary: false,
      maxAttempts: 3,
    });

    await vi.runAllTimersAsync();

    expect(getYouTubeFallbackJob(job.id, 'user-1')?.status).toBe('completed');
    expect(metube.addDownload as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
  });

  // A `mismatch` that only relabels the entry still leaves the wrong-track rip in
  // MeTube's folder for the next Navidrome scan to index — verification has to
  // actually remove it, keyed by the full URL (a bare video id no-ops in MeTube).
  const wrongItem = {
    id: 'vid2',
    title: "Phil Collins - Some Of Your Lovin' (Official Audio)",
    url: 'https://www.youtube.com/watch?v=vid2',
    status: 'finished' as const,
    filename: 'Phil Collins - Some Of Your Lovin.mp3',
  };
  const wrongTrack = { artist: 'Phil Odd', title: 'ur lovin' };

  it('deletes a mismatched download it just fetched', async () => {
    (metube.getQueue as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ done: {}, queue: {} }) // pre-add snapshot: nothing yet
      .mockResolvedValue({ done: { vid2: wrongItem }, queue: {} });

    const job = startYouTubeFallbackJob('user-1', [wrongTrack], { skipInLibrary: false });
    await vi.runAllTimersAsync();

    const finished = getYouTubeFallbackJob(job.id, 'user-1');
    expect(finished?.results[0].status).toBe('mismatch');
    expect(metube.deleteDownloads).toHaveBeenCalledWith(
      expect.arrayContaining([wrongItem.url]),
      'done'
    );
  });

  it('flags an ambiguous library skip for review instead of deciding silently', async () => {
    (metube.getQueue as ReturnType<typeof vi.fn>).mockResolvedValue({ done: {}, queue: {} });
    (navidrome.search as ReturnType<typeof vi.fn>).mockResolvedValue([
      { title: 'I Choose You (Night)', name: 'I Choose You (Night)', artist: 'Small Town Kid' },
    ]);

    const job = startYouTubeFallbackJob(
      'user-1',
      [{ artist: 'Small Town Kid', title: 'I Choose You (Day)' }],
      { skipInLibrary: true }
    );
    await vi.runAllTimersAsync();

    const finished = getYouTubeFallbackJob(job.id, 'user-1');
    const entry = finished?.results[0];
    // The skip still stands — flagging must never create a silent duplicate.
    expect(entry?.status).toBe('skipped');
    expect(entry?.resultTitle).toBe('I Choose You (Night)');
    expect(entry?.review).toMatch(/"day".*"night"/);
    expect(summarizeJob(finished!).needsReview).toBe(1);

    (navidrome.search as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it('does not flag an unambiguous library skip', async () => {
    (metube.getQueue as ReturnType<typeof vi.fn>).mockResolvedValue({ done: {}, queue: {} });
    (navidrome.search as ReturnType<typeof vi.fn>).mockResolvedValue([
      { title: 'Young Folks', name: 'Young Folks', artist: 'Glom' },
    ]);

    const job = startYouTubeFallbackJob('user-1', [{ artist: 'Glom', title: 'Young Folks' }], {
      skipInLibrary: true,
    });
    await vi.runAllTimersAsync();

    const finished = getYouTubeFallbackJob(job.id, 'user-1');
    expect(finished?.results[0].status).toBe('skipped');
    expect(finished?.results[0].review).toBeUndefined();
    expect(summarizeJob(finished!).needsReview).toBe(0);

    (navidrome.search as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it('does NOT delete a PRE-EXISTING entry that fails verification', async () => {
    // Already finished before this job queued anything — it may belong to another
    // flow, so it is flagged for manual cleanup instead of deleted.
    (metube.getQueue as ReturnType<typeof vi.fn>).mockResolvedValue({
      done: { vid2: wrongItem },
      queue: {},
    });

    const job = startYouTubeFallbackJob('user-1', [wrongTrack], { skipInLibrary: false });
    await vi.runAllTimersAsync();

    const finished = getYouTubeFallbackJob(job.id, 'user-1');
    expect(finished?.results[0].status).toBe('mismatch');
    expect(finished?.results[0].error).toMatch(/manual cleanup/);
    expect(metube.deleteDownloads).not.toHaveBeenCalled();
  });
});
