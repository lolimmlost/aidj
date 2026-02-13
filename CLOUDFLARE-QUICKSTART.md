# Cloudflare Pages - Quick Start Guide

Quick reference for deploying AIDJ to Cloudflare Pages with Zero Trust.

## Prerequisites

```bash
# Install Wrangler CLI globally
npm install -g wrangler

# Login to Cloudflare
wrangler login
```

## Quick Deploy

### Option 1: CLI Deployment (Fastest)

```bash
# 1. Build for Cloudflare
npm run build:cloudflare

# 2. Deploy
npm run deploy:production
```

### Option 2: GitHub Integration (Recommended)

1. Push code to GitHub
2. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) > Pages
3. Click "Create a project" > "Connect to Git"
4. Select your repository
5. Configure:
   - Build command: `npm run build:cloudflare`
   - Build output: `.output/public`
6. Add environment variables (see below)
7. Click "Save and Deploy"

## Required Environment Variables

### Set in Cloudflare Dashboard

Go to: Pages > Your Project > Settings > Environment Variables

**Secrets** (encrypted):
```
DATABASE_URL=postgresql://...
AUTH_SECRET=<run: openssl rand -base64 32>
NAVIDROME_USERNAME=admin
NAVIDROME_PASSWORD=yourpassword
LIDARR_API_KEY=yourapikey
```

**Public** (plain text):
```
VITE_BASE_URL=https://your-app.pages.dev
VITE_API_URL=https://your-app.pages.dev
VITE_NAVIDROME_URL=https://navidrome.example.com
VITE_OLLAMA_URL=https://ollama.example.com
VITE_OLLAMA_MODEL=llama2
VITE_LIDARR_URL=https://lidarr.example.com
NAVIDROME_URL=https://navidrome.example.com
OLLAMA_URL=https://ollama.example.com
LIDARR_URL=https://lidarr.example.com
```

## Enable Zero Trust Access

1. Go to [Zero Trust Dashboard](https://one.dash.cloudflare.com/)
2. Access > Applications > "Add an application"
3. Choose "Self-hosted"
4. Configure:
   - Name: `AIDJ Music Interface`
   - Domain: `your-app.pages.dev`
5. Create Policy:
   - Name: `AIDJ Users`
   - Action: `Allow`
   - Include: Add your email or email domain
6. Save and test

## GitHub Actions Setup

Add to GitHub repository secrets (Settings > Secrets > Actions):

```
CLOUDFLARE_API_TOKEN=<your-token>
CLOUDFLARE_ACCOUNT_ID=<your-account-id>
```

Get these from:
- API Token: Dashboard > Profile > API Tokens > Create Token
  - Template: "Edit Cloudflare Workers"
  - Add: "Cloudflare Pages - Edit"
- Account ID: Dashboard > Pages > (in sidebar or URL)

## Custom Domain

1. Pages > Your Project > Custom domains
2. Click "Set up a custom domain"
3. Enter: `aidj.yourdomain.com`
4. Cloudflare auto-configures DNS
5. Update `VITE_BASE_URL` and `VITE_API_URL`

## Troubleshooting

**Build fails?**
```bash
# Test locally first
npm run build:cloudflare
```

**Can't access site?**
- Check Zero Trust policies
- Verify you're logged in with correct email

**500 errors?**
- Check environment variables are set
- Verify DATABASE_URL is correct
- Check external services (Navidrome, Ollama) are accessible

## Useful Commands

```bash
# List deployments
wrangler pages deployment list

# View logs
wrangler pages deployment tail

# Rollback
wrangler pages deployment rollback <deployment-id>

# Set secret
wrangler pages secret put DATABASE_URL
```

## Links

- Full docs: See `DEPLOYMENT.md`
- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
- [Cloudflare Zero Trust Docs](https://developers.cloudflare.com/cloudflare-one/)
- [TanStack Start Hosting](https://tanstack.com/start/latest/docs/framework/react/hosting)
