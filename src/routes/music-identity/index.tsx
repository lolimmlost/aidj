/**
 * Music Identity Page Route
 *
 * Main page for viewing and generating AI-powered music identity summaries
 * (Spotify Wrapped-style yearly/monthly reports)
 */

import { createFileRoute, redirect } from "@tanstack/react-router";
import { Suspense, lazy } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { PageLayout } from '@/components/ui/page-layout';

// Lazy load the dashboard for better initial page load
const MusicIdentityDashboard = lazy(() =>
  import('@/components/music-identity/MusicIdentityDashboard').then(m => ({
    default: m.MusicIdentityDashboard,
  }))
);

export const Route = createFileRoute("/music-identity/")({
  beforeLoad: async ({ context }) => {
    // Require authentication
    if (!context.user) {
      throw redirect({ to: '/login' });
    }
  },
  component: MusicIdentityPage,
});

function MusicIdentityPage() {
  return (
    <PageLayout
      title="Music Identity"
      description="AI-powered listening reports"
      backLink=""
    >
      <Suspense fallback={<MusicIdentityPageSkeleton />}>
        <MusicIdentityDashboard />
      </Suspense>
    </PageLayout>
  );
}

function MusicIdentityPageSkeleton() {
  return (
    <div className="space-y-8">
      {/* Cards Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-16" />
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <div className="flex justify-between pt-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-20" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default MusicIdentityPage;
