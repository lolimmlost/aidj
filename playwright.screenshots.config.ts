/**
 * Standalone Playwright config for ad-hoc screenshot runs against the deployed
 * site. Differs from the main config: testDir points at tests/screenshots,
 * no webServer (we hit a real URL), no retries (one-shot).
 */
import { defineConfig, devices } from '@playwright/test';

const BASE = process.env.SCREENSHOT_BASE_URL ?? 'https://aidj.appahouse.com';

export default defineConfig({
  testDir: './tests/screenshots',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: BASE,
    trace: 'retain-on-failure',
    screenshot: 'on',
    storageState: 'tests/.auth/juan.json',
  },
  projects: [
    {
      name: 'chromium-headless',
      use: { ...devices['Desktop Chrome'], headless: true },
    },
    {
      name: 'mobile',
      // Pixel 5 is chromium-based; iPhone 13 needs webkit which isn't
      // installed on this host. Same ~390px viewport for the layout check.
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'fullhd',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
    },
    {
      name: '4k',
      // True 4K is 3840x2160. Most browsers handle that fine; sanity-check
      // for content that gets stranded in whitespace at extreme widths.
      use: { ...devices['Desktop Chrome'], viewport: { width: 3840, height: 2160 } },
    },
  ],
});
