/**
 * Seeded Radio Service
 *
 * Generates a ~40-track radio queue from a seed (song, album, playlist, artist).
 * Blends local library tracks with Last.fm / compound / DJ-match scoring via the
 * existing blended recommendation scorer, then applies:
 *
 *  - Recency cap: at most 40% of output may be "recently heard" (last 30 days).
 *    Prevents the Spotify echo-chamber failure mode where radio becomes a
 *    replay of the user's own recent history.
 *  - Artist variety knob for artist-seeded radio: Low=60% / Medium=35% / High=15%
 *    of output comes from the seed artist's own catalog. Rest is adjacent.
 *  - One-song-per-artist diversity (except for the seed artist in artist radio).
 *  - Dedupe by id and by (artist|title).
 *
 * Inclusion rules follow industry convention:
 *  - Song seed   → seed song is track 1, then similar.
 *  - Album seed  → seed tracks excluded from output (avoid "shuffled album" feel).
 *  - Playlist seed → same as album.
 *  - Artist seed → seed artist catalog IS part of output (that's the point).
 */

import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { listeningHistory } from '@/lib/db/schema/listening-history.schema';
import {
  getPlaylist,
  getSongs,
  getSongsByArtist,
  getSongsByIds,
  getStarredSongs,
  searchArtistsByName,
} from '@/lib/services/navidrome';
import { getNavidromeUserCreds } from '@/lib/services/navidrome-users';
import type { SubsonicSong } from '@/lib/services/navidrome/types';
import type { Song } from '@/lib/types/song';
import { getBlendedRecommendations } from '@/lib/services/blended-recommendation-scorer';
import { getRelatedArtists } from '@/lib/services/artist-cooccurrence';

// ============================================================================
// Types
// ============================================================================

export type SeededRadioSeed =
  | { kind: 'song'; songId: string }
  | { kind: 'album'; albumId: string }
  | { kind: 'playlist'; playlistId: string }
  | { kind: 'artist'; artistId: string };

export type ArtistVariety = 'low' | 'medium' | 'high';

export interface SeededRadioOptions {
  variety?: ArtistVariety;
  size?: number;
}

