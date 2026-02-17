/**
 * Analytics Dashboard Route
 * Tabbed layout: Overview | Discovery | Mood Timeline
 */

import { createFileRoute } from '@tanstack/react-router';
import { AnalyticsDashboard } from '../../components/recommendations/AnalyticsDashboard';
import { AdvancedDiscoveryAnalytics } from '../../components/recommendations/AdvancedDiscoveryAnalytics';
import { PageLayout } from '@/components/ui/page-layout';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { lazy, Suspense, useState } from 'react';
import { BarChart3, RefreshCw, Download } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

const MoodTimelineDashboard = lazy(
  () => import('../../components/recommendations/MoodTimelineDashboard')
);

export const Route = createFileRoute('/dashboard/analytics')({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (search.tab as 'overview' | 'discovery' | 'mood-timeline') || 'overview',
  }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { tab } = Route.useSearch();
  const [period, setPeriod] = useState<'30d' | '90d' | '1y'>('30d');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['discovery-analytics'] });
    setIsRefreshing(false);
  };

  const handleExport = async () => {
    try {
      const response = await fetch(`/api/recommendations/discovery-analytics?period=${period}`);
      const data = await response.json();

      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `discovery-analytics-${period}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export analytics:', error);
    }
  };

  return (
    <PageLayout
      title="Music Analytics"
      description="Visualize your music taste evolution"
      icon={<BarChart3 className="h-5 w-5" />}
      backLink="/dashboard"
      backLabel="Dashboard"
      actions={
        <div className="flex items-center gap-2">
          {tab === 'discovery' && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="min-h-[36px] text-xs sm:text-sm"
              >
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span className="hidden xs:inline">Refresh</span>
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport} className="min-h-[36px] text-xs sm:text-sm">
                <Download className="mr-1.5 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />
                <span className="hidden xs:inline">Export</span>
              </Button>
            </>
          )}
          <div className="w-full sm:w-[180px]">
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={period}
              onChange={(e) => setPeriod(e.target.value as '30d' | '90d' | '1y')}
            >
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
              <option value="1y">Last Year</option>
            </select>
          </div>
        </div>
      }
    >
      <Tabs defaultValue={tab} className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="discovery">Discovery</TabsTrigger>
          <TabsTrigger value="mood-timeline">Mood Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <AnalyticsDashboard period={period} />
        </TabsContent>

        <TabsContent value="discovery" className="mt-4 space-y-4">
          <AdvancedDiscoveryAnalytics period={period} />
        </TabsContent>

        <TabsContent value="mood-timeline" className="mt-4 space-y-4">
          <Suspense
            fallback={
              <div className="space-y-4 sm:space-y-6">
                <Skeleton className="h-10 sm:h-12 w-full" />
                <Skeleton className="h-[300px] sm:h-[500px] w-full" />
              </div>
            }
          >
            <MoodTimelineDashboard />
          </Suspense>
        </TabsContent>
      </Tabs>
    </PageLayout>
  );
}
