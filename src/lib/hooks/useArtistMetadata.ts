import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { EnrichedArtistMetadata, AurralDiscoveryResponse, AurralRecentArtist, AurralSimilarArtist } from '@/lib/services/aurral';

// ─── Artist Metadata ─────────────────────────────────────────────────────────

interface MetadataResponse {
  data: {
    metadata: EnrichedArtistMetadata | null;
    found: boolean;
  };
}

/** The lookup/download service (Aurral) is configured but not answering — retry shortly (#336). */
export class ServiceRestartingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServiceRestartingError';
  }
}

async function fetchArtistMetadata(name: string, navidromeId?: string): Promise<EnrichedArtistMetadata | null> {
  const params = new URLSearchParams({ name });
  if (navidromeId) params.set('navidromeId', navidromeId);

  const res = await fetch(`/api/aurral/metadata?${params}`);
  // 503 has two meanings, told apart by the error code:
  // - AURRAL_NOT_CONFIGURED: intentionally off → null, a clean "no results" state.
  // - AURRAL_UNAVAILABLE: configured but not answering (it wedges every week or two
  //   and a watchdog restarts it) → ServiceRestartingError so the UI says "try again".
  // Any other non-OK status (500, network) is a real failure → plain Error.
  if (res.status === 503) {
    const body = await res.json().catch(() => null) as { code?: string; message?: string } | null;
    if (body?.code === 'AURRAL_UNAVAILABLE') throw new ServiceRestartingError(body.message ?? 'Artist lookup service is not responding');
    return null;
  }
  if (!res.ok) throw new Error(`Metadata lookup failed (HTTP ${res.status})`);

  const json = await res.json() as MetadataResponse;
  return json.data?.metadata ?? null;
}

/**
 * Fetch enriched artist metadata from Aurral/MusicBrainz (cached server-side).
 * Returns null gracefully if Aurral is not configured or artist not found.
 * Throws on real errors so the UI can distinguish "no match" from "service down".
 */
export function useArtistMetadata(artistName: string | undefined, options?: {
  navidromeId?: string;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: ['artist-metadata', artistName, options?.navidromeId],
    queryFn: () => fetchArtistMetadata(artistName!, options?.navidromeId),
    enabled: !!artistName && (options?.enabled !== false),
    staleTime: 30 * 60 * 1000, // 30 min client-side
    gcTime: 60 * 60 * 1000, // 1 hour garbage collection
    refetchOnWindowFocus: false,
    // No retry: Aurral already retries once on the server with a 10s timeout.
    // A second client retry just doubles the time the user stares at a
    // skeleton when Aurral is hung. Fail fast → show error card.
    retry: 0,
  });
}

// ─── Similar Artists ─────────────────────────────────────────────────────────

interface SimilarResponse {
  data: {
    artists: AurralSimilarArtist[];
    mbid: string;
  };
}

async function fetchSimilarArtists(name: string, limit: number): Promise<AurralSimilarArtist[]> {
  const res = await fetch(`/api/aurral/similar?name=${encodeURIComponent(name)}&limit=${limit}`);
  if (!res.ok) return [];
  const json = await res.json() as SimilarResponse;
  return json.data?.artists ?? [];
}

