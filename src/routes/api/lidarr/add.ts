import { createFileRoute } from "@tanstack/react-router";
import { ServiceError } from '../../../lib/utils';
import {
  searchArtistsFull,
  addArtistToQueue,
  isArtistAdded,
  findArtistByName,
  getArtistAlbums,
  monitorAlbum,
  searchForAlbum,
  searchAlbumByTitle,
  type LidarrAlbum,
} from '../../../lib/services/lidarr';
import { search as searchNavidrome } from '../../../lib/services/navidrome';
import { getLastFmClient } from '../../../lib/services/lastfm';
import { getConfigAsync } from '../../../lib/config/config';

/**
 * Get album info from Last.fm for a specific track
 * Returns album name and MusicBrainz ID for better Lidarr matching
 */
async function getAlbumInfoFromLastFm(artistName: string, songTitle: string): Promise<{
  albumName?: string;
  albumMbid?: string;
} | null> {
  try {
    const config = await getConfigAsync();
    if (!config.lastfmApiKey) {
      console.log('[Lidarr Add] No Last.fm API key, skipping album lookup');
      return null;
    }

    const lastFm = getLastFmClient(config.lastfmApiKey);
    if (!lastFm) {
      return null;
    }

    const trackInfo = await lastFm.getTrackInfo(artistName, songTitle);
    if (trackInfo?.album) {
      console.log(`📀 [Last.fm] Found album for "${songTitle}": "${trackInfo.album}" (mbid: ${trackInfo.albumMbid || 'none'})`);
      return {
        albumName: trackInfo.album,
        albumMbid: trackInfo.albumMbid,
      };
    }

    return null;
  } catch (error) {
    console.warn('[Lidarr Add] Failed to get album info from Last.fm:', error);
    return null;
  }
}

/**
 * Find album in Lidarr by name (case-insensitive)
 */
function findAlbumByName(albums: LidarrAlbum[], albumName: string): LidarrAlbum | undefined {
  const nameLower = albumName.toLowerCase();
  return albums.find(a => a.title.toLowerCase() === nameLower);
}

/**
 * Check if specific song is already available in Navidrome
 * We search for the full "Artist - Title" to find the exact song
 */
async function checkSongAvailability(artistName: string, songTitle: string): Promise<{ inNavidrome: boolean; songId?: string }> {
  try {
    // Search for the specific song title by the artist
    const navidromeResults = await searchNavidrome(`${artistName} ${songTitle}`, 0, 10);

    // Check if any result matches both artist and title (case-insensitive)
    const artistLower = artistName.toLowerCase();
    const titleLower = songTitle.toLowerCase();

    const matchingSong = navidromeResults.find(result => {
      const resultArtist = (result.artist || '').toLowerCase();
      const resultTitle = (result.title || result.name || '').toLowerCase();
      return resultArtist.includes(artistLower) && resultTitle.includes(titleLower);
    });

    return {
      inNavidrome: !!matchingSong,
      songId: matchingSong?.id
    };
  } catch (error) {
    console.error('Error checking song availability in Navidrome:', error);
    return { inNavidrome: false };
  }
}

