<!-- Generated: 2026-02-15 -->

# Code Patterns and Conventions Reference

## File Organization

```
src/
  components/    # React components, grouped by feature (~17 subdirectories)
    ui/          # Shared primitives (button, dialog, tabs, skeleton -- shadcn/ui)
    layout/      # AppLayout, PlayerBar, mobile-nav
    dashboard/   # Dashboard sections (DJFeatures, MoreFeatures, etc.)
    playlists/   # Playlist management (CRUD, import/export, collaboration)
    discovery/   # Discovery queue and suggestions panels
    landing/     # Landing page sections
    visualizer/  # Audio visualizer variants
    music-identity/  # Music Wrapped cards
    recommendations/ # Preference and seasonal insights
  lib/
    auth/        # better-auth setup (auth.ts, auth-client.ts)
    config/      # Runtime config (config.ts, defaults.json, features.ts)
    db/schema/   # Drizzle table definitions (18 *.schema.ts, index.ts re-exports)
    hooks/       # React hooks (11 files)
    services/    # Server-side services (60+ files)
      llm/       # LLM factory (ollama/openrouter/glm/anthropic)
      offline/   # IndexedDB adapters, sync queue
    stores/      # Zustand stores (7 files)
    types/       # TypeScript type definitions
    utils/       # Utility functions (cn, ServiceError, api-response)
  routes/
    api/         # API routes (file-based, ~100+ handler files)
    (auth)/      # Auth pages (login, signup)
    dashboard/   # Dashboard pages
    dj/          # DJ mode pages
    library/     # Library browser pages
    playlists/   # Playlist pages
    settings/    # Settings pages
```

### Naming Conventions

**Do**: Use `PascalCase.tsx` for React components, `kebab-case.ts` for utilities/hooks.
**Don't**: Mix casing within a category. UI primitives from shadcn/ui use kebab-case; feature components use PascalCase.

```
src/components/dashboard/DJFeatures.tsx     # PascalCase component
src/components/ui/queue-panel.tsx            # kebab-case UI primitive
src/lib/hooks/useMediaSession.ts             # camelCase hook
src/lib/stores/discovery-feed.ts             # kebab-case store
```

---

## Import Aliases

Both `~/` and `@/` resolve to `src/`. Configured in `tsconfig.json`, resolved by `vite-tsconfig-paths`.

| Alias | Usage |
|-------|-------|
| `~/`  | Server code, route files, UI primitives |
| `@/`  | Shared/client code, stores, hooks, services |

```typescript
// DO
import { auth } from '~/lib/auth/auth';
import { useAudioStore } from '@/lib/stores/audio';

// DON'T: deep relative paths
import { auth } from '../../../lib/auth/auth';
```

---

## API Route Pattern

All API routes use TanStack Start `createFileRoute` with `server.handlers`.

### Preferred: `withAuthAndErrorHandling` wrapper

```typescript
import { createFileRoute } from '@tanstack/react-router';
import {
  withAuthAndErrorHandling, successResponse, errorResponse,
} from '../../lib/utils/api-response';

const GET = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const userId = session.user.id;  // session guaranteed valid
    const url = new URL(request.url);
    const param = url.searchParams.get('param');
    const data = await someService(userId);
    return successResponse(data);
  },
  {
    service: 'my-service',
    operation: 'fetch',
    defaultCode: 'MY_SERVICE_ERROR',
    defaultMessage: 'Failed to fetch data',
  }
);

export const Route = createFileRoute('/api/some-endpoint')({
  server: { handlers: { GET } },
});
```

The wrapper auto-handles: auth (401), `z.ZodError` (400), `ServiceError` (mapped status), generic errors (500).

### Rules

**Do**:
- Always check auth first (or use `withAuthAndErrorHandling`)
- Return `Response` objects; use `successResponse()` / `errorResponse()` helpers
- Use `new URL(request.url).searchParams` for query params
- Export handler functions (`export const GET = ...`) for testability
- Use Zod schemas for POST/PUT body validation

**Don't**:
- Return plain objects (must be `Response`)
- Use `req.query` (use URL search params instead)
- Skip auth checks on protected endpoints

### Standard Error Codes

Mapped automatically by `getStatusForErrorCode()`:

| Status | Codes |
|--------|-------|
| 400 | `VALIDATION_ERROR`, `INVALID_INPUT`, `MISSING_REQUIRED_FIELD` |
| 401 | `UNAUTHORIZED`, `AUTHENTICATION_ERROR` |
| 404 | `NOT_FOUND`, `RESOURCE_NOT_FOUND` |
| 409 | `DUPLICATE_FEEDBACK`, `DUPLICATE_PLAYLIST_NAME`, `CONFLICT` |
| 429 | `RATE_LIMIT_ERROR` |
| 503 | `SERVICE_UNAVAILABLE`, `NAVIDROME_NOT_CONFIGURED` |
| 500 | `GENERAL_API_ERROR`, `INTERNAL_ERROR` |

