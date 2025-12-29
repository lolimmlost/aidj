/**
 * React Query Configuration and Utilities
 *
 * Centralized exports for query management
 */

export {
  CACHE_TIMES,
  GC_TIMES,
  defaultQueryOptions,
  queryPresets,
  createSmartPollingInterval,
  DEDUP_WINDOW,
} from './config';

export { queryKeys, createQueryKey } from './keys';
export type { QueryKeys } from './keys';
