/**
 * Mood Timeline Dashboard Component
 *
 * Integrates all mood timeline features into a comprehensive dashboard:
 * - Timeline visualization with zoom/pan/filter
 * - Taste profile comparison (past vs current)
 * - Historical playlist generation
 * - Taste snapshot export
 *
 * Story: Mood Timeline Visualization with Historical Music Preference Tracking
 */

import { useState, useCallback, lazy, Suspense, memo } from 'react';
import type { TimelineDataPoint } from './MoodTimeline';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Skeleton } from '../ui/skeleton';
import {
  TrendingUp,
  GitCompare,
  Music,
  Download,
} from 'lucide-react';

// Lazy load heavy components for better initial load performance
const MoodTimeline = lazy(() => import('./MoodTimeline'));
const TasteComparison = lazy(() => import('./TasteComparison'));
const HistoricalPlaylistGenerator = lazy(() => import('./HistoricalPlaylistGenerator'));
const TasteSnapshotExport = lazy(() => import('./TasteSnapshotExport'));

// ============================================================================
// Types
// ============================================================================

interface MoodTimelineDashboardProps {
  defaultTab?: 'timeline' | 'compare' | 'playlist' | 'export';
}

// ============================================================================
// Loading Skeleton
// ============================================================================

const TabContentSkeleton = memo(function TabContentSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-9 w-32" />
      </div>
      <Skeleton className="h-[400px] w-full" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    </div>
  );
});

// ============================================================================
// Main Component
// ============================================================================

export function MoodTimelineDashboard({
  defaultTab = 'timeline',
}: MoodTimelineDashboardProps) {
  const [activeTab, setActiveTab] = useState(defaultTab);

  // Handle period selection from timeline to navigate to playlist generator
  const handlePeriodSelect = useCallback((period: TimelineDataPoint) => {
    console.log('Period selected:', period);
    // Could auto-populate the playlist generator with this period
  }, []);

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="timeline" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            Timeline
          </TabsTrigger>
          <TabsTrigger value="compare" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <GitCompare className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            Compare
          </TabsTrigger>
          <TabsTrigger value="playlist" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Music className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            Nostalgia
          </TabsTrigger>
          <TabsTrigger value="export" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            Export
          </TabsTrigger>
        </TabsList>

        {/* Timeline Tab */}
        <TabsContent value="timeline" className="mt-6">
          <Suspense fallback={<TabContentSkeleton />}>
            <MoodTimeline onPeriodSelect={handlePeriodSelect} />
          </Suspense>
        </TabsContent>

        {/* Compare Tab */}
        <TabsContent value="compare" className="mt-6">
          <Suspense fallback={<TabContentSkeleton />}>
            <TasteComparison />
          </Suspense>
        </TabsContent>

        {/* Playlist Tab */}
        <TabsContent value="playlist" className="mt-6">
          <Suspense fallback={<TabContentSkeleton />}>
            <HistoricalPlaylistGenerator />
          </Suspense>
        </TabsContent>

        {/* Export Tab */}
        <TabsContent value="export" className="mt-6">
          <Suspense fallback={<TabContentSkeleton />}>
            <TasteSnapshotExport />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default MoodTimelineDashboard;
