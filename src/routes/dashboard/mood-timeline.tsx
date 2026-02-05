/**
 * Mood Timeline Dashboard Route
 *
 * Displays the comprehensive mood timeline visualization with
 * historical preference tracking, comparison, and export features.
 *
 * Story: Mood Timeline Visualization with Historical Music Preference Tracking
 */

import { createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { Skeleton } from '../../components/ui/skeleton';
import { PageLayout } from '@/components/ui/page-layout';
import { TrendingUp } from 'lucide-react';

// Lazy load the dashboard component for better performance
const MoodTimelineDashboard = lazy(
  () => import('../../components/recommendations/MoodTimelineDashboard')
);

export const Route = createFileRoute('/dashboard/mood-timeline')({
  component: MoodTimelinePage,
});

function MoodTimelinePageSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <Skeleton className="h-10 sm:h-12 w-full" />
      <Skeleton className="h-[300px] sm:h-[500px] w-full" />
    </div>
  );
}

function MoodTimelinePage() {
  return (
    <PageLayout
      title="Mood Timeline"
      description="Music taste evolution visualization"
      icon={<TrendingUp className="h-5 w-5" />}
      backLink="/dashboard/analytics"
      backLabel="Analytics"
    >
      <Suspense fallback={<MoodTimelinePageSkeleton />}>
        <MoodTimelineDashboard />
      </Suspense>
    </PageLayout>
  );
}
