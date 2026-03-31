import type { SubsonicCreds } from '../navidrome-users';

// Re-export for convenience
export type { SubsonicCreds };

export type Artist = {
  id: string;
  name: string;
};

export type ArtistDetail = {
  id: string;
  name: string;
  albumCount: number;
  songCount: number;
  genres: string | null;
  fullText: string;
  orderArtistName: string;
  size: number;
  externalUrl?: string;
  externalInfoUpdatedAt?: string;
};

export type ArtistWithDetails = Artist & Omit<ArtistDetail, 'id' | 'name'>;

export interface RawSong {
  id: string;
  name: string;
  title?: string; // From search2 response
  artist?: string;
  albumId: string;
  artistId?: string;
  album?: string;
  path?: string;
  duration: number;
  track: number;
  trackNumber?: number; // From search2
  genre?: string; // Genre tag from Navidrome
  genres?: Array<{ id: string; name: string }>; // Multi-genre from Navidrome native API
  year?: number;
  playCount?: number;
  rating?: number;
  starred?: boolean; // Navidrome's "loved" field
}

/**
 * Generic Subsonic API response wrapper
 * All Subsonic API responses are wrapped in 'subsonic-response' with dynamic properties
 * Uses index signature with permissive value type to allow deep property access on API responses
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SubsonicApiResponse extends Record<string, SubsonicApiValue> {
  'subsonic-response'?: SubsonicApiObject & {
    status?: string;
    error?: { message?: string };
  };
}

/** Value type for deeply-nested Subsonic API JSON objects */
export type SubsonicApiValue = string | number | boolean | null | undefined | SubsonicApiObject | SubsonicApiValue[];
export interface SubsonicApiObject { [key: string]: SubsonicApiValue }

export interface SubsonicArtistResult {
  id: string;
  name: string;
  albumCount?: number;
  coverArt?: string;
}

export interface SubsonicSearchResponse {
  // Subsonic API wraps everything in 'subsonic-response'
  'subsonic-response'?: {
    searchResult3?: {
      song?: SubsonicSong[];
      artist?: SubsonicArtistResult[];
    };
    searchResult?: {
      song?: SubsonicSong[];
      artist?: SubsonicArtistResult[];
    };
  };
  // Direct response (without wrapper, for compatibility)
  searchResult3?: {
    song?: SubsonicSong[];
    artist?: SubsonicArtistResult[];
  };
  searchResult?: {
    song?: SubsonicSong[];
    artist?: SubsonicArtistResult[];
  };
}

export interface SubsonicTopSongsResponse {
  'subsonic-response'?: {
    topSongs: {
      song: SubsonicSong[];
    };
  };
  topSongs?: {
    song: SubsonicSong[];
  };
  song?: SubsonicSong[];
}

export interface SubsonicSong {
  id: string;
  title: string;
  artist: string;
  albumId: string;
  artistId?: string;
  album?: string;
  duration: string;
  track: string;
  genre?: string;
  year?: number;
  playCount?: number;
  rating?: number;
  loved?: boolean;
  bitrate?: number;
  // DJ-related metadata (from ID3 tags if available)
  bpm?: number;           // Beats per minute (TBPM tag)
  musicBrainzId?: string; // MusicBrainz ID for external lookups
}

// Extended song metadata for DJ features
export interface ExtendedSongMetadata {
  id: string;
  bpm?: number;           // BPM from ID3 TBPM tag
  key?: string;           // Musical key from ID3 TKEY tag (e.g., "Am", "C", "F#m")
  energy?: number;        // Energy level 0-1 (estimated if not available)
  fetchedAt: number;      // Timestamp when metadata was fetched
  source: 'navidrome' | 'estimated'; // Where the data came from
}

export interface NavidromePlaylist {
  id: string;
  name: string;
  songCount: number;
  duration: number; // seconds
  owner: string;
  public: boolean;
  created: string; // ISO timestamp
  changed: string; // ISO timestamp
}

export interface NavidromePlaylistWithSongs extends NavidromePlaylist {
  entry: SubsonicSong[]; // Array of songs in playlist
}

export type Album = {
  id: string;
  name: string;
  artistId: string;
  year?: number;
  artwork?: string;
};

export type Song = {
  id: string;
  name: string;
  artist?: string;
  albumId: string;
  duration: number;
  track: number;
  url: string;
  title?: string;
  artistId?: string;
  album?: string;
  trackNumber?: number;
  explicitContent?: 'true' | 'false' | boolean;
  discNumber?: string | number;
  genre?: string; // Genre tag
  year?: number;
  playCount?: number;
  rating?: number;
  loved?: boolean; // Starred/favorited
};

export type AlbumDetail = Album & {
  artist?: string;
  songCount?: number;
  duration?: number;
  genres?: string[];
};

export interface LibrarySummary {
  artists: Array<{ name: string; genres: string }>;
  songs: string[];
}