export const Route = createFileRoute("/api/lidarr/add")({
  server: {
    handlers: {
  POST: async ({ request }) => {
    // Auth check (protected route)
    const { auth } = await import('../../../lib/auth/server');
    const session = await auth.api.getSession({
      headers: request.headers,
      query: {
        disableCookieCache: true,
      },
    });

    if (!session) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const { song } = await request.json() as { song: string };
      if (!song) {
        return new Response(JSON.stringify({ error: 'Song suggestion required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Parse "Artist - Title"
      const match = song.match(/^(.+?)\s*-\s*(.+)$/);
      if (!match) {
        return new Response(JSON.stringify({ error: 'Invalid song format. Expected "Artist - Title"' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const artistName = match[1].trim();
      const songTitle = match[2].trim();

      // Check if the specific song is already available in Navidrome
      const songAvailability = await checkSongAvailability(artistName, songTitle);
      if (songAvailability.inNavidrome) {
        return new Response(JSON.stringify({ message: `"${songTitle}" by ${artistName} is already in your library` }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const results = await searchArtistsFull(artistName);
      if (results.length === 0) {
        return new Response(JSON.stringify({ error: `Artist "${artistName}" not found in Lidarr search` }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const artist = results[0];

      // Check if already in Lidarr
      const isAdded = await isArtistAdded(artist.foreignArtistId);

      if (isAdded) {
        // Artist already exists - find and monitor the album containing the song
        console.log(`🎵 Artist "${artist.artistName}" already in Lidarr, finding album for "${songTitle}"`);

        const existingArtist = await findArtistByName(artist.artistName);
        if (existingArtist) {
          // Get albums for the artist
          const albums = await getArtistAlbums(existingArtist.id);
          console.log(`📀 Found ${albums.length} albums for "${artist.artistName}":`, albums.map(a => a.title));

          let matchingAlbum: LidarrAlbum | undefined;

          // Strategy 0 (BEST): Get album name from Last.fm track.getInfo
          const lastFmAlbumInfo = await getAlbumInfoFromLastFm(artistName, songTitle);
          if (lastFmAlbumInfo?.albumName) {
            matchingAlbum = findAlbumByName(albums, lastFmAlbumInfo.albumName);
            if (matchingAlbum) {
              console.log(`📀 Found album via Last.fm: "${matchingAlbum.title}"`);
            }
          }

          // Strategy 1: Search Lidarr by song title (if Last.fm didn't work)
          if (!matchingAlbum) {
            const albumSearchResults = await searchAlbumByTitle(songTitle, artistName);
            matchingAlbum = albumSearchResults.find(album =>
              album.artistId === existingArtist.id ||
              albums.some(a => a.foreignAlbumId === album.foreignAlbumId)
            );
          }

          // Strategy 2: Check if song title matches any album title (for singles/EPs)
          if (!matchingAlbum) {
            const titleLower = songTitle.toLowerCase().replace(/\(feat\..*?\)/gi, '').trim();
            const directMatch = albums.find(a =>
              a.title.toLowerCase().includes(titleLower) ||
              titleLower.includes(a.title.toLowerCase())
            );
            if (directMatch) {
              console.log(`📀 Found direct title match: "${directMatch.title}"`);
              matchingAlbum = directMatch;
            }
          }

          // Strategy 3: If still no match and we have albums, pick the most recent one
          if (!matchingAlbum && albums.length > 0) {
            const sortedAlbums = [...albums].sort((a, b) => {
              const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
              const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
              return dateB - dateA;
            });
            const recentAlbum = sortedAlbums[0];
            if (recentAlbum) {
              console.log(`📀 Fallback to most recent album: "${recentAlbum.title}"`);
              matchingAlbum = recentAlbum;
            }
          }

          if (matchingAlbum) {
            // Find the local album ID
            const localAlbum = albums.find(a => a.foreignAlbumId === matchingAlbum!.foreignAlbumId) || matchingAlbum;
            if (localAlbum && localAlbum.id) {
              console.log(`✅ Found album "${localAlbum.title}" for "${songTitle}"`);
              await monitorAlbum(localAlbum.id, true);
              await searchForAlbum(localAlbum.id);
              return new Response(JSON.stringify({
                success: true,
                message: `Added album "${localAlbum.title}" to download queue for "${songTitle}"`
              }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }

          // If no specific album found, just report that artist exists
          return new Response(JSON.stringify({
            message: `Artist "${artist.artistName}" already in Lidarr. Could not find specific album for "${songTitle}".`
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({ message: 'Artist already in Lidarr' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Artist not in Lidarr - add them with monitoring disabled, then find and monitor the specific album
      console.log(`➕ Adding new artist "${artist.artistName}" to Lidarr (unmonitored)`);

      // First, get album info from Last.fm (do this before adding artist to avoid timeout issues)
      const lastFmAlbumInfo = await getAlbumInfoFromLastFm(artistName, songTitle);

      await addArtistToQueue(artist, { monitorAll: false });

      // Wait for Lidarr to fetch the artist's albums (may take a few seconds)
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Find the artist we just added
      const newArtist = await findArtistByName(artist.artistName);
      if (newArtist) {
        // Get albums for the artist
        const albums = await getArtistAlbums(newArtist.id);
        console.log(`📀 Artist added with ${albums.length} albums:`, albums.map(a => a.title));

        let matchingAlbum: LidarrAlbum | undefined;

        // Strategy 0 (BEST): Use album name from Last.fm
        if (lastFmAlbumInfo?.albumName) {
          matchingAlbum = findAlbumByName(albums, lastFmAlbumInfo.albumName);
          if (matchingAlbum) {
            console.log(`📀 Found album via Last.fm: "${matchingAlbum.title}"`);
          }
        }

        // Strategy 1: Search Lidarr by song title
        if (!matchingAlbum) {
          const albumSearchResults = await searchAlbumByTitle(songTitle, artistName);
          matchingAlbum = albumSearchResults.find(album =>
            albums.some(a => a.foreignAlbumId === album.foreignAlbumId)
          );
        }

        // Strategy 2: Check if song title matches any album title (for singles/EPs)
        if (!matchingAlbum) {
          const titleLower = songTitle.toLowerCase().replace(/\(feat\..*?\)/gi, '').trim();
          const directMatch = albums.find(a =>
            a.title.toLowerCase().includes(titleLower) ||
            titleLower.includes(a.title.toLowerCase())
          );
          if (directMatch) {
            console.log(`📀 Found direct title match: "${directMatch.title}"`);
            matchingAlbum = directMatch;
          }
        }

        // Strategy 3: Pick the most recent album as fallback
        if (!matchingAlbum && albums.length > 0) {
          const sortedAlbums = [...albums].sort((a, b) => {
            const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
            const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
            return dateB - dateA;
          });
          const recentAlbum = sortedAlbums[0];
          if (recentAlbum) {
            console.log(`📀 Fallback to most recent album: "${recentAlbum.title}"`);
            matchingAlbum = recentAlbum;
          }
        }

        if (matchingAlbum) {
          const localAlbum = albums.find(a => a.foreignAlbumId === matchingAlbum!.foreignAlbumId) || matchingAlbum;
          if (localAlbum && localAlbum.id) {
            console.log(`✅ Found and monitoring album "${localAlbum.title}" for "${songTitle}"`);
            await monitorAlbum(localAlbum.id, true);
            await searchForAlbum(localAlbum.id);
            return new Response(JSON.stringify({
              success: true,
              message: `Added "${artist.artistName}" and queued album "${localAlbum.title}" for "${songTitle}"`
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        }

        // Couldn't find specific album - let user know
        return new Response(JSON.stringify({
          success: true,
          message: `Added "${artist.artistName}" to Lidarr. Album for "${songTitle}" not found - you may need to manually select it.`
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ success: true, message: `Added "${artist.artistName}" to Lidarr.` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: unknown) {
      console.error('Lidarr add failed:', error);
      let code = 'GENERAL_API_ERROR';
      let message = 'Failed to add to Lidarr';
      if (error instanceof ServiceError) {
        code = error.code;
        message = error.message;
      } else if (error instanceof Error) {
        message = error.message;
      }
      return new Response(JSON.stringify({ code, message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },
    },
  },
});