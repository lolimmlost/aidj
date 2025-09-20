# Music Recommendation and Download Interface Product Requirements Document (PRD) - Epic 1: Foundation & Core Infrastructure

## Epic Goal

Establish the foundational project structure, implement user authentication, and create the basic configuration system for connecting to local services. This epic will deliver a working application shell with secure access and the ability to configure connections to Ollama, Navidrome, and Lidarr services.

Root Source Folder Convention
- All frontend and backend source code for Epic 1 MUST reside under the /src directory at repository root. Import paths should be resolved relative to /src. Do not place business logic or components outside /src unless explicitly allowed for tooling or configuration.
- Database interactions will use Drizzle ORM with SQLite for local storage of user preferences and settings
- Docker containerization will include explicit networking configuration

## Story 1.1: Project Setup and Basic Structure

As a developer,
I want to set up the project with a monorepo structure containing frontend and backend components,
so that I can begin implementing the application features.

### Acceptance Criteria

- [x] 1. Create project repository with appropriate directory structure
- [x] 2. Set up package.json with project metadata and dependencies
- [x] 3. Configure ESLint and Prettier for code quality standards
- [x] 4. Set up basic Git configuration with initial commit
- [x] 5. Create README with project description and setup instructions

## Story 1.2: User Authentication System

As a user,
I want to securely log in to the application,
so that my preferences and settings are protected.

### Acceptance Criteria

- [x] 1. Implement user registration functionality with secure password storage
- [x] 2. Create login interface with username and password fields
- [x] 3. Implement session management with secure tokens
- [x] 4. Add logout functionality
- [x] 5. Create protected routes that require authentication
- [x] 6. Implement proper error handling for authentication failures

## Story 1.3: Service Configuration Interface

As a user,
I want to configure connections to my local Ollama, Navidrome, and Lidarr services,
so that the application can communicate with these services.

### Acceptance Criteria

- [x] 1. Create configuration screen with fields for service URLs and credentials
- [x] 2. Implement form validation for configuration inputs
- [x] 3. Store configuration securely in local storage or database
- [x] 4. Provide test connection functionality for each service
- [x] 5. Display connection status indicators for each service
- [x] 6. Implement proper error handling for configuration issues

## Story 1.4: Local Development Environment Setup

As a developer,
I want a reproducible local dev environment (containers, scripts) so that new contributors can start quickly.

### Acceptance Criteria

- [x] 1. Docker/compose configuration with explicit networking configuration
- [x] 2. Local environment variables documented and loaded securely
- [x] 3. npm/yarn install and startup scripts work out-of-the-box
- [x] 4. Developer README includes setup and run instructions
- [x] 5. Linting and formatting run on pre-commit or CI

Points: 3

## Story 1.5: Basic CI/CD Pipeline

As a development team, we want automated builds and basic tests on push to main, so that quality gates are enforced.

### Acceptance Criteria

- [x] 1. Basic CI workflow (build, lint, unit tests)
- [x] 2. Cache dependencies to speed up builds
- [x] 3. Reports and artifacts accessible from CI
- [x] 4. Documentation of CI/CD workflow in repo

### Completion Status
- [x] Completed: GitHub Actions workflow (main.yml) implements build, lint, and unit tests with Vitest.
- [x] Completed: pnpm caching configured in workflow for faster dependency installs.
- [x] Completed: Coverage reports uploaded to Codecov; security scans in GitHub Security tab; artifacts in Actions tab.
- [x] Completed: Workflow documented in .github/workflows/README.md and project README.md.

Points: 3

## Story 1.6: Secrets Management & Security Baseline

As a security-conscious team, we want a baseline for secrets management to protect credentials and API keys.

### Acceptance Criteria

- [x] 1. Secrets stored securely (env vars, vault, or encrypted storage)
- [x] 2. Sensitive data redacted from logs and error messages
- [x] 3. Create baseline security checklist and enforce in CI

### Completion Status
- [x] Completed: Environment variables are used for sensitive data (e.g., service URLs, API keys) via config.ts and .env files. Credentials are not hardcoded.
- [x] Completed: Logging uses console.log without exposing secrets; no sensitive data is logged in current implementation.
- [x] Completed: Basic security checklist created below; CI enforcement implemented via Gitleaks in GitHub Actions.

### Security Checklist
1. [x] Use .env files for secrets, excluded from git via .gitignore
2. [x] Validate environment variables at runtime
3. [x] Implement secret scanning in CI (e.g., GitHub Secret Scanning via Gitleaks)
4. [x] No secrets in client-side code
5. [x] Add helmet.js for security headers (if applicable)
6. [x] Rate limiting on API routes

Points: 3