import { createFileRoute } from "@tanstack/react-router";
import { z } from 'zod';
import { db } from '../../../lib/db';
import { playlistDownloadJobs } from '../../../lib/db/schema/playlist-export.schema';
import { eq } from 'drizzle-orm';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
} from '../../../lib/utils/api-response';

// Song schema for download
const SongSchema = z.object({
  title: z.string(),
  artist: z.string(),
  album: z.string().optional(),
});

// Request schema
const QueueDownloadSchema = z.object({
  importJobId: z.string().uuid().optional(),
  service: z.enum(['lidarr', 'metube', 'both']),
  songs: z.array(SongSchema).min(1),
});

// Background download processing function
async function processDownloadsInBackground(
  downloadJobId: string,
  service: 'lidarr' | 'metube' | 'both',
  songs: { title: string; artist: string; album?: string }[]
) {
  console.log(`[Download] Starting background download for ${songs.length} songs via ${service}...`);

  const results = {
    queued: 0,
    failed: 0,
    errors: [] as string[],
    lidarrQueued: 0,
    metubeQueued: 0,
    pendingOrganization: [] as { title: string; artist: string }[],
  };

  try {
    if (service === 'lidarr') {
      const lidarrResult = await queueToLidarrWithProgress(songs, downloadJobId);
      results.queued += lidarrResult.queued;
      results.failed += lidarrResult.failed;
      results.lidarrQueued = lidarrResult.queued;
      results.errors.push(...lidarrResult.errors);
    } else if (service === 'metube') {
      const metubeResult = await queueToMeTubeWithProgress(songs, downloadJobId);
      results.queued += metubeResult.queued;
      results.failed += metubeResult.failed;
      results.metubeQueued = metubeResult.queued;
      results.pendingOrganization = metubeResult.queuedSongs || [];
      results.errors.push(...metubeResult.errors);
    } else if (service === 'both') {
      // Try Lidarr first
      const lidarrResult = await queueToLidarrWithProgress(songs, downloadJobId);
      results.lidarrQueued = lidarrResult.queued;
      results.queued += lidarrResult.queued;

      const failedSongs = lidarrResult.failedSongs || [];

      if (failedSongs.length > 0) {
        // Try MeTube for Lidarr failures
        const metubeResult = await queueToMeTubeWithProgress(failedSongs, downloadJobId, lidarrResult.queued);
        results.metubeQueued = metubeResult.queued;
        results.queued += metubeResult.queued;
        results.failed = metubeResult.failed;
        results.pendingOrganization = metubeResult.queuedSongs || [];
        results.errors.push(...metubeResult.errors);
      }

      if (lidarrResult.queued > 0) {
        results.errors.unshift(`Lidarr: ${lidarrResult.queued} songs queued for download`);
      }
      if (failedSongs.length > 0) {
        results.errors.unshift(`${failedSongs.length} songs not found in Lidarr, trying MeTube...`);
      }
    }

    // Final update
    await db
      .update(playlistDownloadJobs)
      .set({
        status: results.queued > 0 ? 'completed' : 'failed',
        completedItems: results.queued,
        failedItems: results.failed,
        errorMessage: results.errors.length > 0 ? results.errors.join('; ') : null,
        pendingOrganization: results.pendingOrganization.length > 0 ? results.pendingOrganization : null,
      })
      .where(eq(playlistDownloadJobs.id, downloadJobId));

    console.log(`[Download] Job ${downloadJobId} completed: ${results.queued} queued, ${results.failed} failed`);

  } catch (error) {
    console.error(`[Download] Background processing failed:`, error);
    await db
      .update(playlistDownloadJobs)
      .set({
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      })
      .where(eq(playlistDownloadJobs.id, downloadJobId));
  }
}

