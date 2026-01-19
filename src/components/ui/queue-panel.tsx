import { useAudioStore } from '@/lib/stores/audio';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, Music, Trash2, GripVertical, Plus, RotateCcw, ThumbsUp, ThumbsDown, Shuffle, SkipForward } from 'lucide-react';
import { useState, useEffect, useCallback, useMemo, memo, useRef } from 'react';
import { CreatePlaylistDialog } from '@/components/playlists/CreatePlaylistDialog';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSongFeedback } from '@/hooks/useSongFeedback';
import { queryKeys } from '@/lib/query';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortableQueueItemProps {
  song: { id: string; title?: string; name?: string; artist?: string };
  index: number;
  actualIndex: number;
  onRemove: (index: number) => void;
  onPlay: (index: number) => void;
  isAIQueued?: boolean;
  isAutoplayQueued?: boolean;
  currentFeedback?: 'thumbs_up' | 'thumbs_down' | null;
  onFeedback?: (songId: string, songTitle: string, artist: string, type: 'thumbs_up' | 'thumbs_down') => void;
  onSkipAutoplay?: (songId: string) => void;
}

const SortableQueueItem = memo(function SortableQueueItem({ song, index, actualIndex, onRemove, onPlay, isAIQueued, isAutoplayQueued, currentFeedback, onFeedback, onSkipAutoplay }: SortableQueueItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: song.id });

  const isLiked = currentFeedback === 'thumbs_up';
  const isDisliked = currentFeedback === 'thumbs_down';
  const isAutoQueued = isAIQueued || isAutoplayQueued;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const songTitle = song.title || song.name || 'Unknown';
  const songArtist = song.artist || 'Unknown Artist';

  // Determine styling based on queue source
  const getItemStyle = () => {
    if (isAutoplayQueued) {
      return 'bg-gradient-to-r from-indigo-50/50 to-cyan-50/50 dark:from-indigo-950/30 dark:to-cyan-950/30 border border-indigo-200/30 dark:border-indigo-800/30 shadow-sm';
    }
    if (isAIQueued) {
      return 'bg-gradient-to-r from-blue-50/50 to-purple-50/50 dark:from-blue-950/30 dark:to-purple-950/30 border border-blue-200/30 dark:border-blue-800/30 shadow-sm';
    }
    return 'bg-gradient-to-r from-background to-muted/20 hover:from-muted/10 hover:to-muted/30 border border-border/30 hover:border-border/50 shadow-sm';
  };

  const getLabel = () => {
    if (isAutoplayQueued) return ', added by Autoplay';
    if (isAIQueued) return ', added by AI DJ';
    return '';
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-1.5 sm:gap-2 p-2 sm:p-3 min-h-[48px] rounded-lg transition-all duration-200 hover:scale-[1.02] overflow-hidden ${getItemStyle()}`}
      role="listitem"
      aria-label={`${songTitle} by ${songArtist}${getLabel()}`}
    >
      {/* Drag handle - hidden on mobile */}
      <button
        type="button"
        className="hidden sm:block text-muted-foreground/70 hover:text-foreground cursor-grab active:cursor-grabbing mt-0.5 flex-shrink-0 touch-none hover:scale-110 transition-transform"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      {/* Index number - smaller on mobile */}
      <div className="flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center mt-0.5">
        <span className="text-[10px] sm:text-xs font-bold text-primary/80">
          {index + 1}
        </span>
      </div>
      <div
        className="min-w-0 flex-1 cursor-pointer overflow-hidden"
        onClick={() => onPlay(actualIndex)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onPlay(actualIndex);
          }
        }}
      >
        <div className="flex items-center gap-1">
          <p className="font-semibold text-xs sm:text-sm truncate">{songTitle}</p>
          {isAutoplayQueued && (
            <span className="text-[10px] sm:text-xs text-indigo-600 dark:text-indigo-300 flex-shrink-0" title="Added by Autoplay">🎶</span>
          )}
          {isAIQueued && !isAutoplayQueued && (
            <span className="text-[10px] sm:text-xs text-blue-600 dark:text-blue-300 flex-shrink-0" title="Added by AI DJ">✨</span>
          )}
        </div>
        <p className="text-[10px] sm:text-xs text-muted-foreground/80 truncate mt-0.5">{songArtist}</p>
      </div>

      {/* Feedback buttons for auto-queued songs (AI DJ or Autoplay) - touch-friendly sizing */}
      {isAutoQueued && onFeedback && (
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              if (!isLiked) onFeedback(song.id, songTitle, songArtist, 'thumbs_up');
            }}
            className={`h-8 w-8 min-h-[32px] min-w-[32px] p-0 rounded-full transition-all ${
              isLiked
                ? 'text-green-600 bg-green-500/20 hover:bg-green-500/30'
                : 'hover:bg-green-500/10 hover:text-green-600'
            }`}
            aria-label={isLiked ? 'Already liked this song' : 'Like this recommendation'}
            aria-pressed={isLiked}
          >
            <ThumbsUp className={`h-3.5 w-3.5 transition-all ${isLiked ? 'fill-current scale-110' : ''}`} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              if (!isDisliked) onFeedback(song.id, songTitle, songArtist, 'thumbs_down');
            }}
            className={`h-8 w-8 min-h-[32px] min-w-[32px] p-0 rounded-full transition-all ${
              isDisliked
                ? 'text-red-600 bg-red-500/20 hover:bg-red-500/30'
                : 'hover:bg-red-500/10 hover:text-red-600'
            }`}
            aria-label={isDisliked ? 'Already disliked this song' : 'Dislike this recommendation'}
            aria-pressed={isDisliked}
          >
            <ThumbsDown className={`h-3.5 w-3.5 transition-all ${isDisliked ? 'fill-current scale-110' : ''}`} />
          </Button>
          {/* Skip button for autoplay-queued songs */}
          {isAutoplayQueued && onSkipAutoplay && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onSkipAutoplay(song.id);
              }}
              className="h-8 w-8 min-h-[32px] min-w-[32px] p-0 rounded-full transition-all hover:bg-orange-500/10 hover:text-orange-600"
              aria-label="Skip this autoplay recommendation"
              title="Skip and remove"
            >
              <SkipForward className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )}

      {/* Remove button - always visible on mobile, hover on desktop */}
      <Button
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(actualIndex);
        }}
        className="h-8 w-8 min-h-[32px] min-w-[32px] p-0 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-200 flex-shrink-0 hover:bg-red-500/10 hover:text-red-600 hover:scale-110 rounded-full"
        aria-label={`Remove ${songTitle} from queue`}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
});

interface VirtualizedQueueListProps {
  upcomingQueue: { id: string; title?: string; name?: string; artist?: string }[];
  currentSongIndex: number;
  aiQueuedSongIds: Set<string>;
  sensors: ReturnType<typeof useSensors>;
  onDragEnd: (event: DragEndEvent) => void;
  onRemove: (index: number) => void;
  onPlay: (index: number) => void;
  getFeedbackForSong: (songId: string) => 'thumbs_up' | 'thumbs_down' | null;
  onFeedback: (songId: string, songTitle: string, artist: string, type: 'thumbs_up' | 'thumbs_down') => void;
}

const VirtualizedQueueList = memo(function VirtualizedQueueList({
  upcomingQueue,
  currentSongIndex,
  aiQueuedSongIds,
  sensors,
  onDragEnd,
  onRemove,
  onPlay,
  getFeedbackForSong,
  onFeedback,
}: VirtualizedQueueListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [, forceUpdate] = useState(0);

  // Force re-render after mount to ensure virtualizer has the scroll element
  useEffect(() => {
    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      forceUpdate(n => n + 1);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const virtualizer = useVirtualizer({
    count: upcomingQueue.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64, // Height of each queue item
    overscan: 5,
    getItemKey: (index) => upcomingQueue[index]?.id ?? index,
  });

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext
        items={upcomingQueue.map(s => s.id)}
        strategy={verticalListSortingStrategy}
      >
        <div
          ref={parentRef}
          className="h-[25vh] md:h-[40vh] overflow-y-auto overflow-x-hidden pr-1 md:pr-2"
        >
          <div
            style={{
              height: virtualizer.getTotalSize(),
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualItems.map((virtualRow) => {
              const song = upcomingQueue[virtualRow.index];
              // If nothing playing (currentSongIndex === -1), actualIndex is just the index
              const actualIndex = currentSongIndex === -1 ? virtualRow.index : currentSongIndex + 1 + virtualRow.index;
              const isAIQueued = aiQueuedSongIds.has(song.id);
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                    paddingBottom: 8,
                  }}
                >
                  <SortableQueueItem
                    song={song}
                    index={virtualRow.index}
                    actualIndex={actualIndex}
                    onRemove={onRemove}
                    onPlay={onPlay}
                    isAIQueued={isAIQueued}
                    currentFeedback={isAIQueued ? getFeedbackForSong(song.id) : null}
                    onFeedback={onFeedback}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </SortableContext>
    </DndContext>
  );
});

export function QueuePanel() {
  const {
    playlist,
    currentSongIndex,
    getUpcomingQueue,
    removeFromQueue,
    clearQueue,
    undoClearQueue,
    reorderQueue,
    playSong,
    setIsPlaying,
    aiQueuedSongIds,
    aiDJEnabled,
    aiDJIsLoading,
    aiDJLastQueueTime,
    lastClearedQueue,
    isShuffled,
    toggleShuffle,
    // Autoplay state
    autoplayEnabled,
    autoplayIsLoading,
    autoplayQueuedSongIds,
    autoplayLastQueueTime,
    skipAutoplayedSong,
  } = useAudioStore();
  const [isOpen, setIsOpen] = useState(false);
  const [timeSinceLastQueue, setTimeSinceLastQueue] = useState(0);
  const [createPlaylistOpen, setCreatePlaylistOpen] = useState(false);
  const [undoTimeRemaining, setUndoTimeRemaining] = useState<number | null>(null);
  const queryClient = useQueryClient();

  // Track local optimistic feedback state (songId -> feedbackType)
  const [localFeedback, setLocalFeedback] = useState<Record<string, 'thumbs_up' | 'thumbs_down'>>({});

  // Get song IDs for auto-queued songs (AI DJ + Autoplay) to fetch their feedback
  const autoQueuedSongIdArray = useMemo(() => {
    const combined = new Set([...Array.from(aiQueuedSongIds), ...Array.from(autoplayQueuedSongIds)]);
    return Array.from(combined);
  }, [aiQueuedSongIds, autoplayQueuedSongIds]);

  // Fetch existing feedback for auto-queued songs
  const { data: feedbackData } = useSongFeedback(autoQueuedSongIdArray);

  // Get feedback for a song (local optimistic state takes priority)
  const getFeedbackForSong = useCallback((songId: string): 'thumbs_up' | 'thumbs_down' | null => {
    // Local optimistic state first
    if (localFeedback[songId]) {
      return localFeedback[songId];
    }
    // Then server state
    return feedbackData?.feedback?.[songId] || null;
  }, [localFeedback, feedbackData]);

  // Handle feedback on auto-queued songs (AI DJ or Autoplay)
  const handleAutoQueueFeedback = useCallback(async (
    songId: string,
    songTitle: string,
    artist: string,
    feedbackType: 'thumbs_up' | 'thumbs_down'
  ) => {
    // Optimistic update - show filled state immediately
    setLocalFeedback(prev => ({ ...prev, [songId]: feedbackType }));

    // Determine source based on which queue the song came from
    const isFromAutoplay = autoplayQueuedSongIds.has(songId);
    const source = isFromAutoplay ? 'autoplay' : 'ai_dj';

    try {
      const response = await fetch('/api/recommendations/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          songId,
          songArtistTitle: `${artist} - ${songTitle}`,
          feedbackType,
          source, // Track that this came from AI DJ queue or Autoplay
        }),
      });

      // Handle 409 Conflict (duplicate feedback) gracefully
      if (response.status === 409) {
        console.log('✓ Feedback already exists for this song');
        // Keep the optimistic state - feedback was already there
        toast.success(
          feedbackType === 'thumbs_up'
            ? `Already liked "${songTitle}"`
            : `Already disliked "${songTitle}"`,
          { duration: 2000 }
        );
        // Invalidate to sync with server state
        queryClient.invalidateQueries({ queryKey: queryKeys.feedback.all() });
        return;
      }

      if (!response.ok) {
        // Revert optimistic update on error
        setLocalFeedback(prev => {
          const next = { ...prev };
          delete next[songId];
          return next;
        });
        throw new Error('Failed to submit feedback');
      }

      // Invalidate feedback queries to refetch updated state
      queryClient.invalidateQueries({ queryKey: queryKeys.feedback.all() });

      toast.success(
        feedbackType === 'thumbs_up'
          ? `Liked "${songTitle}" - AI will learn from this`
          : `Disliked "${songTitle}" - AI will avoid similar songs`,
        { duration: 2000 }
      );
    } catch (error) {
      console.error('Failed to submit feedback:', error);
      toast.error('Failed to save feedback');
    }
  }, [queryClient, autoplayQueuedSongIds]);
  
  // Update time since last queue periodically
  useEffect(() => {
    const updateTime = () => {
      setTimeSinceLastQueue(Date.now() - aiDJLastQueueTime);
    };

    updateTime(); // Initial update
    const interval = setInterval(updateTime, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [aiDJLastQueueTime]);

  // Track undo clear queue timer - updates every second for accurate countdown
  useEffect(() => {
    if (!lastClearedQueue) {
      setUndoTimeRemaining(null);
      return;
    }

    const updateUndoTime = () => {
      const elapsed = Date.now() - lastClearedQueue.timestamp;
      const remaining = 300000 - elapsed; // 5 minutes = 300000ms

      if (remaining <= 0) {
        setUndoTimeRemaining(null);
      } else {
        setUndoTimeRemaining(remaining);
      }
    };

    updateUndoTime(); // Initial update
    const interval = setInterval(updateUndoTime, 1000); // Update every second for accurate countdown

    return () => clearInterval(interval);
  }, [lastClearedQueue]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const currentSong = currentSongIndex >= 0 && currentSongIndex < playlist.length
    ? playlist[currentSongIndex]
    : null;

  // Compute upcoming queue - memoized to avoid unnecessary recalculations
  const upcomingQueue = useMemo(() => {
    return getUpcomingQueue();
  }, [playlist, currentSongIndex]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    // Find indices in upcoming queue
    const oldIndex = upcomingQueue.findIndex(song => song.id === active.id);
    const newIndex = upcomingQueue.findIndex(song => song.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      // Convert to actual playlist indices (offset by currentSongIndex + 1)
      const actualOldIndex = currentSongIndex + 1 + oldIndex;
      const actualNewIndex = currentSongIndex + 1 + newIndex;
      reorderQueue(actualOldIndex, actualNewIndex);
    }
  };

  const handlePlaySong = (playlistIndex: number) => {
    if (playlistIndex >= 0 && playlistIndex < playlist.length) {
      const song = playlist[playlistIndex];
      playSong(song.id, playlist);
      setIsPlaying(true);
    }
  };

  const handleCreatePlaylistFromQueue = async (playlistData: { name: string; description?: string }) => {
    try {
      // Get all songs from the queue (current song + upcoming queue)
      const queueSongs = currentSong 
        ? [currentSong, ...upcomingQueue]
        : upcomingQueue;

      if (queueSongs.length === 0) {
        toast.error('Cannot create playlist from empty queue');
        return;
      }

      // Create the playlist
      const createResponse = await fetch('/api/playlists/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(playlistData),
      });

      if (!createResponse.ok) {
        const error = await createResponse.json();
        throw new Error(error.message || error.error || 'Failed to create playlist');
      }

      const { data: newPlaylist } = await createResponse.json();

      // Add all songs to the playlist
      const addSongsResponse = await fetch(`/api/playlists/${newPlaylist.id}/songs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songs: queueSongs.map(song => song.id),
        }),
      });

      if (!addSongsResponse.ok) {
        const error = await addSongsResponse.json();
        throw new Error(error.message || error.error || 'Failed to add songs to playlist');
      }

      // Invalidate playlists cache to refresh the list
      queryClient.invalidateQueries({ queryKey: ['playlists'] });

      toast.success(`Created playlist "${playlistData.name}" with ${queueSongs.length} songs`);
      setCreatePlaylistOpen(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create playlist from queue';
      toast.error('Failed to create playlist', {
        description: errorMessage,
      });
    }
  };

  if (!isOpen) {
    // Collapsed state - show count badge
    // Positioned above player bar with safe margins
    // Touch target: 56x56px (h-14 w-14) exceeds 44px minimum
    // Landscape mode: slightly lower to accommodate reduced player height
    return (
      <div className="fixed bottom-[calc(4rem+1rem)] right-2 md:right-4 z-50 md:bottom-[calc(5rem+1rem)] landscape:max-md:bottom-[calc(3.5rem+0.5rem)]">
        <Button
          onClick={() => setIsOpen(true)}
          variant="outline"
          className="rounded-full h-12 w-12 md:h-14 md:w-14 p-0 shadow-2xl bg-gradient-to-br from-background via-background to-primary/5 border-2 border-primary/20 hover:border-primary/40 backdrop-blur-xl transition-all duration-300 hover:scale-110 hover:shadow-primary/30 group relative touch-target"
          title="Show queue"
          aria-label={`Show queue${upcomingQueue.length > 0 ? ` - ${upcomingQueue.length} songs` : ''}`}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-purple-500/5 to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-full" />
          <Music className="h-5 w-5 md:h-6 md:w-6 text-primary group-hover:scale-110 transition-transform relative z-10" />
        </Button>
        {upcomingQueue.length > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 md:-top-1 md:-right-1 bg-gradient-to-br from-primary via-purple-500 to-pink-500 text-primary-foreground rounded-full h-5 w-5 md:h-6 md:w-6 text-[10px] md:text-xs font-bold flex items-center justify-center shadow-lg shadow-primary/40 ring-2 ring-background animate-in zoom-in duration-300 z-20"
            aria-hidden="true"
          >
            {upcomingQueue.length > 99 ? '99+' : upcomingQueue.length}
          </span>
        )}
        {/* Pulse animation when AI DJ adds new songs */}
        {aiQueuedSongIds.size > 0 && aiDJLastQueueTime > Date.now() - 5000 && (
          <span className="absolute inset-0 rounded-full bg-purple-500/30 animate-ping pointer-events-none" />
        )}
      </div>
    );
  }

  return (
    <>
      {/* Backdrop for mobile - tap to close */}
      <div
        className="fixed inset-0 z-40 bg-black/20 md:hidden"
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
      />
      <div
        className="fixed bottom-[calc(4rem+1rem)] right-2 z-50 w-72 sm:w-80 md:w-96 md:right-4 md:bottom-[calc(5rem+1rem)] landscape:max-md:bottom-[calc(3.5rem+0.5rem)] landscape:max-md:w-[min(45vw,20rem)] animate-in slide-in-from-right duration-300"
        role="dialog"
        aria-label="Playback queue"
        aria-modal="false"
      >
      <Card className="shadow-2xl border-2 border-primary/10 bg-gradient-to-br from-background via-background to-primary/5 backdrop-blur-xl overflow-hidden max-h-[60vh] md:max-h-[calc(100vh-8rem)] landscape:max-md:max-h-[calc(100vh-5rem)] flex flex-col">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-purple-500 to-pink-500" />
        <CardHeader className="pb-2 md:pb-3 px-3 md:px-6 pt-3 md:pt-6 bg-gradient-to-br from-primary/5 to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 md:p-2 bg-gradient-to-br from-primary/20 to-purple-500/20 rounded-lg">
                <Music className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base md:text-lg font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                  Queue
                </CardTitle>
                <CardDescription className="text-[10px] md:text-xs">
                  {upcomingQueue.length} {upcomingQueue.length === 1 ? 'song' : 'songs'} up next
                </CardDescription>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsOpen(false)}
              className="h-10 w-10 min-h-[44px] min-w-[44px] p-0 rounded-full hover:bg-red-500/10 hover:text-red-600 transition-all duration-200 hover:scale-110 touch-target"
              aria-label="Close queue panel"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* AI DJ Status */}
          {aiDJEnabled && (
            <div className="mt-3 pt-3 border-t border-border/50">
              {aiDJIsLoading ? (
                <div className="flex items-center gap-2 text-xs font-medium text-yellow-700 dark:text-yellow-300 bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 px-3 py-2 rounded-lg border border-yellow-200/50 dark:border-yellow-800/50 shadow-sm">
                  <div className="p-1 bg-yellow-100 dark:bg-yellow-900/40 rounded animate-pulse">
                    <span className="block h-3 w-3 animate-spin">⏳</span>
                  </div>
                  <span>AI DJ generating recommendations...</span>
                </div>
              ) : aiQueuedSongIds.size > 0 ? (
                <div className="flex items-center gap-2 text-xs font-medium text-blue-700 dark:text-blue-300 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 px-3 py-2 rounded-lg border border-blue-200/50 dark:border-blue-800/50 shadow-sm">
                  <div className="p-1 bg-blue-100 dark:bg-blue-900/40 rounded">
                    <span className="block h-3 w-3">✨</span>
                  </div>
                  <span>
                    {aiQueuedSongIds.size} AI-powered {aiQueuedSongIds.size === 1 ? 'track' : 'tracks'}
                    {aiDJLastQueueTime > 0 && (
                      <> • {Math.floor(timeSinceLastQueue / 60000)}m ago</>
                    )}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs font-medium text-green-700 dark:text-green-300 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 px-3 py-2 rounded-lg border border-green-200/50 dark:border-green-800/50 shadow-sm">
                  <div className="p-1 bg-green-100 dark:bg-green-900/40 rounded animate-pulse">
                    <span className="block h-3 w-3">✨</span>
                  </div>
                  <span>AI DJ actively monitoring your queue</span>
                </div>
              )}
            </div>
          )}

          {/* Autoplay Status */}
          {autoplayEnabled && (
            <div className="mt-3 pt-3 border-t border-border/50">
              {autoplayIsLoading ? (
                <div className="flex items-center gap-2 text-xs font-medium text-yellow-700 dark:text-yellow-300 bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 px-3 py-2 rounded-lg border border-yellow-200/50 dark:border-yellow-800/50 shadow-sm">
                  <div className="p-1 bg-yellow-100 dark:bg-yellow-900/40 rounded animate-pulse">
                    <span className="block h-3 w-3 animate-spin">⏳</span>
                  </div>
                  <span>Autoplay finding recommendations...</span>
                </div>
              ) : autoplayQueuedSongIds.size > 0 ? (
                <div className="flex items-center gap-2 text-xs font-medium text-indigo-700 dark:text-indigo-300 bg-gradient-to-r from-indigo-50 to-cyan-50 dark:from-indigo-900/20 dark:to-cyan-900/20 px-3 py-2 rounded-lg border border-indigo-200/50 dark:border-indigo-800/50 shadow-sm">
                  <div className="p-1 bg-indigo-100 dark:bg-indigo-900/40 rounded">
                    <span className="block h-3 w-3">🎶</span>
                  </div>
                  <span>
                    {autoplayQueuedSongIds.size} autoplay {autoplayQueuedSongIds.size === 1 ? 'track' : 'tracks'}
                    {autoplayLastQueueTime > 0 && (
                      <> • {Math.floor((Date.now() - autoplayLastQueueTime) / 60000)}m ago</>
                    )}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs font-medium text-indigo-700 dark:text-indigo-300 bg-gradient-to-r from-indigo-50 to-cyan-50 dark:from-indigo-900/20 dark:to-cyan-900/20 px-3 py-2 rounded-lg border border-indigo-200/50 dark:border-indigo-800/50 shadow-sm">
                  <div className="p-1 bg-indigo-100 dark:bg-indigo-900/40 rounded">
                    <span className="block h-3 w-3">🎶</span>
                  </div>
                  <span>Autoplay ready for when playlist ends</span>
                </div>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent className="pb-2 md:pb-3 px-3 md:px-6 flex-1 overflow-hidden flex flex-col min-h-0">
          {currentSong && (
            <div className="mb-2 md:mb-3 pb-2 md:pb-3 border-b border-border/50 bg-gradient-to-r from-primary/5 to-transparent -mx-3 md:-mx-4 px-3 md:px-4 py-2 md:py-3">
              <p className="text-[10px] md:text-xs font-semibold text-primary/80 mb-1.5 md:mb-2 uppercase tracking-wider">Now Playing</p>
              <div className="flex items-center gap-2 md:gap-3">
                <div className="p-1.5 md:p-2 bg-gradient-to-br from-primary/20 to-purple-500/20 rounded-lg shadow-sm animate-pulse">
                  <Music className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-xs md:text-sm truncate bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text">{currentSong.title}</p>
                  <p className="text-[10px] md:text-xs text-muted-foreground/80 truncate">{currentSong.artist}</p>
                </div>
              </div>
            </div>
          )}

          {upcomingQueue.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground/70 bg-gradient-to-br from-muted/20 to-transparent rounded-lg border border-dashed border-border/30">
              <div className="p-3 bg-gradient-to-br from-muted/30 to-muted/10 rounded-full w-12 h-12 mx-auto mb-3 flex items-center justify-center">
                <Music className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium">Your queue is empty</p>
              <p className="text-xs mt-1">Add songs to see them here</p>
            </div>
          ) : (
            <>
              {/* Simple list - no virtualization for reliability */}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={upcomingQueue.map(s => s.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="h-[25vh] md:h-[40vh] overflow-y-auto overflow-x-hidden pr-1 md:pr-2 space-y-2">
                    {upcomingQueue.map((song, index) => {
                      // If nothing playing (currentSongIndex === -1), actualIndex is just index
                      const actualIndex = currentSongIndex === -1 ? index : currentSongIndex + 1 + index;
                      const isAIQueued = aiQueuedSongIds.has(song.id);
                      const isAutoplayQueued = autoplayQueuedSongIds.has(song.id);
                      const isAutoQueued = isAIQueued || isAutoplayQueued;
                      return (
                        <SortableQueueItem
                          key={song.id}
                          song={song}
                          index={index}
                          actualIndex={actualIndex}
                          onRemove={removeFromQueue}
                          onPlay={handlePlaySong}
                          isAIQueued={isAIQueued}
                          isAutoplayQueued={isAutoplayQueued}
                          currentFeedback={isAutoQueued ? getFeedbackForSong(song.id) : null}
                          onFeedback={handleAutoQueueFeedback}
                          onSkipAutoplay={skipAutoplayedSong}
                        />
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>

              <div className="mt-2 md:mt-3 pt-2 md:pt-3 border-t border-border/50 space-y-1.5 md:space-y-2">
                {/* Shuffle and Create Playlist row */}
                <div className="flex gap-1.5 md:gap-2">
                  {/* Shuffle Button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleShuffle}
                    className={`flex-1 h-8 md:h-9 text-xs md:text-sm transition-all duration-200 group ${
                      isShuffled
                        ? 'bg-gradient-to-r from-purple-500/10 to-pink-500/10 hover:from-purple-500/20 hover:to-pink-500/20 border-purple-500/30 hover:border-purple-500/40 text-purple-600 dark:text-purple-400'
                        : 'bg-gradient-to-r from-muted/5 to-transparent hover:from-muted/10 hover:to-transparent border-border/50 hover:border-border text-muted-foreground hover:text-foreground'
                    }`}
                    title={isShuffled ? 'Turn off shuffle' : 'Shuffle queue'}
                  >
                    <Shuffle className="mr-1 md:mr-2 h-3.5 w-3.5 md:h-4 md:w-4 group-hover:scale-110 transition-transform" />
                    {isShuffled ? 'Shuffled' : 'Shuffle'}
                  </Button>

                  {/* Create Playlist from Queue Button */}
                  {(currentSong || upcomingQueue.length > 0) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCreatePlaylistOpen(true)}
                      className="flex-1 h-8 md:h-9 text-xs md:text-sm bg-gradient-to-r from-primary/5 to-transparent hover:from-primary/10 hover:to-transparent border-primary/20 hover:border-primary/30 text-primary/80 hover:text-primary transition-all duration-200 group"
                    >
                      <Plus className="mr-1 md:mr-2 h-3.5 w-3.5 md:h-4 md:w-4 group-hover:scale-110 transition-transform" />
                      Save
                    </Button>
                  )}
                </div>

                {undoTimeRemaining !== null && undoTimeRemaining > 0 ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={undoClearQueue}
                    className="w-full h-8 md:h-9 text-xs md:text-sm bg-gradient-to-r from-blue-500/5 to-transparent hover:from-blue-500/10 hover:to-transparent border-blue-500/20 hover:border-blue-500/30 text-blue-600/80 hover:text-blue-600 transition-all duration-200 group"
                  >
                    <RotateCcw className="mr-1 md:mr-2 h-3.5 w-3.5 md:h-4 md:w-4 group-hover:scale-110 transition-transform" />
                    Undo Clear
                    <span className="ml-auto text-[10px] md:text-xs text-blue-500/60">
                      {undoTimeRemaining >= 60000
                        ? `${Math.floor(undoTimeRemaining / 60000)}m`
                        : `${Math.floor(undoTimeRemaining / 1000)}s`}
                    </span>
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearQueue}
                    className="w-full h-8 md:h-9 text-xs md:text-sm bg-gradient-to-r from-destructive/5 to-transparent hover:from-destructive/10 hover:to-transparent border-destructive/20 hover:border-destructive/30 text-destructive/80 hover:text-destructive transition-all duration-200 group"
                  >
                    <Trash2 className="mr-1 md:mr-2 h-3.5 w-3.5 md:h-4 md:w-4 group-hover:scale-110 transition-transform" />
                    Clear Queue
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
      
      {/* Create Playlist Dialog */}
      <CreatePlaylistDialog
        open={createPlaylistOpen}
        onOpenChange={setCreatePlaylistOpen}
        onSubmit={handleCreatePlaylistFromQueue}
      />
    </div>
    </>
  );
}
