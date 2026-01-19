/**
 * Advanced Discovery Analytics Dashboard Route
 *
 * Comprehensive analytics page showing recommendation effectiveness metrics:
 * - Acceptance rate by recommendation type (similar/discovery/mood/personalized)
 * - Top recommended artists/genres
 * - User engagement patterns
 * - A/B testing capabilities for recommendation algorithms
 */

import { createFileRoute, Link } from '@tanstack/react-router';
import { AdvancedDiscoveryAnalytics } from '../../components/recommendations/AdvancedDiscoveryAnalytics';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { useState } from 'react';
import {
  BarChart3,
  ArrowLeft,
  TrendingUp,
  FlaskConical,
  Sparkles,
  Download,
  RefreshCw,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

export const Route = createFileRoute('/dashboard/discovery-analytics')({
  component: DiscoveryAnalyticsPage,
});

function DiscoveryAnalyticsPage() {
  const [period, setPeriod] = useState<'7d' | '30d' | '90d' | '1y' | 'all'>('30d');
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
    <div className="min-h-screen bg-background pb-24 md:pb-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:gap-4">
        <div className="flex items-start gap-3 sm:gap-4">
          {/* Hidden on mobile since hamburger menu provides navigation */}
          <Link to="/dashboard/analytics" className="hidden md:block">
            <Button variant="ghost" size="icon" className="shrink-0 h-9 w-9 sm:h-10 sm:w-10">
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight truncate">
              Discovery Analytics
            </h1>
            <p className="text-sm text-muted-foreground line-clamp-2">
              Recommendation effectiveness and listening patterns
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
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
        </div>
      </div>

      {/* Feature Highlights - Hidden on mobile for cleaner view */}
      <div className="hidden sm:grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FeatureCard
          icon={<TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />}
          title="Recommendation Types"
          description="Track acceptance rates across different recommendation types"
        />
        <FeatureCard
          icon={<BarChart3 className="h-4 w-4 sm:h-5 sm:w-5 text-success" />}
          title="Top Content"
          description="See which artists and genres perform best"
        />
        <FeatureCard
          icon={<Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-secondary" />}
          title="Engagement Patterns"
          description="When you engage with recommendations"
        />
        <FeatureCard
          icon={<FlaskConical className="h-4 w-4 sm:h-5 sm:w-5 text-warning" />}
          title="A/B Testing"
          description="Compare algorithm performance"
        />
      </div>

      {/* Main Analytics Dashboard */}
      <AdvancedDiscoveryAnalytics period={period} />

      {/* Quick Links */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-secondary/5">
        <CardContent className="flex flex-col gap-3 py-3 sm:py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-1.5 sm:p-2 shrink-0">
              <BarChart3 className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm sm:text-base">Basic analytics?</h3>
              <p className="text-xs sm:text-sm text-muted-foreground truncate">
                Music taste evolution and quality
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link to="/dashboard/analytics">
              <Button variant="outline" size="sm" className="text-xs sm:text-sm h-8 sm:h-9">
                Basic Analytics
              </Button>
            </Link>
            <Link to="/dashboard/mood-timeline">
              <Button variant="outline" size="sm" className="text-xs sm:text-sm h-8 sm:h-9">
                Mood Timeline
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Card className="transition-colors hover:border-primary/50">
      <CardContent className="flex items-start gap-2 sm:gap-3 p-3 sm:p-4">
        <div className="rounded-lg bg-muted p-1.5 sm:p-2 shrink-0">{icon}</div>
        <div className="min-w-0">
          <h3 className="font-semibold text-sm sm:text-base">{title}</h3>
          <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}
