import { createFileRoute } from "@tanstack/react-router";
import { db } from '../../../lib/db';
import { userPlaylists, playlistSongs } from '../../../lib/db/schema/playlists.schema';
import { eq, sql, desc } from 'drizzle-orm';
import { z } from 'zod';
import { searchSongsByCriteria, checkNavidromeConnectivity } from '../../../lib/services/navidrome';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
} from '../../../lib/utils/api-response';

// Zod schema for playlist validation
const CreatePlaylistSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  smartPlaylistCriteria: z.object({
    genre: z.array(z.string()).optional(),
    yearFrom: z.number().int().min(1900).max(new Date().getFullYear()).optional(),
    yearTo: z.number().int().min(1900).max(new Date().getFullYear()).optional(),
    artists: z.array(z.string()).optional(),
    rating: z.number().min(1).max(5).optional(),
    recentlyAdded: z.enum(['7d', '30d', '90d']).optional(),
  }).refine((data) => {
    // Validate year range: yearFrom <= yearTo
    if (data.yearFrom && data.yearTo && data.yearFrom > data.yearTo) {
      return false;
    }
    return true;
  }, {
    message: 'yearFrom must be less than or equal to yearTo',
  }).optional(),
});

// POST /api/playlists - Create new playlist
const POST = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const body = await request.json();
    const validatedData = CreatePlaylistSchema.parse(body);

    // Check for duplicate playlist name
    const existingPlaylist = await db
      .select()
      .from(userPlaylists)
      .where(eq(userPlaylists.userId, session.user.id))
      .where(eq(userPlaylists.name, validatedData.name))
      .limit(1)
      .then(rows => rows[0]);

    if (existingPlaylist) {
      return errorResponse('DUPLICATE_PLAYLIST_NAME', 'Playlist name already exists', { status: 409 });
    }

    // Create new playlist (with optional smart playlist criteria)
    const newPlaylist = {
      id: crypto.randomUUID(),
      userId: session.user.id,
      name: validatedData.name,
      description: validatedData.description || null,
      smartPlaylistCriteria: validatedData.smartPlaylistCriteria || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(userPlaylists).values(newPlaylist);

    // If smart playlist criteria provided, populate with matching songs
    if (validatedData.smartPlaylistCriteria) {
      try {
        console.log('🔍 Searching for songs matching smart playlist criteria:', validatedData.smartPlaylistCriteria);
        const matchingSongs = await searchSongsByCriteria(validatedData.smartPlaylistCriteria, 100);

        console.log(`📋 Found ${matchingSongs.length} songs matching criteria`);

        // Add songs to playlist
        const songsToAdd = matchingSongs.map((song, index) => ({
          id: crypto.randomUUID(),
          playlistId: newPlaylist.id,
          songId: song.id,
          songArtistTitle: `${song.artist} - ${song.title}`,
          position: index,
          addedAt: new Date(),
        }));

        if (songsToAdd.length > 0) {
          await db.insert(playlistSongs).values(songsToAdd);
        }

        // Update playlist with song count and duration
        const totalDuration = matchingSongs.reduce((sum, song) => sum + parseInt(song.duration || '0'), 0);
        await db
          .update(userPlaylists)
          .set({
            songCount: matchingSongs.length,
            totalDuration,
            updatedAt: new Date(),
          })
          .where(eq(userPlaylists.id, newPlaylist.id));

        console.log(`✅ Smart playlist "${newPlaylist.name}" created with ${matchingSongs.length} songs`);
      } catch (error) {
        console.error('Failed to populate smart playlist:', error);
        // Don't fail the whole request, playlist is created but empty
      }
    }

    return successResponse(newPlaylist, 201);
  },
  {
    service: 'playlists',
    operation: 'create',
    defaultCode: 'PLAYLIST_CREATE_ERROR',
    defaultMessage: 'Failed to create playlist',
  }
);

// GET /api/playlists - List all user playlists
const GET = withAuthAndErrorHandling(
  async ({ session }) => {
    // Check Navidrome connectivity (non-blocking)
    const navidromeAvailable = await checkNavidromeConnectivity();

    // Fetch playlists with all Navidrome sync fields (always show cached data)
    const playlists = await db
      .select({
        id: userPlaylists.id,
        name: userPlaylists.name,
        description: userPlaylists.description,
        navidromeId: userPlaylists.navidromeId,
        lastSynced: userPlaylists.lastSynced,
        songCount: userPlaylists.songCount,
        totalDuration: userPlaylists.totalDuration,
        smartPlaylistCriteria: userPlaylists.smartPlaylistCriteria,
        createdAt: userPlaylists.createdAt,
        updatedAt: userPlaylists.updatedAt,
        actualSongCount: sql<number>`cast(count(${playlistSongs.id}) as int)`,
      })
      .from(userPlaylists)
      .leftJoin(playlistSongs, eq(userPlaylists.id, playlistSongs.playlistId))
      .where(eq(userPlaylists.userId, session.user.id))
      .groupBy(userPlaylists.id, userPlaylists.name, userPlaylists.description,
               userPlaylists.navidromeId, userPlaylists.lastSynced, userPlaylists.songCount,
               userPlaylists.totalDuration, userPlaylists.smartPlaylistCriteria,
               userPlaylists.createdAt, userPlaylists.updatedAt)
      .orderBy(desc(userPlaylists.createdAt));

    return successResponse({
      playlists,
      navidromeAvailable, // Include connectivity status
    });
  },
  {
    service: 'playlists',
    operation: 'list',
    defaultCode: 'PLAYLIST_FETCH_ERROR',
    defaultMessage: 'Failed to fetch playlists',
  }
);

export const Route = createFileRoute("/api/playlists/")({
  server: {
    handlers: {
      POST,
      GET,
    },
  },
});
