/**
 * Trend Analysis Widget Component
 *
 * Displays "who you're getting into" and "what you're moving away from"
 */

import { memo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Sparkles, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import type { TrendAnalysis } from '@/lib/db/schema/music-identity.schema';

// ============================================================================
// Types
// ============================================================================

interface TrendAnalysisWidgetProps {
  trendAnalysis: TrendAnalysis;
  periodType: 'month' | 'year';
}

// ============================================================================
// Component
// ============================================================================

export const TrendAnalysisWidget = memo(function TrendAnalysisWidget({
  trendAnalysis,
  periodType,
}: TrendAnalysisWidgetProps) {
  const { gettingInto, movingAwayFrom, evolutionSummary, diversityTrend, diversityScore, newDiscoveriesCount } = trendAnalysis;

  return (
    <div className="space-y-6">
      {/* Evolution Summary */}
      <Card className="bg-gradient-to-br from-purple-500/5 to-pink-500/5 border-purple-500/20">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-purple-500/20 rounded-xl">
              <Sparkles className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-lg mb-1">Your Taste Evolution</h3>
              <p className="text-muted-foreground">{evolutionSummary}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-green-600">{newDiscoveriesCount}</div>
            <div className="text-sm text-muted-foreground">New Discoveries</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold">{(diversityScore * 100).toFixed(0)}%</div>
            <div className="text-sm text-muted-foreground">Diversity Score</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className={`text-lg font-bold ${
              diversityTrend === 'expanding' ? 'text-green-600' :
              diversityTrend === 'narrowing' ? 'text-orange-600' :
              'text-blue-600'
            }`}>
              {diversityTrend === 'expanding' ? 'Expanding' :
               diversityTrend === 'narrowing' ? 'Narrowing' :
               'Stable'}
            </div>
            <div className="text-sm text-muted-foreground">Diversity Trend</div>
          </CardContent>
        </Card>
      </div>

      {/* Getting Into / Moving Away */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Getting Into */}
        <Card className="border-green-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-600">
              <TrendingUp className="h-5 w-5" />
              Getting Into
            </CardTitle>
            <CardDescription>
              Artists and genres you're exploring more
            </CardDescription>
          </CardHeader>
          <CardContent>
            {gettingInto.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No significant new trends this {periodType}
              </p>
            ) : (
              <div className="space-y-3">
                {gettingInto.map((item) => (
                  <div
                    key={`${item.type}-${item.name}`}
                    className="flex items-center justify-between p-3 rounded-lg bg-green-500/5 border border-green-500/20"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        item.type === 'artist'
                          ? 'bg-purple-500/20 text-purple-700 dark:text-purple-300'
                          : 'bg-blue-500/20 text-blue-700 dark:text-blue-300'
                      }`}>
                        {item.type}
                      </span>
                      <span className="font-medium">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-1 text-green-600 font-medium">
                      <ArrowUpRight className="h-4 w-4" />
                      <span>{item.growthRate === 100 ? 'New' : `+${item.growthRate}%`}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Moving Away From */}
        <Card className="border-orange-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-600">
              <TrendingDown className="h-5 w-5" />
              Moving Away From
            </CardTitle>
            <CardDescription>
              Artists and genres you're listening to less
            </CardDescription>
          </CardHeader>
          <CardContent>
            {movingAwayFrom.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                You're maintaining interest in your favorites
              </p>
            ) : (
              <div className="space-y-3">
                {movingAwayFrom.map((item) => (
                  <div
                    key={`${item.type}-${item.name}`}
                    className="flex items-center justify-between p-3 rounded-lg bg-orange-500/5 border border-orange-500/20"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        item.type === 'artist'
                          ? 'bg-purple-500/20 text-purple-700 dark:text-purple-300'
                          : 'bg-blue-500/20 text-blue-700 dark:text-blue-300'
                      }`}>
                        {item.type}
                      </span>
                      <span className="font-medium">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-1 text-orange-600 font-medium">
                      <ArrowDownRight className="h-4 w-4" />
                      <span>-{item.declineRate}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
});

export default TrendAnalysisWidget;
