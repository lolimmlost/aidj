# Contributing to AIDJ

Thanks for your interest! AIDJ is a self-hosted AI DJ that runs on top of [Navidrome](https://www.navidrome.org/).
Bug reports, ideas and pull requests are all welcome.

## Before you start
- **Questions / ideas:** open a [Discussion](https://github.com/lolimmlost/aidj/discussions) first for anything bigger than a small fix, so we can agree on the approach.
- **Bugs:** use the bug report template. Logs from the browser console (or Eruda on mobile) make fixes much faster.
- **Security issues:** please **don't** open a public issue. See [SECURITY.md](./SECURITY.md).

## Development setup
Prerequisites: Node.js 20+, PostgreSQL, and a Navidrome instance.

```bash
git clone https://github.com/lolimmlost/aidj.git
cd aidj
npm install
cp .env.example .env   # fill in DATABASE_URL, BETTER_AUTH_SECRET, Navidrome URL/credentials, …
npm run db             # generate + apply migrations
npm run dev            # http://localhost:3003
```

`compose.yml` starts a local PostgreSQL if you don't have one.

## Checks (CI runs the same)
```bash
npx vitest run         # unit tests
npm run lint           # eslint
npm run build          # production build (also regenerates src/routeTree.gen.ts)
npm run test:e2e       # Playwright (optional locally)
```
CI also runs a **security** gate (fails on any high/critical npm advisory not on the documented allowlist) and a secret scan.

## Pull requests
- Branch from `main`; keep PRs focused (one fix or feature).
- Use [Conventional Commit](https://www.conventionalcommits.org/) style titles, e.g. `fix(radio): …`, `feat(playlists): …`, `chore(deps): …`.
- Add or update tests for behaviour changes, and say how you verified it (especially on iOS for playback changes).
- PRs are **squash-merged**; `main` has linear history.

## Areas that need extra care
- **Audio playback** (`src/lib/stores/audio.ts`, `useDualDeckAudio`, `useCrossfade`, stall recovery): dual-deck crossfade + iOS audio-session behaviour. Test on a real iPhone with the screen locked.
- **Auth:** `better-auth` is intentionally pinned to an exact version; don't bump it in an unrelated PR.
- **Cross-device sync** (WebSocket plugin): test with two browsers/devices.
- **Database:** schemas live in `src/lib/db/schema/` and must be re-exported from `index.ts`; include the migration.

`CLAUDE.md` has a compact architecture overview that's useful for humans too.

## License
By contributing, you agree that your contributions are licensed under the [MIT License](./LICENSE).
