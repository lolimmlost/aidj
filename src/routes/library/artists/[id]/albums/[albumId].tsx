import { createFileRoute, useParams, redirect } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { getSongs } from '@/lib/services/navidrome';
import { useAudioStore } from '@/lib/stores/audio';
import { Loader2 } from 'lucide-react';
import { SongFeedbackButtons } from '@/components/library/SongFeedbackButtons';
import { useSongFeedback } from '@/lib/hooks/useSongFeedback';

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
  const { playSong } = useAudioStore();

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
              className="flex items-center p-3 sm:p-4 border rounded hover:bg-accent hover:text-accent-foreground cursor-pointer min-h-[44px] transition-colors"
              onClick={() => handleSongClick(song.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleSongClick(song.id);
                }
              }}
            >
              <div className="w-6 sm:w-8 text-right mr-3 sm:mr-4 text-sm sm:text-base text-muted-foreground flex-shrink-0">
                {song.track}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate text-sm sm:text-base">{song.name}</div>
                <div className="text-xs sm:text-sm text-muted-foreground">
                  Duration: {Math.floor(song.duration / 60)}:{(song.duration % 60).toString().padStart(2, '0')}
                </div>
              </div>
              <div className="ml-2 flex-shrink-0">
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