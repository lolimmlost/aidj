import { useQuery } from '@tanstack/react-query';
import { useState, useRef, useEffect } from 'react';
import { getArtists } from '@/lib/services/navidrome';
import { Users, Play, Music, Search as SearchIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from '@tanstack/react-router';
import { PageLayout, PageSection, EmptyState } from '@/components/ui/page-layout';
import { cn } from '@/lib/utils';
import { useAudioStore } from '@/lib/stores/audio';
import { getSongsByArtist } from '@/lib/services/navidrome';

import { getArtistGradient, getArtistInitials } from '@/lib/utils/artist-avatar';

const PAGE_SIZE = 60;

export function LazyArtistAvatar({
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

export function ArtistCard({ artist, savedImageUrl }: ArtistCardProps) {
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
        {/* Play Button — always tappable on touch, hover-reveal on desktop */}
        <Button
          size="icon"
          className="absolute bottom-1 right-1 w-9 h-9 rounded-full shadow-lg shadow-primary/30 transition-all duration-200 opacity-100 md:opacity-0 md:translate-y-1 md:group-hover:opacity-100 md:group-hover:translate-y-0"
          onClick={handlePlay}
          aria-label={`Play ${artist.name}`}
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

const FILTERS = ['Most Albums', 'A-Z'] as const;

type ArtistWithCounts = {
  id: string;
  name: string;
  albumCount?: number;
  songCount?: number;
};

export function ArtistsList() {
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

  // Fetch unified artist images (Aurral + Deezer merged) in a single request
  const { data: allArtistImages = {} } = useQuery({
    queryKey: ['all-artist-images'],
    queryFn: async () => {
      const res = await fetch('/api/cover-art/all-artist-images');
      if (!res.ok) return {};
      const json = await res.json();
      return (json.data?.images || {}) as Record<string, string>;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Filter out ghost artists (no albums and no songs — tag-only residue)
  let filtered = (artists as ArtistWithCounts[]).filter(
    (a) => (a.albumCount ?? 0) > 0 || (a.songCount ?? 0) > 0
  );

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
      {/* Filters + Search link */}
      <PageSection>
        <div className="flex items-center justify-between gap-3 flex-wrap">
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
          <Link
            to="/library/search"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <SearchIcon className="h-3.5 w-3.5" />
            Search library
          </Link>
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
            description="Check your library configuration."
            icon={<Music className="h-6 w-6" />}
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
                    savedImageUrl={allArtistImages[key]}
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
