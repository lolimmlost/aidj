import { useAudioStore } from '@/lib/stores/audio';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, Music, Trash2, GripVertical } from 'lucide-react';
import { useState, useEffect } from 'react';
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
  song: { id: string; title?: string; artist?: string };
  index: number;
  actualIndex: number;
  onRemove: (index: number) => void;
  onPlay: (index: number) => void;
  isAIQueued?: boolean;
}

function SortableQueueItem({ song, index, actualIndex, onRemove, onPlay, isAIQueued }: SortableQueueItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: song.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-start gap-3 p-3 rounded-lg transition-all duration-200 hover:scale-[1.02] ${
        isAIQueued
          ? 'bg-gradient-to-r from-blue-50/50 to-purple-50/50 dark:from-blue-950/30 dark:to-purple-950/30 border border-blue-200/30 dark:border-blue-800/30 shadow-sm'
          : 'bg-gradient-to-r from-background to-muted/20 hover:from-muted/10 hover:to-muted/30 border border-border/30 hover:border-border/50 shadow-sm'
      }`}
      title={isAIQueued ? 'Added by AI DJ' : ''}
    >
      <button
        className="text-muted-foreground/70 hover:text-foreground cursor-grab active:cursor-grabbing mt-0.5 flex-shrink-0 touch-none hover:scale-110 transition-transform"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center mt-0.5">
        <span className="text-xs font-bold text-primary/80">
          {index + 1}
        </span>
      </div>
      <div
        className="min-w-0 flex-1 cursor-pointer"
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
        <div className="flex items-center gap-2">
          <p className="font-semibold text-sm truncate">{song.title}</p>
          {isAIQueued && (
            <div className="p-1 bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/40 dark:to-purple-900/40 rounded-full flex-shrink-0 animate-pulse">
              <span className="block h-3 w-3 text-blue-600 dark:text-blue-300">✨</span>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground/80 truncate mt-0.5">{song.artist}</p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(actualIndex);
        }}
        className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-all duration-200 flex-shrink-0 hover:bg-red-500/10 hover:text-red-600 hover:scale-110 rounded-full"
        title="Remove from queue"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export function QueuePanel() {
  const {
    playlist,
    currentSongIndex,
    getUpcomingQueue,
    removeFromQueue,
    clearQueue,
    reorderQueue,
    playSong,
    setIsPlaying,
    aiQueuedSongIds,
    aiDJEnabled,
    aiDJIsLoading,
    aiDJLastQueueTime,
  } = useAudioStore();
  const [isOpen, setIsOpen] = useState(false);
  const [timeSinceLastQueue, setTimeSinceLastQueue] = useState(0);
  
  // Update time since last queue periodically
  useEffect(() => {
    const updateTime = () => {
      setTimeSinceLastQueue(Date.now() - aiDJLastQueueTime);
    };
    
    updateTime(); // Initial update
    const interval = setInterval(updateTime, 60000); // Update every minute
    
    return () => clearInterval(interval);
  }, [aiDJLastQueueTime]);

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

  const upcomingQueue = getUpcomingQueue();

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    // Find indices in the upcoming queue
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

  if (!isOpen) {
    // Collapsed state - show count badge
    return (
      <div className="fixed bottom-24 right-4 z-50">
        <Button
          onClick={() => setIsOpen(true)}
          variant="outline"
          className="rounded-full h-14 w-14 p-0 shadow-2xl bg-gradient-to-br from-background via-background to-primary/5 border-2 border-primary/20 hover:border-primary/40 backdrop-blur-xl transition-all duration-300 hover:scale-110 hover:shadow-primary/30 group relative"
          title="Show queue"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-purple-500/5 to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <Music className="h-6 w-6 text-primary group-hover:scale-110 transition-transform relative z-10" />
        </Button>
        {upcomingQueue.length > 0 && (
          <span className="absolute top-0 right-0 bg-gradient-to-br from-primary via-purple-500 to-pink-500 text-primary-foreground rounded-full h-6 w-6 text-xs font-bold flex items-center justify-center shadow-lg shadow-primary/40 ring-2 ring-background animate-in zoom-in duration-300 z-20">
            {upcomingQueue.length}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="fixed bottom-24 right-4 z-50 w-80 sm:w-96 animate-in slide-in-from-right duration-300">
      <Card className="shadow-2xl border-2 border-primary/10 bg-gradient-to-br from-background via-background to-primary/5 backdrop-blur-xl overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-purple-500 to-pink-500" />
        <CardHeader className="pb-3 bg-gradient-to-br from-primary/5 to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-gradient-to-br from-primary/20 to-purple-500/20 rounded-lg">
                <Music className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                  Queue
                </CardTitle>
                <CardDescription className="text-xs">
                  {upcomingQueue.length} {upcomingQueue.length === 1 ? 'song' : 'songs'} up next
                </CardDescription>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsOpen(false)}
              className="h-9 w-9 p-0 rounded-full hover:bg-red-500/10 hover:text-red-600 transition-all duration-200 hover:scale-110"
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
        </CardHeader>
        <CardContent className="pb-3">
          {currentSong && (
            <div className="mb-3 pb-3 border-b border-border/50 bg-gradient-to-r from-primary/5 to-transparent -mx-4 px-4 py-3">
              <p className="text-xs font-semibold text-primary/80 mb-2 uppercase tracking-wider">Now Playing</p>
              <div className="flex items-start gap-3">
                <div className="p-2 bg-gradient-to-br from-primary/20 to-purple-500/20 rounded-lg shadow-sm animate-pulse">
                  <Music className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text">{currentSong.title}</p>
                  <p className="text-xs text-muted-foreground/80 truncate">{currentSong.artist}</p>
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
              <ScrollArea className="h-64 pr-2">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={upcomingQueue.map(s => s.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {upcomingQueue.map((song, index) => {
                        const actualIndex = currentSongIndex + 1 + index;
                        const isAIQueued = aiQueuedSongIds.has(song.id);
                        return (
                          <SortableQueueItem
                            key={song.id}
                            song={song}
                            index={index}
                            actualIndex={actualIndex}
                            onRemove={removeFromQueue}
                            onPlay={handlePlaySong}
                            isAIQueued={isAIQueued}
                          />
                        );
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
              </ScrollArea>

              <div className="mt-3 pt-3 border-t border-border/50">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearQueue}
                  className="w-full bg-gradient-to-r from-destructive/5 to-transparent hover:from-destructive/10 hover:to-transparent border-destructive/20 hover:border-destructive/30 text-destructive/80 hover:text-destructive transition-all duration-200 group"
                >
                  <Trash2 className="mr-2 h-4 w-4 group-hover:scale-110 transition-transform" />
                  Clear Queue
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
