import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Search, X, ImageIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/lib/toast';

interface AlbumEntry {
  artist: string;
  album: string;
  songId: string;
  playCount: number;
  savedArt: { imageUrl: string; source: string } | null;
}

interface DeezerResult {
  imageUrl: string | null;
  source: string | null;
}

export function AlbumArtSettings() {
  const [searchFilter, setSearchFilter] = useState('');
  const [searchingAlbum, setSearchingAlbum] = useState<string | null>(null);
  const [deezerResults, setDeezerResults] = useState<Record<string, DeezerResult>>({});
  const queryClient = useQueryClient();

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

  const albums = data || [];

  const filtered = useMemo(() => {
    if (!searchFilter) return albums;
    const q = searchFilter.toLowerCase();
    return albums.filter(
      (a) => a.artist.toLowerCase().includes(q) || a.album.toLowerCase().includes(q)
    );
  }, [albums, searchFilter]);

  const totalCount = albums.length;
  const savedCount = albums.filter((a) => a.savedArt).length;
  const missingCount = totalCount - savedCount;

  // Search Deezer for a specific album
  const handleFindArt = async (artist: string, album: string) => {
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
  };

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
      // Optimistic update
      queryClient.setQueryData(['cover-art-missing'], (old: AlbumEntry[] | undefined) => {
        if (!old) return old;
        return old.map((a) =>
          a.artist === params.artist && a.album === params.album
            ? { ...a, savedArt: { imageUrl: params.imageUrl, source: params.source } }
            : a
        );
      });
      // Clear the deezer result for this album
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

  const handleSkip = (artist: string, album: string) => {
    const key = `${artist}::${album}`;
    setDeezerResults((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header stats */}
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span>{totalCount} albums</span>
        <span>&middot;</span>
        <span>{missingCount} missing art</span>
        <span>&middot;</span>
        <span className="text-green-500">{savedCount} saved</span>
      </div>

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
            {searchFilter ? 'No albums match your filter' : 'No albums found in listening history'}
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
                  {album.savedArt ? (
                    <div className="flex items-center gap-1.5 text-green-500">
                      <Check className="h-4 w-4" />
                      <span className="text-xs">{album.savedArt.source}</span>
                    </div>
                  ) : deezerResult ? (
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