export interface SeededRadioResult {
  songs: Song[];
  seedInfo: {
    label: string;
    seedSongIds: string[];
    seedArtists: string[];
  };
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_SIZE = 40;
const RECENCY_FRACTION = 0.4;
const RECENCY_DAYS = 30;
const SEED_TRACKS_MIN = 3;
const SEED_TRACKS_MAX = 5;

// % of output that is the seed artist's OWN catalog, per variety level.
const ARTIST_CATALOG_FRACTION: Record<ArtistVariety, number> = {
  low: 0.6,
  medium: 0.35,
  high: 0.15,
};

// Per-seed scorer fetch size (we ask for more than we need so dedupe+cap leave headroom).
const SCORER_LIMIT_PER_SEED = 20;

// ============================================================================
// Utilities
// ============================================================================

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function sample<T>(arr: T[], n: number): T[] {
  return shuffle(arr).slice(0, n);
}

function titleKey(song: { artist?: string; title?: string; name?: string }): string {
  const artist = (song.artist ?? '').toLowerCase();
  const title = ((song.title ?? song.name) ?? '').toLowerCase();
  return `${artist}|${title}`;
}

function dedupe(songs: Song[]): Song[] {
  const ids = new Set<string>();
  const titles = new Set<string>();
  const out: Song[] = [];
  for (const s of songs) {
    if (!s?.id) continue;
    if (ids.has(s.id)) continue;
    const tk = titleKey(s);
    if (titles.has(tk)) continue;
    ids.add(s.id);
    titles.add(tk);
    out.push(s);
  }
  return out;
}

/**
 * Keep at most one song per artist. `allowArtist` is NOT capped (used for the
 * seed artist in artist-radio to preserve the intentional catalog slice).
 */
function enforceArtistDiversity(songs: Song[], allowArtist?: string): Song[] {
  const allow = allowArtist?.toLowerCase();
  const seenArtists = new Set<string>();
  const out: Song[] = [];
  for (const s of songs) {
    const artist = (s.artist ?? '').toLowerCase();
    if (allow && artist === allow) {
      out.push(s);
      continue;
    }
    if (seenArtists.has(artist)) continue;
    seenArtists.add(artist);
    out.push(s);
  }
  return out;
}

/**
 * Convert Subsonic playlist entries to Song shape.
 */
function subsonicToSong(entry: SubsonicSong): Song {
  return {
    id: entry.id,
    name: entry.title,
    title: entry.title,
    artist: entry.artist,
    album: entry.album,
    albumId: entry.albumId,
    artistId: entry.artistId,
    duration: Math.floor(parseFloat(entry.duration) || 0),
    track: parseInt(entry.track) || 0,
    url: `/api/navidrome/stream/${entry.id}`,
    genre: entry.genre,
    bpm: entry.bpm,
  };
}

// ============================================================================
// Recency (listening history)
// ============================================================================

/**
 * Return the set of song IDs AND artist|title keys a user has played in the last
 * `RECENCY_DAYS` days. Either match counts as "recent".
 */
async function getRecentSongSet(userId: string): Promise<{
  ids: Set<string>;
  titleKeys: Set<string>;
}> {
  try {
    const cutoff = new Date(Date.now() - RECENCY_DAYS * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        songId: listeningHistory.songId,
        artist: listeningHistory.artist,
        title: listeningHistory.title,
      })
      .from(listeningHistory)
      .where(
        and(
          eq(listeningHistory.userId, userId),
          gte(listeningHistory.playedAt, cutoff),
        ),
      );

    const ids = new Set<string>();
    const titleKeys = new Set<string>();
    for (const r of rows) {
      if (r.songId) ids.add(r.songId);
      if (r.artist && r.title) {
        titleKeys.add(`${r.artist.toLowerCase()}|${r.title.toLowerCase()}`);
      }
    }
    return { ids, titleKeys };
  } catch (err) {
    console.warn('[SeededRadio] Failed to load recency set:', err);
    return { ids: new Set(), titleKeys: new Set() };
  }
}

function isRecent(
  song: Song,
  recent: { ids: Set<string>; titleKeys: Set<string> },
): boolean {
  if (recent.ids.has(song.id)) return true;
  return recent.titleKeys.has(titleKey(song));
}

/**
 * Walk candidates in order, accepting up to `target` total, but allowing at most
 * `floor(target * RECENCY_FRACTION)` recent entries. Pinned songs (e.g. seed song)
 * count against the target but NOT the recent cap.
 */
function applyRecencyCap(
  candidates: Song[],
  recent: { ids: Set<string>; titleKeys: Set<string> },
  target: number,
  pinned: Song[] = [],
): Song[] {
  const maxRecent = Math.floor(target * RECENCY_FRACTION);
  const pinnedIds = new Set(pinned.map((s) => s.id));
  const out: Song[] = [...pinned];
  let recentCount = 0;
  const overflow: Song[] = [];

  for (const s of candidates) {
    if (pinnedIds.has(s.id)) continue;
    if (out.length >= target) break;
    if (isRecent(s, recent)) {
      if (recentCount >= maxRecent) {
        overflow.push(s);
        continue;
      }
      recentCount++;
    }
    out.push(s);
  }

  // Fill from overflow if cap was generous and we're still short
  if (out.length < target) {
    for (const s of overflow) {
      if (out.length >= target) break;
      out.push(s);
    }
  }
  return out;
}

// ============================================================================
// Seed track picking
// ============================================================================

/**
 * Pick `n` "representative" seed tracks from a source collection, weighted by
 * local play count (from listening history). Ties broken randomly.
 */