---

## Zustand Store Pattern

All stores use `create` with `persist` middleware.

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SomeState {
  items: Item[];
  isLoading: boolean;
  setItems: (items: Item[]) => void;
}

export const useSomeStore = create<SomeState>()(
  persist(
    (set) => ({
      items: [],
      isLoading: false,
      setItems: (items) => set({ items }),
    }),
    {
      name: 'some-store',  // localStorage key
      partialize: (state) => ({ items: state.items }),  // exclude transient state
    }
  )
);
```

For `Set`/`Map` types (used in `audio.ts`), add custom `createJSONStorage` with `replacer`/`reviver` that serialize via `{ __type: 'Set', values: [...] }` / `{ __type: 'Map', entries: [...] }`.

**Do**: Use `persist` + `partialize` to exclude loading/error state from persistence.
**Don't**: Persist transient state. Forget `Set`/`Map` serialization. Store server-only data in client stores.

---

## Database Schema Pattern (Drizzle ORM)

```typescript
// src/lib/db/schema/some-table.schema.ts
import { pgTable, text, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { user } from './auth.schema';

export const someTable = pgTable('some_table', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  data: text('data').notNull(),
  createdAt: timestamp('created_at').$defaultFn(() => new Date()).notNull(),
}, (table) => ({
  userIdIdx: index('some_table_user_id_idx').on(table.userId),
}));

export type SomeTable = typeof someTable.$inferSelect;
export type SomeTableInsert = typeof someTable.$inferInsert;
```

**Do**:
- `snake_case` for column/table names; UUID text PKs via `crypto.randomUUID()`
- Foreign keys with `onDelete: 'cascade'`; indexes on FK and query columns
- Export `$inferSelect` and `$inferInsert` types
- Register every schema in `src/lib/db/schema/index.ts`

**Don't**: Use auto-increment PKs. Forget to add to `schema/index.ts`. Use camelCase in column name strings.

---

## Error Handling

### ServiceError

Defined in `src/lib/utils.ts`. Properties: `code`, `message`, `details`.

```typescript
import { ServiceError } from '~/lib/utils';
throw new ServiceError('PROVIDER_CONFIG_ERROR', 'Provider not configured', { provider: 'ollama' });
```

### Client-Side Errors

Use `sonner` toast library (used across 48+ files):

```typescript
import { toast } from 'sonner';
toast.error('Failed to load recommendations');
```

**Do**: Use `toast` for user-facing errors. Use `ServiceError` in services.
**Don't**: Use `alert()` or raw `console.error()` for user-facing messages.

---

## Input Validation

Use Zod schemas for API input. ZodErrors are auto-caught by `withErrorHandling` wrappers.

```typescript
import { z } from 'zod';

const FeedbackSchema = z.object({
  songArtistTitle: z.string().min(1, 'Required'),
  feedbackType: z.enum(['thumbs_up', 'thumbs_down']),
  source: z.enum(['recommendation', 'playlist', 'ai_dj']).optional().default('recommendation'),
});

// In handler:
const validated = FeedbackSchema.parse(await request.json());
```

**Do**: Define Zod schemas for all body validation. Let wrappers handle ZodErrors.
**Don't**: Manually validate with if/else chains.

---

## React Hooks

All hooks live in `src/lib/hooks/` and follow `use<Feature>` naming.

```typescript
export interface UseSomeFeatureOptions {
  enabled: boolean;
  onEvent: () => void;
}

export function useSomeFeature({ enabled, onEvent }: UseSomeFeatureOptions) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!enabled) return;
    // setup
    return () => { /* cleanup */ };
  }, [enabled]);
  return { ref };
}
```

**Do**: Accept typed options interface. Return object. Clean up effects.
**Don't**: Place hooks in `components/` -- they belong in `lib/hooks/`.

---

## LLM Provider Pattern

Factory pattern in `src/lib/services/llm/factory.ts`. All providers implement `LLMProvider` interface.

```typescript
import { createLLMProvider } from '@/lib/services/llm/factory';

