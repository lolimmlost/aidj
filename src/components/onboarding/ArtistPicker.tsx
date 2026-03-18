import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, Check, Music, Loader2 } from 'lucide-react';

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
const PAGE_SIZE = 50;

export function ArtistPicker({ onComplete }: ArtistPickerProps) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  // 300ms debounce for search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useQuery<{ artists: ArtistItem[]; total: number }>({
    queryKey: ['onboarding-artists', debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams({
        start: '0',
        limit: String(PAGE_SIZE),
      });
      if (debouncedSearch) params.set('search', debouncedSearch);
      const res = await fetch(`/api/onboarding/artists?${params}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch artists');
      const json = await res.json();
      return json.data;
    },
    staleTime: 30_000,
  });

  const artists = data?.artists ?? [];

  const toggleArtist = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleContinue = useCallback(async () => {
    if (selectedIds.size < MIN_ARTISTS) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/onboarding/artists/select', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistIds: Array.from(selectedIds) }),
      });
      if (!res.ok) throw new Error('Failed to save artist selections');
      onComplete();
    } catch (err) {
      console.error('Failed to save artist selections:', err);
    } finally {
      setIsSaving(false);
    }
  }, [selectedIds, onComplete]);

  const canContinue = selectedIds.size >= MIN_ARTISTS;

  return (
    <Card className="space-y-4 p-6">
      <div>
        <h2 className="text-xl font-semibold">Pick Your Artists</h2>
        <p className="text-sm text-muted-foreground">
          Choose artists you enjoy to personalize your recommendations.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search artists..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Selected counter */}
      <div className="flex items-center gap-2">
        <Badge variant={canContinue ? 'default' : 'secondary'}>
          {selectedIds.size} selected
        </Badge>
        {!canContinue && (
          <span className="text-sm text-muted-foreground">
            Pick at least {MIN_ARTISTS} artists you enjoy
          </span>
        )}
      </div>

      {/* Artist Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {artists.map((artist) => {
            const isSelected = selectedIds.has(artist.id);
            return (
              <button
                key={artist.id}
                onClick={() => toggleArtist(artist.id)}
                className={`group relative flex flex-col items-center gap-2 rounded-xl border p-3 transition-all ${
                  isSelected
                    ? 'border-primary bg-primary/10 ring-1 ring-primary'
                    : 'border-border bg-card hover:border-primary/50'
                }`}
              >
                {/* Artist Avatar */}
                <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                  <Music className="h-6 w-6 text-muted-foreground" />
                  {isSelected && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-full bg-primary/80">
                      <Check className="h-5 w-5 text-primary-foreground" />
                    </div>
                  )}
                </div>

                {/* Artist Info */}
                <div className="w-full text-center">
                  <p className="truncate text-sm font-medium">{artist.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {artist.songCount} songs
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {!isLoading && artists.length === 0 && (
        <div className="py-8 text-center text-sm text-muted-foreground">
          No artists found{search ? ` for "${search}"` : ''}.
        </div>
      )}

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
