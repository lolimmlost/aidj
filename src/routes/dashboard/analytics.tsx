/**
 * Analytics Dashboard Route
 * Displays comprehensive music taste analytics
 */

import { createFileRoute, Link } from '@tanstack/react-router';
import { AnalyticsDashboard } from '../../components/recommendations/AnalyticsDashboard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { PageLayout } from '@/components/ui/page-layout';
import { useState } from 'react';
import { TrendingUp, Clock, ArrowRight, FlaskConical, BarChart3 } from 'lucide-react';

export const Route = createFileRoute('/dashboard/analytics')({
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const [period, setPeriod] = useState<'30d' | '90d' | '1y'>('30d');

  return (
    <PageLayout
      title="Music Analytics"
      description="Visualize your music taste evolution"
      icon={<BarChart3 className="h-5 w-5" />}
      backLink="/dashboard"
      backLabel="Dashboard"
      actions={
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
      }
    >
      {/* Advanced Discovery Analytics Feature Card */}
      <Card className="border-secondary/20 bg-gradient-to-r from-secondary/5 to-primary/5">
        <CardContent className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-3 sm:py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-secondary/10 p-1.5 sm:p-2 shrink-0">
              <FlaskConical className="h-5 w-5 sm:h-6 sm:w-6 text-secondary" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm sm:text-base">Discovery Analytics</h3>
              <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">
                A/B testing and engagement patterns
              </p>
            </div>
          </div>
          <Link to="/dashboard/discovery-analytics" className="shrink-0">
            <Button variant="outline" size="sm" className="gap-1.5 sm:gap-2 text-xs sm:text-sm w-full sm:w-auto">
              <BarChart3 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              View
              <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Mood Timeline Feature Card */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-secondary/5">
        <CardContent className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-3 sm:py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-1.5 sm:p-2 shrink-0">
              <TrendingUp className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm sm:text-base">Mood Timeline</h3>
              <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">
                Music taste evolution visualization
              </p>
            </div>
          </div>
          <Link to="/dashboard/mood-timeline" className="shrink-0">
            <Button variant="outline" size="sm" className="gap-1.5 sm:gap-2 text-xs sm:text-sm w-full sm:w-auto">
              <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              View
              <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
          </Link>
        </CardContent>
      </Card>

      <AnalyticsDashboard period={period} />
    </PageLayout>
  );
}
