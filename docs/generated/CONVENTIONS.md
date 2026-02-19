<!-- Generated: 2026-02-18 -->

# Conventions

## File Organization

```
src/
├── components/          # React components
│   ├── ui/              # shadcn/ui primitives
│   ├── layout/          # App layout (PlayerBar, Sidebar)
│   ├── playlists/       # Feature-specific components
│   └── ...
├── lib/
│   ├── auth/            # better-auth setup (auth.ts, auth-client.ts)
│   ├── config/          # Config system (config.ts, features.ts)
│   ├── db/
│   │   ├── schema/      # Drizzle schema files (*.schema.ts)
│   │   └── index.ts     # DB connection
│   ├── hooks/           # Custom React hooks
│   ├── services/        # Business logic (server-only)
│   ├── stores/          # Zustand stores (client-side)
│   ├── types/           # Shared TypeScript types
│   └── utils/           # Shared utilities
├── routes/
│   ├── api/             # API routes (file-based)
│   └── ...              # Page routes (file-based)
├── env/
│   └── server.ts        # Environment variable validation
└── styles.css           # Global styles (Tailwind)
```

## Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| Schema files | `kebab-case.schema.ts` | `listening-history.schema.ts` |
| DB columns | `snake_case` (via Drizzle `casing`) | `user_id`, `created_at` |
| DB tables | `snake_case` | `user_playlists`, `playback_sessions` |
| Services | `kebab-case.ts` | `compound-scoring.ts` |
| Stores | `kebab-case.ts` | `audio.ts`, `preferences.ts` |
| Hooks | `camelCase.ts` with `use` prefix | `useCrossfade.ts` |
| Components | `PascalCase.tsx` | `PlayerBar.tsx` |
| API routes | `kebab-case.ts` or `$param.ts` | `liked-songs/sync.ts`, `$id.ts` |
| Types | `PascalCase` | `Song`, `SubsonicCreds` |

## Import Aliases

```ts
import { useAudioStore } from '@/lib/stores/audio';     // @/ → src/
import { env } from '~/env/server';                       // ~/ → src/
```

Configured in `tsconfig.json` paths and Vite `resolve.alias`.

## API Route Pattern

### Standard: `withAuthAndErrorHandling`

```ts
import { createFileRoute } from "@tanstack/react-router";
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
} from '../../lib/utils/api-response';

const POST = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const body = await request.json();
    // session.user.id is guaranteed available
    // ... business logic
    return successResponse(result);
  },
  {
    service: 'my-service',
    operation: 'my-operation',
    defaultCode: 'MY_ERROR_CODE',
    defaultMessage: 'Failed to do something',
  }
);

export const Route = createFileRoute("/api/my-route")({
  server: {
    handlers: { POST },
  },
});
```

### Manual auth (when `withAuthAndErrorHandling` doesn't fit)

```ts
const session = await auth.api.getSession({
  headers: request.headers,
  query: { disableCookieCache: true },
});
if (!session) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

## Response Helpers

| Helper | Status | Usage |
|--------|--------|-------|
| `successResponse(data)` | 200 | `{ data: ... }` |
| `jsonResponse(body, status)` | any | Raw JSON response |
| `errorResponse(code, message, opts?)` | auto from code | `{ code, message }` |
| `unauthorizedResponse()` | 401 | Auth failures |
| `validationErrorResponse(zodError)` | 400 | Zod validation failures |
| `notFoundResponse()` | 404 | Missing resources |
| `serviceUnavailableResponse(code, msg)` | 503 | External service down |

## Zustand Store Pattern

```ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface MyState {
  items: string[];
  addItem: (item: string) => void;
}

export const useMyStore = create<MyState>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (item) => set({ items: [...get().items, item] }),
    }),
    {
      name: 'my-storage',  // localStorage key
      storage: createJSONStorage(() => localStorage),
    }
  )
);
```

For `Set`/`Map` types, use custom `replacer`/`reviver` in `createJSONStorage` (see `audio.ts` for example).

## DB Schema Pattern

```ts
import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";

