# AIDJ - AI-Assisted Music Library Fullstack Architecture Document

## Introduction

This document outlines the fullstack architecture for AIDJ, focusing on implemented features: user authentication, service configuration, dashboard, and Navidrome music library integration with streaming. Planned: AI recommendations via Ollama. It serves as the single source of truth for development.

This unified approach combines what would traditionally be separate backend and frontend architecture documents, streamlining the development process for modern fullstack applications where these concerns are increasingly intertwined.

### Starter Template or Existing Project

The project uses Vite with TanStack Router for client-side routing, Better Auth for authentication, and Drizzle ORM with PostgreSQL for data storage. This setup provides a modern React/TypeScript frontend with API routes for server-side logic.

### Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2025-09-06 | 1.0 | Initial architecture document | Architect |

## High Level Architecture

### Technical Summary

The architecture is a single-package app with Vite for building. Frontend uses React 19, TypeScript, TanStack Router for file-based routing. API routes in src/routes/api/ handle Navidrome proxying and streaming. Authentication via Better Auth with PostgreSQL. Planned integrations: Ollama for AI. Runs locally via Vite dev server.

### Platform and Infrastructure Choice

**Platform:** Local development/self-hosted
**Key Services:**
- Vite + TanStack Router for frontend/routing
- Better Auth for authentication
- Drizzle ORM with PostgreSQL
- Navidrome for music library/streaming
**Deployment:** Vite dev server (npm run dev)

### Repository Structure

**Structure:** Single package
**Package Organization:**
- src/ - App code
- src/lib/ - Utils, auth, db, services, stores
- src/routes/ - File-based routes (pages + API)
- src/components/ - UI components (shadcn/ui)

### High Level Architecture Diagram
```mermaid
graph TD
    A[User Browser] --> B[Vite + TanStack Router App]
    B --> C[Better Auth]
    B --> D[Drizzle ORM]
    D --> E[PostgreSQL Database]
    B --> G[Navidrome API]
    B --> F[Ollama API (Planned)]
    B --> I[Docker (Optional)]
```

### Architectural Patterns

- **Client-Side Rendering:** Vite-built React app with TanStack Router - _Rationale:_ Fast development and hot reload
- **Component-Based UI:** shadcn/ui + Tailwind for reusable components - _Rationale:_ Consistent, accessible design
- **Repository Pattern:** Drizzle ORM for DB access - _Rationale:_ Type-safe queries
- **Proxy API Pattern:** API routes proxy Navidrome requests - _Rationale:_ Secure integration, CORS handling

## Tech Stack

### Technology Stack Table
| Category | Technology | Version | Purpose | Rationale |
|----------|------------|---------|---------|-----------|
| Frontend Language | TypeScript | 5.x | Type-safe JS | Developer experience |
| Frontend Framework | React 19 + TanStack Router | Latest | UI + Routing | Modern, type-safe routing |
| UI Library | shadcn/ui + Tailwind CSS v4 | Latest | Components + Styling | Accessible, customizable UI |
| State Management | TanStack Query + Zustand | Latest | Data + Local state | Efficient caching and reactivity |
| Backend Language | TypeScript | 5.x | Server-side logic | Consistency |
| Backend Framework | Vite API Routes | Latest | API endpoints | Simple server functions |
| API Style | REST/Proxy | N/A | Service integration | Navidrome compatibility |
| Database | PostgreSQL | Latest | User data storage | Robust, scalable |
| Cache | TanStack Query | N/A | API caching | Built-in optimism |
| File Storage | Navidrome | N/A | Music streaming | External service |
| Authentication | Better Auth | Latest | User auth | Secure sessions |
| Frontend Testing | Vitest + React Testing Library | Latest | Frontend unit and integration testing | Built-in TanStack Start testing support |
| Backend Testing | Vitest | Latest | Backend unit and integration testing | Consistent testing framework across stack |
| E2E Testing | Playwright | Latest | End-to-end testing | Comprehensive browser automation |
| Build Tool | Vite | Latest | Fast builds | Built-in TanStack Start support |
| Bundler | Vite | Latest | Module bundling | Built-in TanStack Start support |
| IaC Tool | Docker | Latest | Containerization | Simple deployment for local applications |
| CI/CD | GitHub Actions | Latest | Automated testing and deployment | Integrated with GitHub repositories |
| Monitoring | None | N/A | Application monitoring | Not required for local application |
| Logging | Pino | Latest | Structured logging | Fast, lightweight logging solution |
| CSS Framework | Tailwind CSS | 3.x | Utility-first styling | Rapid UI development with consistent design |

