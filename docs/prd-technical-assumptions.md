# Music Recommendation and Download Interface Product Requirements Document (PRD) - Technical Assumptions

## Repository Structure

Monorepo

## Service Architecture

Monolith within a Monorepo - Single deployable application that handles all functionality

## Testing Requirements

Unit + Integration testing - Comprehensive unit tests for all components with integration tests for API interactions

## Additional Technical Assumptions and Requests

- Frontend and backend will be built using TanStack Start, a modern full-stack React framework with SSR capabilities
- Authentication will be handled by Better Auth, providing secure session management and user registration
- Database interactions will use Drizzle ORM with SQLite for type-safe local storage of user preferences and settings
- Docker containerization for easy deployment and distribution
- File-based routing system provided by TanStack Start
- Implementation of proper error handling and logging throughout the application
- Use of environment variables for configuration management
- Implementation of a responsive design that works well on both desktop and mobile devices
- API routes within TanStack Start for service integrations with Ollama, Navidrome, and Lidarr