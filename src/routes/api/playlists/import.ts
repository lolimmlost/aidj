import { createFileRoute } from "@tanstack/react-router";
import { z } from 'zod';
import { db } from '../../../lib/db';
import { userPlaylists, playlistSongs } from '../../../lib/db/schema/playlists.schema';
import { playlistImportJobs } from '../../../lib/db/schema/playlist-export.schema';
import { eq, and } from 'drizzle-orm';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
} from '../../../lib/utils/api-response';
import {
  parsePlaylist,
  validatePlaylistContent,
  type ExportablePlaylist,
} from '../../../lib/services/playlist-export';
import {
  matchSongs,
  generateMatchReport,
  type MatchOptions,
} from '../../../lib/services/song-matcher';
import { search as navidromeSearch } from '../../../lib/services/navidrome';
import type { SongMatchResult, PlaylistPlatform } from '../../../lib/db/schema/playlist-export.schema';

// Validation schemas
const ImportValidateSchema = z.object({
  content: z.string().min(1),
  format: z.enum(['m3u', 'xspf', 'json']).optional(),
});

const ImportRequestSchema = z.object({
  content: z.string().min(1),
  format: z.enum(['m3u', 'xspf', 'json']).optional(),
  playlistName: z.string().min(1).max(100).optional(),
  targetPlatform: z.enum(['navidrome', 'spotify', 'youtube_music']).default('navidrome'),
  autoMatch: z.boolean().default(true),
  createPlaylist: z.boolean().default(true),
});

const ImportConfirmSchema = z.object({
  importJobId: z.string().uuid(),
  matchResults: z.array(z.object({
    originalSong: z.object({
      title: z.string(),
      artist: z.string(),
      album: z.string().optional(),
    }),
    selectedMatch: z.object({
      platform: z.string(),
      platformId: z.string(),
    }).optional(),
    status: z.enum(['matched', 'pending_review', 'no_match', 'skipped']),
  })),
});

// Create a Navidrome searcher for matching
function createNavidromeSearcher() {
  return {
    platform: 'navidrome' as PlaylistPlatform,

    async searchByIsrc(_isrc: string) {
      // Navidrome doesn't support ISRC search
      return [];
    },

    async searchByTitleArtist(title: string, artist: string) {
      const query = `${artist} ${title}`;
      const results = await navidromeSearch(query);

      return results.map(song => ({
        platform: 'navidrome' as PlaylistPlatform,
        platformId: song.id,
        title: song.title || song.name || 'Unknown',
        artist: song.artist || 'Unknown Artist',
        album: song.album,
        duration: song.duration,
      }));
    },
  };
}

// POST /api/playlists/import/validate - Validate playlist content before importing
const validateHandler = withAuthAndErrorHandling(
  async ({ request }) => {
    const body = await request.json();
    const validatedData = ImportValidateSchema.parse(body);

    const validation = validatePlaylistContent(validatedData.content, validatedData.format);

    if (!validation.valid) {
      return successResponse({
        valid: false,
        errors: validation.errors,
        warnings: validation.warnings,
      });
    }

    // Parse to get more details
    const parsed = parsePlaylist(validatedData.content, validatedData.format);

    return successResponse({
      valid: true,
      errors: [],
      warnings: validation.warnings,
      playlist: {
        name: parsed.playlist.name,
        description: parsed.playlist.description,
        songCount: parsed.playlist.songs.length,
        format: parsed.format,
      },
    });
  },
  {
    service: 'playlists/import',
    operation: 'validate',
    defaultCode: 'IMPORT_VALIDATE_ERROR',
    defaultMessage: 'Failed to validate playlist',
  }
);

