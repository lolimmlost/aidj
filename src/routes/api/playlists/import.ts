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
} from '../../../lib/services/playlist-export';
import {
  matchSong,
  generateMatchReport,
  type MatchOptions,
} from '../../../lib/services/song-matcher';
import { search as navidromeSearch } from '../../../lib/services/navidrome';
import type { SongMatchResult, PlaylistPlatform } from '../../../lib/db/schema/playlist-export.schema';

// Validation schemas
const ImportValidateSchema = z.object({
  content: z.string().min(1),
  format: z.enum(['m3u', 'xspf', 'json', 'csv']).optional(),
});

const ImportRequestSchema = z.object({
  content: z.string().min(1),
  format: z.enum(['m3u', 'xspf', 'json', 'csv']).optional(),
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
const _validateHandler = withAuthAndErrorHandling(
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

// Background matching function (runs after response is sent)
async function processMatchingInBackground(
  importJobId: string,
  userId: string,
  songs: ExportableSong[],
  targetPlatform: string,
  createPlaylist: boolean,
  playlistName: string,
  playlistDescription: string | undefined
) {
  console.log(`[Import] Starting background matching for ${songs.length} songs...`);

  try {
    const searcher = createNavidromeSearcher();
    const matchOptions: MatchOptions = {
      targetPlatforms: ['navidrome'],
      useFuzzyMatch: true,
      minConfidenceScore: 50,
      maxMatchesPerSong: 5,
    };

    // Match songs with progress updates
    const matchResults: SongMatchResult[] = [];
    let lastProgressUpdate = 0;

    for (let i = 0; i < songs.length; i++) {
      const song = songs[i];

      try {
        const result = await matchSong(song, [searcher], matchOptions);
        matchResults.push(result);
      } catch (error) {
        console.error(`Error matching song "${song.artist} - ${song.title}":`, error);
        matchResults.push({
          originalSong: {
            title: song.title || 'Unknown Title',
            artist: song.artist || 'Unknown Artist',
            album: song.album,
            duration: song.duration,
            isrc: song.isrc,
            platform: song.platform,
            platformId: song.platformId,
          },
          matches: [],
          selectedMatch: undefined,
          status: 'no_match',
        });
      }

      // Update progress every 10 songs or every 5 seconds
      const now = Date.now();
      if (i % 10 === 0 || now - lastProgressUpdate > 5000) {
        lastProgressUpdate = now;
        const matched = matchResults.filter(r => r.status === 'matched').length;
        const noMatch = matchResults.filter(r => r.status === 'no_match').length;

        await db
          .update(playlistImportJobs)
          .set({
            processedSongs: i + 1,
            matchedSongs: matched,
            unmatchedSongs: noMatch,
          })
          .where(eq(playlistImportJobs.id, importJobId));
      }

      // Small delay between songs
      if (i < songs.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const report = generateMatchReport(matchResults);

    console.log(`[Import] Matching complete: ${report.summary.matched} matched, ${report.summary.noMatch} unmatched, ${report.summary.pendingReview} pending review`);

    // Create playlist if requested
    let createdPlaylistId: string | null = null;

    if (createPlaylist) {
      const matchedSongs = matchResults.filter(r => r.status === 'matched' && r.selectedMatch);

      if (matchedSongs.length > 0) {
        const newPlaylist = {
          id: crypto.randomUUID(),
          userId,
          name: playlistName,
          description: playlistDescription || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await db.insert(userPlaylists).values(newPlaylist);
        createdPlaylistId = newPlaylist.id;

        // Add matched songs (deduplicated)
        const seenSongIds = new Set<string>();
        const songsToAdd: Array<{
          id: string;
          playlistId: string;
          songId: string;
          songArtistTitle: string;
          position: number;
          addedAt: Date;
        }> = [];

        for (const result of matchedSongs) {
          const songId = result.selectedMatch!.platformId;
          if (!seenSongIds.has(songId)) {
            seenSongIds.add(songId);
            songsToAdd.push({
              id: crypto.randomUUID(),
              playlistId: newPlaylist.id,
              songId,
              songArtistTitle: `${result.originalSong.artist} - ${result.originalSong.title}`,
              position: songsToAdd.length,
              addedAt: new Date(),
            });
          }
        }

        if (songsToAdd.length > 0) {
          await db.insert(playlistSongs).values(songsToAdd);
        }

        await db
          .update(userPlaylists)
          .set({ songCount: songsToAdd.length, updatedAt: new Date() })
          .where(eq(userPlaylists.id, newPlaylist.id));

        console.log(`[Import] Created playlist "${playlistName}" with ${songsToAdd.length} songs`);
      }
    }

    // Update import job with final results
    await db
      .update(playlistImportJobs)
      .set({
        processedSongs: songs.length,
        matchedSongs: report.summary.matched,
        unmatchedSongs: report.summary.noMatch,
        pendingReviewSongs: report.summary.pendingReview,
        matchResults: matchResults,
        createdPlaylistId,
        status: 'completed',
        completedAt: new Date(),
      })
      .where(eq(playlistImportJobs.id, importJobId));

    console.log(`[Import] Job ${importJobId} completed successfully`);

  } catch (error) {
    console.error(`[Import] Background matching failed:`, error);

    // Mark job as failed
    await db
      .update(playlistImportJobs)
      .set({
        status: 'failed',
        completedAt: new Date(),
      })
      .where(eq(playlistImportJobs.id, importJobId));
  }
}

// Type for exportable songs from playlist
type ExportableSong = ReturnType<typeof parsePlaylist>['playlist']['songs'][0];

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

    // Start matching in background (don't await - return immediately)
    if (validatedData.autoMatch && validatedData.targetPlatform === 'navidrome') {
      // Use setImmediate to run after response is sent
      setImmediate(() => {
        processMatchingInBackground(
          importJobId,
          session.user.id,
          playlist.songs,
          validatedData.targetPlatform,
          validatedData.createPlaylist,
          playlistName,
          playlist.description
        );
      });
    }

    // Return immediately with job info - client will poll for status
    return successResponse({
      importJobId,
      playlistName,
      status: 'processing',
      totalSongs: playlist.songs.length,
      message: 'Import started. Matching songs in background...',
      parseWarnings: parseResult.parseWarnings,
    }, 202); // 202 Accepted - processing has started
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

    // Helper to deduplicate songs by songId
    const deduplicateSongs = (
      results: typeof matchedResults,
      playlistId: string,
      startPosition: number,
      existingSongIds?: Set<string>
    ) => {
      const seenSongIds = existingSongIds || new Set<string>();
      const songsToAdd: Array<{
        id: string;
        playlistId: string;
        songId: string;
        songArtistTitle: string;
        position: number;
        addedAt: Date;
      }> = [];

      for (const result of results) {
        const songId = result.selectedMatch!.platformId;
        if (!seenSongIds.has(songId)) {
          seenSongIds.add(songId);
          songsToAdd.push({
            id: crypto.randomUUID(),
            playlistId,
            songId,
            songArtistTitle: `${result.originalSong.artist} - ${result.originalSong.title}`,
            position: startPosition + songsToAdd.length,
            addedAt: new Date(),
          });
        }
      }

      return songsToAdd;
    };

    let songsAdded = 0;

    // Check if playlist already exists
    if (importJob.createdPlaylistId) {
      // Add songs to existing playlist
      const existingSongs = await db
        .select()
        .from(playlistSongs)
        .where(eq(playlistSongs.playlistId, importJob.createdPlaylistId));

      const startPosition = existingSongs.length;
      const existingSongIds = new Set(existingSongs.map(s => s.songId));

      const songsToAdd = deduplicateSongs(matchedResults, importJob.createdPlaylistId, startPosition, existingSongIds);

      if (songsToAdd.length > 0) {
        await db.insert(playlistSongs).values(songsToAdd);
      }
      songsAdded = songsToAdd.length;

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

      // Add songs (deduplicated)
      const songsToAdd = deduplicateSongs(matchedResults, newPlaylist.id, 0);

      if (songsToAdd.length > 0) {
        await db.insert(playlistSongs).values(songsToAdd);
      }
      songsAdded = songsToAdd.length;

      // Update playlist song count if duplicates were removed
      if (songsToAdd.length !== matchedResults.length) {
        await db
          .update(userPlaylists)
          .set({ songCount: songsToAdd.length })
          .where(eq(userPlaylists.id, newPlaylist.id));
      }

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
      songsAdded,
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
