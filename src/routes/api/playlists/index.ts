import { createFileRoute } from "@tanstack/react-router";
import { db } from '../../../lib/db';
import { userPlaylists, playlistSongs } from '../../../lib/db/schema/playlists.schema';
import { and, eq, sql, desc } from 'drizzle-orm';
import { z } from 'zod';
import { checkNavidromeConnectivity } from '../../../lib/services/navidrome';
import { ensurePlaylistOnNavidrome } from '../../../lib/services/playlist-navidrome-mirror';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
} from '../../../lib/utils/api-response';

// Zod schema for playlist validation (basic playlists only)
// Smart playlists use /api/playlists/smart endpoint
const CreatePlaylistSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

// POST /api/playlists - Create new basic playlist (empty)
// For smart playlists, use /api/playlists/smart endpoint
const POST = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const body = await request.json();
    const validatedData = CreatePlaylistSchema.parse(body);

    // Check for duplicate playlist name (scoped to this user). Must be a single
    // combined predicate: chaining `.where().where()` makes drizzle keep only the
    // last clause, which would drop the userId filter and match any user's name.
    const existingPlaylist = await db
      .select()
      .from(userPlaylists)
      .where(
        and(
          eq(userPlaylists.userId, session.user.id),
          eq(userPlaylists.name, validatedData.name),
        ),
      )
      .limit(1)
      .then(rows => rows[0]);

    if (existingPlaylist) {
      return errorResponse('DUPLICATE_PLAYLIST_NAME', 'Playlist name already exists', { status: 409 });
    }

    // Create new empty playlist
    const newPlaylist = {
      id: crypto.randomUUID(),
      userId: session.user.id,
      name: validatedData.name,
      description: validatedData.description || null,
      smartPlaylistCriteria: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(userPlaylists).values(newPlaylist);

    console.log(`✅ Playlist "${newPlaylist.name}" created (empty)`);

    // Mirror to Navidrome so it becomes a real (syncable) playlist, not a
    // local-only row. Fire-and-forget: the local write is the source of truth,
    // so we don't block the response on a best-effort Navidrome round-trip. The
    // row's navidromeId is populated in the background (and by the next edit /
    // the back-fill script if this attempt fails). ensurePlaylistOnNavidrome
    // never throws, but guard anyway so the promise can't reject unhandled.
    void ensurePlaylistOnNavidrome(newPlaylist.id, session.user.id).catch(() => {});

    return successResponse({ ...newPlaylist, navidromeId: null }, 201);
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
