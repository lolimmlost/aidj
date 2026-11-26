# AIDJ docs

Where to look first:

- **[CLAUDE.md](../CLAUDE.md):** the quick reference. Stack, critical systems, conventions, known pitfalls and what not to touch.
- **[generated/SYSTEM-MAP.md](generated/SYSTEM-MAP.md):** where everything lives. Generated 2026-02; file sizes have drifted since.
- **[CHANGELOG.md](../CHANGELOG.md):** what shipped in each release.
- **GitHub issues and milestones:** the backlog and plans. The old PRD, story and sprint files were removed in the 1.6.0 cleanup; they're in git history before it.

## System guides (`generated/`)
- [AUDIO-PLAYBACK.md](generated/AUDIO-PLAYBACK.md): dual-deck playback, crossfade, iOS recovery
- [RECOMMENDATION-ENGINE.md](generated/RECOMMENDATION-ENGINE.md): scoring signals and the AI DJ
- [DATA-MODEL.md](generated/DATA-MODEL.md): database tables
- [EXTERNAL-INTEGRATIONS.md](generated/EXTERNAL-INTEGRATIONS.md): Navidrome, Last.fm, Lidarr, MeTube, Ollama
- [CONVENTIONS.md](generated/CONVENTIONS.md): code conventions

## Design (`design/`)
Current design docs and specs, including the [glass UI recipe](design/glass-ui-recipe.md) for phones, radio and recommendation architecture, transition learning, listening sessions, liked songs, library reconciliation and the YouTube fallback.

## Architecture plans (`architecture/`)
Plans and decision records: the AI DJ hybrid mode, crossfade decisions, cross-device sync, iOS audio resilience, HLS/jukebox, the player bar refactor, the recommendation engine refactor, analytics and discovery upgrades.

## Features (`features/`)
Artist fatigue, smart playlists, time-based discovery, DJ playlist intelligence.

## Reference
- [navidrome_api.md](navidrome_api.md): Navidrome / Subsonic API notes
- [cross-device-sync.md](cross-device-sync.md): how playback sync works across devices
- [download-flow.md](download-flow.md): download → retag → reconcile
- [search-feature.md](search-feature.md), [SEARCH_USAGE_GUIDELINES.md](SEARCH_USAGE_GUIDELINES.md): search
- [audio-player-ux-specification.md](audio-player-ux-specification.md): player UX
- [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md): design tokens and components (classic UI)
- [dj-features-testing-guide.md](dj-features-testing-guide.md): testing the DJ features by hand
- [decisions/](decisions/), [fixes/](fixes/), [troubleshooting/](troubleshooting/), [research/](research/)

## Deployment (`deployment/`)
Production runs the Docker image (`Dockerfile`, Node 26) on Coolify, deployed from `main`. These guides cover the alternative Cloudflare Pages target. Database migrations are **not** run on deploy; apply new `drizzle/*.sql` files by hand first.

## Archive (`archive/`)
Old plans and status reports, kept for history.
