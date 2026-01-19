/**
 * Navidrome API response types
 *
 * These types define the shape of data returned from Navidrome's API.
 * Used for proper typing in lidarr-navidrome.ts integration module.
 *
 * @see https://www.navidrome.org/docs/developers/api/
 */

import type { Song, Album } from '../services/navidrome';

/**
 * Navidrome Album data as returned from the native API
 */
export interface NavidromeAlbumData {
  id: string;
  name: string;
  artistId: string;
  artist?: string;
  artistName?: string;
  year?: number;
  songCount?: number;
  duration?: number;
  genres?: string[];
  artwork?: string;
  coverArt?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Navidrome Song data as returned from the native API
 * This is an alias for Song type for semantic clarity in API contexts
 */
export type NavidromeSongData = Song;

/**
 * Navidrome Artist data as returned from the native API
 */
export interface NavidromeArtistData {
  id: string;
  name: string;
  albumCount?: number;
  songCount?: number;
  genres?: string | null;
  biography?: string;
  largeImageUrl?: string;
  mediumImageUrl?: string;
  smallImageUrl?: string;
}

/**
 * Integrated search result with data from both Lidarr and Navidrome
 */
export interface IntegratedAlbumData {
  lidarr?: {
    id: number;
    title: string;
    foreignAlbumId: string;
    artistId: number;
    artistName?: string;
    releaseDate?: string;
    images?: Array<{ coverType: string; url: string }>;
  };
  navidrome?: NavidromeAlbumData;
}

/**
 * Integrated song result with data from both Lidarr and Navidrome
 */
export interface IntegratedSongData {
  lidarr?: {
    albumId?: number;
    albumTitle?: string;
    artistId?: number;
    artistName?: string;
  };
  navidrome: NavidromeSongData;
}

/**
 * Re-export Album type for convenience
 */
export type { Song, Album };
