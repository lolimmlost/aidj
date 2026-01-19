/**
 * Discovery Feed Page
 *
 * Personalized music discovery feed with time-based recommendations.
 * Shows content tailored to user's listening patterns and current time of day.
 */

import { createFileRoute, redirect } from "@tanstack/react-router";
import { Suspense, lazy, useCallback } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { PageLayout, PageSection } from '@/components/ui/page-layout';
import { Sparkles } from 'lucide-react';

// Lazy load the discovery feed component
const DiscoveryFeed = lazy(() =>
  import('@/components/discovery-feed').then(m => ({ default: m.DiscoveryFeed }))
);

export const Route = createFileRoute("/dashboard/discover")({
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw redirect({ to: '/login' });
    }
  },
  component: DiscoverPage,
});

function DiscoverPage() {
  const handlePlaySong = useCallback((songId: string) => {
    // The DiscoveryFeed component handles the actual song data
    // This is just a callback for tracking/logging
    console.log('🎵 Playing song:', songId);
  }, []);

  const handleQueueSong = useCallback((songId: string, position: 'next' | 'end') => {
    console.log(`📋 Queueing song ${songId} at position: ${position}`);
  }, []);

  return (
    <PageLayout
      title="Discover"
      description="Personalized music recommendations based on your listening patterns"
      icon={<Sparkles className="h-6 w-6" />}
    >
      <PageSection>
        <Suspense fallback={<DiscoveryFeedSkeleton />}>
          <DiscoveryFeed
            onPlaySong={handlePlaySong}
            onQueueSong={handleQueueSong}
          />
        </Suspense>
      </PageSection>
    </PageLayout>
  );
}

/**
 * Skeleton loader for the discovery feed
 */
function DiscoveryFeedSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-9 w-24" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Time filter tabs skeleton */}
        <div className="grid grid-cols-5 gap-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-10 rounded-md" />
          ))}
        </div>

        {/* Feed items skeleton */}
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="rounded-xl border p-4">
              <div className="flex items-start gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
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
      </CardContent>
    </Card>
  );
}

export default DiscoverPage;
