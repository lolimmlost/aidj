import { createFileRoute } from "@tanstack/react-router";
import { z } from 'zod';
import { db } from '../../../lib/db';
import { userPlaylists, playlistSongs } from '../../../lib/db/schema/playlists.schema';
import { playlistExportJobs } from '../../../lib/db/schema/playlist-export.schema';
import { eq, and } from 'drizzle-orm';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
} from '../../../lib/utils/api-response';
import {
  exportPlaylist,
  generateExportFilename,
  getMimeType,
  type ExportablePlaylist,
  type ExportableSong,
} from '../../../lib/services/playlist-export';
import { getSongsByIds } from '../../../lib/services/navidrome';

// Validation schemas
const ExportRequestSchema = z.object({
  playlistId: z.string().uuid(),
  format: z.enum(['m3u', 'xspf', 'json']),
  includeMetadata: z.boolean().optional().default(true),
});

const _BatchExportRequestSchema = z.object({
  playlistIds: z.array(z.string().uuid()).min(1).max(20),
  format: z.enum(['m3u', 'xspf', 'json']),
});

// POST /api/playlists/export - Export a single playlist
const POST = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const body = await request.json();
    const validatedData = ExportRequestSchema.parse(body);

    // Get the playlist
    const playlist = await db
      .select()
      .from(userPlaylists)
      .where(
        and(
          eq(userPlaylists.id, validatedData.playlistId),
          eq(userPlaylists.userId, session.user.id)
        )
      )
      .limit(1)
      .then(rows => rows[0]);

    if (!playlist) {
      return errorResponse('NOT_FOUND', 'Playlist not found', { status: 404 });
    }

    // Get playlist songs
    const songs = await db
      .select()
      .from(playlistSongs)
      .where(eq(playlistSongs.playlistId, playlist.id))
      .orderBy(playlistSongs.position);

    // Get song details from Navidrome
    const songIds = songs.map(s => s.songId);
    let songDetails: ExportableSong[] = [];

    if (songIds.length > 0) {
      try {
        const navidromeSongs = await getSongsByIds(songIds);
        songDetails = navidromeSongs.map(ns => ({
          id: ns.id,
          title: ns.title || ns.name || 'Unknown Title',
          artist: ns.artist || 'Unknown Artist',
          album: ns.album,
          duration: ns.duration,
          track: ns.track,
        }));
      } catch (error) {
        // Fall back to basic info from playlist_songs table
        console.warn('Could not fetch song details from Navidrome:', error);
        songDetails = songs.map(s => {
          const parts = s.songArtistTitle.split(' - ');
          return {
            id: s.songId,
            title: parts[1] || s.songArtistTitle,
            artist: parts[0] || 'Unknown Artist',
          };
        });
      }
    }

    // Build exportable playlist
    const exportablePlaylist: ExportablePlaylist = {
      name: playlist.name,
      description: playlist.description || undefined,
      platform: 'navidrome',
      createdAt: playlist.createdAt,
      songs: songDetails,
    };

    // Generate export content
    const exportContent = exportPlaylist(exportablePlaylist, {
      format: validatedData.format,
      includeMetadata: validatedData.includeMetadata,
    });

    // Create export job record
    const exportJob = {
      id: crypto.randomUUID(),
      userId: session.user.id,
      playlistId: playlist.id,
      format: validatedData.format,
      sourcePlatform: 'navidrome' as const,
      status: 'completed' as const,
      totalSongs: songs.length,
      processedSongs: songs.length,
      exportedData: exportContent,
      filename: generateExportFilename(playlist.name, validatedData.format),
      startedAt: new Date(),
      completedAt: new Date(),
      createdAt: new Date(),
    };

    await db.insert(playlistExportJobs).values(exportJob);

    return successResponse({
      exportId: exportJob.id,
      filename: exportJob.filename,
      format: validatedData.format,
      mimeType: getMimeType(validatedData.format),
      content: exportContent,
      songCount: songs.length,
    });
  },
  {
    service: 'playlists/export',
    operation: 'export',
    defaultCode: 'EXPORT_ERROR',
    defaultMessage: 'Failed to export playlist',
  }
);

// GET /api/playlists/export?exportId=xxx - Download a previously exported playlist
const GET = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const url = new URL(request.url);
    const exportId = url.searchParams.get('exportId');

    if (!exportId) {
      return errorResponse('VALIDATION_ERROR', 'Export ID is required', { status: 400 });
    }

    // Get the export job
    const exportJob = await db
      .select()
      .from(playlistExportJobs)
      .where(
        and(
          eq(playlistExportJobs.id, exportId),
          eq(playlistExportJobs.userId, session.user.id)
        )
      )
      .limit(1)
      .then(rows => rows[0]);

    if (!exportJob) {
      return errorResponse('NOT_FOUND', 'Export not found', { status: 404 });
    }

    if (!exportJob.exportedData) {
      return errorResponse('EXPORT_ERROR', 'Export data not available');
    }

    // Return the export data as a downloadable file
    return new Response(exportJob.exportedData, {
      status: 200,
      headers: {
        'Content-Type': getMimeType(exportJob.format),
        'Content-Disposition': `attachment; filename="${exportJob.filename}"`,
      },
    });
  },
  {
    service: 'playlists/export',
    operation: 'download',
    defaultCode: 'EXPORT_DOWNLOAD_ERROR',
    defaultMessage: 'Failed to download export',
  }
);

export const Route = createFileRoute("/api/playlists/export")({
  server: {
    handlers: {
      POST,
      GET,
    },
  },
});
