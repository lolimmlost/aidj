import { createFileRoute, useParams, redirect } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { getSongs } from '@/lib/services/navidrome';
import { useAudioStore } from '@/lib/stores/audio';
import { Loader2, Play, Plus, ListPlus } from 'lucide-react';
import { SongFeedbackButtons } from '@/components/library/SongFeedbackButtons';
import { useSongFeedback } from '@/lib/hooks/useSongFeedback';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

export const Route = createFileRoute('/library/artists/id/albums/albumId')({
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw redirect({ to: '/login' });
    }
  },
  component: AlbumSongs,
});

function AlbumSongs() {
  const { albumId } = useParams({ from: '/library/artists/id/albums/albumId' }) as { albumId: string };
  const { playSong, addToQueueNext, addToQueueEnd, setIsPlaying } = useAudioStore();

  const { data: songs = [], isLoading, error } = useQuery({
    queryKey: ['songs', albumId],
    queryFn: () => getSongs(albumId, 0, 50), // Fetch first 50 songs for the album
  });

  // Fetch feedback for all songs
  const songIds = songs.map(song => song.id);
  const { data: feedbackData } = useSongFeedback(songIds);
  const feedback = feedbackData?.feedback || {};

  const handleSongClick = (songId: string) => {
    playSong(songId, songs);
  };

  const handleAddToQueue = (song: typeof songs[0], position: 'now' | 'next' | 'end') => {
    const audioSong = {
      id: song.id,
      title: song.name,
      artist: song.artist,
      album: song.album,
      albumId: song.albumId,
      url: `/api/navidrome/stream/${song.id}`,
      duration: song.duration,
      track: song.track,
    };

    if (position === 'now') {
      playSong(song.id, songs);
      setIsPlaying(true);
      toast.success(`Now playing "${song.name}"`);
    } else if (position === 'next') {
      addToQueueNext([audioSong]);
      toast.success(`Added "${song.name}" to play next`);
    } else {
      addToQueueEnd([audioSong]);
      toast.success(`Added "${song.name}" to end of queue`);
    }
  };

  if (error) {
    return <div className="container mx-auto p-4">Error loading songs: {error.message}</div>;
  }

  // Sort songs by track number
  const sortedSongs = [...songs].sort((a, b) => a.track - b.track);

  return (
    <div className="container mx-auto p-3 sm:p-6">
      <h1 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6">Songs</h1>
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-2">
          {sortedSongs.map((song) => (
            <div
              key={song.id}
              className="flex items-center p-3 sm:p-4 border rounded hover:bg-accent transition-colors min-h-[44px]"
            >
              <div className="w-6 sm:w-8 text-right mr-3 sm:mr-4 text-sm sm:text-base text-muted-foreground flex-shrink-0">
                {song.track}
              </div>
              <div
                className="flex-1 min-w-0 cursor-pointer hover:text-accent-foreground"
                onClick={() => handleSongClick(song.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSongClick(song.id);
                  }
                }}
              >
                <div className="font-medium truncate text-sm sm:text-base">{song.name}</div>
                <div className="text-xs sm:text-sm text-muted-foreground">
                  Duration: {Math.floor(song.duration / 60)}:{(song.duration % 60).toString().padStart(2, '0')}
                </div>
              </div>
              <div className="ml-2 flex items-center gap-2 flex-shrink-0">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 p-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ListPlus className="h-4 w-4" />
                      <span className="sr-only">Add to queue</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddToQueue(song, 'now');
                      }}
                      className="min-h-[44px]"
                    >
                      <Play className="mr-2 h-4 w-4" />
                      Play Now
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddToQueue(song, 'next');
                      }}
                      className="min-h-[44px]"
                    >
                      <Play className="mr-2 h-4 w-4" />
                      Play Next
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddToQueue(song, 'end');
                      }}
                      className="min-h-[44px]"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add to End
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <SongFeedbackButtons
                  songId={song.id}
                  artistName={song.artist || 'Unknown Artist'}
                  songTitle={song.name}
                  currentFeedback={feedback[song.id] || null}
                  source="library"
                  size="sm"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}