## Data Models

### User
**Purpose:** Authenticated user

**Key Attributes:**
- id: string
- email: string
- name: string
- createdAt: Date

```typescript
interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}
```

**Relationships:**
- One-to-one with UserConfig (planned)

### UserConfig
**Purpose:** User-specific settings (planned)

**Key Attributes:**
- id: string
- userId: string
- navidromeCredentials: JSON
- playbackSettings: JSON

```typescript
interface UserConfig {
  id: string;
  userId: string;
  navidromeCredentials?: Record<string, any>;
  playbackSettings?: Record<string, any>;
}
```

**Relationships:**
- Many-to-one with User

### Playlist (Planned)
**Purpose:** User-saved playlists

**Key Attributes:**
- id: string
- userId: string
- name: string
- tracks: string[] (Navidrome IDs)

```typescript
interface Playlist {
  id: string;
  userId: string;
  name: string;
  tracks: string[];
  createdAt: Date;
}
```

**Relationships:**
- Many-to-one with User

## API Specification

### Current API Specification
Current implemented endpoints focus on auth and Navidrome proxying. Planned: recommendations.

Key endpoints:
- `POST /api/auth/login` - User login
- `GET /api/navidrome/[...path]` - Proxy Navidrome API (artists, albums, songs)
- `GET /api/navidrome/stream/$id` - Stream audio
- Planned: `GET /api/recommendations` - AI recs via Ollama

All API routes use TanStack Router file-based convention in src/routes/api/.

## Components

### Frontend Components

**Responsibility:** UI for auth, dashboard, config, library browsing, audio playback

**Key Interfaces:**
- React components (shadcn/ui)
- TanStack Query for Navidrome data
- Audio store for playback

**Dependencies:**
- React 19, TanStack Router
- Tailwind CSS v4
- TanStack Query v5

**Technology Stack:**
- React/TypeScript
- File-based routing
- Tailwind + shadcn/ui
- Zustand for audio state

### Backend API Routes

**Responsibility:** API routes for auth, Navidrome proxy/streaming

**Key Interfaces:**
- Proxy endpoints for Navidrome
- Auth handlers
- Streaming responses

**Dependencies:**
- TanStack Router API routes
- Better Auth
- Drizzle ORM (Postgres)
- Navidrome service

**Technology Stack:**
- Vite server functions
- Better Auth
- Drizzle/Postgres
- Fetch for proxying

### Authentication Service

**Responsibility:** User auth and sessions

**Key Interfaces:**
- Login/signup endpoints
- Session middleware

**Dependencies:**
- Better Auth
- Postgres DB

**Technology Stack:**
- Better Auth
- Drizzle ORM

### Recommendation Service

**Responsibility:** Ollama integration (planned)

**Key Interfaces:**
- Generate recs endpoint

**Dependencies:**
- Ollama local API

**Technology Stack:**
- Fetch/Axios

### Library Service

**Responsibility:** Navidrome integration for library and streaming

**Key Interfaces:**
- Proxy API calls (artists/albums/songs)
- Auth token management
- Audio streaming

**Dependencies:**
- Navidrome API
- User config

**Technology Stack:**
- HTTP proxying
- ReadableStream for audio

### Download Service

**Responsibility:** Audio Store (Zustand)

**Key Interfaces:**
- Playback state management
- Track queue
- Volume control

**Dependencies:**
- HTML5 Audio API
- Navidrome streams

**Technology Stack:**
- Zustand store
- Event listeners

## External APIs

