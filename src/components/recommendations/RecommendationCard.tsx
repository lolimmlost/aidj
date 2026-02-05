/**
 * RecommendationCard - A reusable component for displaying song recommendations
 *
 * Extracted from the dashboard to enable virtualization and reuse
 */

import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Play, Plus, ListPlus, Download, Loader2 } from 'lucide-react';
import type { Song } from '@/lib/types/song';

type CachedSong = Song & {
  trackNumber?: number;
};

interface RecommendationCardProps {
  rec: {
    song: string;
    foundInLibrary?: boolean;
    actualSong?: CachedSong;
    searchError?: boolean;
    explanation?: string;
  };
  index: number;
  currentFeedback?: 'thumbs_up' | 'thumbs_down' | null;
  hasFeedback: boolean;
  onFeedback: (type: 'thumbs_up' | 'thumbs_down') => void;
  onQueueAction: (position: 'now' | 'next' | 'end') => void;
  isPending: boolean;
}

export function RecommendationCard({
  rec,
  index,
  currentFeedback,
  hasFeedback,
  onFeedback,
  onQueueAction,
  isPending,
}: RecommendationCardProps) {
  const isInLibrary = rec.foundInLibrary;
  const hasSearchError = rec.searchError;

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border transition-all duration-300 hover:shadow-lg ${
        isInLibrary
          ? 'border-green-500/30 bg-gradient-to-br from-green-500/5 to-green-600/5 hover:border-green-500/50'
          : 'border-border bg-card/50 hover:border-border/80'
      }`}
    >
      <div className="p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                to="/dashboard/recommendations/id"
                search={{ song: rec.song }}
                className="font-semibold text-base hover:text-primary transition-colors"
              >
                {rec.song}
              </Link>
              {isInLibrary && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  In Library
                </span>
              )}
              {hasSearchError && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                  ⚠️ Search Error
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2">{rec.explanation}</p>
            {!isInLibrary && !hasSearchError && (
              <div className="flex items-center gap-1.5 text-xs text-orange-600 dark:text-orange-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 16v-4"/>
                  <path d="M12 8h.01"/>
                </svg>
                Not in your library, but matches your taste
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex items-center gap-1 bg-background/50 rounded-lg p-1">
              <Button
                variant={currentFeedback === 'thumbs_up' ? "default" : "ghost"}
                size="sm"
                onClick={() => onFeedback('thumbs_up')}
                disabled={isPending || hasFeedback}
                className={`h-9 w-9 p-0 ${currentFeedback === 'thumbs_up' ? 'bg-green-600 hover:bg-green-700 text-white' : ''}`}
                title={hasFeedback ? "Already rated" : "Like this song"}
              >
                {isPending && currentFeedback === 'thumbs_up' ? (
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 10v12"/>
                    <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"/>
                  </svg>
                )}
              </Button>
              <Button
                variant={currentFeedback === 'thumbs_down' ? "default" : "ghost"}
                size="sm"
                onClick={() => onFeedback('thumbs_down')}
                disabled={isPending || hasFeedback}
                className={`h-9 w-9 p-0 ${currentFeedback === 'thumbs_down' ? 'bg-red-600 hover:bg-red-700 text-white' : ''}`}
                title={hasFeedback ? "Already rated" : "Dislike this song"}
              >
                {isPending && currentFeedback === 'thumbs_down' ? (
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 14V2"/>
                    <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88Z"/>
                  </svg>
                )}
              </Button>
            </div>
            {isInLibrary ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="default"
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white shadow-sm"
                  >
                    <ListPlus className="mr-1 h-4 w-4" />
                    Queue
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem
                    onClick={() => onQueueAction('now')}
                    className="min-h-[44px]"
                  >
                    <Play className="mr-2 h-4 w-4" />
                    Play Now
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onQueueAction('next')}
                    className="min-h-[44px]"
                  >
                    <Play className="mr-2 h-4 w-4" />
                    Play Next
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onQueueAction('end')}
                    className="min-h-[44px]"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add to End
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <AddToLidarrButton song={rec.song} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Add to Lidarr button - sends the song to Lidarr for downloading.
 * Uses the existing /api/lidarr/add endpoint.
 *
 * @see docs/architecture/analytics-discovery-upgrades-plan.md - Item 4.1
 */
function AddToLidarrButton({ song }: { song: string }) {
  const [isAdding, setIsAdding] = useState(false);
  const [isAdded, setIsAdded] = useState(false);

  const handleAdd = async () => {
    setIsAdding(true);
    try {
      const res = await fetch('/api/lidarr/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ song }),
      });

      const data = await res.json();

      if (res.ok && (data.success || data.message)) {
        setIsAdded(true);
        toast.success('Added to Lidarr', {
          description: data.message || `Queued "${song}" for download`,
        });
      } else {
        toast.error('Failed to add to Lidarr', {
          description: data.error || data.message || 'Unknown error',
        });
      }
    } catch {
      toast.error('Failed to add to Lidarr', {
        description: 'Could not connect to Lidarr',
      });
    } finally {
      setIsAdding(false);
    }
  };

  if (isAdded) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled
        className="text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
      >
        <Download className="mr-1 h-4 w-4" />
        Queued
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleAdd}
      disabled={isAdding}
      className="hover:border-blue-500/50 hover:text-blue-600 dark:hover:text-blue-400"
    >
      {isAdding ? (
        <>
          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          Adding...
        </>
      ) : (
        <>
          <Download className="mr-1 h-4 w-4" />
          Add to Lidarr
        </>
      )}
    </Button>
  );
}
