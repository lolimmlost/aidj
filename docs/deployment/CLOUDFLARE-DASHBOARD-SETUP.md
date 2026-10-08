# Cloudflare Pages Dashboard Setup Guide

Complete setup guide using only the Cloudflare web dashboard - no CLI installation needed.

## Step 1: Prepare Your Repository

Your repository is now ready for Cloudflare deployment with:
- ✅ `wrangler.toml` configuration
- ✅ Build script: `npm run build:cloudflare`
- ✅ GitHub Actions workflow (optional)

Push your code to GitHub if you haven't already.

## Step 2: Create Cloudflare Pages Project

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **Workers & Pages** (left sidebar)
3. Click **Create application** > **Pages** tab
4. Click **Connect to Git**
5. Authorize Cloudflare to access your GitHub account
6. Select your **aidj** repository
7. Click **Begin setup**

## Step 3: Configure Build Settings

On the setup page, configure:

```
Project name: aidj-music-interface
Production branch: main
Build command: npm run build:cloudflare
Build output directory: .output/public
Root directory: (leave blank)
```

Click **Save and Deploy** (but it will fail without environment variables - that's OK!)

## Step 4: Set Environment Variables

After the project is created:

1. Go to **Settings** tab
2. Click **Environment variables** in left menu
3. Add the following variables:

### Production Environment

Click **Add variable** for each:

**Encrypted Variables** (click "Encrypt" checkbox):
```
DATABASE_URL = postgresql://user:password@host:5432/aidj
AUTH_SECRET = <generate with: openssl rand -base64 32>
NAVIDROME_USERNAME = admin
NAVIDROME_PASSWORD = your_password
LIDARR_API_KEY = your_api_key
```

**Plain Text Variables** (don't encrypt):
```
VITE_BASE_URL = https://aidj-music-interface.pages.dev
VITE_API_URL = https://aidj-music-interface.pages.dev
VITE_NAVIDROME_URL = https://your-navidrome.example.com
VITE_OLLAMA_URL = https://your-ollama.example.com
VITE_OLLAMA_MODEL = llama2
VITE_LIDARR_URL = https://your-lidarr.example.com
NAVIDROME_URL = https://your-navidrome.example.com
OLLAMA_URL = https://your-ollama.example.com
LIDARR_URL = https://your-lidarr.example.com
```

**Important**: For production variables, select **Production** environment when adding each variable.

### Preview Environment (Optional)

Repeat the same variables but select **Preview** environment and use different URLs if needed for testing.

## Step 5: Trigger Deployment

After adding environment variables:

1. Go to **Deployments** tab
2. Click **Create deployment**
3. Select branch: **main**
4. Click **Save and deploy**

Or simply push a new commit to trigger automatic deployment.

## Step 6: Enable Zero Trust Access (Optional)

### Configure Access Application

1. Go to [Zero Trust Dashboard](https://one.dash.cloudflare.com/)
2. Click **Access** > **Applications** in left menu
3. Click **Add an application**
4. Select **Self-hosted**

### Application Settings

```
Application name: AIDJ Music Interface
Session Duration: 24 hours
Application domain: aidj-music-interface.pages.dev
Path: (leave blank for entire site)
```

Click **Next**

### Create Access Policy

```
Policy name: AIDJ Authorized Users
Action: Allow
```

**Include** rules (add at least one):
- Email: `your-email@example.com`
- Or Email domain is: `example.com`
- Or IP ranges: `192.168.1.0/24` (if applicable)

Click **Next** > **Add application**

### Configure Identity Provider

1. Still in Zero Trust Dashboard
2. Go to **Settings** > **Authentication**
3. Click **Add new** under Login methods
4. Choose an identity provider:
   - **One-time PIN** (easiest, email-based)
   - **Google** (popular)
   - **GitHub** (for developer access)
5. Follow the setup wizard for your chosen provider

## Step 7: Add Custom Domain (Optional)

1. In Cloudflare Pages project, go to **Custom domains** tab
2. Click **Set up a custom domain**
3. Enter your domain: `aidj.yourdomain.com`
4. Click **Continue**
5. Cloudflare will automatically configure DNS if the domain is on Cloudflare
6. Wait for SSL certificate provisioning (~15 minutes)

**After adding custom domain**, update environment variables:
```
VITE_BASE_URL = https://aidj.yourdomain.com
VITE_API_URL = https://aidj.yourdomain.com
```

And update your Zero Trust Application domain to the custom domain.

## Step 8: Verify Deployment

1. Wait for deployment to complete (check **Deployments** tab)
2. Click the deployment URL (e.g., `https://aidj-music-interface.pages.dev`)
3. If Zero Trust is enabled:
   - You'll be redirected to login page
   - Choose your identity provider
   - Authenticate
   - You'll be redirected back to the app
4. Verify the app loads correctly

## GitHub Actions Setup (Optional)

For automatic deployments on git push:

1. Go to your GitHub repository
2. Click **Settings** > **Secrets and variables** > **Actions**
3. Click **New repository secret** twice to add:

```
Secret name: CLOUDFLARE_API_TOKEN
Secret value: <get from step below>

Secret name: CLOUDFLARE_ACCOUNT_ID
Secret value: <get from step below>
```

### Get API Token:
1. Cloudflare Dashboard > Profile icon (top right) > **My Profile**
2. Click **API Tokens** in left menu
3. Click **Create Token**
4. Use template: **Edit Cloudflare Workers**
5. Add **Account** > **Cloudflare Pages** > **Edit** permission
6. Click **Continue to summary** > **Create Token**
7. Copy the token (you can only see it once!)

### Get Account ID:
- In Cloudflare Dashboard, look at the URL or sidebar when viewing Pages
- Format: `https://dash.cloudflare.com/<account-id>/pages`
- Or: Workers & Pages > right sidebar shows Account ID

Now every push to `main` branch will automatically deploy!

## Monitoring and Maintenance

### View Logs
- **Deployments** tab > Click any deployment
- View build logs and function logs
- Check for errors

### View Analytics
- **Analytics** tab shows:
  - Requests per day
  - Bandwidth usage
  - Top URLs
  - Geographic distribution

### Rollback Deployment
1. **Deployments** tab
2. Find a previous successful deployment
3. Click **•••** menu > **Rollback to this deployment**

## Troubleshooting

### Build Fails
1. Check build logs in **Deployments** tab
2. Verify `npm run build:cloudflare` works locally
3. Check environment variables are set

### Site Loads But Shows Errors
1. Check browser console for errors
2. Verify external services (Navidrome, Ollama, Lidarr) URLs are correct
3. Check DATABASE_URL is accessible from Cloudflare

### Can't Access Site (Zero Trust)
1. Verify you're using the correct email
2. Check Access policy includes your email/domain
3. Try incognito/private browsing mode
4. Clear cookies for the domain

### 500 Errors
1. Check function logs in deployment details
2. Verify DATABASE_URL is correct and accessible
3. Ensure AUTH_SECRET is set
4. Check external service URLs are reachable

## Next Steps

1. ✅ Deploy to production
2. ✅ Set up Zero Trust access control
3. ✅ Configure custom domain
4. ✅ Monitor analytics and logs
5. ⬜ Set up alerts for deployment failures
6. ⬜ Configure preview deployments for testing

## Support Links

- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
- [Zero Trust Docs](https://developers.cloudflare.com/cloudflare-one/)
- [Community Forum](https://community.cloudflare.com/)
