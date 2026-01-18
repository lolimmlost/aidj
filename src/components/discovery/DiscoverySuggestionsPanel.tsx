/**
 * Discovery Suggestions Panel
 *
 * Displays pending discovery suggestions for user approval.
 * Supports approve, reject, and dismiss actions.
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useDiscoverySuggestionsStore,
  type DiscoverySuggestion,
} from '@/lib/stores/discovery-suggestions';
import {
  Sparkles,
  Check,
  X,
  Minus,
  RefreshCw,
  Settings,
  Clock,
  TrendingUp,
  Music2,
  ExternalLink,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Simple relative time formatter
function formatTimeAgo(dateString: string | null): string {
  if (!dateString) return 'Never';

  const date = new Date(dateString);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatTimeUntil(dateString: string | null): string {
  if (!dateString) return 'Not scheduled';

  const date = new Date(dateString);
  const seconds = Math.floor((date.getTime() - Date.now()) / 1000);

  if (seconds < 0) return 'Due now';
  if (seconds < 60) return 'in a moment';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.floor(hours / 24);
  return `in ${days}d`;
}

interface SuggestionCardProps {
  suggestion: DiscoverySuggestion;
  onApprove: () => void;
  onReject: () => void;
  onDismiss: () => void;
  isSelected: boolean;
  onToggleSelect: () => void;
}

function SuggestionCard({
  suggestion,
  onApprove,
  onReject,
  onDismiss,
  isSelected,
  onToggleSelect,
}: SuggestionCardProps) {
  const matchPercentage = Math.round(suggestion.matchScore * 100);

  const sourceLabel = {
    similar_track: 'Similar Track',
    artist_top_track: 'Top Track',
    genre_based: 'Genre Match',
  }[suggestion.source];

  const sourceColor = {
    similar_track: 'bg-blue-500/10 text-blue-500',
    artist_top_track: 'bg-purple-500/10 text-purple-500',
    genre_based: 'bg-green-500/10 text-green-500',
  }[suggestion.source];

  return (
    <div
      className={cn(
        "flex items-start gap-4 p-4 rounded-lg border bg-card transition-all",
        "hover:border-primary/30 hover:shadow-sm",
        isSelected && "border-primary bg-primary/5"
      )}
    >
      {/* Checkbox for multi-select */}
      <button
        onClick={onToggleSelect}
        className={cn(
          "mt-1 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors",
          isSelected
            ? "bg-primary border-primary text-primary-foreground"
            : "border-muted-foreground/30 hover:border-primary/50"
        )}
      >
        {isSelected && <Check className="h-3 w-3" />}
      </button>

      {/* Album art placeholder */}
      <div className="w-14 h-14 rounded-md bg-gradient-to-br from-primary/20 via-purple-500/20 to-pink-500/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
        {suggestion.imageUrl ? (
          <img
            src={suggestion.imageUrl}
            alt={`${suggestion.artistName} - ${suggestion.trackName}`}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <Music2 className="h-6 w-6 text-primary/50" />
        )}
      </div>

      {/* Track info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="font-medium truncate">{suggestion.trackName}</h4>
            <p className="text-sm text-muted-foreground truncate">
              {suggestion.artistName}
              {suggestion.albumName && (
                <span className="text-muted-foreground/60"> • {suggestion.albumName}</span>
              )}
            </p>
          </div>

          {/* Match score */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-sm font-semibold text-primary">{matchPercentage}%</span>
          </div>
        </div>

        {/* Explanation and source */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className={cn("text-xs", sourceColor)}>
            {sourceLabel}
          </Badge>
          {suggestion.explanation && (
            <span className="text-xs text-muted-foreground truncate max-w-[300px]">
              {suggestion.explanation}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="mt-3 flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            className="h-8 bg-green-600 hover:bg-green-700"
            onClick={onApprove}
          >
            <Check className="h-3.5 w-3.5 mr-1" />
            Approve
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
            onClick={onReject}
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Reject
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-muted-foreground"
            onClick={onDismiss}
          >
            <Minus className="h-3.5 w-3.5 mr-1" />
            Dismiss
          </Button>
          {suggestion.lastFmUrl && (
            <a
              href={suggestion.lastFmUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

interface DiscoverySuggestionsPanelProps {
  showSettings?: boolean;
  onOpenSettings?: () => void;
  compact?: boolean;
}

export function DiscoverySuggestionsPanel({
  showSettings = true,
  onOpenSettings,
  compact = false,
}: DiscoverySuggestionsPanelProps) {
  const {
    suggestions,
    status,
    isLoading,
    isLoadingMore,
    isTriggering,
    hasMore,
    total,
    fetchSuggestions,
    loadMore,
    fetchStatus,
    approve,
    reject,
    dismiss,
    approveMultiple,
    triggerDiscovery,
  } = useDiscoverySuggestionsStore();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isExpanded, setIsExpanded] = useState(!compact);

  // Fetch data on mount
  useEffect(() => {
    fetchSuggestions();
    fetchStatus();
  }, [fetchSuggestions, fetchStatus]);

  // Toggle selection
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Select all
  const selectAll = () => {
    setSelectedIds(new Set(suggestions.map(s => s.id)));
  };

  // Deselect all
  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  // Approve selected
  const approveSelected = async () => {
    if (selectedIds.size === 0) return;
    await approveMultiple(Array.from(selectedIds));
    setSelectedIds(new Set());
  };

  const pendingCount = suggestions.length;
  const selectedCount = selectedIds.size;

  if (compact && pendingCount === 0) {
    return null;
  }

  return (
    <Card className={cn(compact && "border-0 shadow-none bg-transparent")}>
      <CardHeader className={cn("pb-3", compact && "px-0")}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Library Growth</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {status && status.pendingCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {status.pendingCount} pending
              </Badge>
            )}
            {showSettings && onOpenSettings && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={onOpenSettings}
              >
                <Settings className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => triggerDiscovery()}
              disabled={isTriggering}
            >
              {isTriggering ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
              )}
              {isTriggering ? 'Discovering...' : 'Discover'}
            </Button>
            {compact && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        </div>
        <CardDescription>
          Discover new music based on your listening habits
        </CardDescription>

        {/* Status bar */}
        {status && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2 pt-2 border-t">
            <div className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              <span>Last: {formatTimeAgo(status.lastRunAt)}</span>
            </div>
            <div className="flex items-center gap-1">
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Next: {formatTimeUntil(status.nextRunAt)}</span>
            </div>
            {status.approvalRate > 0 && (
              <div className="flex items-center gap-1">
                <TrendingUp className="h-3.5 w-3.5" />
                <span>{status.approvalRate}% approval rate</span>
              </div>
            )}
          </div>
        )}
      </CardHeader>

      {isExpanded && (
        <CardContent className={cn(compact && "px-0")}>
          {/* Bulk actions */}
          {pendingCount > 0 && (
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={selectedCount > 0 ? deselectAll : selectAll}
                >
                  {selectedCount > 0 ? `Deselect (${selectedCount})` : 'Select All'}
                </Button>
              </div>
              {selectedCount > 0 && (
                <Button
                  variant="default"
                  size="sm"
                  className="h-7 bg-green-600 hover:bg-green-700"
                  onClick={approveSelected}
                >
                  <Check className="h-3.5 w-3.5 mr-1" />
                  Approve Selected ({selectedCount})
                </Button>
              )}
            </div>
          )}

          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Empty state */}
          {!isLoading && pendingCount === 0 && (
            <div className="text-center py-8">
              <Sparkles className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground mb-2">No pending suggestions</p>
              <p className="text-sm text-muted-foreground/70 mb-4">
                Click "Discover" to find new music based on your listening habits
              </p>
              <Button
                variant="outline"
                onClick={() => triggerDiscovery()}
                disabled={isTriggering}
              >
                {isTriggering ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Start Discovery
              </Button>
            </div>
          )}

          {/* Suggestions list */}
          {!isLoading && pendingCount > 0 && (
            <ScrollArea className={cn(compact ? "h-[400px]" : "h-[600px]")}>
              <div className="space-y-3">
                {suggestions.map(suggestion => (
                  <SuggestionCard
                    key={suggestion.id}
                    suggestion={suggestion}
                    onApprove={() => approve(suggestion.id)}
                    onReject={() => reject(suggestion.id)}
                    onDismiss={() => dismiss(suggestion.id)}
                    isSelected={selectedIds.has(suggestion.id)}
                    onToggleSelect={() => toggleSelect(suggestion.id)}
                  />
                ))}

                {/* Load More button */}
                {hasMore && (
                  <div className="flex flex-col items-center gap-2 pt-4 pb-2">
                    <p className="text-xs text-muted-foreground">
                      Showing {suggestions.length} of {total} suggestions
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={loadMore}
                      disabled={isLoadingMore}
                      className="w-full max-w-xs"
                    >
                      {isLoadingMore ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <ChevronDown className="h-4 w-4 mr-2" />
                      )}
                      {isLoadingMore ? 'Loading...' : `Load More (${total - suggestions.length} remaining)`}
                    </Button>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      )}
    </Card>
  );
}
