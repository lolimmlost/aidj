/**
 * Last.fm Service Module
 * Story 7.2: Last.fm Integration for Discovery Mode
 */

export { LastFmClient, getLastFmClient, isLastFmConfigured } from './client';
export type {
  LastFmConfig,
  LastFmError,
  LastFmErrorCode,
  LastFmTrack,
  LastFmArtist,
  EnrichedTrack,
  EnrichedArtist,
} from './types';