// POST /api/playlists/import - Import a playlist
const POST = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const body = await request.json();
    const validatedData = ImportRequestSchema.parse(body);

    // Parse the playlist content
    const parseResult = parsePlaylist(validatedData.content, validatedData.format);
    const playlist = parseResult.playlist;

    // Use provided name or parsed name
    const playlistName = validatedData.playlistName || playlist.name || 'Imported Playlist';

    // Check for duplicate playlist name
    const existingPlaylist = await db
      .select()
      .from(userPlaylists)
      .where(
        and(
          eq(userPlaylists.userId, session.user.id),
          eq(userPlaylists.name, playlistName)
        )
      )
      .limit(1)
      .then(rows => rows[0]);

    if (existingPlaylist) {
      return errorResponse('DUPLICATE_PLAYLIST_NAME', 'A playlist with this name already exists', { status: 409 });
    }

    // Create import job record
    const importJobId = crypto.randomUUID();
    const importJob = {
      id: importJobId,
      userId: session.user.id,
      format: parseResult.format,
      targetPlatform: validatedData.targetPlatform as PlaylistPlatform,
      originalFilename: undefined,
      playlistName,
      playlistDescription: playlist.description,
      status: 'processing' as const,
      totalSongs: playlist.songs.length,
      processedSongs: 0,
      matchedSongs: 0,
      unmatchedSongs: 0,
      pendingReviewSongs: 0,
      matchResults: null,
      startedAt: new Date(),
      createdAt: new Date(),
    };

    await db.insert(playlistImportJobs).values(importJob);

    // Match songs if auto-match is enabled
    let matchResults: SongMatchResult[] = [];

    if (validatedData.autoMatch && validatedData.targetPlatform === 'navidrome') {
      try {
        const searcher = createNavidromeSearcher();
        const matchOptions: MatchOptions = {
          targetPlatforms: ['navidrome'],
          useFuzzyMatch: true,
          minConfidenceScore: 50,
          maxMatchesPerSong: 5,
        };

        matchResults = await matchSongs(playlist.songs, [searcher], matchOptions);

        // Update import job with match results
        const report = generateMatchReport(matchResults);

        await db
          .update(playlistImportJobs)
          .set({
            processedSongs: playlist.songs.length,
            matchedSongs: report.summary.matched,
            unmatchedSongs: report.summary.noMatch,
            pendingReviewSongs: report.summary.pendingReview,
            matchResults: matchResults,
            status: report.summary.pendingReview > 0 ? 'processing' : 'completed',
          })
          .where(eq(playlistImportJobs.id, importJobId));

      } catch (error) {
        console.error('Error matching songs:', error);
        // Continue without matching
      }
    }

    // Create playlist if requested and all songs are matched
    let createdPlaylistId: string | null = null;

    if (validatedData.createPlaylist) {
      const matchedSongs = matchResults.filter(r => r.status === 'matched' && r.selectedMatch);

      if (matchedSongs.length > 0) {
        // Create the playlist
        const newPlaylist = {
          id: crypto.randomUUID(),
          userId: session.user.id,
          name: playlistName,
          description: playlist.description || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await db.insert(userPlaylists).values(newPlaylist);
        createdPlaylistId = newPlaylist.id;

        // Add matched songs
        const songsToAdd = matchedSongs.map((result, index) => ({
          id: crypto.randomUUID(),
          playlistId: newPlaylist.id,
          songId: result.selectedMatch!.platformId,
          songArtistTitle: `${result.originalSong.artist} - ${result.originalSong.title}`,
          position: index,
          addedAt: new Date(),
        }));

        if (songsToAdd.length > 0) {
          await db.insert(playlistSongs).values(songsToAdd);
        }

        // Update playlist stats
        await db
          .update(userPlaylists)
          .set({
            songCount: songsToAdd.length,
            updatedAt: new Date(),
          })
          .where(eq(userPlaylists.id, newPlaylist.id));

        // Update import job
        await db
          .update(playlistImportJobs)
          .set({
            createdPlaylistId: newPlaylist.id,
            status: 'completed',
            completedAt: new Date(),
          })
          .where(eq(playlistImportJobs.id, importJobId));
      }
    }

    // Generate report
    const report = generateMatchReport(matchResults);

    // Extract unmatched songs for download option
    // report.unmatchedSongs is already { title, artist, album }[]
    const unmatchedSongs = report.unmatchedSongs;

    return successResponse({
      importJobId,
      playlistName,
      createdPlaylistId,
      matchReport: {
        summary: report.summary,
        byConfidence: report.byConfidence,
        unmatchedCount: report.unmatchedSongs.length,
        pendingReviewCount: report.pendingReviewSongs.length,
      },
      unmatchedSongs,
      parseWarnings: parseResult.parseWarnings,
    }, 201);
  },
  {
    service: 'playlists/import',
    operation: 'import',
    defaultCode: 'IMPORT_ERROR',
    defaultMessage: 'Failed to import playlist',
  }
);

