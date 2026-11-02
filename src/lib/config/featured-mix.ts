/**
 * The AIDJ mix highlighted at the top of the dashboard (#351).
 *
 * Navidrome song id of a published mix (the `AIDJ MIXES` folder). Default: "Live Set 2 (Nov 1, Lab
 * render)", Juan's 2-hour live Lab set of 2026-11-01 rendered through the Lab's own engine from its saved
 * cues (#392), AIDJ Live Sets. Was "Liked Transitions 2", WHM5V0XUtyMo2E3yvWIf9o; before that "Liked
 * Transitions 1", 1X9alpHeNQJDzme1Kov2Wu; BOO "Stage Climb", 0OcImEHVIrK5z1wiwS2VoR; TBP "Five-Star Peak
 * Time", L5jsIP71fq5y556dZl132c.
 * Override at build time with `VITE_FEATURED_MIX_ID`;
 * an empty value turns the card off. An id Navidrome doesn't know hides the card too.
 */
const DEFAULT_FEATURED_MIX_ID = 'nJ8RdgWBwcjCSRftJ0vBMg';

export const FEATURED_MIX_ID: string =
  import.meta.env.VITE_FEATURED_MIX_ID ?? DEFAULT_FEATURED_MIX_ID;
