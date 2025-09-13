import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { search } from '@/lib/services/navidrome';
import { AudioPlayer } from '@/components/ui/audio-player';
import { useAudioStore } from '@/lib/stores/audio';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export const Route = createFileRoute('/library/search')({
  component: SearchPage,
});

function SearchPage() {
  const [query, setQuery] = useState('');
  const { playSong } = useAudioStore();

  const { data: songs = [], isLoading, error } = useQuery({
    queryKey: ['search', query],
    queryFn: () => search(query.trim(), 0, 50),
    enabled: query.trim().length > 0,
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('Input change:', e.target.value);
    setQuery(e.target.value);
  };

  const handleSongClick = (songId: string) => {
    playSong(songId, songs);
  };

  if (error) {
    return <div style={{ padding: '20px' }}>Error searching: {error.message}</div>;
  }

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '20px' }}>Search Music Library</h1>
      
      {/* Minimal test input - no styling, no containers */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Test Input:</label>
        <input
          type="text"
          placeholder="Type here to test..."
          value={query}
          onChange={handleInputChange}
          style={{
            width: '100%',
            maxWidth: '400px',
            padding: '10px',
            border: '2px solid #ccc',
            borderRadius: '4px',
            fontSize: '16px',
            outline: 'none'
          }}
        />
        <div style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
          Debug: Query = "{query}" (length: {query.length}) | Songs: {songs.length} | Loading: {isLoading ? 'Yes' : 'No'}
        </div>
      </div>

      {/* Link for navigation */}
      <div style={{ marginBottom: '20px' }}>
        <Link to="/dashboard" style={{ color: '#3b82f6', textDecoration: 'none' }}>
          ← Back to Dashboard
        </Link>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div>Loading...</div>
        </div>
      ) : query.trim().length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          Enter a search term above to find songs in your library.
        </div>
      ) : songs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          <h3>No results found for "{query}"</h3>
          <p style={{ marginTop: '10px' }}>Try different keywords. Debug: Query="{query}", Length={query.length}</p>
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: '20px', fontWeight: 'bold' }}>
            Found {songs.length} songs
          </div>
          <div style={{ marginBottom: '20px' }}>
            {songs.map((song) => (
              <div
                key={song.id}
                style={{
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  padding: '15px',
                  marginBottom: '10px',
                  cursor: 'pointer',
                  backgroundColor: '#f9f9f9'
                }}
                onClick={() => handleSongClick(song.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{ width: '40px', textAlign: 'right', marginRight: '15px', color: '#666' }}>
                    {song.track}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>{song.name}</div>
                    <div style={{ fontSize: '14px', color: '#666' }}>
                      Duration: {Math.floor(song.duration / 60)}:{(song.duration % 60).toString().padStart(2, '0')}
                    </div>
                  </div>
                  <div style={{ marginLeft: '15px', color: '#666' }}>▶</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}