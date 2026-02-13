/**
 * DiscoveryFeedCard - Individual feed item card component
 *
 * Displays a single recommendation with:
 * - Title and subtitle
 * - Explanation for why it was recommended
 * - Time slot indicator
 * - Action buttons (play, save, feedback)
 */

import { memo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Play,
  Plus,
  ListPlus,
  ThumbsUp,
  ThumbsDown,
  X,
  Clock,
  Sparkles,
  TrendingUp,
  Music,
  Sunrise,
  Sun,
  Sunset,
  Moon,
} from 'lucide-react';
import type { FeedItem, TimeSlot, ListeningContext } from '@/lib/stores/discovery-feed';

interface DiscoveryFeedCardProps {
  item: FeedItem;
  onPlay: (item: FeedItem) => void;
  onQueue: (item: FeedItem, position: 'next' | 'end') => void;
  onSave: (item: FeedItem) => void;
  onFeedback: (item: FeedItem, feedback: 'liked' | 'disliked' | 'not_interested') => void;
  onDismiss: (item: FeedItem) => void;
  isPending?: boolean;
}

// Time slot icons and colors
const TIME_SLOT_CONFIG: Record<TimeSlot | 'any', { icon: typeof Sun; color: string; label: string }> = {
  morning: { icon: Sunrise, color: 'text-amber-500', label: 'Morning' },
  afternoon: { icon: Sun, color: 'text-yellow-500', label: 'Afternoon' },
  evening: { icon: Sunset, color: 'text-orange-500', label: 'Evening' },
  night: { icon: Moon, color: 'text-indigo-500', label: 'Night' },
  any: { icon: Clock, color: 'text-muted-foreground', label: 'Any time' },
};

// Recommendation source icons
const SOURCE_CONFIG: Record<FeedItem['recommendationSource'], { icon: typeof Sparkles; label: string }> = {
  time_pattern: { icon: Clock, label: 'Time-based' },
  compound_score: { icon: TrendingUp, label: 'Based on your history' },
  mood_match: { icon: Sparkles, label: 'Mood match' },
  genre_match: { icon: Music, label: 'Genre match' },
  discovery: { icon: Sparkles, label: 'Discovery' },
  trending: { icon: TrendingUp, label: 'Trending' },
  personalized: { icon: Sparkles, label: 'Just for you' },
};

// Context labels
const CONTEXT_LABELS: Record<ListeningContext, string> = {
  workout: 'Workout',
  focus: 'Focus',
  relaxation: 'Relaxation',
  commute: 'Commute',
  social: 'Social',
  general: 'General',
};

export const DiscoveryFeedCard = memo(function DiscoveryFeedCard({
  item,
  onPlay,
  onQueue,
  onSave: _onSave,
  onFeedback,
  onDismiss,
  isPending = false,
}: DiscoveryFeedCardProps) {
  const timeConfig = TIME_SLOT_CONFIG[item.targetTimeSlot];
  const sourceConfig = SOURCE_CONFIG[item.recommendationSource];
  const TimeIcon = timeConfig.icon;
  const SourceIcon = sourceConfig.icon;

  const handlePlay = useCallback(() => {
    onPlay(item);
  }, [item, onPlay]);

  const handleQueueNext = useCallback(() => {
    onQueue(item, 'next');
  }, [item, onQueue]);

  const handleQueueEnd = useCallback(() => {
    onQueue(item, 'end');
  }, [item, onQueue]);

  const handleLike = useCallback(() => {
    onFeedback(item, 'liked');
  }, [item, onFeedback]);

  const handleDislike = useCallback(() => {
    onFeedback(item, 'disliked');
  }, [item, onFeedback]);

  const handleDismiss = useCallback(() => {
    onDismiss(item);
  }, [item, onDismiss]);

  // Don't render dismissed items
  if (item.dismissed) return null;

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border transition-all duration-300 hover:shadow-lg ${
        item.feedback === 'liked'
          ? 'border-green-500/30 bg-gradient-to-br from-green-500/5 to-green-600/5'
          : item.feedback === 'disliked'
          ? 'border-red-500/30 bg-gradient-to-br from-red-500/5 to-red-600/5'
          : 'border-border bg-card/50 hover:border-border/80'
      }`}
      data-testid="discovery-feed-card"
    >
      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full hover:bg-background/80"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4 text-muted-foreground" />
      </button>

      <div className="p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          {/* Content */}
          <div className="flex-1 space-y-2">
            {/* Title and badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-base hover:text-primary transition-colors">
                {item.title}
              </h3>
              {item.targetTimeSlot !== 'any' && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-background/80 ${timeConfig.color}`}>
                  <TimeIcon className="mr-1 h-3 w-3" />
                  {timeConfig.label}
                </span>
              )}
            </div>

            {/* Subtitle */}
            {item.subtitle && (
              <p className="text-sm text-muted-foreground">{item.subtitle}</p>
            )}

            {/* Explanation */}
            {item.explanation && (
              <div className="flex items-center gap-1.5 text-xs text-primary/80">
                <SourceIcon className="h-3 w-3" />
                <span>{item.explanation}</span>
              </div>
            )}

            {/* Context badge */}
            {item.targetContext !== 'general' && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-accent/50 text-accent-foreground">
                {CONTEXT_LABELS[item.targetContext]}
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Feedback buttons */}
            <div className="flex items-center gap-1 bg-background/50 rounded-lg p-1">
              <Button
                variant={item.feedback === 'liked' ? 'default' : 'ghost'}
                size="sm"
                onClick={handleLike}
                disabled={isPending || !!item.feedback}
                className={`h-9 w-9 p-0 ${
                  item.feedback === 'liked' ? 'bg-green-600 hover:bg-green-700 text-white' : ''
                }`}
                title={item.feedback ? 'Already rated' : 'Like this'}
              >
                <ThumbsUp className="h-4 w-4" />
              </Button>
              <Button
                variant={item.feedback === 'disliked' ? 'default' : 'ghost'}
                size="sm"
                onClick={handleDislike}
                disabled={isPending || !!item.feedback}
                className={`h-9 w-9 p-0 ${
                  item.feedback === 'disliked' ? 'bg-red-600 hover:bg-red-700 text-white' : ''
                }`}
                title={item.feedback ? 'Already rated' : 'Dislike this'}
              >
                <ThumbsDown className="h-4 w-4" />
              </Button>
            </div>

            {/* Play/Queue dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="default"
                  size="sm"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
                >
                  <ListPlus className="mr-1 h-4 w-4" />
                  Queue
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={handlePlay} className="min-h-[44px]">
                  <Play className="mr-2 h-4 w-4" />
                  Play Now
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleQueueNext} className="min-h-[44px]">
                  <Play className="mr-2 h-4 w-4" />
                  Play Next
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleQueueEnd} className="min-h-[44px]">
                  <Plus className="mr-2 h-4 w-4" />
                  Add to End
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  );
});
