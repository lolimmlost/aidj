# Music Recommendation and Download Interface Product Requirements Document (PRD) - Technical Assumptions

## Repository Structure

Monorepo structure with:

- Frontend code in `/src` directory
- Backend code in `/src/server` directory
- Shared utilities in `/src/lib` directory
  All packages share a single package.json at repository root for dependency management and testing workflows.

- **Path Resolution Standards**: Use absolute imports with path mapping `@/*` resolving to `/src/*` in tsconfig.json. All import paths must be relative to /src root. Relative imports (e.g., '../components') should be replaced with absolute (`@/components`). This ensures compliance with monorepo structure and avoids breaking changes during refactoring.

## Service Architecture

## Monorepo Structure Clarification
The monorepo enforces a single /src directory for all frontend and backend code, eliminating sub-app directories like apps/web/src. This simplifies deployment, path resolution, and maintenance. Backend routes and API handlers are in /src/routes/api, frontend UI in /src/routes and /src/components. Shared logic in /src/lib. Docker volumes must map to root .:/app for unified build context.

Monolith within a Monorepo - Single deployable application that handles all functionality. Database interactions will be abstracted through Drizzle ORM but database itself will be deployed on a separate LAN machine with read-only frontend access.

## Testing Requirements

Unit + Integration testing - Comprehensive unit tests for all components with integration tests for API interactions. Frontend testing will use Vitest with Playwright for end-to-end testing.

## Additional Technical Assumptions and Requests

- Frontend and backend will be built using TanStack Start with full-stack capabilities
- Authentication handled by Better Auth with encrypted session storage
- Database interactions use Drizzle ORM with SQLite for local storage of user preferences and settings
- Docker containerization for deployment with explicit networking configuration using root-level volume mapping
- File-based routing system from TanStack Start with routing structure documented in `docs/routing-structure.md`
- Implementation of environment variables for configuration management using standardized path resolution
- File-based routing system from TanStack Start with routing structure documented in `docs/routing-structure.md`
- Implementation of environment variables for configuration management
- API routes within TanStack Start for service integrations
- Encryption strategy for sensitive data using AES-256 for stored credentials
- Standardized error handling patterns across all service integrations
- Request retry logic with exponential backoff for failed API calls
- Service connection timeout specifications (5s for local services)
- Theme implementation using CSS variables for color scheme and typography
- Mobile-specific performance optimizations including lazy loading and caching
