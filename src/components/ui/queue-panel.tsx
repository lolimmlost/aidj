import { useAudioStore } from '@/lib/stores/audio';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, Music, Trash2, GripVertical } from 'lucide-react';
import { useState } from 'react';
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
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortableQueueItemProps {
  song: { id: string; title: string; artist: string };
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
      className={`group flex items-start gap-2 p-2 rounded hover:bg-accent transition-colors ${
        isAIQueued ? 'bg-blue-50 dark:bg-blue-950/20' : ''
      }`}
      title={isAIQueued ? 'Added by AI DJ' : ''}
    >
      <button
        className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing mt-0.5 flex-shrink-0 touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="text-xs text-muted-foreground w-5 mt-0.5 flex-shrink-0">
        {index + 1}
      </span>
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
        <div className="flex items-center gap-1.5">
          <p className="font-medium text-sm truncate">{song.title}</p>
          {isAIQueued && (
            <span className="text-xs flex-shrink-0" title="Added by AI DJ">
              ✨
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(actualIndex);
        }}
        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        title="Remove from queue"
      >
        <X className="h-3 w-3" />
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
      <div className="fixed bottom-24 right-4 z-40">
        <Button
          onClick={() => setIsOpen(true)}
          variant="outline"
          className="rounded-full h-12 w-12 p-0 shadow-lg"
          title="Show queue"
        >
          <Music className="h-5 w-5" />
          {upcomingQueue.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground rounded-full h-5 w-5 text-xs flex items-center justify-center">
              {upcomingQueue.length}
            </span>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-24 right-4 z-40 w-80">
      <Card className="shadow-xl">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Queue</CardTitle>
              <CardDescription>
                {upcomingQueue.length} {upcomingQueue.length === 1 ? 'song' : 'songs'} up next
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsOpen(false)}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* AI DJ Status */}
          {aiDJEnabled && (
            <div className="mt-3 pt-3 border-t">
              {aiDJIsLoading ? (
                <div className="flex items-center gap-2 text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 px-2 py-1.5 rounded">
                  <span className="animate-spin">⏳</span>
                  <span>AI DJ fetching songs...</span>
                </div>
              ) : aiQueuedSongIds.size > 0 ? (
                <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-1.5 rounded">
                  <span>✨</span>
                  <span>
                    {aiQueuedSongIds.size} AI {aiQueuedSongIds.size === 1 ? 'song' : 'songs'} in queue
                    {aiDJLastQueueTime > 0 && (
                      <> • {Math.floor((Date.now() - aiDJLastQueueTime) / 60000)}m ago</>
                    )}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-1.5 rounded">
                  <span>✨</span>
                  <span>AI DJ Active • Watching queue</span>
                </div>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent className="pb-3">
          {currentSong && (
            <div className="mb-3 pb-3 border-b">
              <p className="text-xs text-muted-foreground mb-1">Now Playing</p>
              <div className="flex items-start gap-2">
                <Music className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{currentSong.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{currentSong.artist}</p>
                </div>
              </div>
            </div>
          )}

          {upcomingQueue.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Music className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Queue is empty</p>
            </div>
          ) : (
            <>
              <ScrollArea className="h-64">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={upcomingQueue.map(s => s.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-1">
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

              <div className="mt-3 pt-3 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearQueue}
                  className="w-full"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
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