### Navidrome API
- **Purpose:** Music library access and streaming
- **Documentation:** https://www.navidrome.org/docs/developer/api/
- **Base URL:** Configurable (default: http://localhost:4533)
- **Authentication:** Token-based (user-specific)

**Key Endpoints Used:**
- `POST /api/v1/auth/login` - Get token
- `GET /api/v1/artists` - List artists
- `GET /api/v1/albums` - List albums
- `GET /api/v1/songs` - List songs
- `GET /api/v1/stream/{id}` - Stream track

**Integration Notes:**
- Proxy via app API to handle auth/CORS
- Cache metadata, stream directly
- Handle token refresh

### Ollama API (Planned)
- **Purpose:** AI music recommendations
- **Documentation:** https://ollama.com/docs
- **Base URL:** http://localhost:11434
- **Authentication:** None (local)

**Key Endpoints Used:**
- `POST /api/generate` - Prompt for recs

**Integration Notes:**
- Format music-specific prompts
- Cache responses
- Model selection

### Database (PostgreSQL)
- **Purpose:** User auth and config storage
- **Connection:** Via Drizzle ORM
- **Schema:** src/lib/db/schema/

**Tables:**
- users (from Better Auth)
- Planned: user_configs for service creds

## Core Workflows

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant B as Backend/API
    participant N as Navidrome
    participant DB as PostgreSQL

    U->>F: Login
    F->>B: POST /api/auth/login
    B->>DB: Validate via Better Auth
    DB-->>B: User session
    B-->>F: Token
    F-->>U: Dashboard

    U->>F: Browse artists
    F->>B: GET /api/navidrome/artists
    B->>N: Proxy GET /api/v1/artists (with token)
    N-->>B: Artist list
    B-->>F: Data
    F-->>U: Display artists

    U->>F: Play song
    F->>B: GET /api/navidrome/stream/{id}
    B->>N: Proxy stream (with auth)
    N-->>B: Audio stream
    B-->>F: Stream response
    F->>U: Play in audio player

    Note over U,F: Planned: AI recs flow with Ollama
```

## Database Schema

```sql
-- Better Auth manages users table automatically
-- src/lib/db/schema/auth.schema.ts

CREATE TABLE user_configs (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    navidrome_token TEXT,
    playback_volume INTEGER DEFAULT 50,
    theme_mode TEXT DEFAULT 'dark',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE INDEX idx_user_configs_user_id ON user_configs(user_id);
```

## Frontend Architecture

### Component Architecture

#### Component Organization
```
src/
├── components/
│   ├── ui/               # shadcn/ui components (button, card, etc.)
│   └── (custom: audio-player, theme-toggle)
├── lib/
│   ├── stores/           # Zustand stores (audio.ts)
│   ├── services/         # Navidrome service
│   └── utils.ts
├── routes/               # TanStack Router
│   ├── dashboard/
│   ├── library/          # artists, search, [id]/albums
│   ├── config/
│   └── api/              # navidrome proxy, auth
└── styles.css            # Tailwind
```

#### Component Template
```typescript
import { ComponentProps } from 'react';

interface Props extends ComponentProps<'div'> {
  // Component-specific props
}

export function MyComponent({ children, ...props }: Props) {
  return (
    <div {...props}>
      {children}
    </div>
  );
}
```

### State Management Architecture

#### State Structure
```typescript
interface AppState {
  auth: {
    user: User | null;
    isAuthenticated: boolean;
  };
  music: {
    currentTrack: Track | null;
    isPlaying: boolean;
    volume: number;
  };
  downloads: {
    requests: DownloadRequest[];
    isLoading: boolean;
  };
}
```

#### State Management Patterns
- Use TanStack Query for server state
- Use component local state for UI state
- Lift state up when needed by multiple components

### Routing Architecture

#### Route Organization
```
src/routes/
├── __root.tsx            # Root layout with theme/audio bar
├── index.tsx             # Landing/redirect to dashboard
├── (auth)/               # login.tsx, signup.tsx
├── dashboard/            # index.tsx - Overview
├── config.tsx            # Service config
├── library/              # artists.tsx, search.tsx, artists/[id].tsx + albums/[albumId].tsx
└── api/                  # auth/, navidrome/[...path].ts, stream/$id.ts
```

#### Protected Route Pattern
```typescript
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/protected')({
  beforeLoad: ({ context }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({
        to: '/login',
        search: {
          redirect: location.href,
        }
      });
    }
  },
  component: ProtectedComponent,
});
```

### Frontend Services Layer

#### API Client Setup
```typescript
import axios from 'axios';

const apiClient = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default apiClient;
```

#### Service Example
```typescript
import apiClient from './apiClient';

export const recommendationService = {
  getRecommendations: async (limit = 10) => {
    const response = await apiClient.get('/recommendations', {
      params: { limit }
    });
    return response.data;
  }
};
```

## Backend Architecture

### API Routes Architecture

#### Route Organization
```
src/routes/api/
├── auth/                 # login.ts, register.ts (Better Auth)
├── navidrome/            # [...path].ts (proxy), stream/$id.ts
└── config.ts             # User service config (planned)
```

##### Controller Template
```typescript
import { json, type RequestHandler } from '@tanstack/start';
import { z } from 'zod';
import { getRecommendations } from '~/services/ollama';

