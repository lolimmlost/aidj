# CORS Preflight Error Report: Auth Sign-In

## Issue Description
Local development encounters CORS preflight (OPTIONS) error on /api/auth/sign-in/email:
- Request: OPTIONS /api/auth/sign-in/email (from browser, localhost:3000)
- Response: undefined (no status/headers, fails preflight)
- Impact: Blocks email/password login in UI; auth flow fails with CORS violation.

## Root Cause Analysis
- Base route (src/routes/api/auth/$.ts) defines GET/POST via Better Auth handler, but no explicit OPTIONS handler.
- Better Auth (src/lib/auth/auth.ts/server.ts) doesn't configure CORS; relies on framework.
- Vite dev server (vite.config.ts with tanstackStart) lacks CORS enablement by default – preflight not handled, returns undefined instead of 204 No Content with Access-Control-Allow-* headers.
- Browser (Firefox) enforces strict same-site CORS for POST with Content-Type, triggering preflight.

## Reproduction Steps
1. Run dev server: pnpm dev
2. Open http://localhost:3000 in browser.
3. Attempt login (e.g., via form POST to /api/auth/sign-in/email).
4. Observe console/network: OPTIONS request fails with CORS error.

## Recommended Fix (for Developer)
Add CORS config to vite.config.ts in tanstackStart options:
```
tanstackStart({
  // ... existing
  cors: true, // Enables CORS for all routes (allows credentials, localhost origins)
}),
```
- This handles preflight automatically (returns 204 with headers).
- For production, customize origins/methods if needed (e.g., { origin: true, credentials: true }).
- Restart dev server post-change.

## Test Recommendations
Add E2E test to validate auth flow post-fix:
- File: tests/e2e/auth-cors.spec.ts
- Scenario:
  - Given: Local dev server running
  - When: Submit login form (POST /api/auth/sign-in/email)
  - Then: No CORS error; response 200/302 with session cookie; redirect to dashboard.
- Use Playwright network interception to verify OPTIONS response (status 204, headers present).
- Unit test: Mock auth handler to ensure OPTIONS returns correct headers (if manual handler added).

## Severity & Priority
- Severity: High (blocks core auth feature in dev/UI testing)
- Priority: Immediate – Fix before sprint review (2025-09-25); aligns with Epic 1 AC6 (error handling for auth failures).

## References
- Better Auth Docs: https://www.better-auth.com/docs/advanced/cors
- TanStack Start CORS: https://tanstack.com/start/latest/docs/framework/react/advanced/cors
- Updated: 2025-09-21 by Test Architect

Assign to Full Stack Developer; verify in next standup.