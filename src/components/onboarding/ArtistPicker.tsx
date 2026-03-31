import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, Check, X, Music, Loader2 } from 'lucide-react';

interface ArtistItem {
  id: string;
  name: string;
  albumCount: number;
  songCount: number;
}

interface ArtistPickerProps {
  onComplete: () => void;
}

const MIN_ARTISTS = 3;

export function ArtistPicker({ onComplete }: ArtistPickerProps) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selected, setSelected] = useState<ArtistItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 300ms debounce
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const { data, isLoading } = useQuery<{ artists: ArtistItem[] }>({
    queryKey: ['onboarding-artists', debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '20' });
      if (debouncedSearch) params.set('search', debouncedSearch);
      const res = await fetch(`/api/onboarding/artists?${params}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch artists');
      const json = await res.json();
      return json.data;
    },
    staleTime: 30_000,
    enabled: debouncedSearch.length >= 2 || debouncedSearch.length === 0,
  });

  const artists = data?.artists ?? [];
  const selectedIds = new Set(selected.map((a) => a.id));

  // Filter out already-selected from dropdown
  const dropdownArtists = artists.filter((a) => !selectedIds.has(a.id));

  const selectArtist = useCallback((artist: ArtistItem) => {
    setSelected((prev) => [...prev, artist]);
    setSearch('');
    setShowDropdown(false);
    inputRef.current?.focus();
  }, []);

  const removeArtist = useCallback((id: string) => {
    setSelected((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleContinue = useCallback(async () => {
    if (selected.length < MIN_ARTISTS) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/onboarding/artists/select', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistIds: selected.map((a) => a.id) }),
      });
      if (!res.ok) throw new Error('Failed to save artist selections');
      onComplete();
    } catch (err) {
      console.error('Failed to save artist selections:', err);
    } finally {
      setIsSaving(false);
    }
  }, [selected, onComplete]);

  const canContinue = selected.length >= MIN_ARTISTS;

  return (
    <Card className="space-y-4 p-6">
      <div>
        <h2 className="text-xl font-semibold">Pick Your Artists</h2>
        <p className="text-sm text-muted-foreground">
          Search and select at least {MIN_ARTISTS} artists you enjoy.
        </p>
      </div>

      {/* Selected artists row */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((artist) => (
            <div
              key={artist.id}
              className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 pl-1 pr-2 py-1"
            >
              <img
                src={`/api/navidrome/rest/getCoverArt?id=${artist.id}&size=32`}
                alt=""
                className="h-6 w-6 rounded-full object-cover bg-muted"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              <span className="text-sm font-medium">{artist.name}</span>
              <button
                onClick={() => removeArtist(artist.id)}
                className="ml-0.5 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={`Remove ${artist.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Search with dropdown */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          placeholder="Search for an artist..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          className="pl-10"
        />

        {/* Dropdown results */}
        {showDropdown && search.length >= 2 && (
          <div
            ref={dropdownRef}
            className="absolute z-50 mt-1 w-full rounded-lg border bg-popover shadow-lg max-h-64 overflow-y-auto"
          >
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : dropdownArtists.length === 0 ? (
              <div className="py-4 text-center text-sm text-muted-foreground">
                No artists found for "{search}"
              </div>
            ) : (
              dropdownArtists.map((artist) => (
                <button
                  key={artist.id}
                  onClick={() => selectArtist(artist)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 hover:bg-accent transition-colors text-left"
                >
                  <img
                    src={`/api/navidrome/rest/getCoverArt?id=${artist.id}&size=48`}
                    alt=""
                    className="h-10 w-10 rounded-full object-cover bg-muted shrink-0"
                    onError={(e) => {
                      const img = e.target as HTMLImageElement;
                      img.style.display = 'none';
                      img.nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                  <div className="h-10 w-10 rounded-full bg-muted items-center justify-center shrink-0 hidden">
                    <Music className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{artist.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {artist.songCount} song{artist.songCount !== 1 ? 's' : ''}
                      {artist.albumCount > 0 && ` · ${artist.albumCount} album${artist.albumCount !== 1 ? 's' : ''}`}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Status */}
      <div className="flex items-center gap-2">
        <Badge variant={canContinue ? 'default' : 'secondary'}>
          {selected.length} selected
        </Badge>
        {!canContinue && (
          <span className="text-sm text-muted-foreground">
            {MIN_ARTISTS - selected.length} more to go
          </span>
        )}
      </div>

      {/* Continue Button */}
      <div className="flex justify-end pt-2">
        <Button
          onClick={handleContinue}
          disabled={!canContinue || isSaving}
          className="min-w-[120px]"
        >
          {isSaving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          Continue
        </Button>
      </div>
    </Card>
  );
}
