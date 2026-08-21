# Why `library-reconciliation` never runs on prod — root cause + fix

**Date:** 2026-08-18
**Status:** ✅ Built (steps 1–3), pending deploy. See "Implementation" below.
**Context:** Prerequisite for the download→rescan→re-match reconciler (see the
E2E pipeline gap: "new songs not added"). Reconciliation owns the only Navidrome
`startScan` + ghost-star cleanup in the app; if it never runs, nothing downstream
that depends on a library scan can work automatically.

---

## TL;DR

The library-reconciliation scheduled job **has never run a single time** on the
current prod container. Root cause: **nothing initializes it.** Its schedule is an
in-process `setTimeout` that is only ever armed by `initialize()`, and
`initialize()` is called from exactly two API routes that **no client ever hits**.
The prod server entry (`server.ts`) boots WebSockets but does **not** bootstrap any
background job. Fix: initialize reconciliation at prod boot in `server.ts`, run it
shortly after start, and (for durability against redeploys) drive the cadence from
a persisted `next_run_at` rather than a long-lived in-memory timer.

---

## Evidence (prod, container up since 2026-08-14 19:35 UTC — ~4 days)

- Entry confirmed: container `Cmd = [npx tsx server.ts]`; logs show
  `[Server] Listening on http://0.0.0.0:3000`.
- `[LibraryReconciliation]` log lines on the live container:
  - `Initialized` → **0**
  - `Next run at …` → **0**
  - `Done: … checked …` → **0**
- Expected at 6h cadence over 4 days: ~16 runs. Actual: **0**.
- No reconcile-adjacent log lines of any kind (no trigger-route hits either).

## The three-layer root cause

### 1. Schedule is in-process and only armed by `initialize()`
`src/lib/services/library-reconciliation.ts`:
- Singleton (`getInstance`) with a private `constructor()` — creating/looking up the
  manager does **not** schedule anything.
- `scheduleNextRun()` (the only thing that arms the `setTimeout`) is called from
  `initialize()`, `start()`, and after each `triggerNow()`. So with no
  `initialize()`/`start()`/`triggerNow()`, `nextRunAt` stays null forever.

### 2. `initialize()` is only reachable from routes nothing calls
- `initializeReconciliation(userId)` is invoked **only** from:
  - `src/routes/api/library-reconciliation/status.ts`
  - `src/routes/api/library-reconciliation/trigger.ts`
- Grep for client fetches of `/api/library-reconciliation/*` in `src/**` → **none**.
- The Tasks UI *does* surface reconciliation, but via
  `task-aggregator.ts` → `getReconciliationManager()` + `getStatus()`. That returns
  the singleton and reads status; it **never calls `initialize()`**. So even opening
  the Tasks page does not start the loop.

**Contrast — why background-discovery *does* self-start:** its `status.ts` route
calls `initializeBackgroundDiscovery(userId, …)`, **and** a client store
(`src/lib/stores/discovery-suggestions.ts`) polls `/api/background-discovery/status`
whenever the Discover page is open. Reconciliation has neither a client poller nor a
boot hook, so its lazy-init trigger never fires.

### 3. Prod server entry bootstraps nothing
- `server.ts` `start()` (the real prod boot path) sets up the HTTP handler + the
  playback WebSocket, then `server.listen(...)`. It never imports or initializes any
  background service (reconciliation, discovery, lastfm-backfill, session-materializer).
- The dev-only equivalent, `vite-ws-plugin.ts::configureServer`, is a **Vite
  dev-server hook** — it does not run in the `node-server` production build either.
- Net: **there is no production boot hook that starts background jobs.**

## Secondary issues surfaced (worth fixing alongside)

- **In-memory timer resets on every redeploy.** Even once initialized, the 6h
  `setTimeout` lives in process memory. A Coolify redeploy (frequent) wipes it. If
  redeploys land < 6h apart, a boot-armed timer would *never* fire. (This container
  happened to survive 4 days, so boot-init alone would have fired ~16×.)
- **Single-user singleton.** `initialize(userId)` binds the one singleton to one
  user, but reconciliation reconciles *that user's* liked/feedback/playlist song IDs.
  Fine for Juan's single-admin setup; a latent bug for multi-user.

## Fix

