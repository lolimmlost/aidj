/**
 * Analytics Dashboard Route
 * Displays comprehensive music taste analytics
 */

import { createFileRoute } from '@tanstack/react-router';
import { AnalyticsDashboard } from '../../components/recommendations/AnalyticsDashboard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Select } from '../../components/ui/select';
import { useState } from 'react';

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

      <AnalyticsDashboard period={period} />
    </div>
  );
}
