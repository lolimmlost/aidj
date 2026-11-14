/**
 * Lidarr downloader helper — shared by the /api/downloads/queue route and scripts.
 *
 * For each song: find the artist (add + monitor if missing), find the album that
 * contains the song, monitor ONLY that album, and trigger an AlbumSearch.
 * Lidarr here has no indexers; Soularr polls wanted/missing, which excludes albums
 * of unmonitored artists — so the artist must be monitored too, not just the album.
 * Lidarr cannot monitor a single track, so the song is only used to pick the album.
 */

// Helper function to queue songs to Lidarr
// This searches for the specific album containing the song, not the entire artist discography
export async function queueToLidarr(songs: { title: string; artist: string; album?: string }[]) {
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

  // Unmonitor any albums that have already finished downloading
  await unmonitorCompletedAlbums(lidarrUrl, lidarrApiKey);

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

      // Step 1: Extract primary artist (handle collaborations like "Artist1, Artist2" or "Artist1;Artist2")
      const primaryArtist = song.artist.split(/[,;]/)[0].trim();
      if (primaryArtist !== song.artist) {
        console.log(`[Lidarr Queue] Primary artist: ${primaryArtist} (from "${song.artist}")`);
      }

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

      // Find best artist match using fuzzy string similarity
      const scoredArtists = artists.map((artist: { artistName: string }) => {
        const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
        const a = norm(artist.artistName);
        const b = norm(primaryArtist);
        if (a === b) return { artist, score: 100 };
        // Levenshtein-based similarity
        const maxLen = Math.max(a.length, b.length);
        if (maxLen === 0) return { artist, score: 0 };
        const matrix: number[][] = [];
        for (let i = 0; i <= b.length; i++) { matrix[i] = [i]; }
        for (let j = 0; j <= a.length; j++) { matrix[0][j] = j; }
        for (let i = 1; i <= b.length; i++) {
          for (let j = 1; j <= a.length; j++) {
            matrix[i][j] = b[i-1] === a[j-1]
              ? matrix[i-1][j-1]
              : Math.min(matrix[i-1][j-1]+1, matrix[i][j-1]+1, matrix[i-1][j]+1);
          }
        }
        return { artist, score: Math.round((1 - matrix[b.length][a.length] / maxLen) * 100) };
      });
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
          // Also force monitorNewItems to 'none' so RefreshArtist doesn't
          // auto-monitor all discovered albums
          if (!existingArtist.monitored || existingArtist.monitorNewItems !== 'none') {
            console.log(`[Lidarr Queue] Updating artist ${existingArtist.artistName}: monitored=true, monitorNewItems=none`);
            await fetch(`${lidarrUrl}/api/v1/artist/${libraryArtistId}`, {
              method: 'PUT',
              headers: {
                'X-Api-Key': lidarrApiKey,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                ...existingArtist,
                monitored: true,
                monitorNewItems: 'none',
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

          // Lidarr can override monitored=true when addOptions.monitor='none'
          // Explicitly ensure artist is monitored after adding
          if (libraryArtistId && !addedArtist.monitored) {
            console.log(`[Lidarr Queue] Artist added unmonitored, explicitly enabling monitoring...`);
            await fetch(`${lidarrUrl}/api/v1/artist/${libraryArtistId}`, {
              method: 'PUT',
              headers: {
                'X-Api-Key': lidarrApiKey,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                ...addedArtist,
                monitored: true,
              }),
            });
          }
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

        // Unmonitor all other albums to prevent full discography downloads
        await unmonitorOtherAlbums(lidarrUrl, lidarrApiKey, libraryArtistId!, targetLibraryAlbum.id);

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

            // Unmonitor all other albums to prevent full discography downloads
            await unmonitorOtherAlbums(lidarrUrl, lidarrApiKey, libraryArtistId!, foundAlbum.id);

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

// Unmonitor albums that are fully downloaded (100% tracks) so Lidarr stops searching
async function unmonitorCompletedAlbums(lidarrUrl: string, lidarrApiKey: string) {
  try {
    const response = await fetch(
      `${lidarrUrl}/api/v1/album`,
      { headers: { 'X-Api-Key': lidarrApiKey } }
    );
    if (!response.ok) return;

    const albums = await response.json();
    const completed = albums.filter(
      (a: { monitored: boolean; statistics?: { percentOfTracks: number } }) =>
        a.monitored && a.statistics && a.statistics.percentOfTracks >= 100
    );

    for (const album of completed) {
      await fetch(`${lidarrUrl}/api/v1/album/${album.id}`, {
        method: 'PUT',
        headers: { 'X-Api-Key': lidarrApiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...album, monitored: false }),
      });
    }

    if (completed.length > 0) {
      console.log(`[Lidarr Queue] Unmonitored ${completed.length} completed albums`);
    }
  } catch (error) {
    console.error('[Lidarr Queue] Error unmonitoring completed albums:', error);
  }
}

// Unmonitor all albums for an artist except the target album
async function unmonitorOtherAlbums(
  lidarrUrl: string,
  lidarrApiKey: string,
  artistId: number,
  targetAlbumId: number
) {
  try {
    const response = await fetch(
      `${lidarrUrl}/api/v1/album?artistId=${artistId}`,
      { headers: { 'X-Api-Key': lidarrApiKey } }
    );
    if (!response.ok) return;

    const albums = await response.json();
    const toUnmonitor = albums.filter(
      (a: { id: number; monitored: boolean }) => a.id !== targetAlbumId && a.monitored
    );

    for (const album of toUnmonitor) {
      await fetch(`${lidarrUrl}/api/v1/album/${album.id}`, {
        method: 'PUT',
        headers: { 'X-Api-Key': lidarrApiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...album, monitored: false }),
      });
    }

    console.log(`[Lidarr Queue] Unmonitor check: ${albums.length} albums, ${toUnmonitor.length} unmonitored for artist ${artistId}`);
  } catch (error) {
    console.error('[Lidarr Queue] Error unmonitoring other albums:', error);
  }
}

// Helper function to find the best matching album for a song
function findBestAlbumMatch(
  albums: Array<{
    id: number;
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
  const primaryArtist = song.artist.split(/[,;]/)[0].trim().toLowerCase();

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
