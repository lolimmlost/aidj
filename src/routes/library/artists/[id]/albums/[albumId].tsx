import { createFileRoute, useParams } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { getSongs } from '@/lib/services/navidrome';
import { AudioPlayer } from '@/components/ui/audio-player';
import { Loader2 } from 'lucide-react';

export const Route = createFileRoute('/library/artists/id/albums/albumId')({
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
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Songs</h1>
      {isLoading ? (
        <div className="flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <div className="space-y-2">
          {sortedSongs.map((song) => (
            <div
              key={song.id}
              className="flex items-center p-3 border rounded hover:bg-gray-100 cursor-pointer"
              onClick={() => setCurrentSongId(song.id)}
            >
              <div className="w-8 text-right mr-4">{song.track}</div>
              <div className="flex-1">
                <div className="font-medium">{song.name}</div>
                <div className="text-sm text-gray-600">Duration: {Math.floor(song.duration / 60)}:{(song.duration % 60).toString().padStart(2, '0')}</div>
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