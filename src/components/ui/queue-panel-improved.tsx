// Improved Queue Panel Component
// Uses unified design system for better cohesion with audio player

import React, { useState, useEffect } from 'react';
import { useAudioStore } from '@/lib/stores/audio';
import {
  AudioContainer,
  AudioButton,
  AudioStatusBadge,
  audioTokens
} from './audio-design-system';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, Music, Trash2, GripVertical } from 'lucide-react';
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
      className={`group flex items-start gap-2 p-3 rounded-lg hover:bg-accent/50 transition-colors ${
        isAIQueued ? `bg-${audioTokens.colors.ai.subtle} border border-${audioTokens.colors.ai.background}/20` : ''
      }`}
      title={isAIQueued ? 'Added by AI DJ' : ''}
    >
      <button
        className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing mt-0.5 flex-shrink-0 touch-none"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="text-xs text-muted-foreground w-5 mt-0.5 flex-shrink-0 font-mono">
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
      <AudioButton
        variant="ghost"
        size="sm"
        onClick={() => {
          onRemove(actualIndex);
        }}
        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        aria-label="Remove from queue"
        icon={<X className="h-3 w-3" />}
      />
    </div>
  );
}

export function ImprovedQueuePanel() {
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
  
  // Calculate time since last queue (using useMemo to avoid impure function call)
  const [timeSinceLastQueue, setTimeSinceLastQueue] = useState(0);
  
  // Update time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeSinceLastQueue(Date.now() - aiDJLastQueueTime);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [aiDJLastQueueTime]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
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
        <AudioButton
          variant="primary"
          size="lg"
          onClick={() => setIsOpen(true)}
          className="rounded-full h-12 w-12 p-0 shadow-lg"
          aria-label="Show queue"
          icon={<Music className="h-5 w-5" />}
        />
        {upcomingQueue.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground rounded-full h-5 w-5 text-xs flex items-center justify-center font-medium z-10">
            {upcomingQueue.length}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="fixed bottom-24 right-4 z-50 w-80">
      <AudioContainer variant="panel" className="shadow-xl">
        <div className="p-4 pb-3">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">Queue</h2>
              <p className="text-sm text-muted-foreground">
                {upcomingQueue.length} {upcomingQueue.length === 1 ? 'song' : 'songs'} up next
              </p>
            </div>
            <AudioButton
              variant="ghost"
              size="sm"
              onClick={() => setIsOpen(false)}
              aria-label="Close queue"
              icon={<X className="h-4 w-4" />}
            />
          </div>

          {/* AI DJ Status */}
          {aiDJEnabled && (
            <div className="mb-4 p-3 rounded-lg bg-muted/50">
              {aiDJIsLoading ? (
                <div className="flex items-center gap-2">
                  <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                  <AudioStatusBadge status="ai-loading" />
                </div>
              ) : aiQueuedSongIds.size > 0 ? (
                <div className="flex items-center gap-2">
                  <span className="text-2xl">✨</span>
                  <div>
                    <AudioStatusBadge 
                      status="ai-active" 
                      count={aiQueuedSongIds.size} 
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {aiDJLastQueueTime > 0 && (
                        <>Last added {Math.floor(timeSinceLastQueue / 60000)}m ago</>
                      )}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-2xl">✨</span>
                  <div>
                    <AudioStatusBadge status="ai-active" />
                    <p className="text-xs text-muted-foreground mt-1">Watching queue</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-4 pb-3">
          {currentSong && (
            <div className="mb-4 pb-3 border-b">
              <p className="text-xs text-muted-foreground mb-2 font-medium">Now Playing</p>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-gradient-to-br from-primary/20 to-secondary/20 rounded flex items-center justify-center">
                  <Music className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{currentSong.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{currentSong.artist}</p>
                </div>
                <AudioStatusBadge status="playing" />
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

              <div className="mt-4 pt-3 border-t">
                <AudioButton
                  variant="ghost"
                  onClick={clearQueue}
                  className="w-full justify-start"
                  icon={<Trash2 className="h-4 w-4 mr-2" />}
                >
                  Clear Queue
                </AudioButton>
              </div>
            </>
          )}
        </div>
      </AudioContainer>
    </div>
  );
}