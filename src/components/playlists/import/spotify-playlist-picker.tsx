import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Music, Search, ListMusic } from 'lucide-react';
import type { SpotifyPlaylistSummary } from '@/lib/services/spotify';

interface SpotifyPlaylistPickerProps {
  onSelect: (playlist: SpotifyPlaylistSummary) => void;
}

export function SpotifyPlaylistPicker({ onSelect }: SpotifyPlaylistPickerProps) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['spotify-playlists'],
    queryFn: async () => {
      const res = await fetch('/api/playlists/spotify-playlists', { credentials: 'include' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to load playlists');
      }
      const json = await res.json();
      return json.data.playlists as SpotifyPlaylistSummary[];
    },
  });

  const playlists = data ?? [];
  const filtered = search
    ? playlists.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.owner.toLowerCase().includes(search.toLowerCase())
      )
    : playlists;

  const selected = playlists.find((p) => p.id === selectedId);

  if (error) {
    return (
      <div className="text-center py-6 text-sm text-destructive">
        {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search filter */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Filter playlists..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 text-sm"
        />
      </div>

      {/* Playlist list */}
      <ScrollArea className="h-[280px] rounded-md border">
        {isLoading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-2">
                <Skeleton className="h-10 w-10 rounded" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-10">
            <ListMusic className="h-8 w-8 mb-2" />
            <p className="text-sm">{search ? 'No playlists match your search' : 'No playlists found'}</p>
          </div>
        ) : (
          <div className="p-1">
            {filtered.map((playlist) => (
              <button
                key={playlist.id}
                onClick={() => setSelectedId(playlist.id)}
                className={`w-full flex items-center gap-3 p-2 rounded-md text-left transition-colors hover:bg-accent ${
                  selectedId === playlist.id ? 'bg-accent ring-1 ring-primary' : ''
                }`}
              >
                {playlist.imageUrl ? (
                  <img
                    src={playlist.imageUrl}
                    alt=""
                    className="h-10 w-10 rounded object-cover shrink-0"
                  />
                ) : (
                  <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                    <Music className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{playlist.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {playlist.owner} &middot; {playlist.trackCount} tracks
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Import button */}
      <Button
        onClick={() => selected && onSelect(selected)}
        disabled={!selected}
        className="w-full"
        size="sm"
      >
        {selected ? `Import "${selected.name}"` : 'Select a playlist to import'}
      </Button>
    </div>
  );
}
