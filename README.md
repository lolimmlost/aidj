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

## Backlog Progress

- Story 1.1: Project Setup and Basic Structure — Completed
- Story 1.2: User Authentication System — Completed
- Story 1.3: Service Configuration Interface — Completed
- Story 1.4: Local Development Environment Setup — Completed
- Story 1.5: Navidrome Integration & Library UI — Completed
- Story 1.6: Audio Streaming & Player — In Progress
- Story 1.7: Dashboard Implementation — Completed
- Story 2.1: AI Recommendations with Ollama — Planned

## Contributing

Contributions are welcome. Please follow the project's conventions and add new tasks to the backlog as needed.
