/**
 * The AIDJ mix highlighted at the top of the dashboard (#351).
 *
 * Navidrome song id of a published mix (the `AIDJ MIXES` folder). Default: BOO Seattle 2026,
 * "BOO Seattle 26 — Stage Climb" (was TBP "Five-Star Peak Time", L5jsIP71fq5y556dZl132c).
 * Override at build time with `VITE_FEATURED_MIX_ID`;
 * an empty value turns the card off. An id Navidrome doesn't know hides the card too.
 */
const DEFAULT_FEATURED_MIX_ID = '0OcImEHVIrK5z1wiwS2VoR';

export const FEATURED_MIX_ID: string =
  import.meta.env.VITE_FEATURED_MIX_ID ?? DEFAULT_FEATURED_MIX_ID;
