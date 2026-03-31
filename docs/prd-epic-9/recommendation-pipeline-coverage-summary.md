# Recommendation Pipeline Coverage Summary

After full onboarding completion (all 3 steps + radio listening), every scorer in the blended recommendation engine has seed data:

| Scorer | Weight | Seeded By |
|--------|--------|-----------|
| Last.fm Similarity | 25% | Always available (API call, no user data needed) |
| Compound Scores | 20% | Last.fm import → `listeningHistory` → `trackSimilarities` → `compoundScores`; Radio plays continue feeding |
| DJ Match | 20% | Navidrome metadata (BPM/energy/key) — no user data needed |
| Feedback | 15% | Artist picker (thumbs_up for top tracks) + liked songs sync (source='library') |
| Skip Penalty | 10% | Radio plays → `listeningHistory.skipDetected`; Last.fm import provides historical plays |
| Temporal Prefs | 5% | Last.fm import (historical timestamps) + radio plays at current time |
| Diversity | 5% | Computed at query time — no seed data needed |

**Without Last.fm** (steps 1+2 only): Feedback (15%), Last.fm (25%), DJ Match (20%) are active = 60% of scoring works immediately. Compound + Skip + Temporal build as user listens via radio.

**With Last.fm** (all 3 steps): All 7 scorers have data from day one = 100% pipeline coverage.

---
