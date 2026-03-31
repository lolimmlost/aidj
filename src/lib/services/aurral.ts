/**
 * Aurral Integration Service
 *
 * Server-side only. Handles authentication, API communication, and caching
 * for the Aurral artist discovery service (MusicBrainz metadata enrichment).
 *
 * Key challenges addressed:
 * - MBID resolution is fuzzy (artist name → MusicBrainz ID). Failed lookups
 *   cached with short TTL to allow retries.
 * - Rate limiting: exponential backoff on 429s, respects MusicBrainz 1req/s.
 * - Navidrome ID ↔ artist name: cache supports both lookup paths.
 * - Token auth: cached with expiry, re-authenticates on 401.
 */

import { getConfigAsync } from '@/lib/config/config';
import { db } from '@/lib/db';
import { artistMetadataCache } from '@/lib/db/schema/artist-metadata.schema';
import { eq, or, and, gt } from 'drizzle-orm';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AurralArtistResponse {
  id: string; // MBID
  name: string;
  'sort-name'?: string;
  disambiguation?: string;
  type?: string; // Group, Person, Orchestra, etc.
  country?: string;
  'life-span'?: { begin: string | null; end: string | null; ended: boolean };
  tags?: { name: string; count: number }[];
  genres?: string[];
  'release-groups'?: AurralReleaseGroup[];
  relations?: { type: string; url: string }[];
  bio?: Record<string, unknown>;
  _lidarrData?: { id: number; monitored: boolean; statistics: Record<string, unknown> };
}

export interface AurralReleaseGroup {
  id: string;
  title: string;
  'first-release-date'?: string;
  'primary-type'?: string;
  'secondary-types'?: string[];
}

export interface AurralSimilarArtist {
  id: string;
  name: string;
  image?: string;
  match?: number;
}

export interface AurralRecommendation {
  id: string; // MBID
  name: string;
  type: string;
  sourceArtist: string;
  sourceType: 'library' | 'lastfm';
  tags: string[];
  score: number;
  image?: string;
}

export interface AurralDiscoveryResponse {
  recommendations: AurralRecommendation[];
  globalTop: { id: string; name: string; image?: string; type: string }[];
  basedOn: { name: string; id: string; source: string }[];
  topTags: string[];
  topGenres: string[];
  lastUpdated: string;
  isUpdating: boolean;
  stale: boolean;
  configured: boolean;
}

export interface AurralRecentArtist {
  id: number;
  artistName: string;
  mbid: string;
  foreignArtistId: string;
  monitored: boolean;
  addedAt?: string;
  added?: string;
  statistics?: { albumCount: number; trackCount?: number; sizeOnDisk?: number };
}

export interface EnrichedArtistMetadata {
  artistName: string;
  mbid: string | null;
  disambiguation: string | null;
  artistType: string | null;
  country: string | null;
  formedYear: string | null;
  ended: boolean;
  tags: { name: string; count: number }[];
  genres: string[];
  bio: Record<string, unknown> | null;
  relations: { type: string; url: string }[];
  similarArtists: { name: string; mbid: string; score: number; image?: string }[];
  releaseGroups: { id: string; title: string; firstReleaseDate?: string; primaryType?: string }[];
  coverImageUrl: string | null;
  lidarrId: string | null;
  lidarrMonitored: boolean;
  fetchedAt: Date;
}

// ─── Token Management ────────────────────────────────────────────────────────

interface TokenInfo {
  token: string;
  expiresAt: number;
}

let tokenInfo: TokenInfo | null = null;
let authInFlight: Promise<string> | null = null; // prevents concurrent auth races

const TOKEN_REFRESH_BUFFER = 5 * 60 * 1000; // 5 min before expiry
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const FAILED_LOOKUP_TTL_MS = 24 * 60 * 60 * 1000; // 1 day for failed MBID lookups

async function getAurralConfig() {
  const config = await getConfigAsync();
  if (!config.aurralUrl) {
    return null;
  }
  return {
    url: config.aurralUrl.replace(/\/$/, ''),
    username: config.aurralUsername,
    password: config.aurralPassword,
  };
}

/**
 * Authenticate with Aurral and cache the bearer token.
 * Uses a promise-based lock to prevent concurrent auth attempts.
 */
