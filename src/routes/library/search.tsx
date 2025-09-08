import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { search } from '@/lib/services/navidrome';
import { AudioPlayer } from '@/components/ui/audio-player';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';

export const Route = createFileRoute('/library/search')({
  component: SearchPage,
});

function SearchPage() {
  const [query, setQuery] = useState('');
  const [currentSongId, setCurrentSongId] = useState<string | undefined>(undefined);

  const { data: songs = [], isLoading, error } = useQuery({
    queryKey: ['search', query],
    queryFn: () => search(query, 0, 50),
    enabled: query.length > 0,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.length > 0) {
      // The query will trigger the useQuery
    }
  };

  if (error) {
    return <div className="container mx-auto p-4">Error searching: {error.message}</div>;
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Search Music</h1>
      <form onSubmit={handleSubmit} className="mb-4">
        <Input
          type="text"
          placeholder="Search for songs..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-md"
        />
      </form>
      {isLoading ? (
        <div className="flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : query.length === 0 ? (
       <div>Enter a search term to find songs.</div>
     ) : songs.length === 0 ? (
       <div>No results found for "{query}".</div>
     ) : (
       <div>
         <div className="space-y-2">
           {songs.map((song) => (
             <div key={song.id} className="flex items-center p-3 border rounded hover:bg-gray-100 cursor-pointer" onClick={() => setCurrentSongId(song.id)}>
               <div className="w-8 text-right mr-4">{song.track}</div>
               <div className="flex-1">
                 <div className="font-medium">{song.name}</div>
                 <div className="text-sm text-gray-600">Duration: {Math.floor(song.duration / 60)}:{(song.duration % 60).toString().padStart(2, '0')}</div>
               </div>
             </div>
           ))}
         </div>

         {songs.length > 0 && <AudioPlayer songs={songs} initialSongId={currentSongId} />}
       </div>
     )}
   </div>
 );
}