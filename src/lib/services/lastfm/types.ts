/**
 * Last.fm API Types
 * Story 7.2: Last.fm Integration for Discovery Mode
 */

// Raw Last.fm API response types
export interface LastFmImage {
  '#text': string;
  size: 'small' | 'medium' | 'large' | 'extralarge' | 'mega' | '';
}

export interface LastFmArtistBasic {
  name: string;
  url: string;
  mbid?: string;
}

export interface LastFmTrack {
  name: string;
  artist: LastFmArtistBasic | string; // Can be object or string depending on endpoint
  url: string;
  playcount?: number | string;
  listeners?: string;
  match?: number; // 0-1 similarity score (for similar tracks)
  duration?: number | string;
  mbid?: string;
  image?: LastFmImage[];
  '@attr'?: {
    rank: string;
  };
}

export interface LastFmArtist {
  name: string;
  url: string;
  mbid?: string;
  match?: number; // 0-1 similarity score (for similar artists)
  image?: LastFmImage[];
}

// API Response wrapper types
export interface LastFmSimilarTracksResponse {
  similartracks?: {
    track: LastFmTrack[];
    '@attr': {
      artist: string;
    };
  };
  error?: number;
  message?: string;
}

export interface LastFmSimilarArtistsResponse {
  similarartists?: {
    artist: LastFmArtist[];
    '@attr': {
      artist: string;
    };
  };
  error?: number;
  message?: string;
}

export interface LastFmTopTracksResponse {
  toptracks?: {
    track: LastFmTrack[];
    '@attr': {
      artist: string;
      page: string;
      perPage: string;
      totalPages: string;
      total: string;
    };
  };
  error?: number;
  message?: string;
}

export interface LastFmSearchResponse {
  results?: {
    'opensearch:Query': {
      '#text': string;
      role: string;
      searchTerms: string;
      startPage: string;
    };
    'opensearch:totalResults': string;
    'opensearch:startIndex': string;
    'opensearch:itemsPerPage': string;
    trackmatches: {
      track: LastFmTrack[];
    };
  };
  error?: number;
  message?: string;
}

export interface LastFmTagTopTracksResponse {
  tracks?: {
    track: LastFmTrack[];
    '@attr': {
      tag: string;
      page: string;
      perPage: string;
      totalPages: string;
      total: string;
    };
  };
  error?: number;
  message?: string;
}

// track.getInfo response - includes album metadata
export interface LastFmTrackInfoResponse {
  track?: {
    name: string;
    url: string;
    duration?: string;
    listeners?: string;
    playcount?: string;
    artist: {
      name: string;
      mbid?: string;
      url: string;
    };
    album?: {
      artist: string;
      title: string;
      mbid?: string;
      url: string;
      image?: LastFmImage[];
      '@attr'?: {
        position: string;
      };
    };
    toptags?: {
      tag: Array<{
        name: string;
        url: string;
      }>;
    };
    wiki?: {
      published: string;
      summary: string;
      content: string;
    };
  };
  error?: number;
  message?: string;
}

// user.getRecentTracks response - used for scrobble backfill
export interface LastFmRecentTracksResponse {
  recenttracks?: {
    track: Array<{
      name: string;
      artist: {
        '#text': string;
        mbid?: string;
      };
      album: {
        '#text': string;
        mbid?: string;
      };
      date?: {
        uts: string; // Unix timestamp
        '#text': string;
      };
      '@attr'?: {
        nowplaying?: string;
      };
      image?: LastFmImage[];
      url?: string;
      mbid?: string;
    }>;
    '@attr': {
      user: string;
      page: string;
      perPage: string;
      totalPages: string;
      total: string;
    };
  };
  error?: number;
  message?: string;
}

// Enriched types with library status
export interface EnrichedTrack {
  name: string;
  artist: string;
  url: string;
  playcount?: number;
  match?: number; // 0-1 similarity score
  duration?: number;
  image?: string; // Largest available image URL
  album?: string; // Album name from Last.fm (for Lidarr downloads)
  albumMbid?: string; // MusicBrainz album ID (for precise Lidarr matching)
  inLibrary: boolean;
  navidromeId?: string;
  navidromeAlbum?: string;
}

export interface EnrichedArtist {
  name: string;
  url: string;
  match?: number;
  image?: string;
  inLibrary: boolean;
  navidromeId?: string;
  trackCount?: number;
}

// Service configuration
export interface LastFmConfig {
  apiKey: string;
  cacheTtlMs?: number; // Default: 5 minutes
  maxRequestsPerSecond?: number; // Default: 5
}

// Service error types
export type LastFmErrorCode =
  | 'INVALID_API_KEY'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'NETWORK_ERROR'
  | 'INVALID_RESPONSE'
  | 'ARTIST_NOT_FOUND'
  | 'TRACK_NOT_FOUND';

export interface LastFmError {
  code: LastFmErrorCode;
  message: string;
  retryAfterMs?: number;
}

// Request options
export interface LastFmRequestOptions {
  method: string;
  params?: Record<string, string | number>;
}

