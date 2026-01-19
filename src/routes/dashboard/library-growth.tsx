/**
 * Library Growth Page
 *
 * Background discovery system for finding new music based on listening habits.
 * Users can review suggestions and approve them for download via Lidarr.
 */

import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, Suspense, lazy } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { PageLayout, PageSection } from '@/components/ui/page-layout';
import { TrendingUp } from 'lucide-react';

// Lazy load components
const DiscoverySuggestionsPanel = lazy(() =>
  import('@/components/discovery/DiscoverySuggestionsPanel').then(m => ({
    default: m.DiscoverySuggestionsPanel,
  }))
);

const DiscoverySettings = lazy(() =>
  import('@/components/discovery/DiscoverySettings').then(m => ({
    default: m.DiscoverySettings,
  }))
);

export const Route = createFileRoute("/dashboard/library-growth")({
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw redirect({ to: '/login' });
    }
  },
  component: LibraryGrowthPage,
});

function LibraryGrowthPage() {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <PageLayout
      title="Library Growth"
      description="Discover new music based on your listening habits and grow your collection"
      icon={<TrendingUp className="h-6 w-6" />}
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main suggestions panel */}
        <PageSection className="lg:col-span-2">
          <Suspense fallback={<SuggestionsPanelSkeleton />}>
            <DiscoverySuggestionsPanel
              showSettings={true}
              onOpenSettings={() => setShowSettings(true)}
            />
          </Suspense>
        </PageSection>

        {/* Settings panel */}
        <PageSection>
          <Suspense fallback={<SettingsSkeleton />}>
            {showSettings ? (
              <DiscoverySettings onClose={() => setShowSettings(false)} />
            ) : (
              <DiscoverySettings />
            )}
          </Suspense>
        </PageSection>
      </div>
    </PageLayout>
  );
}

/**
 * Skeleton loader for suggestions panel
 */
function SuggestionsPanelSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
        <div className="flex gap-4 pt-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-28" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-start gap-4 p-4 rounded-lg border">
            <Skeleton className="w-5 h-5 rounded" />
            <Skeleton className="w-14 h-14 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <div className="flex gap-2 pt-2">
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-8 w-20" />
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * Skeleton loader for settings
 */
function SettingsSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5" />
            <Skeleton className="h-6 w-40" />
          </div>
        </div>
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-6 w-11 rounded-full" />
        </div>

        {/* Slider 1 */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-4 w-48" />
            </div>
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
        </div>

        {/* Slider 2 */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-4 w-48" />
            </div>
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
        </div>

        {/* Stats */}
        <div className="rounded-lg bg-muted/50 p-4">
          <Skeleton className="h-4 w-24 mb-3" />
          <div className="grid grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="text-center">
                <Skeleton className="h-8 w-12 mx-auto mb-1" />
                <Skeleton className="h-3 w-16 mx-auto" />
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default LibraryGrowthPage;
