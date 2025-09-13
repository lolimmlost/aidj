# AIDJ Environment Configuration

This document outlines the required environment variables for AIDJ. Focus on current requirements: database and Navidrome. Planned: Ollama.

## Required Environment Variables

### Database Configuration
```
DATABASE_URL=postgresql://user:password@localhost:5432/aidj
```

### Authentication Configuration
```
BETTER_AUTH_SECRET=your-super-secret-auth-secret
```

### Navidrome Configuration (Required)
```
NAVIDROME_URL=http://localhost:4533
NAVIDROME_USERNAME=admin
NAVIDROME_PASSWORD=your-password
```

### Ollama Configuration (Planned)
```
OLLAMA_URL=http://localhost:11434
```

### OAuth Providers (Optional - for Better Auth)
```
# GitHub
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Google
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

## Setup Instructions

1. Create `.env` in project root from example:
   ```bash
   # Use .env.example as template
   cp .env.example .env
   ```

2. Edit `.env` with your PostgreSQL connection and Navidrome details

3. Add `.env` to `.gitignore` (already configured)

4. Run `npm run db:push` to apply schema

## Docker Setup (Optional)

Use compose.yml for PostgreSQL:

```bash
docker compose up -d postgres
```

Defaults:
- User: postgres
- Password: password
- DB: aidj
- Port: 5432

Update DATABASE_URL accordingly.