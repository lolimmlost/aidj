// Barrel export — all existing `import { ... } from '@/lib/services/navidrome'` continue to work.

// Types
export type {
  Artist, ArtistDetail, ArtistWithDetails,
  RawSong, SubsonicSong, ExtendedSongMetadata,
  NavidromePlaylist, NavidromePlaylistWithSongs,
  Album, AlbumDetail, Song, LibrarySummary,
  SubsonicApiResponse, SubsonicApiValue, SubsonicApiObject,
  SubsonicArtistResult, SubsonicSearchResponse, SubsonicTopSongsResponse,
  SubsonicCreds,
} from './types';

// Core (auth, HTTP, connectivity)
export {
  md5Pure,
  token, clientId, subsonicToken, subsonicSalt, tokenExpiry,
  resetAuthState, getAuthToken, apiFetch,
  buildSubsonicUrl, isBrowser, waitForRateLimit,
  checkNavidromeConnectivity,
} from './core';

// Library (artists, albums, songs, search)
export {
  getArtists, searchArtistsByName, getArtistDetail, getArtistsWithDetails,
  getAlbums, getAlbumDetail,
  getSongs, getSongsByArtist, getSongsByIds, getSongsGlobal, getRandomSongs, getTopSongs,
  search, resolveSongByArtistTitle,
  getLibrarySummary,
} from './library';

// User features (star, scrobble)
export {
  starSong, unstarSong, getStarredSongs, scrobbleSong,
} from './user-features';

// Playlists
export {
  getPlaylists, getPlaylist, createPlaylist, updatePlaylist, deletePlaylist, addSongsToPlaylist,
} from './playlists';

// Discovery & recommendations
export {
  getSimilarSongs, searchSongsByCriteria,
  getTopArtists, getMostPlayedSongs, getRecentlyPlayedSongs,
} from './discovery';

// Extended metadata
export {
  getSongWithExtendedMetadata, getSongsWithExtendedMetadata,
} from './metadata';
