/**
 * Analytics Dashboard Route
 * Displays comprehensive music taste analytics
 */

import { createFileRoute, Link } from '@tanstack/react-router';
import { AnalyticsDashboard } from '../../components/recommendations/AnalyticsDashboard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { useState } from 'react';
import { TrendingUp, Clock, ArrowRight } from 'lucide-react';

export const Route = createFileRoute('/dashboard/analytics')({
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const [period, setPeriod] = useState<'30d' | '90d' | '1y'>('30d');

  return (
    <div className="container mx-auto space-y-6 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Music Analytics</h1>
          <p className="text-muted-foreground">
            Visualize your music taste evolution and recommendation quality
          </p>
        </div>

        <div className="w-[180px]">
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

      {/* Mood Timeline Feature Card */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-secondary/5">
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-4">
            <div className="rounded-lg bg-primary/10 p-2">
              <TrendingUp className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">Mood Timeline</h3>
              <p className="text-sm text-muted-foreground">
                Explore your music taste evolution with interactive visualization
              </p>
            </div>
          </div>
          <Link to="/dashboard/mood-timeline">
            <Button variant="outline" className="gap-2">
              <Clock className="h-4 w-4" />
              View Timeline
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </CardContent>
      </Card>

      <AnalyticsDashboard period={period} />
    </div>
  );
}
