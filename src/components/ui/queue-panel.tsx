import { useAudioStore } from '@/lib/stores/audio';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, Music, Trash2 } from 'lucide-react';
import { useState } from 'react';

export function QueuePanel() {
  const { playlist, currentSongIndex, getUpcomingQueue, removeFromQueue, clearQueue } = useAudioStore();
  const [isOpen, setIsOpen] = useState(false);

  const currentSong = currentSongIndex >= 0 && currentSongIndex < playlist.length
    ? playlist[currentSongIndex]
    : null;

  const upcomingQueue = getUpcomingQueue();

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
                <div className="space-y-1">
                  {upcomingQueue.map((song, index) => {
                    const actualIndex = currentSongIndex + 1 + index;
                    return (
                      <div
                        key={`${song.id}-${actualIndex}`}
                        className="group flex items-start gap-2 p-2 rounded hover:bg-accent transition-colors"
                      >
                        <span className="text-xs text-muted-foreground w-5 mt-0.5 flex-shrink-0">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">{song.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFromQueue(actualIndex)}
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                          title="Remove from queue"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
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
