import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { X, Minus, GripHorizontal, Radio, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAudioStore } from '@/lib/stores/audio';
import { usePreferencesStore } from '@/lib/stores/preferences';
import type { Song } from '@/lib/types/song';

interface Position {
  x: number;
  y: number;
}

interface MusicTasteDebugPanelProps {
  onClose: () => void;
}

/**
 * Compute genre distribution from current queue
 * Returns sorted array of [genre, count, percentage] tuples
 */
function computeQueueGenres(
  playlist: Song[],
  currentIndex: number
): Array<{ genre: string; count: number; percentage: number }> {
  // Get upcoming songs (after current)
  const upcoming = currentIndex >= 0 ? playlist.slice(currentIndex + 1) : playlist;

  if (upcoming.length === 0) {
    return [];
  }

  const genreCounts = new Map<string, number>();

  for (const song of upcoming) {
    const genre = song.genre || 'Unknown';
    genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1);
  }

  // Sort by count descending and convert to array with percentages
  const total = upcoming.length;
  return Array.from(genreCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5) // Top 5 genres
    .map(([genre, count]) => ({
      genre,
      count,
      percentage: Math.round((count / total) * 100),
    }));
}

/**
 * Format timestamp as relative time (e.g., "2m ago")
 */
function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return 'Never';

  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function MusicTasteDebugPanel({ onClose }: MusicTasteDebugPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [position, setPosition] = useState<Position>({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef<Position>({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // Audio store subscriptions - using efficient selectors
  const currentSong = useAudioStore((s) => s.playlist[s.currentSongIndex]);
  const playlist = useAudioStore((s) => s.playlist);
  const currentSongIndex = useAudioStore((s) => s.currentSongIndex);
  const isPlaying = useAudioStore((s) => s.isPlaying);

  // AI DJ state
  const aiDJEnabled = useAudioStore((s) => s.aiDJEnabled);
  const aiDJIsLoading = useAudioStore((s) => s.aiDJIsLoading);
  const aiDJLastQueueTime = useAudioStore((s) => s.aiDJLastQueueTime);
  const aiDJError = useAudioStore((s) => s.aiDJError);

  // Preferences for exploration level
  const preferences = usePreferencesStore((s) => s.preferences);
  const explorationLevel = (preferences?.recommendationSettings as unknown as Record<string, unknown>)?.aiDJGenreExploration as number ?? 50;

  // Compute derived state
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const queueGenres = useMemo(
    () => computeQueueGenres(playlist, currentSongIndex),
    [playlist, currentSongIndex]
  );

  const upcomingCount = useMemo(
    () => currentSongIndex >= 0 ? playlist.length - currentSongIndex - 1 : playlist.length,
    [playlist.length, currentSongIndex]
  );

  // Update relative time every 10 seconds
  const [, forceUpdate] = useState({});
  useEffect(() => {
    const interval = setInterval(() => forceUpdate({}), 10000);
    return () => clearInterval(interval);
  }, []);

  // Drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (panelRef.current) {
      const rect = panelRef.current.getBoundingClientRect();
      dragOffset.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
      setIsDragging(true);
    }
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newX = window.innerWidth - e.clientX - (panelRef.current?.offsetWidth || 280) + dragOffset.current.x;
      const newY = window.innerHeight - e.clientY - (panelRef.current?.offsetHeight || 200) + dragOffset.current.y;

      // Clamp to viewport
      setPosition({
        x: Math.max(0, Math.min(newX, window.innerWidth - 100)),
        y: Math.max(0, Math.min(newY, window.innerHeight - 100)),
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Genre bar colors
  const genreColors = [
    'bg-purple-500',
    'bg-blue-500',
    'bg-green-500',
    'bg-yellow-500',
    'bg-orange-500',
  ];

  return (
    <div
      ref={panelRef}
      className={cn(
        'fixed z-[9999] rounded-lg border shadow-xl transition-all duration-200',
        'bg-background/95 backdrop-blur-md',
        isDragging && 'cursor-grabbing select-none',
        isCollapsed ? 'w-auto' : 'w-72'
      )}
      style={{
        right: position.x,
        bottom: position.y,
      }}
    >
      {/* Header - Draggable */}
      <div
        className={cn(
          'flex items-center justify-between gap-2 px-3 py-2 border-b cursor-grab',
          'bg-muted/50 rounded-t-lg',
          isDragging && 'cursor-grabbing'
        )}
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2">
          <GripHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Music Taste Debug
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 hover:bg-accent rounded transition-colors"
            title={isCollapsed ? 'Expand' : 'Collapse'}
          >
            <Minus className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <button
            onClick={onClose}
            className="p-1 hover:bg-destructive/20 hover:text-destructive rounded transition-colors"
            title="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      {!isCollapsed && (
        <div className="p-3 space-y-3 text-sm">
          {/* Now Playing */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {isPlaying ? (
                <span className="text-green-500 animate-pulse">▶</span>
              ) : (
                <span className="text-muted-foreground">⏸</span>
              )}
              <span className="font-medium truncate">
                {currentSong
                  ? `${currentSong.artist || 'Unknown'} - ${currentSong.name || currentSong.title || 'Unknown'}`
                  : 'Nothing playing'}
              </span>
            </div>
            {currentSong?.genre && (
              <div className="ml-5">
                <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                  {currentSong.genre}
                </span>
              </div>
            )}
          </div>

          {/* Queue Genres */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Queue Genres ({upcomingCount} songs)
              </span>
            </div>
            {queueGenres.length > 0 ? (
              <div className="space-y-1">
                {queueGenres.map(({ genre, percentage }, index) => (
                  <div key={genre} className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', genreColors[index % genreColors.length])}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-24 truncate" title={genre}>
                      {genre} ({percentage}%)
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">No genres in queue</span>
            )}
          </div>

          {/* AI DJ Status */}
          <div className="flex items-center justify-between py-1.5 border-t border-b">
            <div className="flex items-center gap-2">
              <Radio className={cn('h-4 w-4', aiDJEnabled ? 'text-green-500' : 'text-muted-foreground')} />
              <span className="text-xs font-medium">AI DJ</span>
            </div>
            <div className="flex items-center gap-2">
              {aiDJIsLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              ) : (
                <span
                  className={cn(
                    'w-2 h-2 rounded-full',
                    aiDJEnabled ? 'bg-green-500' : 'bg-muted-foreground'
                  )}
                />
              )}
              <span className={cn('text-xs', aiDJEnabled ? 'text-green-500' : 'text-muted-foreground')}>
                {aiDJEnabled ? 'ON' : 'OFF'}
              </span>
              {aiDJLastQueueTime > 0 && (
                <span className="text-xs text-muted-foreground">
                  Last: {formatRelativeTime(aiDJLastQueueTime)}
                </span>
              )}
            </div>
          </div>

          {/* AI DJ Error */}
          {aiDJError && (
            <div className="text-xs text-destructive bg-destructive/10 px-2 py-1 rounded">
              {aiDJError}
            </div>
          )}

          {/* Exploration Level */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Exploration</span>
              <span className="text-xs text-muted-foreground">{explorationLevel}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  explorationLevel < 30
                    ? 'bg-blue-500'
                    : explorationLevel < 70
                    ? 'bg-green-500'
                    : 'bg-orange-500'
                )}
                style={{ width: `${explorationLevel}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Strict</span>
              <span>Adventurous</span>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-2 pt-1 border-t">
            <div className="text-center">
              <div className="text-lg font-bold text-primary">{playlist.length}</div>
              <div className="text-[10px] text-muted-foreground">Total Queue</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-primary">{currentSongIndex + 1}</div>
              <div className="text-[10px] text-muted-foreground">Position</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