### Recommended: initialize at prod boot in `server.ts`, cadence from DB
1. In `server.ts::start()` (after `server.listen`), call
   `initializeReconciliation(<adminUserId>)` for the admin/owner user (the same
   account used for shared Navidrome ops). Wrap in try/catch so a failure never
   blocks the server.
2. Kick a first run shortly after boot (e.g. 2–5 min delay, not a full 6h) so a
   fresh deploy reconciles soon rather than only 6h later. This also neutralizes the
   redeploy-resets-timer problem for the common case.
3. **Durability:** persist `last_run_at` / `next_run_at` (e.g. a small
   `reconciliation_state` row, or reuse an existing settings table). On boot, compute
   the first delay as `max(0, next_run_at - now)` instead of always a fresh 6h, so
   cadence survives restarts. Optionally replace the long `setTimeout` with a short
   heartbeat interval (e.g. every 15 min) that checks "is it due?" — more robust than
   a single multi-hour timer.

**Why here:** `server.ts` is the one place guaranteed to run once per prod process
start, already async, already the home of the other server-lifetime concern (WS).

### Alternative: external scheduler → trigger route
Have Coolify (or host cron / a sidecar) `POST /api/library-reconciliation/trigger`
every 6h. The trigger route already lazy-inits + runs.
- Pros: durable across restarts by construction; observable via HTTP status.
- Cons: the route is `withAuthAndErrorHandling` (session-authed) and keys off
  `session.user.id`, so cron needs a valid admin session/token, and the run is tied
  to whichever user the token belongs to. Needs infra config outside the app.
- Verdict: viable, but boot-init keeps everything in-repo and avoids a service token.

### Not sufficient alone
- Adding a client poller for the status endpoint (mirroring discovery) would only run
  reconciliation while a user has a specific page open — fragile and user-dependent.

## Suggested implementation order
1. Boot-init in `server.ts` + first-run-soon (fixes the "never runs" bug immediately).
2. Persist `next_run_at` and derive the boot delay from it (fixes redeploy resets).
3. Only then build the download→rescan→re-match reconciler on top (the E2E fix that
   depends on scans actually happening).

## Implementation (built 2026-08-18)

- **New table `library_reconciliation_state`** (PK `user_id`) — mirrors
  `discovery_job_state`. Schema: `src/lib/db/schema/library-reconciliation.schema.ts`,
  re-exported from `schema/index.ts`. Migration `drizzle/0029_library_reconciliation_state.sql`
  — **already applied to prod** (additive CREATE TABLE + 2 indexes + FK).
- **Persistence + resume** in `library-reconciliation.ts`:
  - `initialize()` is now idempotent (boot hook + status/trigger routes won't stack
    timers), loads persisted state, and schedules from `next_run_at` if it's in the
    future, else `FIRST_RUN_DELAY_MS` (3 min) for overdue/never-run.
  - `loadState()`/`saveState()` (upsert) persist enabled/frequency/last_run_at/
    next_run_at/is_running/last_error/last_result. Persisted on init, run start,
    run finish, start(), stop().
- **Boot hook** `bootstrapBackgroundJobs()` in `server.ts`, called fire-and-forget
  after `server.listen`. Resolves the owner as `RECONCILIATION_USER_ID` env →
  earliest `role='admin'` user → earliest user (→ Juan on prod). Failures never block
  startup.

**Activates on next deploy** (`npx tsx server.ts` boot). Expected logs:
`[Server] Library reconciliation bootstrapped for user …` then
`[LibraryReconciliation] Initialized … next run …`, and ~3 min later `Done: … checked …`.

**Not yet done:** step 3's optional heartbeat-interval variant (kept the resume-from-
`next_run_at` approach instead), and the multi-user singleton limitation (still runs
for one owner user only). The download→rescan→re-match reconciler builds on top of this.

## Files
- `src/lib/services/library-reconciliation.ts` — singleton, `initialize`,
  `scheduleNextRun`, `triggerNow` (lines ~88–188).
- `src/routes/api/library-reconciliation/{status,trigger}.ts` — only init callers.
- `src/lib/services/task-aggregator.ts` (~265) — surfaces status without init.
- `server.ts` — prod boot entry; **proposed init site**.
- `vite-ws-plugin.ts` — dev-only `configureServer` (not a prod hook).