const recommendationSchema = z.object({
  limit: z.number().min(1).max(50).default(10),
});

export const GET: RequestHandler = async ({ request }) => {
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') || '10');
  
  try {
    const recommendations = await getRecommendations(limit);
    return json({ recommendations });
  } catch (error) {
    return json({ error: 'Failed to fetch recommendations' }, { status: 500 });
  }
};
```

### Database Architecture

#### Schema Design
```sql
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_preferences (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    recommendation_settings TEXT,
    playback_settings TEXT,
    download_settings TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE download_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    status TEXT NOT NULL,
    requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

#### Data Access Layer
```typescript
import { db } from '~/utils/database';
import { users, userPreferences, downloadRequests } from '~/models/schema';
import { eq } from 'drizzle-orm';

export const userRepo = {
  findById: async (id: string) => {
    return await db.select().from(users).where(eq(users.id, id)).get();
  },
  
  create: async (userData: typeof users.$inferInsert) => {
    return await db.insert(users).values(userData).returning().get();
  }
};

export const downloadRepo = {
  findByUserId: async (userId: string) => {
    return await db.select().from(downloadRequests).where(eq(downloadRequests.userId, userId)).all();
  },
  
  create: async (downloadData: typeof downloadRequests.$inferInsert) => {
    return await db.insert(downloadRequests).values(downloadData).returning().get();
  }
};
```

### Authentication and Authorization

#### Auth Flow
```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant B as Backend
    participant A as Better Auth

    U->>F: Submit login form
    F->>B: POST /auth/login
    B->>A: authenticate(credentials)
    A-->>B: Return user/session
    B->>B: Create session
    B-->>F: Return session token
    F->>F: Store token
    F-->>U: Redirect to dashboard
```

#### Middleware/Guards
```typescript
import { betterAuth } from 'better-auth';
import { getSession } from 'better-auth/api';

export async function authMiddleware(request: Request) {
  const session = await getSession(request, auth);
  
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  return { user: session.user };
}
```

## Unified Project Structure

```
aidj/
├── public/                    # favicon.ico
├── src/
│   ├── main.jsx               # Entry point
│   ├── router.tsx             # TanStack Router setup
│   ├── routeTree.gen.ts       # Generated routes
│   ├── components/            # UI (ui/ shadcn, audio-player)
│   ├── lib/                   # auth/, db/, config/, services/navidrome.ts, stores/audio.ts
│   ├── routes/                # File-based: __root, dashboard, library, config, api
│   └── styles.css             # Tailwind
├── db/                        # schema.ts, config.ts
├── docs/                      # Markdown docs
├── drizzle/                   # Meta/migrations
├── package.json
├── tsconfig.json
├── vite.config.ts
├── drizzle.config.ts
└── README.md
```

## Development Workflow

### Local Development

#### Prerequisites
- Node.js 18+
- PostgreSQL (local or Docker)
- Navidrome running

#### Setup
```bash
npm install
cp .env.example .env  # Edit with DB_URL, NAVIDROME_URL, etc.
npm run db:push       # Drizzle schema
npm run dev           # Vite server at localhost:3000
```

#### Development Commands
```bash
# Start dev server
npm run dev

# Run tests
npm run test

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint

# Format code
npm run format
```

### Environment Configuration

#### Environment Variables (.env)
```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/aidj

# Auth
BETTER_AUTH_SECRET=your-secret

# Services
NAVIDROME_URL=http://your-navidrome:4533
NAVIDROME_USER=admin
NAVIDROME_PASS=pass

# Planned
OLLAMA_URL=http://localhost:11434
```

## Deployment Architecture

### Deployment Strategy

**Deployment:**
- **Dev:** pnpm dev (localhost:3000)
- **Build:** pnpm build (dist/)
- **Serve:** pnpm preview or static host
- No separate backend; API routes bundled

### CI/CD Pipeline
```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run test

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run build
      - run: docker build -t music-interface .

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - run: docker run -d -p 3000:3000 music-interface
```

### Environments
| Environment | URL | Purpose |
|-------------|-----|---------|
| Development | http://localhost:3000 | Local dev |
| Production | http://your-ip:3000 | Self-hosted |

## Security and Performance

### Security

- Better Auth handles secure sessions/cookies
- API routes validate auth middleware
- Navidrome creds stored encrypted (planned)
- Input validation in API routes
- CORS configured for frontend only

### Performance Optimization

**Performance:**
- Vite HMR for fast dev
- TanStack Query caching for library data
- Lazy loading for routes/components
- Streaming for audio (no full download)
- Bundle optimization via Vite

## Testing Strategy

### Testing (Planned)
- Vitest for unit/integration
- Playwright for E2E
- Test auth flows, library loading, playback
- Mock Navidrome API for CI

#### Backend Tests
```
src/
├── routes/
│   └── __tests__/
├── services/
│   └── __tests__/
├── models/
│   └── __tests__/
└── utils/
    └── __tests__/
```

#### E2E Tests
```
tests/
├── auth/
├── library/
├── recommendations/
└── downloads/
```

### Test Examples

#### Frontend Component Test
```typescript
import { render, screen } from '@testing-library/react';
import { MusicPlayer } from './MusicPlayer';

describe('MusicPlayer', () => {
  it('renders play button when not playing', () => {
    render(<MusicPlayer isPlaying={false} />);
    expect(screen.getByLabelText('Play')).toBeInTheDocument();
  });
});
```

#### Backend API Test
```typescript
import { describe, it, expect } from 'vitest';
import { GET } from './recommendations';

describe('Recommendations API', () => {
  it('returns recommendations with default limit', async () => {
    const request = new Request('http://localhost:3000/api/recommendations');
    const response = await GET({ request });
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(Array.isArray(data.recommendations)).toBe(true);
  });
});
```

#### E2E Test
```typescript
import { test, expect } from '@playwright/test';

test('user can login and see dashboard', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name="email"]', 'test@example.com');
  await page.fill('input[name="password"]', 'password');
  await page.click('button[type="submit"]');
  
  await expect(page).toHaveURL('/dashboard');
  await expect(page.getByText('Recommendations')).toBeVisible();
});
```

## Coding Standards

### Critical Fullstack Rules
- **Type Sharing:** Always define types in packages/shared and import from there
- **API Calls:** Never make direct HTTP calls - use the service layer
- **Environment Variables:** Access only through config objects, never process.env directly
- **Error Handling:** All API routes must use the standard error handler
- **State Updates:** Never mutate state directly - use proper state management patterns

### Naming Conventions
| Element | Frontend | Backend | Example |
|---------|----------|---------|---------|
| Components | PascalCase | - | `UserProfile.tsx` |
| Hooks | camelCase with 'use' | - | `useAuth.ts` |
| API Routes | - | kebab-case | `/api/user-profile` |
| Database Tables | - | snake_case | `user_profiles` |

## Error Handling Strategy

### Error Flow
```mermaid
sequenceDiagram
    participant C as Client
    participant F as Frontend
    participant B as Backend
    participant S as Service

    C->>F: User action
    F->>B: API request
    B->>S: Service call
    S-->>B: Error response
    B->>B: Log error
    B-->>F: Standard error format
    F->>F: Display user-friendly message
    F-->>C: Show error UI
```

### Error Response Format
```typescript
interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
    timestamp: string;
    requestId: string;
  };
}
```

### Frontend Error Handling
```typescript
import { useQuery } from '@tanstack/react-query';

function useRecommendations() {
  return useQuery({
    queryKey: ['recommendations'],
    queryFn: () => fetch('/api/recommendations').then(res => res.json()),
    onError: (error) => {
      // Log error and show user-friendly message
      console.error('Failed to fetch recommendations:', error);
      // Show toast or other UI feedback
    }
  });
}
```

### Backend Error Handling
```typescript
import { json } from '@tanstack/start';

export function createError(code: string, message: string, status = 500) {
  return json({
    error: {
      code,
      message,
      timestamp: new Date().toISOString(),
      requestId: crypto.randomUUID()
    }
  }, { status });
}

// Usage in route handler
export const GET: RequestHandler = async () => {
  try {
    const recommendations = await getRecommendations();
    return json({ recommendations });
  } catch (error) {
    return createError('RECOMMENDATION_FAILED', 'Failed to fetch recommendations', 500);
  }
};
```

## Monitoring and Observability

### Monitoring Stack
- **Frontend Monitoring:** None (local application)
- **Backend Monitoring:** Pino logging
- **Error Tracking:** Console logging
- **Performance Monitoring:** None (local application)

### Key Metrics

**Frontend Metrics:**
- Core Web Vitals
- JavaScript errors
- API response times
- User interactions

**Backend Metrics:**
- Request rate
- Error rate
- Response time
- Database query performance

## Checklist Results Report
To be completed after architecture review and approval.