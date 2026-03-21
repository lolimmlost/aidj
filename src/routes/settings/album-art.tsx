import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Search, X, ImageIcon, Loader2, Music, User, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/lib/toast';

// ─── Types ──────────────────────────────────────────────────────────────────

interface AlbumEntry {
  artist: string;
  album: string;
  songId: string;
  playCount: number;
  savedArt: { imageUrl: string; source: string } | null;
}

interface ArtistEntry {
  artist: string;
  playCount: number;
  savedArt: { imageUrl: string; source: string } | null;
}

interface DeezerResult {
  imageUrl: string | null;
  source: string | null;
}

type Tab = 'albums' | 'artists';

interface AutoFetchJob {
  id: string;
  type: string;
  status: 'processing' | 'completed' | 'failed';
  total: number;
  processed: number;
  found: number;
  notFound: number;
  errors: number;
}

// ─── Auto-fetch hook (job-based with polling) ───────────────────────────────

function useAutoFetch(type: 'albums' | 'artists', queryClient: ReturnType<typeof useQueryClient>) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [lastResult, setLastResult] = useState<AutoFetchJob | null>(null);

  // Poll job status every 2 seconds while running
  const { data: jobData } = useQuery({
    queryKey: ['cover-art-auto-fetch', jobId],
    queryFn: async () => {
      const res = await fetch(`/api/cover-art/auto-fetch?jobId=${jobId}`);
      if (!res.ok) throw new Error('Failed to fetch job status');
      const json = await res.json();
      // Handle both { data: { job: ... } } and { job: ... } shapes
      const job = json.data?.job ?? json.job ?? json.data;
      console.log('[auto-fetch] Poll result:', JSON.stringify(job));
      return job as AutoFetchJob;
    },
    enabled: !!jobId && polling,
    refetchInterval: 2000,
  });

  // Watch for job completion
  useEffect(() => {
    if (!jobData || !jobData.status) return;

    if (jobData.status === 'completed') {
      setPolling(false);
      setLastResult(jobData);
      toast.success(`Found art for ${jobData.found ?? 0} ${type}, ${jobData.notFound ?? 0} not on Deezer`);
      queryClient.invalidateQueries({ queryKey: ['cover-art-missing'] });
      queryClient.invalidateQueries({ queryKey: ['cover-art-missing-artists'] });
      queryClient.invalidateQueries({ queryKey: ['saved-artist-images'] });
    } else if (jobData.status === 'failed') {
      setPolling(false);
      setLastResult(jobData);
      toast.error(`Auto-fetch ${type} failed`);
    }
  }, [jobData, type, queryClient]);

  const run = useCallback(async () => {
    setLastResult(null);
    try {
      const res = await fetch('/api/cover-art/auto-fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      if (!res.ok) throw new Error('Auto-fetch failed');
      const json = await res.json();
      const id = (json.data?.jobId ?? json.jobId) as string;
      console.log('[auto-fetch] Started job:', id, JSON.stringify(json));
      if (!id) throw new Error('No jobId in response');
      setJobId(id);
      setPolling(true);
    } catch {
      toast.error(`Failed to start auto-fetch for ${type}`);
    }
  }, [type]);

  const job = polling ? jobData : lastResult;
  const running = polling;
  const progress = job && job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0;

  return { run, running, job, progress };
}

// ─── Auto-fetch progress display ────────────────────────────────────────────

function AutoFetchProgress({ job, progress }: { job: AutoFetchJob; progress: number }) {
  const isRunning = job.status === 'processing';
  const isDone = job.status === 'completed';
  const isFailed = job.status === 'failed';

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium">
          {isRunning && <Loader2 className="h-3 w-3 animate-spin" />}
          {isDone && <Check className="h-3 w-3 text-green-500" />}
          {isFailed && <X className="h-3 w-3 text-destructive" />}
          {isRunning ? 'Searching Deezer...' : isDone ? 'Complete' : 'Failed'}
        </span>
        {job.total > 0 && (
          <span className="text-muted-foreground">
            {job.processed} / {job.total}
          </span>
        )}
      </div>
      {job.total > 0 && (
        <Progress value={progress} className="h-1.5" />
      )}
      {(isDone || isFailed) && (
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="text-green-500">{job.found} found</span>
          <span>{job.notFound} not on Deezer</span>
          {job.errors > 0 && <span className="text-destructive">{job.errors} errors</span>}
        </div>
      )}
    </div>
  );
}

