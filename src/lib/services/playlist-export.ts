import { ServiceError } from '../utils';
import type {
  PlaylistExportFormat,
  PlaylistPlatform,
  SongMatchResult,
} from '../db/schema/playlist-export.schema';

/**
 * Song data structure for export/import
 */
export interface ExportableSong {
  id?: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number; // in seconds
  track?: number;
  isrc?: string;
  platform?: PlaylistPlatform;
  platformId?: string;
  url?: string;
}

/**
 * Playlist data structure for export/import
 */
export interface ExportablePlaylist {
  name: string;
  description?: string;
  creator?: string;
  platform?: PlaylistPlatform;
  createdAt?: Date;
  songs: ExportableSong[];
}

/**
 * Export options
 */
export interface ExportOptions {
  format: PlaylistExportFormat;
  includeMetadata?: boolean;
  includeIsrc?: boolean;
  basePath?: string; // For M3U file paths
}

/**
 * Import result
 */
export interface ImportResult {
  playlist: ExportablePlaylist;
  format: PlaylistExportFormat;
  parseWarnings: string[];
}

/**
 * Export a playlist to M3U format
 * M3U is the most widely supported playlist format
 */
export function exportToM3U(playlist: ExportablePlaylist, options?: { basePath?: string }): string {
  const lines: string[] = ['#EXTM3U'];

  // Add playlist metadata as comments
  lines.push(`#PLAYLIST:${playlist.name}`);
  if (playlist.description) {
    lines.push(`#EXTDESC:${playlist.description}`);
  }
  if (playlist.creator) {
    lines.push(`#EXTCREATOR:${playlist.creator}`);
  }

  for (const song of playlist.songs) {
    // Extended info line: #EXTINF:duration,artist - title
    const duration = song.duration || -1;
    const displayName = `${song.artist} - ${song.title}`;
    lines.push(`#EXTINF:${duration},${displayName}`);

    // Additional metadata as comments
    if (song.album) {
      lines.push(`#EXTALB:${song.album}`);
    }
    if (song.isrc) {
      lines.push(`#EXTISRC:${song.isrc}`);
    }
    if (song.platformId && song.platform) {
      lines.push(`#EXTPID:${song.platform}:${song.platformId}`);
    }

    // File path or URL
    if (song.url) {
      lines.push(song.url);
    } else if (options?.basePath) {
      // Create a sanitized filename
      const filename = sanitizeFilename(`${song.artist} - ${song.title}`);
      lines.push(`${options.basePath}/${filename}.mp3`);
    } else {
      // Fallback to a placeholder path
      const filename = sanitizeFilename(`${song.artist} - ${song.title}`);
      lines.push(`${filename}.mp3`);
    }
  }

  return lines.join('\n');
}

/**
 * Export a playlist to XSPF (XML Shareable Playlist Format)
 * XSPF is an XML-based format with rich metadata support
 */
export function exportToXSPF(playlist: ExportablePlaylist): string {
  const escapeXml = (str: string): string => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<playlist version="1" xmlns="http://xspf.org/ns/0/">\n';

  // Playlist metadata
  xml += `  <title>${escapeXml(playlist.name)}</title>\n`;
  if (playlist.description) {
    xml += `  <annotation>${escapeXml(playlist.description)}</annotation>\n`;
  }
  if (playlist.creator) {
    xml += `  <creator>${escapeXml(playlist.creator)}</creator>\n`;
  }
  if (playlist.createdAt) {
    xml += `  <date>${playlist.createdAt.toISOString()}</date>\n`;
  }

  // Track list
  xml += '  <trackList>\n';

  for (const song of playlist.songs) {
    xml += '    <track>\n';
    xml += `      <title>${escapeXml(song.title)}</title>\n`;
    xml += `      <creator>${escapeXml(song.artist)}</creator>\n`;

    if (song.album) {
      xml += `      <album>${escapeXml(song.album)}</album>\n`;
    }
    if (song.duration) {
      xml += `      <duration>${song.duration * 1000}</duration>\n`; // XSPF uses milliseconds
    }
    if (song.track) {
      xml += `      <trackNum>${song.track}</trackNum>\n`;
    }
    if (song.url) {
      xml += `      <location>${escapeXml(song.url)}</location>\n`;
    }

    // Extended metadata in extension block
    if (song.isrc || song.platformId) {
      xml += '      <extension application="http://aidj.app/xspf">\n';
      if (song.isrc) {
        xml += `        <isrc>${escapeXml(song.isrc)}</isrc>\n`;
      }
      if (song.platformId && song.platform) {
        xml += `        <platformId platform="${song.platform}">${escapeXml(song.platformId)}</platformId>\n`;
      }
      xml += '      </extension>\n';
    }

    xml += '    </track>\n';
  }

  xml += '  </trackList>\n';
  xml += '</playlist>\n';

  return xml;
}