// POST /api/downloads/queue - Queue songs for download (async)
const POST = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const body = await request.json();
    const validatedData = QueueDownloadSchema.parse(body);

    const { importJobId, service, songs } = validatedData;

    // Create download job record
    const downloadJobId = crypto.randomUUID();
    const downloadJob = {
      id: downloadJobId,
      userId: session.user.id,
      importJobId: importJobId || null,
      service: service,
      status: 'processing' as const,
      totalItems: songs.length,
      completedItems: 0,
      failedItems: 0,
      downloadQueue: songs,
      pendingOrganization: null,
      startedAt: new Date(),
      createdAt: new Date(),
    };

    await db.insert(playlistDownloadJobs).values(downloadJob);

    // Start background processing
    setImmediate(() => {
      processDownloadsInBackground(downloadJobId, service, songs);
    });

    // Return immediately
    return successResponse({
      downloadJobId,
      service,
      totalSongs: songs.length,
      status: 'processing',
      message: `Queuing ${songs.length} songs for download...`,
    }, 202);
  },
  {
    service: 'downloads/queue',
    operation: 'queue',
    defaultCode: 'QUEUE_ERROR',
    defaultMessage: 'Failed to queue downloads',
  }
);

// Wrapper with progress updates for background processing
async function queueToLidarrWithProgress(
  songs: { title: string; artist: string; album?: string }[],
  downloadJobId: string
) {
  const result = await queueToLidarr(songs);

  // Update progress in database
  await db
    .update(playlistDownloadJobs)
    .set({
      completedItems: result.queued,
      failedItems: result.failed,
    })
    .where(eq(playlistDownloadJobs.id, downloadJobId));

  return result;
}

// Wrapper with progress updates for background processing
async function queueToMeTubeWithProgress(
  songs: { title: string; artist: string; album?: string }[],
  downloadJobId: string,
  previouslyQueued: number = 0
) {
  const result = await queueToMeTube(songs);

  // Update progress in database
  await db
    .update(playlistDownloadJobs)
    .set({
      completedItems: previouslyQueued + result.queued,
      failedItems: result.failed,
    })
    .where(eq(playlistDownloadJobs.id, downloadJobId));

  return result;
}

