# AIDJ - AI-Assisted Music Library & Dashboard

AIDJ (AI-assisted DJ) is a modern web application for managing and exploring your self-hosted music library. It provides a dashboard for configuration, user authentication, and a searchable music library integrated with Navidrome for streaming. AI-powered recommendations via Ollama are planned for future enhancements. All services run locally for privacy.

- [React 19](https://react.dev) + [React Compiler](https://react.dev/learn/react-compiler)
- TanStack [Start](https://tanstack.com/start/latest) + [Router](https://tanstack.com/router/latest) + [Query](https://tanstack.com/query/latest)
- [Tailwind CSS v4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)
- [Drizzle ORM](https://orm.drizzle.team/) + PostgreSQL
- [Better Auth](https://www.better-auth.com/)

## Project Overview

This application provides a unified interface for music management using local self-hosted services:
- Navidrome for music library browsing and streaming
- Planned: Ollama for AI-powered music recommendations

All services run on your local network, ensuring your music data stays private.

## Getting Started

We use **npm** by default.

1. Clone this repository:

   ```bash
   git clone <repository-url>
   cd aidj
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file based on the environment variables documented in [environment-configuration.md](./docs/environment-configuration.md).

4. Push the schema to your database with drizzle-kit:

   ```bash
   npm run db:push
   ```

   https://orm.drizzle.team/docs/migrations

5. Run the development server:

   ```bash
   npm run dev
   ```

The development server should now be running at [http://localhost:3000](http://localhost:3000).

## CI/CD Pipeline

This project includes automated CI/CD workflows using GitHub Actions that run on every push to `main` and pull requests. The pipeline ensures code quality through:

### What the Pipeline Does
- **Linting**: Runs ESLint to enforce code standards
- **Building**: Compiles the project with Vite
- **Testing**: Executes unit tests with Vitest, requiring >80% code coverage
- **Security Scanning**: Uses Trivy for vulnerability detection and Gitleaks for secret scanning
- **Coverage Reporting**: Uploads results to Codecov for detailed analysis

### Viewing Pipeline Results
- **Actions Tab**: View build and test results in the GitHub "Actions" tab
- **Security Tab**: Review vulnerability and secret scan alerts
- **Coverage**: Access detailed reports at [codecov.io](https://codecov.io) (requires `CODECOV_TOKEN` secret setup)

### Required Repository Secrets
For full CI/CD functionality, add these secrets in GitHub Settings > Secrets and variables > Actions:
- `CODECOV_TOKEN`: For coverage report uploads (get from Codecov dashboard)

### Local Workflow Replication
Run these commands locally to match the CI environment:
```bash
pnpm install
pnpm lint
pnpm test:coverage  # Requires >80% coverage
pnpm build
pnpm check-types
```

For detailed workflow configuration, see [.github/workflows/README.md](.github/workflows/README.md).

## Configuration

Before running the application, you'll need to configure the following services in your `.env` file:

1. Navidrome service URL and credentials
2. Database connection (PostgreSQL)
3. Planned: Ollama service URL for AI features

## Project Structure

```
src/
├── components/           # Shared UI components (using shadcn/ui)
├── lib/                  # Core utilities and services
│   ├── auth/             # Better Auth implementation
│   ├── db/               # Drizzle ORM setup and schema
│   ├── config/           # App configuration
│   ├── services/         # External service integrations (e.g., Navidrome)
│   └── stores/           # State management (e.g., audio player)
├── routes/               # TanStack Router file-based routes
│   ├── (auth)/           # Login/Signup routes
│   ├── api/              # API endpoints (auth, Navidrome proxy/streaming)
│   ├── dashboard/        # Main dashboard
│   ├── config/           # Configuration page
│   └── library/          # Music library (artists, search, albums)
└── styles.css            # Global Tailwind CSS
```

## Features

- User authentication with Better Auth (login/signup)
- Music library browsing: artists, albums, search via Navidrome
- Audio streaming with custom player
- Dashboard for app overview
- Configuration interface for services
- Responsive UI with dark mode support (shadcn/ui + Tailwind)
- Planned: AI music recommendations via Ollama

## License

Code in this template is public domain via [Unlicense](./LICENSE).

## Development Workflow

### Pre-commit Checks
The project uses ESLint and Prettier for consistent code style. Consider using a pre-commit hook or run these before pushing:
```bash
pnpm lint:fix
pnpm format
pnpm test
```

### Testing
Unit tests are written with Vitest and React Testing Library. Run tests with:
```bash
pnpm test          # Run tests in watch mode
pnpm test:coverage # Run with coverage reporting
pnpm test:ui       # Run with Vitest UI
```

Add new tests in `src/components/__tests__/` or alongside components. Coverage reports are generated in the `coverage/` directory.

## Backlog Progress

- Story 1.1: Project Setup and Basic Structure — Completed
- Story 1.2: User Authentication System — Completed
- Story 1.3: Service Configuration Interface — Completed
- Story 1.4: Local Development Environment Setup — Completed
- Story 1.5: Basic CI/CD Pipeline — Completed
- Story 1.6: Secrets Management & Security Baseline — Completed
- Epic 2: Music Library Integration — Completed (Navidrome API, Library UI, Audio Streaming & Player, Dashboard)
- Story 2.1: AI Recommendations with Ollama — Planned

## Contributing

Contributions are welcome. Please follow the project's conventions and add new tasks to the backlog as needed.
