import { useQuery } from '@tanstack/react-query';
import { useState, useRef, useEffect } from 'react';
import { getArtists } from '@/lib/services/navidrome';
import { Users, Search, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Link } from '@tanstack/react-router';
import { PageLayout, PageSection, EmptyState, LoadingGrid } from '@/components/ui/page-layout';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 60;

function LazyArtistAvatar({ artistId, name, savedImageUrl }: { artistId: string; name: string; savedImageUrl?: string }) {
  const [isVisible, setIsVisible] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [savedError, setSavedError] = useState(false);
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

  const fallback = (
    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0 group-hover:from-primary/30 group-hover:to-primary/10 transition-colors">
      <span className="text-lg font-semibold text-primary">
        {name.charAt(0).toUpperCase()}
      </span>
    </div>
  );

  if (!isVisible) {
    return <div ref={ref}>{fallback}</div>;
  }

  // Navidrome failed but we have a saved Deezer image
  if (imgError && savedImageUrl && !savedError) {
    return (
      <div ref={ref}>
        <img
          src={savedImageUrl}
          alt={name}
          className="w-12 h-12 rounded-full object-cover flex-shrink-0 bg-muted"
          onError={() => setSavedError(true)}
        />
      </div>
    );
  }

  // Both failed — show letter initial
  if (imgError) {
    return <div ref={ref}>{fallback}</div>;
  }

  return (
    <div ref={ref}>
      <img
        src={`/api/navidrome/rest/getCoverArt?id=${artistId}&size=96`}
        alt={name}
        className="w-12 h-12 rounded-full object-cover flex-shrink-0 bg-muted"
        onError={() => setImgError(true)}
      />
    </div>
  );
}

export function ArtistsList() {
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const { data: artists = [], isLoading, error } = useQuery({
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

  // Filter and sort
  const filtered = search
    ? artists.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()))
    : artists;
  const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  const visible = sorted.slice(0, visibleCount);
  const hasMore = visibleCount < sorted.length;

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
      description={`${sorted.length} artists in your library`}
      icon={<Users className="h-5 w-5" />}
      backLink="/dashboard"
      backLabel="Dashboard"
    >
      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search artists..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Artists Grid */}
      <PageSection>
        {isLoading ? (
          <LoadingGrid count={12} />
        ) : visible.length === 0 ? (
          <EmptyState
            title="No artists found"
            description={search ? `No results for "${search}"` : 'Check your library configuration.'}
            icon={<Users className="h-6 w-6" />}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {visible.map((artist) => (
                <Link
                  key={artist.id}
                  to="/library/artists/$id"
                  params={{ id: artist.id }}
                  className="group"
                >
                  <div className={cn(
                    'flex items-center gap-4 p-4 sm:p-5 rounded-xl border transition-all duration-200',
                    'bg-card border-border hover:border-primary/30',
                    'hover:shadow-md hover:-translate-y-0.5'
                  )}>
                    <LazyArtistAvatar artistId={artist.id} name={artist.name} savedImageUrl={savedImages[artist.name.toLowerCase()]} />

                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                        {artist.name}
                      </h3>
                      {artist.albumCount && (
                        <p className="text-sm text-muted-foreground">
                          {artist.albumCount} album{artist.albumCount !== 1 ? 's' : ''}
                        </p>
                      )}
                    </div>

                    <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                  </div>
                </Link>
              ))}
            </div>

            {hasMore && (
              <div className="flex justify-center pt-4">
                <Button
                  variant="outline"
                  onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                >
                  Show more ({sorted.length - visibleCount} remaining)
                </Button>
              </div>
            )}
          </>
        )}
      </PageSection>
    </PageLayout>
  );
}
