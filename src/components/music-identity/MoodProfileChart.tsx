/**
 * Mood Profile Chart Component
 *
 * Visualizes mood distribution and emotional patterns
 */

import { memo, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { Heart, Sun, Moon, CloudRain, Zap, Music2, Focus, Flame } from 'lucide-react';
import type { MoodProfile } from '@/lib/db/schema/music-identity.schema';

// ============================================================================
// Types
// ============================================================================

interface MoodProfileChartProps {
  moodProfile: MoodProfile;
}

// ============================================================================
// Constants
// ============================================================================

const MOOD_COLORS: Record<string, string> = {
  chill: '#06b6d4',      // cyan
  energetic: '#f97316',  // orange
  melancholic: '#8b5cf6', // purple
  happy: '#eab308',      // yellow
  focused: '#10b981',    // emerald
  romantic: '#ec4899',   // pink
  aggressive: '#ef4444', // red
  neutral: '#6b7280',    // gray
};

const MOOD_ICONS: Record<string, React.ReactNode> = {
  chill: <Moon className="h-4 w-4" />,
  energetic: <Zap className="h-4 w-4" />,
  melancholic: <CloudRain className="h-4 w-4" />,
  happy: <Sun className="h-4 w-4" />,
  focused: <Focus className="h-4 w-4" />,
  romantic: <Heart className="h-4 w-4" />,
  aggressive: <Flame className="h-4 w-4" />,
  neutral: <Music2 className="h-4 w-4" />,
};

const MOOD_LABELS: Record<string, string> = {
  chill: 'Chill',
  energetic: 'Energetic',
  melancholic: 'Melancholic',
  happy: 'Happy',
  focused: 'Focused',
  romantic: 'Romantic',
  aggressive: 'Aggressive',
  neutral: 'Neutral',
};

// ============================================================================
// Component
// ============================================================================

export const MoodProfileChart = memo(function MoodProfileChart({
  moodProfile,
}: MoodProfileChartProps) {
  const { distribution, dominantMoods, moodByTimeOfDay, variationScore, emotionalRange } = moodProfile;

  // Prepare pie chart data
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const pieData = useMemo(() => {
    return Object.entries(distribution)
      .filter(([, value]) => value > 0)
      .map(([mood, value]) => ({
        name: MOOD_LABELS[mood] || mood,
        value: Number((value * 100).toFixed(1)),
        color: MOOD_COLORS[mood] || '#6b7280',
      }))
      .sort((a, b) => b.value - a.value);
  }, [distribution]);

  // Prepare time of day data
  const timeOfDayData = useMemo(() => {
    if (!moodByTimeOfDay) return [];
    return [
      { time: 'Morning', mood: MOOD_LABELS[moodByTimeOfDay.morning], color: MOOD_COLORS[moodByTimeOfDay.morning] },
      { time: 'Afternoon', mood: MOOD_LABELS[moodByTimeOfDay.afternoon], color: MOOD_COLORS[moodByTimeOfDay.afternoon] },
      { time: 'Evening', mood: MOOD_LABELS[moodByTimeOfDay.evening], color: MOOD_COLORS[moodByTimeOfDay.evening] },
      { time: 'Night', mood: MOOD_LABELS[moodByTimeOfDay.night], color: MOOD_COLORS[moodByTimeOfDay.night] },
    ];
  }, [moodByTimeOfDay]);

  return (
    <div className="space-y-6">
      {/* Emotional Range Banner */}
      <Card className="bg-gradient-to-br from-purple-500/5 to-pink-500/5 border-purple-500/20">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-lg mb-1">Emotional Range</h3>
              <p className="text-muted-foreground">{emotionalRange}</p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold">{(variationScore * 100).toFixed(0)}%</div>
              <div className="text-sm text-muted-foreground">Variation Score</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dominant Moods */}
      <Card>
        <CardHeader>
          <CardTitle>Dominant Moods</CardTitle>
          <CardDescription>Your most prevalent emotional states in music</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {dominantMoods.map((mood, index) => (
              <div
                key={mood.mood}
                className="flex items-center gap-3 p-4 rounded-lg border"
                style={{ borderColor: `${MOOD_COLORS[mood.mood]}40` }}
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${MOOD_COLORS[mood.mood]}20`, color: MOOD_COLORS[mood.mood] }}
                >
                  {MOOD_ICONS[mood.mood]}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{MOOD_LABELS[mood.mood]}</span>
                    {index === 0 && (
                      <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-500/20 text-yellow-700 dark:text-yellow-300">
                        #1
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {mood.percentage}%
                    <span className={`ml-2 ${
                      mood.trend === 'rising' ? 'text-green-600' :
                      mood.trend === 'falling' ? 'text-red-600' :
                      'text-muted-foreground'
                    }`}>
                      {mood.trend === 'rising' ? '↑' :
                       mood.trend === 'falling' ? '↓' :
                       '→'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Charts Row */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Mood Distribution Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Mood Distribution</CardTitle>
            <CardDescription>Breakdown of your emotional listening patterns</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => value > 5 ? `${name} (${value}%)` : ''}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => `${value}%`}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Legend */}
            <div className="flex flex-wrap justify-center gap-3 mt-4">
              {pieData.slice(0, 5).map((entry) => (
                <div key={entry.name} className="flex items-center gap-1.5">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-xs text-muted-foreground">{entry.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Mood by Time of Day */}
        {timeOfDayData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Mood by Time of Day</CardTitle>
              <CardDescription>How your music mood changes throughout the day</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {timeOfDayData.map((item) => (
                  <div key={item.time} className="flex items-center gap-4">
                    <div className="w-20 text-sm font-medium">{item.time}</div>
                    <div className="flex-1">
                      <div
                        className="h-8 rounded-lg flex items-center px-3"
                        style={{ backgroundColor: `${item.color}20` }}
                      >
                        <div
                          className="w-3 h-3 rounded-full mr-2"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="text-sm font-medium">{item.mood}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-4 border-t">
                <h4 className="text-sm font-medium mb-2">Mood Flow</h4>
                <p className="text-xs text-muted-foreground">
                  Your emotional journey through the day goes from{' '}
                  <span className="font-medium" style={{ color: timeOfDayData[0]?.color }}>
                    {timeOfDayData[0]?.mood}
                  </span>{' '}
                  mornings to{' '}
                  <span className="font-medium" style={{ color: timeOfDayData[3]?.color }}>
                    {timeOfDayData[3]?.mood}
                  </span>{' '}
                  nights.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* All Moods Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Complete Mood Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Object.entries(distribution)
              .sort(([, a], [, b]) => b - a)
              .map(([mood, value]) => (
                <div key={mood} className="text-center p-4 rounded-lg bg-muted/30">
                  <div
                    className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center"
                    style={{ backgroundColor: `${MOOD_COLORS[mood]}20`, color: MOOD_COLORS[mood] }}
                  >
                    {MOOD_ICONS[mood]}
                  </div>
                  <div className="text-lg font-bold">{(value * 100).toFixed(1)}%</div>
                  <div className="text-xs text-muted-foreground">{MOOD_LABELS[mood]}</div>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

export default MoodProfileChart;