// GET /api/playlists/import?importJobId=xxx - Get import job status and match results
const GET = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const url = new URL(request.url);
    const importJobId = url.searchParams.get('importJobId');

    if (!importJobId) {
      return errorResponse('VALIDATION_ERROR', 'Import job ID is required', { status: 400 });
    }

    const importJob = await db
      .select()
      .from(playlistImportJobs)
      .where(
        and(
          eq(playlistImportJobs.id, importJobId),
          eq(playlistImportJobs.userId, session.user.id)
        )
      )
      .limit(1)
      .then(rows => rows[0]);

    if (!importJob) {
      return errorResponse('NOT_FOUND', 'Import job not found', { status: 404 });
    }

    return successResponse({
      importJob: {
        id: importJob.id,
        playlistName: importJob.playlistName,
        playlistDescription: importJob.playlistDescription,
        format: importJob.format,
        targetPlatform: importJob.targetPlatform,
        status: importJob.status,
        totalSongs: importJob.totalSongs,
        processedSongs: importJob.processedSongs,
        matchedSongs: importJob.matchedSongs,
        unmatchedSongs: importJob.unmatchedSongs,
        pendingReviewSongs: importJob.pendingReviewSongs,
        createdPlaylistId: importJob.createdPlaylistId,
        matchResults: importJob.matchResults,
        createdAt: importJob.createdAt,
        completedAt: importJob.completedAt,
      },
    });
  },
  {
    service: 'playlists/import',
    operation: 'status',
    defaultCode: 'IMPORT_STATUS_ERROR',
    defaultMessage: 'Failed to get import status',
  }
);

// PUT /api/playlists/import - Confirm import with reviewed matches
const PUT = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const body = await request.json();
    const validatedData = ImportConfirmSchema.parse(body);

    // Get the import job
    const importJob = await db
      .select()
      .from(playlistImportJobs)
      .where(
        and(
          eq(playlistImportJobs.id, validatedData.importJobId),
          eq(playlistImportJobs.userId, session.user.id)
        )
      )
      .limit(1)
      .then(rows => rows[0]);

    if (!importJob) {
      return errorResponse('NOT_FOUND', 'Import job not found', { status: 404 });
    }

    // Get matched songs
    const matchedResults = validatedData.matchResults.filter(
      r => r.status === 'matched' && r.selectedMatch
    );

    // If no songs to import (all skipped), just update the job status and return success
    if (matchedResults.length === 0) {
      await db
        .update(playlistImportJobs)
        .set({
          status: 'completed',
          completedAt: new Date(),
        })
        .where(eq(playlistImportJobs.id, importJob.id));

      return successResponse({
        success: true,
        playlistId: importJob.createdPlaylistId,
        songsAdded: 0,
        message: 'All songs were skipped',
      });
    }

    // Check if playlist already exists
    if (importJob.createdPlaylistId) {
      // Add songs to existing playlist
      const existingSongs = await db
        .select()
        .from(playlistSongs)
        .where(eq(playlistSongs.playlistId, importJob.createdPlaylistId));

      const startPosition = existingSongs.length;

      const songsToAdd = matchedResults.map((result, index) => ({
        id: crypto.randomUUID(),
        playlistId: importJob.createdPlaylistId!,
        songId: result.selectedMatch!.platformId,
        songArtistTitle: `${result.originalSong.artist} - ${result.originalSong.title}`,
        position: startPosition + index,
        addedAt: new Date(),
      }));

      await db.insert(playlistSongs).values(songsToAdd);

      // Update playlist stats
      await db
        .update(userPlaylists)
        .set({
          songCount: startPosition + songsToAdd.length,
          updatedAt: new Date(),
        })
        .where(eq(userPlaylists.id, importJob.createdPlaylistId));

    } else {
      // Create new playlist
      const playlistName = importJob.playlistName || 'Imported Playlist';

      const newPlaylist = {
        id: crypto.randomUUID(),
        userId: session.user.id,
        name: playlistName,
        description: importJob.playlistDescription || null,
        songCount: matchedResults.length,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.insert(userPlaylists).values(newPlaylist);

      // Add songs
      const songsToAdd = matchedResults.map((result, index) => ({
        id: crypto.randomUUID(),
        playlistId: newPlaylist.id,
        songId: result.selectedMatch!.platformId,
        songArtistTitle: `${result.originalSong.artist} - ${result.originalSong.title}`,
        position: index,
        addedAt: new Date(),
      }));

      await db.insert(playlistSongs).values(songsToAdd);

      // Update import job
      await db
        .update(playlistImportJobs)
        .set({
          createdPlaylistId: newPlaylist.id,
          status: 'completed',
          completedAt: new Date(),
        })
        .where(eq(playlistImportJobs.id, importJob.id));
    }

    // Update match results
    await db
      .update(playlistImportJobs)
      .set({
        matchedSongs: matchedResults.length,
        status: 'completed',
        completedAt: new Date(),
      })
      .where(eq(playlistImportJobs.id, importJob.id));

    return successResponse({
      success: true,
      playlistId: importJob.createdPlaylistId,
      songsAdded: matchedResults.length,
    });
  },
  {
    service: 'playlists/import',
    operation: 'confirm',
    defaultCode: 'IMPORT_CONFIRM_ERROR',
    defaultMessage: 'Failed to confirm import',
  }
);

export const Route = createFileRoute("/api/playlists/import")({
  server: {
    handlers: {
      POST,
      GET,
      PUT,
    },
  },
});
