import { useAurralDiscovery, useRecentArtists, useAddArtistToLibrary } from '@/lib/hooks/useArtistMetadata';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Compass, Clock, Plus, Loader2, Check, Music, TrendingUp } from 'lucide-react';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { useState } from 'react';

// ─── Recently Added Section ─────────────────────────────────────────────────

function RecentlyAddedSection() {
  const { data: recentArtists = [], isLoading } = useRecentArtists();

  if (isLoading || recentArtists.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-base flex items-center gap-2">
        <Clock className="h-4 w-4 text-emerald-500" />
        Recently Added to Library
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {recentArtists.slice(0, 6).map((artist) => (
          <Card key={artist.id} className="border-border/50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 flex items-center justify-center flex-shrink-0">
                <Music className="h-5 w-5 text-emerald-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{artist.artistName}</p>
                {artist.statistics && (
                  <p className="text-xs text-muted-foreground">
                    {artist.statistics.albumCount} album{artist.statistics.albumCount !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Discovery Recommendation Card ──────────────────────────────────────────

function RecommendationCard({ rec }: { rec: { id: string; name: string; tags: string[]; score: number; sourceArtist: string; image?: string } }) {
  const addArtist = useAddArtistToLibrary();
  const [added, setAdded] = useState(false);

  const handleAdd = () => {
    addArtist.mutate(
      { mbid: rec.id, artistName: rec.name },
      {
        onSuccess: () => {
          setAdded(true);
          toast.success(`Added ${rec.name} to library`);
        },
        onError: (err) => {
          toast.error(err.message || 'Failed to add artist');
        },
      }
    );
  };

  return (
    <Card className="border-border/50 hover:border-primary/20 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {rec.image ? (
            <img
              src={rec.image}
              alt={rec.name}
              className="w-12 h-12 rounded-lg object-cover flex-shrink-0 bg-muted"
            />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0">
              <span className="text-lg font-semibold text-primary">
                {rec.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}

          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{rec.name}</p>
            <p className="text-xs text-muted-foreground truncate">
              Similar to {rec.sourceArtist}
            </p>
            {rec.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {rec.tags.slice(0, 3).map((tag) => (
                  <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <Button
            variant={added ? 'ghost' : 'outline'}
            size="sm"
            className={cn(
              'h-8 w-8 p-0 flex-shrink-0',
              added && 'text-emerald-500'
            )}
            onClick={handleAdd}
            disabled={addArtist.isPending || added}
          >
            {addArtist.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : added ? (
              <Check className="h-4 w-4" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Discovery Section ─────────────────────────────────────────────────

export function AurralDiscoverySection() {
  const { data: discovery, isLoading } = useAurralDiscovery();

  if (isLoading) {
    return (
      <div className="space-y-3">
        <h3 className="font-semibold text-base flex items-center gap-2">
          <Compass className="h-4 w-4 text-primary" />
          Discover New Artists
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={`skeleton-${i}`} className="flex items-center gap-3 p-4 rounded-lg border animate-pulse">
              <div className="w-12 h-12 rounded-lg bg-muted flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-24 rounded bg-muted" />
                <div className="h-3 w-32 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!discovery) {
    return (
      <div className="space-y-3">
        <h3 className="font-semibold text-base flex items-center gap-2">
          <Compass className="h-4 w-4 text-primary" />
          Discover New Artists
        </h3>
        <div className="flex flex-col items-center justify-center py-8 text-center rounded-lg border border-dashed border-border bg-muted/20">
          <Compass className="h-8 w-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">Artist discovery unavailable</p>
          <p className="text-xs text-muted-foreground/60 mt-0.5">Aurral service may be offline</p>
        </div>
      </div>
    );
  }

  const recs = discovery.recommendations?.slice(0, 6) ?? [];
  const trending = discovery.globalTop?.slice(0, 4) ?? [];

  if (recs.length === 0 && trending.length === 0) return null;

  return (
    <div className="space-y-6">
      {/* Recommendations */}
      {recs.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-base flex items-center gap-2">
            <Compass className="h-4 w-4 text-primary" />
            Recommended for You
          </h3>
          {discovery.topGenres && discovery.topGenres.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {discovery.topGenres.slice(0, 5).map((genre) => (
                <Badge key={genre} variant="secondary" className="text-xs bg-primary/10 text-primary border-0">
                  {genre}
                </Badge>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {recs.map((rec) => (
              <RecommendationCard key={rec.id} rec={rec} />
            ))}
          </div>
        </div>
      )}

      {/* Trending */}
      {trending.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-amber-500" />
            Trending
          </h3>
          <div className="flex flex-wrap gap-2">
            {trending.map((artist) => (
              <Badge
                key={artist.id}
                variant="outline"
                className="text-sm py-1 px-3 cursor-default"
              >
                {artist.name}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Recently Added */}
      <RecentlyAddedSection />
    </div>
  );
}