async function pickSeedTracks(userId: string, songs: Song[], n: number): Promise<Song[]> {
  if (songs.length <= n) return shuffle(songs);
  const ids = songs.map((s) => s.id).filter(Boolean);
  const playCounts = new Map<string, number>();

  try {
    if (ids.length > 0) {
      const rows = await db
        .select({
          songId: listeningHistory.songId,
          plays: sql<number>`count(*)::int`,
        })
        .from(listeningHistory)
        .where(
          and(
            eq(listeningHistory.userId, userId),
            inArray(listeningHistory.songId, ids),
          ),
        )
        .groupBy(listeningHistory.songId);
      for (const r of rows) {
        playCounts.set(r.songId, Number(r.plays) || 0);
      }
    }
  } catch (err) {
    console.warn('[SeededRadio] Failed to load play counts for seed picking:', err);
  }

  // Rank: played songs first (by count desc), random tail for ties + unplayed.
  const ranked = [...songs].sort((a, b) => {
    const ca = playCounts.get(a.id) ?? 0;
    const cb = playCounts.get(b.id) ?? 0;
    if (cb !== ca) return cb - ca;
    return Math.random() - 0.5;
  });
  return ranked.slice(0, n);
}

// ============================================================================
// Scorer wrapper
// ============================================================================

async function scoreFromSeed(
  seed: Song,
  userId: string,
  limit: number,
  excludeSongIds: string[] = [],
  excludeArtists: string[] = [],
): Promise<Song[]> {
  if (!seed.artist || !(seed.title || seed.name)) return [];
  try {
    const { songs } = await getBlendedRecommendations(
      {
        artist: seed.artist,
        title: seed.title ?? seed.name ?? '',
        genre: seed.genre,
        bpm: seed.bpm,
        key: seed.key,
        energy: seed.energy,
      },
      { userId, limit, excludeSongIds, excludeArtists },
    );
    return songs;
  } catch (err) {
    console.warn(`[SeededRadio] Scorer failed for "${seed.artist} - ${seed.title}":`, err);
    return [];
  }
}

// ============================================================================
// Per-seed strategies
// ============================================================================

async function generateFromSong(
  userId: string,
  songId: string,
  size: number,
  recent: { ids: Set<string>; titleKeys: Set<string> },
): Promise<SeededRadioResult> {
  const [seed] = await getSongsByIds([songId]);
  if (!seed) {
    throw new Error(`Seed song not found: ${songId}`);
  }
  const scored = await scoreFromSeed(seed, userId, size + 10, [seed.id]);
  let merged = dedupe([seed, ...scored]);
  merged = enforceArtistDiversity(merged, seed.artist);
  merged = applyRecencyCap(merged, recent, size, [seed]);

  return {
    songs: merged,
    seedInfo: {
      label: `${seed.artist ?? 'Unknown'} — ${seed.title ?? seed.name ?? 'Unknown'}`,
      seedSongIds: [seed.id],
      seedArtists: seed.artist ? [seed.artist] : [],
    },
  };
}

async function generateFromCollection(
  userId: string,
  collection: Song[],
  label: string,
  size: number,
  recent: { ids: Set<string>; titleKeys: Set<string> },
): Promise<SeededRadioResult> {
  if (collection.length === 0) {
    return {
      songs: [],
      seedInfo: { label, seedSongIds: [], seedArtists: [] },
    };
  }

  const seedCount = collection.length < 20 ? SEED_TRACKS_MIN : SEED_TRACKS_MAX;
  const seeds = await pickSeedTracks(userId, collection, seedCount);
  const seedIds = new Set(collection.map((s) => s.id));

  // Run scorer per seed, merge scored results with first-seen-wins priority.
  const perSeedResults = await Promise.all(
    seeds.map((s) =>
      scoreFromSeed(s, userId, SCORER_LIMIT_PER_SEED, Array.from(seedIds)),
    ),
  );

  // Interleave results from each seed so no single seed dominates.
  const merged: Song[] = [];
  const maxLen = Math.max(...perSeedResults.map((r) => r.length), 0);
  for (let i = 0; i < maxLen; i++) {
    for (const row of perSeedResults) {
      if (row[i]) merged.push(row[i]);
    }
  }

  let final = dedupe(merged);
  // Explicitly remove any seed-track IDs that snuck in.
  final = final.filter((s) => !seedIds.has(s.id));
  final = enforceArtistDiversity(final);
  final = applyRecencyCap(final, recent, size);

  const seedArtists = Array.from(
    new Set(seeds.map((s) => s.artist).filter((a): a is string => !!a)),
  );
  return {
    songs: final,
    seedInfo: {
      label,
      seedSongIds: seeds.map((s) => s.id),
      seedArtists,
    },
  };
}