export const myTable = pgTable("my_table", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").$defaultFn(() => new Date()).notNull(),
});

export type MyTable = typeof myTable.$inferSelect;
export type MyTableInsert = typeof myTable.$inferInsert;
```

Always re-export from `src/lib/db/schema/index.ts`:

```ts
export * from './my-table.schema';
```

## Error Handling

### In API routes

Use the `withAuthAndErrorHandling` wrapper which automatically catches:
- `z.ZodError` → 400 validation error response
- `ServiceError` → mapped status code from error code
- `Error` → 500 with error message
- Unknown → 500 with default message

### In services

Throw `ServiceError` for expected errors:

```ts
import { ServiceError } from '@/lib/utils';

throw new ServiceError('NAVIDROME_NOT_CONFIGURED', 'Navidrome URL not set');
```

For non-critical failures, catch and log without throwing:

```ts
try {
  await syncToNavidrome();
} catch (error) {
  console.error('Sync failed (non-blocking):', error);
}
```

## Input Validation

Use Zod schemas for all API input:

```ts
import { z } from 'zod';

const MySchema = z.object({
  name: z.string().min(1),
  count: z.number().int().positive().optional(),
  type: z.enum(['a', 'b', 'c']),
});

// In handler:
const validatedData = MySchema.parse(body);
```

Zod errors are automatically caught by `withAuthAndErrorHandling` and returned as 400 with issue details.

## LLM Provider Pattern

Each provider in `src/lib/services/llm/providers/` implements:

```ts
interface LLMProvider {
  generate(prompt: string, options?: {
    temperature?: number;
    maxTokens?: number;
    timeout?: number;
  }): Promise<string>;
}
```

Use via factory: `const provider = createLLMProvider();`

## UI Components

- Base: shadcn/ui components in `src/components/ui/` (Radix primitives + Tailwind)
- Styling: Tailwind CSS 4, use `cn()` utility for class merging
- Icons: Lucide React
- Toasts: `sonner` library (`toast.success()`, `toast.error()`)

```tsx
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
```

## Testing

- **Unit tests**: Vitest (`npm test`)
  - Test files: `*.test.ts` co-located with source or in `__tests__/`
  - Pattern: `describe` → `it` → `expect`
- **E2E tests**: Playwright (`npm run test:e2e`)
- Service tests exist for: `recommendation-analytics`, `compound-scoring`, `seasonal-patterns`, `preferences`, `listening-history`, `playlist-sync`, `library-profile`

## TypeScript Config

- `"type": "module"` in `package.json` — ESM only, no `require()`
- Strict mode enabled
- Path aliases: `~/` → `src/`, `@/` → `src/` (both equivalent)

## PWA / Offline

- Service worker: `public/sw.js` (hand-written, not Workbox)
  - Caches static assets and API responses
  - Offline fallback page
- IndexedDB adapters: `src/lib/services/offline/`
  - Queue operations for offline playback
  - Sync when back online
- `useOfflineStatus` hook: tracks online/offline state
- `useServiceWorker` hook: handles SW registration and updates

## Code Splitting

- Page routes are lazy-loaded via TanStack Router
- Heavy services use dynamic `import()`:
  ```ts
  const { filterExplicitSongs } = await import('../../lib/services/explicit-content');
  ```
- Server-only code must never be imported in client bundles

## Configuration

### Do

- Use `getConfig()` or `getConfigAsync()` for all service URLs
- Use env vars for secrets (never hardcode)
- Use feature flags for experimental features
- Store per-user settings in `user_preferences` table

### Do Not

- Do NOT import `db` or services directly in client-side components
- Do NOT hardcode Navidrome URLs
- Do NOT use `require()` (ESM-only)
- Do NOT skip session auth checks in API routes
- Do NOT add schema files without re-exporting from `schema/index.ts`
- Do NOT use Subsonic `createUser` endpoint (not implemented in Navidrome)
- Do NOT modify `audio.ts` without understanding dual-deck + AI DJ + sync interactions
