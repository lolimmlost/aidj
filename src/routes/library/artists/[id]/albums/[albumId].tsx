import { createFileRoute, useParams, redirect } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { getSongs } from '@/lib/services/navidrome';
import { AudioPlayer } from '@/components/ui/audio-player';
import { Loader2 } from 'lucide-react';

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
  const [currentSongId, setCurrentSongId] = useState<string | undefined>(undefined);

  const { data: songs = [], isLoading, error } = useQuery({
    queryKey: ['songs', albumId],
    queryFn: () => getSongs(albumId, 0, 50), // Fetch first 50 songs for the album
  });

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
              onClick={() => setCurrentSongId(song.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  setCurrentSongId(song.id);
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
            </div>
          ))}
        </div>
      )}

      {sortedSongs.length > 0 && (
        <AudioPlayer
          songs={sortedSongs}
          initialSongId={currentSongId}
        />
      )}
    </div>
  );
}