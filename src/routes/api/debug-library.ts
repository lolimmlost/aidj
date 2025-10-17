import { createServerFileRoute } from '@tanstack/react-start/server';
import { buildLibraryIndex, getLibraryIndexStats } from '../../lib/services/library-index';

export const ServerRoute = createServerFileRoute('/api/debug-library').methods({
  GET: async () => {
    try {
      // Force rebuild index
      const index = await buildLibraryIndex(true);

      // Get stats
      const stats = await getLibraryIndexStats();

      // Sample some songs
      const sampleSongs = index.songList.slice(0, 20);

      return new Response(JSON.stringify({
        success: true,
        stats,
        sampleSongs,
        totalSongs: index.songList.length,
        totalArtists: index.artists.length,
      }, null, 2), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('💥 Debug library error:', error);
      return new Response(JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
});
