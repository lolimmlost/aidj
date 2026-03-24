import { useQuery } from '@tanstack/react-query';
import { useState, useRef, useEffect } from 'react';
import { getArtists } from '@/lib/services/navidrome';
import { Users, Search, Play, Music } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from '@tanstack/react-router';
import { PageLayout, PageSection, EmptyState } from '@/components/ui/page-layout';
import { cn } from '@/lib/utils';
import { useAudioStore } from '@/lib/stores/audio';
import { getSongsByArtist } from '@/lib/services/navidrome';

import { getArtistGradient, getArtistInitials } from '@/lib/utils/artist-avatar';

const PAGE_SIZE = 60;

function LazyArtistAvatar({
  artistId,
  name,
  savedImageUrl,
}: {
  artistId: string;
  name: string;
  savedImageUrl?: string;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [imgError, setImgError] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const gradient = getArtistGradient(name);
  const initials = getArtistInitials(name);

  const fallback = (
    <div
      className={cn(
        'w-full h-full rounded-full bg-gradient-to-br flex items-center justify-center',
        gradient
      )}
    >
      <span className="text-2xl sm:text-3xl lg:text-4xl font-black text-white/90 select-none">
        {initials}
      </span>
    </div>
  );

  if (!isVisible) {
    return (
      <div ref={ref} className="w-full h-full">
        {fallback}
      </div>
    );
  }

  // Use saved image (Deezer/Aurral — known real artist photos) or gradient initials.
  // We skip Navidrome getCoverArt for artists because it returns a grey star placeholder
  // for missing art (never 404s), which looks worse than our gradient initials.

  if (savedImageUrl && !imgError) {
    return (
      <div ref={ref} className="w-full h-full relative">
        <img
          src={savedImageUrl}
          alt={name}
          className="w-full h-full rounded-full object-cover"
          onError={() => setImgError(true)}
        />
        <div className="absolute inset-0 -z-10">{fallback}</div>
      </div>
    );
  }

  // No saved image — show gradient initials (looks better than Navidrome's grey star)
  return (
    <div ref={ref} className="w-full h-full">
      {fallback}
    </div>
  );
}

interface ArtistCardProps {
  artist: { id: string; name: string; albumCount?: number };
  savedImageUrl?: string;
}

function ArtistCard({ artist, savedImageUrl }: ArtistCardProps) {
  const { playSong } = useAudioStore();

  const handlePlay = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const songs = await getSongsByArtist(artist.id, 0, 50);
      if (songs.length > 0) {
        playSong(songs[0].id, songs);
      }
    } catch {
      // Silently fail — user can navigate to artist page instead
    }
  };

  return (
    <Link
      to="/library/artists/$id"
      params={{ id: artist.id }}
      className="group flex flex-col items-center text-center p-3 sm:p-4 rounded-xl transition-all duration-200 hover:bg-card/60"
    >
      {/* Circular Avatar */}
      <div className="relative mb-3">
        <div
          className={cn(
            'w-28 h-28 sm:w-36 sm:h-36 lg:w-40 lg:h-40 rounded-full overflow-hidden transition-all duration-200',
            'ring-2 ring-transparent group-hover:ring-primary/40 group-hover:shadow-lg group-hover:shadow-primary/20 group-hover:scale-[1.03]'
          )}
        >
          <LazyArtistAvatar
            artistId={artist.id}
            name={artist.name}
            savedImageUrl={savedImageUrl}
          />
        </div>
        {/* Hover Play Button */}
        <Button
          size="icon"
          className="absolute bottom-1 right-1 w-9 h-9 rounded-full shadow-lg shadow-primary/30 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-1 group-hover:translate-y-0"
          onClick={handlePlay}
        >
          <Play className="h-4 w-4 fill-current" />
        </Button>
      </div>

      {/* Info */}
      <h3 className="font-bold text-sm text-foreground truncate w-full">
        {artist.name}
      </h3>
      <div className="flex items-center gap-1.5 mt-1">
        {artist.albumCount ? (
          <span className="text-xs text-muted-foreground">
            {artist.albumCount} album{artist.albumCount !== 1 ? 's' : ''}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

function ArtistCardSkeleton() {
  return (
    <div className="flex flex-col items-center p-4">
      <Skeleton className="w-28 h-28 sm:w-36 sm:h-36 lg:w-40 lg:h-40 rounded-full mb-3" />
      <Skeleton className="h-4 w-24 mb-1.5" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}

const FILTERS = ['All', 'Most Albums', 'A-Z'] as const;

export function ArtistsList() {
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('A-Z');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const {
    data: artists = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['artists'],
    queryFn: () => getArtists(0, 5000),
    staleTime: 5 * 60 * 1000,
  });

  // Fetch saved Deezer artist images for fallback
  const { data: savedImages = {} } = useQuery({
    queryKey: ['saved-artist-images'],
    queryFn: async () => {
      const res = await fetch('/api/cover-art/artist-images');
      if (!res.ok) return {};
      const json = await res.json();
      return (json.data?.images || {}) as Record<string, string>;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch Aurral metadata images as additional fallback
  const { data: metadataImages = {} } = useQuery({
    queryKey: ['artist-metadata-images'],
    queryFn: async () => {
      const res = await fetch('/api/cover-art/artist-metadata-images');
      if (!res.ok) return {};
      const json = await res.json();
      return (json.data?.images || {}) as Record<string, string>;
    },
    staleTime: 10 * 60 * 1000,
  });

  // Filter
  let filtered = search
    ? artists.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()))
    : artists;

  // Sort
  if (activeFilter === 'A-Z') {
    filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  } else if (activeFilter === 'Most Albums') {
    filtered = [...filtered].sort(
      (a, b) => (b.albumCount || 0) - (a.albumCount || 0)
    );
  }

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setVisibleCount(PAGE_SIZE);
  };

  if (error) {
    return (
      <PageLayout
        title="Artists"
        icon={<Users className="h-5 w-5" />}
        backLink="/dashboard"
        backLabel="Dashboard"
      >
        <div className="p-6 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive">
          Error loading artists: {error.message}
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="Artists"
      description={`${filtered.length} artists in your library`}
      icon={<Users className="h-5 w-5" />}
      backLink="/dashboard"
      backLabel="Dashboard"
    >
      {/* Search + Filters */}
      <PageSection>
        <div className="space-y-3">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search artists..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9 h-10 bg-card/50 backdrop-blur-sm border-border/50 rounded-xl text-sm"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={cn(
                  'px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200',
                  activeFilter === f
                    ? 'bg-primary text-primary-foreground shadow-md shadow-primary/25'
                    : 'bg-card/50 text-muted-foreground hover:text-foreground hover:bg-card border border-border/50'
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </PageSection>

      {/* Artist Grid */}
      <PageSection>
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-5">
            {Array.from({ length: 12 }).map((_, i) => (
              <ArtistCardSkeleton key={i} />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            title="No artists found"
            description={
              search
                ? `No results for "${search}"`
                : 'Check your library configuration.'
            }
            icon={<Music className="h-6 w-6" />}
            action={
              search && (
                <Button variant="outline" onClick={() => setSearch('')}>
                  Clear Search
                </Button>
              )
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-5">
              {visible.map((artist) => {
                const key = artist.name.toLowerCase();
                return (
                  <ArtistCard
                    key={artist.id}
                    artist={artist}
                    savedImageUrl={savedImages[key] || metadataImages[key]}
                  />
                );
              })}
            </div>

            {hasMore && (
              <div className="flex justify-center pt-4">
                <Button
                  variant="outline"
                  onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                >
                  Show more ({filtered.length - visibleCount} remaining)
                </Button>
              </div>
            )}
          </>
        )}
      </PageSection>
    </PageLayout>
  );
}