/**
 * For the user's top co-occurring artists with the seed, look each up in
 * Navidrome and fetch a handful of tracks. Best-effort — silently skips
 * artists that aren't findable. Returns up to `maxTracks` songs total.
 */
async function fetchCoOccurrenceTracks(
  userId: string,
  seedArtistName: string,
  maxArtists: number,
  tracksPerArtist: number,
  maxTracks: number,
): Promise<Song[]> {
  const related = await getRelatedArtists(userId, seedArtistName, maxArtists);
  if (related.length === 0) return [];

  const perArtistTracks = await Promise.all(
    related.map(async (r) => {
      try {
        const hits = await searchArtistsByName(r.artist, 1);
        if (hits.length === 0) return [] as Song[];
        const songs = await getSongsByArtist(hits[0].id, 0, tracksPerArtist);
        return songs;
      } catch (err) {
        console.warn(`[seeded-radio] co-occurrence lookup failed for ${r.artist}:`, err);
        return [] as Song[];
      }
    }),
  );

  const flat: Song[] = [];
  for (const row of perArtistTracks) flat.push(...row);
  return flat.slice(0, maxTracks);
}

async function generateFromArtist(
  userId: string,
  artistId: string,
  size: number,
  variety: ArtistVariety,
  recent: { ids: Set<string>; titleKeys: Set<string> },
): Promise<SeededRadioResult> {
  const catalog = await getSongsByArtist(artistId, 0, 100);
  if (catalog.length === 0) {
    throw new Error(`No songs found for artist: ${artistId}`);
  }
  const artistName = catalog[0].artist ?? 'Unknown Artist';

  // Split: X% from the artist's own catalog, (1-X)% from scorer (adjacent).
  const catalogFraction = ARTIST_CATALOG_FRACTION[variety];
  const catalogTarget = Math.round(size * catalogFraction);
  const scorerTarget = size - catalogTarget;

  // Artist catalog slice — sampled randomly (no weighting, keeps it fresh).
  const artistSlice = sample(catalog, Math.min(catalogTarget + 5, catalog.length));

  // Kick off co-occurrence lookup in parallel with the scorer.
  // Top 5 co-occurring artists × 3 tracks each, capped at scorerTarget so
  // we never fully crowd out the scorer's broader discovery.
  const coocPromise = fetchCoOccurrenceTracks(
    userId,
    artistName,
    5,
    3,
    Math.max(0, Math.floor(scorerTarget / 2)),
  );

  // Scorer input: 3 seeds from catalog, exclude seed artist from results
  // so we get "similar artists" rather than more catalog.
  const scorerSeeds = await pickSeedTracks(userId, catalog, 3);
  const perSeedResults = await Promise.all(
    scorerSeeds.map((s) =>
      scoreFromSeed(
        s,
        userId,
        SCORER_LIMIT_PER_SEED,
        catalog.map((c) => c.id),
        [artistName],
      ),
    ),
  );

  const scorerMerged: Song[] = [];
  const maxLen = Math.max(...perSeedResults.map((r) => r.length), 0);
  for (let i = 0; i < maxLen; i++) {
    for (const row of perSeedResults) {
      if (row[i]) scorerMerged.push(row[i]);
    }
  }

  // Prepend co-occurrence tracks so they get priority in the adjacent pool.
  // The interleave + diversity + recency cap downstream keep the mix honest.
  const coocTracks = await coocPromise;
  const coocFiltered = coocTracks.filter(
    (s) => (s.artist ?? '').toLowerCase() !== artistName.toLowerCase(),
  );

  let scorerSlice = dedupe([...coocFiltered, ...scorerMerged]);
  scorerSlice = enforceArtistDiversity(scorerSlice);

  // Interleave: start with an artist track, then alternate to avoid clustering.
  const interleaved: Song[] = [];
  const catalogQueue = [...artistSlice];
  const scorerQueue = [...scorerSlice];
  while (interleaved.length < size && (catalogQueue.length || scorerQueue.length)) {
    const catalogRemaining = catalogTarget - interleaved.filter(
      (s) => (s.artist ?? '').toLowerCase() === artistName.toLowerCase(),
    ).length;
    const scorerRemaining = scorerTarget - interleaved.filter(
      (s) => (s.artist ?? '').toLowerCase() !== artistName.toLowerCase(),
    ).length;
    const takeCatalog =
      catalogRemaining > 0 &&
      catalogQueue.length > 0 &&
      (scorerRemaining <= 0 || scorerQueue.length === 0 || Math.random() < catalogFraction);
    if (takeCatalog) {
      interleaved.push(catalogQueue.shift()!);
    } else if (scorerQueue.length > 0) {
      interleaved.push(scorerQueue.shift()!);
    } else if (catalogQueue.length > 0) {
      interleaved.push(catalogQueue.shift()!);
    } else {
      break;
    }
  }

  let final = dedupe(interleaved);
  final = enforceArtistDiversity(final, artistName);
  final = applyRecencyCap(final, recent, size);

  return {
    songs: final,
    seedInfo: {
      label: `Artist Radio — ${artistName}`,
      seedSongIds: scorerSeeds.map((s) => s.id),
      seedArtists: [artistName],
    },
  };
}