const provider = createLLMProvider('ollama'); // 'openrouter' | 'glm' | 'anthropic'
const response = await provider.generate({ model: 'llama3', prompt: '...', temperature: 0.7 });
```

**Do**: Use `createLLMProvider()` factory. Check `isConfigured()` before use.
**Don't**: Instantiate provider classes directly outside the factory.

---

## Configuration

### Runtime Config

Loads from `db/config.json`, then env vars override. Use `getConfigAsync()` in async contexts.

```typescript
import { getConfig, getConfigAsync } from '@/lib/config/config';
const config = await getConfigAsync();  // ensures file config is loaded
```

### Feature Flags

```typescript
import { isFeatureEnabled } from '@/lib/config/features';
if (isFeatureEnabled('hlsStreaming')) { /* ... */ }
```

Flags load from env vars (server) or localStorage (client).

**Do**: Use `isFeatureEnabled()` for checks. Use flags for phased rollouts.
**Don't**: Hard-code feature toggles in component logic.

---

## UI Components

### shadcn/ui Primitives

UI primitives in `src/components/ui/` use `cva` for variants and `cn()` for class merging.

```typescript
import { cn } from '~/lib/utils';
import { cva } from 'class-variance-authority';

const variants = cva('base-classes', {
  variants: { variant: { default: '...', destructive: '...' } },
  defaultVariants: { variant: 'default' },
});
```

### Styling

- Tailwind CSS v4 via `@tailwindcss/vite`; dark mode via CSS variables
- `cn()` wraps `clsx` + `tailwind-merge` for deduplication
- Safe area insets via `env(safe-area-inset-*)` for mobile

**Do**: Use `cn()` for conditional classes. Use `cva` for variants.
**Don't**: Use inline string concatenation for classNames.

---

## Testing

| Command | Tool | Scope |
|---------|------|-------|
| `npm test` | Vitest (watch) | Unit tests: `src/**/*.test.{ts,tsx}` |
| `npm run test:coverage` | Vitest + Istanbul | Coverage report |
| `npm run test:e2e` | Playwright | E2E: `tests/e2e/` |

Test setup (`src/test/setup.ts`) mocks: `@t3-oss/env-core`, `ResizeObserver`, Web Audio API.

**Do**: Co-locate tests with source (`__tests__/` or adjacent `.test.ts`). Use `vi.mock()`.
**Don't**: Skip env validation mocks. Import server-only code in component tests.

---

## Offline / PWA

- **IndexedDB adapters** (`lib/services/offline/indexed-db.ts`): client-side caching
- **Offline adapters** (`offline-adapters.ts`): fetch with IndexedDB fallback
- **Sync queue** (`sync-queue.ts`): queues mutations offline, replays on reconnect
- **useOfflineStatus hook**: detects connectivity, triggers sync replay
- **Service Worker** (`public/sw.js`): caches static assets
- **iOS specifics**: AudioContext priming on first interaction, `wasPlayingBeforeUnload` for screen lock recovery, visibility change handling

---

## Code Splitting

Configured in `vite.config.ts` `manualChunks`:

| Chunk | Contents |
|-------|----------|
| `vendor-react` | react, react-dom |
| `vendor-tanstack` | react-query, react-router |
| `vendor-zustand` | zustand |
| `vendor-radix` | @radix-ui/* |
| `vendor-icons` | lucide-react |
| `dashboard-features` | DJFeatures, MoreFeatures (lazy) |
| `dj-components` | mix-compatibility-badges (lazy) |
| `analytics-components` | PreferenceInsights (lazy) |
| `discovery-components` | DiscoveryQueuePanel (lazy) |

**Do**: Add large feature components to lazy chunks.
**Don't**: Put shared primitives in lazy chunks.

---

## React Compiler

`babel-plugin-react-compiler` with React 19 target provides automatic memoization.

**Do**: Write idiomatic React. The compiler handles `useMemo`/`useCallback`.
**Don't**: Manually wrap everything in memo hooks.

---

## TypeScript

Strict mode enabled. Target ES2022. Module ESNext with Bundler resolution.

**Do**: Use `crypto.randomUUID()`, optional chaining, nullish coalescing.
**Don't**: Disable strict checks. Use CommonJS require in source files.

---

## Quick Reference

| Pattern | Do | Don't |
|---------|-----|-------|
| API auth | `withAuthAndErrorHandling` | Skip auth on protected routes |
| API response | `successResponse()` / `errorResponse()` | Return plain objects |
| Query params | `new URL(request.url).searchParams` | `req.query` |
| State | Zustand + persist + partialize | Persist loading/error state |
| DB columns | `snake_case` column names | camelCase in column strings |
| DB PKs | UUID via `crypto.randomUUID()` | Auto-increment integers |
| Schema | Add to `schema/index.ts` | Orphan schema files |
| Errors (client) | `toast()` from sonner | `alert()` or raw console |
| Styling | `cn()` + Tailwind | Inline style objects |
| Memoization | Let React Compiler handle it | Manual useMemo everywhere |
| Imports | `@/` or `~/` aliases | Deep relative paths |
| Tests | Co-locate with source | Separate test directories |
| Validation | Zod schemas | if/else validation chains |
