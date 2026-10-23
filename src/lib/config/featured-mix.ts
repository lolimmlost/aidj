/**
 * The AIDJ mix highlighted at the top of the dashboard (#351).
 *
 * Navidrome song id of a published mix (the `AIDJ MIXES` folder). Default: Tacoma Bike Party,
 * "Five-Star Peak Time (bar-fix test)". Override at build time with `VITE_FEATURED_MIX_ID`;
 * an empty value turns the card off. An id Navidrome doesn't know hides the card too.
 */
const DEFAULT_FEATURED_MIX_ID = 'L5jsIP71fq5y556dZl132c';

export const FEATURED_MIX_ID: string =
  import.meta.env.VITE_FEATURED_MIX_ID ?? DEFAULT_FEATURED_MIX_ID;
