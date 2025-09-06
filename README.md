# Music Recommendation and Download Interface

A web-based interface for talking to a local Ollama instance to recommend songs in Navidrome hosted on LAN, and also be able to download songs requested from Lidarr hosted on LAN.

- [React 19](https://react.dev) + [React Compiler](https://react.dev/learn/react-compiler)
- TanStack [Start](https://tanstack.com/start/latest) + [Router](https://tanstack.com/router/latest) + [Query](https://tanstack.com/query/latest)
- [Tailwind CSS v4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)
- [Drizzle ORM](https://orm.drizzle.team/) + PostgreSQL
- [Better Auth](https://www.better-auth.com/)

## Project Overview

This application provides a unified interface for music discovery, streaming, and downloading using local self-hosted services:
- Ollama for AI-powered music recommendations
- Navidrome for music streaming
- Lidarr for music downloads

All services run on your local network, ensuring your music data stays private.

## Getting Started

We use **pnpm** by default, but you can modify the scripts in [package.json](./package.json) to use your preferred package manager.

1. Clone this repository:

   ```bash
   git clone <repository-url>
   cd music-recommendation-interface
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Create a `.env` file based on the environment variables documented in [environment-configuration.md](./docs/environment-configuration.md).

4. Push the schema to your database with drizzle-kit:

   ```bash
   pnpm db push
   ```

   https://orm.drizzle.team/docs/migrations

5. Run the development server:

   ```bash
   pnpm dev
   ```

   The development server should now be running at [http://localhost:3000](http://localhost:3000).

## Configuration

Before running the application, you'll need to configure the following services in your `.env` file:

1. Ollama service URL
2. Navidrome service URL and credentials
3. Lidarr service URL and API key

## Project Structure

```
src/
├── components/           # Shared UI components
├── lib/                  # Library functions and utilities
│   ├── auth/             # Authentication setup
│   └── db/               # Database configuration
├── routes/               # File-based routes
│   ├── (auth)/           # Authentication routes
│   ├── dashboard/        # Dashboard routes
│   └── api/              # API routes
└── styles/               # Global styles
```

## Features

- User authentication with Better Auth
- Music recommendations powered by Ollama
- Music streaming through Navidrome integration
- Music downloads through Lidarr integration
- Responsive design for desktop and mobile
- Dark mode support

## License

Code in this template is public domain via [Unlicense](./LICENSE).