export function useSimilarArtists(artistName: string | undefined, limit = 10) {
  return useQuery({
    queryKey: ['artist-similar', artistName, limit],
    queryFn: () => fetchSimilarArtists(artistName!, limit),
    enabled: !!artistName,
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

// ─── Discovery Recommendations ───────────────────────────────────────────────

interface DiscoveryResponse {
  data: AurralDiscoveryResponse;
}

async function fetchDiscovery(): Promise<AurralDiscoveryResponse | null> {
  const res = await fetch('/api/aurral/discover');
  if (res.status === 503) return null;
  if (!res.ok) return null;
  const json = await res.json() as DiscoveryResponse;
  return json.data ?? null;
}

export function useAurralDiscovery(enabled = true) {
  return useQuery({
    queryKey: ['aurral-discover'],
    queryFn: fetchDiscovery,
    enabled,
    staleTime: 10 * 60 * 1000, // 10 min
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

// ─── Recently Added Artists ──────────────────────────────────────────────────

interface RecentResponse {
  data: { artists: AurralRecentArtist[] };
}

async function fetchRecentArtists(): Promise<AurralRecentArtist[]> {
  const res = await fetch('/api/aurral/recent');
  if (res.status === 503) return [];
  if (!res.ok) return [];
  const json = await res.json() as RecentResponse;
  return json.data?.artists ?? [];
}

export function useRecentArtists(enabled = true) {
  return useQuery({
    queryKey: ['aurral-recent'],
    queryFn: fetchRecentArtists,
    enabled,
    staleTime: 5 * 60 * 1000, // 5 min
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

// ─── Downloads ───────────────────────────────────────────────────────────────

interface DownloadsResponse {
  data: { downloads: unknown[] };
}

async function fetchDownloads(): Promise<unknown[]> {
  const res = await fetch('/api/aurral/downloads');
  if (res.status === 503) return [];
  if (!res.ok) return [];
  const json = await res.json() as DownloadsResponse;
  return json.data?.downloads ?? [];
}

export function useAurralDownloads(enabled = true) {
  return useQuery({
    queryKey: ['aurral-downloads'],
    queryFn: fetchDownloads,
    enabled,
    staleTime: 30 * 1000, // 30 sec (downloads change frequently)
    refetchInterval: 30000, // auto-refresh
    refetchOnWindowFocus: true,
    retry: 1,
  });
}

// ─── Add Artist to Library ───────────────────────────────────────────────────

/**
 * Follow an artist in Lidarr: monitored, future releases download (#435).
 * Goes through AIDJ's Lidarr request flow, not Aurral — Aurral added artists
 * with nothing monitored, so nothing ever downloaded.
 */
export function useAddArtistToLibrary() {
  const request = useLidarrRequest();
  return {
    ...request,
    mutate: (
      { mbid, artistName }: { mbid: string; artistName: string },
      options?: Parameters<typeof request.mutate>[1],
    ) => request.mutate({ mbid, artistName, mode: 'artist' }, options),
  };
}

// ─── Lidarr requests (#436) ──────────────────────────────────────────────────

export type LidarrRequestOutcome = 'monitored' | 'already_monitored' | 'in_library' | 'pending' | 'not_found';
export type LidarrAlbumState = 'in_library' | 'partial' | 'wanted' | 'not_monitored';

export interface LidarrRequestResult {
  outcome: LidarrRequestOutcome;
  message: string;
  lidarrArtistId?: number;
  lidarrAlbumId?: number;
  releaseGroupId?: string;
  releaseTitle?: string;
}

export interface LidarrRequestStatus {
  inLidarr: boolean;
  lidarrArtistId?: number;
  artistMonitored: boolean;
  followingNewReleases: boolean;
  albums: Record<string, { state: LidarrAlbumState; title: string; trackFiles: number; tracks: number }>;
  /** 'artist' for follows, else release-group id → distinct requesters. */
  requests: Record<string, { users: number; byMe: boolean }>;
}

export interface LidarrRequestInput {
  mbid: string;
  artistName: string;
  mode: 'artist' | 'release' | 'song';
  releaseGroupId?: string;
  songTitle?: string;
}

async function postLidarrRequest(input: LidarrRequestInput & { recheck?: boolean }): Promise<LidarrRequestResult> {
  const res = await fetch('/api/lidarr/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json().catch(() => null) as { data?: LidarrRequestResult; message?: string } | null;
  if (!res.ok || !json?.data) throw new Error(json?.message ?? `Request failed (HTTP ${res.status})`);
  return json.data;
}

const RECHECK_DELAYS_MS = [8000, 15000, 30000];

/**
 * Ask Lidarr for an artist / release / song. A 'pending' answer (Lidarr still
 * loading the release, e.g. after widening the profile for a single) is
 * re-checked a few times before giving up.
 */
export function useLidarrRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: LidarrRequestInput): Promise<LidarrRequestResult> => {
      let result = await postLidarrRequest(input);
      for (const delay of RECHECK_DELAYS_MS) {
        if (result.outcome !== 'pending') break;
        await new Promise(resolve => setTimeout(resolve, delay));
        result = await postLidarrRequest({
          ...input,
          mode: result.releaseGroupId ? 'release' : input.mode,
          releaseGroupId: result.releaseGroupId ?? input.releaseGroupId,
          recheck: true,
        });
      }
      if (result.outcome === 'pending') {
        return {
          ...result,
          outcome: 'not_found',
          message: `Lidarr hasn't listed "${result.releaseTitle ?? 'this release'}" yet. Try again in a few minutes.`,
        };
      }
      return result;
    },
    onSettled: (_data, _err, input) => {
      queryClient.invalidateQueries({ queryKey: ['lidarr-request-status', input.mbid] });
      queryClient.invalidateQueries({ queryKey: ['artist-metadata'] });
      queryClient.invalidateQueries({ queryKey: ['aurral-recent'] });
      queryClient.invalidateQueries({ queryKey: ['aurral-discover'] });
    },
  });
}

/** Live Lidarr state for an artist not in the library yet. Polls while something is downloading. */
export function useLidarrRequestStatus(mbid: string | null | undefined) {
  return useQuery({
    queryKey: ['lidarr-request-status', mbid],
    queryFn: async (): Promise<LidarrRequestStatus | null> => {
      const res = await fetch(`/api/lidarr/request-status?mbid=${encodeURIComponent(mbid!)}`);
      if (res.status === 503) return null; // Lidarr not configured
      if (!res.ok) throw new Error(`Lidarr status failed (HTTP ${res.status})`);
      const json = await res.json() as { data: LidarrRequestStatus };
      return json.data;
    },
    enabled: !!mbid,
    staleTime: 15 * 1000,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      const albums = Object.values(query.state.data?.albums ?? {});
      return albums.some(a => a.state === 'wanted' || a.state === 'partial') ? 60 * 1000 : false;
    },
    retry: 1,
  });
}
