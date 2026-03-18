# Definition of Done

- [ ] All 3 stories completed with acceptance criteria met
- [ ] New users see onboarding wizard on first visit
- [ ] Artist selections seed `artist_affinities` + `recommendation_feedback` → feed into blended scorer and discovery
- [ ] Liked songs sync populates `recommendation_feedback` + `liked_songs_sync` → feeds 35% of affinity weight
- [ ] Last.fm import (when used) populates `listening_history` + triggers similarity fetching → cascades into compound scores, affinities, temporal prefs
- [ ] `calculateFullUserProfile()` runs on onboarding completion → all derived tables computed
- [ ] Background discovery triggers immediately post-onboarding → suggestions available within minutes
- [ ] Radio shuffle works with and without seed data, plays recorded to `listeningHistory`
- [ ] Dashboard progressively reveals features across 3 tiers as data matures
- [ ] Existing users see no regression in dashboard or playback behavior
- [ ] Mobile and desktop layouts tested
- [ ] No regression in existing features (playback, playlists, AI DJ, cross-device sync)

---