// ============================================================================
// Public entry point
// ============================================================================

export async function generateSeededRadio(
  userId: string,
  seed: SeededRadioSeed,
  options: SeededRadioOptions = {},
): Promise<SeededRadioResult> {
  const size = options.size ?? DEFAULT_SIZE;
  const variety = options.variety ?? 'medium';
  const recent = await getRecentSongSet(userId);

  switch (seed.kind) {
    case 'song':
      return generateFromSong(userId, seed.songId, size, recent);

    case 'album': {
      const songs = await getSongs(seed.albumId, 0, 100);
      const label = songs[0]
        ? `Album Radio — ${songs[0].album ?? 'Unknown'}`
        : 'Album Radio';
      return generateFromCollection(userId, songs, label, size, recent);
    }

    case 'playlist': {
      let songs: Song[];
      let label: string;

      if (seed.playlistId === 'liked-songs') {
        const creds = await getNavidromeUserCreds(userId);
        const starred = creds ? await getStarredSongs(creds) : await getStarredSongs();
        songs = starred.map(subsonicToSong);
        label = 'Liked Songs Radio';
      } else {
        const pl = await getPlaylist(seed.playlistId);
        songs = (pl.entry ?? []).map(subsonicToSong);
        label = `Playlist Radio — ${pl.name ?? 'Unknown'}`;
      }

      return generateFromCollection(userId, songs, label, size, recent);
    }

    case 'artist':
      return generateFromArtist(userId, seed.artistId, size, variety, recent);

    default: {
      const exhaustive: never = seed;
      throw new Error(`Unknown seed kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}

// Exports for testing
export const __internal = {
  dedupe,
  enforceArtistDiversity,
  applyRecencyCap,
  pickSeedTracks,
  ARTIST_CATALOG_FRACTION,
};