// ─── Navidrome art probe hook ───────────────────────────────────────────────

/**
 * Probes Navidrome cover art URLs to check which albums actually have art.
 * Albums with valid Navidrome art are hidden from the "missing" list.
 */
function useNavidromeArtProbe(albums: AlbumEntry[]) {
  const [hasArt, setHasArt] = useState<Record<string, boolean>>({});
  const [probesDone, setProbesDone] = useState(0);

  useEffect(() => {
    if (albums.length === 0) return;

    setHasArt({});
    setProbesDone(0);

    // Probe in batches to avoid hammering the server
    const BATCH_SIZE = 10;
    let cancelled = false;

    async function probeBatch(batch: AlbumEntry[]) {
      await Promise.all(
        batch.map(
          (album) =>
            new Promise<void>((resolve) => {
              const key = `${album.artist}::${album.album}`;
              const img = new Image();
              img.onload = () => {
                if (!cancelled) {
                  // Check if it's a real image (not a tiny placeholder)
                  if (img.naturalWidth > 1 && img.naturalHeight > 1) {
                    setHasArt((prev) => ({ ...prev, [key]: true }));
                  }
                  setProbesDone((prev) => prev + 1);
                }
                resolve();
              };
              img.onerror = () => {
                if (!cancelled) {
                  setProbesDone((prev) => prev + 1);
                }
                resolve();
              };
              img.src = `/api/navidrome/rest/getCoverArt?id=${album.songId}&size=80`;
            })
        )
      );
    }

    (async () => {
      for (let i = 0; i < albums.length; i += BATCH_SIZE) {
        if (cancelled) break;
        await probeBatch(albums.slice(i, i + BATCH_SIZE));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [albums]);

  return { hasArt, probing: probesDone < albums.length && albums.length > 0 };
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function AlbumArtSettings() {
  const [tab, setTab] = useState<Tab>('albums');

  return (
    <div className="space-y-6">
      {/* Tab toggle */}
      <div className="flex gap-1 p-1 rounded-lg bg-muted w-fit">
        <button
          onClick={() => setTab('albums')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === 'albums'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Music className="h-3.5 w-3.5" />
          Albums
        </button>
        <button
          onClick={() => setTab('artists')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === 'artists'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <User className="h-3.5 w-3.5" />
          Artists
        </button>
      </div>

      {tab === 'albums' ? <AlbumsTab /> : <ArtistsTab />}
    </div>
  );
}

// ─── Albums Tab ─────────────────────────────────────────────────────────────

function AlbumsTab() {
  const [searchFilter, setSearchFilter] = useState('');
  const [searchingAlbum, setSearchingAlbum] = useState<string | null>(null);
  const [deezerResults, setDeezerResults] = useState<Record<string, DeezerResult>>({});
  const queryClient = useQueryClient();
  const autoFetch = useAutoFetch('albums', queryClient);

  const { data, isLoading } = useQuery({
    queryKey: ['cover-art-missing'],
    queryFn: async () => {
      const res = await fetch('/api/cover-art/missing');
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      return json.data?.albums as AlbumEntry[] || [];
    },
    staleTime: 0,
  });

  const albums = useMemo(() => data || [], [data]);

  // Probe Navidrome for which albums already have art
  const { hasArt, probing } = useNavidromeArtProbe(albums);

  // Filter out albums that already have Navidrome art
  const missingAlbums = useMemo(() => {
    return albums.filter((a) => {
      const key = `${a.artist}::${a.album}`;
      return !hasArt[key];
    });
  }, [albums, hasArt]);

  const filtered = useMemo(() => {
    if (!searchFilter) return missingAlbums;
    const q = searchFilter.toLowerCase();
    return missingAlbums.filter(
      (a) => a.artist.toLowerCase().includes(q) || a.album.toLowerCase().includes(q)
    );
  }, [missingAlbums, searchFilter]);

  const navidromeArtCount = Object.values(hasArt).filter(Boolean).length;

  // Search Deezer for a specific album
  const handleFindArt = useCallback(async (artist: string, album: string) => {
    const key = `${artist}::${album}`;
    setSearchingAlbum(key);
    try {
      const res = await fetch(
        `/api/cover-art/search?artist=${encodeURIComponent(artist)}&album=${encodeURIComponent(album)}`
      );
      if (!res.ok) throw new Error('Search failed');
      const json = await res.json();
      setDeezerResults((prev) => ({
        ...prev,
        [key]: json.data as DeezerResult,
      }));
    } catch {
      toast.error(`Failed to search art for ${album}`);
    } finally {
      setSearchingAlbum(null);
    }
  }, []);

  // Save cover art
  const saveMutation = useMutation({
    mutationFn: async (params: { artist: string; album: string; imageUrl: string; source: string }) => {
      const entityId = `album:${params.artist.toLowerCase()}:${params.album.toLowerCase()}`;
      const res = await fetch('/api/cover-art/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityId,
          entityType: 'album',
          artist: params.artist,
          album: params.album,
          imageUrl: params.imageUrl,
          source: params.source,
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      return params;
    },
    onSuccess: (params) => {
      queryClient.invalidateQueries({ queryKey: ['cover-art-missing'] });
      const key = `${params.artist}::${params.album}`;
      setDeezerResults((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      toast.success(`Saved art for ${params.album}`);
    },
    onError: (_err, params) => {
      toast.error(`Failed to save art for ${params.album}`);
    },
  });

  const handleSkip = useCallback((artist: string, album: string) => {
    const key = `${artist}::${album}`;
    setDeezerResults((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header stats + auto-fetch */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>{albums.length} albums in history</span>
          <span>&middot;</span>
          <span className="text-green-500">{navidromeArtCount} have Navidrome art</span>
          <span>&middot;</span>
          <span>{missingAlbums.length} missing</span>
          {probing && (
            <>
              <span>&middot;</span>
              <span className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Checking...
              </span>
            </>
          )}
        </div>
        {missingAlbums.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs"
            onClick={autoFetch.run}
            disabled={autoFetch.running || probing}
          >
            {autoFetch.running ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Zap className="h-3 w-3" />
            )}
            {autoFetch.running ? 'Fetching...' : 'Auto-fetch All'}
          </Button>
        )}
      </div>
      {autoFetch.job && <AutoFetchProgress job={autoFetch.job} progress={autoFetch.progress} />}

      {/* Search filter */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Filter by artist or album..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Album list */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            {searchFilter
              ? 'No albums match your filter'
              : probing
                ? 'Checking for missing art...'
                : 'All albums have artwork!'}
          </p>
        )}
        {filtered.map((album) => {
          const key = `${album.artist}::${album.album}`;
          const deezerResult = deezerResults[key];
          const isSearching = searchingAlbum === key;

          return (
            <Card key={key} className="p-3">
              <div className="flex items-center gap-3">
                {/* Navidrome thumbnail */}
                <div className="w-10 h-10 rounded bg-muted flex-shrink-0 overflow-hidden">
                  <img
                    src={`/api/navidrome/rest/getCoverArt?id=${album.songId}&size=80`}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{album.album}</p>
                  <p className="text-xs text-muted-foreground truncate">{album.artist}</p>
                </div>

                {/* Play count badge */}
                <Badge variant="secondary" className="flex-shrink-0 text-xs">
                  {album.playCount} plays
                </Badge>

                {/* Action area */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {deezerResult ? (
                    deezerResult.imageUrl ? (
                      <div className="flex items-center gap-2">
                        <img
                          src={deezerResult.imageUrl}
                          alt="Deezer art"
                          className="w-12 h-12 rounded object-cover border"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-green-500 hover:text-green-600 hover:bg-green-500/10"
                          onClick={() =>
                            saveMutation.mutate({
                              artist: album.artist,
                              album: album.album,
                              imageUrl: deezerResult.imageUrl!,
                              source: deezerResult.source || 'deezer',
                            })
                          }
                          disabled={saveMutation.isPending}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleSkip(album.artist, album.album)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">No art found</span>
                    )
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs gap-1.5"
                      onClick={() => handleFindArt(album.artist, album.album)}
                      disabled={isSearching}
                    >
                      {isSearching ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <ImageIcon className="h-3 w-3" />
                      )}
                      Find Art
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── Artists Tab ─────────────────────────────────────────────────────────────

function ArtistsTab() {
  const [searchFilter, setSearchFilter] = useState('');
  const [searchingArtist, setSearchingArtist] = useState<string | null>(null);
  const [deezerResults, setDeezerResults] = useState<Record<string, DeezerResult>>({});
  const queryClient = useQueryClient();
  const autoFetch = useAutoFetch('artists', queryClient);

  const { data, isLoading } = useQuery({
    queryKey: ['cover-art-missing-artists'],
    queryFn: async () => {
      const res = await fetch('/api/cover-art/missing-artists');
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      return json.data?.artists as ArtistEntry[] || [];
    },
    staleTime: 0,
  });

  const artists = useMemo(() => data || [], [data]);

  const filtered = useMemo(() => {
    if (!searchFilter) return artists;
    const q = searchFilter.toLowerCase();
    return artists.filter((a) => a.artist.toLowerCase().includes(q));
  }, [artists, searchFilter]);

  // Search Deezer for artist image
  const handleFindArt = useCallback(async (artist: string) => {
    setSearchingArtist(artist);
    try {
      const res = await fetch(
        `/api/cover-art/search-artist?artist=${encodeURIComponent(artist)}`
      );
      if (!res.ok) throw new Error('Search failed');
      const json = await res.json();
      setDeezerResults((prev) => ({
        ...prev,
        [artist]: json.data as DeezerResult,
      }));
    } catch {
      toast.error(`Failed to search image for ${artist}`);
    } finally {
      setSearchingArtist(null);
    }
  }, []);

  // Save artist image
  const saveMutation = useMutation({
    mutationFn: async (params: { artist: string; imageUrl: string; source: string }) => {
      const entityId = `artist:${params.artist.toLowerCase()}`;
      const res = await fetch('/api/cover-art/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityId,
          entityType: 'artist',
          artist: params.artist,
          imageUrl: params.imageUrl,
          source: params.source,
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      return params;
    },
    onSuccess: (params) => {
      queryClient.invalidateQueries({ queryKey: ['cover-art-missing-artists'] });
      queryClient.invalidateQueries({ queryKey: ['saved-artist-images'] });
      setDeezerResults((prev) => {
        const next = { ...prev };
        delete next[params.artist];
        return next;
      });
      toast.success(`Saved image for ${params.artist}`);
    },
    onError: (_err, params) => {
      toast.error(`Failed to save image for ${params.artist}`);
    },
  });

  const handleSkip = useCallback((artist: string) => {
    setDeezerResults((prev) => {
      const next = { ...prev };
      delete next[artist];
      return next;
    });
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header stats + auto-fetch */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>{artists.length} artists missing images</span>
        </div>
        {artists.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs"
            onClick={autoFetch.run}
            disabled={autoFetch.running}
          >
            {autoFetch.running ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Zap className="h-3 w-3" />
            )}
            {autoFetch.running ? 'Fetching...' : 'Auto-fetch All'}
          </Button>
        )}
      </div>
      {autoFetch.job && <AutoFetchProgress job={autoFetch.job} progress={autoFetch.progress} />}

      {/* Search filter */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Filter by artist..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Artist list */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            {searchFilter ? 'No artists match your filter' : 'All artists have images!'}
          </p>
        )}
        {filtered.map((entry) => {
          const deezerResult = deezerResults[entry.artist];
          const isSearching = searchingArtist === entry.artist;

          return (
            <Card key={entry.artist} className="p-3">
              <div className="flex items-center gap-3">
                {/* Artist initial */}
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0">
                  <span className="text-lg font-semibold text-primary">
                    {entry.artist.charAt(0).toUpperCase()}
                  </span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{entry.artist}</p>
                </div>

                {/* Play count badge */}
                <Badge variant="secondary" className="flex-shrink-0 text-xs">
                  {entry.playCount} plays
                </Badge>

                {/* Action area */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {deezerResult ? (
                    deezerResult.imageUrl ? (
                      <div className="flex items-center gap-2">
                        <img
                          src={deezerResult.imageUrl}
                          alt="Deezer artist"
                          className="w-12 h-12 rounded-full object-cover border"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-green-500 hover:text-green-600 hover:bg-green-500/10"
                          onClick={() =>
                            saveMutation.mutate({
                              artist: entry.artist,
                              imageUrl: deezerResult.imageUrl!,
                              source: deezerResult.source || 'deezer',
                            })
                          }
                          disabled={saveMutation.isPending}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleSkip(entry.artist)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">No image found</span>
                    )
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs gap-1.5"
                      onClick={() => handleFindArt(entry.artist)}
                      disabled={isSearching}
                    >
                      {isSearching ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <ImageIcon className="h-3 w-3" />
                      )}
                      Find Image
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
