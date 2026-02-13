/**
 * Playwright Script: Capture README Screenshots
 *
 * Generates high-quality screenshots of the AIDJ app for the README.
 * Run with: npx playwright test scripts/capture-readme-screenshots.ts --project=chromium-headed
 *
 * Or directly: npx tsx scripts/capture-readme-screenshots.ts
 */

import { chromium, type Page, type Browser } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3003';
const SCREENSHOT_DIR = path.join(process.cwd(), 'docs', 'screenshots');

// Test credentials - update these for your environment
const TEST_EMAIL = process.env.TEST_EMAIL || 'demo@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'demo123';

interface ScreenshotConfig {
  name: string;
  route: string;
  description: string;
  viewport?: { width: number; height: number };
  waitFor?: string;
  actions?: (page: Page) => Promise<void>;
  delay?: number;
}

const DESKTOP_VIEWPORT = { width: 1280, height: 800 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };

const screenshots: ScreenshotConfig[] = [
  // Auth screens
  {
    name: 'login',
    route: '/login',
    description: 'Login page',
    viewport: DESKTOP_VIEWPORT,
    waitFor: 'input[type="email"]',
  },

  // Dashboard
  {
    name: 'dashboard',
    route: '/dashboard',
    description: 'Main dashboard overview',
    viewport: DESKTOP_VIEWPORT,
    waitFor: '[data-testid="dashboard"], h1, .dashboard-content',
    delay: 1000,
  },
  {
    name: 'dashboard-analytics',
    route: '/dashboard/analytics',
    description: 'Listening analytics',
    viewport: DESKTOP_VIEWPORT,
    waitFor: '.recharts-wrapper, [data-testid="analytics"], h1',
    delay: 1500,
  },
  {
    name: 'dashboard-discover',
    route: '/dashboard/discover',
    description: 'Music discovery page',
    viewport: DESKTOP_VIEWPORT,
    waitFor: '[data-testid="discover"], h1',
    delay: 1000,
  },

  // Library
  {
    name: 'library-artists',
    route: '/library/artists',
    description: 'Artists grid view',
    viewport: DESKTOP_VIEWPORT,
    waitFor: '[data-testid="artists-grid"], .artist-card, img',
    delay: 1500,
  },
  {
    name: 'library-search',
    route: '/library/search',
    description: 'Library search',
    viewport: DESKTOP_VIEWPORT,
    waitFor: 'input[type="search"], input[placeholder*="Search"]',
    actions: async (page) => {
      const searchInput = page.locator('input[type="search"], input[placeholder*="Search"]').first();
      await searchInput.fill('rock');
      await page.waitForTimeout(1000);
    },
  },

  // Playlists
  {
    name: 'playlists',
    route: '/playlists',
    description: 'Playlists overview',
    viewport: DESKTOP_VIEWPORT,
    waitFor: '[data-testid="playlists"], h1',
    delay: 1000,
  },

  // DJ Features
  {
    name: 'dj-set-builder',
    route: '/dj/set-builder',
    description: 'DJ Set Builder',
    viewport: DESKTOP_VIEWPORT,
    waitFor: '[data-testid="set-builder"], h1',
    delay: 1000,
  },
  {
    name: 'dj-settings',
    route: '/dj/settings',
    description: 'DJ Settings (AI DJ configuration)',
    viewport: DESKTOP_VIEWPORT,
    waitFor: '[data-testid="dj-settings"], h1, form',
    delay: 500,
  },

  // Music Identity (Spotify Wrapped-like)
  {
    name: 'music-identity',
    route: '/music-identity',
    description: 'Music Identity - Your listening personality',
    viewport: DESKTOP_VIEWPORT,
    waitFor: '[data-testid="music-identity"], h1',
    delay: 1500,
  },

  // Settings
  {
    name: 'settings',
    route: '/settings',
    description: 'Settings overview',
    viewport: DESKTOP_VIEWPORT,
    waitFor: '[data-testid="settings"], h1, nav',
    delay: 500,
  },
  {
    name: 'settings-playback',
    route: '/settings/playback',
    description: 'Playback settings',
    viewport: DESKTOP_VIEWPORT,
    waitFor: 'form, [data-testid="playback-settings"]',
    delay: 500,
  },

  // Downloads
  {
    name: 'downloads-youtube',
    route: '/downloads/youtube',
    description: 'YouTube downloader',
    viewport: DESKTOP_VIEWPORT,
    waitFor: 'input, form, h1',
    delay: 500,
  },

  // Mobile views
  {
    name: 'mobile-dashboard',
    route: '/dashboard',
    description: 'Mobile dashboard view',
    viewport: MOBILE_VIEWPORT,
    waitFor: '[data-testid="dashboard"], h1',
    delay: 1000,
  },
  {
    name: 'mobile-library',
    route: '/library/artists',
    description: 'Mobile library view',
    viewport: MOBILE_VIEWPORT,
    waitFor: '[data-testid="artists-grid"], .artist-card, img',
    delay: 1000,
  },
  {
    name: 'mobile-player',
    route: '/library/artists',
    description: 'Mobile player view',
    viewport: MOBILE_VIEWPORT,
    waitFor: '.artist-card, img',
    delay: 500,
    actions: async (page) => {
      // Click first artist to show player
      const firstArtist = page.locator('.artist-card, [data-testid="artist-item"]').first();
      if (await firstArtist.isVisible()) {
        await firstArtist.click();
        await page.waitForTimeout(1000);
      }
    },
  },
];

