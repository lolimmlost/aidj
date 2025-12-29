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

// Lazy load the dashboard component for better performance
const MoodTimelineDashboard = lazy(
  () => import('../../components/recommendations/MoodTimelineDashboard')
);

export const Route = createFileRoute('/dashboard/mood-timeline')({
  component: MoodTimelinePage,
});

function MoodTimelinePageSkeleton() {
  return (
    <div className="container mx-auto space-y-6 py-6">
      <div>
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-96" />
      </div>
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-[500px] w-full" />
    </div>
  );
}

function MoodTimelinePage() {
  return (
    <div className="container mx-auto py-6">
      <Suspense fallback={<MoodTimelinePageSkeleton />}>
        <MoodTimelineDashboard />
      </Suspense>
    </div>
  );
}