async function ensureAuthenticated(): Promise<string> {
  // Return cached token if still valid
  if (tokenInfo && Date.now() < tokenInfo.expiresAt - TOKEN_REFRESH_BUFFER) {
    return tokenInfo.token;
  }

  // If auth is already in flight, wait for it
  if (authInFlight) {
    return authInFlight;
  }

  authInFlight = (async () => {
    try {
      const aurral = await getAurralConfig();
      if (!aurral) throw new Error('Aurral not configured');

      const res = await fetch(`${aurral.url}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: aurral.username, password: aurral.password }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Aurral auth failed: ${res.status} ${text}`);
      }

      const data = await res.json() as { token: string; expiresAt: string };
      tokenInfo = {
        token: data.token,
        expiresAt: new Date(data.expiresAt).getTime(),
      };
      return data.token;
    } finally {
      authInFlight = null;
    }
  })();

  return authInFlight;
}

// ─── HTTP Client ─────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const BASE_DELAY = 1000;
const RETRYABLE_CODES = [408, 429, 500, 502, 503, 504];

async function aurralFetch<T>(path: string, options?: RequestInit & { retries?: number }): Promise<T> {
  const aurral = await getAurralConfig();
  if (!aurral) throw new Error('Aurral not configured');

  const retries = options?.retries ?? MAX_RETRIES;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const token = await ensureAuthenticated();

    const res = await fetch(`${aurral.url}${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    // Re-auth on 401 (token expired)
    if (res.status === 401 && attempt < retries) {
      tokenInfo = null;
      continue;
    }

    if (!res.ok) {
      if (RETRYABLE_CODES.includes(res.status) && attempt < retries) {
        const delay = Math.min(BASE_DELAY * Math.pow(2, attempt), 10000);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      const text = await res.text().catch(() => '');
      throw new Error(`Aurral API error ${res.status}: ${text}`);
    }

    return await res.json() as T;
  }

  throw new Error(`Aurral API failed after ${retries} retries`);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Check if Aurral is configured */
export async function isAurralConfigured(): Promise<boolean> {
  const config = await getAurralConfig();
  return config !== null;
}

/** Get Aurral health/status */
export async function getAurralHealth(): Promise<{ status: string; configured: boolean }> {
  const aurral = await getAurralConfig();
  if (!aurral) return { status: 'not_configured', configured: false };

  try {
    const res = await fetch(`${aurral.url}/api/health/live`);
    if (res.ok) return { status: 'ok', configured: true };
    return { status: 'unreachable', configured: true };
  } catch {
    return { status: 'unreachable', configured: true };
  }
}

/** Fetch discovery recommendations */
export async function getDiscovery(): Promise<AurralDiscoveryResponse> {
  return aurralFetch<AurralDiscoveryResponse>('/api/discover/');
}

/** Fetch recently added library artists */
export async function getRecentArtists(): Promise<AurralRecentArtist[]> {
  return aurralFetch<AurralRecentArtist[]>('/api/library/recent');
}

/** Fetch recent missing releases */
export async function getRecentReleases(): Promise<unknown[]> {
  return aurralFetch<unknown[]>('/api/library/recent-releases');
}

/** Fetch full artist metadata by MBID */
export async function getArtistByMBID(mbid: string): Promise<AurralArtistResponse> {
  return aurralFetch<AurralArtistResponse>(`/api/artists/${encodeURIComponent(mbid)}`);
}

/** Search artists by name (returns MusicBrainz results) */
export async function searchArtists(query: string, limit = 5): Promise<{ artists: { id: string; name: string; 'sort-name'?: string; image?: string }[]; count: number }> {
  return aurralFetch(`/api/artists/search?query=${encodeURIComponent(query)}&limit=${limit}`);
}

/** Get similar artists for an MBID */
export async function getSimilarArtists(mbid: string, limit = 10): Promise<{ artists: AurralSimilarArtist[] }> {
  return aurralFetch(`/api/artists/${encodeURIComponent(mbid)}/similar?limit=${limit}`);
}

/** Get artist cover art */
export async function getArtistCover(mbid: string, artistName?: string): Promise<{ images: { image: string; front: boolean; types: string[] }[] }> {
  let path = `/api/artists/${encodeURIComponent(mbid)}/cover`;
  if (artistName) path += `?artistName=${encodeURIComponent(artistName)}`;
  return aurralFetch(path);
}

/** Fetch core artist info directly from MusicBrainz (type, country, life-span) */
async function fetchMusicBrainzCoreInfo(mbid: string): Promise<{
  type?: string;
  country?: string;
  'life-span'?: { begin: string | null; end: string | null; ended: boolean };
} | null> {
  try {
    const res = await fetch(
      `https://musicbrainz.org/ws/2/artist/${encodeURIComponent(mbid)}?fmt=json`,
      {
        headers: { 'User-Agent': 'AIDJ/1.0 (https://aidj.appahouse.com)' },
      }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Add artist to Lidarr via Aurral */
export async function addArtistToLibrary(mbid: string, artistName: string): Promise<{ queued: boolean; foreignArtistId: string; artistName: string }> {
  return aurralFetch('/api/library/artists', {
    method: 'POST',
    body: JSON.stringify({ foreignArtistId: mbid, artistName }),
  });
}

/** Fetch Lidarr download queue via Aurral */
export async function getDownloads(): Promise<unknown[]> {
  return aurralFetch('/api/library/downloads');
}

// ─── Enriched Artist Metadata (with DB caching) ─────────────────────────────

/**
 * Get enriched artist metadata, using DB cache when available.
 *
 * Lookup order:
 * 1. Check DB cache by normalized name (or navidromeId if provided)
 * 2. If cached and not expired, return immediately
 * 3. Search Aurral for MBID resolution (fuzzy — may fail)
 * 4. Fetch full metadata + similar artists from Aurral
 * 5. Cache in DB and return
 *
 * Returns null if Aurral is not configured or if the artist can't be found.
 */
export async function getEnrichedArtist(
  artistName: string,
  navidromeId?: string,
): Promise<EnrichedArtistMetadata | null> {
  if (!(await isAurralConfigured())) return null;

  const normalized = artistName.toLowerCase().trim();
  const now = new Date();

  // 1. Check DB cache
  try {
    const conditions = navidromeId
      ? or(
          eq(artistMetadataCache.artistNameNormalized, normalized),
          eq(artistMetadataCache.navidromeId, navidromeId),
        )
      : eq(artistMetadataCache.artistNameNormalized, normalized);

    const cached = await db.select()
      .from(artistMetadataCache)
      .where(and(conditions, gt(artistMetadataCache.expiresAt, now)))
      .limit(1)
      .then(rows => rows[0]);

    if (cached) {
      return dbRowToEnriched(cached);
    }
  } catch (err) {
    console.warn('[AURRAL] DB cache lookup failed:', err);
  }

  // 2. Resolve MBID via Aurral search
  let mbid: string | null = null;
  try {
    const searchResult = await searchArtists(artistName, 1);
    if (searchResult.artists?.[0]) {
      mbid = searchResult.artists[0].id;
    }
  } catch (err) {
    console.warn(`[AURRAL] MBID resolution failed for "${artistName}":`, err);
  }

  if (!mbid) {
    // Cache the failed lookup with short TTL so we don't hammer the API
    try {
      await db.insert(artistMetadataCache).values({
        artistName,
        artistNameNormalized: normalized,
        navidromeId: navidromeId ?? null,
        fetchedAt: now,
        expiresAt: new Date(now.getTime() + FAILED_LOOKUP_TTL_MS),
        updatedAt: now,
      }).onConflictDoNothing();
    } catch { /* ignore */ }
    return null;
  }

  // 3. Fetch full metadata
  try {
    const [artist, similarResult, coverResult] = await Promise.allSettled([
      getArtistByMBID(mbid),
      getSimilarArtists(mbid, 15),
      getArtistCover(mbid, artistName),
    ]);

    const artistData = artist.status === 'fulfilled' ? artist.value : null;
    const similarData = similarResult.status === 'fulfilled' ? similarResult.value : null;
    const coverData = coverResult.status === 'fulfilled' ? coverResult.value : null;

    if (!artistData) {
      console.warn(`[AURRAL] Failed to fetch metadata for MBID ${mbid}`);
      return null;
    }

    const coverImageUrl = coverData?.images?.find(i => i.front)?.image
      ?? coverData?.images?.[0]?.image
      ?? null;

    // Aurral may not return type/country/life-span — fill from MusicBrainz directly
    let artistType = artistData.type ?? null;
    let country = artistData.country ?? null;
    let formedYear = artistData['life-span']?.begin ?? null;
    let ended = artistData['life-span']?.ended ?? false;

    if (!artistType && !country && !formedYear && mbid) {
      const mbData = await fetchMusicBrainzCoreInfo(mbid);
      if (mbData) {
        artistType = mbData.type ?? artistType;
        country = mbData.country ?? country;
        formedYear = mbData['life-span']?.begin ?? formedYear;
        ended = mbData['life-span']?.ended ?? ended;
      }
    }

    const enriched: EnrichedArtistMetadata = {
      artistName: artistData.name,
      mbid: artistData.id,
      disambiguation: artistData.disambiguation ?? null,
      artistType,
      country,
      formedYear,
      ended,
      tags: artistData.tags ?? [],
      genres: artistData.genres ?? [],
      bio: artistData.bio ?? null,
      relations: artistData.relations ?? [],
      similarArtists: (similarData?.artists ?? []).map(a => ({
        name: a.name,
        mbid: a.id,
        score: a.match ?? 0,
        image: a.image,
      })),
      releaseGroups: (artistData['release-groups'] ?? []).map(rg => ({
        id: rg.id,
        title: rg.title,
        firstReleaseDate: rg['first-release-date'],
        primaryType: rg['primary-type'],
      })),
      coverImageUrl,
      lidarrId: artistData._lidarrData?.id?.toString() ?? null,
      lidarrMonitored: artistData._lidarrData?.monitored ?? false,
      fetchedAt: now,
    };

    // 4. Upsert to DB cache
    try {
      const expiresAt = new Date(now.getTime() + CACHE_TTL_MS);
      await db.insert(artistMetadataCache).values({
        artistName: enriched.artistName,
        artistNameNormalized: normalized,
        mbid: enriched.mbid,
        navidromeId: navidromeId ?? null,
        disambiguation: enriched.disambiguation,
        artistType: enriched.artistType,
        country: enriched.country,
        formedYear: enriched.formedYear,
        ended: enriched.ended,
        tags: enriched.tags,
        genres: enriched.genres,
        bio: enriched.bio,
        relations: enriched.relations,
        similarArtists: enriched.similarArtists,
        releaseGroups: enriched.releaseGroups,
        coverImageUrl: enriched.coverImageUrl,
        lidarrId: enriched.lidarrId,
        lidarrMonitored: enriched.lidarrMonitored,
        fetchedAt: now,
        expiresAt,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: artistMetadataCache.id,
        set: {
          mbid: enriched.mbid,
          disambiguation: enriched.disambiguation,
          artistType: enriched.artistType,
          country: enriched.country,
          formedYear: enriched.formedYear,
          ended: enriched.ended,
          tags: enriched.tags,
          genres: enriched.genres,
          bio: enriched.bio,
          relations: enriched.relations,
          similarArtists: enriched.similarArtists,
          releaseGroups: enriched.releaseGroups,
          coverImageUrl: enriched.coverImageUrl,
          lidarrId: enriched.lidarrId,
          lidarrMonitored: enriched.lidarrMonitored,
          fetchedAt: now,
          expiresAt,
          updatedAt: now,
        },
      });
    } catch (err) {
      console.warn('[AURRAL] DB cache write failed:', err);
    }

    return enriched;
  } catch (err) {
    console.error(`[AURRAL] Metadata enrichment failed for "${artistName}":`, err);
    return null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dbRowToEnriched(row: typeof artistMetadataCache.$inferSelect): EnrichedArtistMetadata {
  return {
    artistName: row.artistName,
    mbid: row.mbid ?? null,
    disambiguation: row.disambiguation ?? null,
    artistType: row.artistType ?? null,
    country: row.country ?? null,
    formedYear: row.formedYear ?? null,
    ended: row.ended ?? false,
    tags: (row.tags as { name: string; count: number }[]) ?? [],
    genres: (row.genres as string[]) ?? [],
    bio: (row.bio as Record<string, unknown>) ?? null,
    relations: (row.relations as { type: string; url: string }[]) ?? [],
    similarArtists: (row.similarArtists as { name: string; mbid: string; score: number; image?: string }[]) ?? [],
    releaseGroups: (row.releaseGroups as { id: string; title: string; firstReleaseDate?: string; primaryType?: string }[]) ?? [],
    coverImageUrl: row.coverImageUrl ?? null,
    lidarrId: row.lidarrId ?? null,
    lidarrMonitored: row.lidarrMonitored ?? false,
    fetchedAt: row.fetchedAt,
  };
}