async function ensureDirectoryExists(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Created directory: ${dir}`);
  }
}

async function login(page: Page): Promise<boolean> {
  try {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');

    // Check if already logged in (redirected to dashboard)
    if (page.url().includes('/dashboard')) {
      console.log('✅ Already logged in');
      return true;
    }

    // Fill login form
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');

    if (await emailInput.isVisible()) {
      await emailInput.fill(TEST_EMAIL);
      await passwordInput.fill(TEST_PASSWORD);
      await page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign In")').click();

      // Wait for redirect
      await page.waitForURL(/dashboard|library/, { timeout: 10000 }).catch(() => {});

      if (page.url().includes('/dashboard') || page.url().includes('/library')) {
        console.log('✅ Login successful');
        return true;
      }
    }

    console.log('⚠️ Login may have failed, continuing anyway...');
    return false;
  } catch (error) {
    console.log(`⚠️ Login error: ${error}`);
    return false;
  }
}

async function captureScreenshot(page: Page, config: ScreenshotConfig): Promise<string | null> {
  const { name, route, viewport, waitFor, actions, delay } = config;

  try {
    // Set viewport
    if (viewport) {
      await page.setViewportSize(viewport);
    }

    // Navigate
    console.log(`📸 Capturing: ${name} (${route})`);
    await page.goto(`${BASE_URL}${route}`);
    await page.waitForLoadState('networkidle');

    // Wait for specific element
    if (waitFor) {
      try {
        await page.waitForSelector(waitFor, { timeout: 5000 });
      } catch {
        console.log(`   ⚠️ Selector "${waitFor}" not found, continuing...`);
      }
    }

    // Execute custom actions
    if (actions) {
      await actions(page);
    }

    // Additional delay for animations/loading
    if (delay) {
      await page.waitForTimeout(delay);
    }

    // Capture screenshot
    const filename = `${name}.png`;
    const filepath = path.join(SCREENSHOT_DIR, filename);

    await page.screenshot({
      path: filepath,
      fullPage: false,
      animations: 'disabled',
    });

    console.log(`   ✅ Saved: ${filename}`);
    return filename;
  } catch (error) {
    console.error(`   ❌ Error capturing ${name}:`, error);
    return null;
  }
}

async function generateMarkdownGallery(captured: { name: string; description: string; file: string }[]) {
  const galleryPath = path.join(SCREENSHOT_DIR, 'GALLERY.md');

  const content = `# AIDJ Screenshots Gallery

> Auto-generated on ${new Date().toISOString().split('T')[0]}

## Desktop Views

${captured
  .filter((s) => !s.name.startsWith('mobile-'))
  .map((s) => `### ${s.description}\n![${s.description}](./${s.file})`)
  .join('\n\n')}

## Mobile Views

${captured
  .filter((s) => s.name.startsWith('mobile-'))
  .map((s) => `### ${s.description}\n![${s.description}](./${s.file})`)
  .join('\n\n')}

---

*Screenshots captured with Playwright*
`;

  fs.writeFileSync(galleryPath, content);
  console.log(`\n📝 Generated gallery: ${galleryPath}`);
}

async function main() {
  console.log('🎬 AIDJ README Screenshot Capture\n');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Output: ${SCREENSHOT_DIR}\n`);

  ensureDirectoryExists(SCREENSHOT_DIR);

  const browser: Browser = await chromium.launch({
    headless: process.env.HEADLESS !== 'false',
  });

  const context = await browser.newContext({
    viewport: DESKTOP_VIEWPORT,
    deviceScaleFactor: 2, // Retina quality
  });

  const page = await context.newPage();

  // Login first
  await login(page);

  // Capture all screenshots
  const captured: { name: string; description: string; file: string }[] = [];

  for (const config of screenshots) {
    const file = await captureScreenshot(page, config);
    if (file) {
      captured.push({
        name: config.name,
        description: config.description,
        file,
      });
    }
  }

  // Generate gallery markdown
  await generateMarkdownGallery(captured);

  await browser.close();

  console.log(`\n✨ Captured ${captured.length}/${screenshots.length} screenshots`);
  console.log('\n📋 Next steps:');
  console.log('   1. Review screenshots in docs/screenshots/');
  console.log('   2. Run: npx tsx scripts/update-readme-with-screenshots.ts');
  console.log('   3. Commit changes\n');
}

main().catch(console.error);
