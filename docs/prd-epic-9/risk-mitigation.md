# Risk Mitigation

- **Primary Risk:** Onboarding artist selections could produce low-quality seed data if the library has few artists or the user picks artists with few songs
  - **Mitigation:** Set minimum 3 artists, show song counts on cards, fall back to library-wide radio if seed data is thin
- **Secondary Risk:** Last.fm import could be slow for users with large scrobble histories (100k+)
  - **Mitigation:** SSE progress tracking with cancel option, import runs async and doesn't block wizard completion, rate limiting already handled by existing backfill service
- **Tertiary Risk:** Dashboard conditional rendering could flash wrong state on slow connections
  - **Mitigation:** Default to Tier 1 (simplified) while loading — showing less is better than flashing everything then hiding it
- **Rollback Plan:** Feature is entirely additive. Remove onboarding check → dashboard renders fully as before. New API routes and DB column are inert without UI references. No existing tables or APIs modified.
