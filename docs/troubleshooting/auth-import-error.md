# Auth Import Error - Vite SSR Circular Dependency

## The Error

```
ReferenceError: Cannot access '__vite_ssr_import_6__' before initialization
at Module.getRouter (/home/default/Desktop/dev/aidj/src/router.tsx:14:12)
```

This error typically appears during SSR (Server-Side Rendering) when the app first starts or when hot-reloading after adding a new import.

## Root Cause

The auth module at `src/lib/auth/auth.ts` uses TanStack's `createServerOnlyFn` and imports from:
- `~/env/server` (environment variables)
- `~/lib/db` (database connection)

These can create circular dependency chains when imported incorrectly in API routes, which Vite's SSR bundler cannot resolve.

## The Fix

**Wrong:**
```typescript
import { auth } from '@/lib/auth';
// or
import { auth } from '~/lib/auth';
```

**Correct:**
```typescript
import { auth } from '@/lib/auth/auth';
// or relative path
import { auth } from '../../../lib/auth/auth';
```

## Why This Happens

There is **no index.ts file** in `/src/lib/auth/`. The folder contains:

```
src/lib/auth/
├── auth.ts          ← The main auth export
├── auth-client.ts   ← Client-side auth
├── functions.ts     ← Auth helper functions
├── middleware.ts    ← Auth middleware
├── queries.ts       ← Auth queries
├── server.ts        ← Server auth config
└── encrypted-storage.ts
```

When you import from `@/lib/auth` without the `/auth` suffix, the bundler tries to resolve it and fails due to the missing index file, triggering a circular dependency resolution issue.

## Quick Checklist

When adding auth to an API route:

1. Use the full path: `@/lib/auth/auth`
2. Check existing API routes for reference (e.g., `src/routes/api/listening-history/record.ts`)
3. If you see the SSR error, check your auth import path first

## Example Usage

```typescript
// src/routes/api/some-endpoint.ts
import { createFileRoute } from "@tanstack/react-router";
import { auth } from '@/lib/auth/auth';  // ✅ Correct

export const Route = createFileRoute("/api/some-endpoint")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await auth.api.getSession({
          headers: request.headers,
          query: { disableCookieCache: true },
        });

        if (!session?.user?.id) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // ... rest of handler
      },
    },
  },
});
```

## Related Files

- Auth module: `src/lib/auth/auth.ts`
- Router (where error manifests): `src/router.tsx`
- Route tree (auto-generated): `src/routeTree.gen.ts`
