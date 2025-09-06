# Environment Configuration

This document outlines the required environment variables for the Music Recommendation and Download Interface application.

## Required Environment Variables

### Database Configuration
```
DATABASE_URL=postgresql://user:password@localhost:5432/tanstarter
```

### Authentication Configuration
```
BETTER_AUTH_SECRET=your-super-secret-auth-secret
VITE_BASE_URL=http://localhost:3000
```

### External Service Configuration
```
# Ollama service URL
OLLAMA_URL=http://localhost:11434

# Navidrome service URL and credentials
NAVIDROME_URL=http://localhost:4533
NAVIDROME_USERNAME=your-username
NAVIDROME_PASSWORD=your-password

# Lidarr service URL and API key
LIDARR_URL=http://localhost:8686
LIDARR_API_KEY=your-lidarr-api-key
```

### OAuth Provider Configuration (Optional)
```
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

## Setup Instructions

1. Copy this file to `.env` in the project root:
   ```bash
   cp docs/environment-configuration.md .env
   ```

2. Update the values in `.env` with your actual configuration

3. Make sure to keep `.env` in your `.gitignore` to avoid committing sensitive information

## Docker Configuration

The database can be run using the provided docker-compose.yml file:
```bash
docker-compose up -d
```

This will start a PostgreSQL database with the following configuration:
- Username: user
- Password: password
- Database: tanstarter
- Port: 5432