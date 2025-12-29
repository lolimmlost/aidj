/**
 * DiscoveryFeed - Main discovery feed component
 *
 * Displays a personalized feed of music recommendations based on:
 * - Time of day
 * - Listening patterns
 * - User preferences
 * - Historical engagement
 */

import { useEffect, useCallback, memo, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  RefreshCw,
  Sparkles,
  Clock,
  Sunrise,
  Sun,
  Sunset,
  Moon,
  Loader2,
  Music2,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useDiscoveryFeedStore, type FeedItem, type TimeSlot } from '@/lib/stores/discovery-feed';
import { DiscoveryFeedCard } from './DiscoveryFeedCard';

interface DiscoveryFeedProps {
  onPlaySong?: (songId: string) => void;
  onQueueSong?: (songId: string, position: 'next' | 'end') => void;
  className?: string;
}

// Time slot tab configuration
const TIME_TABS: { value: TimeSlot | 'any'; label: string; icon: typeof Sun }[] = [
  { value: 'any', label: 'All', icon: Clock },
  { value: 'morning', label: 'Morning', icon: Sunrise },
  { value: 'afternoon', label: 'Afternoon', icon: Sun },
  { value: 'evening', label: 'Evening', icon: Sunset },
  { value: 'night', label: 'Night', icon: Moon },
];

export const DiscoveryFeed = memo(function DiscoveryFeed({
  onPlaySong,
  onQueueSong,
  className,
}: DiscoveryFeedProps) {
  const {
    items, // Need to subscribe to items for re-renders when they change
    isLoading,
    error,
    hasMore,
    currentTimeContext,
    currentPattern,
    activeFilter,
    fetchFeed,
    refreshFeed,
    loadMore,
    markClicked,
    markPlayed,
    markSaved,
    provideFeedback,
    dismissItem,
    setActiveFilter,
    getFilteredItems,
  } = useDiscoveryFeedStore();

  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Fetch feed on mount
  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  // Set up infinite scroll observer
  useEffect(() => {
    // Don't set up observer if there's an error or no more items
    if (error || !hasMore) {
      return;
    }

    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading && !error) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, isLoading, error]);

  // Handlers
  const handlePlay = useCallback(
    (item: FeedItem) => {
      markClicked(item.id);
      markPlayed(item.id);
      if (onPlaySong && item.contentId) {
        onPlaySong(item.contentId);
        toast.success(`Now playing: ${item.title}`);
      }
    },
    [markClicked, markPlayed, onPlaySong]
  );

  const handleQueue = useCallback(
    (item: FeedItem, position: 'next' | 'end') => {
      markClicked(item.id);
      if (onQueueSong && item.contentId) {
        onQueueSong(item.contentId, position);
        toast.success(
          position === 'next'
            ? `"${item.title}" will play next`
            : `Added "${item.title}" to queue`
        );
      }
    },
    [markClicked, onQueueSong]
  );

  const handleSave = useCallback(
    (item: FeedItem) => {
      markSaved(item.id);
    },
    [markSaved]
  );

  const handleFeedback = useCallback(
    (item: FeedItem, feedback: 'liked' | 'disliked' | 'not_interested') => {
      provideFeedback(item.id, feedback);
    },
    [provideFeedback]
  );

  const handleDismiss = useCallback(
    (item: FeedItem) => {
      dismissItem(item.id);
    },
    [dismissItem]
  );

  const handleRefresh = useCallback(() => {
    refreshFeed();
    toast.success('Refreshing your discovery feed...');
  }, [refreshFeed]);

  // getFilteredItems uses items internally - we subscribe to items above to trigger re-renders
  const filteredItems = getFilteredItems();

  // Get greeting based on time of day
  const getGreeting = () => {
    if (!currentTimeContext) return 'Discover';
    switch (currentTimeContext.timeSlot) {
      case 'morning':
        return 'Good Morning';
      case 'afternoon':
        return 'Good Afternoon';
      case 'evening':
        return 'Good Evening';
      case 'night':
        return 'Night Vibes';
      default:
        return 'Discover';
    }
  };

  // Get description based on pattern
  const getDescription = () => {
    if (!currentPattern) {
      return 'Personalized music recommendations based on your listening habits';
    }

    const topGenre = currentPattern.topGenres?.[0]?.genre;
    const context = currentPattern.primaryContext;

    if (topGenre && context && context !== 'general') {
      return `${topGenre} music perfect for ${context}`;
    } else if (topGenre) {
      return `Based on your love for ${topGenre}`;
    }

    return 'Personalized music recommendations based on your listening habits';
  };

  return (
    <Card className={className} data-testid="discovery-feed">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {getGreeting()}
          </CardTitle>
          <CardDescription className="mt-1.5">{getDescription()}</CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isLoading}
          className="shrink-0"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="ml-2 hidden sm:inline">Refresh</span>
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Time filter tabs */}
        <Tabs
          value={activeFilter}
          onValueChange={(value) => {
            setActiveFilter(value as TimeSlot | 'any');
            // Refresh feed when switching time slots to get time-specific recommendations
            if (value !== 'any') {
              refreshFeed();
            }
          }}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-5">
            {TIME_TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="flex items-center gap-1"
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>

        {/* Error state */}
        {error && (
          <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <p className="text-sm">{error}</p>
            <Button variant="ghost" size="sm" onClick={handleRefresh}>
              Try Again
            </Button>
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && filteredItems.length === 0 && (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="rounded-xl border p-4">
                <div className="flex items-start gap-4">
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                  <div className="flex gap-2">
                    <Skeleton className="h-9 w-9 rounded-md" />
                    <Skeleton className="h-9 w-9 rounded-md" />
                    <Skeleton className="h-9 w-20 rounded-md" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && filteredItems.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Music2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">No recommendations yet</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              {activeFilter !== 'any'
                ? `No ${activeFilter} recommendations available. Try a different time slot!`
                : 'Keep listening to music and we\'ll personalize your feed.'}
            </p>
            <Button variant="outline" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh Feed
            </Button>
          </div>
        )}

        {/* Feed items */}
        {filteredItems.length > 0 && (
          <div className="space-y-3">
            {filteredItems.map((item) => (
              <DiscoveryFeedCard
                key={item.id}
                item={item}
                onPlay={handlePlay}
                onQueue={handleQueue}
                onSave={handleSave}
                onFeedback={handleFeedback}
                onDismiss={handleDismiss}
              />
            ))}
          </div>
        )}

        {/* Load more trigger - only show if we have items and can load more */}
        {filteredItems.length > 0 && hasMore && !error && (
          <div ref={loadMoreRef} className="h-4" />
        )}

        {/* Loading more indicator */}
        {isLoading && filteredItems.length > 0 && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* End of feed */}
        {!hasMore && filteredItems.length > 0 && (
          <p className="text-center text-sm text-muted-foreground py-4">
            You've reached the end of your discovery feed
          </p>
        )}
      </CardContent>
    </Card>
  );
});

export default DiscoveryFeed;