// Helper function to queue songs to Lidarr
// This searches for the specific album containing the song, not the entire artist discography
async function queueToLidarr(songs: { title: string; artist: string; album?: string }[]) {
  const result = {
    queued: 0,
    failed: 0,
    errors: [] as string[],
    failedSongs: [] as { title: string; artist: string; album?: string }[],
  };

  // Get Lidarr configuration from environment
  const lidarrUrl = process.env.LIDARR_URL;
  const lidarrApiKey = process.env.LIDARR_API_KEY;

  if (!lidarrUrl || !lidarrApiKey) {
    result.errors.push('Lidarr is not configured. Please set LIDARR_URL and LIDARR_API_KEY in your environment.');
    result.failed = songs.length;
    result.failedSongs = [...songs]; // All songs failed
    return result;
  }

  // Get root folder, quality profile, and metadata profile once
  let rootFolder = '/music';
  let qualityProfileId = 1;
  let metadataProfileId = 1;

  try {
    const [rootFolderResponse, qualityProfileResponse, metadataProfileResponse] = await Promise.all([
      fetch(`${lidarrUrl}/api/v1/rootfolder`, { headers: { 'X-Api-Key': lidarrApiKey } }),
      fetch(`${lidarrUrl}/api/v1/qualityprofile`, { headers: { 'X-Api-Key': lidarrApiKey } }),
      fetch(`${lidarrUrl}/api/v1/metadataprofile`, { headers: { 'X-Api-Key': lidarrApiKey } }),
    ]);

    if (rootFolderResponse.ok) {
      const rootFolders = await rootFolderResponse.json();
      rootFolder = rootFolders[0]?.path || '/music';
    }
    if (qualityProfileResponse.ok) {
      const qualityProfiles = await qualityProfileResponse.json();
      qualityProfileId = qualityProfiles[0]?.id || 1;
    }
    if (metadataProfileResponse.ok) {
      const metadataProfiles = await metadataProfileResponse.json();
      metadataProfileId = metadataProfiles[0]?.id || 1;
    }
  } catch {
    // Continue with defaults
  }

  for (const song of songs) {
    try {
      console.log(`[Lidarr Queue] Processing: ${song.artist} - ${song.title}${song.album ? ` (Album: ${song.album})` : ''}`);

      // Step 1: Extract primary artist (handle collaborations like "Artist1, Artist2")
      // Take the first artist from comma-separated list
      const primaryArtist = song.artist.split(',')[0].trim();
      console.log(`[Lidarr Queue] Primary artist: ${primaryArtist}`);

      // Search for the artist using artist lookup
      const artistSearchQuery = encodeURIComponent(primaryArtist);

      const artistSearchResponse = await fetch(
        `${lidarrUrl}/api/v1/artist/lookup?term=${artistSearchQuery}`,
        {
          headers: { 'X-Api-Key': lidarrApiKey },
        }
      );

      if (!artistSearchResponse.ok) {
        throw new Error(`Lidarr artist search failed: ${artistSearchResponse.statusText}`);
      }

      const artists = await artistSearchResponse.json();
      console.log(`[Lidarr Queue] Found ${artists.length} artist matches for "${primaryArtist}"`);

      if (artists.length === 0) {
        result.errors.push(`Artist not found: ${song.artist}`);
        result.failed++;
        result.failedSongs.push(song);
        continue;
      }

      // Find best artist match (don't just take first result)
      // Score artists by how well they match the primary artist name
      const scoredArtists = artists.map((artist: { artistName: string }) => {
        const artistNameLower = artist.artistName.toLowerCase();
        const primaryLower = primaryArtist.toLowerCase();

        // Exact match gets highest score
        if (artistNameLower === primaryLower) return { artist, score: 100 };

        // Starts with gets high score
        if (artistNameLower.startsWith(primaryLower)) return { artist, score: 90 };

        // Contains as whole word gets medium score
        const regex = new RegExp(`\\b${primaryLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (regex.test(artistNameLower)) return { artist, score: 70 };

        // Contains anywhere gets low score
        if (artistNameLower.includes(primaryLower)) return { artist, score: 50 };

        // Doesn't match - very low score
        return { artist, score: 0 };
      });

      // Sort by score descending
      scoredArtists.sort((a: { score: number }, b: { score: number }) => b.score - a.score);

      // Log top 3 matches for debugging
      console.log(`[Lidarr Queue] Top artist matches for "${primaryArtist}":`);
      scoredArtists.slice(0, 3).forEach((s: { artist: { artistName: string }, score: number }, i: number) => {
        console.log(`  ${i + 1}. "${s.artist.artistName}" (score: ${s.score})`);
      });

      const targetArtist = scoredArtists[0].artist;
      console.log(`[Lidarr Queue] Using artist: ${targetArtist.artistName} (ID: ${targetArtist.foreignArtistId})`);

      // Step 2: We'll skip album lookup from MusicBrainz since it often returns 0 results
      // Instead, we'll add the artist to the library and then search their albums locally

      // Step 3: Check if the artist is already in the library
      const artistId = targetArtist.foreignArtistId;
      let libraryArtistId: number | null = null;

      console.log(`[Lidarr Queue] Checking if artist ${targetArtist.artistName} is in library...`);
      const libraryArtistsResponse = await fetch(
        `${lidarrUrl}/api/v1/artist`,
        {
          headers: { 'X-Api-Key': lidarrApiKey },
        }
      );

      if (libraryArtistsResponse.ok) {
        const libraryArtists = await libraryArtistsResponse.json();
        const existingArtist = libraryArtists.find(
          (a: { foreignArtistId: string }) => a.foreignArtistId === artistId
        );
        if (existingArtist) {
          libraryArtistId = existingArtist.id;
          console.log(`[Lidarr Queue] Artist already in library (ID: ${libraryArtistId})`);

          // Ensure artist is monitored (required for Slskd to pick it up)
          if (!existingArtist.monitored) {
            console.log(`[Lidarr Queue] Enabling monitoring for artist ${existingArtist.artistName}`);
            await fetch(`${lidarrUrl}/api/v1/artist/${libraryArtistId}`, {
              method: 'PUT',
              headers: {
                'X-Api-Key': lidarrApiKey,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                ...existingArtist,
                monitored: true,
              }),
            });
          }
        }
      }

      // Step 4: If artist not in library, add them with monitor: 'none'
      if (!libraryArtistId) {
        console.log(`[Lidarr Queue] Adding artist ${targetArtist.artistName} to library...`);
        const addArtistResponse = await fetch(`${lidarrUrl}/api/v1/artist`, {
          method: 'POST',
          headers: {
            'X-Api-Key': lidarrApiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...targetArtist,
            rootFolderPath: rootFolder,
            qualityProfileId,
            metadataProfileId,
            monitored: true,
            monitorNewItems: 'none', // Don't auto-monitor new albums
            addOptions: {
              monitor: 'none', // Don't monitor any albums by default
              searchForMissingAlbums: false, // Don't search for all albums
            },
          }),
        });

        if (addArtistResponse.ok) {
          const addedArtist = await addArtistResponse.json();
          libraryArtistId = addedArtist.id;
        } else {
          // Artist might already exist (race condition), try to get them
          const retryResponse = await fetch(`${lidarrUrl}/api/v1/artist`, {
            headers: { 'X-Api-Key': lidarrApiKey },
          });
          if (retryResponse.ok) {
            const allArtists = await retryResponse.json();
            const found = allArtists.find(
              (a: { foreignArtistId: string }) => a.foreignArtistId === artistId
            );
            if (found) {
              libraryArtistId = found.id;
            }
          }
        }
      }

      if (!libraryArtistId) {
        result.errors.push(`Failed to add artist for: ${song.artist} - ${song.title}`);
        result.failed++;
        result.failedSongs.push(song);
        continue;
      }

      // Step 5: Get all albums for this artist and find the best match
      console.log(`[Lidarr Queue] Getting albums for artist ID ${libraryArtistId}...`);
      const artistAlbumsResponse = await fetch(
        `${lidarrUrl}/api/v1/album?artistId=${libraryArtistId}`,
        {
          headers: { 'X-Api-Key': lidarrApiKey },
        }
      );

      let targetLibraryAlbum = null;

      if (artistAlbumsResponse.ok) {
        const artistAlbums = await artistAlbumsResponse.json();
        console.log(`[Lidarr Queue] Artist has ${artistAlbums.length} albums in library`);

        // Find the best matching album using our scoring algorithm
        targetLibraryAlbum = findBestAlbumMatch(artistAlbums, song);

        if (targetLibraryAlbum) {
          console.log(`[Lidarr Queue] Found matching album in library: "${targetLibraryAlbum.title}"`);
        } else {
          console.log(`[Lidarr Queue] No albums in library yet, will refresh artist to get them`);
        }
      }

      if (targetLibraryAlbum) {
        // Album exists, ensure it's monitored (required for Slskd/Soularr to pick it up)
        console.log(`[Lidarr Queue] Setting album "${targetLibraryAlbum.title}" as monitored...`);
        await fetch(`${lidarrUrl}/api/v1/album/${targetLibraryAlbum.id}`, {
          method: 'PUT',
          headers: {
            'X-Api-Key': lidarrApiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...targetLibraryAlbum,
            monitored: true,
          }),
        });

        // Trigger album search
        await fetch(`${lidarrUrl}/api/v1/command`, {
          method: 'POST',
          headers: {
            'X-Api-Key': lidarrApiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: 'AlbumSearch',
            albumIds: [targetLibraryAlbum.id],
          }),
        });

        console.log(`[Lidarr Queue] ✅ Successfully queued: ${song.artist} - ${song.title} (Album: ${targetLibraryAlbum.title})`);
        result.queued++;
      } else {
        // Album not in library yet - refresh the artist to get all their albums from MusicBrainz
        console.log(`[Lidarr Queue] Refreshing artist to fetch album metadata...`);
        await fetch(`${lidarrUrl}/api/v1/command`, {
          method: 'POST',
          headers: {
            'X-Api-Key': lidarrApiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: 'RefreshArtist',
            artistId: libraryArtistId,
          }),
        });

        // Wait for refresh to complete (artist metadata fetch from MusicBrainz)
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Get updated albums
        const updatedAlbumsResponse = await fetch(
          `${lidarrUrl}/api/v1/album?artistId=${libraryArtistId}`,
          {
            headers: { 'X-Api-Key': lidarrApiKey },
          }
        );

        if (updatedAlbumsResponse.ok) {
          const updatedAlbums = await updatedAlbumsResponse.json();
          console.log(`[Lidarr Queue] After refresh, artist now has ${updatedAlbums.length} albums`);

          // Find the best matching album using our scoring algorithm
          const foundAlbum = findBestAlbumMatch(updatedAlbums, song);

          if (foundAlbum) {
            console.log(`[Lidarr Queue] Found matching album after refresh: "${foundAlbum.title}"`);

            // Monitor this specific album (required for Slskd/Soularr to pick it up)
            console.log(`[Lidarr Queue] Setting album "${foundAlbum.title}" as monitored...`);
            await fetch(`${lidarrUrl}/api/v1/album/${foundAlbum.id}`, {
              method: 'PUT',
              headers: {
                'X-Api-Key': lidarrApiKey,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                ...foundAlbum,
                monitored: true,
              }),
            });

            // Trigger album search
            await fetch(`${lidarrUrl}/api/v1/command`, {
              method: 'POST',
              headers: {
                'X-Api-Key': lidarrApiKey,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                name: 'AlbumSearch',
                albumIds: [foundAlbum.id],
              }),
            });

            console.log(`[Lidarr Queue] ✅ Successfully queued after refresh: ${song.artist} - ${song.title} (Album: ${foundAlbum.title})`);
            result.queued++;
          } else {
            result.errors.push(`Album "${song.album || song.title}" not found in artist's discography: ${song.artist} - ${song.title}`);
            result.failed++;
            result.failedSongs.push(song);
          }
        } else {
          result.errors.push(`Failed to get albums after refresh: ${song.artist} - ${song.title}`);
          result.failed++;
          result.failedSongs.push(song);
        }
      }
    } catch (error) {
      result.errors.push(`Error processing ${song.artist} - ${song.title}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      result.failed++;
      result.failedSongs.push(song);
    }
  }

  return result;
}

// Helper function to find the best matching album for a song
function findBestAlbumMatch(
  albums: Array<{
    title: string;
    foreignAlbumId: string;
    artist?: { foreignArtistId: string; artistName: string };
    releaseDate?: string;
  }>,
  song: { title: string; artist: string; album?: string }
): typeof albums[0] | null {
  if (albums.length === 0) return null;
  if (albums.length === 1) return albums[0];

  const songTitle = song.title.toLowerCase();
  const songAlbum = song.album?.toLowerCase();
  // Extract primary artist from collaborations for better matching
  const primaryArtist = song.artist.split(',')[0].trim().toLowerCase();

  // Score each album
  const scored = albums.map(album => {
    let score = 0;
    const albumTitle = album.title.toLowerCase();
    const artistName = album.artist?.artistName?.toLowerCase() || '';

    // If song provides an album name, prioritize album name matching
    if (songAlbum) {
      // Exact album name match (highest priority)
      if (albumTitle === songAlbum) {
        score += 100;
      }
      // Album name starts with song album
      else if (albumTitle.startsWith(songAlbum)) {
        score += 80;
      }
      // Song album starts with album name (handles "Slime & B" vs "Slime & B [Deluxe]")
      else if (songAlbum.startsWith(albumTitle)) {
        score += 75;
      }
      // Partial album name match
      else if (albumTitle.includes(songAlbum)) {
        score += 50;
      }
      // Reverse: album name contains song album name
      else if (songAlbum.includes(albumTitle)) {
        score += 40;
      }
    }
    // No album name provided - check if album title matches song title (for singles)
    else {
      // Exact match with song title (likely a single)
      if (albumTitle === songTitle) {
        score += 80;
      }
      // Album title contains song title (might be a single with extra text)
      else if (albumTitle.includes(songTitle)) {
        score += 30;
      }
      // Song title contains album title
      else if (songTitle.includes(albumTitle)) {
        score += 25;
      }
    }

    // Artist name match (use primary artist for collaborations)
    if (artistName === primaryArtist) {
      score += 20;
    } else if (artistName.includes(primaryArtist) || primaryArtist.includes(artistName)) {
      score += 10;
    }

    // Prefer non-compilation albums (usually shorter titles)
    if (albumTitle.length < 50 && !albumTitle.includes('compilation')) {
      score += 5;
    }

    // Penalize "greatest hits" and compilations
    if (albumTitle.includes('greatest hits') || albumTitle.includes('compilation') || albumTitle.includes('best of')) {
      score -= 20;
    }

    return { album, score };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Log the top 3 matches for debugging
  console.log(`[Lidarr Queue] Top album matches for "${song.album || song.title}":`);
  scored.slice(0, 3).forEach((s, i) => {
    console.log(`  ${i + 1}. "${s.album.title}" (score: ${s.score})`);
  });

  const bestMatch = scored[0];

  // If the best match has a very low score (< 20), it's probably a bad match
  // Only return it if we have high confidence, otherwise return null to trigger a refresh
  if (bestMatch && bestMatch.score >= 20) {
    return bestMatch.album;
  }

  // Low confidence match - prefer to return null and let refresh happen
  // This helps avoid matching singles to wrong albums
  if (bestMatch && bestMatch.score < 20) {
    console.log(`[Lidarr Queue] Low confidence match (score: ${bestMatch.score}), preferring artist refresh`);
    return null;
  }

  return albums[0]; // Fallback
}

// Helper function to queue songs to MeTube
async function queueToMeTube(songs: { title: string; artist: string; album?: string }[]) {
  const result = {
    queued: 0,
    failed: 0,
    errors: [] as string[],
    queuedSongs: [] as { title: string; artist: string }[],
  };

  // Get MeTube configuration from environment
  const metubeUrl = process.env.METUBE_URL;

  if (!metubeUrl) {
    result.errors.push('MeTube is not configured. Please set METUBE_URL in your environment.');
    result.failed = songs.length;
    return result;
  }

  for (const song of songs) {
    try {
      // Search YouTube for the song
      const searchQuery = `${song.artist} ${song.title} audio`;
      const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;

      // For now, we'll construct a YouTube Music search URL
      // In a real implementation, you'd use the YouTube Data API to search
      const _ytMusicUrl = `https://music.youtube.com/search?q=${encodeURIComponent(searchQuery)}`;

      // Queue to MeTube with a search-based URL
      // MeTube can accept search terms if configured properly
      const metubeResponse = await fetch(`${metubeUrl}/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: `ytsearch:${song.artist} - ${song.title}`,
          quality: 'best',
          format: 'mp3',
        }),
      });

      if (metubeResponse.ok) {
        result.queued++;
        result.queuedSongs.push({ title: song.title, artist: song.artist });
      } else {
        // Try alternative format
        const altResponse = await fetch(`${metubeUrl}/add`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: youtubeSearchUrl,
            quality: 'best',
            format: 'mp3',
          }),
        });

        if (altResponse.ok) {
          result.queued++;
          result.queuedSongs.push({ title: song.title, artist: song.artist });
        } else {
          result.errors.push(`Failed to queue ${song.artist} - ${song.title} to MeTube`);
          result.failed++;
        }
      }
    } catch (error) {
      result.errors.push(`Error queuing ${song.artist} - ${song.title}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      result.failed++;
    }
  }

  return result;
}

// GET /api/downloads/queue - Get download job status
const GET = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const url = new URL(request.url);
    const downloadJobId = url.searchParams.get('downloadJobId');

    if (downloadJobId) {
      // Get specific download job
      const job = await db.query.playlistDownloadJobs.findFirst({
        where: eq(playlistDownloadJobs.id, downloadJobId),
      });

      if (!job) {
        return errorResponse('NOT_FOUND', 'Download job not found', { status: 404 });
      }

      if (job.userId !== session.user.id) {
        return errorResponse('FORBIDDEN', 'Access denied', { status: 403 });
      }

      return successResponse({ downloadJob: job });
    }

    // Get all download jobs for user
    const jobs = await db.query.playlistDownloadJobs.findMany({
      where: eq(playlistDownloadJobs.userId, session.user.id),
      orderBy: (jobs, { desc }) => [desc(jobs.createdAt)],
      limit: 20,
    });

    return successResponse({ downloadJobs: jobs });
  },
  {
    service: 'downloads/queue',
    operation: 'status',
    defaultCode: 'STATUS_ERROR',
    defaultMessage: 'Failed to get download status',
  }
);

export const Route = createFileRoute("/api/downloads/queue")({
  server: {
    handlers: {
      POST,
      GET,
    },
  },
});
