import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { EnrichedArtistMetadata, AurralDiscoveryResponse, AurralRecentArtist, AurralSimilarArtist } from '@/lib/services/aurral';

// ─── Artist Metadata ─────────────────────────────────────────────────────────

interface MetadataResponse {
  data: {
    metadata: EnrichedArtistMetadata | null;
    found: boolean;
  };
}

async function fetchArtistMetadata(name: string, navidromeId?: string): Promise<EnrichedArtistMetadata | null> {
  const params = new URLSearchParams({ name });
  if (navidromeId) params.set('navidromeId', navidromeId);

  const res = await fetch(`/api/aurral/metadata?${params}`);
  if (res.status === 503) return null; // Aurral not configured
  if (!res.ok) return null;

  const json = await res.json() as MetadataResponse;
  return json.data?.metadata ?? null;
}

/**
 * Fetch enriched artist metadata from Aurral/MusicBrainz (cached server-side).
 * Returns null gracefully if Aurral is not configured or artist not found.
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
    retry: 1,
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

export function useAddArtistToLibrary() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ mbid, artistName }: { mbid: string; artistName: string }) => {
      const res = await fetch('/api/aurral/add-artist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mbid, artistName }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to add artist' }));
        throw new Error((err as { message: string }).message);
      }
      return res.json();
    },
    onSuccess: () => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['aurral-recent'] });
      queryClient.invalidateQueries({ queryKey: ['aurral-downloads'] });
      queryClient.invalidateQueries({ queryKey: ['aurral-discover'] });
    },
  });
}