/**
 * Export a playlist to JSON format
 * Custom JSON format with full metadata support
 */
export function exportToJSON(playlist: ExportablePlaylist): string {
  const exportData = {
    version: '1.0',
    format: 'aidj-playlist',
    exportedAt: new Date().toISOString(),
    playlist: {
      name: playlist.name,
      description: playlist.description,
      creator: playlist.creator,
      platform: playlist.platform,
      createdAt: playlist.createdAt?.toISOString(),
      songCount: playlist.songs.length,
      songs: playlist.songs.map((song, index) => ({
        position: index + 1,
        title: song.title,
        artist: song.artist,
        album: song.album,
        duration: song.duration,
        track: song.track,
        isrc: song.isrc,
        platform: song.platform,
        platformId: song.platformId,
        url: song.url,
      })),
    },
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Export a playlist to the specified format
 */
export function exportPlaylist(
  playlist: ExportablePlaylist,
  options: ExportOptions
): string {
  switch (options.format) {
    case 'm3u':
      return exportToM3U(playlist, { basePath: options.basePath });
    case 'xspf':
      return exportToXSPF(playlist);
    case 'json':
      return exportToJSON(playlist);
    default:
      throw new ServiceError('EXPORT_FORMAT_ERROR', `Unsupported export format: ${options.format}`);
  }
}

/**
 * Parse M3U playlist content
 */
export function parseM3U(content: string): ImportResult {
  const lines = content.split(/\r?\n/).filter(line => line.trim());
  const songs: ExportableSong[] = [];
  const warnings: string[] = [];

  let playlistName = 'Imported Playlist';
  let playlistDescription: string | undefined;
  let currentSong: Partial<ExportableSong> = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('#EXTM3U')) {
      continue; // Header line
    }

    if (line.startsWith('#PLAYLIST:')) {
      playlistName = line.substring(10).trim();
      continue;
    }

    if (line.startsWith('#EXTDESC:')) {
      playlistDescription = line.substring(9).trim();
      continue;
    }

    if (line.startsWith('#EXTINF:')) {
      // Parse extended info: #EXTINF:duration,artist - title
      const match = line.match(/#EXTINF:(-?\d+),(.+)/);
      if (match) {
        const duration = parseInt(match[1], 10);
        const info = match[2].trim();

        // Try to parse "artist - title" format
        const separatorIndex = info.indexOf(' - ');
        if (separatorIndex > 0) {
          currentSong.artist = info.substring(0, separatorIndex).trim();
          currentSong.title = info.substring(separatorIndex + 3).trim();
        } else {
          currentSong.title = info;
          currentSong.artist = 'Unknown Artist';
        }

        if (duration > 0) {
          currentSong.duration = duration;
        }
      }
      continue;
    }

    if (line.startsWith('#EXTALB:')) {
      currentSong.album = line.substring(8).trim();
      continue;
    }

    if (line.startsWith('#EXTISRC:')) {
      currentSong.isrc = line.substring(9).trim();
      continue;
    }

    if (line.startsWith('#EXTPID:')) {
      const pidMatch = line.match(/#EXTPID:(\w+):(.+)/);
      if (pidMatch) {
        currentSong.platform = pidMatch[1] as PlaylistPlatform;
        currentSong.platformId = pidMatch[2].trim();
      }
      continue;
    }

    if (line.startsWith('#')) {
      // Skip other comment lines
      continue;
    }

    // This should be the file path/URL
    if (currentSong.title) {
      currentSong.url = line;
      songs.push(currentSong as ExportableSong);
      currentSong = {};
    } else {
      // Try to extract info from filename
      const filename = line.split('/').pop()?.replace(/\.[^.]+$/, '') || '';
      const separatorIndex = filename.indexOf(' - ');
      if (separatorIndex > 0) {
        songs.push({
          artist: filename.substring(0, separatorIndex).trim(),
          title: filename.substring(separatorIndex + 3).trim(),
          url: line,
        });
      } else {
        warnings.push(`Line ${i + 1}: Could not parse song info from "${line}"`);
      }
    }
  }

  return {
    playlist: {
      name: playlistName,
      description: playlistDescription,
      songs,
    },
    format: 'm3u',
    parseWarnings: warnings,
  };
}

/**
 * Parse XSPF playlist content
 */
export function parseXSPF(content: string): ImportResult {
  const songs: ExportableSong[] = [];
  const warnings: string[] = [];

  // Simple XML parsing (for browser/node compatibility)
  // Extract playlist metadata
  const titleMatch = content.match(/<title>([^<]*)<\/title>/);
  const annotationMatch = content.match(/<annotation>([^<]*)<\/annotation>/);
  const creatorMatch = content.match(/<creator>([^<]*)<\/creator>/);

  const playlistName = titleMatch ? unescapeXml(titleMatch[1]) : 'Imported Playlist';
  const playlistDescription = annotationMatch ? unescapeXml(annotationMatch[1]) : undefined;
  const creator = creatorMatch ? unescapeXml(creatorMatch[1]) : undefined;

  // Extract tracks
  const trackMatches = content.match(/<track>[\s\S]*?<\/track>/g) || [];

  for (let i = 0; i < trackMatches.length; i++) {
    const track = trackMatches[i];

    const trackTitleMatch = track.match(/<title>([^<]*)<\/title>/);
    const trackCreatorMatch = track.match(/<creator>([^<]*)<\/creator>/);
    const albumMatch = track.match(/<album>([^<]*)<\/album>/);
    const durationMatch = track.match(/<duration>(\d+)<\/duration>/);
    const trackNumMatch = track.match(/<trackNum>(\d+)<\/trackNum>/);
    const locationMatch = track.match(/<location>([^<]*)<\/location>/);
    const isrcMatch = track.match(/<isrc>([^<]*)<\/isrc>/);
    const platformIdMatch = track.match(/<platformId platform="(\w+)">([^<]*)<\/platformId>/);

    if (trackTitleMatch && trackCreatorMatch) {
      const song: ExportableSong = {
        title: unescapeXml(trackTitleMatch[1]),
        artist: unescapeXml(trackCreatorMatch[1]),
      };

      if (albumMatch) song.album = unescapeXml(albumMatch[1]);
      if (durationMatch) song.duration = Math.floor(parseInt(durationMatch[1], 10) / 1000); // Convert from ms
      if (trackNumMatch) song.track = parseInt(trackNumMatch[1], 10);
      if (locationMatch) song.url = unescapeXml(locationMatch[1]);
      if (isrcMatch) song.isrc = unescapeXml(isrcMatch[1]);
      if (platformIdMatch) {
        song.platform = platformIdMatch[1] as PlaylistPlatform;
        song.platformId = unescapeXml(platformIdMatch[2]);
      }

      songs.push(song);
    } else {
      warnings.push(`Track ${i + 1}: Missing required title or artist`);
    }
  }

  return {
    playlist: {
      name: playlistName,
      description: playlistDescription,
      creator,
      songs,
    },
    format: 'xspf',
    parseWarnings: warnings,
  };
}

/**
 * Parse JSON playlist content
 */
export function parseJSON(content: string): ImportResult {
  const warnings: string[] = [];

  try {
    const data = JSON.parse(content);

    // Handle our custom format
    if (data.format === 'aidj-playlist' && data.playlist) {
      const playlist = data.playlist;
      return {
        playlist: {
          name: playlist.name || 'Imported Playlist',
          description: playlist.description,
          creator: playlist.creator,
          platform: playlist.platform,
          createdAt: playlist.createdAt ? new Date(playlist.createdAt) : undefined,
          songs: (playlist.songs || []).map((song: Record<string, unknown>) => ({
            title: song.title as string,
            artist: song.artist as string,
            album: song.album as string | undefined,
            duration: song.duration as number | undefined,
            track: song.track as number | undefined,
            isrc: song.isrc as string | undefined,
            platform: song.platform as PlaylistPlatform | undefined,
            platformId: song.platformId as string | undefined,
            url: song.url as string | undefined,
          })),
        },
        format: 'json',
        parseWarnings: warnings,
      };
    }

    // Handle Spotify export format
    if (data.tracks || data.items) {
      const tracks = data.tracks?.items || data.items || data.tracks || [];
      const songs = tracks.map((item: Record<string, unknown>) => {
        const track = (item as { track?: Record<string, unknown> }).track || item;
        const artists = (track.artists as Array<{ name: string }>) || [];
        return {
          title: track.name as string,
          artist: artists.map((a: { name: string }) => a.name).join(', ') || 'Unknown Artist',
          album: (track.album as { name?: string })?.name,
          duration: track.duration_ms ? Math.floor((track.duration_ms as number) / 1000) : undefined,
          isrc: (track.external_ids as { isrc?: string })?.isrc,
          platform: 'spotify' as PlaylistPlatform,
          platformId: track.id as string,
        };
      });

      return {
        playlist: {
          name: data.name || 'Imported Playlist',
          description: data.description,
          platform: 'spotify',
          songs,
        },
        format: 'json',
        parseWarnings: warnings,
      };
    }

    // Handle YouTube Music export format
    if (data.playlistItems || data.videoIds) {
      const items = (data.playlistItems || data.videoIds || []) as Array<Record<string, unknown>>;
      const songs = items.map((item) => {
        const snippet = item.snippet as Record<string, unknown> | undefined;
        return {
          title: (item.title || snippet?.title || 'Unknown') as string,
          artist: (item.artist || snippet?.channelTitle || 'Unknown Artist') as string,
          platform: 'youtube_music' as PlaylistPlatform,
          platformId: (item.videoId || item.id || '') as string,
        };
      });

      const dataSnippet = data.snippet as Record<string, unknown> | undefined;
      return {
        playlist: {
          name: (data.title || dataSnippet?.title || 'Imported Playlist') as string,
          description: (data.description || dataSnippet?.description) as string | undefined,
          platform: 'youtube_music',
          songs,
        },
        format: 'json',
        parseWarnings: warnings,
      };
    }

    // Generic array of songs
    if (Array.isArray(data)) {
      const songs: ExportableSong[] = [];

      for (const item of data) {
        // Handle string items (simple song names)
        if (typeof item === 'string') {
          const parts = item.split(' - ');
          if (parts.length >= 2) {
            songs.push({
              artist: parts[0].trim(),
              title: parts.slice(1).join(' - ').trim(),
            });
          } else {
            songs.push({
              title: item,
              artist: 'Unknown Artist',
            });
          }
          continue;
        }

        // Handle objects
        if (typeof item === 'object' && item !== null) {
          const obj = item as Record<string, unknown>;
          const title = (obj.title || obj.name || obj.track || obj.songTitle) as string | undefined;
          const artist = (obj.artist || obj.artists || obj.songArtist) as string | undefined;

          // Skip items without title
          if (!title) {
            warnings.push(`Skipped item without title: ${JSON.stringify(obj).substring(0, 100)}`);
            continue;
          }

          songs.push({
            title,
            artist: artist || 'Unknown Artist',
            album: obj.album as string | undefined,
            duration: obj.duration as number | undefined,
          });
        }
      }

      if (songs.length === 0) {
        throw new Error('No valid songs found in array');
      }

      return {
        playlist: {
          name: 'Imported Playlist',
          songs,
        },
        format: 'json',
        parseWarnings: warnings,
      };
    }

    // Handle object with songs array (common format)
    if (data.songs && Array.isArray(data.songs)) {
      const songs: ExportableSong[] = [];
      const dataSongs = data.songs as Array<Record<string, unknown>>;

      for (const item of dataSongs) {
        const title = (item.title || item.name || item.track) as string | undefined;
        const artist = (item.artist || item.artists) as string | undefined;

        if (!title) {
          warnings.push(`Skipped song without title`);
          continue;
        }

        songs.push({
          title,
          artist: artist || 'Unknown Artist',
          album: item.album as string | undefined,
          duration: item.duration as number | undefined,
        });
      }

      return {
        playlist: {
          name: (data.name || data.playlistName || 'Imported Playlist') as string,
          description: data.description as string | undefined,
          songs,
        },
        format: 'json',
        parseWarnings: warnings,
      };
    }

    throw new Error('Unrecognized JSON format. Expected array of songs or object with songs/tracks array.');
  } catch (error) {
    throw new ServiceError(
      'IMPORT_PARSE_ERROR',
      `Failed to parse JSON: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Parse playlist content and detect format
 */
export function parsePlaylist(content: string, format?: PlaylistExportFormat): ImportResult {
  // Auto-detect format if not specified
  if (!format) {
    const trimmed = content.trim();
    if (trimmed.startsWith('#EXTM3U') || trimmed.startsWith('#')) {
      format = 'm3u';
    } else if (trimmed.startsWith('<?xml') || trimmed.startsWith('<playlist')) {
      format = 'xspf';
    } else if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      format = 'json';
    } else {
      throw new ServiceError('IMPORT_FORMAT_ERROR', 'Could not detect playlist format');
    }
  }

  switch (format) {
    case 'm3u':
      return parseM3U(content);
    case 'xspf':
      return parseXSPF(content);
    case 'json':
      return parseJSON(content);
    default:
      throw new ServiceError('IMPORT_FORMAT_ERROR', `Unsupported import format: ${format}`);
  }
}

/**
 * Validate playlist content before import
 */
export function validatePlaylistContent(content: string, format?: PlaylistExportFormat): {
  valid: boolean;
  errors: string[];
  warnings: string[];
  songCount?: number;
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const result = parsePlaylist(content, format);

    if (!result.playlist.name) {
      warnings.push('Playlist name is missing, will use default');
    }

    if (!result.playlist.songs || result.playlist.songs.length === 0) {
      errors.push('Playlist contains no songs');
    }

    // Validate individual songs
    result.playlist.songs.forEach((song, index) => {
      if (!song.title) {
        errors.push(`Song ${index + 1}: Missing title`);
      }
      if (!song.artist) {
        warnings.push(`Song ${index + 1}: Missing artist`);
      }
    });

    warnings.push(...result.parseWarnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      songCount: result.playlist.songs.length,
    };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : 'Failed to parse playlist'],
      warnings,
    };
  }
}

/**
 * Get file extension for export format
 */
export function getFileExtension(format: PlaylistExportFormat): string {
  switch (format) {
    case 'm3u':
      return '.m3u8'; // UTF-8 M3U
    case 'xspf':
      return '.xspf';
    case 'json':
      return '.json';
    default:
      return '.txt';
  }
}

/**
 * Get MIME type for export format
 */
export function getMimeType(format: PlaylistExportFormat): string {
  switch (format) {
    case 'm3u':
      return 'audio/x-mpegurl';
    case 'xspf':
      return 'application/xspf+xml';
    case 'json':
      return 'application/json';
    default:
      return 'text/plain';
  }
}

/**
 * Generate a filename for the exported playlist
 */
export function generateExportFilename(playlistName: string, format: PlaylistExportFormat): string {
  const sanitized = sanitizeFilename(playlistName);
  const timestamp = new Date().toISOString().slice(0, 10);
  return `${sanitized}_${timestamp}${getFileExtension(format)}`;
}

// Helper functions
function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 200);
}

function unescapeXml(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
