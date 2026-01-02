/**
 * Music Identity Card Component
 *
 * Compact card for displaying a music identity summary in a list/grid
 */

import { memo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar, Music, TrendingUp, Sparkles } from 'lucide-react';
import type { MusicIdentitySummary } from '@/lib/db/schema/music-identity.schema';

// ============================================================================
// Types
// ============================================================================

interface MusicIdentityCardProps {
  summary: MusicIdentitySummary;
  onClick?: () => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

function getMonthName(month: number): string {
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];
  return months[month - 1] || '';
}

function getDominantMoodColor(mood: string): string {
  const colors: Record<string, string> = {
    chill: 'from-blue-500/20 to-cyan-500/20 border-blue-500/30',
    energetic: 'from-orange-500/20 to-red-500/20 border-orange-500/30',
    melancholic: 'from-indigo-500/20 to-purple-500/20 border-indigo-500/30',
    happy: 'from-yellow-500/20 to-amber-500/20 border-yellow-500/30',
    focused: 'from-emerald-500/20 to-teal-500/20 border-emerald-500/30',
    romantic: 'from-pink-500/20 to-rose-500/20 border-pink-500/30',
    aggressive: 'from-red-500/20 to-orange-500/20 border-red-500/30',
    neutral: 'from-gray-500/20 to-slate-500/20 border-gray-500/30',
  };
  return colors[mood] || colors.neutral;
}

// ============================================================================
// Component
// ============================================================================

export const MusicIdentityCard = memo(function MusicIdentityCard({
  summary,
  onClick,
}: MusicIdentityCardProps) {
  const periodLabel = summary.month
    ? `${getMonthName(summary.month)} ${summary.year}`
    : `${summary.year}`;

  const dominantMood = summary.moodProfile.dominantMoods[0]?.mood || 'neutral';
  const gradientClass = getDominantMoodColor(dominantMood);

  const topArtist = summary.topArtists[0];
  const personality = summary.aiInsights.musicPersonality;

  return (
    <Card
      className={`cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02] overflow-hidden bg-gradient-to-br ${gradientClass}`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Calendar className="h-4 w-4" />
            {periodLabel}
          </div>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            summary.periodType === 'year'
              ? 'bg-purple-500/20 text-purple-700 dark:text-purple-300'
              : 'bg-blue-500/20 text-blue-700 dark:text-blue-300'
          }`}>
            {summary.periodType === 'year' ? 'Yearly' : 'Monthly'}
          </span>
        </div>

        {/* Personality Type */}
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-4 w-4 text-purple-600" />
            <span className="font-semibold">{personality.type}</span>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2">
            {personality.description}
          </p>
        </div>

        {/* Stats Row */}
        <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-3 mt-3">
          <div className="flex items-center gap-1">
            <Music className="h-3.5 w-3.5" />
            <span>{summary.stats.totalListens.toLocaleString()} plays</span>
          </div>
          <div className="flex items-center gap-1">
            <TrendingUp className="h-3.5 w-3.5" />
            <span>{summary.stats.uniqueArtists} artists</span>
          </div>
        </div>

        {/* Top Artist Badge */}
        {topArtist && (
          <div className="mt-3 px-2 py-1.5 rounded-lg bg-background/50 backdrop-blur-sm">
            <div className="text-xs text-muted-foreground">Top Artist</div>
            <div className="font-medium truncate">{topArtist.name}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

export default MusicIdentityCard;
