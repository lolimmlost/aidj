# Story Manager Handoff

> Please develop detailed user stories for this brownfield epic. Key considerations:
>
> - This is an enhancement to an existing system running React 19 + TanStack Start/Router + Vite + Drizzle ORM + PostgreSQL + Zustand + Radix UI/shadcn
> - Integration points: `user_preferences` (onboarding state), `artist_affinities` (seed affinities), `recommendation_feedback` (thumbs-up signals), `liked_songs_sync` (Navidrome stars), `listening_history` (Last.fm import + radio plays), `track_similarities` (auto-fetched on play), `compound_scores` / `temporal_preferences` (computed by `calculateFullUserProfile()`), `navidrome.ts` (artist browsing + song fetching), `lastfm-backfill.ts` (scrobble import), `discovery-generator.ts` (background discovery), `useAudioStore` (radio playback)
> - Existing patterns to follow: TanStack Query for data fetching, session auth checks in API routes, Zustand stores for client state, glass-card premium UI components, responsive grid layouts
> - Critical compatibility: existing dashboard must work identically for users with listening data, all new API routes must check session auth, DB changes must be backward compatible, `calculateFullUserProfile()` and background discovery are existing server functions — call them, don't reimplement
> - Each story must include verification that existing functionality remains intact
>
> The epic should maintain system integrity while delivering a streamlined onboarding experience that fully bootstraps the multi-signal recommendation pipeline and gets new users listening as fast as possible.
