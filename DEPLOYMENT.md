# Deployment Guide - Cloudflare Pages

This guide covers deploying AIDJ Music Interface to Cloudflare Pages with Zero Trust access control.

## Prerequisites

1. **Cloudflare Account**: Sign up at [cloudflare.com](https://cloudflare.com)
2. **Wrangler CLI**: Install globally
   ```bash
   npm install -g wrangler
   ```
3. **Authenticate Wrangler**:
   ```bash
   wrangler login
   ```

## Environment Variables Setup

### Required Secrets (Server-Side Only)

Set these in Cloudflare Dashboard: Pages > Your Project > Settings > Environment Variables

Mark these as **encrypted** (secrets):

```
DATABASE_URL=postgresql://user:password@host:5432/aidj
AUTH_SECRET=<generate with: openssl rand -base64 32>
NAVIDROME_USERNAME=admin
NAVIDROME_PASSWORD=<your-password>
LIDARR_API_KEY=<your-api-key>
```

### Required Public Variables (Client-Side Exposed)

Mark these as **plain text** (not encrypted):

```
VITE_BASE_URL=https://your-app.pages.dev
VITE_API_URL=https://your-app.pages.dev
VITE_NAVIDROME_URL=https://your-navidrome-instance.com
VITE_OLLAMA_URL=https://your-ollama-instance.com
VITE_OLLAMA_MODEL=llama2
VITE_LIDARR_URL=https://your-lidarr-instance.com
```

### Server-Side Service URLs

```
NAVIDROME_URL=https://your-navidrome-instance.com
OLLAMA_URL=https://your-ollama-instance.com
LIDARR_URL=https://your-lidarr-instance.com
```

## Deployment Methods

### Method 1: Manual Deployment via CLI

1. **Build for Cloudflare**:
   ```bash
   npm run build:cloudflare
   ```

2. **Deploy to Production**:
   ```bash
   npm run deploy:production
   ```

3. **Deploy to Preview**:
   ```bash
   npm run deploy:preview
   ```

### Method 2: GitHub Integration (Recommended)

1. **Connect Repository**:
   - Go to Cloudflare Dashboard > Pages
   - Click "Create a project"
   - Connect your GitHub repository
   - Select your AIDJ repository

2. **Configure Build Settings**:
   ```
   Build command: npm run build:cloudflare
   Build output directory: .output/public
   Root directory: /
   ```

3. **Environment Variables**:
   - Add all environment variables listed above
   - Set production variables for `main` branch
   - Set preview variables for other branches

4. **Deploy**:
   - Push to `main` branch for production deployment
   - Push to other branches for preview deployments

### Method 3: Automatic via GitHub Actions

The repository includes a GitHub Actions workflow that automatically deploys on push to `main`.

See `.github/workflows/deploy-cloudflare.yml` for configuration.

## Cloudflare Zero Trust Setup

### Enable Access Control

1. **Navigate to Zero Trust Dashboard**:
   - Cloudflare Dashboard > Zero Trust

2. **Create Access Application**:
   - Go to Access > Applications > Add an application
   - Choose "Self-hosted"

3. **Configure Application**:
   ```
   Application name: AIDJ Music Interface
   Session Duration: 24 hours
   Application domain: your-app.pages.dev
   ```

4. **Create Access Policy**:
   - Policy name: "AIDJ Users"
   - Action: Allow
   - Configure rules (examples):
     - Email: your-email@example.com
     - Email domain: example.com
     - Country: US
     - IP ranges: 192.168.1.0/24

5. **Additional Settings**:
   - Enable "Accept all available identity providers"
   - Configure identity providers (Google, GitHub, etc.)

### Testing Zero Trust Access

1. Visit your application URL
2. You'll be redirected to Cloudflare Access login
3. Authenticate with configured identity provider
4. Access is granted based on your policies

## Database Considerations

### PostgreSQL Options

1. **External PostgreSQL** (Recommended for production):
   - Use Neon, Supabase, or other managed PostgreSQL
   - Set `DATABASE_URL` in environment variables
   - Ensure database is accessible from Cloudflare IPs

2. **Cloudflare D1** (SQLite-based):
   - Create D1 database: `wrangler d1 create aidj-db`
   - Update `wrangler.toml` to bind D1 database
   - Migrate schemas to D1-compatible format

## Custom Domain Setup

1. **Add Custom Domain**:
   - Pages > Your Project > Custom domains
   - Click "Set up a custom domain"
   - Enter your domain (e.g., `aidj.yourdomain.com`)

2. **DNS Configuration**:
   - Cloudflare will automatically configure DNS
   - Wait for SSL certificate provisioning (usually < 15 minutes)

3. **Update Environment Variables**:
   ```
   VITE_BASE_URL=https://aidj.yourdomain.com
   VITE_API_URL=https://aidj.yourdomain.com
   ```

## Monitoring and Logs

### View Deployment Logs

```bash
wrangler pages deployment list
wrangler pages deployment tail
```

### Real-time Logs

- Cloudflare Dashboard > Pages > Your Project > Deployments
- Click on a deployment to view logs

### Analytics

- Enable Web Analytics in Cloudflare Dashboard
- View traffic and performance metrics

## Troubleshooting

### Build Failures

1. **Check build logs** in Cloudflare Dashboard
2. **Verify environment variables** are set correctly
3. **Test build locally**:
   ```bash
   npm run build:cloudflare
   ```

### Runtime Errors

1. **Check function logs** in Cloudflare Dashboard
2. **Verify external services** (Navidrome, Ollama, etc.) are accessible
3. **Check database connectivity**

### Zero Trust Issues

1. **Verify Access policies** are configured correctly
2. **Check identity provider** configuration
3. **Test with different users/emails**

## CI/CD with GitHub Actions

The included workflow (`.github/workflows/deploy-cloudflare.yml`) automatically:
- Builds the application for Cloudflare
- Deploys to Cloudflare Pages
- Runs on push to `main` branch

### Required GitHub Secrets

Add these in your GitHub repository: Settings > Secrets and variables > Actions

```
CLOUDFLARE_API_TOKEN=<your-api-token>
CLOUDFLARE_ACCOUNT_ID=<your-account-id>
```

**Get these values**:
- API Token: Cloudflare Dashboard > My Profile > API Tokens > Create Token
  - Use "Edit Cloudflare Workers" template
  - Add "Cloudflare Pages - Edit" permission
- Account ID: Cloudflare Dashboard > Pages > Account ID (in URL or sidebar)

## Rollback

### Via CLI

```bash
# List deployments
wrangler pages deployment list

# Rollback to specific deployment
wrangler pages deployment rollback <deployment-id>
```

### Via Dashboard

1. Go to Cloudflare Dashboard > Pages > Your Project
2. Click "View build" on a previous deployment
3. Click "Rollback to this deployment"

## Performance Optimization

### Caching Strategy

Cloudflare automatically caches static assets. Configure cache rules:
- Pages > Your Project > Caching

### Edge Locations

- Cloudflare serves from 300+ edge locations worldwide
- No additional configuration needed

## Security Best Practices

1. **Never commit `.env` file** to repository
2. **Use encrypted secrets** for sensitive data in Cloudflare
3. **Enable HTTPS only** (automatic with Cloudflare Pages)
4. **Configure Zero Trust** for access control
5. **Regular security audits** of dependencies

## Support

For issues specific to:
- **Cloudflare Pages**: [Cloudflare Docs](https://developers.cloudflare.com/pages/)
- **TanStack Start**: [TanStack Docs](https://tanstack.com/start)
- **AIDJ Application**: Check repository issues
