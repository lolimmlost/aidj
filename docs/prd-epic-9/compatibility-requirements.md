# Compatibility Requirements

- [x] Existing APIs remain unchanged — all new endpoints are additive
- [x] Database schema changes are backward compatible — new nullable JSONB column on existing table
- [x] UI changes follow existing patterns — Radix/shadcn components, Tailwind styling, glass-card design system
- [x] Performance impact is minimal — artist list cached, onboarding status is lightweight COUNT queries
- [x] Existing users see no difference — data maturity thresholds default to Tier 3 (full dashboard) when listening history exists
- [x] `calculateFullUserProfile()` and background discovery trigger are existing server-side functions called from new API routes — no new computation logic
